import {describe,it,expect} from 'vitest';
import {COURTYARD_PHOTO,COURTYARD_SOLIDS} from '../courtyard.ts';
import {SOURCE_BUNDLES} from '../pipeline-sources.ts';
import {compilePipelineBundles,DYNAMIC_PIVOTS} from '../pipeline-import.ts';
import {terrainHeight,resolveMove,traceSegment,STATIC_OBSTACLES,PHOTO_ANCHORS,type Vec3} from '../world-layout.ts';
import {COURTYARD_GARDEN_ENTITY,courtyardGardenBoxes} from '../courtyard-garden.ts';
import {buildWorldContent,detailMesh} from '../world.pack.ts';
import {worldAsset,WORLD_SCENE_SOURCE_KEY} from '../world-refs.ts';
import {HERO_MOUNTAIN_SUMMITS} from '../hero-mountain.ts';
import {travelBlockers,traceTravelSegment,isSafeRoadPose} from '../road-safety.ts';
import {createTravelController} from '../../controller/travel-controller.ts';
import {EMPTY_INPUT,type CameraPose} from '../../controller/types.ts';
import {projectAnchor,normalize,subtract,cross,dot,cameraRay} from '../../controller/geometry.ts';
import {REST_POINTS,nearbyRestPoint} from '../../journey/rest-points.ts';
import {LANTERN_POS} from '../courtyard-structure.ts';
import {rainShelterHeight} from '../rain-shelter.ts';

