import { describe, expect, it } from 'vitest';
import { buildWorldContent, pathMesh, propMesh, terrainChunk } from '../world.pack.ts';
import { WORLD_ENTITY_KEYS, WORLD_SCENE_SOURCE_KEY } from '../world-refs.ts';
import { SCENERY_PLACEMENTS, STATIC_OBSTACLES, PHOTO_ANCHORS, WORLD, terrainHeight, traceSegment, resolveMove } from '../world-layout.ts';
import { VoxelMesh } from '../voxel-mesh.ts';
import { createTravelController } from '../../controller/travel-controller.ts';
import { observePhoto } from '../../entry/engine-helper.ts';
import { createJourney, evaluateFrame } from '../../journey/index.ts';
import { DYNAMIC_PIVOTS } from '../pipeline-import.ts';
import { EMPTY_INPUT } from '../../controller/types.ts';
import { buildBackdropMesh, createBackdropGrid, BACKDROP_OUTER_EDGE } from '../backdrop-mesh.ts';
import { voxelHeight, pavedSurfaceHeight, terrainCellSize } from '../world-layout.ts';
import { onPostalLookout } from '../postal-lookout.ts';

describe('authored voxel world',()=>{
 it('blocks ordinary walking through the actual ridge south rails without filling the pavilion',()=>{
  const c=createTravelController({spawn:[0,96.5,235],initialYaw:0,terrainHeight,resolveMove,traceSegment});
  c.submitInput({...EMPTY_INPUT,vertical:1});for(let i=0;i<360;i++)c.step(1/60);
  // At x=0 the real post cap projects 0.25m farther inward than the horizontal rail.
  expect(c.snapshot().position[2]).toBeCloseTo(229.03,4);
  expect(c.snapshot().position[0]).toBeCloseTo(0,5);
  for(const y of[96.65,97.4]){
   const hit=traceSegment([0,y,230],[0,y,227],0);
   expect(hit.hit).toBe(true);expect(hit.obstacle).toMatch(/^ridge-railing-south-rail-/);
   expect(hit.point[2]).toBeCloseTo(228.5,5);
  }
  expect(STATIC_OBSTACLES.filter(b=>b.id.startsWith('ridge-railing-'))).toHaveLength(42);
 });
 it('walks both ridge openings and the scenic south-edge route with real railing, bench and pillar collision',()=>{
  const walk=(points:readonly (readonly [number,number,number])[])=>{
   const c=createTravelController({spawn:points[0]!,terrainHeight,resolveMove,traceSegment});
   for(const target of points.slice(1)){
    let steps=0;
    while(Math.hypot(c.snapshot().position[0]-target[0],c.snapshot().position[2]-target[2])>.18&&steps++<1800){
     const s=c.snapshot(),yaw=Math.atan2(target[0]-s.position[0],-(target[2]-s.position[2]));
     c.submitInput({...EMPTY_INPUT,vertical:1,lookActive:true,lookX:Math.atan2(Math.sin(yaw-s.yaw),Math.cos(yaw-s.yaw))/.0022});c.step(1/60);
    }
    expect(steps,`blocked at ${c.snapshot().position} before ${target}`).toBeLessThan(1800);
   }
  };
  walk([[0,96.5,235],[15,96,235],[15,96,226]]);
  walk([[20,96,226],[15,96,226],[15,96,235],[0,96.5,235]]);
  walk([[-20,96,228],[-15,96,228],[-15,96,235],[0,96.5,235]]);
  walk([[20,96,226],[0,95.58,200],[11.75,96,230.4]]);
  expect(traceSegment([20,97.1,226],[0,97.1,235],0).obstacle).toBe('ridge-pillar-103-70');
  expect(traceSegment([8,97.1,233],[0,97.1,233],0).obstacle).toMatch(/^ridge-bench-east-/);
  expect(traceSegment([-20,97.1,228],[0,97.1,235],0).obstacle).toMatch(/^ridge-bench-west-/);
  expect(traceSegment([5,97.2,240.5],[7,97.2,240.5],0).obstacle).toMatch(/^ridge-pillar-/);
 });
 it('closes the previously floating postal road edges with real vertical earth faces',()=>{
  const mesh=pathMesh(),earth=mesh.groups.get('earth')!;
  const contains=(p:readonly number[])=>{
   for(let i=0;i<earth.length;i+=3){
    const va=earth[i]!*8,vb=earth[i+1]!*8,vc=earth[i+2]!*8;if(Math.abs(mesh.vertices[va+4]!)>.001)continue;
    const a=mesh.vertices.slice(va,va+3),b=mesh.vertices.slice(vb,vb+3),c=mesh.vertices.slice(vc,vc+3),n=mesh.vertices.slice(va+3,va+6);
    const v0=b.map((v,k)=>v-a[k]!),v1=c.map((v,k)=>v-a[k]!),v2=p.map((v,k)=>v-a[k]!);
    const dot=(u:readonly number[],v:readonly number[])=>u.reduce((sum,x,k)=>sum+x*v[k]!,0);
    if(Math.abs(dot(v2,n))>1e-6)continue;
    const d00=dot(v0,v0),d01=dot(v0,v1),d11=dot(v1,v1),den=d00*d11-d01*d01;if(den<1e-12)continue;
    const u=(d11*dot(v2,v0)-d01*dot(v2,v1))/den,v=(d00*dot(v2,v1)-d01*dot(v2,v0))/den;
    if(u>=-1e-6&&v>=-1e-6&&u+v<=1+1e-6)return true;
   }return false;
  };
  const len=Math.hypot(35,28);
  for(const t of [.13,.31,.51,.73,.91])for(const sign of[-1,1]){
   const x=-35*t-28/len*1.42*sign,z=-220+28*t-35/len*1.42*sign,top=14+2*t+.055,ground=voxelHeight(x,z);
   expect(ground).toBeLessThan(top);
   expect(contains([x,(ground+top)*.5,z]),`unsealed road edge at ${x}, ${z}`).toBe(true);
  }
 });
 it('keeps landmark clearings grassy and grades visible shoulders to the real walking surface',()=>{
  const mesh=pathMesh();
  const surfaces=(x:number,z:number):{material:string;y:number}[]=>{
   const hits:{material:string;y:number}[]=[];
   for(const[material,indices]of mesh.groups)for(let i=0;i<indices.length;i+=3){
    const a=mesh.vertices.slice(indices[i]!*8,indices[i]!*8+3),b=mesh.vertices.slice(indices[i+1]!*8,indices[i+1]!*8+3),c=mesh.vertices.slice(indices[i+2]!*8,indices[i+2]!*8+3);
    const den=(b[2]!-c[2]!)*(a[0]!-c[0]!)+(c[0]!-b[0]!)*(a[2]!-c[2]!);if(Math.abs(den)<1e-8)continue;
    const u=((b[2]!-c[2]!)*(x-c[0]!)+(c[0]!-b[0]!)*(z-c[2]!))/den,v=((c[2]!-a[2]!)*(x-c[0]!)+(a[0]!-c[0]!)*(z-c[2]!))/den,w=1-u-v;
    if(u>=0&&v>=0&&w>=0)hits.push({material,y:u*a[1]!+v*b[1]!+w*c[1]!});
   }return hits;
  };
  for(const[x,z]of [[5,-230],[-181,-43],[8,215]])expect(surfaces(x!,z!).filter(s=>s.material==='path'||s.material==='rock-light')).toEqual([]);
  const length=Math.hypot(30,38),x=-50-38/length*2.2,z=-173-30/length*2.2,hits=surfaces(x,z);
  expect(hits.some(s=>s.material==='path')).toBe(false);expect(hits.some(s=>s.material==='grass')).toBe(false);
  expect(terrainHeight(x,z)-voxelHeight(x,z)).toBeCloseTo(.08,5); // Shoulder is solid terrain, not an interpolated floating sheet.
  const flower=propMesh('flower');let top=0;for(let i=1;i<flower.vertices.length;i+=8)top=Math.max(top,flower.vertices[i]!);expect(top).toBeLessThan(.3);
 });
 it('renders postal shoulders at the same sampled height used by feet, including voxel/landmark boundaries',()=>{
  let tested=0;
  for(let z=-248;z<=-190;z+=.5)for(let x=-28;x<=30;x+=.5){
   if(Number.isFinite(pavedSurfaceHeight(x,z))||onPostalLookout(x,z))continue;
   expect(terrainHeight(x,z)-voxelHeight(x,z)).toBeCloseTo(.08,5);tested++;
  }
  expect(tested).toBeGreaterThan(10000);expect(terrainCellSize(10,-216)).toBe(1);expect(terrainCellSize(398,398)).toBe(4);
  expect(terrainHeight(WORLD.spawn[0],WORLD.spawn[2])).toBeCloseTo(WORLD.spawn[1],5);
  expect(terrainHeight(-170,-49.5)).toBeCloseTo(38.08,5);expect(terrainHeight(155,-6)).toBeCloseTo(24.08,5);expect(terrainHeight(-48,-186)).toBeCloseTo(16.08,5);
  const mesh=terrainChunk(0,-300);let topFaces=0;
  for(let i=0;i<mesh.vertices.length;i+=32){
   if(mesh.vertices[i]===mesh.vertices[i+16] || mesh.vertices[i+2]===mesh.vertices[i+18])continue;
   const x=(mesh.vertices[i]!+mesh.vertices[i+16]!)*.5,z=(mesh.vertices[i+2]!+mesh.vertices[i+18]!)*.5;
   expect((mesh.vertices[i+1]!+mesh.vertices[i+17]!)/2).toBeCloseTo(voxelHeight(x,z),5);topFaces++;
  }
  expect(topFaces).toBeGreaterThan(625);
 });
 it('groups trees into groves without increasing the previously rendered tree count',()=>{
  const trees=SCENERY_PLACEMENTS.filter(p=>p.kind.startsWith('tree'));expect(trees.length).toBeLessThan(1832);expect(trees.length).toBeGreaterThan(600);
  const counts:number[]=[];for(let z=-350;z<350;z+=70)for(let x=-350;x<350;x+=70)counts.push(trees.filter(t=>t.x>=x&&t.x<x+70&&t.z>=z&&t.z<z+70).length);
  expect(counts.filter(n=>n<=2).length).toBeGreaterThan(12);expect(Math.max(...counts)).toBeGreaterThan(15);
 });
 it('closes all four backdrop seams at exact terrain heights without overlapping the playable world',()=>{
  const grid=createBackdropGrid();
  for(let p=-398;p<400;p+=4){
   expect(grid.heightAt(p,402)).toBe(voxelHeight(p,398));expect(grid.heightAt(p,-402)).toBe(voxelHeight(p,-398));
   expect(grid.heightAt(402,p)).toBe(voxelHeight(398,p));expect(grid.heightAt(-402,p)).toBe(voxelHeight(-398,p));
  }
  // Exact tiling area and aligned disjoint cell bands exclude horizontal voids or overlapping rings.
  expect(grid.columns.reduce((sum,c)=>sum+c.size*c.size,0)).toBe((BACKDROP_OUTER_EDGE*2)**2-800**2);
  for(const c of grid.columns){expect(Number.isFinite(c.height)).toBe(true);expect(Math.max(Math.abs(c.x+c.size/2),Math.abs(c.z+c.size/2))).toBeGreaterThanOrEqual(400);}
  const mesh=buildBackdropMesh();expect(mesh.triangleCount).toBeLessThan(55000);
  expect(mesh.triangleCount).toBeLessThan(grid.columns.length*12); // No full-box internal or bottom faces.
 });
 it('emits outward-wound faces instead of inverted hidden surfaces',()=>{
  const mesh=new VoxelMesh();mesh.box([0,0,0],[2,2,2],'stone');expect(mesh.triangleCount).toBe(12);
  for(const indices of mesh.groups.values())for(let i=0;i<indices.length;i+=3){
   const va=indices[i]!*8,vb=indices[i+1]!*8,vc=indices[i+2]!*8,a=mesh.vertices.slice(va,va+3),b=mesh.vertices.slice(vb,vb+3),c=mesh.vertices.slice(vc,vc+3),n=mesh.vertices.slice(va+3,va+6);
   const ab=b.map((v,k)=>v-a[k]!),ac=c.map((v,k)=>v-a[k]!);
   expect((ab[1]!*ac[2]!-ab[2]!*ac[1]!)*n[0]!+(ab[2]!*ac[0]!-ab[0]!*ac[2]!)*n[1]!+(ab[0]!*ac[1]!-ab[1]!*ac[0]!)*n[2]!).toBeGreaterThan(0);
  }
 });
 it('keeps actual foot tracks, tree collision, and cable clearance in one coordinate system',()=>{
  expect(SCENERY_PLACEMENTS.filter(p=>p.kind.startsWith('tree')).length).toBeGreaterThan(600);
  expect(STATIC_OBSTACLES.some(p=>p.id.startsWith('scenery-'))).toBe(true);
  const line=[WORLD.zipline.start,...WORLD.zipline.points,WORLD.zipline.end];
  for(let k=1;k<line.length;k++)for(let i=0;i<=120;i++){
   const a=line[k-1]!,b=line[k]!,t=i/120,x=a[0]+(b[0]-a[0])*t,y=a[1]+(b[1]-a[1])*t,z=a[2]+(b[2]-a[2])*t;
   expect(y-terrainHeight(x,z)).toBeGreaterThan(0);
  }
  expect(traceSegment([155,26,0],[155,26,15]).hit).toBe(false); // The stone arch's opening remains an opening.
 });
 it('walks from the real zipline landing through its visible return path onto the main postal route',()=>{
  const c=createTravelController({spawn:WORLD.zipline.start,terrainHeight,resolveMove,traceSegment});
  expect(c.startZipline(WORLD.zipline)).toBe(true);for(let i=0;i<1800&&c.snapshot().mode==='zipline';i++)c.step(1/60);
  expect(c.snapshot().mode).toBe('walk');expect(c.snapshot().position[0]).toBe(WORLD.zipline.end[0]);
  c.submitInput({...EMPTY_INPUT});
  for(const target of [[-42,16.08,-187],[-35,16.08,-192]]as const){
   let steps=0;
   while(Math.hypot(c.snapshot().position[0]-target[0],c.snapshot().position[2]-target[2])>.18&&steps++<1000){
    const s=c.snapshot(),yaw=Math.atan2(target[0]-s.position[0],-(target[2]-s.position[2]));
    c.submitInput({...EMPTY_INPUT,vertical:1,lookActive:true,lookX:Math.atan2(Math.sin(yaw-s.yaw),Math.cos(yaw-s.yaw))/.0022});c.step(1/60);
   }
   expect(steps,`blocked at ${c.snapshot().position}`).toBeLessThan(1000);
   expect(c.snapshot().position[1]).toBeCloseTo(terrainHeight(c.snapshot().position[0],c.snapshot().position[2]),4);
  }
 });
 it('opens the real postal view and keeps both postcard puzzles possible after visual changes',()=>{
  const eye=[9.60,17,-236.45] as const;
  for(const target of [[-170,53.25,-25],[155,33.25,20],[0,103,235]] as const)expect(traceSegment(eye,target,0).hit).toBe(false);
  expect(DYNAMIC_PIVOTS['hero/forest-windmill/windmill-sails']).toEqual(PHOTO_ANCHORS.forest.anchors.windmill.position);
  const state=createJourney();state.durable.gateOpened=true;
  for(const id of ['forest','town'] as const){
   const a=PHOTO_ANCHORS[id],eye=a.view,target=a.target,dx=target[0]-eye[0],dz=target[2]-eye[2];
   const controller=createTravelController({spawn:[eye[0],0,eye[2]],terrainHeight,resolveMove,traceSegment,initialYaw:Math.atan2(dx,-dz),initialPitch:-Math.atan2(target[1]-eye[1],Math.hypot(dx,dz))});
   controller.toggleCamera();expect(evaluateFrame(state,observePhoto(controller.snapshot()),id).matched,id).toBe(true);
  }
 });
 it('builds the final native scene with every dynamic rig reference and a bounded number of carriers',()=>{
  const resources=buildWorldContent(),scene=resources[WORLD_SCENE_SOURCE_KEY];expect(scene?.kind).toBe('scene');if(scene?.kind!=='scene')throw Error('scene missing');
  for(const key of Object.values(WORLD_ENTITY_KEYS))expect(scene.entities[key],key).toBeDefined();
  const names=Object.keys(scene.entities);expect(names.length).toBeLessThan(500);expect(names.filter(k=>k.startsWith('terrain/')).length).toBe(64);
  expect(scene.entities['props/sunset-bench']?.components.MeshFilter).toEqual(scene.entities['hero/post-office/post-bench']?.components.MeshFilter);
  expect(scene.entities['props/sunset-bench']?.components.Transform).toEqual({pos:[64.25,83.5,210],quat:[0,1,0,0],scale:[.6,.4,.5]});
  expect(names.filter(k=>k.startsWith('hero/')).length).toBeGreaterThanOrEqual(38);
  expect(names.filter(k=>k.startsWith('hero/')).length).toBeLessThan(52);
  expect(Object.values(scene.entities).filter(e=>e.components.Instances).length).toBeGreaterThan(120);
  for(const key of Object.keys(resources))expect(key).toMatch(/^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)*$/);
 });
});
