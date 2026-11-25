import {describe,expect,it} from 'vitest';
import {createTravelController} from '../../controller/travel-controller.ts';
import {EMPTY_INPUT} from '../../controller/types.ts';
import {ROUTES,landHeight,terrainHeight,resolveMove,traceSegment,type Vec3} from '../world-layout.ts';

type XZ=readonly[number,number];
const feet=([x,z]:XZ):Vec3=>[x,terrainHeight(x,z),z];
function walk(points:readonly XZ[],tolerance=.15):void{
 const c=createTravelController({spawn:feet(points[0]!),terrainHeight,resolveMove,traceSegment});
 for(const target of points.slice(1)){
  let frames=0;
  while(Math.hypot(c.snapshot().position[0]-target[0],c.snapshot().position[2]-target[1])>tolerance&&frames++<1800){
   const s=c.snapshot(),yaw=Math.atan2(target[0]-s.position[0],-(target[1]-s.position[2]));
   c.submitInput({...EMPTY_INPUT,vertical:1,lookActive:true,lookX:Math.atan2(Math.sin(yaw-s.yaw),Math.cos(yaw-s.yaw))/.0022});c.step(1/60);
  }
  expect(frames,`blocked at ${c.snapshot().position} heading to ${target}`).toBeLessThan(1800);
 }
}

describe('forest clearing shared solid ground',()=>{
 it('removes the source height discontinuity and the three reproduced oversized steps',()=>{
  expect(Math.abs(landHeight(-165.725,-38.725)-landHeight(-165.73,-38.73))).toBeLessThan(.01);
  for(const [from,to]of [
   [[-146.06662497071693,-24.099789997726976],[-146.05,-23.99]],
   [[-154.2514054371524,-20.007810712821207],[-154.28,-19.9]],
   [[-165.96747561497187,-38.89995073523428],[-166.0078,-39.0059]],
  ]as const)expect(Math.abs(terrainHeight(to[0],to[1])-terrainHeight(from[0],from[1]))).toBeLessThanOrEqual(.5);
 });
 it('walks both ways across the old hard grass ledge west of the windmill',()=>{
  for(const z of [-68.5,-46.5,-44.5]){
   expect(Math.abs(terrainHeight(-207.92,z)-terrainHeight(-208.08,z))).toBeLessThan(1.0);
   walk([[-210.5,z],[-205,z],[-210.5,z]]);
  }
  walk([[-195.7,-16.8],[-197.5,-17.6],[-195.7,-16.8]]);
 });
 it('walks the original failed east approach and its ordinary return without rescue',()=>{
  const points:XZ[]=[[-170,-49.5],[-150,-40],[-145,-20],[-150,-40],[-170,-49.5]];
  walk(points);walk([...points].reverse());
 });
 it('walks all eight outside forest viewpoints and the previously failed return in both directions',()=>{
  const ring:XZ[]=[[-170,-49.5],[-150,-40],[-164,-34],[-164,-20],[-154,-20],[-158,-7],[-170,-4],[-182,-7],[-186,-20],[-190,-40],[-170,-49.5]];
  walk(ring);walk([...ring].reverse());
  walk([[-154,-20],[-164,-20],[-164,-34],[-170,-49.5]]);
 });
 it.each(['forest-low','forest-high','valley-cross'])('keeps the original %s centreline bidirectionally walkable',(id)=>{
  const route=ROUTES.find(r=>r.id===id)!;
  const points=route.points.map(([x,,z]):XZ=>[x,z]);walk(points);walk([...points].reverse());
 },10000);
});
