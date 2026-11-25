import type { GameHost } from '@forgeax/engine/app';
import { FixedTime, FixedUpdate, Time, Update, type EntityHandle, type World } from '@forgeax/engine/ecs';
import { FRAME_START_SCAN_SYSTEM_NAME, INPUT_SNAPSHOT_RESOURCE_KEY, type InputSnapshot } from '@forgeax/engine/input';
import { quat } from '@forgeax/engine/math';
import { Camera } from '@forgeax/engine/render';
import { PROPAGATE_TRANSFORMS_SYSTEM, Transform } from '@forgeax/engine/scene';
import { createTravelController, type TravelController } from './travel-controller.ts';
import { articulateCourierShoe } from './courier-ankle.ts';
import { COURIER_LEG_PIVOT, COURIER_LEG_WIDTH, courierSole, type VisibleTread } from './traveler-stance.ts';
import { EMPTY_INPUT, type ControllerOptions, type InputFrame, type TravelStatus } from './types.ts';

export const TRAVEL_INPUT_SYSTEM='shanye/travel-input';
export const TRAVEL_MOVE_SYSTEM='shanye/travel-movement';
export const TRAVEL_CAMERA_SYSTEM='shanye/travel-camera';
export type AvatarJointName='head'|'chest'|'leftArm'|'rightArm'|'leftForearm'|'rightForearm'|'leftLeg'|'rightLeg'|'leftShoe'|'rightShoe'|'cameraProp'|'letterProp';
export interface NativeControllerOptions extends ControllerOptions {
  world:World; host:GameHost; player:EntityHandle; camera:EntityHandle;
  /** Optional mesh handle retained for integration; visibility defaults to the whole player. */
  body?:EntityHandle;
  /** Hide the complete avatar in first-person. The camera must not be a child of this root. */
  visibilityRoot?:EntityHandle;
  /** Feet-origin travel avatar uses 0; the original centered template rig needs about .93. */
  modelOffsetY?:number;
  joints?:Partial<Record<AvatarJointName,EntityHandle>>;
  visibleTread?:VisibleTread;
  onFrame?:(state:TravelStatus,stance?:readonly [ReturnType<typeof courierSole>,ReturnType<typeof courierSole>])=>void;
  /** Optional local diagnostic observation, immediately before input submission. */
  onInputSample?:(frame:InputFrame,snapshot:InputSnapshot|undefined)=>void;
  /** Frontend modal ownership can supplement controller.setPaused(). */
  inputAllowed?:()=>boolean;
}

