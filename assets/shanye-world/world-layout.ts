import { inSixthRoom, SIXTH_PLATFORMS, SIXTH_ROOM, SIXTH_ROOM_BOXES, sixthRoomGrade } from './sixth-layout.ts';
import { AFTERNOON_STOPS, afternoonProps, bridgeStoneTop } from './afternoon-layout.ts';
import { nightMarketObstacles } from './night-art.ts';
import {inLaneHouse,plantGroves,groveSolids,laneHouseSolids} from './valley-planting.ts';
import {PRECINCT_SOLIDS,marketBodies,pavedPrecinct,gardenGrade,gardenWalkingSurface} from './mountain-precinct.ts';
import {bellRoofSolids} from './courtyard-structure.ts';
/** Authoritative metre-scale world contract. +Y up, +Z north; positions are feet positions. */
import { HERO_MOUNTAIN_BOXES } from './hero-mountain.ts';
import { TOWN_BRIDGE_BED, TOWN_BRIDGE_DECK, TOWN_PLANTER_SOLIDS, TOWN_POSTBOX_SHIFT } from './town-postcard-layout.ts';
import { WINDMILL_TOWER_SHAPE } from './windmill-profile.ts';
import { COURTYARD_SOLIDS } from './courtyard.ts';
import { courtyardGardenBoxes } from './courtyard-garden.ts';
import { FOREST_PHOTO } from './forest-composition.ts';
import { fitRockToSlope, rockSolids, rockYaw } from './rock-shape.ts';
import { OPENING_POSTAL_SOLIDS } from './opening-envelope.ts';
import { onPostalLookout, postalLookoutGrade, POSTAL_LOOKOUT_FLOOR, POSTAL_LOOKOUT_ROAD, POSTAL_LOOKOUT_SPAWN, POSTAL_LOOKOUT_YAW } from './postal-lookout.ts';
import { POSTAL_PROP_SOLIDS } from './postal-prop-solids.ts';
import { postalWoodland } from './postal-woodland.ts';
import { buildRouteScenery, detailObstacles, FOREST_FRAME_BOXES, townRearDetails, landmarkBackDetails, lostPostcardDisplay, TOWN_CRANK_BOXES, ridgeForeground } from './scene-details.ts';
export type Vec3 = readonly [number, number, number];
export type MutableVec3 = [number, number, number];
export interface AABB { readonly id: string; readonly min: Vec3; readonly max: Vec3 }
export interface Route { readonly id: string; readonly title: string; readonly width: number; readonly points: readonly Vec3[] }
export const WORLD = Object.freeze({
  bounds: { minX: -400, maxX: 400, minZ: -400, maxZ: 400 },
  playableBounds: { minX: -390, maxX: 390, minZ: -390, maxZ: 390 },
  spawn: POSTAL_LOOKOUT_SPAWN,
  spawnYaw: POSTAL_LOOKOUT_YAW,
  zipline: { start: [-186, 44, -16] as Vec3, points: [[-214,49,-55],[-220,47,-112],[-180,43,-168]] as readonly Vec3[], end: [-48, 22, -186] as Vec3, duration: 16, sag: 0 },
});
export const LANDMARKS = Object.freeze({
  post: { id: 'post', title: '山口旧邮局', position: [0, 14, -235] as Vec3, radius: 34 },
  forest: { id: 'forest', title: '风来林地', position: [-170, 38, -35] as Vec3, radius: 35 },
  town: { id: 'town', title: '石巷旧镇', position: [155, 24, 20] as Vec3, radius: 43 },
  ridge: { id: 'ridge', title: '山脊观景站', position: [0, 96, 235] as Vec3, radius: 31 },
});
export const ROUTES: readonly Route[] = [
  { id: 'forest-low', title: '林间邮路', width: 5, points: [[0,14,-220],[-35,16,-192],[-65,19,-154],[-102,26,-120],[-142,33,-95],[-170,38,-70],[-170,38,-35]] },
  { id: 'town-low', title: '谷地石径', width: 6, points: [[0,14,-220],[38,13,-185],[75,14,-143],[92,17,-100],[128,21,-60],[155,24,-19],[155,24,20]] },
  { id: 'valley-cross', title: '旧邮差横道', width: 4, points: [[-170,38,-35],[-119,30,-28],[-65,22,-9],[-12,18,4],[44,20,13],[100,24,8],[120,24,3],[155,24,-2],[155,24,20]] },
  { id: 'forest-high', title: '西坡风铃小径', width: 4, points: [[-170,38,-35],[-204,42,6],[-229,51,61],[-204,62,106],[-143,72,129],[-93,83,183],[-42,92,220],[-20,96,228],[-15,96,228],[-15,96,235],[0,96,235]] },
  { id: 'town-high', title: '东岭古道', width: 5, points: [[155,24,20],[194,33,59],[216,46,109],[171,58,135],[126,70,178],[64,84,204],[20,96,226],[15,96,226],[15,96,235],[0,96,235]] },
  { id: 'hidden-trail', title: '杉影岔路', width: 2.5, points: [[-102,26,-120],[-125,32,-156],[-176,38,-153],[-202,41,-112],[-204,42,6]] },
  { id: 'ridge-loop', title: '观景台环道', width: 3.5, points: [[-42,92,220],[-29,96,255],[0,96,267],[30,96,252],[35,94,228],[64,84,204]] },
  { id: 'zipline-return', title: '滑索回邮路', width: 3, points: [[-48,16,-186],[-42,16,-187],[-35,16,-192]] },
];
/** A short walkable side lane; its first node is exactly on town-high's 9/39 grade. */
export const SIDE_ROUTES:readonly Route[]=[
 {id:'town-postcard-alley',title:'旧信片侧巷',width:4.8,points:[[166,24+11*9/39,31],[168,24+11*9/39,29],[172,25.5,27],[176,24.5,26]]},
];
/** Visible local paving, shared by its mesh and recovery routing. */
export const LOCAL_ROUTES:readonly Route[]=[
 {id:'post-doorstep',title:'邮局门前',width:4,points:[[-3,14,-232],[-3,14,-225],[0,14,-220]]},
 {id:'post-gateway',title:'邮局廊下',width:4.5,points:[[9.75,14,-238],[9.75,14,-226],[0,14,-220]]},
 POSTAL_LOOKOUT_ROAD,
 {id:'town-courtyard',title:'旧镇院路',width:4.5,points:[[155,24,24],[155,24,42],[158.5,24,51]]},
];
const GROUND_ROUTES:readonly Route[]=[...ROUTES,...SIDE_ROUTES];
const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const smooth = (t: number) => { t = clamp(t); return t * t * (3 - 2 * t); };
const gaussian = (x: number,z: number,cx: number,cz: number,rx: number,rz=rx) => Math.exp(-(((x-cx)/rx)**2 + ((z-cz)/rz)**2));
/** Blend the two sides of the east-house lane before quantizing its solid columns.
 * The nearest-route Voronoi boundary used to jump by 2–3m beside the north exit. */
