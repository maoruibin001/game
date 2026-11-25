import {describe,expect,it} from 'vitest';
import {appendHeroMountain,HERO_MOUNTAIN_BOXES,HERO_MOUNTAIN_BOUNDS,HERO_MOUNTAIN_PHOTO_ANCHOR,HERO_MOUNTAIN_SUMMITS} from '../hero-mountain.ts';
import {STATIC_OBSTACLES,PHOTO_ANCHORS,terrainHeight,voxelHeight,traceSegment,type Vec3} from '../world-layout.ts';
import {VoxelMesh} from '../voxel-mesh.ts';
import {SOURCE_BUNDLES} from '../pipeline-sources.ts';
import {compilePipelineBundles} from '../pipeline-import.ts';
import {subtract,cross,dot} from '../../controller/geometry.ts';
import {createTravelController} from '../../controller/travel-controller.ts';
import {observePhoto} from '../../entry/engine-helper.ts';
import {createJourney} from '../../journey/journey.ts';
import {evaluateFrame} from '../../journey/photography.ts';
import {DEFAULT_PHOTOGRAPHY} from '../../shared/photography-contract.ts';

// Use the rendered native triangles, including the arch thickness, projecting key and roof.
const arch=compilePipelineBundles(SOURCE_BUNDLES.filter(b=>b.id==='town-street').map(b=>({...b,meshes:b.meshes.filter(m=>m.entityId==='town_arch'||m.entityId==='town_street_details')})));
const archTriangles:Vec3[][]=[];
for(const[key,entity]of Object.entries(arch.entities)){
 const mesh=arch.resources[`mesh/${key}`];if(mesh?.kind!=='mesh'||!(mesh.attributes.position instanceof Float32Array)||!mesh.indices)throw Error('native arch missing');
 const p=mesh.attributes.position,o=(entity.components.Transform as {pos:Vec3}).pos;
 for(let i=0;i<mesh.indices.length;i+=3)archTriangles.push([0,1,2].map(k=>{const v=mesh.indices![i+k]!*3;return[p[v]!+o[0],p[v+1]!+o[1],p[v+2]!+o[2]] as Vec3;}));
}
function archHit(from:Vec3,to:Vec3):boolean{
 const direction=subtract(to,from);
 for(const[a,b,c]of archTriangles){
  const e1=subtract(b!,a!),e2=subtract(c!,a!),h=cross(direction,e2),det=dot(e1,h);if(Math.abs(det)<1e-8)continue;
  const inv=1/det,s=subtract(from,a!),u=inv*dot(s,h);if(u<0||u>1)continue;
  const q=cross(s,e1),v=inv*dot(direction,q);if(v<0||u+v>1)continue;
  const t=inv*dot(e2,q);if(t>0&&t<1)return true;
 }
 return false;
}

