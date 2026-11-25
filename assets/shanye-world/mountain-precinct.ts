import type {AABB,Vec3} from './world-layout.ts';

type BuildingKind='passage'|'shop'|'hall'|'gallery'|'tower';
export interface Building {
 id:string;kind:BuildingKind;x:number;z:number;floor:number;width:number;depth:number;height:number;tiers:number;roof:'slate'|'celadon'|'oxide';
}
const building=(id:string,kind:BuildingKind,x:number,z:number,floor:number,width:number,depth:number,height:number,tiers:number,roof:Building['roof']='slate'):Building=>
 ({id,kind,x,z,floor,width,depth,height,tiers,roof});
export const POST_STREET=[
 building('sorting-gate','passage',-19,-205,15.4,17,5.6,9.05,1),
 building('paper-shop','shop',-4,-201,14.4,11,6,4.5,1,'oxide'),
 building('print-loft','shop',-11,-187,14.5,13,8,6.8,1),
 building('parcels','shop',-33,-215,16.0,11,6.4,4.9,1),
 building('weigh-house','hall',-45,-211,16.7,12,8,6,1,'oxide'),
 building('post-gallery','gallery',-43,-205,16.2,14,3.3,3.25,1),
 building('dispatch-tower','tower',-61,-194,16.5,12.8,12.8,8.0,4,'celadon'),
 building('print-hall','hall',-35,-163,14.2,19,10,6.8,1),
 building('packers','shop',-71,-180,18.2,13.5,7,5,1,'oxide'),
] as const;
export const MONASTERY=[
 building('south-gate','passage',158,63,24.12,13.6,4.3,4.7,1,'oxide'),
 building('west-cloister','gallery',143,63.5,24.15,17.5,4,3.6,1),
 building('east-cloister','gallery',175.5,64.5,24.15,16.0,4.2,3.6,1),
 building('scriptorium','hall',137.3,78.9,29.35,13.8,8,6.2,1,'celadon'),
 building('tea-gallery','gallery',179.0,79,29.35,13.5,4.5,3.8,1),
 building('great-hall','hall',157.9,100.3,35.15,29.6,10.4,7.8,2,'slate'),
 building('sutra-tower','tower',180.2,93.8,35.15,10.6,10.6,6.0,4,'celadon'),
 building('archive','shop',133.7,96.5,35.15,11.2,7,4.6,1,'oxide'),
] as const;
export const PRECINCTS=[...POST_STREET,...MONASTERY];
export function pavedPrecinct(x:number,z:number):boolean{
 return (x>=154.1&&x<=161.9&&z>=59&&z<=96)||PRECINCTS.some(b=>Math.abs(x-b.x)<b.width/2+1&&Math.abs(z-b.z)<b.depth/2+1);
}
const clamp=(v:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,v));
export const terraceY=(z:number)=>24+.45*clamp(z-66,0,11)+.46*clamp(z-82,0,12);
export function gardenGrade(x:number,z:number,natural:number):number {
 const fade=clamp(Math.min((x-125)/7,(193-x)/7,(z-57)/5,(113-z)/8),0,1);
 const bed=clamp(Math.min((x-150.0)/2.2,(166-x)/2.2,(z-61.0)/2,(99-z)/2),0,1);
 return natural+(terraceY(z)-bed*.97-natural)*fade*fade*(3-2*fade);
}
export const gardenStairTop=(z:number)=>terraceY(Math.ceil(z*2-1e-8)/2)+.115;
export function gardenWalkingSurface(x:number,z:number,visible=false):number{
 if(x<154.5||x>161.5||z<62||z>96)return Number.NEGATIVE_INFINITY;
 const next=gardenStairTop(z);
 if(!visible)return next;
 const start=Math.floor(z*2)*.5,from=gardenStairTop(start-.001),to=gardenStairTop(start+.25);
 // Match the 32mm dressed nosing built by stoneProfile.
 return z-start<.032&&to>from?to-.032+(z-start):to;
}
export interface Roof {x:number;z:number;y:number;w:number;d:number;rise:number;ridge:number;color:Building['roof'];}
export const roofsFor=(b:Building):Roof[]=>{
 const roofs:Roof[]=[];
 for(let i=0;i<b.tiers;i++){
  const tower=b.kind==='tower',shrink=tower?Math.pow(.77,i):Math.pow(.73,i);
  const w=(b.width+2.05)*shrink,d=(b.depth+2.05)*shrink;
  roofs.push({x:b.x,z:b.z,y:b.floor+b.height+(tower?4.05:3.3)*i,w,d,
   rise:tower?2.65-i*.20:b.kind==='gallery'?1.45:b.kind==='passage'?2.1:2.8,ridge:tower?.18:Math.max(.26,(w-d*.83)/w),color:b.roof});
 }
 return roofs;
};
export const UPPER_PORCH:Roof={x:157.9,z:94.15,y:39.67,w:12.70,d:4.50,rise:1.63,ridge:.61,color:'celadon'};
export const ALL_ROOFS=[...PRECINCTS.flatMap(roofsFor),UPPER_PORCH];
export const roofUplift=(u:number,v:number)=>.58*Math.pow(Math.min(Math.abs(u),Math.abs(v)),4);
export const roofLevels=[0,.34,.70,1] as const;
export function roofRing(r:Roof,t:number,side:number,u:number):Vec3{
 const halfX=r.w*.5*(1-t*(1-r.ridge)),halfZ=r.d*.5*(1-.985*t);
 const x=side===0?u:side===1?1:side===2?-u:-1,z=side===0?-1:side===1?u:side===2?1:-u;
 return [r.x+x*halfX,r.y+r.rise*(.45*t+.55*t*t)+roofUplift(x,z)*(1-t),r.z+z*halfZ];
}
export interface SolidPart {id:string;center:Vec3;size:Vec3;mat:string;}
export function structureParts(b:Building):SolidPart[]{
 const {x,z,width:w,depth:d,floor:y,height:h,kind}=b,parts:SolidPart[]=[];
 const add=(id:string,center:Vec3,size:Vec3,mat:string)=>parts.push({id:b.id+'/'+id,center,size,mat});
 const open=kind==='passage'||kind==='gallery',nx=kind==='tower'?2:Math.max(2,Math.round(w/4.1));
 // Columns stand on their own plinths. Open colonnades stay traversable at ground level.
 for(let i=0;i<=nx;i++)for(const side of [-1,1]){
  if(kind==='passage'&&i!==0&&i!==nx)continue;
  const px=x-w/2+w*i/nx,pz=z+side*d*.5,foot=Math.max(.39,Math.min(.76,h*.089));
  add('pier-'+i+'-'+side,[px,y-.15,pz],[foot+.27,.85,foot+.27],'stone-blue');
  add('post-'+i+'-'+side,[px,y+h*.5,pz],[foot,h,foot],kind==='shop'?'temple-wood':'oxblood');
 }
 if(!open){
  add('foundation',[x,y-2.1,z],[w-.55,4.25,d-.37],'foundation');
  add('core',[x,y+h*.47,z],[w-1.65,h*.94,d-1.42],kind==='shop'?'warm-plaster':kind==='tower'?'red-plaster':'ivory-plaster');
 }else if(kind==='passage'){
  add('gatehouse',[x,y+h-.58,z],[w-1.0,1.16,d-.72],'ivory-plaster');
 }
 return parts;
}
const box=(id:string,c:Vec3,s:Vec3):AABB=>({id,min:[c[0]-s[0]/2,c[1]-s[1]/2,c[2]-s[2]/2],max:[c[0]+s[0]/2,c[1]+s[1]/2,c[2]+s[2]/2]});
export const PRECINCT_SOLIDS:AABB[]=PRECINCTS.flatMap(b=>[
 ...structureParts(b).map(p=>box('mountain/'+p.id,p.center,p.size)),
 ...roofsFor(b).map((r,i)=>box('mountain/'+b.id+'/attic-'+i,[r.x,r.y+r.rise*.45,r.z],[r.w,r.rise+.40,r.d])),
]);
export function precinctShelter(x:number,z:number):number|undefined{
 let highest:number|undefined;
 for(const r of ALL_ROOFS){
  const u=2*Math.abs(x-r.x)/r.w,v=2*Math.abs(z-r.z)/r.d;
  if(u>1||v>1)continue;
  const t=clamp(Math.min((1-u)/(1-r.ridge),(1-v)/.985),0,1);
  const hi=roofLevels.findIndex(n=>n>=t),a=roofLevels[Math.max(0,hi-1)]!,b=roofLevels[Math.max(0,hi)]!;
  const profile=(s:number)=>.45*s+.55*s*s;
  const y=r.y+r.rise*(a===b?profile(a):profile(a)+(profile(b)-profile(a))*(t-a)/(b-a))+
    roofUplift(u/(1-t*(1-r.ridge)),v/(1-.985*t))*(1-t);
  highest=Math.max(highest??-Infinity,y);
 }
 return highest;
}

