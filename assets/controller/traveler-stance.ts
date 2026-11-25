import { clamp } from './geometry.ts';
import type { Vec3 } from './types.ts';

export const COURIER_LEG_PIVOT = .57;
export const COURIER_LEG_WIDTH = .13;
// Authored in courierLimbs: the sole is .327m long and .210m wide.
const soleBottom = -.57;
const soleProbes = [[0,-.071],[0,-.215],[0,.072],[-.088,-.071],[.088,-.071]] as const;
export type VisibleTread = (x:number,z:number,height:number)=>number;

export function courierSole(
  position:Vec3, yaw:number, side:-1|1, swing:number, lift:number, surface?:VisibleTread,
) {
  const sin=Math.sin(yaw),cos=Math.cos(yaw);
  const legSin=Math.sin(swing),legCos=Math.cos(swing);
  const offsetX=side*COURIER_LEG_WIDTH;
  const probe=([x,z]:readonly [number,number]):Vec3=>{
    const lateral=offsetX+x;
    const depth=soleBottom*legSin+z*legCos;
    return [
      position[0]+cos*lateral-sin*depth,
      position[1]+COURIER_LEG_PIVOT+soleBottom*legCos-z*legSin,
      position[2]+sin*lateral+cos*depth,
    ];
  };
  const points=soleProbes.map(probe);
  const gaps=points.map(([x,y,z])=>y-(surface?.(x,z,position[1])??position[1]));
  const contactProbe=gaps.indexOf(Math.min(...gaps));
  const adjustment=surface?clamp(.009+lift-gaps[contactProbe]!,-.15,.16):0;
  const contact=points[contactProbe]!;
  return {adjustment,contact:[contact[0],contact[1]-gaps[contactProbe]!,contact[2]] as Vec3,
    clearance:gaps[contactProbe]!+adjustment,
    center:[points[0]![0],points[0]![1]+adjustment,points[0]![2]] as Vec3};
}
