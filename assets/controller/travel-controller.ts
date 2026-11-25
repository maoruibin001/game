import { add, angleLerp, cameraRay, clamp, distance, forwardFor, framedPhotoCamera, lerp, normalize, safeCameraPosition, scale, solveCameraClearance, subtract, terrainOrbitLift } from './geometry.ts';
import { DEFAULT_PHOTOGRAPHY, clampZoom, photographyFov, type PhotographySettings } from '../shared/photography-contract.ts';
import { createPortraitCandidates, inspectPortrait, PORTRAIT_HINT, type PortraitCandidatePose } from './portrait-camera.ts';
import { EMPTY_INPUT, type CameraPose, type ControllerOptions, type InputFrame, type PhotographyStatus, type TravelAction, type TravelMode, type TravelStatus, type Vec3, type WalkingCameraState, type ZiplineRoute } from './types.ts';
export { cameraRay, projectAnchor, projectPoint } from './geometry.ts';
export type * from './types.ts';
const GRAVITY=19,JUMP_HEIGHT=1.1,COLLISION_SKIN=.015,GROUND_STEP_HEIGHT=1.02;
const SKY_LOOK_MIN_PITCH=-1.08;
const WALK_ORBIT_MIN_PITCH=-.24;
const WALK_TURN_RATE=20;
const angleDelta=(from:number,to:number)=>Math.atan2(Math.sin(to-from),Math.cos(to-from));