function townBacklaneGrade(x:number,z:number):number{
 const routes=[ROUTES[1]!,ROUTES[4]!,SIDE_ROUTES[0]!];let sum=0,weight=0;
 for(const route of routes){
  let nearest=Infinity,height=24;
  for(let i=1;i<route.points.length;i++){
   const a=route.points[i-1]!,b=route.points[i]!,dx=b[0]-a[0],dz=b[2]-a[2],t=clamp(((x-a[0])*dx+(z-a[2])*dz)/(dx*dx+dz*dz)),d=Math.hypot(x-a[0]-dx*t,z-a[2]-dz*t);
   if(d<nearest){nearest=d;height=a[1]+(b[1]-a[1])*t;}
  }
  const w=1/(nearest+1)**2;sum+=height*w;weight+=w;
 }
 return sum/weight;
}
const townBacklaneWeight=(x:number,z:number)=>smooth((x-156)/4)*smooth((188-x)/8)*smooth((z-12)/4)*smooth((44-z)/8);
const FOREST_GRADE_ROUTES=ROUTES.filter(r=>r.id==='forest-low'||r.id==='valley-cross'||r.id==='forest-high');
/** The clearing joins three roads at different grades. Blend their nearest segment
 * heights locally instead of exposing a nearest-road height jump beside the tower. */
function forestClearingGrade(x:number,z:number):number{
 let sum=0,weight=0;
 for(const route of FOREST_GRADE_ROUTES){
  let nearest=Infinity,height=38;
  for(let i=1;i<route.points.length;i++){
   const a=route.points[i-1]!,b=route.points[i]!,dx=b[0]-a[0],dz=b[2]-a[2],t=clamp(((x-a[0])*dx+(z-a[2])*dz)/(dx*dx+dz*dz)),d=Math.hypot(x-a[0]-dx*t,z-a[2]-dz*t);
   if(d<nearest){nearest=d;height=a[1]+(b[1]-a[1])*t;}
  }
  const w=1/(nearest+1)**2;sum+=height*w;weight+=w;
 }
 return sum/weight;
}
const forestClearingWeight=(x:number,z:number)=>smooth((x+192)/4)*smooth((-144-x)/4)*smooth((z+44)/4)*smooth((4-z)/4);
export interface RoadSample { distance: number; height: number; width: number; route: string; tangent: readonly [number,number] }
interface RoadSegmentData {
  ax: number; az: number; ay: number; dx: number; dz: number; dy: number;
  len2: number; tx: number; tz: number; width: number; route: string;
  minX: number; maxX: number; minZ: number; maxZ: number;
}
const GROUND_SEGMENTS: readonly RoadSegmentData[] = (() => {
  const out: RoadSegmentData[] = [];
  for (const route of GROUND_ROUTES) for (let i = 1; i < route.points.length; i++) {
    const a = route.points[i - 1]!, b = route.points[i]!;
    const dx = b[0] - a[0], dz = b[2] - a[2], dy = b[1] - a[1], len2 = dx * dx + dz * dz, len = Math.sqrt(len2);
    out.push({
      ax: a[0], az: a[2], ay: a[1], dx, dz, dy, len2,
      tx: dx / len, tz: dz / len, width: route.width, route: route.id,
      minX: Math.min(a[0], b[0]), maxX: Math.max(a[0], b[0]),
      minZ: Math.min(a[2], b[2]), maxZ: Math.max(a[2], b[2]),
    });
  }
  return out;
})();
export function roadSample(x: number, z: number): RoadSample {
  let bestDist2 = Infinity, bestSeg: RoadSegmentData | undefined, bestT = 0;
  for (let i = 0; i < GROUND_SEGMENTS.length; i++) {
    const s = GROUND_SEGMENTS[i]!;
    const bx = x < s.minX ? s.minX - x : x > s.maxX ? x - s.maxX : 0;
    if (bx * bx >= bestDist2) continue;
    const bz = z < s.minZ ? s.minZ - z : z > s.maxZ ? z - s.maxZ : 0;
    if (bx * bx + bz * bz >= bestDist2) continue;
    const t = clamp(((x - s.ax) * s.dx + (z - s.az) * s.dz) / s.len2);
    const px = x - s.ax - s.dx * t, pz = z - s.az - s.dz * t, d2 = px * px + pz * pz;
    if (d2 < bestDist2) { bestDist2 = d2; bestSeg = s; bestT = t; }
  }
  if (!bestSeg) return { distance: Infinity, height: 0, width: 0, route: '', tangent: [0, 1] };
  return {
    distance: Math.sqrt(bestDist2),
    height: bestSeg.ay + bestSeg.dy * bestT,
    width: bestSeg.width,
    route: bestSeg.route,
    tangent: [bestSeg.tx, bestSeg.tz],
  };
}
/** Smooth geological envelope; flattened platforms and path cuttings are part of the ground. */
export function landHeight(x: number,z: number): number {
  const edge=Math.max(Math.abs(x),Math.abs(z));
  let h=10+0.018*(z+200)+31*gaussian(x,z,-185,10,135,165)+93*gaussian(x,z,-5,270,150,145)+25*gaussian(x,z,210,30,120,155)
    +12*Math.sin(x*.013+z*.008)*Math.cos(z*.015)+smooth((edge-285)/100)*(55+30*Math.sin(x*.013-z*.017)**2);
  // The south pass falls away in the middle and retains its two wooded shoulders.
  const southPass=smooth((-z-252)/126)*smooth((383-Math.abs(x-76))/162);
  h-=southPass*(34+6*Math.cos(x*.015));
  // A broad meadow opens the valley from the postal gate; shoulders remain wooded.
  // Apply before landmark/road grading so their authoritative elevations stay fixed.
  const meadow=smooth((z+222)/23)*(1-smooth((z+85)/40))*(1-smooth((Math.abs(x)-42)/50));
  const meadowFloor=10.8+1.4*Math.cos((z+150)/70);
  h=h*(1-meadow)+Math.min(h,meadowFloor)*meadow;
  const eastShoulder=.96*gaussian(x,z,112,-68,65,90);
  const eastFloor=18.5+.035*(z+95);
  h=h*(1-eastShoulder)+Math.min(h,eastFloor)*eastShoulder;
  for(const p of Object.values(LANDMARKS)){
    const d=Math.hypot(x-p.position[0],z-p.position[2]);
    const weight=1-smooth((d-p.radius)/22); h=h*(1-weight)+p.position[1]*weight;
  }
  const road=roadSample(x,z),weight=1-smooth((road.distance-road.width*.5-1)/12);
  const ordinary=h*(1-weight)+road.height*weight,backlane=townBacklaneWeight(x,z);
  const townGround=ordinary*(1-backlane)+(backlane>0?townBacklaneGrade(x,z)*backlane:0),forest=forestClearingWeight(x,z);
  return sixthRoomGrade(x,z,postalLookoutGrade(x,z,gardenGrade(x,z,townGround*(1-forest)+(forest>0?forestClearingGrade(x,z)*forest:0))));
}
export const TERRAIN_CELL = 4;
export const visiblePathWidth=(road:Pick<RoadSample,'width'|'route'>)=>road.route==='hidden-trail'?1.35:Math.min(2.8,Math.max(1.9,road.width*.52));
/** Height of the actual narrow paving/earth shoulder and existing square junction caps. */
function pavedRouteHeight(route:Route,x:number,z:number,visible:boolean):number{
 const half=visiblePathWidth({width:route.width,route:route.id})*.5;let h=-Infinity;
 for(let i=1;i<route.points.length;i++){
  const a=route.points[i-1]!,b=route.points[i]!,dx=b[0]-a[0],dz=b[2]-a[2],len2=dx*dx+dz*dz;
  const t=((x-a[0])*dx+(z-a[2])*dz)/len2;
  if(t>=-1e-8&&t<=1+1e-8){
   const distance=Math.abs((x-a[0])*dz-(z-a[2])*dx)/Math.sqrt(len2),height=a[1]+(b[1]-a[1])*Math.max(0,Math.min(1,t));
   if(distance<=half+.12+1e-8)h=Math.max(h,height+(visible?.055:.06));
   if(distance<=half+1e-8)h=Math.max(h,height+(visible?.075:.08));
  }
 }
 for(const p of route.points)if(Math.abs(x-p[0])<=half+1e-8&&Math.abs(z-p[2])<=half+1e-8)h=Math.max(h,p[1]+.08);
 return h;
}
export const POSTAL_ROAD_JUNCTION={position:[0,14,-220] as Vec3,halfWidth:1.4};
const PAVED_ROUTES:readonly Route[]=[...GROUND_ROUTES,...LOCAL_ROUTES];
/** Same ribbons, 12cm earth shoulders and square joint caps as pathMesh.
 * Nearest-centreline ownership is not a surface query: at a bend it can select
 * the lower road, or miss a visible shoulder/joint corner entirely. */
