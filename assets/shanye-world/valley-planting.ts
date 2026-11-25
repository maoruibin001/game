import type {AABB,Vec3} from './world-layout.ts';

export interface LaneHouse {x:number;z:number;w:number;d:number;h:number;tile:'slate'|'clay';}
export const LANE_HOUSES:readonly LaneHouse[]=[
 {x:101,z:-47,w:13,d:6.6,h:4.4,tile:'slate'}, {x:110,z:-43,w:9,d:6,h:5.1,tile:'clay'},
 {x:97,z:-59,w:13,d:7.2,h:5.6,tile:'slate'}, {x:116,z:-29,w:13.4,d:6.4,h:5.1,tile:'slate'},
 {x:121,z:-16,w:8,d:5.8,h:4.2,tile:'clay'},
 {x:170,z:-47,w:12.6,d:7,h:5.7,tile:'slate'}, {x:181.3,z:-49,w:8.5,d:6.2,h:4.5,tile:'clay'},
 {x:175.4,z:-59,w:14.5,d:6.6,h:5.4,tile:'slate'},
];
export const inLaneHouse=(x:number,z:number,margin=0)=>LANE_HOUSES.some(h=>
 Math.abs(x-h.x)<=h.w/2+1+margin&&Math.abs(z-h.z)<=h.d/2+1+margin);
type Ground=(x:number,z:number)=>number;
export function houseFoot(h:LaneHouse,ground:Ground){
 const corners=[-1,1].flatMap(i=>[-1,1].map(j=>ground(h.x+i*h.w*.47,h.z+j*h.d*.47)));
 return Math.min(ground(h.x,h.z)+.85,corners.reduce((sum,y)=>sum+y,0)/4+.32);
}
export function laneHouseSolids(ground:Ground):AABB[]{
 return LANE_HOUSES.flatMap((h,i)=>{
  const y=houseFoot(h,ground),make=(suffix:string,w:number,d:number,bottom:number,top:number):AABB=>({
   id:'valley-town/'+i+'/'+suffix,min:[h.x-w/2,bottom,h.z-d/2],max:[h.x+w/2,top,h.z+d/2]});
  return [make('walls',h.w,h.d,y-5,y+h.h),make('eaves',h.w+1.4,h.d+1.25,y+h.h-.1,y+h.h+.45),
   make('ridge',h.w+.15,h.d*.34,y+h.h+.45,y+h.h+2.15)];
 });
}
export type GroveSpecies='larch'|'fir'|'hornbeam';
export interface GroveTree {x:number;z:number;scale:number;yaw:number;species:GroveSpecies;}
const clusters:readonly (readonly [number,number,number,number,number,GroveSpecies])[]=[
 // The lanes left and right of the arch retain an open, sunlit centre.
 [76,-79,38,15,22,'hornbeam'],[90,-111,37,19,23,'fir'],[58,-132,28,17,16,'larch'],
 [194,-81,24,13,18,'hornbeam'],[220,-110,37,17,29,'fir'],[252,-170,42,17,22,'larch'],
 [30,-190,28,19,19,'hornbeam'],[-47,-181,35,15,19,'larch'],
 // Broken, overlapping woods climb the two shoulders of the southern saddle.
 [-45,-309,58,19,35,'fir'],[8,-328,53,19,34,'hornbeam'],[37,-354,43,16,25,'larch'],
 [106,-323,50,18,35,'fir'],[156,-349,55,22,40,'hornbeam'],[203,-331,44,17,26,'fir'],
 [-168,-367,46,13,32,'fir'],[-116,-353,42,15,29,'larch'],[-91,-346,31,13,19,'fir'],
 [310,-359,32,14,28,'fir'],[347,-369,31,11,22,'hornbeam'],
 [266,-314,46,16,27,'larch'],[291,-288,35,17,23,'fir'],
];
export function plantGroves(roadDistance:(x:number,z:number)=>number):GroveTree[]{
 let seed=74129;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const trees:GroveTree[]=[];
 for(const [cx,cz,rx,rz,count,main] of clusters){
  for(let i=0;i<count;i++){
   const angle=random()*Math.PI*2,r=Math.sqrt(random());
   const x=cx+rx*r*Math.cos(angle),z=cz+rz*r*Math.sin(angle)+.22*(x-cx);
   const scale=.75+random()*.65,yaw=random()*Math.PI*2,tone=random();
   if(roadDistance(x,z)<8||inLaneHouse(x,z,5)||trees.some(t=>(x-t.x)**2+(z-t.z)**2<7))continue;
   const species=tone<.78?main:main==='fir'?'hornbeam':'fir';
   trees.push({x,z,scale,yaw,species});
  }
 }
 return trees;
}
export function groveSolids(trees:readonly GroveTree[],ground:Ground):AABB[]{
 return trees.map((t,i)=>{
  const y=ground(t.x,t.z),r=.22*t.scale;
  return {id:'south-grove/'+i,min:[t.x-r,y-.16,t.z-r] as Vec3,max:[t.x+r,y+4.6*t.scale,t.z+r] as Vec3};
 });
}