// Curbs beside the stairs are real stone; an opening runs continuously between them.
for(const [a,b] of [[66,77],[82,94]] as const)for(let z=a;z<b;z+=1)for(const side of [-1,1]){
 const y=gardenStairTop(z+.5);
 PRECINCT_SOLIDS.push(box('mountain/stair-curb/'+side+'/'+z,[158+side*3.88,y+.19,z+.5],[.77,.69,1]));
}

export const MARKET_TREE=[10,-216] as const;
export const MARKET_POSTS=[[11.8,-211.7],[-3,-212.8],[-10.2,-210.1]] as const;
export function marketBodies(ground:(x:number,z:number)=>number):AABB[]{
 const box=(id:string,x:number,z:number,w:number,h:number,d:number):AABB=>{
  const y=ground(x,z)-.08;return {id:'post-market/'+id,min:[x-w/2,y,z-d/2],max:[x+w/2,y+h,z+d/2]};
 };
 return [box('persimmon',...MARKET_TREE,.68,4.3,.66),...MARKET_POSTS.map(([x,z],i)=>box('line-'+i,x,z,.19,4.85,.19)),
  box('print-table',-.7,-209.6,3.6,1.15,1.05),box('letter-case',-8.6,-207.4,1.03,1.55,.68)];
}

for(const dx of [-5.45,-2.16,2.16,5.45])PRECINCT_SOLIDS.push(box('mountain/upper-porch/post/'+dx,[157.9+dx,37.44,92.9],[.42,4.6,.42]));
PRECINCT_SOLIDS.push(box('mountain/upper-porch/attic',[UPPER_PORCH.x,UPPER_PORCH.y+.65,UPPER_PORCH.z],[UPPER_PORCH.w,1.7,UPPER_PORCH.d]));
for(const z of [77.9,84.0,91.3])for(const side of [-1,1])PRECINCT_SOLIDS.push(box('mountain/stair-lamp/'+z+'/'+side,[157.9+side*5.35,terraceY(z)+1.18,z],[.70,2.36,.67]));