export function pavedSurfaceHeight(x:number,z:number,visible=false):number{
 const {position:[px,py,pz],halfWidth}=POSTAL_ROAD_JUNCTION;
 if(Math.abs(x-px)<=halfWidth&&Math.abs(z-pz)<=halfWidth)return py+.08;
 let top=-Infinity;
 for(const route of PAVED_ROUTES)top=Math.max(top,pavedRouteHeight(route,x,z,visible));
 return top;
}
// Flat typed-array caches for [-400, 400) eliminate string-key allocations during terrain generation.
const resGrid = new Uint8Array(200 * 200);
const heightGrid1 = new Float32Array(800 * 800);
heightGrid1.fill(NaN);
const heightGrid4 = new Float32Array(200 * 200);
heightGrid4.fill(NaN);
const terrainResolutionFallback = new Map<string, number>(), terrainHeightFallback = new Map<string, number>();
const insideBridgeBed = (x:number,z:number) => x>=TOWN_BRIDGE_BED.west && x<=TOWN_BRIDGE_BED.east && z>=TOWN_BRIDGE_BED.south && z<=TOWN_BRIDGE_BED.north;
const touchesBridgeBed = (x:number,z:number) => x+4>=TOWN_BRIDGE_BED.west && x<=TOWN_BRIDGE_BED.east && z+4>=TOWN_BRIDGE_BED.south && z<=TOWN_BRIDGE_BED.north+3;
/** Only the small road corridor is refined. Fields and hills retain their4m voxel columns. */
export function terrainCellSize(x:number,z:number):number{
  const cx=Math.floor(x/4)*4,cz=Math.floor(z/4)*4;
  if(cx>=-400&&cx<400&&cz>=-400&&cz<400){
    const idx=((cx+400)>>2)*200+((cz+400)>>2),c=resGrid[idx]!;
    if(c!==0)return c;
    const road=roadSample(cx+2,cz+2),backlane=cx>=156&&cx<188&&cz>=12&&cz<44,forest=cx>=-192&&cx< -144&&cz>=-48&&cz<4,size=touchesBridgeBed(cx,cz)||backlane||forest||road.distance<road.width*.5+5?1:4;
    resGrid[idx]=size;return size;
  }
  const key=`${cx}/${cz}`,cached=terrainResolutionFallback.get(key);if(cached!==undefined)return cached;
  const road=roadSample(cx+2,cz+2),backlane=cx>=156&&cx<188&&cz>=12&&cz<44,forest=cx>=-192&&cx< -144&&cz>=-48&&cz<4,size=touchesBridgeBed(cx,cz)||backlane||forest||road.distance<road.width*.5+5?1:4;terrainResolutionFallback.set(key,size);return size;
}
/** Rendered column tops and pedestrian ground share this function. No broad hidden trench. */
export function columnHeight(x: number,z: number): number {
  const size=terrainCellSize(x,z),x0=Math.floor(x/size)*size,z0=Math.floor(z/size)*size;
  let gridIdx=-1;
  if(x0>=-400&&x0<400&&z0>=-400&&z0<400){
    if(size===1){gridIdx=(x0+400)*800+(z0+400);const c=heightGrid1[gridIdx]!;if(c===c)return c;}
    else{gridIdx=((x0+400)>>2)*200+((z0+400)>>2);const c=heightGrid4[gridIdx]!;if(c===c)return c;}
  }else{
    const cached=terrainHeightFallback.get(`${x0}/${z0}/${size}`);if(cached!==undefined)return cached;
  }
  const gx=x0+size*.5,gz=z0+size*.5,road=roadSample(gx,gz);let h=landHeight(gx,gz);
  // The authored building pads are level. Tiny grading tails must not round a14m
  // courtyard down to13.5m while its doorway/path and character remain at14m.
  for(const p of Object.values(LANDMARKS))if(Math.hypot(gx-p.position[0],gz-p.position[2])<p.radius&&Math.abs(h-p.position[1])<.23)h=p.position[1];
  // Cap only the column intersecting the paved ribbon so its sloped surface cannot be buried.
  // A1m corridor limits the curb to an ordinary step; flat landmark ground is never excavated.
  if(road.distance<visiblePathWidth(road)*.5+size*.72){
    const l0=roadSample(x0,z0).height,l1=roadSample(x0+size,z0).height,l2=roadSample(x0,z0+size).height,l3=roadSample(x0+size,z0+size).height;
    h=Math.min(h,Math.min(l0,l1,l2,l3)+.04);
  }
  // Grade the coarse shoulder against its uphill edge by the windmill. Sampling
  // only the cell centre here left a ledge higher than the normal jump.
  if (size === 4 && x0 === -212 && z0 >= -80 && z0 < -36) {
    h = Math.max(h, landHeight(x0 + size - .2, gz) - .35);
  }
  if(insideBridgeBed(gx,gz))h=Math.min(h,TOWN_BRIDGE_BED.ceiling);
  else if(gx>=TOWN_BRIDGE_BED.west&&gx<=TOWN_BRIDGE_BED.east&&gz>TOWN_BRIDGE_BED.north&&gz<TOWN_BRIDGE_BED.north+3){
    // Match the landward end of the lowered crossing with the first approach
    // treads so the full body and the recovery graph can cross the joint.
    h=Math.min(h,gz<TOWN_BRIDGE_BED.north+1?24.25:24.5);
  }
  const quantum=size===1?.25:.5,result=Math.floor((h+1e-7)/quantum)*quantum;
  if(gridIdx>=0){if(size===1)heightGrid1[gridIdx]=result;else heightGrid4[gridIdx]=result;}
  else terrainHeightFallback.set(`${x0}/${z0}/${size}`,result);
  return result;
}
// Away from the high trails, retain dressed pads, curbs and the authored backdrop seam.
const meadowCorners = new Float64Array(201*201).fill(NaN);
function fieldCorner(x:number,z:number,own:number):number {
  // Bring the uphill edge of the low meadow up to the adjacent trail shoulder.
  // Cap it at the adjoining fine columns, which retain their flat tops.
  if (x === -196 && z >= -84 && z <= -16) {
    let edge = landHeight(x, z) - .35;
    for (const px of [x - .01, x + .01]) {
      for (const pz of [z - .01, z + .01]) {
        if (terrainCellSize(px, pz) === 1) edge = Math.min(edge, columnHeight(px, pz));
      }
    }
    return Math.max(own, edge);
  }
  // The bell garden is built on dressed, level stone pads (walls, basin and borders).
  const gardenPad=x>=140 && x<=176 && z>=36 && z<=68;
  if(x%4 || z%4 || gardenPad || Math.abs(x)>=396 || Math.abs(z)>=396) return own;
  const index=((x+400)/4)*201+(z+400)/4;
  let shared=meadowCorners[index]!;
  if(Number.isNaN(shared)){
    const adjacent=[[x-2,z-2],[x+2,z-2],[x+2,z+2],[x-2,z+2]] as const;
    // The geological envelope is continuous even on steep flanks. A cutoff by
    // quantized slope difference produced islands of alternating pale triangles.
    shared=adjacent.every(([cx,cz])=>terrainCellSize(cx,cz)===4) ? landHeight(x,z) : Infinity;
    meadowCorners[index]=shared;
  }
  return Number.isFinite(shared) ? shared : own;
}
// Join the graded northern trails to the surrounding meadow. Both resolutions
// use the same vertex; fine vertices on a long neighbour's edge must lie on its line.
const ridgeSurface = new Map<number,number>();
function ridgeVertex(x:number,z:number):number {
  const index=(z+400)*801+x+400;
  const cached=ridgeSurface.get(index);
  if(cached!==undefined)return cached;
  const road=roadSample(x,z);
  const bed=1-smooth((road.distance-visiblePathWidth(road)*.5-1)/3);
  const height=landHeight(x,z)-.18*bed;
  ridgeSurface.set(index,height);
  return height;
}