const compiled=compilePipelineBundles(SOURCE_BUNDLES.filter(b=>b.id==='town-courtyard'));
const gardenBoxes=courtyardGardenBoxes(terrainHeight),gardenMesh=detailMesh(gardenBoxes).build(name=>worldAsset(`material/${name}`));
const inside=(p:readonly number[])=>COURTYARD_SOLIDS.some(b=>p.every((v,i)=>v>=b.min[i]!-1e-7&&v<=b.max[i]!+1e-7));
const triangles:Vec3[][]=[];
type NativeSurface={entity:string;triangle:Vec3[]};
const nativeSurfaces:NativeSurface[]=[];
for(const[key,entity]of Object.entries(compiled.entities)){
 const mesh=compiled.resources[`mesh/${key}`];if(mesh?.kind!=='mesh'||!(mesh.attributes.position instanceof Float32Array)||!mesh.indices)throw Error(key);
 const p=mesh.attributes.position,o=(entity.components.Transform as {pos:Vec3}).pos;
 for(let i=0;i<mesh.indices.length;i+=3){
  const triangle=[0,1,2].map(k=>[0,1,2].map(j=>p[mesh.indices![i+k]!*3+j]!+o[j]!) as unknown as Vec3);
  triangles.push(triangle);nativeSurfaces.push({entity:key.split('/').at(-1)!,triangle});
 }
}
{
 const p=gardenMesh.attributes.position as Float32Array,indices=gardenMesh.indices!;
 for(let i=0;i<indices.length;i+=3){
  const triangle=[0,1,2].map(k=>[0,1,2].map(j=>p[indices[i+k]!*3+j]!) as unknown as Vec3);
  triangles.push(triangle);nativeSurfaces.push({entity:'courtyard-garden',triangle});
 }
}
function firstNativeBrute(from:Vec3,direction:Vec3,surfaces=nativeSurfaces){
 let found:{entity:string;distance:number}|null=null;
 for(const {entity,triangle:[a,b,c]} of surfaces){
  const e1=subtract(b!,a!),e2=subtract(c!,a!),h=cross(direction,e2),det=dot(e1,h);if(Math.abs(det)<1e-8)continue;
  const inv=1/det,s=subtract(from,a!),u=inv*dot(s,h);if(u<0||u>1)continue;
  const q=cross(s,e1),v=inv*dot(direction,q);if(v<0||u+v>1)continue;
  const t=inv*dot(e2,q);if(t>=0&&(!found||t<found.distance))found={entity,distance:t};
 }
 return found;
}
// Acceleration affects test traversal only. Leaves still intersect the original
// Native Mesh triangles; neither boxes nor photography anchors decide a hit.
type PreparedTriangle={entity:string;order:number;a:Vec3;e1:Vec3;e2:Vec3;min:Vec3;max:Vec3};
type NativeBvh={min:Vec3;max:Vec3;left?:NativeBvh;right?:NativeBvh;triangles?:PreparedTriangle[]};
const nativeBvhCache=new WeakMap<NativeSurface[],NativeBvh>();
function nativeBvh(surfaces:NativeSurface[]):NativeBvh {
 const cached=nativeBvhCache.get(surfaces);if(cached)return cached;
 const prepared=surfaces.map(({entity,triangle:[a,b,c]},order)=>({entity,order,a:a!,e1:subtract(b!,a!),e2:subtract(c!,a!),
  min:[0,1,2].map(k=>Math.min(a![k]!,b![k]!,c![k]!)-1e-8) as unknown as Vec3,
  max:[0,1,2].map(k=>Math.max(a![k]!,b![k]!,c![k]!)+1e-8) as unknown as Vec3}));
 const build=(items:PreparedTriangle[]):NativeBvh=>{
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const t of items)for(let k=0;k<3;k++){min[k]=Math.min(min[k]!,t.min[k]!);max[k]=Math.max(max[k]!,t.max[k]!);}
  const node:NativeBvh={min:min as unknown as Vec3,max:max as unknown as Vec3};
  if(items.length<=8){node.triangles=items;return node;}
  let axis=0;for(let k=1;k<3;k++)if(max[k]!-min[k]!>max[axis]!-min[axis]!)axis=k;
  items.sort((a,b)=>(a.min[axis]!+a.max[axis]!)-(b.min[axis]!+b.max[axis]!)||a.order-b.order);
  const middle=Math.floor(items.length/2);node.left=build(items.slice(0,middle));node.right=build(items.slice(middle));return node;
 };
 const built=build(prepared);nativeBvhCache.set(surfaces,built);return built;
}
function rayReachesBounds(from:Vec3,direction:Vec3,node:NativeBvh,nearest:number){
 let near=0,far=nearest;
 for(let k=0;k<3;k++){
  const origin=from[k]!,d=direction[k]!;
  if(d===0){if(origin<node.min[k]!||origin>node.max[k]!)return false;continue;}
  const a=(node.min[k]!-origin)/d,b=(node.max[k]!-origin)/d;
  near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));if(near>far)return false;
 }
 return true;
}
function firstNative(from:Vec3,direction:Vec3,surfaces=nativeSurfaces){
 let distance=Infinity,order=Infinity,entity:string|undefined;
 const stack=[nativeBvh(surfaces)];
 while(stack.length){
  const node=stack.pop()!;if(!rayReachesBounds(from,direction,node,distance))continue;
  if(!node.triangles){stack.push(node.right!,node.left!);continue;}
  for(const t of node.triangles){
   const {a,e1,e2}=t;
   const hx=direction[1]*e2[2]-direction[2]*e2[1],hy=direction[2]*e2[0]-direction[0]*e2[2],hz=direction[0]*e2[1]-direction[1]*e2[0];
   const det=e1[0]*hx+e1[1]*hy+e1[2]*hz;if(Math.abs(det)<1e-8)continue;
   const inv=1/det,sx=from[0]-a[0],sy=from[1]-a[1],sz=from[2]-a[2],u=inv*(sx*hx+sy*hy+sz*hz);if(u<0||u>1)continue;
   const qx=sy*e1[2]-sz*e1[1],qy=sz*e1[0]-sx*e1[2],qz=sx*e1[1]-sy*e1[0],v=inv*(direction[0]*qx+direction[1]*qy+direction[2]*qz);if(v<0||u+v>1)continue;
   const hit=inv*(e2[0]*qx+e2[1]*qy+e2[2]*qz);
   // Preserve the original input order for exactly coincident triangle hits.
   if(hit>=0&&(hit<distance||hit===distance&&t.order<order)){distance=hit;order=t.order;entity=t.entity;}
  }
 }
 return entity===undefined?null:{entity,distance};
}
function hitsNative(from:Vec3,to:Vec3){
 const direction=subtract(to,from);
 return triangles.some(([a,b,c])=>{
  const e1=subtract(b!,a!),e2=subtract(c!,a!),h=cross(direction,e2),det=dot(e1,h);if(Math.abs(det)<1e-8)return false;
  const inv=1/det,s=subtract(from,a!),u=inv*dot(s,h);if(u<0||u>1)return false;
  const q=cross(s,e1),v=inv*dot(direction,q);if(v<0||u+v>1)return false;
  const t=inv*dot(e2,q);return t>0&&t<1;
 });
}
function walk(points:readonly Vec3[]){
 const flags={gateOpen:true,bridgeWalkable:true},c=createTravelController({spawn:points[0]!,terrainHeight,resolveMove,traceSegment:(a,b,r)=>traceTravelSegment(a,b,flags,r)});
 for(const target of points.slice(1)){
  let steps=0;
  while(Math.hypot(c.snapshot().position[0]-target[0],c.snapshot().position[2]-target[2])>.18&&steps++<900){
   const s=c.snapshot(),yaw=Math.atan2(target[0]-s.position[0],-(target[2]-s.position[2]));
   c.submitInput({...EMPTY_INPUT,vertical:1,lookActive:true,lookX:Math.atan2(Math.sin(yaw-s.yaw),Math.cos(yaw-s.yaw))/.0022});c.step(1/60);
  }
  expect(steps,`blocked at ${c.snapshot().position} before ${target}`).toBeLessThan(900);
 }
 return c.snapshot();
}

