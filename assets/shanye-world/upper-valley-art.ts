import {VoxelMesh} from './voxel-mesh.ts';
import {houseFoot,LANE_HOUSES,type GroveSpecies} from './valley-planting.ts';
import type {Vec3} from './world-layout.ts';

export const VALLEY_PALETTE={
 'shale-heather':'#beb9c4','shale-pearl':'#c5bfc7','shale-lilac':'#b9b7c4',
 'ridge-denim':'#909aa9','ridge-silver':'#a0a8af','ridge-slate':'#8f9ba7',
 'spur-jade':'#798f8c','spur-sage':'#94a394','spur-blue':'#778e93',
 'grove-needle':'#425e5b','grove-tops':'#6d8070','grove-moss':'#748668','grove-linden':'#a3a06d',
 'grove-amber':'#b2925f','grove-straw':'#cfad72','grove-trunk':'#665b49',
 'lane-chalk':'#e2d4b8','lane-whitewash':'#e9ddc7','lane-tiles':'#515e68','lane-clay':'#936854',
 'lane-stone':'#999886','lane-mortar':'#a6a18a','lane-lantern':'#b86340','lane-ridge':'#829095','lane-timber':'#695344','lane-paper':'#c1a278',
};
type Spine=readonly (readonly [number,number])[];
// Irregular shoulders, short summit shelves and offset spurs, in world metres.
const far:Spine=[[-920,35],[-730,91],[-545,114],[-437,151],[-367,170],[-320,140],[-260,157],[-184,142],[-125,178],[-80,187],[-53,176],[-29,196],[-8,199],[17,168],[70,151],[122,144],[173,174],[201,189],[227,178],[251,155],[296,162],[352,138],[428,158],[505,186],[574,161],[689,143],[875,35]];
const middle:Spine=[[-760,35],[-589,63],[-443,86],[-350,122],[-301,127],[-270,99],[-201,110],[-161,103],[-100,126],[-74,148],[-56,149],[-43,130],[-19,120],[13,114],[62,96],[91,102],[128,119],[150,136],[167,131],[187,109],[227,103],[272,121],[311,146],[325,148],[347,129],[386,111],[439,116],[497,141],[555,120],[686,43]];
const near:Spine=[[-624,27],[-459,49],[-344,78],[-270,92],[-220,82],[-179,97],[-139,95],[-93,76],[-48,69],[4,82],[35,80],[68,61],[99,56],[129,68],[160,87],[201,95],[225,88],[269,72],[305,82],[353,102],[395,91],[455,80],[568,56],[707,25]];
function ridge(m:VoxelMesh,spine:Spine,z:number,depth:number,colors:readonly string[]){
 const rows:Vec3[][]=[[],[],[],[],[],[]];
 const points:(readonly [number,number])[]=[];
 for(let i=0;i<spine.length-1;i++){
  const [x,h]=spine[i]!,[end,peak]=spine[i+1]!,pieces=Math.ceil((end-x)/28);
  for(let k=0;k<pieces;k++){
   const t=k/pieces,xx=x+(end-x)*t;
   points.push([xx,h+(peak-h)*t+Math.sin(t*Math.PI)*Math.sin(xx*.12)*1.3]);
  }
 }
 points.push(spine[spine.length-1]!);
 for(const [x,h] of points){
  const crest=z+17*Math.sin(x*.019)+8*Math.cos(x*.041),spur=Math.sin(x*.029+.7);
  rows[0]!.push([x,-8,crest-depth*.48]);
  rows[1]!.push([x,h,crest]);
  rows[2]!.push([x+spur*4,h*(.83+.06*spur),crest+depth*(.19+.06*spur)]);
  rows[3]!.push([x+spur*12,h*(.52+.11*spur),crest+depth*(.42+.13*spur)]);
  rows[4]!.push([x+spur*15,h*(.26+.07*spur),crest+depth*(.69+.10*spur)]);
  rows[5]!.push([x,-8,crest+depth]);
 }
 const normal=(a:Vec3,b:Vec3,c:Vec3):Vec3=>{
  const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
  const x=uy*vz-uz*vy,y=uz*vx-ux*vz,z=ux*vy-uy*vx,n=Math.hypot(x,y,z)||1;
  return [x/n,y/n,z/n];
 };
 // Feather the internal facets of each spur. Keep its sky edge and valley folds in the mesh.
 const normals=rows.map((row,j)=>row.map((p,i):Vec3=>{
  const across=row[Math.min(i+1,row.length-1)]!,left=row[Math.max(0,i-1)]!;
  const up=rows[Math.max(0,j-1)]![i]!,down=rows[Math.min(j+1,rows.length-1)]![i]!;
  const n=normal(p,[p[0]+down[0]-up[0],p[1]+down[1]-up[1],p[2]+down[2]-up[2]],
   [p[0]+across[0]-left[0],p[1]+across[1]-left[1],p[2]+across[2]-left[2]]);
  const lift=z<-800?.86:z<-600?.63:.43,len=Math.hypot(n[0],n[1]+lift,n[2]);
  return [n[0]/len,(n[1]+lift)/len,n[2]/len];
 }));
 for(let j=0;j<rows.length-1;j++)for(let i=0;i<points.length-1;i++){
  const a=rows[j]![i]!,b=rows[j]![i+1]!,c=rows[j+1]![i+1]!,d=rows[j+1]![i]!;
  const na=normals[j]![i]!,nb=normals[j]![i+1]!,nc=normals[j+1]![i+1]!,nd=normals[j+1]![i]!;
  const face=normal(a,d,b),tone=(na[0]+nb[0])*.5;
  m.quadShaded([a,d,c,b],face,na,colors[tone<-.25?1:tone>.23?2:0]!,[na,nd,nc,nb]);
 }

}
export function southernRanges():VoxelMesh{
 const m=new VoxelMesh();
 ridge(m,far,-891,128,['shale-heather','shale-pearl','shale-lilac']);
 ridge(m,middle,-651,148,['ridge-denim','ridge-silver','ridge-slate']);
 ridge(m,near,-521,112,['spur-jade','spur-sage','spur-blue']);
 return m;
}
function canopy(m:VoxelMesh,x:number,y:number,z:number,rx:number,rz:number,h:number,pointed:boolean,shade:string,light:string,angle:number){
 const sides=7,rings=pointed?[[.62,-.46],[1,-.26],[.42,.05],[.12,.51]]:[[.55,-.46],[1,-.15],[.85,.21],[.36,.43]];
 const p=(i:number,ring:number):Vec3=>{const a=angle+i*Math.PI*2/sides,[w,v]=rings[ring]!;
  return [x+Math.cos(a)*w!*rx,y+(v!+.045*Math.sin(2*a))*h,z+Math.sin(a)*w!*rz];};
 for(let i=0;i<sides;i++){
  const a=angle+(i+.5)*Math.PI*2/sides;
  for(let j=0;j<3;j++){const up=.18+j*.32,n=Math.hypot(1,up);m.quad([p(i,j),p(i+1,j),p(i+1,j+1),p(i,j+1)],[Math.cos(a)/n,up/n,Math.sin(a)/n],j===2?light:shade);}
  const top:Vec3=[x,y+.5*h,z];m.quad([p(i,3),p(i+1,3),top,p(i,3)],[0,1,0],light);
  const bottom:Vec3=[x,y-.48*h,z];m.quad([p(i,0),p(i+1,0),bottom,p(i,0)],[0,-1,0],shade);
 }
}
export function edgeTree(species:GroveSpecies):VoxelMesh{
 const m=new VoxelMesh(),fir=species==='fir';
 m.beam([0,-.20,0],[.16, fir?7.8:6.5,-.11],.43,.40,'grove-trunk');
 if(fir){
  for(const [y,r] of [[3.4,2.4],[4.9,2],[6.3,1.5],[7.6,.9]] as const)
   canopy(m,.1,y,0,r,r*.87,3.2,true,'grove-needle','grove-tops',y);
 }else{
  for(const [x,y,z,r] of [[-1.6,4.8,.23,2.15],[1.35,5.5,-.56,2],[-.28,6.6,1,1.98],[.2,7.45,-.4,1.62]] as const){
   m.beam([0,y-2.3,0],[x,y,z],.19,.18,'grove-trunk');
   canopy(m,x,y,z,r,r*.86,2.7,false,species==='larch'?'grove-amber':'grove-moss',species==='larch'?'grove-straw':'grove-linden',y);
  }
 }
 return m;
}
export function oldTownLane(ground:(x:number,z:number)=>number):VoxelMesh{
 const m=new VoxelMesh();
 for(const [i,h] of LANE_HOUSES.entries()){
  const {x,z,w,d}=h,y=houseFoot(h,ground),eave=y+h.h,rise=1.95,half=w/2+.7,span=d/2+.62;
  m.box([x,y-2.5,z],[w+.22,5.08,d+.22],'lane-stone');
  m.box([x,y+h.h/2,z],[w,h.h,d],i%3?'lane-chalk':'lane-whitewash');
  for(const sign of [-1,1]){
   const top:Vec3=[x-half,eave+rise,z],end:Vec3=[x+half,eave+rise,z],a:Vec3=[x-half,eave,z+sign*span],b:Vec3=[x+half,eave,z+sign*span],n=Math.hypot(span,rise);
   m.quad([a,b,end,top],[0,span/n,sign*rise/n],h.tile==='slate'?'lane-tiles':'lane-clay');
   m.box([x,eave-.12,z+span*sign],[w+1.4,.26,.30],'lane-timber');
   const face=z+sign*(d/2+.022);
   for(const s of [-.29,.29]){
    m.box([x+s*w,y+h.h*.55,face],[1.64,1.46,.10],'lane-timber');
    m.box([x+s*w,y+h.h*.55,face+sign*.07],[1.31,1.08,.07],'lane-paper');
    m.box([x+s*w,y+h.h*.55,face+sign*.13],[.10,1.11,.07],'lane-timber');
   }
   m.box([x,y+1.1,face],[1.24,2.20,.12],'lane-timber');
   // A stepped stone plinth and timber porch root the lane in the slope, even in the long view.
   for(let k=0;k<4;k++)m.box([x,y+.03-k*.48,face+sign*.11],[w+.28,.09,.19],'lane-mortar');
   const entryX=x+(i%2?0:-w*.07),awningWidth=w*(i%3===0?.80:.46);
   m.box([entryX,y+2.90,face+sign*.39],[awningWidth,.22,.87],'lane-tiles');
   for(const side of [-1,1]){
    const postX=entryX+side*(awningWidth*.5-.22);
    m.box([postX,y+1.40,face+sign*.63],[.17,2.93,.17],'lane-timber');
    m.box([postX,y+2.38,face+sign*.71],[.32,.46,.28],'lane-lantern');
   }
   if(i%3===0){
    m.box([x,y+h.h*.72,face+sign*.06],[w*.68,.95,.13],'lane-timber');
    for(let k=0;k<6;k++)m.box([x+(k-2.5)*w*.101,y+h.h*.72,face+sign*.15],[w*.071,.70,.10],'lane-paper');
   }
   // Each end wall steps up behind the tiles with its own grey cap.
   const gableX=x+sign*(w/2-.10);
   for(const [width,height] of [[d+.12,.46],[d*.62,1.18],[d*.29,2.12]] as const){
    m.box([gableX,eave+height*.5,z],[.35,height,width],'lane-whitewash');
    m.box([gableX,eave+height,z],[.52,.15,width+.18],'lane-ridge');
   }
  }
  if(i===0||i===3||i===5){
   const cx=x-w*.18,cz=z+d*.18,gableHalf=Math.min(2.24,w*.19),tip=eave+2.15,edge=eave+.27;
   for(const side of [-1,1]){
    const at=cx+side*gableHalf,near=z+d/2+.57,n=Math.hypot(gableHalf,tip-edge);
    m.quad([[cx,tip,cz],[cx,tip,near],[at,edge,near],[at,edge,cz]],[side*(tip-edge)/n,gableHalf/n,0],'lane-tiles');
    const a:Vec3=[cx,tip,near-.10],b:Vec3=[at,edge,near-.10],c:Vec3=[cx,edge,near-.10];
    m.quad([a,b,c,a],[0,0,1],'lane-whitewash');
   }
   m.box([cx,eave+.78,z+d/2+.49],[.49,.70,.12],'lane-timber');
  }
  m.box([x,eave+rise,z],[w+.72,.19,.30],'lane-ridge');
 }
 return m;
}