export function meadowCorner(x:number,z:number,own:number):number {
  // Use macro-cell aligned boundaries so mixed-resolution seams meet exactly.
  if(z<=96 || Math.abs(x)>=396 || z>=396)return fieldCorner(x,z,own);
  if(x%4===0 && z%4!==0 && (terrainCellSize(x-.5,z)===4 || terrainCellSize(x+.5,z)===4)){
    const start=Math.floor(z/4)*4,t=(z-start)/4;
    return (1-t)*meadowCorner(x,start,own)+t*meadowCorner(x,start+4,own);
  }
  if(z%4===0 && x%4!==0 && (terrainCellSize(x,z-.5)===4 || terrainCellSize(x,z+.5)===4)){
    const start=Math.floor(x/4)*4,t=(x-start)/4;
    return (1-t)*meadowCorner(start,z,own)+t*meadowCorner(start+4,z,own);
  }
  const weight=smooth((z-96)/32)*smooth((396-Math.max(Math.abs(x),z))/12);
  const shared=ridgeVertex(x,z);
  return weight===1?shared:fieldCorner(x,z,own)*(1-weight)+shared*weight;
}

/** Same two triangles (NW to SE diagonal) that terrainChunk actually emits. */
export function voxelHeight(x:number,z:number,visible=false):number {
  const size=terrainCellSize(x,z),own=columnHeight(x,z);
  if(size===1 && z<96 && (!visible||x<-197||x>=-195||z<-85||z>=-15))return own;
  const cx=Math.floor(x/size)*size,cz=Math.floor(z/size)*size,u=(x-cx)/size,v=(z-cz)/size;
  const a=meadowCorner(cx,cz,own),c=meadowCorner(cx+size,cz+size,own);
  return v<=u ? (1-u)*a+(u-v)*meadowCorner(cx+size,cz,own)+v*c
    : (1-v)*a+(v-u)*meadowCorner(cx,cz+size,own)+u*c;
}
function groundTop(x:number,z:number,soilClearance:number,bridgeWalkable:boolean):number {
  const visible=soilClearance===0;
  let top=Math.max(voxelHeight(x,z,visible)+soilClearance,pavedSurfaceHeight(x,z,visible),gardenWalkingSurface(x,z,visible));
  if(inSixthRoom([x,SIXTH_ROOM.floor,z]))top=Math.max(top,SIXTH_ROOM.floor);
  if(onPostalLookout(x,z))top=Math.max(top,POSTAL_LOOKOUT_FLOOR.top);
  // Visible timber decking is a traversable 0.5m platform, within the controller's step height.
  if(x>=-10.5&&x<=9.5&&z>=228&&z<=243)top=Math.max(top,96.5);
  const bridge=TOWN_BRIDGE_DECK;
  if(bridgeWalkable&&x>=bridge.west&&x<=bridge.east&&z>=bridge.south&&z<=bridge.north)top=Math.max(top,bridge.y);
  if (x >= 158.6 && x <= 160.5 && z >= 12.3 && z <= 16.9) top=Math.max(top,bridgeStoneTop(x,z));
  return top;
}
export function terrainHeight(x:number,z:number):number {
  return groundTop(x,z,.08,true);
}

