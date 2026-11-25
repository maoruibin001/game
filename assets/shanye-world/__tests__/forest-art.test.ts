import { describe, expect, it } from 'vitest';
import type { MeshAsset } from '@forgeax/engine/types';
import { add, cross, dot, normalize, projectPoint, subtract } from '../../controller/geometry.ts';
import type { Vec3 } from '../../controller/types.ts';
import { applyForestWindmillArt, forestRotorMesh, forestTowerTimberMesh, FOREST_ROTOR_KEY, FOREST_ROTOR_REST_PHASE, FOREST_TIMBER_KEY } from '../forest-art.ts';
import { FOREST_FRAME_BOXES, detailObstacles } from '../scene-details.ts';
import { FOREST_CHIME, FOREST_PHOTO_STATION } from '../forest-composition.ts';
import { compilePipelineBundles, DYNAMIC_PIVOTS } from '../pipeline-import.ts';
import { SOURCE_BUNDLES } from '../pipeline-sources.ts';
import { WINDMILL_TOWER_SHAPE } from '../windmill-profile.ts';
import { worldAsset, worldGuidText } from '../world-refs.ts';
import { buildWorldContent, detailMesh } from '../world.pack.ts';

const material=(name:string)=>worldAsset(`material/${name}`);
const rotate=(p:Vec3,angle:number):Vec3=>[p[0]*Math.cos(angle)-p[1]*Math.sin(angle),p[0]*Math.sin(angle)+p[1]*Math.cos(angle),p[2]];
function native(mesh:MeshAsset){
 const positions=mesh.attributes.position,normals=mesh.attributes.normal,indices=mesh.indices;
 if(!(positions instanceof Float32Array)||!(normals instanceof Float32Array)||!indices)throw Error('Missing actual native arrays');
 const vertex=(i:number):Vec3=>[positions[i*3]!,positions[i*3+1]!,positions[i*3+2]!];
 return{positions,normals,indices,vertex};
}
function rayMaterial(mesh:MeshAsset,from:Vec3,to:Vec3):string|undefined{
 const {indices,vertex}=native(mesh),direction=subtract(to,from);let first=Infinity,material:string|undefined;
 for(const sub of mesh.submeshes)for(let i=sub.indexOffset;i<sub.indexOffset+sub.indexCount;i+=3){
  const a=vertex(indices[i]!),b=vertex(indices[i+1]!),c=vertex(indices[i+2]!),e1=subtract(b,a),e2=subtract(c,a),h=cross(direction,e2),det=dot(e1,h);
  if(Math.abs(det)<1e-8)continue;
  const f=1/det,s=subtract(from,a),u=f*dot(s,h);if(u<0||u>1)continue;
  const q=cross(s,e1),v=f*dot(direction,q);if(v<0||u+v>1)continue;
  const t=f*dot(e2,q);if(t>=0&&t<=1&&t<first){first=t;material=mesh.materialSlots[sub.materialSlot]!.slotName;}
 }
 return material;
}
const frame=detailObstacles(FOREST_FRAME_BOXES.filter(b=>b.id.startsWith('forest-chime-')));
function frameHit(from:Vec3,to:Vec3):string|undefined{
 for(const box of frame){
  let near=0,far=1;
  for(let axis=0;axis<3;axis++){
   const d=to[axis]!-from[axis]!;
   if(Math.abs(d)<1e-8){if(from[axis]!<box.min[axis]!||from[axis]!>box.max[axis]!)near=2;continue;}
   const a=(box.min[axis]!-from[axis]!)/d,b=(box.max[axis]!-from[axis]!)/d;
   near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));
  }
  if(near<=far&&near<1&&far>0)return box.id;
 }
 return undefined;
}

