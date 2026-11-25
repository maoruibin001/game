import { COURIER_ANKLE_Y } from '../shanye-world/courier-costume.ts';
import { clamp } from './geometry.ts';
import { COURIER_LEG_PIVOT,COURIER_LEG_WIDTH,type VisibleTread } from './traveler-stance.ts';
import type { Vec3 } from './types.ts';

const heel=.0925,toe=-.2345, halfWidth=.105;
const center=(heel+toe)/2;
const shoeBottom=-.57-COURIER_ANKLE_Y;
const footprint=[[-halfWidth,toe],[-halfWidth,heel],[halfWidth,toe],[halfWidth,heel],
  [0,toe],[0,heel],[-halfWidth,center],[halfWidth,center],[0,center]] as const;

export function articulateCourierShoe(
  position:Vec3,yaw:number,side:-1|1,legPitch:number,lift:number,surface?:VisibleTread,
) {
  const sin=Math.sin(yaw),cos=Math.cos(yaw),localX=side*COURIER_LEG_WIDTH;
  const ankleY=COURIER_LEG_PIVOT+COURIER_ANKLE_Y*Math.cos(legPitch),ankleZ=COURIER_ANKLE_Y*Math.sin(legPitch);
  const worldPoint=(x:number,y:number,z:number):Vec3=>[
    position[0]+cos*x-sin*z,position[1]+y,position[2]+sin*x+cos*z,
  ];
  const at=(x:number,z:number)=>{
    const point=worldPoint(localX+x,ankleY,ankleZ+z);
    return surface?.(point[0],point[2],position[1])??position[1];
  };
  let pitch=legPitch,roll=0;
  if(surface) {
    const floor=footprint.map(([x,z])=>at(x,z));
    const h=floor[8]!;
    const sideGrade=(floor[7]!-floor[6]!)/(2*halfWidth);
    const strideGrade=(floor[5]!-floor[4]!)/(heel-toe);
    // Reject treads straddling a riser: both sides must agree with a plane over
    // the whole sole. A shoe on a stair edge keeps its authored gait angle.
    const error=Math.max(...footprint.map(([x,z],i)=>Math.abs(floor[i]!-(h+x*sideGrade+(z-center)*strideGrade))));
    const weight=clamp((.041-error)/.025,0,1)*clamp(1-lift/.057,0,1);
    const contactPitch=clamp(-Math.atan(strideGrade),-.46,.46);
    const contactRoll=clamp(Math.atan(sideGrade/Math.hypot(1,strideGrade)),-.37,.37);
    pitch=legPitch+(contactPitch-legPitch)*weight;
    roll=contactRoll*weight;
  }
  const ps=Math.sin(pitch),pc=Math.cos(pitch),rs=Math.sin(roll),rc=Math.cos(roll);
  let gap=Infinity,contact=position;
  const probe=(x:number,z:number):Vec3=>{
    const tx=x*rc-shoeBottom*rs,ty=x*rs+shoeBottom*rc;
    return worldPoint(localX+tx,ankleY+ty*pc-z*ps,ankleZ+ty*ps+z*pc);
  };
  for(const [x,z] of footprint){
    const p=probe(x,z),floor=surface?.(p[0],p[2],position[1])??position[1];
    if(p[1]-floor<gap){gap=p[1]-floor;contact=[p[0],floor,p[2]];}
  }
  const adjustment=surface?clamp(.005+lift-gap,-.15,.16):0;
  const soleCenter=probe(0,center);
  return {adjustment,contact,clearance:gap+adjustment,
    center:[soleCenter[0],soleCenter[1]+adjustment,soleCenter[2]] as Vec3,
    anklePosition:[localX,ankleY+adjustment,ankleZ] as Vec3,pitch,roll};
}
