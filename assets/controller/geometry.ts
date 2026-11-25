import type { AnchorShape, CameraPose, ProjectedAnchor, TraceSegment, Vec3 } from './types.ts';
import { photoFrameBounds, WIDE_PHOTO_ASPECT, type PhotoFraming } from '../shared/photography-contract.ts';
export const clamp = (n: number, low: number, high: number): number => Math.min(high, Math.max(low, n));
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
export const subtract = (a: Vec3, b: Vec3): Vec3 => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
export const scale = (v: Vec3, n: number): Vec3 => [v[0]*n, v[1]*n, v[2]*n];
export const dot = (a: Vec3, b: Vec3): number => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export const length = (v: Vec3): number => Math.hypot(v[0],v[1],v[2]);
export const distance = (a: Vec3, b: Vec3): number => length(subtract(a,b));
export const normalize = (v: Vec3): Vec3 => { const n=length(v); return n > 1e-8 ? scale(v,1/n) : [0,0,-1]; };
export const lerp = (a: Vec3,b: Vec3,t:number):Vec3 => add(a,scale(subtract(b,a),t));
export const cross = (a:Vec3,b:Vec3):Vec3 => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const forwardFor = (yaw:number,pitch:number):Vec3 => [Math.sin(yaw)*Math.cos(pitch),-Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)];
export function angleLerp(from:number,to:number,t:number):number { return from+Math.atan2(Math.sin(to-from),Math.cos(to-from))*t; }
/** Project the portion of the lens that will reach the original photo. */
export function framedPhotoCamera(camera:CameraPose,framing?:PhotoFraming):CameraPose {
  if(framing!=='wide')return camera;
  const size=camera.bufferSize;
  const crop=size?photoFrameBounds(size.width,size.height,framing):undefined;
  const heightFraction=crop&&size?crop.height/size.height:Math.min(1,camera.aspect/WIDE_PHOTO_ASPECT);
  return {...camera,aspect:crop?crop.width/crop.height:WIDE_PHOTO_ASPECT,
    verticalFovRadians:2*Math.atan(Math.tan(camera.verticalFovRadians/2)*heightFraction)};
}
export function cameraRay(pose:CameraPose,x=.5,y=.5):{origin:Vec3;direction:Vec3} {
  const forward=normalize(pose.forward), right=normalize(cross(forward,pose.up)), up=normalize(cross(right,forward));
  const tan=Math.tan(pose.verticalFovRadians/2);
  return {origin:pose.position,direction:normalize(add(forward,add(scale(right,(x*2-1)*tan*pose.aspect),scale(up,(1-y*2)*tan))))};
}
export function projectPoint(pose:CameraPose,point:Vec3):{x:number;y:number;depth:number} {
  const relative=subtract(point,pose.position),forward=normalize(pose.forward),right=normalize(cross(forward,pose.up)),up=normalize(cross(right,forward));
  const depth=dot(relative,forward),tan=Math.tan(pose.verticalFovRadians/2);
  const divisor=Math.max(.001,depth)*tan;
  return {x:.5+dot(relative,right)/(2*divisor*pose.aspect),y:.5-dot(relative,up)/(2*divisor),depth};
}
/** Projects the opening's authored bounds, not an entire building's bounds. right creates a vertical plane. */
export function projectAnchor(pose:CameraPose,anchor:AnchorShape|Vec3,radius=0,trace?:TraceSegment):ProjectedAnchor {
  const shape:AnchorShape=Array.isArray(anchor)?{position:anchor as Vec3,radius}:anchor as AnchorShape;
  const center=projectPoint(pose,shape.position),r=shape.radius??radius,size=shape.size??[r*2,r*2,r*2];
  const corners:Vec3[]=[];
  if(shape.right) {
    for(const sx of [-.5,.5]) for(const sy of [-.5,.5]) corners.push(add(shape.position,add(scale(normalize(shape.right),size[0]*sx),[0,size[1]*sy,0])));
  } else {
    for(const sx of [-.5,.5]) for(const sy of [-.5,.5]) for(const sz of [-.5,.5]) corners.push(add(shape.position,[size[0]*sx,size[1]*sy,size[2]*sz]));
  }
  const projected=corners.map(p=>projectPoint(pose,p)),front=projected.every(p=>p.depth>.05);
  const minX=Math.min(...projected.map(p=>p.x)),maxX=Math.max(...projected.map(p=>p.x)),minY=Math.min(...projected.map(p=>p.y)),maxY=Math.max(...projected.map(p=>p.y));
  const width=maxX-minX,height=maxY-minY;
  const clippedWidth=Math.max(0,Math.min(1,maxX)-Math.max(0,minX)),clippedHeight=Math.max(0,Math.min(1,maxY)-Math.max(0,minY));
  const pointInside=center.x>=0&&center.x<=1&&center.y>=0&&center.y<=1;
  const visibleFraction=front?(width*height>1e-8?clamp(clippedWidth*clippedHeight/(width*height),0,1):Number(pointInside)):0;
  // Stop just before the subject: a wall-mounted subject's own surface is not an occluder.
  const end=lerp(shape.position,pose.position,Math.min(.015,.12/Math.max(.12,distance(pose.position,shape.position))));
  const occluded=!!trace?.(pose.position,end,.025).hit;
  return {x:center.x,y:center.y,width,height,depth:center.depth,visibleFraction,occluded,visible:front&&visibleFraction>0&&!occluded,screenRadius:Math.max(width,height)/2};
}
/** Keep the camera's near plane outside walls, roofs and stepped terrain. */
export function safeCameraPosition(focus:Vec3,desired:Vec3,height:(x:number,z:number)=>number,trace?:TraceSegment,clearance=.3,previous?:Vec3):Vec3 {
  return solveCameraClearance(focus,desired,height,trace,clearance,previous).position;
}

