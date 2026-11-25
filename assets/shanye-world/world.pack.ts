import { afternoonProps } from './afternoon-layout.ts';
import { sixthSceneMeshes } from './sixth-portrait.ts';
import { flowerSceneMeshes } from './flower-scenes.ts';
import { NIGHT_GLOW_PALETTE, NIGHT_SPARK_COLORS, nightMeshes } from './night-art.ts';
import {MARKET_COLORS,marketFurniture,marketPaving} from './arrival-market.ts';
import {VALLEY_PALETTE,southernRanges,oldTownLane,edgeTree} from './upper-valley-art.ts';
import {inLaneHouse} from './valley-planting.ts';
import {architecture,stairCourt,stairPaving,upperHallPorch,MOUNTAIN_PALETTE} from './mountain-architecture.ts';
import {POST_STREET,MONASTERY,pavedPrecinct} from './mountain-precinct.ts';
import { postalSlopeColor } from './postal-woodland.ts';
import { appendValleyCumulus } from './valley-clouds.ts';
/** All content here is authored source. Hero architecture is compiled by Scene Foundry; macro terrain is game-authored. */
import { definePack } from '@forgeax/engine/pack/source';
import { withVertexColors } from '@forgeax/engine/geometry';
import { Instances, Materials, MeshFilter, MeshRenderer, ShadowParticipation } from '@forgeax/engine/render';
import { ChildOf, Name, Transform } from '@forgeax/engine/scene';
import type { Asset, SceneAsset, SceneEntity, TextureAsset } from '@forgeax/engine/types';
import { ok } from '@forgeax/engine/types';
import { VoxelMesh } from './voxel-mesh.ts';
import { exposedRoadSurfaces, partitionRoadTop, triangulateRoadSurface, type RoadSurface } from './road-surface.ts';
import {pavilionRoof} from './bell-pavilion.ts';
import {courtyardBronze} from './courtyard-bronze.ts';
import {courtyardFinish} from './courtyard-finish.ts';
import {courtyardHillsideTree,gardenFloor,ginkgoCanopy,ginkgoFan} from './ginkgo-garden.ts';
import { ridgeSilvergrass } from './ridge-silvergrass.ts';
import { CRAG_TIERS, ROCK_TIERS } from './rock-shape.ts';
import { COURTYARD_GARDEN_ENTITY, courtyardGardenBoxes } from './courtyard-garden.ts';
import { VALLEY_LETTER_ORIGIN, valleyLetterMeshes } from './valley-letter.ts';
import { openingEnvelopeMesh } from './opening-envelope.ts';
import { appendHeroMountain } from './hero-mountain.ts';
import { buildBackdropMesh } from './backdrop-mesh.ts';
import { TRAVELER_PALETTE, travelerMeshes } from './traveler-mesh.ts';
import { COURIER_ANKLE_Y } from './courier-costume.ts';
import { POSTAL_WET_STONE, POSTAL_DRY_STONE, POSTAL_RAIN_MATERIALS, travelerRainMaterial } from './postal-rain-layout.ts';
import { WET_SURFACES } from './environment-refs.ts';
import { SOURCE_BUNDLES } from './pipeline-sources.ts';
import { compilePipelineBundles } from './pipeline-import.ts';
import { LUNCH_STONE } from './forest-composition.ts';
import { applyForestWindmillArt, forestLunchTin } from './forest-art.ts';
import { buildRouteScenery, FOREST_FRAME_BOXES, townRearDetails, landmarkBackDetails, lostPostcardDisplay, TOWN_CRANK_BOXES, TOWN_CRANK_MARKER, ridgeForeground, type DetailBox } from './scene-details.ts';
import { WORLD_PACKAGE_ID, WORLD_SCENE_SOURCE_KEY, worldAsset, worldGuidText } from './world-refs.ts';
import { DISCOVERIES, ROUTES, SIDE_ROUTES, LOCAL_ROUTES, POSTAL_ROAD_JUNCTION, ROCK_PLACEMENTS, SCENERY_PLACEMENTS, SOUTH_GROVES, WORLD, groveFieldAt, sceneryRandom as rand, landHeight, columnHeight, meadowCorner, terrainCellSize, terrainHeight, voxelHeight, type Vec3 } from './world-layout.ts';

