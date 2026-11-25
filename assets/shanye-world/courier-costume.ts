import type {Vec3} from './world-layout.ts';
import {VoxelMesh} from './voxel-mesh.ts';

export const COURIER_PALETTE={
 'mail-indigo':'#354c64','mail-blue':'#526c84','mail-rain':'#719197','mail-hem':'#839d99',
 'mail-rust':'#a23e35','mail-vermilion':'#dc6950','mail-thread':'#e7c19a','mail-brass':'#d5a75c',
 'mail-wicker':'#c79859','mail-weave':'#e3c17c','mail-straw-shade':'#a97e4d','mail-flap':'#ad7049',
 'mail-envelope':'#f4e6c0','mail-hair':'#433c3b','mail-wrap':'#b7b5a2','mail-sole':'#393e46',
};
type Oval={y:number;rx:number;rz:number;dx?:number;dz?:number};
function ring(m:VoxelMesh,rings:readonly Oval[],mats:readonly string[],n=12,tilt=0){
 const at=(r:Oval,j:number):Vec3=>{const a=(j+.5)*2*Math.PI/n,x=r.rx*Math.cos(a);return [x+(r.dx??0),r.y+tilt*x,(r.dz??0)+r.rz*Math.sin(a)];};
 for(let i=1;i<rings.length;i++){
  const lo=rings[i-1]!,hi=rings[i]!;
  for(let j=0;j<n;j++){
   const a=(j+1)*2*Math.PI/n,dx=Math.cos(a),dz=Math.sin(a);
   const radial=(hi.rx-lo.rx)*dx*dx+(hi.rz-lo.rz)*dz*dz,dy=hi.y-lo.y,norm=Math.hypot(dy,radial)||1;
   m.quad([at(lo,j),at(lo,j+1),at(hi,j+1),at(hi,j)],[dx*dy/norm,-radial/norm,dz*dy/norm],mats[i-1]!);
  }
 }
 for(const [r,sign,mat]of [[rings[0]!,-1,mats[0]!],[rings.at(-1)!,1,mats.at(-1)!]]as const){
  const center:Vec3=[r.dx??0,r.y,r.dz??0];
  for(let j=0;j<n;j++)m.quad([center,at(r,j),at(r,j),at(r,j+1)],[0,sign,0],mat);
 }
}
const seam=(m:VoxelMesh,a:Vec3,b:Vec3,w:number,mat:string)=>m.beam(a,b,w,w*.66,mat);
function looseScarf(m:VoxelMesh){
 const rows:readonly (readonly [Vec3,Vec3])[]=[
  [[-.15,1.34,.122],[-.01,1.32,.175]],[[-.24,1.27,.249],[-.11,1.27,.313]],
  [[-.34,1.19,.338],[-.22,1.16,.397]],[[-.405,1.16,.386],[-.31,1.09,.444]],
  [[-.45,1.115,.42],[-.35,1.016,.46]],
 ];
 for(let j=1;j<rows.length;j++){
  const [a,b]=rows[j-1]!,[c,d]=rows[j]!;
  m.quad([a,b,d,c],[0,.72,.69],j===3?'mail-vermilion':'mail-rust');
  m.quad([c,d,b,a],[0,-.72,-.69],'mail-vermilion');seam(m,a,c,.013,'mail-thread');
 }
}
export function courierBody():VoxelMesh{
 const m=new VoxelMesh();
 ring(m,[{y:.73,rx:.28,rz:.205},{y:.82,rx:.27,rz:.193},{y:1.12,rx:.212,rz:.164},{y:1.25,rx:.258,rz:.185},{y:1.32,rx:.18,rz:.15}],
  ['mail-hem','mail-indigo','mail-blue','mail-rain']);
 ring(m,[{y:1.15,rx:.285,rz:.209},{y:1.22,rx:.3,rz:.218},{y:1.32,rx:.219,rz:.168},{y:1.35,rx:.13,rz:.11}],
  ['mail-blue','mail-rain','mail-hem']);
 m.box([0,1.35,-.008],[.17,.15,.16],'traveler-skin');
 for(const sign of [-1,1]){
  seam(m,[sign*.20,.82,-.130],[sign*.15,1.08,-.129],.027,'mail-hem');
  seam(m,[sign*.22,.80,-.113],[sign*.08,.78,-.187],.018,'mail-thread');
 }
 seam(m,[.16,1.28,-.145],[-.195,.86,-.15],.046,'traveler-leather');
 m.box([-.074,1.04,-.17],[.063,.057,.036],'mail-brass',-.22);
 ring(m,[{y:1.289,rx:.199,rz:.164},{y:1.335,rx:.201,rz:.167},{y:1.365,rx:.147,rz:.126}],['traveler-scarf','mail-vermilion']);
 m.box([-.088,1.29,-.167],[.13,.095,.080],'mail-vermilion',.30);
 seam(m,[-.08,1.27,-.18],[-.175,1.15,-.189],.070,'mail-rust');looseScarf(m);
 // The crescent canvas bag is worn diagonally; a real cream envelope peeks from under its leather flap.
 m.box([.035,1.037,.235],[.421,.299,.179],'traveler-pack',-.07);
 m.box([.041,.92,.242],[.398,.076,.18],'traveler-leather',-.07);
 m.box([.031,1.178,.307],[.433,.131,.082],'mail-flap',-.07);
 m.box([.075,1.093,.330],[.166,.100,.019],'mail-envelope',-.07);
 seam(m,[-.003,1.139,.346],[.080,1.095,.350],.009,'mail-flap');
 seam(m,[.151,1.136,.357],[.080,1.095,.350],.009,'mail-flap');
 m.box([.139,1.121,.357],[.031,.034,.009],'mail-rust');
 for(const x of [-.117,.18]){
  m.box([x,1.065,.342],[.039,.196,.036],'traveler-leather');
  m.box([x,1.036,.365],[.054,.045,.017],'mail-brass');
 }
 seam(m,[-.19,1.18,.33],[.10,1.305,.129],.058,'traveler-leather');
 // A rolled route map, with exposed paper ends and two brass binding rings.
 m.box([-.202,1.03,.195],[.079,.38,.095],'mail-envelope',-.12);
 for(const y of [.92,1.13])m.box([-.202,y,.197],[.091,.029,.105],'mail-brass',-.12);
 m.box([.174,1.19,-.166],[.080,.062,.022],'mail-envelope');
 seam(m,[.140,1.21,-.181],[.174,1.185,-.184],.010,'mail-rust');seam(m,[.174,1.185,-.184],[.207,1.21,-.181],.01,'mail-rust');
 return m;
}
export function courierHat(m:VoxelMesh){
 // Broad sixteen-sided woven rain hat. The drooping edge, crown rings and tilted brim read from behind.
 const tilt=-.10;
 ring(m,[{y:.147,rx:.365,rz:.294,dz:.01},{y:.169,rx:.370,rz:.301,dz:.01},{y:.190,rx:.314,rz:.259,dz:.015},
  {y:.236,rx:.264,rz:.211,dz:.022},{y:.291,rx:.185,rz:.148,dz:.028},{y:.344,rx:.078,rz:.065,dz:.037},{y:.35,rx:.038,rz:.032,dz:.037}],
  ['mail-straw-shade','traveler-hat-light','mail-wicker','mail-weave','mail-wicker','mail-weave'],16,tilt);
 for(let j=0;j<16;j++){
  const a=(j+.5)*Math.PI/8,p=(y:number,w:number,d:number,z:number):Vec3=>[w*Math.cos(a),y+tilt*w*Math.cos(a),z+d*Math.sin(a)];
  seam(m,p(.176,.36,.285,.012),p(.238,.260,.209,.023),.013,'mail-weave');
 }
 ring(m,[{y:.247,rx:.256,rz:.201,dz:.023},{y:.264,rx:.231,rz:.188,dz:.024}],['mail-indigo'],16,tilt);
 for(const sign of [-1,1]){
  seam(m,[sign*.162,.136,-.12],[sign*.126,-.079,-.121],.012,'traveler-leather');
  m.box([sign*.167,.053,-.14],[.035,.112,.058],'mail-hair');
 }
 for(const [x,y,z,w] of [[.148,-.02,.13,.10],[.169,-.09,.155,.093],[.182,-.153,.158,.076],[.194,-.202,.16,.055]] as const)
  m.box([x,y,z],[w,w*1.07,w],'mail-hair',x*3);
 m.box([.191,-.176,.16],[.082,.029,.084],'mail-vermilion');
 m.box([-.205,.198,-.167],[.11,.046,.043],'mail-rust',-.65);
}
export const COURIER_ANKLE_Y=-.405;

