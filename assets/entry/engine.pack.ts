import { definePack, definePackageId } from '@forgeax/engine/pack/source';
import { markLoadTimeline } from '@forgeax/engine/app';
import { AssetGuid } from '@forgeax/engine/pack/guid';
import { ok } from '@forgeax/engine/types';
import type { Plugin } from '@forgeax/engine/plugin';
import { Time, type EntityHandle } from '@forgeax/engine/ecs';
import { quat } from '@forgeax/engine/math';
import { Camera, DirectionalLight,  Fog, FogModeValue, PointLight, Skylight, TONEMAP_ACES_FILMIC, ANTIALIAS_FXAA, ANTIALIAS_SMAA, perspective } from '@forgeax/engine/render';
import { Transform, worldDespawnScene } from '@forgeax/engine/scene';
import { installTravelController, type AvatarJointName } from '../controller/forgeax-controller.ts';
import type { TravelController } from '../controller/travel-controller.ts';
import type { TravelActionEvent, TravelStatus, Vec3 } from '../controller/types.ts';
import { actionFromPresentation, canPlay, canSendLetter, cleanOriginalPhoto, cleanThumbnail, createJourney, reduceJourney, toPresentationView, weatherForecast, worldState, type JourneyAction, type JourneyEvent, type JourneyState, type PhotoObservation, type Pose } from '../journey/index.ts';
import { firstEnvelopeGuide } from '../journey/journey.ts';
import type { PresentationAction, PresentationViewModel } from '../presentation/types.ts';
import { WORLD, nearPlayableBoundary, resolveMove, rockGroundOnRestore, terrainHeight, traceSegment, travelerVisibleSurface, walkingSurfaceHeight } from '../shanye-world/world-layout.ts';
import { findRecoveryPoint, isSafeRoadPose, travelBlockers, traceTravelSegment } from '../shanye-world/road-safety.ts';
import { clearPlanterOnRestore, TOWN_BRIDGE_REST_ANGLE } from '../shanye-world/town-postcard-layout.ts';
import { WORLD_ENTITY_KEYS, WORLD_SCENE_GUID, resolveWorldEntity, worldGuidText } from '../shanye-world/world-refs.ts';
import { areaAt, poseFromController } from './engine-helper.ts';
import { installSixthScene } from './sixth-scene.ts';
import { inSixthRoom, SIXTH_PICTURE_BLOCKERS, sixthNearby, sixthPortraitStage } from '../shanye-world/sixth-layout.ts';
import { nearestFlowerStop } from '../shanye-world/flower-scenes.ts';
import { postalLookoutCamera, postalLookoutEyeHeight, POSTAL_LOOKOUT_PITCH } from '../shanye-world/postal-lookout.ts';
import { isFlowerKind } from '../journey/flower-catalog.ts';
import { appliedPhotoScene, nearestPhysicalInteraction, observeAppliedPhoto, validatedMailTarget, validatedRestTarget } from './journey-host.ts';
import { createInputDiagnostics, type ShutterSource } from './input-diagnostics.ts';
import { createPhotoDiagnosticsReader } from './photo-diagnostics.ts';
import { portraitCameraProp } from './portrait-prop.ts';
import { JOURNEY_CHANNEL, isJourneyMessage, readFrontendStatus, type EngineMessage, type FrontendMessage, type FrontendStatus } from './protocol.ts';
import { installEnvironment } from '../environment/runtime.ts';
import { installPostalWater } from '../environment/postal-water.ts';
import { installPostalLantern, POSTAL_LANTERN_POSITION } from '../environment/postal-lantern.ts';
import { installTravelerContact } from '../environment/traveler-contact.ts';
import { createValleyShadowProjection, valleyShadowLight } from '../environment/valley-shadow.ts';
import { solarPosition, WEATHER } from '../environment/weather.ts';
import { skyGradientMaterial } from '../environment/sky-gradient.ts';
import { createFreshJourney,restoreWithWeatherSeed,shutterTransition } from '../environment/forecast-boundary.ts';
import { WET_SURFACES, NIGHT_LIGHT_MATERIALS, CLOUD_ENTITY_KEY } from '../shanye-world/environment-refs.ts';
import { rainShelterHeight } from '../shanye-world/rain-shelter.ts';
import { afterClosing, nearbyNightInteraction, nightTravelBlock } from '../journey/night.ts';
import { installNightScene } from './night-scene.ts';
import type { PhotoSceneRecord } from '../shared/photography-contract.ts';

export const ENGINE_PACKAGE_ID=definePackageId('01a1e000-7700-7000-8000-000000000050');
export const ENGINE_ROOT_GUID=AssetGuid.format(AssetGuid.derive(ENGINE_PACKAGE_ID,'plugin/engine'));
const assetGuid=(key:string)=>AssetGuid.format(AssetGuid.derive(ENGINE_PACKAGE_ID,key));
const START_POSE:Pose={position:WORLD.spawn,yaw:WORLD.spawnYaw,pitch:POSTAL_LOOKOUT_PITCH,area:'post'};
// Linear-light values. Startup and the ending transition share these baselines.
// Light travels toward +Z: the valley's south-facing landmarks receive warm side light.
const DAY_LIGHT=WEATHER.morning;
interface Config {scene:string;skyMaterial:string}
interface Capture {id:string;observation:PhotoObservation;pose:Pose;scene:PhotoSceneRecord;elapsed:number}