export const WORLD_PALETTE:Readonly<Record<string,string>>={
 // Warm meadows, deep groves and cool stone share a restrained value hierarchy.
 // Large colour masses carry the landscape; small surface grain stays secondary.
 'envelope-paper':'#fff0cf',grass:'#a5b478','grass-light':'#afba82','grass-dark':'#99a66d','grass-slope':'#859666',rock:'#88949a','rock-light':'#b5baad',earth:'#88765b',
 path:'#c6b58c','path-light':'#ddd0aa',wood:'#805c42','wood-light':'#bc955e',bark:'#604b38',leaf:'#3d604b','leaf-light':'#63805a',
 pine:'#36594b',gold:'#c1a35c','gold-light':'#d4bc7b',red:'#b9483b',cream:'#f1dfb4',iron:'#3a4747',glass:'#83b1ad',
 'reed-stem':'#b7a373','reed-leaf':'#8c9161','reed-husk':'#d6b483','reed-silk':'#f5e2bd',
 'cliff-shadow':'#667883','cliff-slate':'#8d9293','cliff-ochre':'#ac9480','cliff-sun':'#b7ac98',
 flower:'#e4d6aa','flower-red':'#c97962',skyrock:'#899fae','peak-shadow':'#405d78','peak-sun':'#718c9f',cloud:'#e9edf0','cloud-base':'#bdc9d6',skin:'#d6a67f',trousers:'#3d545c',hair:'#494236',camera:'#252e32','night-window':'#2e464d',
 'temple-tile':'#536a73','tile-edge':'#344a53','tile-cap':'#69828a','hillside-shade':'#4e6961','hillside-jade':'#688675','hillside-sun':'#879875','ink-mist':'#bdbca0','ink-sage':'#95a38e','cedar-lining':'#a87955','grove-pine':'#3d6056','grove-jade':'#587b62','grove-tip':'#80946c','temple-lacquer':'#803e30','temple-wood':'#9a6950',
 'bell-body':'#a88b56','bell-bronze':'#8a7957','bell-gold':'#d3b577','bell-patina':'#627c72','bell-inner':'#3e4b44',
 'inscription':'#e3c890','stone-deep':'#667379','stone-jade':'#909b97','stone-blue':'#849499','stone-pale':'#acb1a3','stone-lichen':'#9da498',
 'ginkgo-bark':'#66554a','ginkgo-ochre':'#bb8038','ginkgo-amber':'#dda041','ginkgo-gold':'#edbd53','ginkgo-light':'#f7d779','postal-copper':'#ad5839',
 'gravel':'#bab8a0','gravel-rake':'#a3a38e','paper-light':'#f1ce83','water-jade':'#799b95','bamboo':'#78866b','bamboo-node':'#a7a384','bamboo-leaf':'#547763',
 ...VALLEY_PALETTE,...MARKET_COLORS,...MOUNTAIN_PALETTE,...TRAVELER_PALETTE,
};
const material=(name:string)=>worldAsset(`material/${name}`);
const GRASS_TOP_TONES=['grass','grass-light','grass-dark']as const;
const RISER_NORMAL_HORIZ=.85,RISER_NORMAL_UP=Math.sqrt(1-RISER_NORMAL_HORIZ**2);
function linearSideColor(hex:string):[number,number,number,number]{
 const channel=(offset:number)=>{const s=parseInt(hex.slice(offset,offset+2),16)/255;return (s<=.04045?s/12.92:((s+.055)/1.055)**2.4)*.96;};
 return[channel(1),channel(3),channel(5),1];
}
function entity(meshKey:string,pos:Vec3=[0,0,0],extra:SceneEntity['components']={}):SceneEntity{
 return{components:{Name:{value:meshKey},Transform:{pos},MeshFilter:{assetHandle:worldGuidText(meshKey)},MeshRenderer:{materials:[]},...extra}};
}
function appendMatrix(out:number[],x:number,y:number,z:number,s:number,yaw:number):void{
 const c=Math.cos(yaw)*s,n=Math.sin(yaw)*s;out.push(c,0,-n,0,0,s,0,0,n,0,c,0,x,y,z,1);
}
/** Where a meadow meets an actual step, close exactly the exposed part of the edge. */
function terrainEdge(m:VoxelMesh,ax:number,az:number,bx:number,bz:number,h:number,other:number,n:Vec3,top:string):void {
 if(other>=h)return;
 const a=meadowCorner(ax,az,h),b=meadowCorner(bx,bz,h);
 const c=meadowCorner(ax,az,other),d=meadowCorner(bx,bz,other);
 if(a===c && b===d)return;
 const drop=h-other, material=drop>12?'rock':drop>8.5?'earth':drop>5.5?'grass-slope':top.startsWith('grass')?`${top}-side`:top;
 // Low grass risers use their true face normal. Even a partial upward tilt
 // leaves diagonal shading bands visible at the entrance's grazing angle.
 const shading=material.endsWith('-side')?n:[n[0]*RISER_NORMAL_HORIZ,RISER_NORMAL_UP,n[2]*RISER_NORMAL_HORIZ] as Vec3;
 m.quadShaded([[ax,c,az],[bx,d,bz],[bx,b,bz],[ax,a,az]],n,shading,material);
}
const uplandNormals=new Map<number,Vec3>();
function uplandNormal(x:number,z:number,face:Vec3):Vec3 {
 if(z<128||z>292||Math.abs(x)>248)return face;
 const key=(z+400)*801+x+400,previous=uplandNormals.get(key);
 if(previous)return previous;
 const radius=2;
 const dx=landHeight(x-radius,z)-landHeight(x+radius,z),dz=landHeight(x,z-radius)-landHeight(x,z+radius);
 const height=2*radius,length=Math.hypot(dx,height,dz),normal:Vec3=[dx/length,height/length,dz/length];
 uplandNormals.set(key,normal);
 return normal;
}
export function terrainChunk(x0:number,z0:number):VoxelMesh{
 const m=new VoxelMesh();
 for(let bx=x0;bx<x0+100;bx+=4)for(let bz=z0;bz<z0+100;bz+=4){
  const cell=terrainCellSize(bx,bz);
  for(let x=bx;x<bx+4;x+=cell)for(let z=bz;z<bz+4;z+=cell){
   const h=columnHeight(x,z),tone=(Math.sin(x*.009+z*.004)+.6*Math.sin(z*.013-x*.003))/1.6;
   const top=h>122?'rock':tone>.46?'grass-light':tone<-.48?'grass-dark':'grass';
   const x1=x+cell,z1=z+cell;
   const a=meadowCorner(x,z,h),b=meadowCorner(x1,z,h),c=meadowCorner(x1,z1,h),d=meadowCorner(x,z1,h);
   const nx=(a+d-b-c)/(2*cell),nz=(a+b-d-c)/(2*cell),len=Math.hypot(nx,1,nz);
   const face:Vec3=[nx/len,1/len,nz/len];
   const corners=z1>=128&&z<=292&&x1>=-248&&x<=248
     ? [uplandNormal(x,z,face),uplandNormal(x1,z,face),uplandNormal(x1,z1,face),uplandNormal(x,z1,face)] : undefined;
   m.quadShaded([[x,a,z],[x1,b,z],[x1,c,z1],[x,d,z1]],[0,1,0],face,top,corners);
   for(const [ax,az,ex,ez,n] of [[x,z,x,z1,[-1,0,0]],[x1,z,x1,z1,[1,0,0]],
     [x,z,x1,z,[0,0,-1]],[x,z1,x1,z1,[0,0,1]]] as const){
    const sx=(ax+ex)/2+n[0]*.01,sz=(az+ez)/2+n[2]*.01;
    const outside=sx< -400||sx>=400||sz< -400||sz>=400;
    const pieces=!outside && cell===4 && terrainCellSize(sx,sz)===1 ? 4 : 1;
    for(let k=0;k<pieces;k++){
     const u=k/pieces,v=(k+1)/pieces,t=(u+v)/2;
     const other=outside?Math.min(-5,h-30):columnHeight(ax+(ex-ax)*t+n[0]*.01,az+(ez-az)*t+n[2]*.01);
     terrainEdge(m,ax+(ex-ax)*u,az+(ez-az)*u,ax+(ex-ax)*v,az+(ez-az)*v,h,other,n,top);
    }
   }
  }
 }
 return m;
}