/** Snapshot sampling stays in the Engine worker. The frontend sends only semantic actions. */
export function sampleTravelInput(snapshot:InputSnapshot|undefined,mode:'walk'|'photo'|'zipline'='walk'):InputFrame {
  if(!snapshot)return {...EMPTY_INPUT};
  const key=(code:string)=>snapshot.keyboard.downCode(code);
  // A press and release can both arrive before the Engine reads the next frame.
  // Preserve that edge for actions while keeping movement tied to held keys.
  const actionKey=(code:string)=>key(code)||snapshot.keyboard.justPressedCode(code);
  const rmb=snapshot.mouse.button(2),lmb=snapshot.mouse.button(0);
  // The input backend accumulates pointer movement before the next sample.
  // Discard any movement that was queued before the camera drag began.
  const leftLook=lmb&&(mode==='walk'||(mode==='photo'&&!snapshot.mouse.justPressed(0)));
  const ad=Number(key('KeyD'))-Number(key('KeyA'));
  const arrows=Number(key('ArrowRight'))-Number(key('ArrowLeft'));
  return {
    horizontal:ad,
    vertical:Number(key('KeyW')||key('ArrowUp'))-Number(key('KeyS')||key('ArrowDown')),
    turn:arrows,
    steerCharacter:mode==='walk',
    orbitOnly:mode==='walk'&&leftLook&&!rmb,
    run:key('ShiftLeft')||key('ShiftRight'),jump:actionKey('Space'),
    lookX:snapshot.mouse.movementDelta.x,lookY:snapshot.mouse.movementDelta.y,
    lookActive:rmb||snapshot.mouse.pointerLocked||leftLook,
    camera:actionKey('KeyC')||actionKey('KeyQ'),
    shutter:actionKey('KeyF'),
    interact:actionKey('KeyE'),pause:actionKey('Escape'),map:actionKey('KeyM'),journal:actionKey('KeyJ')||actionKey('Tab'),
  };
}
function writeRotation(world:World,entity:EntityHandle,x:number,y:number,z:number) {
  const q=quat.fromEuler(quat.create(),x,y,z,'XYZ');
  const current=world.get(entity,Transform).unwrap().quat;
  if([0,1,2,3].some(i=>current[i]!==q[i]))world.set(entity,Transform,{quat:[q[0],q[1],q[2],q[3]]}).unwrap();
}
function writePose(world:World,entity:EntityHandle,position:readonly[number,number,number],rotation:readonly[number,number,number,number]) {
  const current=world.get(entity,Transform).unwrap();
  if(position.some((n,i)=>current.pos[i]!==Math.fround(n))||rotation.some((n,i)=>current.quat[i]!==Math.fround(n)))world.set(entity,Transform,{pos:position,quat:rotation}).unwrap();
}
function poseAvatar(options:NativeControllerOptions,state:TravelStatus) {
  const joints=options.joints;if(!joints)return;
  const walk=Math.min(1,state.speed/6),run=state.running&&state.grounded,swing=Math.sin(state.stepPhase)*(run?.68:.42)*walk;
  const portrait=state.mode==='photo'&&state.photography.settings.mode==='portrait';
  const photo=state.mode==='photo'&&!portrait,ride=state.mode==='zipline',airborne=state.mode==='walk'&&!state.grounded;
  const set=(name:AvatarJointName,x:number,y=0,z=0)=>{const entity=joints[name];if(entity)writeRotation(options.world,entity,x,y,z);};
  const placeLeg=(name:'leftLeg'|'rightLeg',side:-1|1,pitch:number)=>{
    const entity=joints[name];
    if(!entity)return;
    const planted=state.grounded&&state.avatarVisible&&!ride;
    const stepping=planted&&state.mode==='walk'&&state.speed>.15;
    const swingLift=stepping?Math.max(0,-side*Math.cos(state.stepPhase))*.06*walk:0;
    const surface=planted?options.visibleTread:undefined;
    const shoe=joints[side<0?'leftShoe':'rightShoe'];
    const q=quat.fromEuler(quat.create(),pitch,0,0,'XYZ');
    if(shoe){
      const sole=articulateCourierShoe(state.position,state.facingYaw,side,pitch,swingLift,surface);
      const ankle=quat.fromEuler(quat.create(),sole.pitch,0,sole.roll,'XYZ');
      writePose(options.world,shoe,sole.anklePosition,[ankle[0],ankle[1],ankle[2],ankle[3]]);
      writePose(options.world,entity,[side*COURIER_LEG_WIDTH,COURIER_LEG_PIVOT+sole.adjustment,0],[q[0],q[1],q[2],q[3]]);
      return sole;
    }
    const sole=courierSole(state.position,state.facingYaw,side,pitch,swingLift,surface);
    writePose(options.world,entity,[side*COURIER_LEG_WIDTH,COURIER_LEG_PIVOT+sole.adjustment,0],[q[0],q[1],q[2],q[3]]);
    return sole;
  };
  const left=placeLeg('leftLeg',-1,ride?-.3:airborne?-.32:swing);
  const right=placeLeg('rightLeg',1,ride?.3:airborne?.22:-swing);
  set('leftArm',photo?2.08:ride?2.65:airborne?-.25:-swing*(run?1:.7),0,photo?.45:ride?.15:airborne?.18:.03);
  set('rightArm',photo?2.15:ride?2.65:airborne?-.25:swing*(run?1:.7),0,photo?-.45:ride?-.15:airborne?-.18:-.03);
  set('leftForearm',photo?1.05:ride?.22:0);set('rightForearm',photo?1.05:ride?.22:0);
  set('head',photo?-state.pitch*.75:run?-.06:0);set('chest',ride?.1:run?.12+Math.sin(state.stepPhase*2)*.025:Math.sin(state.stepPhase*2)*walk*.025);
  if(portrait){
    const pose=state.photography.settings.pose;
    if(pose==='wave'){
      set('rightArm',2.65,0,.38+Math.sin(state.posePhase*5)*.16);set('rightForearm',.2);
      set('leftArm',-.08,0,.06);set('head',-.04,-.12);set('chest',0,0,-.035);
    }else if(pose==='letter'){
      set('leftArm',1.1,0,.5);set('rightArm',1.1,0,-.5);
      set('leftForearm',.12);set('rightForearm',.12);set('head',-.32);set('chest',-.04);
    }else{
      set('leftArm',-.1,0,.08);set('rightArm',.04,0,-.08);set('head',-.035,.12);set('chest',0,-.06);
    }
  }
  if(joints.cameraProp)options.world.set(joints.cameraProp,Transform,{pos:photo?[0,1.5,-.3]:[.23,.94,-.23],quat:[0,0,0,1]}).unwrap();
  if(joints.letterProp)options.world.set(joints.letterProp,Transform,{pos:[0,1.05,-.36],quat:[0,0,0,1],scale:portrait&&state.photography.settings.pose==='letter'?[1,1,1]:[0,0,0]}).unwrap();
  if(left&&right&&state.grounded&&state.avatarVisible&&!ride)return [left,right] as const;
  return undefined;
}