describe('forest structural art replacement',()=>{
 it('hits the actual bronze triangles at the photographic subject rather than empty air',()=>{
  const mesh=detailMesh(FOREST_FRAME_BOXES).build(material);
  for(const [x,z] of [[-171,-52],[-173,-52],[-169,-52],[-171,-50],[-171,-54]])
   expect(rayMaterial(mesh,[x!,39.72,z!],FOREST_CHIME.position)).toMatch(/^gold/);
 });
 it('is adopted by the actual world pack output rather than only an isolated helper',()=>{
  const world=buildWorldContent(),mesh=world[`mesh/${FOREST_ROTOR_KEY}`],timber=world[`mesh/${FOREST_TIMBER_KEY}`];
  if(mesh?.kind!=='mesh'||timber?.kind!=='mesh')throw Error('Forest art is not wired into the playable world pack');
  expect(mesh.attributes.position).toEqual(forestRotorMesh().build(material).attributes.position);
  expect(timber.attributes.position).toEqual(forestTowerTimberMesh().build(material).attributes.position);
 });
 it('replaces the actual source rotor mesh and preserves its authoritative dynamic transform and curtain',()=>{
  const compiled=compilePipelineBundles(SOURCE_BUNDLES.filter(b=>b.id==='forest-windmill'));
  const oldMesh=compiled.resources[`mesh/${FOREST_ROTOR_KEY}`],transform=structuredClone(compiled.entities[FOREST_ROTOR_KEY]!.components.Transform);
  const curtain=structuredClone(compiled.entities['hero/forest-windmill/windmill-curtain']);
  applyForestWindmillArt(compiled.resources,compiled.entities);
  expect(compiled.resources[`mesh/${FOREST_ROTOR_KEY}`]).not.toBe(oldMesh);
  expect(compiled.entities[FOREST_ROTOR_KEY]!.components.Transform).toEqual(transform);
  expect(transform!.pos).toEqual(DYNAMIC_PIVOTS[FOREST_ROTOR_KEY]);
  expect(compiled.entities[FOREST_ROTOR_KEY]!.components.MeshFilter!.assetHandle).toBe(worldGuidText(`mesh/${FOREST_ROTOR_KEY}`));
  expect(compiled.entities['hero/forest-windmill/windmill-curtain']).toEqual(curtain);
  expect(compiled.entities[FOREST_TIMBER_KEY]).toBeDefined();
  expect(Object.keys(compiled.entities).filter(k=>k.endsWith('/windmill-sails'))).toHaveLength(1);
 });

 it('retains the real near-13.5m sweep, with physical sky gaps and canvas carried by ribs',()=>{
  const mesh=forestRotorMesh().build(material),{positions,vertex}=native(mesh);
  const radii=Array.from({length:positions.length/3},(_,i)=>Math.hypot(vertex(i)[0],vertex(i)[1]));
  expect(Math.max(...radii)).toBeGreaterThan(6.7);
  expect(Math.max(...radii)).toBeLessThanOrEqual(6.75);
  const ray=(x:number,y:number)=>rayMaterial(mesh,rotate([x,y,-2],FOREST_ROTOR_REST_PHASE),rotate([x,y,3],FOREST_ROTOR_REST_PHASE));
  expect(ray(.84,3.05)).toBe('cream');
  expect(ray(1.25,3.7)).toBeUndefined(); // Actual empty lattice space, not alpha or a painted dark panel.
  expect(ray(0,6.7)).toBe('wood');
 });

 it('keeps the visible tower additions inside the existing solid tower envelope',()=>{
  const {positions,vertex}=native(forestTowerTimberMesh().build(material));
  for(let i=0;i<positions.length/3;i++)for(let axis=0;axis<3;axis++){
   expect(vertex(i)[axis]).toBeGreaterThanOrEqual(WINDMILL_TOWER_SHAPE.min[axis]!-1e-5);
   expect(vertex(i)[axis]).toBeLessThanOrEqual(WINDMILL_TOWER_SHAPE.max[axis]!+1e-5);
  }
 });

 it('emits finite outward-facing triangles for the rotating and static meshes',()=>{
  for(const mesh of [forestRotorMesh().build(material),forestTowerTimberMesh().build(material)]){
   const {positions,normals,indices,vertex}=native(mesh);
   expect(Array.from(positions).every(Number.isFinite)).toBe(true);
   for(let i=0;i<indices.length;i+=3){
    const a=indices[i]!,normal:Vec3=[normals[a*3]!,normals[a*3+1]!,normals[a*3+2]!];
    expect(dot(cross(subtract(vertex(indices[i+1]!),vertex(a)),subtract(vertex(indices[i+2]!),vertex(a))),normal)).toBeGreaterThan(0);
   }
  }
 });

 it('keeps the actual rotor clear of the roadside chime across a complete animation cycle',()=>{
  const mesh=forestRotorMesh().build(material),{positions,vertex}=native(mesh),pivot=DYNAMIC_PIVOTS[FOREST_ROTOR_KEY]!;
  const camera={position:[-171,39.72,-52] as Vec3,forward:normalize(subtract(FOREST_PHOTO_STATION.target,[-171,39.72,-52])),up:[0,1,0] as Vec3,verticalFovRadians:Math.PI/3,aspect:16/9};
  for(let phase=0;phase<16;phase++){
   let blocked=0,total=0;
   for(let i=0;i<positions.length/3;i++){
    const p=add(pivot,rotate(vertex(i),phase*Math.PI/8)),projected=projectPoint(camera,p);
    expect(projected.x).toBeGreaterThan(0);expect(projected.x).toBeLessThan(1);
    expect(projected.y).toBeGreaterThan(0);expect(projected.y).toBeLessThan(1);
    if(frameHit(camera.position,p))blocked++;total++;
   }
   expect(blocked/total,`frame masks the rotor at phase ${phase}`).toBeLessThan(.03);
  }
 });
});