export const PHOTO_ANCHORS = Object.freeze({
  forest: FOREST_PHOTO,
  town: { view: [155,25.68,-3] as Vec3, target: [155,29,10] as Vec3, zone: [155,24,-19] as Vec3, zoneRadius: 19,
    anchors: { arch: { position: [155,27.25,9.5] as Vec3, radius: 5.25, size:[2,6,.1] as Vec3 }, mountain: { position: [154,96,268] as Vec3, radius: 24, size:[22,6,24] as Vec3 }, mailbox: { position: [160+TOWN_POSTBOX_SHIFT[0],26,5+TOWN_POSTBOX_SHIFT[2]] as Vec3, radius: 1.3, size:[2,3.25,2] as Vec3 } } },
  ridge: { view: [0,97.68,245] as Vec3, target: [0,35,-100] as Vec3, zone: [0,96,245] as Vec3, zoneRadius: 45 },
  valley: { view:[64,85.72,204] as Vec3,target:[48.568,61.842,108.132] as Vec3,
    bounds:{minX:-50,maxX:85,minZ:180,maxZ:225},
    anchors:{windmill:{position:WINDMILL_TOWER_SHAPE.position,size:WINDMILL_TOWER_SHAPE.size,radius:6.8,proxy:'windmill-tower'},
      townRoof:{position:[165.75,30.25,21] as Vec3,size:[8.5,2.5,7.5] as Vec3,radius:5.8,proxy:'town-house-east'}} },
});
export const INTERACTIONS = Object.freeze([
  ...Object.values(AFTERNOON_STOPS).map(stop=>({...stop,kind:'afternoon'})),
  { id:'postman', title:'老邮差', kind:'postman', position:[-3,14.08,-228] as Vec3, radius:4 },
  { id:'post-mailbox', title:'山口邮筒', kind:'mailbox', position:[4.5,14.08,-231.5] as Vec3, radius:3.5 },
  { id:'forest-mailbox', title:'林地邮筒', kind:'mailbox', position:[-181,38.08,-45] as Vec3, radius:3.5 },
  { id:'town-lever', title:'木屏风绞盘', kind:'lever', position:[148.75,24.08,11] as Vec3, radius:3.5 },
  { id:'town-mailbox', title:'石巷邮筒', kind:'mailbox', position:[PHOTO_ANCHORS.town.anchors.mailbox.position[0],24.08,PHOTO_ANCHORS.town.anchors.mailbox.position[2]] as Vec3, radius:3.5 },
  { id:'ridge-mailbox', title:'山脊邮筒', kind:'mailbox', position:[11.75,96.08,233.25] as Vec3, radius:3.5 },
  { id:'zipline', title:'顺风滑索', kind:'zipline', position:[-186,38.08,-16] as Vec3, radius:4.5 },
]);
export const DISCOVERIES = Object.freeze([
  { id:'hidden-trail', title:'杉影里的近路', position:[-176,38.08,-153] as Vec3, radius:9, text:'旧邮差沿杉树之间的小路抄近道。泥土里还留着许多年的脚印。' },
  { id:'old-stamp', title:'风向邮戳', position:[-182,38.08,-27] as Vec3, radius:5, text:'木桌上刻着四个风向。每次风转，邮戳上的年份便像又长大了一岁。' },
  { id:'lost-postcard', title:'墙缝里的明信片', position:[176,24.08,26] as Vec3, radius:5, text:'背面只有一句：到了以后，记得写信告诉我，山有没有变。' },
  { id:'sunset-seat', title:'两条路相遇的地方', position:[64,84.08,204] as Vec3, radius:8, text:'从这里能同时看见风车和旧镇。不同的路，终究通向同一片晚霞。' },
  { id:'wind-song', title:'风穿过松针', position:[-229,51.08,61] as Vec3, radius:8, text:'停一会儿。树梢的声音像海，这座山却从来不需要一片海。' },
  { id:'last-letter', title:'没有寄出的信', position:[158.5,24.08,51] as Vec3, radius:6, text:'信里写着：其实我知道你不会回来。但每个春天，我还是把路修好。' },
]);
const ridgeSourceBox=(id:string,min:Vec3,size:Vec3):AABB=>({id,
 min:[min[0]*.25-20,min[2]*.25+96,250-(min[1]+size[1])*.25],
 max:[(min[0]+size[0])*.25-20,(min[2]+size[2])*.25+96,250-min[1]*.25]});
