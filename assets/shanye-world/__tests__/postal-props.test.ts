import {describe,expect,it} from 'vitest';
import {SOURCE_BUNDLES} from '../pipeline-sources.ts';
import {compilePipelineBundles} from '../pipeline-import.ts';
import {POSTAL_PROP_SOLIDS} from '../postal-prop-solids.ts';
import {INTERACTIONS,STATIC_OBSTACLES,resolveMove,terrainHeight,traceSegment,type Vec3} from '../world-layout.ts';
import {createTravelController} from '../../controller/travel-controller.ts';
import {EMPTY_INPUT} from '../../controller/types.ts';
import {nearestInteraction} from '../../entry/engine-helper.ts';

const bundle=SOURCE_BUNDLES.find(b=>b.id==='post-office')!;
const compiled=compilePipelineBundles([bundle]);
const ids=['post_signboard','postbox_start'];
const key=(id:string)=>`hero/post-office/${id.replaceAll('_','-')}`;
const inside=(id:string,p:readonly number[])=>POSTAL_PROP_SOLIDS.some(b=>b.entityId===id&&p.every((v,i)=>v>=b.min[i]!-1e-7&&v<=b.max[i]!+1e-7));
function worldVertices(id:string){
 const entity=compiled.entities[key(id)]!,mesh=compiled.resources[`mesh/${key(id)}`]!;
 if(mesh.kind!=='mesh'||!(mesh.attributes.position instanceof Float32Array))throw Error(id);
 const p=mesh.attributes.position,o=(entity.components.Transform as {pos:Vec3}).pos;
 return Array.from({length:p.length/3},(_,i)=>[p[i*3]!+o[0],p[i*3+1]!+o[1],p[i*3+2]!+o[2]] as Vec3);
}
function walk(points:readonly (readonly [number,number])[]){
 const first=points[0]!,c=createTravelController({spawn:[first[0],terrainHeight(...first),first[1]],terrainHeight,resolveMove,traceSegment});
 for(const target of points.slice(1)){
  let steps=0;
  while(Math.hypot(c.snapshot().position[0]-target[0],c.snapshot().position[2]-target[1])>.13&&steps++<600){
   const s=c.snapshot(),yaw=Math.atan2(target[0]-s.position[0],-(target[1]-s.position[2]));
   c.submitInput({...EMPTY_INPUT,vertical:1,lookActive:true,lookX:Math.atan2(Math.sin(yaw-s.yaw),Math.cos(yaw-s.yaw))/.0022});c.step(1/60);
  }
  expect(steps,`postal route blocked at ${c.snapshot().position} toward ${target}`).toBeLessThan(600);
 }
 return c.snapshot();
}

describe('adopted human-scale postal props',()=>{
 it('reduces the actual compiled silhouettes while keeping original world centres and postal anchors',()=>{
  for(const [id,height,width]of [['postbox_start',2.25,1.5],['post_signboard',2.5,2.25]] as const){
   const p=worldVertices(id),min=[0,1,2].map(a=>Math.min(...p.map(v=>v[a]!))),max=[0,1,2].map(a=>Math.max(...p.map(v=>v[a]!)));
   expect(min[1]).toBe(14);expect(max[1]!-min[1]!).toBe(height);expect(max[0]!-min[0]!).toBe(width);
   if(id==='postbox_start'){expect((min[0]!+max[0]!)/2).toBe(4.5);expect((min[2]!+max[2]!)/2).toBe(-231.5);}
  }
  expect(bundle.anchors.doorSource).toEqual([13,9.5,.5]);
  expect(bundle.anchors.frameCenterSource).toEqual([25.75,11.5,3]);
  expect(INTERACTIONS.find(i=>i.id==='post-mailbox')).toMatchObject({position:[4.5,14.08,-231.5],radius:3.5});
  expect(terrainHeight(9.60,-229.95)).toBeCloseTo(14.08);
 });

 it('has slot and postal-plate native faces on both sides, and two non-rectangular directional arrows',()=>{
  const mailbox=bundle.meshes.filter(m=>m.entityId==='postbox_start');
  for(const material of ['cream','dark']){
   const p=mailbox.find(m=>m.geometry.material.id===material)!.geometry.positions;
   expect(p.some((v,i)=>i%3===1&&v===8)).toBe(true);
   expect(p.some((v,i)=>i%3===1&&v===9)).toBe(true);
  }
  const sign=bundle.meshes.filter(m=>m.entityId==='post_signboard');
  for(const material of ['cream','red']){
   const p=sign.find(m=>m.geometry.material.id===material)!.geometry.positions;
   const levels=new Set(p.filter((_,i)=>i%3===2));
   expect(levels.size,`${material} lost stepped arrow silhouette`).toBeGreaterThanOrEqual(4);
  }
 });

 it('gives every real native surface exact occupied-voxel backing and adopts these solids for movement/camera',()=>{
  for(const id of ids){
   const mesh=compiled.resources[`mesh/${key(id)}`]!,entity=compiled.entities[key(id)]!;
   if(mesh.kind!=='mesh')throw Error(id);
   const p=mesh.attributes.position,n=mesh.attributes.normal,indices=mesh.indices,o=(entity.components.Transform as {pos:Vec3}).pos;
   if(!(p instanceof Float32Array)||!(n instanceof Float32Array)||!indices)throw Error('native arrays');
   for(let i=0;i<indices.length;i+=3){
    const start=indices[i]!*3,center=[0,1,2].map(a=>[0,1,2].reduce((sum,k)=>sum+p[indices[i+k]!*3+a]!,0)/3+o[a]!);
    expect(inside(id,center.map((v,a)=>v-n[start+a]!*.01)),`${id} face ${i} lacks solid`).toBe(true);
   }
  }
  expect(POSTAL_PROP_SOLIDS.length).toBeLessThanOrEqual(32);
  for(const solid of POSTAL_PROP_SOLIDS)expect(STATIC_OBSTACLES).toContainEqual(solid);
  // Above the new cap is genuinely open; the old 3.25m box must not remain as invisible collision.
  expect(traceSegment([2,16.75,-231.5],[7,16.75,-231.5]).hit).toBe(false);
  expect(traceSegment([2,15.5,-231.5],[7,15.5,-231.5]).obstacle).toMatch(/^postal-prop-postbox/);
 });

 it('preserves walking out through the gateway and reaching the letterbox from the visible path',()=>{
  walk([[9.75,-230.25],[9.75,-226],[0,-220],[-3,-225],[-3,-228]]);
  const front=walk([[9.75,-230.25],[8,-229],[4.5,-229]]);
  expect(nearestInteraction(front.position)).toBe('post-mailbox');
  walk([[4.5,-229],[6.5,-229],[6.5,-232],[8,-232],[9.75,-230.25]]);
 });
});