/** Landform bands seen from the high porch, painted on the existing ground. */
function colorPostalSlopes(mesh: VoxelMesh) {
 const colors = new Float32Array(mesh.vertices.length / 8 * 3);
 for (let vertex = 0, color = 0; vertex < mesh.vertices.length; vertex += 8, color += 3) {
  colors.set(postalSlopeColor(mesh.vertices[vertex]!, mesh.vertices[vertex + 2]!), color);
 }
 const result = withVertexColors(mesh.build(material), colors);
 if (!result.ok) throw result.error;
 return result.value;
}
/** Close the ribbon edge against its actual solid columns, including diagonal grid crossings. */
function roadSkirt(m:VoxelMesh,a:Vec3,b:Vec3,normal:Vec3):void{
 const dx=b[0]-a[0],dz=b[2]-a[2],cuts=[0,1];
 for(const axis of [0,2]as const){
  const delta=b[axis]-a[axis];if(Math.abs(delta)<1e-8)continue;
  for(let line=Math.floor(Math.min(a[axis],b[axis]))+1;line<Math.max(a[axis],b[axis]);line++)cuts.push((line-a[axis])/delta);
 }
 cuts.sort((u,v)=>u-v);
 for(let i=1;i<cuts.length;i++){
  const t=cuts[i-1]!,u=cuts[i]!;if(u-t<1e-8)continue;
  const x=a[0]+dx*(t+u)*.5,z=a[2]+dz*(t+u)*.5;
  const y=Math.min(voxelHeight(x-normal[0]*.001,z-normal[2]*.001),voxelHeight(x+normal[0]*.001,z+normal[2]*.001))-.01;
  const p:Vec3=[a[0]+dx*t,a[1]+(b[1]-a[1])*t,a[2]+dz*t],q:Vec3=[a[0]+dx*u,a[1]+(b[1]-a[1])*u,a[2]+dz*u];
  if(y>=Math.max(p[1],q[1]))continue;
  const bottom=Math.min(y,p[1]-.001,q[1]-.001,voxelHeight(p[0],p[2])-.01,voxelHeight(q[0],q[2])-.01);
  m.quad([[p[0],bottom,p[2]],[q[0],bottom,q[2]],q,p],normal,'earth');
 }
}
const {position:postalJunction,halfWidth:junctionHalfWidth}=POSTAL_ROAD_JUNCTION;
const meetsPostalJunction=(p:Vec3)=>p.every((coordinate,axis)=>coordinate===postalJunction[axis]);