/** Exact fill boxes from sealed landmark-detail-r2 ridge_railing (0.25m source grid).
 * Preserve the open east/west sides and north entrance; never collide with the railing's empty overall bounds. */
const RIDGE_RAILING_OBSTACLES:readonly AABB[]=(()=>{
 const out:AABB[]=[];
 const box=(id:string,min:Vec3,size:Vec3)=>out.push(ridgeSourceBox(`ridge-railing-${id}`,min,size));
 for(const [label,x,y,width]of [['south',38,86,80],['north-west',38,27,24],['north-east',94,27,24]]as const){
  for(const z of[2,5])box(`${label}-rail-${z}`,[x,y,z],[width,1,1]);
  for(let p=x;p<x+width;p+=8)box(`${label}-post-${p}`,[p,y,0],[1,1,8]);
 }
 for(let x=38;x<118;x+=8){box(`south-cap-${x}`,[x,85,7],[2,3,1]);box(`south-pin-${x}`,[x,85,5],[1,1,1]);}
 return out;
})();
/** Only the four actual shelter columns/feet and two bench structures, never the open shelter interior. */
const RIDGE_FURNITURE_OBSTACLES:readonly AABB[]=(()=>{
 const out:AABB[]=[];
 for(const[x,y]of [[54,37],[54,70],[103,37],[103,70]]as const){
  out.push(ridgeSourceBox(`ridge-pillar-${x}-${y}`,[x,y,0],[2,2,18]));
  out.push(ridgeSourceBox(`ridge-pillar-foot-${x}-${y}`,[x-1,y-1,0],[4,4,2]));
 }
 for(const[label,x]of [['west',48],['east',88]]as const){
  const parts:[string,Vec3,Vec3][]=[['leg-left',[x+1,65,0],[2,6,4]],['leg-right',[x+11,65,0],[2,6,4]],['seat',[x,65,4],[16,6,1]],['back',[x,70,5],[16,1,5]],['post-left',[x+1,70,0],[1,1,10]],['post-right',[x+13,70,0],[1,1,10]]];
  for(const[id,min,size]of parts)out.push(ridgeSourceBox(`ridge-bench-${label}-${id}`,min,size));
 }
 return out;
})();
/** Exact six solid parts of the reused post_bench, with the same 0.25m source conversion and scene transform. */
const SUNSET_BENCH_OBSTACLES:readonly AABB[]=([
 ['leg-left',[37,17,0],[2,6,4]],['leg-right',[47,17,0],[2,6,4]],
 ['seat',[36,17,4],[16,6,1]],['back',[36,22,5],[16,1,5]],
 ['post-left',[37,22,0],[1,1,10]],['post-right',[49,22,0],[1,1,10]],
] as const).map(([id,min,size]):AABB=>({
 id:`sunset-bench-${id}`,
 min:[64.25-(.25*(min[0]+size[0])-16)*.6,83.5+.25*min[2]*.4,210+(.25*min[1]-12)*.5],
 max:[64.25-(.25*min[0]-16)*.6,83.5+.25*(min[2]+size[2])*.4,210+(.25*(min[1]+size[1])-12)*.5],
}));
const ARCHITECTURE_OBSTACLES: readonly AABB[] = [
  ...bellRoofSolids,
  ...PRECINCT_SOLIDS,
  ...marketBodies(terrainHeight),
  ...POSTAL_PROP_SOLIDS,
  ...OPENING_POSTAL_SOLIDS,
  ...detailObstacles(afternoonProps()),
  ...nightMarketObstacles(terrainHeight),
  ...TOWN_PLANTER_SOLIDS,
  {id:'post-back',min:[-8.25,14,-240.25],max:[2.25,20,-239.5]},
  {id:'post-west',min:[-8.25,14,-240.25],max:[-7.5,20,-231.75]},
  {id:'post-east',min:[1.5,14,-240.25],max:[2.25,20,-231.75]},
  {id:'post-front-west',min:[-8.25,14,-232.5],max:[-5.25,20,-231.75]},
  {id:'post-front-east',min:[-.75,14,-232.5],max:[2.25,20,-231.75]},
  {id:'post-portal-west',min:[4.6875,14,-235.5],max:[6.7125,18.5,-233.5]},
  {id:'post-portal-east',min:[12.7875,14,-235.5],max:[14.8125,18.5,-233.5]},
  {id:'windmill-tower',min:WINDMILL_TOWER_SHAPE.min,max:WINDMILL_TOWER_SHAPE.max},
  {id:'town-arch-left',min:[149.75,24,8.5],max:[152,28.75,10.5]},
  {id:'town-arch-right',min:[158,24,8.5],max:[160.25,28.75,10.5]},
  {id:'town-house-west',min:[139.5,24,17.5],max:[148,33.25,25]},
  {id:'town-house-east',min:[161.5,24,17.25],max:[170,33.25,24.75]},
  ...COURTYARD_SOLIDS,
  ...detailObstacles(courtyardGardenBoxes(terrainHeight)),
  ...RIDGE_RAILING_OBSTACLES,
  ...RIDGE_FURNITURE_OBSTACLES,
  ...SUNSET_BENCH_OBSTACLES,
  ...HERO_MOUNTAIN_BOXES.map((b,i):AABB=>({id:`distant-crag-${i}`,min:[b.center[0]-b.size[0]/2,b.center[1]-b.size[1]/2,b.center[2]-b.size[2]/2],max:[b.center[0]+b.size[0]/2,b.center[1]+b.size[1]/2,b.center[2]+b.size[2]/2]})),
];
export const sceneryRandom=(x:number,z:number,seed=0)=>{const n=Math.sin(x*127.1+z*311.7+seed*74.7)*43758.5453;return n-Math.floor(n);};
export interface SceneryPlacement {kind:string;x:number;z:number;scale:number;yaw:number}
/** Large groves and open meadows, rather than independent full-valley sprinkling. */
export function groveFieldAt(x:number,z:number):number{
  const groves=[[-255,-170,82],[-250,25,95],[-110,85,72],[-285,215,95],[115,-180,75],[245,-55,105],[250,150,85],[135,105,65]] as const;
  return Math.max(...groves.map(([cx,cz,r])=>gaussian(x,z,cx,cz,r)));
}
/** Rendering and collision consume the same deterministic placement records. */
export const SCENERY_PLACEMENTS:readonly SceneryPlacement[]=(()=>{
  const out:SceneryPlacement[]=[];
  for(let iz=0;iz<66;iz++)for(let ix=0;ix<66;ix++){
    const x=-390+ix*12+sceneryRandom(ix,iz,1)*7,z=-390+iz*12+sceneryRandom(ix,iz,2)*7,road=roadSample(x,z);
    if(Object.values(LANDMARKS).some(l=>Math.hypot(x-l.position[0],z-l.position[2])<l.radius+7)||road.distance<road.width*.5+5)continue;
    if((Math.abs(x+170)<15&&z>-95&&z<10)||(Math.abs(x-155)<20&&z>-42&&z<80))continue;
    const r=sceneryRandom(ix,iz,3),h=landHeight(x,z),clearPostalView=z> -214&&z< -105&&Math.abs(x)<55;
    const clearHeroSilhouette=(x> -192&&x< -148&&z> -5&&z<68)||(x>125&&x<190&&z>55&&z<95);
    const grove=groveFieldAt(x,z),baseDensity=x< -80?.75:x>120?.32:.24;
    const density=clearPostalView||clearHeroSilhouette?0:baseDensity*(.03+.95*clamp((grove-.14)/.5));
    const goldGrove=Math.sin(x*.015+z*.009)+.2*(sceneryRandom(ix,iz,7)-.5)>0;
    if(r<density&&h<120)out.push({kind:x< -100?(goldGrove?'tree-gold':'tree-pine'):'tree-leaf',x,z,scale:.65+sceneryRandom(ix,iz,4)*.5+grove*.12,yaw:sceneryRandom(ix,iz,5)*Math.PI*2});
    else if(r>.92&&!clearPostalView&&!clearHeroSilhouette)out.push({kind:'prop-rock',x,z,scale:.7+sceneryRandom(ix,iz,4)*1.3,yaw:sceneryRandom(ix,iz,5)*Math.PI*2});
    else if(r<.58)out.push({kind:'prop-grass',x,z,scale:1+sceneryRandom(ix,iz,4)*1.5,yaw:0});
  }
  // Move this single crown out of the stone-arch photo cone, retaining the grove and its instance identity.
  const archViewTree=out[1608];
  if(archViewTree?.kind==='tree-leaf'&&Math.abs(archViewTree.x-155.81519386309628)<1e-6&&Math.abs(archViewTree.z-95.84388926011889)<1e-6){
    archViewTree.x=166;archViewTree.z=88;
  }
  // Appended hillside accents break up bare mid-slopes (such as behind courtyard and mid-east ridge)
  // without altering earlier indices [0..1608] or intruding on roads/sightlines.
  const hillsideAccents:readonly [string,number,number,number,number][]=[
    ['tree-pine',122,64,.95,.4],['tree-leaf',116,74,1.05,1.2],['tree-pine',106,58,.88,2.1],
    ['prop-rock',132,68,1.35,.5],['prop-rock',118,52,1.15,1.9],['tree-leaf',128,84,.9,3.1],
    ['tree-pine',196,12,.92,.8],['tree-leaf',204,24,1.05,2.4],['prop-rock',192,26,1.25,1.1],
    ['tree-gold',-114,-18,.9,.6],['tree-pine',-104,-30,.98,1.7],['prop-rock',-122,-22,1.3,.3],
    ['tree-leaf',78,-22,.92,1.5],['tree-leaf',88,-32,1.02,2.8],['prop-rock',84,-14,1.2,.9],
    ['tree-pine',-72,42,.95,1.1],['tree-gold',-64,54,.86,2.5],['prop-rock',-58,36,1.3,1.7],
    ['tree-pine',176,118,1.0,.6],['tree-leaf',186,120,1.08,1.9],['tree-pine',190,99,.92,2.7],['prop-rock',174,102,1.35,.8],
  ];
  for(const[kind,x,z,scale,yaw]of hillsideAccents){
    const road=roadSample(x,z);
    if(road.distance>=road.width*.5+5&&!Object.values(LANDMARKS).some(l=>Math.hypot(x-l.position[0],z-l.position[2])<l.radius+7)){
      out.push({kind,x,z,scale,yaw});
    }
  }
  const woodland = postalWoodland(sceneryRandom, (x, z) => {
    const road = roadSample(x, z);
    return road.distance >= road.width * .5 + 7
      && !Object.values(LANDMARKS).some(l => Math.hypot(x - l.position[0], z - l.position[2]) < l.radius + 12)
      && !pavedPrecinct(x, z)
      && !out.some(p => p.kind.startsWith('tree-') && Math.hypot(x - p.x, z - p.z) < 5.5);
  });
  out.push(...woodland);
  return out.map(p=>p.kind==='prop-rock'?{...p,yaw:rockYaw(p.yaw)}:p);
})();
export const ROUTE_SCENERY=buildRouteScenery(ROUTES,terrainHeight);
export const SOUTH_GROVES=plantGroves((x,z)=>roadSample(x,z).distance);
const planted=(p:SceneryPlacement)=>!pavedPrecinct(p.x,p.z)&&!inLaneHouse(p.x,p.z,3);
export const ROCK_PLACEMENTS = SCENERY_PLACEMENTS.map(p => p.kind === 'prop-rock' && planted(p)
  ? fitRockToSlope(p.x, p.z, p.scale, p.yaw, terrainHeight) : undefined);
