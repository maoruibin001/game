import { LENS_FOV, type LensId } from '../shared/photography-contract.ts';
import { add, forwardFor, normalize, projectPoint, scale, subtract } from './geometry.ts';
import type { CameraPose, PortraitReason, PortraitStage, TraceSegment, Vec3 } from './types.ts';

export interface PortraitCandidatePose { index: number; pose: CameraPose; placementValid: boolean }
export const PORTRAIT_HINT: Record<PortraitReason, string> = {
  ready: '机位已放稳。用方向键慢慢站位，按住右键微调画面。',
  'camera-blocked': '这个机位被地形或墙挡住了。换一个机位，或到开阔处重新摆机位。',
  'subject-occluded': '人物被景物挡住了。慢慢挪到镜头前，或重新选一个机位。',
  'outside-frame': '人物没有完整留在画面里。慢慢退回取景框，或换一个机位。',
};

/** Check the actual camera segment, including terrain when no world ray is supplied. */
function clearSegment(a: Vec3, b: Vec3, ground: (x:number,z:number)=>number, trace?: TraceSegment, clearance=.025): boolean {
  if (trace?.(a,b,clearance).hit) return false;
  const count=Math.max(1,Math.ceil(Math.hypot(...subtract(a,b))/.22));
  for(let i=0;i<=count;i++){
    const t=i/count,x=a[0]+(b[0]-a[0])*t,y=a[1]+(b[1]-a[1])*t,z=a[2]+(b[2]-a[2])*t;
    if(y<ground(x,z)+clearance)return false;
  }
  return true;
}

/** Three ordinary tripod placements, looking into the background the player chose. */
export function createPortraitCandidates(position:Vec3,heading:number,lens:LensId,aspect:number,ground:(x:number,z:number)=>number,trace?:TraceSegment,alternateAngles=false,stage?:PortraitStage):PortraitCandidatePose[] {
  const distance=stage?.distance??{wide:4.4,standard:5.6,detail:7.4,tele:15.5}[lens];
  heading=stage?.heading??heading;
  function candidate(side:number,index:number,orientation:number):PortraitCandidatePose {
    const forward=forwardFor(orientation,0),right:Vec3=[Math.cos(orientation),0,Math.sin(orientation)];
    const target=add(position,add([0,1.02,0],add(scale(forward,.18),scale(right,stage?.aimRight??0))));
    const desired=add(position,add(scale(forward,-distance),add(scale(right,side*distance*.3),[0,1.62+Math.abs(side)*.14,0])));
    const minimumY=ground(desired[0],desired[2])+.42;
    const cameraPosition:Vec3=[desired[0],Math.max(desired[1],minimumY),desired[2]];
    const pose:CameraPose={position:cameraPosition,forward:normalize(subtract(target,cameraPosition)),up:[0,1,0],verticalFovRadians:LENS_FOV[lens],aspect};
    // Avoid lifting a camera onto a roof or pulling an obstructed candidate through a wall.
    const placementValid=cameraPosition[1]-desired[1]<1.25&&clearSegment(add(position,[0,1.02,0]),cameraPosition,ground,trace,.22)
      &&clearSegment(cameraPosition,add(cameraPosition,[0,.02,0]),ground,trace,.2);
    return {index,pose,placementValid};
  }
  const choices=[0,1,-1].map((side,index)=>candidate(side,index,heading));
  if(!alternateAngles)return choices;
  return choices.map((choice,index)=>{
    const usable=(item:PortraitCandidatePose)=>item.placementValid&&inspectPortrait(item.pose,position,ground,trace).available;
    if(usable(choice))return choice;
    // Look around opaque scenery before giving up on the requested preset.
    // Keep the alternate angles distinct so the three choices remain meaningful.
    const side=[0,1,-1][index]!,sign=side===-1?-1:1;
    for(const offset of [sign*Math.PI/2,-sign*Math.PI/2,Math.PI]){
      const alternate=candidate(side,index,heading+offset);
      if(usable(alternate))return alternate;
    }
    return choice;
  });
}

export function inspectPortrait(pose:CameraPose,position:Vec3,ground:(x:number,z:number)=>number,trace?:TraceSegment):{available:boolean;reason:PortraitReason;subjectVisible:boolean} {
  if(!clearSegment(pose.position,add(pose.position,[0,.02,0]),ground,trace,.2))return {available:false,reason:'camera-blocked',subjectVisible:false};
  // Include the hat, feet and shoulder width of the authored 1.86m native traveller.
  const offsets:readonly Vec3[]=[[0,.14,0],[0,1.86,0],[-.4,1.2,0],[.4,1.2,0]];
  const points=offsets.map(p=>add(position,p));
  const projected=points.map(p=>projectPoint(pose,p));
  const framed=projected.every(p=>p.depth>.3&&p.x>=.035&&p.x<=.965&&p.y>=.035&&p.y<=.965);
  const visible=points.every(p=>clearSegment(pose.position,p,ground,trace));
  const substantial=Math.max(...projected.map(p=>p.y))-Math.min(...projected.map(p=>p.y))>=.1;
  if(!visible)return {available:false,reason:'subject-occluded',subjectVisible:false};
  if(!framed||!substantial)return {available:false,reason:'outside-frame',subjectVisible:false};
  return {available:true,reason:'ready',subjectVisible:true};
}