export function createTravelController(options:ControllerOptions) {
  const ground=options.terrainHeight;
  const portraitTrace=options.portraitTraceSegment??options.traceSegment;
  let position:Vec3=[options.spawn[0],ground(options.spawn[0],options.spawn[2]),options.spawn[2]];
  let yaw=options.initialYaw??Math.PI,pitch=options.initialPitch??.18,facingYaw=yaw;
  const bodyRadius=options.radius??.28,bodyHeight=options.height??1.86,sweepRadius=Math.max(.01,bodyRadius-.01);
  let mode:TravelMode='walk',paused=false,releaseGate=false, grounded=true,running=false,verticalVelocity=0,speed=0,distanceWalked=0,stepPhase=0;
  let walkBasis=facingYaw,walkMoving=false,travelHeading=facingYaw,motionSpeed=0;
  function resetWalkMotion() {walkMoving=false;motionSpeed=0;}
  let input:InputFrame={...EMPTY_INPUT},previous:InputFrame={...EMPTY_INPUT};
  let aspect=options.aspect??16/9,photoZoom=options.photoFovRadians??Math.PI/3;
  let bufferSize:CameraPose['bufferSize'],queuedProjection:Pick<CameraPose,'aspect'|'bufferSize'>|undefined;
  let photography:PhotographySettings={...DEFAULT_PHOTOGRAPHY},queuedPhotography:PhotographySettings|undefined;
  let portraitCandidates:PortraitCandidatePose[]=[],portraitPosition:Vec3|undefined,portraitHeading=yaw,portraitBaseYaw=yaw,portraitBasePitch=pitch,posePhase=0;
  let photoState:PhotographyStatus={settings:{...photography},candidates:[],selectedViewpoint:0,availableViewpoints:[],candidateAvailable:true,candidateStatus:'手持取景时可以慢慢走动。',subjectVisible:false};
  let abilities = {run:true, jump:true};
  let sensitivity=1,invertY=false,reducedMotion=false;
  let focus:Vec3=add(position,[0,1.38,0]),camera:CameraPose={position:add(focus,scale(forwardFor(yaw,pitch),-6.5)),forward:forwardFor(yaw,pitch),up:[0,1,0],verticalFovRadians:options.verticalFovRadians??Math.PI/3,aspect};
  let zipline:{route:ZiplineRoute;points:Vec3[];lengths:number[];total:number;travelled:number;lookHold:number}|undefined;
  let orbitDistance=options.cameraDistance??6.5,clearOrbitDistance=orbitDistance,orbitLift=0;
  let walkingCamera:WalkingCameraState|undefined;
  let photoRaise:{from:CameraPose;duration:number;elapsed:number}|undefined;
  let shutterCooldown=0,cameraNeedsSnap=false,walkAvatarHidden=false;
  const snapshot=():TravelStatus=>({position:[...position],yaw,pitch,facingYaw,mode,paused,grounded:grounded&&mode!=='zipline',running,verticalVelocity,speed,distanceWalked,stepPhase,posePhase,ziplineProgress:zipline?zipline.travelled/zipline.total:0,camera:{...camera,position:[...camera.position],forward:[...camera.forward],up:[...camera.up]},...(photoRaise?{photoRaising:true as const}:{}),...(walkingCamera?{walkingCamera}:{}),avatarVisible:mode==='photo'?photography.mode==='portrait':!walkAvatarHidden,photography:{...photoState,settings:{...photoState.settings},candidates:photoState.candidates.map(p=>({...p,position:[...p.position]})),availableViewpoints:[...photoState.availableViewpoints]}});
  const emit=(type:TravelAction)=>options.onAction?.({type,state:snapshot()});
  function setPaused(value:boolean) {
    if(paused===value)return;paused=value;input={...EMPTY_INPUT};previous={...EMPTY_INPUT};releaseGate=true;resetWalkMotion();
    // A modal/capture ends the current press sequence. Do not carry its short
    // debounce across a long pause and reject a new shutter after returning.
    // releaseGate still requires held menu/game inputs to be released first.
    if(value)shutterCooldown=0;
    // Keep the last rendered gait/pose as well as the lens during capture. No idle reset.
    if(!value){speed=0;running=false;if(queuedProjection){({aspect,bufferSize}=queuedProjection);queuedProjection=undefined;}if(queuedPhotography){const pending=queuedPhotography;queuedPhotography=undefined;configurePhotography(pending);}if(cameraNeedsSnap)updateCamera(0,true);}
  }
  function exitPhoto() { if(mode!=='photo')return;resetWalkMotion();facingYaw=photography.mode==='portrait'?facingYaw:yaw;if(photography.mode==='portrait')yaw=facingYaw;mode='walk';clearOrbitDistance=orbitDistance;orbitLift=0;photoRaise=undefined;portraitCandidates=[];portraitPosition=undefined;input={...EMPTY_INPUT};speed=0;running=false;emit('camera-exit'); }
  function rebuildPortrait() {
    const stage=photography.lens==='wide'?options.portraitStage?.(position):undefined;
    portraitCandidates=createPortraitCandidates(position,portraitHeading,photography.lens,aspect,ground,portraitTrace,options.alternatePortraitAngles?.(position),stage);
    const selected=portraitCandidates[photography.viewpoint]!;
    // Invalid choices never place the actual camera inside their obstruction.
    portraitPosition=selected.placementValid?selected.pose.position:safeCameraPosition(add(position,[0,1.38,0]),selected.pose.position,ground,portraitTrace);
    const direction=selected.placementValid?selected.pose.forward:normalize(subtract(add(position,[0,1.02,0]),portraitPosition));
    yaw=portraitBaseYaw=Math.atan2(direction[0],-direction[2]);pitch=portraitBasePitch=Math.atan2(-direction[1],Math.hypot(direction[0],direction[2]));
    facingYaw=Math.atan2(portraitPosition[0]-position[0],-(portraitPosition[2]-position[2]));
  }
  function configurePhotography(value:PhotographySettings) {
    const next:PhotographySettings={mode:value.mode==='portrait'?'portrait':'landscape',lens:value.lens==='standard'||value.lens==='detail'||value.lens==='tele'?value.lens:'wide',pose:value.pose==='wave'||value.pose==='letter'?value.pose:'look',viewpoint:clamp(Math.round(Number.isFinite(value.viewpoint)?value.viewpoint:0),0,2),exposure:clamp(Number.isFinite(value.exposure)?value.exposure:0,-1,1),timerSeconds:value.timerSeconds===3?3:0};
    if(value.framing==='wide'||value.framing==='full')next.framing=value.framing;
    if(typeof value.zoom==='number'&&Number.isFinite(value.zoom))next.zoom=clampZoom(value.zoom);
    if(paused){queuedPhotography=next;return;}
    if(next.zoom===photography.zoom&&next.framing===photography.framing
      &&(Object.keys(next) as (keyof PhotographySettings)[]).every(key=>next[key]===photography[key]))return;
    const changed=next.mode!==photography.mode||next.lens!==photography.lens||next.viewpoint!==photography.viewpoint;
    const entering=next.mode==='portrait'&&photography.mode!=='portrait';
    const leaving=next.mode==='landscape'&&photography.mode==='portrait';
    if(next.pose!==photography.pose)posePhase=0;
    photography=next;photoZoom=photographyFov(next);if(entering)photoRaise=undefined;
    if(mode==='photo'&&next.mode==='portrait'&&changed){portraitHeading=entering?yaw:portraitHeading+Math.atan2(Math.sin(yaw-portraitBaseYaw),Math.cos(yaw-portraitBaseYaw));rebuildPortrait();}
    else if(next.mode==='landscape'){if(mode==='photo'&&leaving)yaw=facingYaw;portraitCandidates=[];portraitPosition=undefined;}
    updateCamera(0,true);
  }
  function toggleCamera() {
    if(paused||mode==='zipline')return;
    if(mode==='photo')exitPhoto();
    else {
      const duration=options.walkingCameraFrame?.(position)?.raiseSeconds;
      if(duration&&photography.mode==='landscape'&&!reducedMotion)photoRaise={from:camera,duration,elapsed:0};
      mode='photo';resetWalkMotion();speed=0;running=false;input={...EMPTY_INPUT};posePhase=0;
      if(photography.mode==='portrait'){portraitHeading=yaw;rebuildPortrait();}
      updateCamera(0,true);emit('camera-enter');
    }
    updateCamera(0,true);
  }
  function shutter() { if(paused||mode!=='photo'||shutterCooldown>0)return false;shutterCooldown=.32;emit('shutter');return true; }
  function action(type:'camera'|'shutter'|'interact'|'pause'|'map'|'journal') {
    if(type==='pause') {if(mode==='photo'&&!paused){exitPhoto();updateCamera(0,true);}else emit('pause');return;}
    if(paused)return;
    if(type==='camera')toggleCamera();else if(type==='shutter')shutter();else if(type==='interact'){if(mode==='walk')emit('interact');}else emit(type);
  }
  function submitInput(frame:InputFrame) {
    const safe:InputFrame={...frame,horizontal:clamp(frame.horizontal||0,-1,1),vertical:clamp(frame.vertical||0,-1,1),turn:clamp(frame.turn||0,-1,1),lookX:Number.isFinite(frame.lookX)?frame.lookX:0,lookY:Number.isFinite(frame.lookY)?frame.lookY:0};
    const held=!!(safe.horizontal||safe.vertical||safe.turn||safe.run||safe.jump||safe.camera||safe.shutter||safe.interact||safe.pause||safe.map||safe.journal||safe.lookActive);
    if(paused||releaseGate) {input={...EMPTY_INPUT};previous={...safe};if(!paused&&!held)releaseGate=false;return;}
    const prior=previous,modeAtPress=mode;
    const pressed=(key:'camera'|'shutter'|'jump'|'interact'|'pause'|'map'|'journal')=>safe[key]&&!prior[key];
    previous={...safe};input=safe;
    if(pressed('pause'))action('pause');
    else if(pressed('map'))action('map');
    else if(pressed('journal'))action('journal');
    else if(pressed('camera'))toggleCamera();
    else if(pressed('interact'))action('interact');
    if(paused)return;
    // Space is one physical edge. Switching mode while it is held cannot turn
    // an old jump into a shutter press (or an old shutter into a jump).
    const spacePressed=pressed('jump')&&mode===modeAtPress;
    if(spacePressed&&mode==='walk'&&grounded&&abilities.jump){grounded=false;verticalVelocity=Math.sqrt(2*GRAVITY*JUMP_HEIGHT);}
    if(safe.lookActive) {
      const portrait=mode==='photo'&&photography.mode==='portrait',lookScale=portrait?.65:1;
      const turn=safe.lookX*.0022*sensitivity*lookScale;
      yaw+=turn;
      // A button transition has no steering meaning. Only actual right-drag
      // or keyboard turning can change the walking reference.
      if(mode==='walk'&&!safe.orbitOnly) {
        if(walkMoving&&safe.steerCharacter)walkBasis+=turn;
        else facingYaw+=turn;
      }
      const minPitch=portrait?-.95:mode==='zipline'?-.12:SKY_LOOK_MIN_PITCH;
      pitch=clamp(pitch+safe.lookY*.0022*sensitivity*lookScale*(invertY?-1:1),minPitch,mode==='photo'?1.0:1.10);
      if(portrait){yaw=clamp(yaw,portraitBaseYaw-.45,portraitBaseYaw+.45);pitch=clamp(pitch,portraitBasePitch-.28,portraitBasePitch+.28);}
      // Looking changes only the view. The traveller still follows the fixed cable.
      if(zipline)zipline.lookHold=1.25;
    }
    // Update pose before the event so rules judge exactly the current view.
    updateCamera(0,mode==='photo');
    if(pressed('shutter')||(spacePressed&&mode==='photo'))shutter();
  }
  function supportBelow(p:Vec3,drop=.6):number {
    const floor=ground(p[0],p[2]);
    if(!options.traceSegment||p[1]<floor)return floor;
    const start:Vec3=[p[0],p[1]+sweepRadius+COLLISION_SKIN*2,p[2]];
    const end:Vec3=[p[0],Math.max(floor,p[1]-drop)+sweepRadius,p[2]];
    const hit=options.traceSegment(start,end,sweepRadius);
    const surface=hit.point[1]-sweepRadius+COLLISION_SKIN;
    // The lower sphere can only support the feet, never attach them to a wall
    // or the underside of an overhang above the current foot position.
    return hit.hit&&surface<=p[1]+COLLISION_SKIN*2?Math.max(floor,surface):floor;
  }
  function upwardTravel(p:Vec3,rise:number):number {
    const head=add(p,[0,bodyHeight-sweepRadius,0]);
    const hit=options.traceSegment?.(head,add(head,[0,rise,0]),sweepRadius);
    return hit?.hit?Math.max(0,rise*hit.fraction-COLLISION_SKIN):rise;
  }
  function moveStep(dt:number,displacement:Vec3) {
    const from=position;
    position=options.resolveMove?options.resolveMove(position,displacement,bodyRadius,bodyHeight):add(position,displacement);
    let floor=grounded?supportBelow(position):ground(position[0],position[2]);
    // Walking may climb a small authored step. An airborne traveller must
    // already clear a ledge, rather than being snapped onto its top sideways.
    // Two 0.5m authored grass tiers are a walkable bank. Keep real walls and
    // headroom checks; airborne movement must still clear a ledge physically.
    if(floor-from[1]>(grounded?GROUND_STEP_HEIGHT:.001)){
      position=from;floor=grounded?supportBelow(from):ground(from[0],from[2]);
    }
    if(grounded&&from[1]-floor<=.6){
      const rise=Math.max(0,floor-from[1]);
      if(rise>0&&upwardTravel([position[0],from[1],position[2]],rise)<rise){position=from;return;}
      position=[position[0],floor,position[2]];verticalVelocity=0;return;
    }
    grounded=false;
    const dy=verticalVelocity*dt-.5*GRAVITY*dt*dt;
    verticalVelocity-=GRAVITY*dt;
    if(dy>0){
      const rise=upwardTravel([position[0],from[1],position[2]],dy);
      position=[position[0],from[1]+rise,position[2]];
      if(rise<dy)verticalVelocity=0;
    }else{
      let y=Math.max(floor,from[1]+dy);
      const feet:Vec3=[position[0],from[1]+sweepRadius+COLLISION_SKIN,position[2]];
      const hit=options.traceSegment?.(feet,[position[0],y+sweepRadius,position[2]],sweepRadius);
      if(hit?.hit){y=Math.max(y,hit.point[1]-sweepRadius+COLLISION_SKIN);grounded=true;}
      else grounded=y<=floor+.001;
      position=[position[0],y,position[2]];if(grounded)verticalVelocity=0;
    }
    if(!position.every(Number.isFinite)){position=from;verticalVelocity=0;}
  }
  function step(delta:number) {
    const dt=clamp(Number.isFinite(delta)?delta:0,0,.1);
    if(paused)return;
    shutterCooldown=Math.max(0,shutterCooldown-dt);
    if(mode==='zipline'&&zipline) {
      const ride=zipline;
      const mounting=ride.travelled<ride.lengths[0]!;
      const landing=ride.travelled>ride.total-ride.lengths.at(-1)!;
      const rideSpeed=mounting?Math.min(8,ride.route.speed??20):landing?Math.min(6,ride.route.speed??20):(ride.route.speed??20);
      ride.travelled=Math.min(ride.total,ride.travelled+dt*rideSpeed);
      let remaining=ride.travelled,segment=0;
      while(segment<ride.lengths.length-1&&remaining>ride.lengths[segment]!)remaining-=ride.lengths[segment++]!;
      const t=clamp(remaining/Math.max(.001,ride.lengths[segment]!),0,1);
      const p=lerp(ride.points[segment]!,ride.points[segment+1]!,t),progress=ride.travelled/ride.total;
      position=[p[0],p[1]-(ride.route.sag??2)*Math.sin(Math.PI*progress),p[2]];
      const tangent=subtract(ride.points[segment+1]!,ride.points[segment]!);if(Math.hypot(tangent[0],tangent[2])>.001)facingYaw=Math.atan2(tangent[0],-tangent[2]);
      if(ride.lookHold>0)ride.lookHold=Math.max(0,ride.lookHold-dt);
      else{const follow=1-Math.exp(-3*dt);yaw=angleLerp(yaw,facingYaw,follow);pitch+=(.14-pitch)*follow;}
      speed=rideSpeed;running=false;
      if(ride.travelled>=ride.total){position=[ride.route.end[0],ground(ride.route.end[0],ride.route.end[2]),ride.route.end[2]];mode='walk';zipline=undefined;grounded=true;verticalVelocity=0;speed=0;input={...EMPTY_INPUT};releaseGate=true;emit('zipline-land');}
      return;
    }
    if(mode==='photo')posePhase+=dt;
    if(input.turn){
      const portrait=mode==='photo'&&photography.mode==='portrait';
      const turnRate=(mode==='photo'?1.35:2.15)*clamp(sensitivity,.4,2.5);
      const deltaYaw=input.turn*turnRate*dt;
      yaw+=deltaYaw;
      if(mode==='walk') {
        if(walkMoving&&input.steerCharacter)walkBasis+=deltaYaw;
        else facingYaw+=deltaYaw;
      }
      if(portrait)yaw=clamp(yaw,portraitBaseYaw-.45,portraitBaseYaw+.45);
    }
    const magnitude=Math.hypot(input.horizontal,input.vertical);
    const active=magnitude>.001,strength=Math.min(1,magnitude);
    const turnAngle=Math.atan2(input.horizontal,input.vertical);
    const wantsRun=mode==='walk'&&input.run&&abilities.run;
    const walkSpeed=options.walkSpeed??6.8,runSpeed=options.runSpeed??11;
    let x=0,z=0,requestedSpeed=0;
    if(mode==='walk'){
      if(active){
        // Hold the traveller's starting frame through a continuous key chord.
        // Changing the camera or feeding the animated facing back into A/D
        // would make a held key drift or circle indefinitely.
        if(!walkMoving)walkBasis=facingYaw;
        const intended=(input.steerCharacter?walkBasis:facingYaw)+turnAngle;
        if(input.steerCharacter) {
          const error=angleDelta(facingYaw,intended);
          facingYaw+=clamp(error,-WALK_TURN_RATE*dt,WALK_TURN_RATE*dt);
          travelHeading=facingYaw;
        }else travelHeading=intended;
        const alignment=input.steerCharacter?Math.max(.3,Math.cos(angleDelta(facingYaw,intended))):1;
        requestedSpeed=(wantsRun?runSpeed:walkSpeed)*alignment*strength;
      }
      walkMoving=active;
      if(grounded){
        const rate=requestedSpeed>motionSpeed?(wantsRun?runSpeed/.095:walkSpeed/.075):(motionSpeed>walkSpeed?runSpeed/.080:walkSpeed/.060);
        motionSpeed+=clamp(requestedSpeed-motionSpeed,-rate*dt,rate*dt);
      }else motionSpeed=requestedSpeed;
      x=Math.sin(travelHeading);z=-Math.cos(travelHeading);requestedSpeed=motionSpeed;
    }else if(active){
      // Handheld and portrait movement have no acceleration or trailing step.
      const heading=(photography.mode==='portrait'?facingYaw:yaw)+turnAngle;
      x=Math.sin(heading);z=-Math.cos(heading);requestedSpeed=(options.photoWalkSpeed??2.2)*strength;
    }
    const from=position;
    // Bound sweeps even if a host frame is slow. Normal 60 Hz input takes one
    // step, while a 100 ms frame cannot tunnel through a ledge or thin ceiling.
    const substeps=Math.max(1,Math.ceil(dt/(1/60))),subDt=dt/substeps;
    for(let i=0;i<substeps;i++)moveStep(subDt,[x*requestedSpeed*subDt,0,z*requestedSpeed*subDt]);
    const travelled=Math.hypot(position[0]-from[0],position[2]-from[2]);speed=dt>0?travelled/dt:0;distanceWalked+=travelled;stepPhase+=travelled*2.6;
    running=wantsRun&&active&&speed>.1;
    if(mode==='photo'&&photography.mode==='portrait'&&portraitPosition)facingYaw=angleLerp(facingYaw,Math.atan2(portraitPosition[0]-position[0],-(portraitPosition[2]-position[2])),1-Math.exp(-10*dt));
  }
  function updateCamera(delta:number,snap=false) {
    if(paused)return camera;
    snap=snap||cameraNeedsSnap;cameraNeedsSnap=false;
    const frame=mode==='walk'?options.walkingCameraFrame?.(position):undefined;
    const dt=clamp(delta,0,.1);
    const eyeHeight=mode==='photo'?(options.landscapeEyeHeight?.(position)??1.64):(frame?.height??1.38);
    const target=add(position,[0,eyeHeight,0]);
    walkingCamera=undefined;
    if(snap||mode==='photo')focus=target;
    else {
      const followed=reducedMotion?target:lerp(focus,target,1-Math.exp(-12*dt));
      // The step collider changes height discretely on individual treads.
      // Keep that vertical motion out of the visual anchor, even in reduced motion.
      const y=mode==='walk'
        ? clamp(focus[1]+(target[1]-focus[1])*(1-Math.exp(-(target[1]<focus[1]?8:11)*dt)),target[1]-.38,target[1]+.48)
        : followed[1];
      focus=[followed[0],y,followed[2]];
    }
    // Damping may cut across a wall corner or lag below a step, even though the
    // traveller itself followed a valid path. Trace from the current traveller.
    if(focus[1]<ground(focus[0],focus[2])+.3||options.traceSegment?.(target,focus,.025).hit)focus=target;
    const cameraPitch=pitch+(frame?.pitchOffset??0);
    const forward=forwardFor(yaw,cameraPitch);
    if(mode==='photo'){
      camera={position:photography.mode==='portrait'&&portraitPosition?portraitPosition:target,forward,up:[0,1,0],verticalFovRadians:photoZoom,aspect,bufferSize};
      if(photoRaise){
        photoRaise.elapsed+=dt;
        const progress=photoRaise.elapsed/photoRaise.duration;
        if(progress>=1||reducedMotion)photoRaise=undefined;
        else {
          const smooth=progress*progress*(3-2*progress);
          const from=photoRaise.from,eye=lerp(from.position,target,smooth);
          if(!options.traceSegment?.(target,eye,.05).hit){
            camera={...camera,position:eye,forward:normalize(lerp(from.forward,forward,smooth)),
              verticalFovRadians:from.verticalFovRadians+(photoZoom-from.verticalFovRadians)*smooth};
          }else photoRaise=undefined;
        }
      }
    } else {
      const desiredDistance=mode==='zipline'?8.4:(frame?.distance??options.cameraDistance??6.5);
      orbitDistance=snap||reducedMotion?desiredDistance:orbitDistance+(desiredDistance-orbitDistance)*(1-Math.exp(-8*dt));
      // Tilting into the sky should not put the rear camera underground or
      // force it into the traveller's back. Keep the collision-safe orbit
      // shallow and tilt the view itself beyond that angle.
      const skyward=mode==='walk'&&cameraPitch<WALK_ORBIT_MIN_PITCH;
      const orbit=skyward?forwardFor(yaw,WALK_ORBIT_MIN_PITCH):forward;
      const desired=add(focus,scale(orbit,-orbitDistance));
      let safe:Vec3;
      if(mode==='walk'){
        const clearance=.3;
        const needed=terrainOrbitLift(focus,desired,ground,clearance);
        // Rise with required ground clearance. Release more slowly so the
        // camera doesn't drop into the next tread immediately after clearing one.
        orbitLift=snap?needed:Math.max(needed,orbitLift*Math.exp(-7*dt));
        const solution=solveCameraClearance(focus,add(desired,[0,orbitLift,0]),ground,options.traceSegment,clearance,camera.position);
        const available=distance(solution.origin,solution.position);
        const clipped=distance(solution.position,add(desired,[0,orbitLift,0]))>.03;
        const wasClipped=clearOrbitDistance>0 && clearOrbitDistance<orbitDistance-.06;
        clearOrbitDistance=snap||(!clipped&&!wasClipped)?available:Math.min(available,clearOrbitDistance+5*dt);
        safe=available>1e-6?lerp(solution.origin,solution.position,clearOrbitDistance/available):solution.position;
        walkingCamera={focus,intentPitch:cameraPitch,orbitDistance,safeDistance:clearOrbitDistance,lift:orbitLift};
      }else {
        clearOrbitDistance=orbitDistance;orbitLift=0;
        safe=safeCameraPosition(focus,desired,ground,options.traceSegment,.3,camera.position);
      }
      const bodyDistance=distance(safe,add(position,[0,1.38,0]));
      // A compressed orbit behaves like a first-person view. Besides hiding
      // the hat/backpack, retain the player's look direction if the recovered
      // anchor falls just in front of the focus. Do not reverse the view.
      // The hat/backpack already dominate a 60-degree view at 1–1.5m. Hide
      // before that distance, with hysteresis so a bank edge cannot flicker it.
      walkAvatarHidden=bodyDistance<(walkAvatarHidden?2.2:1.8);
      camera={position:safe,forward:skyward||walkAvatarHidden||distance(focus,safe)<.01?forward:normalize(subtract(focus,safe)),up:[0,1,0],verticalFovRadians:options.verticalFovRadians??Math.PI/3,aspect,bufferSize};
    }
    if(mode==='photo'&&photography.mode==='portrait'){
      const inspect=(pose:CameraPose)=>inspectPortrait(framedPhotoCamera(pose,photography.framing),position,ground,portraitTrace);
      const candidates=portraitCandidates.map(c=>{const inspected=inspect(c.index===photography.viewpoint?camera:{...c.pose,aspect,bufferSize,verticalFovRadians:photoZoom});return {index:c.index,position:c.pose.position,available:c.placementValid&&inspected.available,reason:c.placementValid?inspected.reason:'camera-blocked' as const};});
      const selected=candidates[photography.viewpoint],inspection=inspect(camera);
      photoState={settings:{...photography},candidates,selectedViewpoint:photography.viewpoint,availableViewpoints:candidates.filter(c=>c.available).map(c=>c.index),candidateAvailable:!!selected?.available,candidateStatus:PORTRAIT_HINT[selected?.reason??'camera-blocked'],subjectVisible:!!selected?.available&&inspection.subjectVisible};
    }else photoState={settings:{...photography},candidates:[],selectedViewpoint:photography.viewpoint,availableViewpoints:[],candidateAvailable:true,candidateStatus:'手持取景时可以慢慢走动。',subjectVisible:mode!=='photo'};
    return camera;
  }
  function startZipline(route:ZiplineRoute) {
    if(paused||mode!=='walk'||!grounded||Math.hypot(position[0]-route.start[0],position[2]-route.start[2])>(route.mountRadius??6)||Math.abs(position[1]-route.start[1])>8)return false;
    const landing:Vec3=[route.end[0],ground(route.end[0],route.end[2]),route.end[2]];
    const points=[position,route.start,...(route.points??[]),route.end,landing],lengths=points.slice(1).map((p,i)=>distance(p,points[i]!)),total=lengths.reduce((a,b)=>a+b,0);
    if(total<1||points.some(p=>!p.every(Number.isFinite)))return false;
    zipline={route,points,lengths,total,travelled:0,lookHold:0};resetWalkMotion();mode='zipline';grounded=false;verticalVelocity=0;input={...EMPTY_INPUT};speed=0;running=false;emit('zipline-start');return true;
  }
  function restore(p:Vec3,heading=yaw,tilt=pitch) {
    if(!p.every(Number.isFinite))throw new Error('Travel restore requires finite coordinates');
    resetWalkMotion();
    position=[p[0],(options.restoreGround??ground)(p[0],p[2]),p[2]];yaw=heading;pitch=tilt;facingYaw=heading;mode='walk';photoRaise=undefined;zipline=undefined;portraitPosition=undefined;portraitCandidates=[];grounded=true;verticalVelocity=0;input={...EMPTY_INPUT};previous={...EMPTY_INPUT};releaseGate=true;speed=0;running=false;cameraNeedsSnap=true;updateCamera(0,true);
  }
  updateCamera(0,true);
  const setAbilities = (next: Readonly<{run:boolean; jump:boolean}>) => { abilities = next; };
  return {setAbilities,snapshot,submitInput,step,updateCamera,setPaused,toggleCamera,shutter,action,startZipline,restore,configurePhotography,
    setAspect(value:number,size?:CameraPose['bufferSize']){if(Number.isFinite(value)&&value>0){if(paused){queuedProjection={aspect:value,bufferSize:size};return;}aspect=value;bufferSize=size;camera={...camera,aspect,bufferSize};}},
    setPhotoFov(value:number){if(paused)return;photoZoom=clamp(value,Math.PI/8,Math.PI/2);updateCamera(0,true);},
    setLookSettings(value:{sensitivity?:number;invertY?:boolean;reducedMotion?:boolean}){if(Number.isFinite(value.sensitivity))sensitivity=clamp(value.sensitivity!,.2,3);if(value.invertY!==undefined)invertY=value.invertY;if(value.reducedMotion!==undefined)reducedMotion=value.reducedMotion;},
    ray(x=.5,y=.5){return cameraRay(camera,x,y);}};
}
export type TravelController = ReturnType<typeof createTravelController>;