const ROCK_OBSTACLES = ROCK_PLACEMENTS.flatMap((rock, i) => rock
  ? rockSolids(`scenery-rock-${i}`, rock.position, SCENERY_PLACEMENTS[i]!.scale, rock.yaw, rock.tiers) : []);

/** The two stair treads follow their carved boards. The far platform is a jump-only solid. */
export function walkingSurfaceHeight(x:number,z:number):number{
  let floor=terrainHeight(x,z);
  for(const {min,max} of SIXTH_PLATFORMS.slice(0,2)){
    if(x>=min[0]&&x<=max[0]&&z>=min[2]&&z<=max[2])floor=Math.max(floor,max[1]);
  }
  return floor;
}

/** Height of the visible tread, without collision skin. The foot reference
 * also keeps the posed sole away from distant levels below a jump or bridge. */
export function travelerVisibleSurface(x:number,z:number,referenceY:number,bridgeWalkable:boolean):number {
  let floor=groundTop(x,z,0,bridgeWalkable);
  for(const {min,max} of SIXTH_PLATFORMS){
    if(x>=min[0]&&x<=max[0]&&z>=min[2]&&z<=max[2]&&max[1]<=referenceY+.3)floor=Math.max(floor,max[1]);
  }
  if(referenceY-floor>.35){
    for(const {min,max} of ROCK_OBSTACLES){
      if(Math.abs(referenceY-max[1])>.052)continue;
      if(x>=min[0]&&x<=max[0]&&z>=min[2]&&z<=max[2])floor=Math.max(floor,max[1]);
    }
  }
  return floor;
}

