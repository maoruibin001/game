import {describe,expect,it} from 'vitest';
import {STATIC_OBSTACLES,terrainCellSize,terrainHeight,voxelHeight,resolveMove,traceSegment,type Vec3} from '../world-layout.ts';
import {terrainChunk} from '../world.pack.ts';
import {createTravelController} from '../../controller/travel-controller.ts';
import {EMPTY_INPUT} from '../../controller/types.ts';

const feet=(x:number,z:number):Vec3=>[x,terrainHeight(x,z),z];
function walk(points:readonly Vec3[]):void{
 const c=createTravelController({spawn:points[0]!,terrainHeight,resolveMove,traceSegment});
 for(const target of points.slice(1)){
  let frames=0;
  while(Math.hypot(c.snapshot().position[0]-target[0],c.snapshot().position[2]-target[2])>.15&&frames++<600){
   const s=c.snapshot(),yaw=Math.atan2(target[0]-s.position[0],-(target[2]-s.position[2]));
   c.submitInput({...EMPTY_INPUT,vertical:1,lookActive:true,lookX:Math.atan2(Math.sin(yaw-s.yaw),Math.cos(yaw-s.yaw))/.0022});c.step(1/60);
  }
  expect(frames,`stopped at ${c.snapshot().position} before ${target}`).toBeLessThan(600);
 }
}

describe('east-house backlane ground',()=>{
 it('replaces the reproduced two- and three-metre road-boundary cliffs with ordinary steps',()=>{
  // Expert feet coordinates were not recorded. These are source-reproduced cliffs
  // in the same rear-lane risk area, not a claim to replay that exact screenshot.
  for(const [x,z]of [[173,31.5],[177,32.5]]){
   expect(terrainCellSize(x!,z!)).toBe(1);
   expect(Math.abs(terrainHeight(x!,z!+.51)-terrainHeight(x!,z!))).toBeLessThan(.72);
  }
  let checked=0;
  for(let z=15;z<=37;z+=.5)for(let x=159;x<=181;x+=.5){
   const y=terrainHeight(x,z);
   if(STATIC_OBSTACLES.some(b=>x+.28>b.min[0]&&x-.28<b.max[0]&&z+.28>b.min[2]&&z-.28<b.max[2]&&y+1.72>b.min[1]&&y<b.max[1]))continue;
   for(const [dx,dz]of [[.51,0],[-.51,0],[0,.51],[0,-.51]]){
    expect(terrainHeight(x+dx!,z+dz!)-y,`backlane riser ${x},${z} toward ${dx},${dz}`).toBeLessThan(.72);checked++;
   }
  }
  expect(checked).toBeGreaterThan(5000);
 });
 it('walks out of the rear-wall corner and the two reproduced drop zones in both directions without rescue',()=>{
  const points=[[176,26],[170.5,25.5],[173,31.5],[177,32.5],[177,34.5],[173,34.5],[168,29],[166,31]].map(([x,z])=>feet(x!,z!));
  walk(points);walk([...points].reverse());
 });
 it('keeps the ordinary open-gate approach, risk-point loop and side/rear viewing positions walkable',()=>{
  const points=[[148,5],[155,5],[155,20],[166,31],[168,29],[172,27],[176,26],
   [170.5,25.5],[173,31.5],[173,32.01],[177,32.5],[177,33.01],[176,26],
   [176,29],[176,26],[176,23],[175,19]].map(([x,z])=>feet(x!,z!));
  walk(points);walk([...points].reverse());
 });
 it('uses the same real solid terrain column tops for rendering and the repaired off-road feet',()=>{
  const mesh=terrainChunk(100,0);let checked=0;
  for(let i=0;i<mesh.vertices.length;i+=32){
   if(mesh.vertices[i+4]!==1)continue;
   const x=(mesh.vertices[i]!+mesh.vertices[i+16]!)*.5,z=(mesh.vertices[i+2]!+mesh.vertices[i+18]!)*.5;
   if(x<159||x>181||z<15||z>37)continue;
   expect(mesh.vertices[i+1]).toBe(voxelHeight(x,z));checked++;
  }
  expect(checked).toBeGreaterThan(450);
  for(const [x,z]of [[170.5,25.5],[173,31.5],[177,32.5]])expect(terrainHeight(x!,z!)-voxelHeight(x!,z!)).toBeCloseTo(.08,6);
 });
});
