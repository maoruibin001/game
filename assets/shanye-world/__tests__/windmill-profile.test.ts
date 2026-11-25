import {describe,expect,it} from 'vitest';
import {compilePipelineBundles,DYNAMIC_PIVOTS} from '../pipeline-import.ts';
import {SOURCE_BUNDLES} from '../pipeline-sources.ts';
import {WINDMILL_TOWER_SHAPE} from '../windmill-profile.ts';
import {PHOTO_ANCHORS,SCENERY_PLACEMENTS,STATIC_OBSTACLES,roadSample,terrainHeight} from '../world-layout.ts';

describe('valley landmark silhouette repair',()=>{
 it('keeps the original sole rotor and base, with a solid outward-wound tower ending at its axle',()=>{
  const bundle=SOURCE_BUNDLES.find(b=>b.id==='forest-windmill')!,compiled=compilePipelineBundles([bundle]);
  const key='hero/forest-windmill/windmill-tower',mesh=compiled.resources[`mesh/${key}`];
  if(mesh?.kind!=='mesh')throw Error('native tower mesh missing');
  const positions=mesh.attributes.position!,normals=mesh.attributes.normal!,indices=mesh.indices,origin=(compiled.entities[key]!.components.Transform as {pos:number[]}).pos;
  if(!(positions instanceof Float32Array)||!(normals instanceof Float32Array)||!indices)throw Error('native arrays missing');
  const source=bundle.meshes.filter(m=>m.entityId==='windmill_tower').flatMap(m=>m.geometry.positions);
  const bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
  for(let i=0;i<positions.length;i+=3){
   for(let axis=0;axis<3;axis++){const v=positions[i+axis]!+origin[axis]!;bounds.min[axis]=Math.min(bounds.min[axis]!,v);bounds.max[axis]=Math.max(bounds.max[axis]!,v);}
   const sourceY=source[i+2]!-bundle.pivotSourceMeters[2]!+bundle.worldAnchorEngine[1]!;
   if(sourceY<=39.5)expect(positions[i+1]!+origin[1]!).toBe(sourceY);
  }
  expect(bounds).toEqual({min:[...WINDMILL_TOWER_SHAPE.min],max:[...WINDMILL_TOWER_SHAPE.max]});
  expect(bounds.max[1]).toBe(DYNAMIC_PIVOTS['hero/forest-windmill/windmill-sails']![1]);
  for(let i=0;i<indices.length;i+=3){
   const a=indices[i]!*3,b=indices[i+1]!*3,c=indices[i+2]!*3;
   const ab=[0,1,2].map(k=>positions[b+k]!-positions[a+k]!),ac=[0,1,2].map(k=>positions[c+k]!-positions[a+k]!);
   const dot=(ab[1]!*ac[2]!-ab[2]!*ac[1]!)*normals[a]!+(ab[2]!*ac[0]!-ab[0]!*ac[2]!)*normals[a+1]!+(ab[0]!*ac[1]!-ab[1]!*ac[0]!)*normals[a+2]!;
   expect(dot,'tower has inverted or collapsed triangles').toBeGreaterThan(0);
  }
  const sailKey='hero/forest-windmill/windmill-sails',sails=compiled.resources[`mesh/${sailKey}`];
  if(sails?.kind!=='mesh')throw Error('native sails missing');
  const pivot=DYNAMIC_PIVOTS[sailKey]!,native=sails.attributes.position!;
  if(!(native instanceof Float32Array))throw Error('native rotor positions missing');
  const raw=bundle.meshes.filter(m=>m.entityId==='windmill_sails').flatMap(m=>m.geometry.positions);
  for(let i=0;i<raw.length;i+=3){
   expect(native[i]!+pivot[0]).toBe(raw[i]!-bundle.pivotSourceMeters[0]!+bundle.worldAnchorEngine[0]!);
   expect(native[i+1]!+pivot[1]).toBe(raw[i+2]!-bundle.pivotSourceMeters[2]!+bundle.worldAnchorEngine[1]!);
   expect(native[i+2]!+pivot[2]).toBe(-(raw[i+1]!-bundle.pivotSourceMeters[1]!)+bundle.worldAnchorEngine[2]!-8.5);
  }
  expect(PHOTO_ANCHORS.valley.anchors.windmill.position).toEqual(WINDMILL_TOWER_SHAPE.position);
  expect(STATIC_OBSTACLES.find(b=>b.id==='windmill-tower')?.max).toEqual(WINDMILL_TOWER_SHAPE.max);
 });
 it('moves the single blocking crown and its trunk together into an existing empty part of the grove',()=>{
  const tree=SCENERY_PLACEMENTS[1608]!,collider=STATIC_OBSTACLES.find(b=>b.id==='scenery-1608')!;
  expect([tree.x,tree.z]).toEqual([166,88]);expect(tree.kind).toBe('tree-leaf');
  expect((collider.min[0]+collider.max[0])/2).toBe(tree.x);expect((collider.min[2]+collider.max[2])/2).toBe(tree.z);
  expect(collider.min[1]).toBe(terrainHeight(tree.x,tree.z));expect(roadSample(tree.x,tree.z).distance).toBeGreaterThan(30);
  const nearest=SCENERY_PLACEMENTS.filter((p,i)=>i!==1608&&p.kind.startsWith('tree')).map(p=>Math.hypot(p.x-tree.x,p.z-tree.z));
  expect(Math.min(...nearest)).toBeGreaterThan(20);
 });
});
