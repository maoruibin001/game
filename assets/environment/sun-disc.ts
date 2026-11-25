import { createMeshBuilder } from '@forgeax/engine/geometry';
import type { MeshAsset } from '@forgeax/engine/types';
import type { Vec3 } from '../controller/types.ts';
import type { SolarPosition,SunDiscSnapshot } from './weather.ts';

/** Inside the game's 1900m far plane and beyond its authored terrain. */
export const SUN_DISC_DISTANCE=1200;
export const SUN_DISC_RADIUS=21;
export const SUN_DISC_VISIBILITY_THRESHOLD=.12;
export function sunDiscShape(eye:Vec3,solar:SolarPosition|undefined,visibility:number):SunDiscSnapshot {
  return {position:solar?eye.map((v,i)=>v+solar.direction[i]!*SUN_DISC_DISTANCE) as unknown as Vec3:[0,-2000,0],
    radius:SUN_DISC_RADIUS,visible:!!solar&&visibility>SUN_DISC_VISIBILITY_THRESHOLD};
}

/** A small unlit sphere appears as a disc from every heading. Its native depth
 * participates normally: hills/buildings can cover it; no screen-space overlay. */
export function sunDiscMesh():MeshAsset {
  const segments=32,rings=12,position:number[]=[],normal:number[]=[],uv:number[]=[],tangent:number[]=[],indices:number[]=[];
  for(let r=0;r<=rings;r++)for(let s=0;s<=segments;s++){
    const phi=r/rings*Math.PI,theta=s/segments*Math.PI*2;
    const x=Math.sin(phi)*Math.cos(theta),y=Math.cos(phi),z=Math.sin(phi)*Math.sin(theta);
    position.push(x,y,z);normal.push(x,y,z);uv.push(s/segments,r/rings);tangent.push(-Math.sin(theta),0,Math.cos(theta),1);
  }
  for(let r=0;r<rings;r++)for(let s=0;s<segments;s++){
    const a=r*(segments+1)+s,b=a+segments+1;
    if(r>0)indices.push(a,a+1,b);
    if(r<rings-1)indices.push(a+1,b+1,b);
  }
  return createMeshBuilder({attributes:{position:new Float32Array(position),normal:new Float32Array(normal),uv:new Float32Array(uv),tangent:new Float32Array(tangent)},
    indices:new Uint32Array(indices),submeshes:[{indexOffset:0,indexCount:indices.length,vertexCount:position.length/3,topology:'triangle-list',materialSlot:0}]}).build().unwrap();
}