describe('town photograph mountain',()=>{
 it('uses the same solid for every visible outer face and collision without moving the photo anchor',()=>{
  const mesh=new VoxelMesh(),stats=appendHeroMountain(mesh),boxes=STATIC_OBSTACLES.filter(b=>b.id.startsWith('distant-crag-'));
  const inside=(p:Vec3)=>boxes.some(b=>p.every((v,i)=>v>=b.min[i]!&&v<=b.max[i]!));
  expect(stats.triangles).toBe(528);expect(boxes).toHaveLength(34);
  expect(PHOTO_ANCHORS.town.anchors.mountain.position).toEqual(HERO_MOUNTAIN_PHOTO_ANCHOR);
  expect(inside(HERO_MOUNTAIN_PHOTO_ANCHOR)).toBe(true);
  for(let i=0;i<mesh.vertices.length;i+=32){
   const center=[0,1,2].map(axis=>[0,8,16,24].reduce((sum,offset)=>sum+mesh.vertices[i+offset+axis]!,0)/4);
   const normal=mesh.vertices.slice(i+3,i+6);
   const inward=center.map((v,axis)=>v-normal[axis]!*.01) as unknown as Vec3,outward=center.map((v,axis)=>v+normal[axis]!*.01) as unknown as Vec3;
   expect(inside(inward),`visible face has no solid behind it at ${center}`).toBe(true);
   expect(inside(outward),`hidden/internal face emitted at ${center}`).toBe(false);
  }
 });
 it('keeps lower shoulders and the scoring point while raising only the actual twin summits',()=>{
  const highest=Math.max(...HERO_MOUNTAIN_BOXES.map(b=>b.center[1]+b.size[1]/2));
  expect(highest).toBe(118.5);expect(HERO_MOUNTAIN_BOUNDS.max[1]).toBe(highest);
  const anchorBox=STATIC_OBSTACLES.find(b=>b.id==='distant-crag-16')!;
  expect(anchorBox.min[1]).toBe(95);expect(anchorBox.max[1]).toBe(97);
  expect(PHOTO_ANCHORS.town.anchors.mountain.position).toEqual([154,96,268]);
  expect(HERO_MOUNTAIN_BOXES.filter(b=>b.center[0]<150).reduce((top,b)=>Math.max(top,b.center[1]+b.size[1]/2),0)).toBe(110.75);
 });
 it('clears the complete thick arch with both real summit caps across small ordinary walking offsets',()=>{
  const peaks=HERO_MOUNTAIN_SUMMITS;
  const journey=createJourney();journey.durable.gateOpened=true;
  // This is the measured full-cap opening, not a claim that the stone arch
  // permits the same view from every point in the broader photograph zone.
  for(const x of [154.8,155,155.2])for(const z of [-3.15,-3,-2.85]){
   const eye:Vec3=[x,terrainHeight(x,z)+1.64,z];
   for(const peak of peaks){
    // All eight cap corners, not just one high anchor, must pass the physical opening.
    for(const sx of[-1,1])for(const sy of[-1,1])for(const sz of[-1,1]){
     const point:Vec3=[peak.center[0]+sx*peak.size[0]/2,peak.center[1]+sy*peak.size[1]/2,peak.center[2]+sz*peak.size[2]/2];
     expect(archHit(eye,point),`arch clips summit at ${eye} -> ${point}`).toBe(false);
    }
    const front:Vec3=[peak.center[0],peak.center[1]+peak.size[1]/2-.05,peak.center[2]-peak.size[2]/2+.02];
    const first=traceSegment(eye,front,0);
    expect(first.obstacle).toMatch(/^distant-crag-/);
    expect(Math.hypot(...subtract(first.point,front)),'near mountain shoulder must not hide the actual summit face').toBeLessThan(.1);
    let horizon=-Infinity;
    for(let depth=12;depth<244;depth+=.5){const px=x+(front[0]-x)*(depth-z)/(front[2]-z);horizon=Math.max(horizon,(voxelHeight(px,depth)-eye[1])/(depth-z));}
    expect(front[1]-(eye[1]+horizon*(front[2]-z)),'at least 15m of real peak should rise above the road shoulder').toBeGreaterThan(15);
   }
   const target=PHOTO_ANCHORS.town.target,dx=target[0]-x,dz=target[2]-z;
   const controller=createTravelController({spawn:[x,terrainHeight(x,z),z],terrainHeight,traceSegment,initialYaw:Math.atan2(dx,-dz),initialPitch:-Math.atan2(target[1]-eye[1],Math.hypot(dx,dz))});
   controller.toggleCamera();
   expect(evaluateFrame(journey,observePhoto(controller.snapshot()),'town').matched,`normal 60-degree framing at ${x},${z}`).toBe(true);
   controller.configurePhotography({...DEFAULT_PHOTOGRAPHY,lens:'standard'});
   expect(evaluateFrame(journey,observePhoto(controller.snapshot()),'town').matched,`standard lens at ${x},${z}`).toBe(true);
   // This ray passes between both actual silhouettes below their summits.
   const saddle:Vec3=[154,102,285];
   expect(archHit(eye,saddle)).toBe(false);
   expect(traceSegment(eye,saddle,0).hit).toBe(false);
  }
  // The previous -6m view remains a legitimate place to stand, but its upper arch now masks tall tips.
  const oldEye:Vec3=[155,25.72,-6];
  expect(peaks.some(p=>archHit(oldEye,[p.center[0],p.center[1]+p.size[1]/2,p.center[2]-p.size[2]/2]))).toBe(true);
  // A further 0.5m left shift crops the western cap against the real arch.
  // Retain that perspective boundary instead of widening gameplay thresholds.
  const west=peaks[0]!;
  expect(archHit([154.5,25.72,-3],[west.center[0]-west.size[0]/2,west.center[1]+west.size[1]/2,west.center[2]-west.size[2]/2])).toBe(true);
 });
});