export function solveCameraClearance(focus:Vec3,desired:Vec3,height:(x:number,z:number)=>number,trace?:TraceSegment,clearance=.3,previous?:Vec3):{origin:Vec3;position:Vec3} {
  // World traces include expanded boxes, but a zero-length terrain trace need
  // not test its endpoint. Both checks are required, including after a lift.
  const clear=(p:Vec3)=>p[1]>=height(p[0],p[2])+clearance&&!trace?.(p,p,clearance).hit;
  let origin=focus;
  if(!clear(origin)) {
    const lifted:Vec3=[focus[0],Math.max(focus[1],height(focus[0],focus[2])+clearance+.01),focus[2]];
    let recovered:Vec3|undefined=clear(lifted)?lifted:undefined;
    // The traveller's radius is 0.28m, just smaller than the camera clearance.
    // At a wall/corner find a nearby clear anchor instead of tracing from inside
    // the expanded solid (which reports fraction=0 in every direction).
    const heading=Math.atan2(desired[0]-focus[0],desired[2]-focus[2]);
    for(const radius of [.12,.3,.6]) {
      if(recovered)break;
      for(const y of [0,-.25,.25]) {
        if(recovered)break;
        for(let i=0;i<8;i++) {
          const angle=heading+i*Math.PI/4,p:Vec3=[lifted[0]+Math.sin(angle)*radius,lifted[1]+y,lifted[2]+Math.cos(angle)*radius];
          if(clear(p)){recovered=p;break;}
        }
      }
    }
    // A malformed/temporarily enclosed focus must not replace a known safe
    // camera. The caller retains its previous pose as the bounded fallback.
    if(!recovered){
      const position=previous&&clear(previous)?previous:clear(desired)?desired:focus;
      return {origin:position,position};
    }
    origin=recovered;
  }
  const orbitLength=distance(origin,desired);
  if(orbitLength<1e-6)return {origin,position:origin};
  const hit=trace?.(origin,desired,clearance);
  // Clearance has already expanded the world solid. A small skin avoids the
  // contact surface; a minimum orbit fraction would jump through nearby walls.
  let fraction=hit?.hit?clamp(hit.fraction-.025/orbitLength,0,1):1;
  const steps=Math.max(1,Math.ceil(orbitLength/.2));
  let last=0;
  for(let i=1;i<=steps;i++) {
    const t=Math.min(i/steps,fraction),p=lerp(origin,desired,t);
    if(p[1]<height(p[0],p[2])+clearance) {
      let low=last,high=t;
      for(let n=0;n<7;n++){const mid=(low+high)/2,q=lerp(origin,desired,mid);if(q[1]>=height(q[0],q[2])+clearance)low=mid;else high=mid;}
      fraction=Math.max(0,low-.025/orbitLength);break;
    }
    last=t;if(t>=fraction)break;
  }
  let position=lerp(origin,desired,fraction);
  // Never lift this final point without rechecking the roof above it. Retreat
  // along the already verified ray if numerical contact still overlaps a box.
  if(!clear(position)) {
    let low=0,high=fraction;
    for(let n=0;n<8;n++){const mid=(low+high)/2;if(clear(lerp(origin,desired,mid)))low=mid;else high=mid;}
    position=lerp(origin,desired,Math.max(0,low-.025/orbitLength));
  }
  return {origin,position};
}

/** Keep the rear boom over the slope it backs across. Raising the endpoint
 * only changes the vertical clearance, leaving lateral wall clipping intact. */
export function terrainOrbitLift(origin:Vec3,desired:Vec3,height:(x:number,z:number)=>number,clearance:number):number {
  const steps=Math.max(1,Math.ceil(distance(origin,desired)/.18));
  let lift=0;
  for(let i=1;i<=steps;i++){
    const t=i/steps,point=lerp(origin,desired,t);
    const margin=i===steps?.17:.10;
    lift=Math.max(lift,(height(point[0],point[2])+clearance+margin-point[1])/t);
  }
  return clamp(lift,0,1.6);
}
