import type {Vec3} from './world-layout.ts';
import {MARKET_TREE as TREE,MARKET_POSTS as POSTS} from './mountain-precinct.ts';
import {VoxelMesh} from './voxel-mesh.ts';

export const MARKET_COLORS={
 'persimmon-leaf':'#7e834c','persimmon-gold':'#b28a46','persimmon-light':'#d6aa60','persimmon-green':'#65795b',
 'persimmon-fruit':'#cb5336','persimmon-sun':'#e88742','dye-blue':'#315c72','dye-fade':'#6e94a0','dye-resist':'#e5d6ae',
 'lane-sandstone':'#c4b69d','lane-sand':'#cbbda6','lane-shade':'#b8ab94','lamp-amber':'#ecc286','basket':'#b58951',
};
type Ground=(x:number,z:number)=>number;
function fruitTree(m:VoxelMesh,ground:Ground){
 const x=TREE[0],z=TREE[1],y=ground(x,z)-.08;
 // The mature trunk keeps its footprint. The upper branches lean toward the
 // post office, leaving a window through the crown toward the two summits.
 const p=(dx:number,dy:number,dz:number):Vec3=>[x+dx-4.15*Math.min(1,Math.max(0,(dy-3.5)/2)),y+dy,z+dz];
 let seed=71953;const r=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};
 const branch=(a:Vec3,b:Vec3,w:number)=>m.beam(a,b,w,w*.87,'ginkgo-bark');
 branch(p(0,-.1,0),p(-.16,3.5,.14),.71);branch(p(-.16,3.45,.14),p(.67,5.9,.04),.31);
 for(const [dx,dy,dz,rad]of [[-3.8,5.5,-.2,1.65],[-2.3,6.55,.4,1.7],[.20,7.7,-.35,1.77],[1.85,7.05,.48,1.6],[3.22,6.20,-1.23,1.68],[1.12,5.72,2.35,1.65],[-1.7,5.67,2.5,1.50],[.45,6.35,-2.6,1.55]] as const){
  const mid=p(dx*.50,dy-1.12,dz*.55),end=p(dx,dy,dz);
  branch(p(-.07,3.35,.15),mid,.22);branch(mid,end,.14);
  for(let finger=0;finger<5;finger++){
   const ang=finger*2.39+dx*.7,ox=Math.cos(ang)*rad*.7,oz=Math.sin(ang)*rad*.67,oy=dy+r()*.53;
   branch(end,p(dx+ox,oy,dz+oz),.078);
   for(let j=0;j<13;j++){
    const a=r()*Math.PI*2,len=Math.sqrt(r())*rad*.60,xx=dx+ox+Math.cos(a)*len,zz=dz+oz+Math.sin(a)*len;
    const yy=oy+.12+.25*(1-len/rad)+.26*r(),width=.68+r()*.45;
    const mat=['persimmon-green','persimmon-leaf','persimmon-gold','persimmon-light'][Math.min(3,Math.floor((yy-dy+.12)*2.9+r()*.9))]!;
    m.box(p(xx,yy,zz),[width,.21+r()*.18,width*.65],mat,a);
   }
   if(finger%2===0){
    const cx=dx+ox*.99,cz=dz+oz*.95;
    for(let j=0;j<2;j++){
     const fx=cx+j*.26,fy=oy-.20-j*.22,fz=cz+(j?-.11:.05);
     branch(p(fx,oy+.19,fz),p(fx,fy+.12,fz),.037);
     m.box(p(fx,fy,fz),[.24,.235,.24],j?'persimmon-fruit':'persimmon-sun',.32+ang);
     m.box(p(fx,fy+.107,fz),[.13,.065,.13],'persimmon-leaf',ang);
    }
   }
  }
 }
 for(let j=0;j<12;j++){
  const at=(i:number):Vec3=>p(1.22*Math.cos(i*Math.PI/6),.13,1.22*Math.sin(i*Math.PI/6));
  m.beam(at(j),at(j+1),.21,.25,'stone-jade');
 }
}
const lerp=(a:Vec3,b:Vec3,t:number):Vec3=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
function dryingLines(m:VoxelMesh,ground:Ground){
 // Cyanotypes are two-sided bent sheets. The resist print follows the same fold as the fabric.
 for(const [i,[x,z]]of POSTS.entries()){
  const y=ground(x,z)-.08;m.box([x,y+2.42,z],[.16,4.85,.16],'temple-wood');
  m.box([x,y+.17,z],[.38,.38,.38],'stone-jade');m.box([x,y+4.87,z],[.22,.10,.22],'weathered-brass');
  if(i===POSTS.length-1)continue;
  const [xx,zz]=POSTS[i+1]!,dy=ground(xx,zz)-ground(x,z);
  const at=(t:number):Vec3=>[x+(xx-x)*t,y+4.68+dy*t-.80*Math.sin(t*Math.PI),z+(zz-z)*t];
  for(let j=0;j<12;j++)m.beam(at(j/12),at((j+1)/12),.034,.036,'traveler-leather');
  const count=i===0?7:4;
  for(let j=0;j<count;j++){
   const t=(j+.65)/(count+.3),a=at(t),b=at(t+.058*(i+1));
   const h=j%3===0?1.18:j%3===1?.80:.98,offset=.11*Math.sin(j*1.8);
   const point=(s:number,v:number,push=0):Vec3=>{const p=lerp(a,b,s);return [p[0]+.14*v*v,p[1]-h*v,p[2]+.12*v+.20*v*v+offset*Math.sin(Math.PI*s)*v+push];};
   const base=j%3===1?'dye-resist':j%4===0?'dye-fade':'dye-blue',ink=base==='dye-resist'?'dye-blue':'dye-resist';
   const patch=(u:number,v:number,uu:number,vv:number,material:string,push:number)=>{
    const q=[point(u,v,push),point(uu,v,push),point(uu,vv,push),point(u,vv,push)];
    m.quad(q,[0,0,1],material);m.quad(q,[0,0,-1],material);
   };
   for(let row=0;row<2;row++)for(let col=0;col<2;col++)patch(col/2,row/2,(col+1)/2,(row+1)/2,base,0);
   for(const side of [-1,1]){
    const bias=side*.029;
    const line=(u:number,v:number,uu:number,vv:number,w:number)=>m.beam(point(u,v,bias),point(uu,vv,bias),w,.023,ink);
    line(.12,.85,.88,.85,.024);
    if(j%2){
     line(.5,.76,.49,.24,.027);
     for(let k=0;k<3;k++){line(.49,.61-k*.11,.27+k*.026,.46-k*.10,.039);line(.49,.61-k*.11,.73-k*.02,.43-k*.10,.038);}
    }else{
     line(.16,.71,.43,.33,.044);line(.43,.33,.65,.71,.044);line(.53,.52,.66,.41,.036);line(.66,.41,.84,.71,.036);
     patch(.68,.20,.81,.30,ink,bias);
    }
   }
   for(const t0 of [.12,.86]){const p=point(t0,0);m.box([p[0],p[1]+.025,p[2]],[.06,.14,.075],'basket');}
  }
 }
}
function postStall(m:VoxelMesh,ground:Ground){
 const x=-.7,z=-209.6,y=ground(x,z)-.08;
 m.box([x,y+1.06,z],[3.62,.14,1.06],'temple-wood');
 for(const sign of [-1,1])for(const s of [-1,1])m.box([x+sign*1.58,y+.55,z+s*.4],[.14,1.10,.14],'oxblood');
 for(let j=0;j<4;j++)for(let k=0;k<4-j%2;k++){
  m.box([x-1.21+j*.64+.018*k,y+1.15+k*.072,z-.06],[.52,.070,.48],k%2?'mail-envelope':'dye-blue',.08*j);
 }
 const cx=-8.6,cz=-207.4,cy=ground(cx,cz)-.08;
 m.box([cx,cy+.78,cz],[1.03,1.56,.68],'temple-wood');
 for(let j=0;j<4;j++)for(let k=0;k<3;k++){
  m.box([cx+(k-1)*.30,cy+.26+j*.31,cz-.357],[.27,.26,.05],'basket');m.box([cx+(k-1)*.30,cy+.26+j*.31,cz-.393],[.072,.035,.035],'weathered-brass');
 }
}
export function marketFurniture(ground:Ground):VoxelMesh{
 const m=new VoxelMesh();fruitTree(m,ground);dryingLines(m,ground);postStall(m,ground);return m;
}
export function marketPaving(ground:Ground):VoxelMesh{
 const m=new VoxelMesh(),tones=['lane-sand','lane-sandstone','lane-shade'];
 // Three broad aprons meet the original street. Their surfaces follow the rendered ground.
 for(const [cx,cz,nx,nz] of [[-5,-207,8,8],[-28,-209,6,6],[-43,-199,7,5]] as const){
  for(let k=0;k<nz;k++)for(let j=0;j<nx;j++){
   const x=cx+(j-(nx-1)/2)*1.55+(k%2)*.55,z=cz+k*.93-nz*.465;
   const at=(dx:number,dz:number):Vec3=>[x+dx,ground(x+dx,z+dz)+.022,z+dz];
   m.quad([at(-.766,-.456),at(.766,-.456),at(.766,.456),at(-.766,.456)],[0,1,0],tones[(j*5+k*7+Math.floor(j/2))%3]!);
  }
 }
 return m;
}