/** Call from the owning native Plugin's ctx.effect; yield result.dispose for cleanup. */
export function installTravelController(options:NativeControllerOptions):{controller:TravelController;dispose:()=>void} {
  const {world,host,player,camera}=options,controller=createTravelController(options);
  let inputSuppressed=false,disposed=false;
  const visibilityRoot=options.visibilityRoot??player;
  const visibleTransform=world.get(visibilityRoot,Transform).unwrap();
  const originalBodyScale:readonly[number,number,number]=[visibleTransform.scale[0],visibleTransform.scale[1],visibleTransform.scale[2]];
  let bodyHidden=false;
  // RMB drag and UI remain usable without capture; no worker touches DOM APIs.
  host.setPointerLockAllowed?.(false);
  world.addSystem(Update,{
    name:TRAVEL_INPUT_SYSTEM,after:[FRAME_START_SCAN_SYSTEM_NAME],before:[FixedUpdate],queries:[],
    fn:()=>{
      const size=host.drawingBufferSize?.();if(size&&size.height>0)controller.setAspect(size.width/size.height,size);
      const allow=options.inputAllowed?.()??true;
      if(!allow&&!inputSuppressed){controller.setPaused(true);inputSuppressed=true;}
      if(allow&&inputSuppressed){controller.setPaused(false);inputSuppressed=false;}
      const input=world.hasResource(INPUT_SNAPSHOT_RESOURCE_KEY)?world.getResource<InputSnapshot>(INPUT_SNAPSHOT_RESOURCE_KEY):undefined;
      const sampled=sampleTravelInput(input,controller.snapshot().mode);
      options.onInputSample?.({...sampled},input);
      controller.submitInput(sampled);
    },
  }).unwrap();
  world.addSystem(FixedUpdate,{
    name:TRAVEL_MOVE_SYSTEM,queries:[],fn:()=>{
      controller.step(world.getResource(FixedTime).delta);
      const state=controller.snapshot(),q=quat.fromEuler(quat.create(),0,-state.facingYaw,0,'XYZ');
      writePose(world,player,[state.position[0],state.position[1]+(options.modelOffsetY??0),state.position[2]],[q[0],q[1],q[2],q[3]]);
    },
  }).unwrap();
  world.addSystem(Update,{
    name:TRAVEL_CAMERA_SYSTEM,after:[FixedUpdate,TRAVEL_INPUT_SYSTEM],before:[PROPAGATE_TRANSFORMS_SYSTEM],queries:[],fn:()=>{
      const pose=controller.updateCamera(world.getResource(Time).delta),target=[pose.position[0]+pose.forward[0],pose.position[1]+pose.forward[1],pose.position[2]+pose.forward[2]] as const;
      const q=quat.fromLookAt(quat.create(),pose.position,target,pose.up);
      writePose(world,camera,pose.position,[q[0],q[1],q[2],q[3]]);
      const lens=world.get(camera,Camera).unwrap();
      if(lens.fov!==Math.fround(pose.verticalFovRadians)||lens.aspect!==Math.fround(pose.aspect))world.set(camera,Camera,{fov:pose.verticalFovRadians,aspect:pose.aspect}).unwrap();
      const state=controller.snapshot(),hide=!state.avatarVisible;
      // A configuration and shutter can arrive before the next rendered frame.
      // Publish the frozen state once too; every subsequent paused write is identical.
      if(hide!==bodyHidden){world.set(visibilityRoot,Transform,{scale:hide?[.0001,.0001,.0001]:originalBodyScale}).unwrap();bodyHidden=hide;}
      const stance=poseAvatar(options,state);
      options.onFrame?.(state,stance);
    },
  }).unwrap();
  // Set the spawn before the first rendered frame.
  const state=controller.snapshot();world.set(player,Transform,{pos:[state.position[0],state.position[1]+(options.modelOffsetY??0),state.position[2]]}).unwrap();
  return {controller,dispose(){if(disposed)return;disposed=true;world.removeSystem(Update,TRAVEL_CAMERA_SYSTEM).unwrap();world.removeSystem(FixedUpdate,TRAVEL_MOVE_SYSTEM).unwrap();world.removeSystem(Update,TRAVEL_INPUT_SYSTEM).unwrap();if(bodyHidden)world.set(visibilityRoot,Transform,{scale:originalBodyScale}).unwrap();}};
}