export function pathMesh():VoxelMesh{
 const m=new VoxelMesh();
 const tops:RoadSurface[]=[];
 const top=(points:Vec3[],material:string)=>tops.push({points,material});
 const emittedCaps=new Set<string>();
 function cap(center:Vec3,width:number,depth:number,bottom:number,height:number,material:string,ownsFootprint?:true){
  const key=[center[0],center[2],width,depth,bottom,height].join('/');
  if(emittedCaps.has(key))return;
  emittedCaps.add(key);
  const points=([-1,1] as const).flatMap(z=>(z<0?[-1,1]:[1,-1]).map(x=>
   [center[0]+width*x/2,height,center[2]+depth*z/2] as Vec3));
  tops.push({points,material,ownsFootprint});
  const normals:Vec3[]=[[0,0,-1],[1,0,0],[0,0,1],[-1,0,0]];
  for(const [i,a] of points.entries()){
   const b=points[(i+1)%4]!;
   m.quad([[a[0],bottom,a[2]],[b[0],bottom,b[2]],b,a],normals[i]!,material);
  }
 }
 // Preserve the level postal crossing as the shared join, including the shallow ramp approach.
 cap(postalJunction,2*junctionHalfWidth,2*junctionHalfWidth,postalJunction[1],postalJunction[1]+.08,'path',true);
 for(const road of [...ROUTES,...SIDE_ROUTES,...LOCAL_ROUTES]){
  const pavedWidth=road.id==='hidden-trail'?1.35:Math.min(2.8,Math.max(1.9,road.width*.52));
  for(let i=1;i<road.points.length;i++){
   if(road.id==='post-lookout'&&i===1)continue; // the terrace itself is already paved
   const a=road.points[i-1]!,b=road.points[i]!,dx=b[0]-a[0],dz=b[2]-a[2],len=Math.hypot(dx,dz),steps=Math.ceil(len/3),nx=-dz/len,nz=dx/len;
   const surface=road.id==='hidden-trail'?'earth':road.id==='post-lookout'?'path-light':'path';
   const side=(p:Vec3,r:number,y:number):Vec3=>[p[0]+nx*r,y,p[2]+nz*r];
   for(let j=0;j<steps;j++){
    const t=j/steps,u=(j+1)/steps,p:Vec3=[a[0]+dx*t,a[1]+(b[1]-a[1])*t,a[2]+dz*t],q:Vec3=[a[0]+dx*u,a[1]+(b[1]-a[1])*u,a[2]+dz*u],half=pavedWidth*.5;
    // The broad graded walking corridor remains. Only its narrow middle is dirt/gravel.
    const shoulder=[side(p,-half-.12,p[1]+.055),side(p,half+.12,p[1]+.055),side(q,half+.12,q[1]+.055),side(q,-half-.12,q[1]+.055)];
    const pavement=[side(p,-half,p[1]+.075),side(p,half,p[1]+.075),side(q,half,q[1]+.075),side(q,-half,q[1]+.075)];
    top(shoulder,'earth');
    top(pavement,surface);
    for(const sign of [-1,1])roadSkirt(m,side(p,(half+.12)*sign,p[1]+.055),side(q,(half+.12)*sign,q[1]+.055),[nx*sign,0,nz*sign]);
    if(j===0)roadSkirt(m,side(p,-half-.12,p[1]+.055),side(p,half+.12,p[1]+.055),[-dx/len,0,-dz/len]);
    if(j===steps-1)roadSkirt(m,side(q,-half-.12,q[1]+.055),side(q,half+.12,q[1]+.055),[dx/len,0,dz/len]);
   }
  }
  for(const p of road.id==='post-lookout'?road.points.slice(1):road.points){
   if(meetsPostalJunction(p))continue;
   cap(p,pavedWidth,pavedWidth,p[1],p[1]+.08,road.id==='hidden-trail'?'earth':road.id==='post-lookout'?'path-light':'path');
  }
 }
 // Paving follows buildings and use, rather than covering whole landmark clearings.
 const pads:{center:Vec3;size:Vec3}[]=[
  {center:[-3,14.035,-230.5],size:[12,.05,7]},
  {center:[-170,38.035,-21],size:[9,.05,9]},
  {center:[-174.125,38.035,-41],size:[1.6,.05,1.5]},
  {center:[-165.875,38.035,-41],size:[1.6,.05,1.5]},
  {center:[-180.25,38.035,-35.75],size:[5,.05,2.4]},
  {center:[155,24.035,12.5],size:[5.5,.05,5]},
  {center:[158.5,24.035,49.5],size:[7,.05,7]},
 ];
 for(const {center,size} of pads)cap(center,size[0],size[2],center[1]-size[1]/2,center[1]+size[1]/2,'road-stone');
 function emit(points: readonly Vec3[], source: RoadSurface, tone: string) {
  if(points===source.points){m.quad(points,[0,1,0],tone);return;}
  // Preserve the original ribbon's UVs after junction or eave-edge clipping.
  const [origin,u,,v]=source.points as readonly [Vec3, Vec3, Vec3, Vec3];
  const ux=u[0]-origin[0],uz=u[2]-origin[2],vx=v[0]-origin[0],vz=v[2]-origin[2];
  for(const [a,b,c] of triangulateRoadSurface(points)){
   const vertices=[a,b,c,a],first=m.vertices.length;
   m.quad(vertices,[0,1,0],tone);
   for(const [index,p] of vertices.entries()){
    const x=p[0]-origin[0],z=p[2]-origin[2];
    m.vertices[first+index*8+6]=(x*ux+z*uz)/(ux*ux+uz*uz);
    m.vertices[first+index*8+7]=(x*vx+z*vz)/(vx*vx+vz*vz);
   }
  }
 }
 for(const {points,source} of exposedRoadSurfaces(tops)){
  const tone = source.material;
  if (tone!=='path'&&tone!=='road-stone') {emit(points,source,tone);continue;}
  const postal = partitionRoadTop(points,POSTAL_WET_STONE);
  for (const outside of postal.outside) emit(outside,source,tone);
  if (!postal.inside.length) continue;
  const roof = partitionRoadTop(postal.inside,POSTAL_DRY_STONE);
  for (const exposed of roof.outside) emit(exposed,source,`postal-rain/exposed-${tone}`);
  if (roof.inside.length) emit(roof.inside,source,`postal-rain/sheltered-${tone}`);
 }
 return m;
}
type CrownProfile=0|1|2;
function tree(kind:'pine'|'leaf'|'gold',profile:CrownProfile=0):VoxelMesh{
 // Every variant retains the original trunk and stays inside its species' crown
 // envelope. Instance positions/scales remain owned by world-layout collision.
 const m=new VoxelMesh();m.box([0,4,0],[.8,8,.8],'bark');
 if(kind==='pine'){
  const layers:readonly [Vec3,Vec3][]=[
   [[0,4.5,0],[7,1.4,6.3]],[[-.35,5.95,.2],[5.8,1.6,5.5]],
   [[.22,7.45,-.12],[4.6,1.65,4.4]],[[-.16,8.95,.1],[3.4,1.5,3.2]],[[.12,10.5,0],[1.9,1.4,1.85]],
  ];
  layers.forEach(([center,size],i)=>m.box(center,size,i===3?'leaf':'pine'));
 }else{
  const leaf=kind==='gold'?'gold':'leaf',light=kind==='gold'?'gold-light':'leaf-light';
  if(profile===1){
   // Tighter crowns in grove interiors let the wider edge trees read as a group.
   m.box([0,7.6,0],[4.6,3.1,4.5],leaf);m.box([-.75,8.6,.25],[4.6,2.2,4.8],leaf);
   m.box([.45,9.9,.1],[3.6,1.7,3.7],light);m.box([-.05,10.65,.1],[2.4,.55,2.5],light);
   m.box([1.35,7.25,-1.2],[2.7,2.1,2.8],leaf);m.box([-.8,6.2,1],[3,2,3],leaf);
  }else if(profile===2){
   // Offset, lower shoulders break the repeated lollipop silhouette at grove edges.
   m.box([-.6,7.9,.2],[5.6,2.6,5.3],leaf);m.box([-2.35,7.05,.65],[3.7,2.2,3.7],leaf);
   m.box([1.9,8.65,-1.25],[3.7,2.3,3.5],light);m.box([.8,9.8,-.6],[3.9,1.5,4.1],light);
   m.box([-.65,6.25,.9],[3.6,2.1,3.4],leaf);m.box([1.1,10.65,-.65],[2.5,.55,2.7],light);
   m.box([-2.3,8.55,.85],[2.9,.9,2.7],light);
  }else{
   // Broad, connected clusters retain the original maximum crown footprint.
   m.box([0,8.1,0],[5.8,2.5,5.7],leaf);m.box([-2.3,7.2,.8],[3.8,2.3,3.7],leaf);
   m.box([2.2,8,-1.5],[3.6,2.4,3.8],leaf);m.box([.5,9.8,.2],[4.4,1.4,4.3],light);
   m.box([-.8,6.2,1.2],[3.4,2,3.3],leaf);m.box([.3,10.65,.15],[2.8,.55,2.6],light);
   m.box([-3.1,7.1,.7],[1.1,1.3,2.1],leaf);m.box([2.4,9.25,-1.5],[1.5,.5,2.4],light);
  }
 }
 return m;
}
function crownProfile(x:number,z:number):CrownProfile{
 const grove=groveFieldAt(x,z);
 // Low-frequency patches coordinate neighbouring crowns; there is no extra
 // scattering, removed tree, changed trunk scale or new collision footprint.
 const patch=Math.sin(x*.037+z*.021)+.45*Math.sin(z*.049-x*.013);
 return grove>.62?1:patch>.1?2:0;
}
export function propMesh(kind:'rock'|'crag'|'grass'|'flower'|'mailbox'|'sign'):VoxelMesh{
 const m=new VoxelMesh();
 if(kind==='rock'||kind==='crag')for(const tier of (kind==='rock'?ROCK_TIERS:CRAG_TIERS))m.box(tier.center,tier.size,tier.material);
 if(kind==='grass'){m.box([0,.095,0],[.08,.19,.08],'grass-dark');m.box([.15,.075,.08],[.07,.15,.07],'grass-light');m.box([-.14,.055,-.1],[.09,.11,.09],'grass-light');}
 if(kind==='flower'){
  const offsets=[[-.33,0],[-.1,.24],[.2,-.12],[.4,.15],[.02,-.3]] as const;
  offsets.forEach(([x,z],i)=>{const h=.14+(i%3)*.035;m.box([x,h*.5,z],[.035,h,.035],'leaf');m.box([x+.045,h*.38,z],[.13,.035,.07],'leaf-light');m.box([x,h+.025,z],[.14,.05,.14],i===3?'flower-red':'flower');});
 }
 if(kind==='mailbox'){m.box([0,.55,0],[.8,1.1,.8],'iron');m.box([0,1.65,0],[1.35,1.4,1.2],'red');m.box([0,2.4,0],[1.55,.2,1.4],'red');m.box([0,1.9,-.62],[.8,.14,.04],'iron');m.box([0,1.4,-.62],[.6,.45,.04],'cream');}
 if(kind==='sign'){m.box([0,1.4,0],[.26,2.8,.26],'wood');m.box([.5,2.4,0],[2.8,.5,.2],'wood-light');m.box([-.5,1.85,0],[2.6,.45,.2],'cream');m.box([1.3,2.4,-.13],[.3,.3,.08],'red');}
 return m;
}
function landmarksExtras():VoxelMesh{
 const m=new VoxelMesh();
 // Sturdy fixed cable and landing gates. Animation follows this same authored line.
 const cable=[WORLD.zipline.start,...WORLD.zipline.points,WORLD.zipline.end].map(p=>[p[0],p[1]+1.6,p[2]] as Vec3);
 for(let i=1;i<cable.length;i++)m.beam(cable[i-1]!,cable[i]!, .065,.065,'iron');
 for(const p of cable){const y=terrainHeight(p[0],p[2]);for(const side of [-1,1])m.box([p[0]+side*1.7,(y+p[1])/2,p[2]],[.35,p[1]-y,.35],'wood');m.box([p[0],p[1],p[2]],[4.2,.4,.4],'wood-light');}
 // Small paper objects make optional discoveries visibly present in the world.
 for(const d of DISCOVERIES){
  if(d.id==='lost-postcard'||d.id==='last-letter')continue; // Both now have real solid roadside/wall displays, leaving the lane clear.
  if(d.id==='sunset-seat'){
   // The discovery stays at its authored route junction; the separate letter entities rest on the nearby bench.
   m.box([68.15,83.375,206.5],[.4,.25,.85],'rock');
   continue;
  }
  const y=terrainHeight(d.position[0],d.position[2]);m.box([d.position[0],y+.8,d.position[2]],[1.25,.3,1],'wood');m.box([d.position[0],y+1,d.position[2]],[.65,.08,.45],'cream');m.box([d.position[0]+.2,y+1.05,d.position[2]-.1],[.12,.03,.12],'red');
 }
 return m;
}
function distantMountains():VoxelMesh{
 const m=buildBackdropMesh();
 // The photo's distant crag is a real silhouette, not an invisible scoring point.
 appendHeroMountain(m);
 return m;
}
export function detailMesh(boxes:readonly DetailBox[]):VoxelMesh{
 const mesh=new VoxelMesh();for(const box of boxes)mesh.box(box.center,box.size,box.material);return mesh;
}
function clouds():VoxelMesh{
 const m=new VoxelMesh();
 appendValleyCumulus(m);
 for(let i=0;i<20;i++){
  const x=rand(i,2)*1400-700,z=rand(i,3)*1400-700,y=210+rand(i,4)*80;
  // Keep the old wisps outside the new valley composition.
  if(z>-140&&x>=-460&&x<=520)continue;
  // Layered distant vapour: broad sunlit bellies, tapered ends and one small offset curl.
  const scale=.68+rand(i,5)*.68,heading=.18+rand(i,6)*.36;
  const wisp=(along:number,up:number,across:number,length:number,height:number,width:number)=>{
   const origin=m.vertices.length;
   m.box([x+scale*(along*Math.cos(heading)+across*Math.sin(heading)),y+up*scale,
     z+scale*(-along*Math.sin(heading)+across*Math.cos(heading))],[length*scale,height*scale,width*scale],'cloud',heading);
   // Cloud bellies scatter skylight. Preserve the diurnal light colour without a dark solid underside.
   for(let k=origin;k<m.vertices.length;k+=8){
    const nx=m.vertices[k+3]!*.24,ny=.90+m.vertices[k+4]!*.10,nz=m.vertices[k+5]!*.24,len=Math.hypot(nx,ny,nz);
    m.vertices[k+3]=nx/len;m.vertices[k+4]=ny/len;m.vertices[k+5]=nz/len;
   }
  };
  wisp(-15,.3,0,43,3.5,17); wisp(-3,2.8,-2,31,5.1,21);
  wisp(11,1.8,0,27,4.0,16); wisp(23,.2,-1.1,26,2.2,9); wisp(37,-.1,-1.8,17,1,4);
  if(i%3!==0)wisp(-12,-3.7,10,26,1.25,6);

 }return m;
}
function birdMesh():VoxelMesh{
 const m=new VoxelMesh();
 m.box([0,0,0],[.22,.16,.7],'cream');
 m.box([-.42,.04,.04],[.65,.06,.24],'cream');
 m.box([.42,.04,.04],[.65,.06,.24],'cream');
 m.box([-.78,.06,.08],[.18,.05,.16],'wood-light');
 m.box([.78,.06,.08],[.18,.05,.16],'wood-light');
 return m;
}
function grainTexture(seed:number,low:number,high:number):TextureAsset{
 const cells=32,block=4,size=cells*block,data=new Uint8Array(size*size*4);
 for(let cy=0;cy<cells;cy++)for(let cx=0;cx<cells;cx++){
  const v=Math.round(low+rand(cx,cy,seed)*(high-low));
  for(let dy=0;dy<block;dy++)for(let dx=0;dx<block;dx++){
   const i=((cy*block+dy)*size+(cx*block+dx))*4;
   data[i]=v;data[i+1]=v;data[i+2]=v;data[i+3]=255;
  }
 }
 return{kind:'texture',shape:{viewDimension:'2d',extent:{width:size,height:size}},format:'rgba8unorm',data,colorSpace:'linear',mips:{kind:'generate'}};
}
// Leaves and timber read through shape and palette, without identical grey noise.
const TEXTURED_SURFACES=new Set(['grass','grass-light','grass-dark','grass-slope','earth','rock','rock-light']);
export function buildWorldContent():Record<string,Asset>{
 const resources:Record<string,Asset>={},entities:Record<string,SceneEntity>={};
 resources['texture/voxel-grain']=grainTexture(17,240,255);
 resources['texture/stone-grain']=grainTexture(53,232,255);
 const grainRef={texture:worldAsset('texture/voxel-grain')},stoneRef={texture:worldAsset('texture/stone-grain')};
 for(const[name,hex]of Object.entries(WORLD_PALETTE)){
  const useStone=name==='rock'||name==='rock-light'||name==='earth';
  const textured=TEXTURED_SURFACES.has(name);
  resources[`material/${name}`]=Materials.standard({baseColor:hex,roughness:useStone?.94:.88,metallic:name==='iron'?.18:name.startsWith('bell-')?.26:0,
   ...(textured?{baseColorTexture:useStone?stoneRef:grainRef,triplanar:{space:'world',scale:.35,sharpness:8}}:{}),
   ...(name==='paper-light'?{emissive:[1,.61,.24],emissiveIntensity:.23}:{}),
   ...(name==='night-window'?{emissive:[0,0,0],emissiveIntensity:0}:{})});
 }
 // One fixed linear-light ratio for each matching grass top/side pair. This
 // preserves hue and broad meadow bands; it never assigns a colour per cell.
 for(const name of GRASS_TOP_TONES)resources[`material/${name}-side`]=Materials.standard({
  baseColor:linearSideColor(WORLD_PALETTE[name]!),roughness:.88,metallic:0,
  baseColorTexture:grainRef,triplanar:{space:'world',scale:.35,sharpness:8},
 });
 for(const surface of WET_SURFACES)resources[`material/${surface.materialKey}`]=Materials.standard({baseColor:[...surface.dryColor],roughness:surface.dryRoughness,
  ...(surface.materialKey==='path'||surface.materialKey==='road-stone'?{baseColorTexture:stoneRef,triplanar:{space:'world',scale:.45,sharpness:8}}:{})});
 for (const tone of ['path','road-stone']) for (const edge of ['sheltered','exposed'])
  resources[`material/postal-rain/${edge}-${tone}`]={...resources[`material/${tone}`]!};
 for (const [group,tones] of Object.entries(POSTAL_RAIN_MATERIALS))
  for (const tone of tones) resources[`material/traveler-rain/${group}/${tone}`]={...resources[`material/${tone}`]!};
 for(const [name,{color,intensity}] of Object.entries(NIGHT_GLOW_PALETTE)){
  resources[`material/${name}`]=Materials.standard({baseColor:[...color,1],roughness:.9,emissive:color,emissiveIntensity:intensity});
 }
 const add=(name:string,m:VoxelMesh,pos:Vec3=[0,0,0])=>{const key=`mesh/${name}`;resources[key]=m.build(material);entities[name]=entity(key,pos);};
 const shop=sixthSceneMeshes();
 add('photo-shop/fixed',shop.fixed);
 resources['mesh/photo-shop/door']=shop.door.build(material);
 resources['mesh/photo-shop/inside']=shop.inside.build(material);
 resources['mesh/photo-shop/old']=shop.old.build(material);
 resources['mesh/photo-shop/restored']=shop.restored.build(material);
 const extraLandmarks=landmarksExtras();
 resources['mesh/night/moon-riddle']=flowerSceneMeshes(extraLandmarks).build(material);
 const night=nightMeshes(terrainHeight);
 for(const name of ['fences','racks','markers'] as const)add(`night/${name}`,night[name]);
 for(const name of ['gate','stalls','fish','bundle','scarlet','ghost','torch','promise','pole'] as const)resources[`mesh/night/${name}`]=night[name].build(material);
 for(const color of NIGHT_SPARK_COLORS){
  const mesh=new VoxelMesh(),key=`night/spark-${color}`;
  mesh.box([0,0,0],[1,1,1],`night-spark-${color}`);
  resources[`mesh/${key}`]=mesh.build(material);
 }
 // 64 cullable terrain chunks, not one Entity per voxel.
 for(let z=-400;z<400;z+=100)for(let x=-400;x<400;x+=100){
  const name = `terrain/${(x+400)/100}-${(z+400)/100}`;
  const mesh = terrainChunk(x,z);
  if (x < -100 || x > 200 || z < 0 || z > 200) add(name,mesh);
  else {
   const meshKey = `mesh/${name}`;
   resources[meshKey] = colorPostalSlopes(mesh);
   entities[name] = entity(meshKey);
  }
 }
 add('roads',pathMesh());
 entities.roads={...entities.roads!,components:{...entities.roads!.components,ShadowParticipation:{cast:false,receive:true}}};
 add('landmark-extras',extraLandmarks);
 const opening = 'architecture/post-opening-envelope', openingKey = `mesh/${opening}`;
 resources[openingKey] = openingEnvelopeMesh(material);
 entities[opening] = entity(openingKey);
 add('distant-mountains',distantMountains());
 entities['distant-mountains']={...entities['distant-mountains']!,components:{...entities['distant-mountains']!.components,ShadowParticipation:{cast:false,receive:true}}};
 add('landscape/southern-ranges',southernRanges());
 const ranges=entities['landscape/southern-ranges']!;
 entities['landscape/southern-ranges']={...ranges,components:{...ranges.components,ShadowParticipation:{cast:false,receive:true}}};
 add('architecture/south-lane',oldTownLane(terrainHeight));
 add('clouds',clouds());
 entities.clouds={...entities.clouds!,components:{...entities.clouds!.components,ShadowParticipation:{cast:false,receive:false}}};
 resources['mesh/ambient-bird']=birdMesh().build(material);
 for(const[i,pos]of [[0,[-135,58,-60]],[1,[-65,64,-120]],[2,[75,54,-85]],[3,[115,62,45]]]as const){
  entities[`ambient/bird-${i}`]=entity('mesh/ambient-bird',pos,{ShadowParticipation:{cast:false,receive:false}});
 }
 for(const kind of ['pine','leaf','gold']as const){
  resources[`mesh/tree-${kind}`]=tree(kind).build(material);
  if(kind!=='pine')for(const profile of [1,2]as const)resources[`mesh/tree-${kind}-${profile}`]=tree(kind,profile).build(material);
 }
 resources['mesh/tree-courtyard-hillside']=courtyardHillsideTree().build(material);
 for(const kind of ['rock','crag','grass','flower','mailbox','sign']as const)resources[`mesh/prop-${kind}`]=propMesh(kind).build(material);
 const carriers=new Map<string,{mesh:string;matrices:number[]}>();
 const instance=(kind:string,x:number,z:number,scale:number,yaw:number,y=terrainHeight(x,z))=>{
  let cell = `${Math.floor((x + 400) / 100)}-${Math.floor((z + 400) / 100)}`;
  // The north shoulder is visible as a whole. Keep its pines in the two
  // neighbouring foothill carriers instead of drawing more small batches.
  if (kind === 'tree-pine' && x >= -100 && x < 200 && z >= 100 && z < 200) cell = x < 0 ? '3-4' : '5-4';
  const key = `vegetation/${kind}/${cell}`, group = carriers.get(key) ?? { mesh: `mesh/${kind}`, matrices: [] };
  appendMatrix(group.matrices,x,y,z,scale,yaw);carriers.set(key,group);
 };
 for(const species of ['larch','fir','hornbeam'] as const)resources['mesh/edge-'+species]=edgeTree(species).build(material);
 for(const tree of SOUTH_GROVES)instance('edge-'+tree.species,tree.x,tree.z,tree.scale,tree.yaw);
 for(const [index,p] of SCENERY_PLACEMENTS.entries()){
  if(p.kind==='prop-rock'){
   const rock=ROCK_PLACEMENTS[index];
   if(rock)instance(rock.tiers===ROCK_TIERS?'prop-rock':'prop-crag',p.x,p.z,p.scale,rock.yaw,rock.position[1]);
   continue;
  }
  if(pavedPrecinct(p.x,p.z)||inLaneHouse(p.x,p.z,3))continue;
  if(p.kind==='prop-grass'){
   // Named patches at grove edges leave the broad meadow quiet; no regularly spaced spikes across the entire valley.
   const patches=[[-70,-100,40],[-250,25,56],[112,-150,40],[245,145,52],[70,80,34]] as const;
   const patch=Math.max(...patches.map(([x,z,r])=>Math.exp(-((p.x-x)**2+(p.z-z)**2)/(r*r))));
   if(patch<.32||rand(p.x,p.z,31)>.55)continue;
  }
  if(p.kind==='tree-leaf'&&p.x>=139&&p.x<=210&&p.z>=68&&p.z<=111){
   instance('tree-courtyard-hillside',p.x,p.z,p.scale,p.yaw);
   continue;
  }
  const profile=p.kind==='tree-leaf'||p.kind==='tree-gold'?crownProfile(p.x,p.z):0;
  instance(profile?`${p.kind}-${profile}`:p.kind,p.x,p.z,p.scale,p.yaw);
 }
 for(const road of ROUTES)for(let i=1;i<road.points.length;i++){
  const a=road.points[i-1]!,b=road.points[i]!,dx=b[0]-a[0],dz=b[2]-a[2],len=Math.hypot(dx,dz);
  for(let d=6;d<len;d+=9+rand(i,d,17)*7){
   if(rand(i,d,23)>.55)continue;
   const t=d/len,side=rand(i,d,3)>.5?1:-1,pavedHalf=Math.min(2.8,Math.max(1.9,road.width*.52))*.5,offset=pavedHalf+.6+rand(i,d,9)*1.2;
   const x=a[0]+dx*t-dz/len*offset*side,z=a[2]+dz*t+dx/len*offset*side;instance('prop-flower',x,z,.85+rand(x,z)*.35,rand(x,z,2)*6);
  }
 }
 for(const[key,g]of carriers){
  const noShadow=key.startsWith('vegetation/prop-flower/')||key.startsWith('vegetation/prop-grass/');
  entities[key]=entity(g.mesh,[0,0,0],{Instances:{transforms:g.matrices},...(noShadow?{ShadowParticipation:{cast:false,receive:true}}:{})});
 }
 for(const[p,id]of [[[-181,38.08,-45],'forest-mailbox']]as const)entities[`props/${id}`]=entity('mesh/prop-mailbox',p);
 for(const p of [[-34,16,-190],[38,13,-185],[-170,38,-35],[155,24,20],[-42,92,220],[64,84,204]]as const)entities[`sign/${p[0]}-${p[2]}`.replaceAll('-','n')]=entity('mesh/prop-sign',[p[0]+4,terrainHeight(p[0]+4,p[2]),p[2]]);
 const pipeline=compilePipelineBundles(SOURCE_BUNDLES);Object.assign(resources,pipeline.resources);Object.assign(entities,pipeline.entities);
 applyForestWindmillArt(resources,entities);
 // Static scene details retain separate semantic identities and use the same boxes as collision.
 for(const node of buildRouteScenery(ROUTES,terrainHeight))add(node.id,detailMesh(node.boxes));
 add('props/town-rear-details',detailMesh(townRearDetails()));
 add('props/afternoon-postal-stops',detailMesh(afternoonProps()));
 add('props/landmark-back-details',detailMesh(landmarkBackDetails()));
 add(COURTYARD_GARDEN_ENTITY,detailMesh(courtyardGardenBoxes(terrainHeight)));
 for(const hall of [...POST_STREET,...MONASTERY])add('architecture/'+hall.id,architecture([hall],terrainHeight));
 add('architecture/print-yard',marketFurniture(terrainHeight));add('architecture/print-yard-paving',marketPaving(terrainHeight));
 add('architecture/stair-paving',stairPaving());
 // The terrace below provides its bulk shadow. The exposed treads receive shadows
 // from roofs, railings and the traveller without reprojecting every thin nosing.
 const paving=entities['architecture/stair-paving']!;
 entities['architecture/stair-paving']={...paving,components:{...paving.components,ShadowParticipation:{cast:false,receive:true}}};
 add('architecture/stair-court',stairCourt());add('architecture/upper-hall-porch',upperHallPorch());
 add('props/bell-roof',pavilionRoof());add('props/courtyard-joinery',courtyardFinish());
 add('props/courtyard-paving',gardenFloor(terrainHeight));add('props/courtyard-ginkgo',ginkgoCanopy(terrainHeight));
 resources['mesh/hero/town-courtyard/town-courtyard-bell']=courtyardBronze().build(material);
 const leaf=new VoxelMesh();ginkgoFan(leaf,[0,0,0],.13,.6,.40,'ginkgo-light');
 resources['mesh/courtyard-drifting-fan']=leaf.build(material);
 for(let i=0;i<5;i++)entities['ambient/ginkgo-'+i]=entity('mesh/courtyard-drifting-fan',[168,30,53],{ShadowParticipation:{cast:false,receive:true}});
 add('props/lost-postcard-display',detailMesh(lostPostcardDisplay(terrainHeight)));
 add(TOWN_CRANK_MARKER,detailMesh(TOWN_CRANK_BOXES));
 add('props/ridge-foreground',detailMesh(ridgeForeground(terrainHeight)));
 add('props/ridge-silvergrass',ridgeSilvergrass(terrainHeight));
 const grass=entities['props/ridge-silvergrass']!;
 entities['props/ridge-silvergrass']={...grass,components:{...grass.components,ShadowParticipation:{cast:false,receive:true}}};
 // Replace the oversized imported frame through its original stable asset/entity identity.
 const frameKey='hero/forest-windmill/wind-chime-frame';
 resources[`mesh/${frameKey}`]=detailMesh(FOREST_FRAME_BOXES).build(material);
 entities[frameKey]=entity(`mesh/${frameKey}`);
 // Reuse the sealed Scene Foundry post_bench resource: 2.4m wide, 0.50m seat, south-facing.
 // Its source-local foot centre is [-5,0,7]; this origin accounts for that before rotation.
 entities['props/sunset-bench']=entity('mesh/hero/post-office/post-bench',[64.25,83.5,210],{Name:{value:'留给你的长椅'},Transform:{pos:[64.25,83.5,210],quat:[0,1,0,0],scale:[.6,.4,.5]}});
 const lunchKey='props/forest-lunch-tin';
 resources[`mesh/${lunchKey}`]=forestLunchTin().build(material);
 entities[lunchKey]=entity(`mesh/${lunchKey}`,LUNCH_STONE,{Name:{value:'阿禾的搪瓷饭盒'},Transform:{pos:LUNCH_STONE,scale:[0,0,0]}});
 const letter=valleyLetterMeshes();
 add('props/valley-letter-folded',letter.folded,VALLEY_LETTER_ORIGIN);
 add('props/valley-letter-opened',letter.opened,VALLEY_LETTER_ORIGIN);
 entities['props/valley-letter-opened']=entity('mesh/props/valley-letter-opened',VALLEY_LETTER_ORIGIN,{Transform:{pos:VALLEY_LETTER_ORIGIN,scale:[0,0,0]}});
 // A real source-authored traveller rig: arms/legs pivot at shoulders/hips.
 for(const[key,m]of Object.entries(travelerMeshes(false,true)))
  resources[`mesh/traveler-${key}`]=m.build(tone=>material(travelerRainMaterial(key,tone)));
 entities.traveler={components:{Name:{value:'山野旅人'},Transform:{pos:WORLD.spawn,quat:[0,1,0,0]}}};
 const part=(key:string,mesh:string,pos:Vec3)=>{entities[`traveler/${key}`]=entity(`mesh/traveler-${mesh}`,pos,{ChildOf:{parent:'traveler'},ShadowParticipation:{cast:true,receive:true}});};
 part('body','body',[0,0,0]);part('head','head',[0,1.48,0]);part('left-arm','arm',[-.33,1.25,0]);part('right-arm','arm',[.33,1.25,0]);part('left-leg','leg',[-.13,.57,0]);part('right-leg','leg',[.13,.57,0]);part('camera','camera',[.29,.87,-.14]);
 part('left-shoe','shoe',[-.13,.57+COURIER_ANKLE_Y,0]);part('right-shoe','shoe',[.13,.57+COURIER_ANKLE_Y,0]);
 part('letter','letter',[0,1.05,-.36]);entities['traveler/letter']={components:{...entities['traveler/letter']!.components,Transform:{pos:[0,1.05,-.36],scale:[0,0,0]}}};
 // The postal keeper shares authored geometry but is a distinct static character.
 const master=travelerMeshes(true);
 for(const key of ['body','head','arm','leg'] as const)resources['mesh/postmaster-'+key]=master[key]!.build(material);
 entities.postman=entity('mesh/postmaster-body',[-3,14.08,-228]);
 entities['postman/head']=entity('mesh/postmaster-head',[-3,15.56,-228]);
 for(const[x,id]of [[-.13,'left'],[.13,'right']]as const)entities[`postman/${id}-leg`]=entity('mesh/postmaster-leg',[-3+x,14.65,-228]);
 for(const[x,id]of [[-.33,'left'],[.33,'right']]as const)entities[`postman/${id}-arm`]=entity('mesh/postmaster-arm',[-3+x,15.33,-228]);
 const scene:SceneAsset={kind:'scene',entities};resources[WORLD_SCENE_SOURCE_KEY]=scene;
 return resources;
}
export default definePack({schemaVersion:'2.0.0',packageId:WORLD_PACKAGE_ID,name:'拍一卷山色 / 800m Valley and Scene Foundry architecture',
 sceneComponents:[Name,Transform,ChildOf,MeshFilter,MeshRenderer,Instances,ShadowParticipation],build:()=>ok(buildWorldContent())});
