import {describe,expect,it} from 'vitest';
import {buildRouteScenery,detailObstacles,FOREST_FRAME_BOXES,townRearDetails,landmarkBackDetails,lostPostcardDisplay,TOWN_CRANK_BOXES,TOWN_CRANK_MARKER,ridgeForeground} from '../scene-details.ts';
import {ROUTES,roadSample,terrainHeight,STATIC_OBSTACLES,INTERACTIONS,DISCOVERIES,PHOTO_ANCHORS,traceSegment,visiblePathWidth,resolveMove} from '../world-layout.ts';
import {detailMesh,buildWorldContent,WORLD_PALETTE} from '../world.pack.ts';
import {WORLD_SCENE_SOURCE_KEY} from '../world-refs.ts';
import {compilePipelineBundles} from '../pipeline-import.ts';
import {SOURCE_BUNDLES} from '../pipeline-sources.ts';

describe('P0 authored roadside and landmark details',()=>{
 it('gives both approach walks distinct stopping places every 25–35 metres without filling the walking ribbon',()=>{
  const nodes=buildRouteScenery(ROUTES,terrainHeight);
  for(const route of ['forest-low','town-low','valley-cross','forest-high','town-high']){
   const stops=nodes.filter(n=>n.route===route);
   expect(stops.length).toBeGreaterThanOrEqual(route==='forest-low'||route==='town-low'?8:3);
   if(route==='forest-low'||route==='town-low'){
    expect(new Set(stops.map(n=>n.theme)).size).toBe(5);
    for(let i=1;i<stops.length;i++)expect(stops[i]!.distance-stops[i-1]!.distance).toBeGreaterThanOrEqual(25);
    for(let i=1;i<stops.length;i++)expect(stops[i]!.distance-stops[i-1]!.distance).toBeLessThanOrEqual(35);
   }
   for(const stop of stops)for(const solid of detailObstacles(stop.boxes)){
    // Check every footprint corner as well as the centre; an off-road origin is insufficient for a wide seat.
    for(const x of [solid.min[0],solid.max[0],(solid.min[0]+solid.max[0])/2])for(const z of [solid.min[2],solid.max[2],(solid.min[2]+solid.max[2])/2]){
     const sample=roadSample(x,z);
     expect(sample.distance,`${solid.id} intrudes into ${sample.route}`).toBeGreaterThan(visiblePathWidth(sample)/2+.28);
    }
   }
  }
 });
 it('uses exact visible solid parts for new scenery collision and does not collide with flowers',()=>{
  const boxes=[...buildRouteScenery(ROUTES,terrainHeight).flatMap(n=>n.boxes),...FOREST_FRAME_BOXES,...townRearDetails(),...landmarkBackDetails(),...lostPostcardDisplay(terrainHeight),...TOWN_CRANK_BOXES,...ridgeForeground(terrainHeight)];
  expect(new Set(boxes.map(b=>b.id)).size).toBe(boxes.length);
  for(const box of boxes){
   const collider=STATIC_OBSTACLES.find(b=>b.id===box.id);
   if(!box.solid){expect(collider,box.id).toBeUndefined();continue;}
   expect(collider,box.id).toEqual(detailObstacles([box])[0]);
   const mesh=detailMesh([box]);
   for(let axis=0;axis<3;axis++){
    const positions=mesh.vertices.filter((_,i)=>i%8===axis);
    expect(Math.min(...positions)).toBeCloseTo(collider!.min[axis]!,6);
    expect(Math.max(...positions)).toBeCloseTo(collider!.max[axis]!,6);
   }
  }
 });
 it('puts new side window faces outside actual compiled walls and keeps pavilion supports above walking heads',()=>{
  const compiled=compilePipelineBundles(SOURCE_BUNDLES),details=[...landmarkBackDetails(),...townRearDetails()];
  const houses=[
   ['post-back/', 'post-office/post-office'],['forest-back/', 'forest-windmill/windmill-tower'],
   ['town-back/west-house-', 'town-street/town-house-west'],['town-back/courtyard-', 'town-courtyard/town-courtyard-house'],
   ['town-rear/east-window-', 'town-street/town-house-east'],
  ] as const;
  for(const window of details.filter(b=>b.id.endsWith('/recess'))){
   const key=`hero/${houses.find(([prefix])=>window.id.startsWith(prefix))![1]}`,mesh=compiled.resources[`mesh/${key}`];
   if(mesh?.kind!=='mesh')throw Error(key);
   const vertices=mesh.attributes.position,indices=mesh.indices,origin=(compiled.entities[key]!.components.Transform as {pos:number[]}).pos;
   if(!(vertices instanceof Float32Array)||!indices)throw Error('native mesh missing');
   const y=window.center[1]-origin[1]!,z=window.center[2]-origin[2]!,walls:number[]=[];
   for(let i=0;i<indices.length;i+=3){
    const [a,b,c]=[0,1,2].map(k=>Array.from(vertices.slice(indices[i+k]!*3,indices[i+k]!*3+3)));
    const den=(b![2]!-c![2]!)*(a![1]!-c![1]!)+(c![1]!-b![1]!)*(a![2]!-c![2]!);if(Math.abs(den)<1e-8)continue;
    const u=((b![2]!-c![2]!)*(y-c![1]!)+(c![1]!-b![1]!)*(z-c![2]!))/den,v=((c![2]!-a![2]!)*(y-c![1]!)+(a![1]!-c![1]!)*(z-c![2]!))/den;
    if(u>=-1e-7&&v>=-1e-7&&u+v<=1+1e-7)walls.push(u*a![0]!+v*b![0]!+(1-u-v)*c![0]!+origin[0]!);
   }
   expect(walls.length,window.id).toBeGreaterThan(0);
   const west=window.id.includes('-west-window')||window.id.includes('/west-window');
   if(west)expect(window.center[0]-window.size[0]/2,window.id).toBeLessThan(Math.min(...walls));
   else expect(window.center[0]+window.size[0]/2,window.id).toBeGreaterThan(Math.max(...walls));
  }
  for(const support of details.filter(b=>b.id.startsWith('ridge-back/')))expect(support.center[1]-support.size[1]/2).toBeGreaterThan(99);
  const eastWindows=details.filter(b=>b.id.startsWith('town-rear/east-window-'));
  expect(eastWindows.filter(b=>b.id.endsWith('/recess'))).toHaveLength(2);
  for(const part of eastWindows)expect(part.center[0]+part.size[0]/2).toBeLessThanOrEqual(170.16);
 });
 it('keeps the lost postcard solid beside the lane, below knee height and reachable from the original discovery area',()=>{
  const display=lostPostcardDisplay(terrainHeight),colliders=detailObstacles(display),discovery=DISCOVERIES.find(d=>d.id==='lost-postcard')!;
  const minY=Math.min(...colliders.map(b=>b.min[1])),maxY=Math.max(...colliders.map(b=>b.max[1]));
  expect(maxY-minY).toBeLessThanOrEqual(.55);
  for(const box of colliders)for(const x of [box.min[0],box.max[0]])for(const z of [box.min[2],box.max[2]]){
   const road=roadSample(x,z);
   expect(road.distance).toBeGreaterThan(visiblePathWidth(road)/2+.28);
   expect(Math.hypot(x-discovery.position[0],z-discovery.position[2])).toBeLessThan(discovery.radius);
  }
  const y=terrainHeight(176,26);
  expect(resolveMove([175,y,26],[2,0,0])[0]).toBe(177);
  expect(resolveMove([177,y,26],[-2,0,0])[0]).toBe(175);
  const blocked=resolveMove([180,terrainHeight(177.3,28.1),28.1],[-3,0,0]);
  expect(blocked[0]).toBeGreaterThan(177.8);
  expect(blocked[0]).toBeLessThan(178.2);
  const resources=buildWorldContent(),extras=resources['mesh/landmark-extras'];
  if(extras?.kind!=='mesh'||!(extras.attributes.position instanceof Float32Array))throw Error('native extras missing');
  const p=extras.attributes.position;
  let legacySlab=false;
  for(let i=0;i<p.length;i+=3)if(p[i]!>175&&p[i]!<177&&p[i+2]!>25&&p[i+2]!<27&&p[i+1]!>y+.5&&p[i+1]!<y+1.2)legacySlab=true;
  expect(legacySlab).toBe(false);
 });
 it('separates source meadow, slope, foliage and cream values without striping every grass tone',()=>{
  const luminance=(key:string)=>{
   const hex=WORLD_PALETTE[key]!;const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
   return rgb[0]!*.2126+rgb[1]!*.7152+rgb[2]!*.0722;
  };
  expect(luminance('cream')-luminance('grass')).toBeGreaterThan(.3);
  expect(luminance('grass')-luminance('leaf-light')).toBeGreaterThan(.1);
  expect(luminance('grass')-luminance('grass-slope')).toBeGreaterThan(.06);
  expect(luminance('grass-light')-luminance('grass-dark')).toBeLessThan(.13);
 });
 it('preserves the forest sightline with a single human-scale roadside chime post',()=>{
  const posts=FOREST_FRAME_BOXES.filter(b=>b.id==='forest-chime-post');
  expect(posts).toHaveLength(1);
  posts.forEach(p=>{expect(p.size[0]).toBeLessThan(.5);expect(p.size[1]).toBeLessThan(4);});
  expect(traceSegment(PHOTO_ANCHORS.forest.view,PHOTO_ANCHORS.forest.target,0).obstacle).toBeUndefined();
 });
 it('keeps the crank visible on its south operating face and addressable without changing its interaction point',()=>{
  const lever=INTERACTIONS.find(i=>i.id==='town-lever')!;
  const handle=TOWN_CRANK_BOXES.find(b=>b.id==='town-crank/handle')!;
  expect(Math.hypot(handle.center[0]-lever.position[0],handle.center[2]-lever.position[2])).toBeLessThan(lever.radius);
  expect(handle.center[2]).toBeLessThan(lever.position[2]);
  const scene=buildWorldContent()[WORLD_SCENE_SOURCE_KEY];
  if(scene?.kind!=='scene')throw Error('native world missing');
  expect(scene.entities[TOWN_CRANK_MARKER]).toBeDefined();
  expect(scene.entities['hero/forest-windmill/wind-chime-frame']).toBeDefined();
 });
});