/** Only the Engine realm owns durable journey state and changes the World. */
export const engine:Plugin.Object<Config>={
  name:'shanye/journey-engine',inject:['world','assets','gameHost'],
  async apply(ctx,config){
    const world=ctx.world,assets=ctx.assets,host=ctx.gameHost;
    if(!assets||!host)throw new Error('Shanye requires the App-owned World, Assets and GameHost');
    const port=host.port;
    await ctx.effect(async function*(){
      const grainTex=(await assets.load(worldGuidText('texture/voxel-grain'),'texture')).unwrap();yield()=>assets.release(grainTex).unwrap();
      const stoneTex=(await assets.load(worldGuidText('texture/stone-grain'),'texture')).unwrap();yield()=>assets.release(stoneTex).unwrap();
      markLoadTimeline('shanye-scene-load-start');
      const scene=(await assets.load(config.scene,'scene')).unwrap();yield()=>assets.release(scene).unwrap();
      markLoadTimeline('shanye-scene-loaded');
      const root=assets.instantiate(scene,world).unwrap();yield()=>worldDespawnScene(world,root).unwrap();
      markLoadTimeline('shanye-scene-instantiated');
      const skyMaterial=(await assets.load(config.skyMaterial,'material')).unwrap();yield()=>assets.release(skyMaterial).unwrap();
      const spawned:EntityHandle[]=[];yield()=>{for(const entity of spawned.reverse())world.despawn(entity).unwrap();};
      const camera=world.spawn({component:Transform,data:{pos:[0,18,-230]}},{component:Camera,data:{...perspective({fov:Math.PI/3,aspect:16/9,near:.15,far:1900}),tonemap:TONEMAP_ACES_FILMIC,antialias:ANTIALIAS_SMAA,exposure:1.05,clearColor:[.12,.3,.5,1]}}).unwrap();spawned.push(camera);
      const updateShadowProjection = createValleyShadowProjection();
      const sun=world.spawn({component:DirectionalLight,data:{
        direction:DAY_LIGHT.sunDirection,color:DAY_LIGHT.sunColor,intensity:DAY_LIGHT.sunIntensity,
        ...valleyShadowLight,
        ...updateShadowProjection(START_POSE.position,DAY_LIGHT.sunDirection,'high'),
      }}).unwrap();spawned.push(sun);
      const ambient=world.spawn({component:Skylight,data:{color:[1,1,1],intensity:DAY_LIGHT.fillIntensity}}).unwrap();spawned.push(ambient);
      const fog=world.spawn({component:Fog,data:{mode:FogModeValue.linear,color:DAY_LIGHT.fogColor,near:280,far:1400,maxOpacity:.6}}).unwrap();spawned.push(fog);
      const lamps=[
        {handle:world.spawn({component:Transform,data:{pos:[149,29.2,15]}},{component:PointLight,data:{color:[1,.64,.26],intensity:0,range:24}}).unwrap(),kind:'town'},
        {handle:world.spawn({component:Transform,data:{pos:[161.5,29.2,15]}},{component:PointLight,data:{color:[1,.64,.26],intensity:0,range:24}}).unwrap(),kind:'town'},
        {handle:world.spawn({component:Transform,data:{pos:[163.03,27.05,50.40]}},{component:PointLight,data:{color:[1,.72,.43],intensity:6,range:7.2}}).unwrap(),kind:'paper'},
        {handle:world.spawn({component:Transform,data:{pos:[155.6,27.5,49.1]}},{component:PointLight,data:{color:[1,.70,.32],intensity:0,range:16}}).unwrap(),kind:'courtyard'},
        {handle:world.spawn({component:Transform,data:{pos:[-170,42.5,-26.5]}},{component:PointLight,data:{color:[1,.66,.28],intensity:0,range:22}}).unwrap(),kind:'ambient'},
      ] as const;
      spawned.push(...lamps.map(l=>l.handle));
      const postalLantern=installPostalLantern(world);yield postalLantern.dispose;
      const nightScene=await installNightScene(world,assets);yield nightScene.dispose;
      const sixthScene=await installSixthScene(world,assets);yield sixthScene.dispose;
      const player=resolveWorldEntity(world,root,WORLD_ENTITY_KEYS.player);
      const leverLight=world.spawn({component:Transform,data:{pos:[148.4,26,9.4]}},{component:PointLight,data:{color:[1,.72,.3],intensity:0,range:3.5}}).unwrap();spawned.push(leverLight);
      let state=createJourney(START_POSE);
      markLoadTimeline('shanye-environment-start');
      const environment=await installEnvironment({world,assets,camera,sun,skyMaterial,ambient,fog,initialClock:state.durable.clock,initialPosition:[0,18,-230],wetSurfaces:WET_SURFACES,nightLights:NIGHT_LIGHT_MATERIALS,terrainHeight,shelterHeight:rainShelterHeight,cloud:resolveWorldEntity(world,root,CLOUD_ENTITY_KEY)});yield environment.dispose;
      const postalWater=await installPostalWater(world,assets,rainShelterHeight);yield postalWater.dispose;
      markLoadTimeline('shanye-environment-ready');
      const forestLunch=resolveWorldEntity(world,root,WORLD_ENTITY_KEYS.forestLunch);
      const letterPaper={folded:resolveWorldEntity(world,root,WORLD_ENTITY_KEYS.valleyLetterFolded),opened:resolveWorldEntity(world,root,WORLD_ENTITY_KEYS.valleyLetterOpened)};
      const ginkgoLeaves=Array.from({length:5},(_,i)=>resolveWorldEntity(world,root,'ambient/ginkgo-'+i));
      const dynamic=Object.fromEntries((['sails','curtain','gate','bridge','flag','courtyardBell'] as const).map(key=>[key,resolveWorldEntity(world,root,WORLD_ENTITY_KEYS[key])])) as Record<'sails'|'curtain'|'gate'|'bridge'|'flag'|'courtyardBell',EntityHandle>;
      const birds=[
        {handle:resolveWorldEntity(world,root,WORLD_ENTITY_KEYS.bird0),cx:-130,cy:60,cz:-65,rx:42,rz:34,speed:.22,phase:0},
        {handle:resolveWorldEntity(world,root,WORLD_ENTITY_KEYS.bird1),cx:-65,cy:66,cz:-120,rx:48,rz:38,speed:.18,phase:1.7},
        {handle:resolveWorldEntity(world,root,WORLD_ENTITY_KEYS.bird2),cx:65,cy:55,cz:-85,rx:36,rz:44,speed:.20,phase:3.4},
        {handle:resolveWorldEntity(world,root,WORLD_ENTITY_KEYS.bird3),cx:115,cy:64,cz:45,rx:38,rz:32,speed:.17,phase:4.9},
      ] as const;
      const baseline=Object.fromEntries(Object.entries(dynamic).map(([key,entity])=>{const t=world.get(entity,Transform).unwrap();return[key,{pos:Array.from(t.pos) as [number,number,number],scale:Array.from(t.scale) as [number,number,number],quat:Array.from(t.quat) as [number,number,number,number]}];})) as Record<keyof typeof dynamic,{pos:[number,number,number];scale:[number,number,number];quat:[number,number,number,number]}>;
      const joints:Partial<Record<AvatarJointName,EntityHandle>>={};
      for(const key of ['head','leftArm','rightArm','leftLeg','rightLeg','leftShoe','rightShoe','cameraProp','letterProp'] as const)joints[key]=resolveWorldEntity(world,root,WORLD_ENTITY_KEYS[key]);
      const cameraProp=portraitCameraProp(world,joints.cameraProp!);yield cameraProp.dispose;
      let controller:TravelController|undefined;
      let restored=false,hasSave=false,saveRevision=0,pending:Capture|null=null,captureSequence=0,syncing=false,disposed=false;
      let frontend:FrontendStatus|null=null;
      let saveStatus:PresentationViewModel['saveStatus'],saveMessage:string|undefined,events:JourneyEvent[]=[];
      let publishClock=0,saveClock=0,visualClock=0,lastWorldFlags='',lastQuality='',shutterReady=false;
      let toast:PresentationViewModel['toast'],toastSequence=0;
      let lastSafeRoad:TravelStatus['position']|undefined;
      let lastRecovery:{sequence:number;from:TravelStatus['position'];to:TravelStatus['position'];routeId:string}|null=null;
      let leverHighlighted=false;
      let publishedView:PresentationViewModel|undefined;
      let nightBarrier: ReturnType<typeof nightTravelBlock>=null;
      const inputDiagnostics=createInputDiagnostics();
      const send=(message:EngineMessage)=>{if(!disposed)port?.postMessage(message);};
      const acceptedInput=()=>canPlay(state)&&!(state.runtime.screen==='photo'&&state.durable.pendingPhoto!==null)&&pending===null;
      const snapshot=()=>controller?.snapshot();
      function publish(){
        const status=snapshot();if(!status)return;
        const mapHeading=status.mode==='photo'&&status.photography.settings.mode==='portrait'?status.facingYaw:status.yaw;
        const view=toPresentationView(state,{mapBounds:WORLD.bounds,mapHeading,hasSave,saveStatus,saveMessage,toast,movement:{running:status.running,grounded:status.grounded}});
        if(nightBarrier&&state.runtime.screen==='play'&&(nightBarrier!=='market')===afterClosing(state.durable))view.hint=nightBarrier==='mountain'
          ? '禅院已闭院。领到烟花、提着火把才可从山脚上行。花街夜市已开放。' : nightBarrier==='photo-shop'
            ? '照相铺内室已经闭门。底片和进度会保留，次晨 06:20 再来。' : '花街白天休市，18:40 开门。';
        if (nearPlayableBoundary(status.position)) {
          if (state.runtime.screen === 'play') view.hint = '到山谷边界了。沿山坡折返，或点「回到最近小路」。';
          if (state.runtime.screen === 'photo') view.boundaryNotice = '到山谷边界了。往回走，或放下相机后回到最近小路。';
        }
        const applied={...environment.snapshot(),postalRain:postalWater.snapshot()};
        if(view.weather)view.weather={...view.weather,transitioning:!applied.settled};
        if(view.camera)view.camera={...view.camera,viewpoints:status.photography.candidates.map(c=>({index:c.index,label:['人与路','人在风景里','靠近一点'][c.index]??'机位',available:c.available,reason:c.reason})),candidateStatus:status.photography.candidateStatus,captureState:pending?'capturing':'idle'};
        publishedView=view;
        send({channel:JOURNEY_CHANNEL,kind:'state',state,view,controller:status,environment:applied,events:events.splice(0),saveRevision,restored});publishClock=0;
      }
      function notice(message:string,error=false){state={...state,runtime:{...state.runtime,notice:message}};toast={id:++toastSequence,title:error?'这一张暂时没有保存':'山谷来信',message,kind:error?'error':'info'};events.push({type:'notice',message});publish();}
      function syncController(){
        if(!controller)return;
        controller.setAbilities(state.durable.skills);
        controller.setLookSettings(state.durable.settings);
        controller.configurePhotography(state.durable.photography);
        const photo=state.runtime.screen==='photo'||(['paused','journal','map'].includes(state.runtime.screen)&&state.runtime.returnScreen==='photo');
        const status=controller.snapshot();
        if(status.mode!=='zipline'&&photo!==(status.mode==='photo')){
          syncing=true;controller.setPaused(false);controller.toggleCamera();syncing=false;
        }
        controller.setPaused(!acceptedInput());
        cameraProp.update(controller.snapshot());
      }
      function cancelCapture(reason:string){shutterReady=false;if(!pending)return;const id=pending.id;pending=null;send({channel:JOURNEY_CHANNEL,kind:'capture-cancelled',requestId:id,reason});syncController();}
      function apply(action:JourneyAction,commit=true){
        const before=state;const transition=reduceJourney(state,action);state=transition.state;events.push(...transition.events);
        const shutter=shutterTransition(action,transition.events,state);
        if(shutter==='cancel'||(pending&&action.type==='set-settings'))cancelCapture('photography-cancelled');
        else if(shutter==='ready')shutterReady=true;
        const prominent=transition.events.find(e=>e.type==='reward:fireworks'||e.type==='skill:learned')??transition.events.find(e=>e.type==='reply:photo-selected')??transition.events.find(e=>e.type==='outing:checked-in'||e.type==='clock:rested')??transition.events.find(e=>e.type==='memory:unlocked')??transition.events.find(e=>e.type==='memory:photo-replaced'||e.type==='discovery:found'||e.type==='ending:mailed'||e.type==='world:gate-opened'||e.type==='world:bridge-lowering'||e.type==='world:windmill-awaken');
        if(prominent)toast={id:++toastSequence,title:prominent.type==='reward:fireworks'?'领取结局奖励':prominent.type==='skill:learned'?'学会新本领':prominent.type==='reply:photo-selected'?'回信里的照片已选好':prominent.type==='outing:checked-in'?'这一刻，留在旅途里':prominent.type==='clock:rested'?'歇一会儿，继续出发':prominent.type==='memory:unlocked'?'两段路，接成一封来信':prominent.type==='memory:photo-replaced'?'回信里的照片已换好':prominent.type==='discovery:found'?'找到一段山谷往事':'山谷回信了',message:prominent.message,kind:prominent.type==='discovery:found'?'discovery':'success'};
        if((commit&&!['set-context','set-pose','tick','pause','resume'].includes(action.type))||before.durable.weatherCycle.cycle!==state.durable.weatherCycle.cycle){saveRevision++;hasSave=state.durable.started;}
        if(before.runtime.ride&&!state.runtime.ride&&(action.type==='return-to-menu'||action.type==='cancel-ride'))controller?.restore(state.durable.player.position,state.durable.player.yaw);
        syncController();
        if(commit)publish();
      }
      function context(status:TravelStatus){
        if(status.mode!=='zipline'&&status.grounded&&isSafeRoadPose(status.position,worldState(state)))lastSafeRoad=[...status.position];
        apply({type:'set-pose',pose:poseFromController(status)},false);
        apply({type:'set-context',nearby:nearbyNightInteraction(state,status.position)??(!state.durable.creativeMode?(sixthNearby(status.position)??nearestFlowerStop(status.position,afterClosing(state.durable))):null)??nearestPhysicalInteraction(status.position,state.durable.stamps.town,state.durable.creativeMode,worldState(state).lunchDelivered),observation:status.mode==='photo'?observeAppliedPhoto(status,environment.snapshot(),state.durable):null},false);
      }
      function capture(status:TravelStatus){
        if(pending||!canPlay(state)||state.runtime.screen!=='photo'||state.durable.pendingPhoto)return;
        if(status.photography.settings.mode==='portrait'&&(!status.photography.candidateAvailable||!status.photography.subjectVisible)){notice(status.photography.candidateStatus||'旅人还没完整走进镜头，挪一挪再拍。',true);return;}
        context(status);
        const applied=environment.snapshot(),observation=observeAppliedPhoto(status,applied,state.durable),pose=poseFromController(status),id=`capture-${++captureSequence}`;
        const scene=appliedPhotoScene(status,applied);
        pending={id,observation,pose,scene,elapsed:0};syncController();
        environment.update({weather:state.durable.weather,clock:state.durable.clock,exposure:state.durable.photography.exposure,position:status.camera.position,delta:0,frozen:true,paused:false});
        send({channel:JOURNEY_CHANNEL,kind:'capture-request',requestId:id,observation,pose,camera:status.camera,scene,framing:status.photography.settings.framing});
      }
      function requestShutter(source:ShutterSource){inputDiagnostics.shutter(source,!!pending||shutterReady);if(!pending&&!shutterReady)apply({type:'begin-countdown'});}
      function recoverPath(){
        if(!controller||!state.durable.started||state.runtime.screen==='menu'||state.runtime.screen==='ending')return;
        const from=controller.snapshot().position,destination=findRecoveryPoint(from,worldState(state),lastSafeRoad,
          to=>!nightTravelBlock(state.durable,state.runtime.torchLit,from,to));
        if(!destination){notice('这附近还没有确认安全的小路。请先保留本页，暂时不要重新开始。');return;}
        cancelCapture('return-to-path');
        controller.restore(destination.position,destination.yaw);
        lastRecovery={sequence:(lastRecovery?.sequence??0)+1,from:[...from],to:[...destination.position],routeId:destination.routeId};
        apply({type:'recover-path',pose:{position:destination.position,yaw:destination.yaw,pitch:.13,area:areaAt(destination.position)}});
        lastSafeRoad=[...destination.position];
        context(controller.snapshot());publish();
      }
      function nightPropsReady() {
        if(nightScene.status().phase==='ready')return true;
        nightScene.request(true);
        notice(nightScene.status().phase==='failed'
          ? '夜场景物暂时无法加载。可以继续走路和拍照，刷新后再试夜场。'
          : '夜场景物正在加载，稍等片刻再试。');
        return false;
      }
      function interact(){
        const status=snapshot();if(!status)return;context(status);
        if(state.runtime.screen==='play'&&status.mode==='walk'&&status.grounded&&firstEnvelopeGuide(state.durable)){
          controller?.toggleCamera();return;
        }
        if(state.runtime.nearby?.startsWith('mailbox:')&&canSendLetter(state)){
          if(validatedMailTarget(status,state))apply({type:'request-mail-confirmation'});
        }
        else if(state.runtime.nearby?.startsWith('rest:')){
          if(status.grounded&&status.mode==='walk')apply({type:'open-rest'});
        }else if(state.runtime.nearby==='zipline'){
          const landing=[WORLD.zipline.end[0],terrainHeight(WORLD.zipline.end[0],WORLD.zipline.end[2]),WORLD.zipline.end[2]] as const;
          apply({type:'start-ride',destination:{position:landing,yaw:Math.PI,pitch:.14,area:areaAt(landing)},duration:WORLD.zipline.duration});
          if(state.runtime.ride){
            const points=[status.position,WORLD.zipline.start,...(WORLD.zipline.points??[]),WORLD.zipline.end,landing];
            const length=points.slice(1).reduce((sum,point,i)=>sum+Math.hypot(...point.map((n,k)=>n-points[i]![k]!)),0);
            // duration is a nominal travel estimate. Boarding/landing can be slower;
            // only the controller's actual land event completes the Journey ride.
            if(!controller!.startZipline({...WORLD.zipline,speed:length/WORLD.zipline.duration}))apply({type:'cancel-ride'});
          }
        }else if((state.runtime.nearby?.startsWith('afternoon-') || state.runtime.nearby?.startsWith('night-') || state.runtime.nearby?.startsWith('flower:') || state.runtime.nearby?.startsWith('sixth:')) && (!status.grounded || status.mode !== 'walk')){
          notice('请先收起相机，在这里站稳。');
        }else if(state.runtime.nearby){
          const id=state.runtime.nearby;
          if(afterClosing(state.durable)&&id.startsWith('night-')&&id!=='night-inn'&&!nightPropsReady())return;
          apply({type:'interact',id});
        }
      }
      function onAction(event:TravelActionEvent){
        if(syncing)return;
        if(event.type==='camera-enter'){context(event.state);apply({type:'open-camera'});}
        else if(event.type==='camera-exit')apply({type:'close-camera'});
        else if(event.type==='shutter')requestShutter('native:shutter');
        else if(event.type==='interact')interact();
        else if(event.type==='pause')apply({type:'set-screen',screen:state.runtime.screen==='paused'?'play':'paused'});
        else if(event.type==='map')apply({type:'set-screen',screen:'map'});
        else if(event.type==='journal')apply({type:'set-screen',screen:'journal'});
        else if(event.type==='zipline-land'&&event.state.mode==='walk'&&event.state.grounded)apply({type:'finish-ride',pose:poseFromController(event.state)});
      }
      function setRotation(entity:EntityHandle,x:number,y:number,z:number){const q=quat.fromEuler(quat.create(),x,y,z,'XYZ');world.set(entity,Transform,{quat:[q[0],q[1],q[2],q[3]]}).unwrap();}
      function updateWorld(delta:number,status:TravelStatus){
        const flags=worldState(state);visualClock+=flags.paused?0:delta;
        const highlight=state.runtime.nearby==='town-gate'&&!flags.gateOpen;
        if(highlight!==leverHighlighted){leverHighlighted=highlight;world.set(leverLight,PointLight,{intensity:highlight?3.5:0}).unwrap();}
        const quality=state.durable.settings.quality;
        if(quality!==lastQuality){
          // Analytic valley fog consumes single-sample depth. SMAA resolves colour
          // edges selectively and remains compatible with this depth contract.
          world.set(camera,Camera,{antialias:quality==='high'?ANTIALIAS_SMAA:ANTIALIAS_FXAA}).unwrap();
          lastQuality=quality;
        }
        if(flags.windmillTurning)setRotation(dynamic.sails,0,0,visualClock*.5);
        setRotation(dynamic.flag,0,Math.sin(visualClock*2.1)*.08,0);
        setRotation(dynamic.courtyardBell,Math.sin(visualClock*1.5)*(flags.courtyardOpen?.055:.018),0,0);
        if(!flags.paused&&!state.durable.settings.reducedMotion&&Math.hypot(status.position[0]-163,status.position[2]-51)<40){
          for(let i=0;i<ginkgoLeaves.length;i++){
            const t=(visualClock*(.103+i*.003)+i*.381966)%1,phase=t*Math.PI*2+i*1.51;
            const q=quat.fromEuler(quat.create(),Math.sin(phase*1.8)*.65,phase,Math.sin(phase)*.5,'XYZ');
            world.set(ginkgoLeaves[i]!,Transform,{pos:[165.7+i*.50-2.4*t+.52*Math.sin(phase),29.9+.18*i-6.25*t,52.2+.55*i-3.0*t+.51*Math.cos(phase)],quat:[q[0],q[1],q[2],q[3]]}).unwrap();
          }
        }
        for(const b of birds){
          const a=visualClock*b.speed+b.phase;
          const bx=b.cx+Math.cos(a)*b.rx,bz=b.cz+Math.sin(a)*b.rz,by=b.cy+Math.sin(a*2.3)*2.2;
          const heading=Math.atan2(-Math.sin(a)*b.rx,-Math.cos(a)*b.rz);
          const q=quat.fromEuler(quat.create(),0,heading,Math.sin(a*3)*.12,'XYZ');
          world.set(b.handle,Transform,{pos:[bx,by,bz],quat:[q[0],q[1],q[2],q[3]]}).unwrap();
        }
        const solar=solarPosition(state.durable.clock);
        const duskProgress=Math.max(0,Math.min(1,(-solar.elevation+.09)/.18));
        const nightGlow=duskProgress*duskProgress*(3-2*duskProgress);
        const lampBucket=Math.round(nightGlow*12);
        const key=`${flags.curtainOpen}:${flags.gateOpen}:${flags.bridgeProgress}:${flags.townLights}:${flags.valleyLetterOpened}:${flags.lunchDelivered}:${lampBucket}`;
        if(key!==lastWorldFlags){
          world.set(dynamic.curtain,Transform,{scale:[baseline.curtain.scale[0],baseline.curtain.scale[1]*(flags.curtainOpen?.045:1),baseline.curtain.scale[2]]}).unwrap();
          setRotation(dynamic.gate,0,flags.gateOpen?-Math.PI*.54:0,0);
          setRotation(dynamic.bridge,(1-flags.bridgeProgress)*TOWN_BRIDGE_REST_ANGLE,0,0);
          // The opened mesh starts hidden in the source scene. Restore its authored
          // unit scale explicitly; multiplying its initial zero scale cannot reveal it.
          const foldedScale=flags.valleyLetterOpened ? .0001 : 1,openedScale=flags.valleyLetterOpened ? 1 : .0001;
          world.set(letterPaper.folded,Transform,{scale:[foldedScale,foldedScale,foldedScale]}).unwrap();
          world.set(letterPaper.opened,Transform,{scale:[openedScale,openedScale,openedScale]}).unwrap();
          const lunchScale=flags.lunchDelivered ? 1 : 0;
          world.set(forestLunch,Transform,{scale:[lunchScale,lunchScale,lunchScale]}).unwrap();
          for(const lamp of lamps){
            const base=lamp.kind==='courtyard'?38:65;
            const intensity=lamp.kind==='paper'?6+17*nightGlow:lamp.kind==='town'&&flags.townLights?Math.max(90,base*nightGlow):base*nightGlow;
            world.set(lamp.handle,PointLight,{intensity}).unwrap();
          }
          lastWorldFlags=key;
        }
        postalLantern.update(nightGlow,status.position);
        nightScene.update(state,status);
        const inPhotoRoom=inSixthRoom(status.position);
        sixthScene.update(state.durable.sixth.displayed,afterClosing(state.durable)&&!inPhotoRoom,inPhotoRoom);
        const paused=state.runtime.pauseReasons.length>0||state.runtime.screen==='paused'||state.runtime.screen==='menu'||state.runtime.screen==='journal'||state.runtime.screen==='map';
        environment.update({weather:state.durable.weather,clock:state.durable.clock,exposure:status.mode==='photo'?status.photography.settings.exposure:0,position:status.camera.position,view:status.camera,delta,frozen:false,paused});
        if (!paused) postalWater.update(status,environment.rainIntensity(),delta);
        const shadow = updateShadowProjection(status.position,environment.sunDirection(),quality);
        if(shadow)world.set(sun,DirectionalLight,shadow).unwrap();
      }
      let bridgeWalkable=false;
      const soleSurface=(x:number,z:number,height:number)=>travelerVisibleSurface(x,z,height,bridgeWalkable);
      const travelerContact=installTravelerContact(world,assets,soleSurface);yield travelerContact.dispose;
      function onFrame(status:TravelStatus,stance?:Parameters<typeof travelerContact.update>[1]){
        if(disposed)return;
        const lighting=environment.snapshot();
        const [lx,,lz]=POSTAL_LANTERN_POSITION;
        const nightLight=lighting.sunIntensity<.21
          ? Math.max(0,.65-Math.hypot(status.position[0]-lx,status.position[2]-lz)*.06) : 0;
        if(!pending && !status.paused)travelerContact.update(status,stance,Math.max(lighting.sunIntensity*.38,nightLight));
        bridgeWalkable=worldState(state).bridgeWalkable;
        const delta=Math.min(.25,Math.max(0,world.getResource(Time).delta));
        // The controller writes camera-prop pos/quat before this callback. Its
        // scale remains entry-owned and is ready before a capture is requested.
        cameraProp.update(status);
        if(!pending){
          context(status);
          if(state.runtime.ride&&status.mode==='zipline')apply({type:'ride-progress',progress:status.ziplineProgress},false);
          apply({type:'tick',deltaSeconds:delta},false);updateWorld(delta,status);
          if(shutterReady&&!status.photoRaising){shutterReady=false;capture(status);}
        }
        if(pending){pending.elapsed+=delta;if(pending.elapsed>12){cancelCapture('照片编码超时');notice('照片还没有保存成功。请再试一次快门。',true);}}
        publishClock+=delta;saveClock+=canPlay(state)?delta:0;
        if(saveClock>=5){saveClock=0;saveRevision++;}
        if(publishClock>=.4||events.length)publish();
      }
      const statefulMovement:typeof resolveMove=(position,displacement,radius=.28,height=1.72)=>{
        const next=resolveMove(position,displacement,radius,height),flags=worldState(state);
        const blockers=travelBlockers(flags);
        for(const axis of [0,2] as const){
          const other=axis===0?2:0;
          for(const b of blockers){
            if(next[1]+height<=b.min[1]!||next[1]>=b.max[1]!||next[other]+radius<=b.min[other]!||next[other]-radius>=b.max[other]!)continue;
            if(next[axis]+radius>b.min[axis]!&&next[axis]-radius<b.max[axis]!){
              next[axis]=position[axis]<=(b.min[axis]!-radius)?b.min[axis]!-radius:position[axis]>=(b.max[axis]!+radius)?b.max[axis]!+radius:position[axis];
            }
          }
        }
        if(displacement[0]||displacement[2]){
          nightBarrier=nightTravelBlock(state.durable,state.runtime.torchLit,position,next);
          if(nightBarrier)return [position[0],next[1],position[2]];
        }
        return next;
      };
      const handle=installTravelController({world,host,player,camera,spawn:START_POSE.position,initialYaw:START_POSE.yaw,initialPitch:.13,walkingCameraFrame:postalLookoutCamera,landscapeEyeHeight:postalLookoutEyeHeight,terrainHeight:walkingSurfaceHeight,visibleTread:soleSurface,restoreGround:rockGroundOnRestore,resolveMove:statefulMovement,traceSegment:(from,to,clearance)=>traceTravelSegment(from,to,worldState(state),clearance),portraitTraceSegment:(from,to,clearance)=>traceTravelSegment(from,to,worldState(state),clearance,[SIXTH_PICTURE_BLOCKERS[state.durable.sixth.displayed?1:0]!]),alternatePortraitAngles:position=>inSixthRoom(position)||sixthNearby(position)==='sixth:window',portraitStage:sixthPortraitStage,joints,onAction,onFrame,inputAllowed:acceptedInput,
        onInputSample(frame,input){const status=snapshot();inputDiagnostics.observe(frame,input,status?.mode??'walk',state.runtime.screen,status?.paused??true);}});
      controller=handle.controller;yield handle.dispose;syncController();
      const unregister=host.gameProjection?.registerRead({id:'shan.journey',title:'拍一卷山色旅行状态',description:'真实玩家位置、场景变化、取景构图与旅行进度。',
        read:()=>JSON.parse(JSON.stringify({state,view:publishedView,forecast:weatherForecast(state.durable),controller:controller!.snapshot(),environment:{...environment.snapshot(),postalRain:postalWater.snapshot()},world:worldState(state),restored,pendingCapture:pending?.id??null,saveRevision,frontend,lastRecovery,leverHighlighted,cameraPropScale:Array.from(world.get(joints.cameraProp!,Transform).unwrap().scale),inputDiagnostics:inputDiagnostics.read(),nightProps:nightScene.status()}))});
      if(unregister)yield unregister;
      // The official Worker inspector reads source-realm projections only.
      // Ask the frontend for current facts on demand over our borrowed channel.
      if(host.gameProjection&&port){
        const photographyRead=createPhotoDiagnosticsReader(port);yield photographyRead.dispose;
        yield host.gameProjection.registerRead({id:'shan.capture',title:'实际快门与完成帧',description:'Read-only frontend frame and capture facts via the game MessagePort.',read:photographyRead.read});
      }
      function presentation(action:PresentationAction,payload?:unknown){
        if(action==='recover-path'){recoverPath();return;}
        if(action==='shutter'){requestShutter('presentation:shutter');return;}
        if(action==='rest-until'){
          const status=snapshot(),target=status?validatedRestTarget(payload,status,state):null;
          if(!status||!target||pending){notice('请在歇脚点站稳，再选择下一阵天光。');return;}
          context(status);apply({type:'rest-until',target});return;
        }
        if(action==='interact'){interact();return;}
        if(action==='sixth'){
          const status=snapshot(),data=payload as Record<string,unknown>|undefined;
          if(!status?.grounded||status.mode!=='walk'||pending)return;
          context(status);
          if(data?.operation==='reveal'||data?.operation==='display'||data?.operation==='portrait')
            apply({type:'sixth',operation:data.operation,photoId:typeof data.photoId==='string'?data.photoId:undefined});
          return;
        }
        if(action==='flower-gear'||action==='flower-photo'){
          const status=snapshot();
          if(!status?.grounded||status.mode!=='walk'||pending)return;
          context(status);
          const data=payload as Record<string,unknown>|undefined;
          const operation=data?.operation,kind=isFlowerKind(data?.kind)?data.kind:undefined;
          if(action==='flower-gear'&&(operation==='take'||operation==='retrieve'||operation==='clear'||operation==='invite'||operation==='sample')){
            if(operation==='take'&&!nightPropsReady())return;
            const source=data?.source==='stock'||data?.source==='sample'?data.source:undefined;
            const index=typeof data?.index==='number'&&Number.isSafeInteger(data.index)?data.index:undefined;
            apply({type:action,operation,kind,source,index});
          }
          if(action==='flower-photo'&&(operation==='day'||operation==='night'||operation==='repeat'||operation==='redeem'))
            apply({type:action,operation,kind,photoId:typeof data?.photoId==='string'?data.photoId:undefined});
          return;
        }
        if(action==='night-gear'){
          const status=snapshot();
          if(!status?.grounded || status.mode!=='walk' || pending)return;
          context(status);
          const gear=payload as {operation?:unknown;kind?:unknown}|null;
          const operation=gear?.operation;
          const kind=gear?.kind;
          if((operation==='take'||operation==='torch')&&afterClosing(state.durable)&&!nightPropsReady())return;
          if(operation==='torch'||operation==='take'||operation==='cancel'||operation==='retrieve'||operation==='invite-gold'||operation==='reprise')
            apply({type:'night-gear',operation,...(kind==='gold'||kind==='scarlet'?{kind}:{})});
          return;
        }
        if(action==='send-letter'){
          const status=snapshot(),id=status?validatedMailTarget(status,state):null;
          if(!status||!id||pending){notice('请在邮筒前站稳，确认信里的照片后再盖上邮戳。',true);return;}
          // A local confirmation pauses ordinary input. Do not remove hidden,
          // platform or other pause reasons, and do not reopen the modal here.
          if(state.runtime.screen==='journal')apply({type:'set-screen',screen:'play'},false);
          if(state.runtime.pauseReasons.includes('ui'))apply({type:'resume',reason:'ui'},false);
          context(status);
          if(state.runtime.nearby===id)apply({type:'interact',id});
          return;
        }
        if(action==='new-game'){
          lastSafeRoad=undefined;lastRecovery=null;nightBarrier=null;
          cancelCapture('new-game');state=createFreshJourney(START_POSE);restored=true;hasSave=false;saveRevision++;controller!.restore(START_POSE.position,START_POSE.yaw,START_POSE.pitch);apply({type:'start'});return;
        }
        if(action==='settings'){
          if(payload&&typeof payload==='object'){
            const p=payload as Record<string,unknown>;
            apply({type:'set-settings',settings:typeof p.key==='string'?{[p.key]:p.value}:p});
          }return;
        }
        const next=actionFromPresentation(state,action,payload);if(next){if(next.type==='close-camera'||next.type==='return-to-menu')cancelCapture('camera-closed');apply(next);}
      }
      function receive(event:MessageEvent){
        if(!isJourneyMessage(event.data)||disposed)return;
        const message=event.data as FrontendMessage;
        if(message.kind==='frontend-status'){const status=readFrontendStatus(event.data);if(status)frontend=status;return;}
        if(message.kind==='inspect'){publish();return;}
        if(message.kind==='restore'){
          if(restored)return;
          const result=restoreWithWeatherSeed(message.serialized,START_POSE);state=result.state;
          hasSave=result.status==='loaded'||result.status==='migrated';restored=result.status!=='invalid'&&result.status!=='future-version';
          controller!.restore(clearPlanterOnRestore(state.durable.player.position),state.durable.player.yaw,
            result.status==='empty'?START_POSE.pitch:undefined);syncController();
          if(result.warnings.length)notice(result.warnings.join(' '),true);publish();return;
        }
        if(message.kind==='save-status'){saveStatus=message.status;saveMessage=message.message;return;}
        if(message.kind==='presentation'){presentation(message.action,message.payload);return;}
        if(message.kind==='capture-result'){
          if(!pending||message.requestId!==pending.id)return;
          const request=pending;pending=null;
          const thumbnail=cleanThumbnail(message.thumbnail),original=cleanOriginalPhoto(message.original);
          if(message.error||!thumbnail||!original){syncController();notice(message.error ? `${message.error} 处理后可按空格或快门重试。` : '原图没有保存成功。可按空格或快门重试。',true);return;}
          // The pending request froze controller input. Commit only after a real image returned.
          apply({type:'set-pose',pose:request.pose},false);
          apply({type:'take-photo',observation:request.observation,thumbnail,original,scene:request.scene,capturedAt:Number.isFinite(message.capturedAt)?message.capturedAt:Date.now()});return;
        }
        if(message.kind==='command'){
          const action=message.action;if(!action||typeof action.type!=='string')return;
          if(action.type==='take-photo'){requestShutter('command:take-photo');return;}
          if(action.type==='interact'){interact();return;}
          if(['set-pose','set-context','discover','tick','start-ride','ride-progress','finish-ride','night-gear','flower-gear','flower-photo','sixth'].includes(action.type))return;
          const allowed=['start','return-to-menu','set-screen','open-camera','close-camera','keep-photo','discard-draft','delete-photo','select-ending-photo','replace-memory-photo','cancel-ride','pause','resume','finish-ending','set-settings','set-weather','set-photography','begin-countdown','cancel-countdown','delete-film-photo'];
          if(allowed.includes(action.type)){if(action.type==='begin-countdown')inputDiagnostics.shutter('command:begin-countdown',!!pending||shutterReady);apply(action);}
        }
      }
      port?.addEventListener('message',receive);port?.start();
      yield()=>{disposed=true;port?.removeEventListener('message',receive);};
      send({channel:JOURNEY_CHANNEL,kind:'ready',version:'0.5.0'});publish();
    });
  },
};

export default definePack({schemaVersion:'2.0.0',plugins:true,packageId:ENGINE_PACKAGE_ID,build:()=>ok({
  'environment/sky-gradient':skyGradientMaterial,
  'plugin/engine':{kind:'plugin',module:{specifier:'./engine.pack.ts',export:'engine'},config:{scene:{$asset:WORLD_SCENE_GUID},skyMaterial:{$asset:assetGuid('environment/sky-gradient')}}},
})});
