import { describe, expect, it } from 'vitest';
import { add, normalize, projectPoint, subtract } from '../../controller/geometry.ts';
import { createTravelController } from '../../controller/travel-controller.ts';
import { EMPTY_INPUT, type TravelStatus, type Vec3 } from '../../controller/types.ts';
import { nearestInteraction, observePhoto } from '../../entry/engine-helper.ts';
import { createJourney } from '../../journey/journey.ts';
import { evaluateFrame } from '../../journey/photography.ts';
import { FOREST_PHOTO_STATION } from '../forest-composition.ts';
import { FOREST_GARDEN_BOXES, type DetailBox } from '../scene-details.ts';
import { resolveMove, roadSample, terrainHeight, traceSegment, visiblePathWidth } from '../world-layout.ts';

const foot=(x:number,z:number):Vec3=>[x,terrainHeight(x,z),z];
function walk(points:readonly (readonly [number,number])[]){
 const c=createTravelController({spawn:foot(...points[0]!),terrainHeight,resolveMove,traceSegment});
 for(const target of points.slice(1)){
  let frames=0;
  while(Math.hypot(c.snapshot().position[0]-target[0],c.snapshot().position[2]-target[1])>.13&&frames++<1800){
   const s=c.snapshot(),yaw=Math.atan2(target[0]-s.position[0],-(target[1]-s.position[2]));
   c.submitInput({...EMPTY_INPUT,vertical:1,lookActive:true,lookX:Math.atan2(Math.sin(yaw-s.yaw),Math.cos(yaw-s.yaw))/.0022});c.step(1/60);
  }
  expect(frames,`blocked at ${c.snapshot().position} toward ${target}`).toBeLessThan(1800);
 }
 return c.snapshot();
}
const cameraAt=(x:number,z:number):TravelStatus=>{
 const position=foot(x,z),eye=add(position,[0,1.64,0]);
 return {...createTravelController({spawn:position,terrainHeight}).snapshot(),position,mode:'photo',
  camera:{position:eye,forward:normalize(subtract(FOREST_PHOTO_STATION.target,eye)),up:[0,1,0],verticalFovRadians:Math.PI/3,aspect:16/9}};
};
function connectedFootprint(boxes:readonly DetailBox[]):boolean{
 const seen=new Set([0]),pending=[0];
 while(pending.length){
  const a=boxes[pending.pop()!]!;
  for(let i=0;i<boxes.length;i++)if(!seen.has(i)){
   const b=boxes[i]!;
   if([0,2].every(axis=>Math.abs(a.center[axis]!-b.center[axis]!)<=(a.size[axis]!+b.size[axis]!)/2+.001)){seen.add(i);pending.push(i);}
  }
 }
 return seen.size===boxes.length;
}

describe('forest planted court',()=>{
 it('forms connected foliage beds on both shoulders, with a larger west mass',()=>{
  const leaves=(side:string)=>FOREST_GARDEN_BOXES.filter(b=>b.id.startsWith(`forest-bed/${side}-`)&&b.id.includes('/leaf-'));
  for(const side of ['west','east'])expect(connectedFootprint(leaves(side)),`${side} has isolated ornamental clumps`).toBe(true);
  const footprint=(boxes:readonly DetailBox[])=>{
   const x0=Math.min(...boxes.map(b=>b.center[0]-b.size[0]/2)),x1=Math.max(...boxes.map(b=>b.center[0]+b.size[0]/2));
   const z0=Math.min(...boxes.map(b=>b.center[2]-b.size[2]/2)),z1=Math.max(...boxes.map(b=>b.center[2]+b.size[2]/2));
   return (x1-x0)*(z1-z0);
  };
  expect(footprint(leaves('west'))).toBeGreaterThan(footprint(leaves('east'))*2);
  // Both banks are actually in the existing photo, below the windmill's main sail field.
  const camera=cameraAt(...FOREST_PHOTO_STATION.feet).camera;
  for(const side of ['west','east']){
   const visible=leaves(side).map(b=>projectPoint(camera,b.center)).filter(p=>p.depth>0&&p.x>.02&&p.x<.98&&p.y>.6&&p.y<.98);
   expect(visible.length,`${side} foliage is outside the current photograph`).toBeGreaterThan(5);
  }
 });

 it('keeps every planted/stone footprint away from the visible roads and roots in solid ground',()=>{
  for(const b of FOREST_GARDEN_BOXES.filter(b=>!b.id.includes('court-paver'))){
   for(const dx of [-.5,0,.5])for(const dz of [-.5,0,.5]){
    const x=b.center[0]+b.size[0]*dx,z=b.center[2]+b.size[2]*dz,r=roadSample(x,z);
    expect(r.distance-visiblePathWidth(r)/2,`${b.id} narrows ${r.route}`).toBeGreaterThan(.55);
   }
   if(b.id.endsWith('/root')&&!b.id.includes('/mill-'))
    expect(b.center[1]-b.size[1]/2,`${b.id} floats`).toBeLessThanOrEqual(terrainHeight(b.center[0],b.center[2]));
  }
  for(const b of FOREST_GARDEN_BOXES.filter(b=>b.id.includes('court-paver'))){
   for(const dx of [-.5,0,.5])for(const dz of [-.5,0,.5])
    expect(b.center[1]+b.size[1]/2,`${b.id} creates a new unwalkable step`).toBeLessThanOrEqual(terrainHeight(b.center[0]+b.size[0]*dx,b.center[2]+b.size[2]*dz));
  }
 });

 it('leaves ordinary access to the mailbox, bench, windmill stair and east-side loop',()=>{
  const mailbox=walk([[-170,-49.5],[-181,-49],[-181,-46.8]]);
  expect(nearestInteraction(mailbox.position)).toBe('forest-mailbox');
  walk([[-181,-46.8],[-184,-46.8],[-184,-37],[-180,-33],[-170,-35],[-170,-24.2],[-170,-35],[-164,-34],[-164,-20],[-164,-34],[-170,-49.5]]);
 });

 it.each([[-171,-52],[-173,-52],[-169,-52],[-171,-50],[-171,-54]])('preserves real windmill and real chime visibility from %s,%s',(x,z)=>{
  const observation=observePhoto(cameraAt(x,z));
  expect(observation.anchors.windmill!.occluded).toBe(false);
  expect(observation.anchors['forest-chime']!.occluded).toBe(false);
  expect(evaluateFrame(createJourney(),observation,'forest'),JSON.stringify(observation.anchors)).toMatchObject({matched:true});
 });
});