/** Align old positions inside a ledge and restore saved positions on its top. */
export function rockGroundOnRestore(x:number,z:number):number{
  let floor=terrainHeight(x,z);
  for(const rock of [...ROCK_OBSTACLES,...SIXTH_PLATFORMS]){
    if(x>=rock.min[0]-.27&&x<=rock.max[0]+.27&&z>=rock.min[2]-.27&&z<=rock.max[2]+.27)floor=Math.max(floor,rock.max[1]+.015);
  }
  return floor;
}

export function nearPlayableBoundary([x,,z]:Vec3,margin=2.5):boolean{
  const {minX,maxX,minZ,maxZ}=WORLD.playableBounds;
  return Math.min(x-minX,maxX-x,z-minZ,maxZ-z)<=margin;
}

export const STATIC_OBSTACLES:readonly AABB[]=[SIXTH_PLATFORMS[2],...ARCHITECTURE_OBSTACLES,...laneHouseSolids(terrainHeight),...groveSolids(SOUTH_GROVES,terrainHeight),...detailObstacles([...SIXTH_ROOM_BOXES,...ROUTE_SCENERY.flatMap(n=>n.boxes),...FOREST_FRAME_BOXES,...townRearDetails(),...landmarkBackDetails(),...lostPostcardDisplay(terrainHeight),...TOWN_CRANK_BOXES,...ridgeForeground(terrainHeight)]),...ROCK_OBSTACLES,...SCENERY_PLACEMENTS.flatMap((p,i):AABB[]=>{
  if(p.kind==='prop-grass'||p.kind==='prop-rock'||!planted(p))return[];
  const y=terrainHeight(p.x,p.z),radius=.38*p.scale,height=8*p.scale;
  return[{id:`scenery-${i}`,min:[p.x-radius,y,p.z-radius],max:[p.x+radius,y+height,p.z+radius]}];
})];
/** Capsule-vs-AABB approximation with axis sliding; grounded Y belongs to the controller. */
export function resolveMove(position: Vec3, displacement: Vec3, radius=.28, height=1.72): MutableVec3 {
  const next:MutableVec3=[position[0],position[1]+displacement[1],position[2]];
  for(const axis of [0,2] as const){
    const {minX,maxX,minZ,maxZ}=WORLD.playableBounds;
    const min=(axis===0?minX:minZ)+radius,max=(axis===0?maxX:maxZ)-radius;
    let n=clamp(position[axis]+displacement[axis],min,max);
    const other=axis===0?2:0;
    for(const b of STATIC_OBSTACLES){
      if(next[1]+height <= b.min[1] || next[1] >= b.max[1] || next[other]+radius <= b.min[other] || next[other]-radius >= b.max[other]) continue;
      if(n+radius>b.min[axis] && n-radius<b.max[axis]){
        if(position[axis] <= b.min[axis]-radius) n=b.min[axis]-radius;
        else if(position[axis] >= b.max[axis]+radius) n=b.max[axis]+radius;
        else n=Math.abs(n-b.min[axis])<Math.abs(n-b.max[axis])?b.min[axis]-radius:b.max[axis]+radius;
      }
    }
    next[axis]=clamp(n,min,max);
  }
  return next;
}
export interface SegmentTrace { hit:boolean; point:MutableVec3; distance:number; fraction:number; obstacle?:string }
export function traceSegment(origin:Vec3,destination:Vec3,clearance=.15):SegmentTrace {
  const d:MutableVec3=[destination[0]-origin[0],destination[1]-origin[1],destination[2]-origin[2]],length=Math.hypot(...d);
  let fraction=1,obstacle:string|undefined;
  for(const b of STATIC_OBSTACLES){
    let near=0,far=1;
    for(let k=0;k<3;k++){
      if(Math.abs(d[k]!)<1e-8){if(origin[k]!<b.min[k]!-clearance||origin[k]!>b.max[k]!+clearance){near=2;break;}}
      else {let t0=(b.min[k]!-clearance-origin[k]!)/d[k]!,t1=(b.max[k]!+clearance-origin[k]!)/d[k]!;if(t0>t1)[t0,t1]=[t1,t0];near=Math.max(near,t0);far=Math.min(far,t1);}
    }
    if(near<=far&&near<fraction&&far>=0){fraction=Math.max(0,near);obstacle=b.id;}
  }
  const steps=Math.max(1,Math.ceil(length/.75));
  for(let i=1;i<=steps;i++){
    const t=i/steps;if(t>=fraction)break;
    const x=origin[0]+d[0]*t,y=origin[1]+d[1]*t,z=origin[2]+d[2]*t;
    if(y<terrainHeight(x,z)+clearance){fraction=Math.max(0,(i-1)/steps);obstacle='terrain';break;}
  }
  return{hit:fraction<1,point:[origin[0]+d[0]*fraction,origin[1]+d[1]*fraction,origin[2]+d[2]*fraction],distance:length*fraction,fraction,obstacle};
}