describe('existing courtyard becomes the optional listening-bell view',()=>{
 it('matches the original triangle traversal for camera, axis-aligned, parallel and coincident rays',()=>{
  const eye:Vec3=[COURTYARD_PHOTO.view.feet[0],terrainHeight(COURTYARD_PHOTO.view.feet[0],COURTYARD_PHOTO.view.feet[2])+1.64,COURTYARD_PHOTO.view.feet[2]],
   camera:CameraPose={position:eye,forward:normalize(subtract(COURTYARD_PHOTO.view.target,eye)),up:[0,1,0],verticalFovRadians:Math.PI/3,aspect:16/9};
  for(let y=0;y<8;y++)for(let x=0;x<12;x++){
   const ray=cameraRay(camera,(x+.5)/12,(y+.5)/8);expect(firstNative(eye,ray.direction)).toEqual(firstNativeBrute(eye,ray.direction));
  }
  for(const from of[eye,[161.125,26.375,51.125],[158.5,26,51]] as Vec3[])for(const direction of[[1,0,0],[0,1,0],[0,0,1],[0,-1,0]] as Vec3[])
   expect(firstNative(from,direction)).toEqual(firstNativeBrute(from,direction));
  const coincident:NativeSurface[]=[{entity:'first',triangle:[[0,0,0],[1,0,0],[0,1,0]]},{entity:'second',triangle:[[0,0,0],[1,0,0],[0,1,0]]}];
  expect(firstNative([.25,.25,1],[0,0,-1],coincident)).toEqual(firstNativeBrute([.25,.25,1],[0,0,-1],coincident));
 });
 it('retains closed walls on all four sides and gives every compiled face real solid backing',()=>{
  for(const[key,entity]of Object.entries(compiled.entities)){
   const mesh=compiled.resources[`mesh/${key}`];if(mesh?.kind!=='mesh')throw Error(key);
   const p=mesh.attributes.position,n=mesh.attributes.normal,idx=mesh.indices,o=(entity.components.Transform as {pos:Vec3}).pos;
   if(!(p instanceof Float32Array)||!(n instanceof Float32Array)||!idx)throw Error('native arrays');
   for(let i=0;i<idx.length;i+=3){const a=idx[i]!*3,center=[0,1,2].map(j=>[0,1,2].reduce((sum,k)=>sum+p[idx[i+k]!*3+j]!,0)/3+o[j]!);
    expect(inside(center.map((v,j)=>v-n[a+j]!*.01)),`${key} face ${i} lacks collider`).toBe(true);
   }
  }
  for(const [from,to] of [
   [[149.25,26,46],[149.25,26,53]],[[149.25,26,60],[149.25,26,53]],
   [[142,26,53],[149.25,26,53]],[[159,26,53],[149.25,26,53]],
  ] as const)expect(hitsNative(from,to)).toBe(true);
  expect(Math.max(...COURTYARD_SOLIDS.map(b=>b.max[1]))).toBeLessThanOrEqual(34);
 });
 it('supports every edge of the stone lantern on one physical terrace',()=>{
  const [x,z]=LANTERN_POS,height=terrainHeight(x,z);
  for(const dx of [-.43,0,.43])for(const dz of [-.41,0,.41]){
   expect(terrainHeight(x+dx,z+dz)).toBeCloseTo(height,4);
  }
 });
 it('authors a hollow bronze bell with a rounded shoulder, flared mouth and separate clapper, not an AABB box',()=>{
  const bell=COURTYARD_SOLIDS.filter(b=>b.entityId==='town_courtyard_bell'),shape=COURTYARD_PHOTO.anchors.bell;
  for(let k=0;k<3;k++){
   expect(Math.min(...bell.map(b=>b.min[k]!))).toBeCloseTo(shape.position[k]!-shape.size[k]!/2,7);
   expect(Math.max(...bell.map(b=>b.max[k]!))).toBeCloseTo(shape.position[k]!+shape.size[k]!/2,7);
  }
  const filled=(p:Vec3)=>bell.some(b=>p.every((v,i)=>v>b.min[i]!&&v<b.max[i]!));
  expect(filled([161.625,25.875,51.125])).toBe(false); // Open resonant cavity beside the clapper.
  expect(filled([161.125,25.125,51.125])).toBe(true); // Separate lower clapper.
  expect(filled([160.05,25.375,50.05])).toBe(false); // Rounded corner, not a box.
  expect(filled([160.05,25.375,51.125])).toBe(true); // Real flared mouth.
  expect(filled([160.05,26.625,51.125])).toBe(false); // Shoulder narrows above the lip.
  expect(filled([161.125,27.625,51.125])).toBe(true); // Crown reaches the hanging pivot.
  expect(COURTYARD_SOLIDS.length).toBeLessThanOrEqual(340);
  expect(triangles.length).toBeLessThanOrEqual(3400);
 });
 it('walks the existing main card, lowered bridge, true wall opening and camera spot in both directions',()=>{
  const path:Vec3[]=[[155,24.08,-3],[155,24.08,7],[155,24.08,20],[155,24.5,28],[155,24.08,37],[155,24.08,42],COURTYARD_PHOTO.view.feet,[158.5,24.08,51]];
  walk(path);walk([...path].reverse());
  expect(travelBlockers({gateOpen:true,bridgeWalkable:false}).map(b=>b.id)).toContain('town-raised-bridge');
  expect(isSafeRoadPose([158.5,24.08,51],{gateOpen:true,bridgeWalkable:false})).toBe(false);
  expect(isSafeRoadPose([158.5,24.08,51],{gateOpen:true,bridgeWalkable:true})).toBe(true);
 });
 it('keeps normal viewing offsets clear, with a real bell below its actual eave',()=>{
  for(const x of[155,155.5,156])for(const z of[43.2,43.5,43.8]){
   const feet:Vec3=[x,terrainHeight(x,z),z],eye:Vec3=[x,feet[1]+1.64,z],camera:CameraPose={position:eye,forward:normalize(subtract(COURTYARD_PHOTO.view.target,eye)),up:[0,1,0],verticalFovRadians:Math.PI/3,aspect:16/9};
   expect(traceSegment(eye,eye,.3).hit).toBe(false);
   const shapes=Object.values(COURTYARD_PHOTO.anchors).map(shape=>projectAnchor(camera,shape,0,(a,b,r)=>{const hit=traceSegment(a,b,r);return shape.proxy.has(hit.obstacle??'')?{...hit,hit:false}:hit;}));
   for(const p of shapes){expect(p.visible).toBe(true);expect(p.visibleFraction).toBeGreaterThanOrEqual(.65);expect(p.x).toBeGreaterThan(.04);expect(p.x).toBeLessThan(.96);expect(p.y).toBeGreaterThan(.04);expect(p.y).toBeLessThan(.96);}
   expect(shapes[0]!.width*shapes[0]!.height).toBeGreaterThanOrEqual(.001);
   expect(shapes[1]!.width*shapes[1]!.height).toBeGreaterThanOrEqual(.003);
   expect(shapes[0]!.y).toBeGreaterThan(shapes[1]!.y);
   for(const[id,shape]of Object.entries(COURTYARD_PHOTO.anchors))expect(firstNative(eye,normalize(subtract(shape.position,eye)))?.entity).toBe(`town-courtyard-${id}`);
  }
 });
 it('keeps the actual bell silhouette clear of posts and garden across nearby entrance positions',()=>{
  const bellSurfaces=nativeSurfaces.filter(s=>s.entity==='town-courtyard-bell');
  const pivot=DYNAMIC_PIVOTS['hero/town-courtyard/town-courtyard-bell']!;
  expect(pivot).toEqual([161.125,27.75,51.125]);
  const visibility=(x:number,z:number,angle=0)=>{
   const movingBell=bellSurfaces.map(s=>({...s,triangle:s.triangle.map(p=>{
    const y=p[1]-pivot[1],z=p[2]-pivot[2];return [p[0],pivot[1]+y*Math.cos(angle)-z*Math.sin(angle),pivot[2]+y*Math.sin(angle)+z*Math.cos(angle)] as Vec3;
   })}));
   const scene=[...nativeSurfaces.filter(s=>s.entity!=='town-courtyard-bell'),...movingBell];
   const eye:Vec3=[x,terrainHeight(x,z)+1.64,z],camera:CameraPose={position:eye,forward:normalize(subtract(COURTYARD_PHOTO.view.target,eye)),up:[0,1,0],verticalFovRadians:Math.PI/3,aspect:16/9};
   const bell=projectAnchor(camera,COURTYARD_PHOTO.anchors.bell);let isolated=0,visible=0;
   for(let row=0;row<36;row++)for(let col=0;col<48;col++){
    const ray=cameraRay(camera,bell.x-bell.width/2+(col+.5)/48*bell.width,bell.y-bell.height/2+(row+.5)/36*bell.height);
    if(!firstNative(eye,ray.direction,movingBell))continue;
    isolated++;if(firstNative(eye,ray.direction,scene)?.entity==='town-courtyard-bell')visible++;
   }
   expect(isolated).toBeGreaterThan(600);return visible/isolated;
  };
  for(const x of[155,155.5,156])for(const z of[43.2,43.5,43.8])expect(visibility(x,z)).toBeGreaterThan(.985);
  for(const angle of[-.055,.055])expect(visibility(COURTYARD_PHOTO.view.feet[0],COURTYARD_PHOTO.view.feet[2],angle)).toBeGreaterThan(.985);
 });
 it('assembles one bounded garden mesh with exact solid backing and leaves the centre walk open',()=>{
  const resources=buildWorldContent(),scene=resources[WORLD_SCENE_SOURCE_KEY];
  expect(scene?.kind).toBe('scene');if(scene?.kind!=='scene')throw Error('Missing world');
  expect(scene.entities[COURTYARD_GARDEN_ENTITY]).toBeDefined();
  const actual=resources[`mesh/${COURTYARD_GARDEN_ENTITY}`];if(actual?.kind!=='mesh')throw Error('Missing garden mesh');
  expect(actual.attributes.position).toEqual(gardenMesh.attributes.position);
  expect(gardenBoxes.length).toBeLessThanOrEqual(60);expect(actual.indices!.length/3).toBeLessThanOrEqual(720);
  for(const b of gardenBoxes){
   const collider=STATIC_OBSTACLES.find(o=>o.id===b.id);expect(collider,b.id).toBeDefined();
   for(let k=0;k<3;k++){expect(collider!.min[k]).toBeCloseTo(b.center[k]!-b.size[k]!/2,7);expect(collider!.max[k]).toBeCloseTo(b.center[k]!+b.size[k]!/2,7);}
  }
  expect(traceSegment([168.5,25.5,52],[168.5,25.5,55],0).obstacle).toBe('courtyard-garden/tree/trunk');
  walk([[155,24.08,42],COURTYARD_PHOTO.view.feet,[155.5,24.08,46],[158.5,24.08,51]]);
  walk([[158.5,24.08,51],[155.5,24.08,46],COURTYARD_PHOTO.view.feet,[155,24.08,42]]);
 });
 it('grounds the new garden walls and foreground stones without closing the entrance or the rear walking margin',()=>{
  const foundations=gardenBoxes.filter(b=>/^courtyard-garden\/border\/(west|middle|east|return)(-foot)?$/.test(b.id)||/^courtyard-garden\/entry-stone\/(base|foot)$/.test(b.id));
  expect(foundations).toHaveLength(10);
  for(const b of foundations){
   const bottom=b.center[1]-b.size[1]/2;
   for(const dx of[-.5,0,.5])for(const dz of[-.5,0,.5]){
    const x=b.center[0]+b.size[0]*dx,z=b.center[2]+b.size[2]*dz;
    expect(bottom,`${b.id} floats or buries into its terrain column at ${x},${z}`).toBeCloseTo(terrainHeight(x,z)-.08,6);
   }
  }
  expect(traceSegment([166,25.5,56],[166,25.5,59],0).obstacle).toBe('courtyard-garden/border/east');
  // The existing seat occupies z52..52.75: use its open west side to reach the
  // rear margin, rather than asking the walker to pass straight through it.
  const path:Vec3[]=[[155,24.08,42],COURTYARD_PHOTO.view.feet,[155.5,24.08,46],[158.5,24.08,51],[155.8,24.08,51],[155.8,24.08,54],[158.5,24.08,54],[158.5,24.08,55],[157,24.08,55]];
  walk(path);walk([...path].reverse());
 });
 it('places a real garden background beyond the bell instead of filling its photo sightline',()=>{
  const eye:Vec3=[COURTYARD_PHOTO.view.feet[0],terrainHeight(COURTYARD_PHOTO.view.feet[0],COURTYARD_PHOTO.view.feet[2])+1.64,COURTYARD_PHOTO.view.feet[2]];
  const garden=nativeSurfaces.filter(s=>s.entity==='courtyard-garden');
  for(const x of[160.525,161.125,161.725]){
   const target:Vec3=[x,26.375,51.125],hit=firstNative(eye,normalize(subtract(target,eye)),garden);
   expect(hit).not.toBeNull();
   expect(hit!.distance).toBeGreaterThan(Math.hypot(...subtract(target,eye))+.5);
   expect(hit!.distance).toBeLessThan(24);
  }
 });
 it('gives the larger bell more real pixels than the old box while bounding canopy and house coverage',()=>{
  const measure=(feet:Vec3,target:Vec3)=>{
   const eye:Vec3=[feet[0],terrainHeight(feet[0],feet[2])+1.64,feet[2]],camera:CameraPose={position:eye,forward:normalize(subtract(target,eye)),up:[0,1,0],verticalFovRadians:Math.PI/3,aspect:16/9};
   const counts:Record<string,number>={};
   // Pure CPU samples of the compiled Native Mesh, not a rendered-image receipt.
   for(let y=0;y<54;y++)for(let x=0;x<96;x++){
    const {direction}=cameraRay(camera,(x+.5)/96,(y+.5)/54),hit=firstNative(eye,direction);
    if(hit)counts[hit.entity]=(counts[hit.entity]??0)+1;
   }
   return {awning:(counts['town-awning']??0)/5184,house:(counts['town-courtyard-house']??0)/5184,bell:(counts['town-courtyard-bell']??0)/5184,garden:(counts['courtyard-garden']??0)/5184};
  };
  const after=measure(COURTYARD_PHOTO.view.feet,COURTYARD_PHOTO.view.target);
  console.info('courtyard-native-mesh-coverage',JSON.stringify(after));
  expect(after.awning).toBeLessThan(.12);
  expect(after.bell).toBeGreaterThan(.02);
  expect(after.house).toBeLessThan(.25);
  expect(after.garden).toBeGreaterThan(.06);
 });
 it('keeps the actual swinging bell readable through the new roof, foliage and joinery',()=>{
  const resources=buildWorldContent(),scene=resources[WORLD_SCENE_SOURCE_KEY];
  if(scene?.kind!=='scene')throw Error('Missing scene');
  const bellKey='hero/town-courtyard/town-courtyard-bell',local:NativeSurface[]=[];
  for(const key of Object.keys(scene.entities).filter(k=>k.startsWith('hero/town-courtyard/')||
    [COURTYARD_GARDEN_ENTITY,'props/bell-roof','props/courtyard-joinery','props/courtyard-ginkgo','props/courtyard-paving'].includes(k))){
   const mesh=resources['mesh/'+key];if(mesh?.kind!=='mesh'||!mesh.indices)throw Error(key);
   const data=mesh.attributes.position as Float32Array,origin=(scene.entities[key]!.components.Transform as {pos:Vec3}).pos;
   for(let i=0;i<mesh.indices.length;i+=3){
    const triangle=[0,1,2].map(k=>[0,1,2].map(axis=>data[mesh.indices![i+k]!*3+axis]!+origin[axis]!) as unknown as Vec3);
    local.push({entity:key,triangle});
   }
  }
  const bell=local.filter(s=>s.entity===bellKey);expect(bell.length).toBeGreaterThan(1000);
  for(const x of [155,155.5,156]){
   const eye:Vec3=[x,25.72,43.5],cam:CameraPose={position:eye,forward:normalize(subtract(COURTYARD_PHOTO.view.target,eye)),up:[0,1,0],verticalFovRadians:Math.PI/3,aspect:16/9};
   let isolated=0,visible=0;
   for(let v=0;v<36;v++)for(let u=0;u<40;u++){
    const ray=cameraRay(cam,.35+u/120,.24+v/72);
    if(!firstNative(eye,ray.direction,bell))continue;
    isolated++;if(firstNative(eye,ray.direction,local)?.entity===bellKey)visible++;
   }
   expect(isolated).toBeGreaterThan(150);expect(visible/isolated).toBeGreaterThan(.975);
  }
 });
 it('leaves the complete real twin peaks and the original red-roof memory ray unobstructed',()=>{
  const eye=PHOTO_ANCHORS.town.view;
  for(const peak of HERO_MOUNTAIN_SUMMITS){
   for(const x of[-.5,.5])for(const y of[-.5,.5])for(const z of[-.5,.5])expect(hitsNative(eye,[peak.center[0]+peak.size[0]*x,peak.center[1]+peak.size[1]*y,peak.center[2]+peak.size[2]*z])).toBe(false);
  }
  expect(hitsNative([64,terrainHeight(64,204)+1.64,204],PHOTO_ANCHORS.valley.anchors.townRoof.position)).toBe(false);
 });
 it('provides real rain cover over the rest point and an empty interior below the roof',()=>{
  expect(rainShelterHeight(158.5,51)).toBeGreaterThan(30);
  expect(traceSegment([158.5,28.4,51],[158.5,30.5,51],0).obstacle).toMatch(/^courtyard\/town-awning\//);
  expect(traceSegment([157,26,49],[158.5,26,51],0).hit).toBe(false);
  expect(COURTYARD_SOLIDS.some(b=>b.entityId==='town_crates')).toBe(false);
  const rest=REST_POINTS.find(p=>p.id==='town')!;
  expect(rainShelterHeight(rest.position[0],rest.position[2])).toBeGreaterThan(28);
  expect(traceSegment([rest.position[0],26,rest.position[2]],[rest.position[0],30,rest.position[2]],0).hit).toBe(true);
  for(const b of COURTYARD_SOLIDS.filter(b=>b.entityId==='town_courtyard_bench')){
   for(const x of[b.min[0]+.01,b.max[0]-.01])for(const z of[b.min[2]+.01,b.max[2]-.01]){
    expect(rainShelterHeight(x,z)).toBeGreaterThan(28);expect(nearbyRestPoint([x,24.08,z],true)?.id).toBe('town');
   }
  }
  expect(rainShelterHeight(158.5,48.5)).toBeUndefined();
  walk([[155.5,24.08,46],rest.position,[158.5,24.08,51.3]]);
 });
});