export function courierLimbs(arm:VoxelMesh,leg:VoxelMesh,shoe?:VoxelMesh){
 arm.box([0,-.105,0],[.202,.21,.228],'mail-blue');
 arm.box([0,-.223,.001],[.185,.147,.207],'mail-indigo');
 arm.box([0,-.322,0],[.179,.072,.216],'mail-hem');
 arm.box([0,-.378,0],[.150,.049,.179],'mail-wrap');
 arm.box([0,-.438,-.013],[.139,.118,.151],'traveler-skin');
 arm.box([.07,-.423,-.042],[.033,.067,.071],'traveler-skin');
 leg.box([0,-.08,0],[.190,.385,.208],'mail-indigo');
 leg.box([0,-.30,-.002],[.166,.19,.194],'mail-wrap');
 for(let i=0;i<3;i++)seam(leg,[-.082,-.24-i*.052,-.1],[.08,-.29-i*.052,-.1],.022,'mail-hem');
 const foot=shoe??leg, offset=shoe?COURIER_ANKLE_Y:0;
 foot.box([0,-.45-offset,-.035],[.193,.18,.287],'traveler-leather');
 foot.box([0,-.53-offset,-.071],[.210,.080,.327],'mail-sole');
 foot.box([0,-.47-offset,-.154],[.18,.085,.13],'mail-flap');
}
