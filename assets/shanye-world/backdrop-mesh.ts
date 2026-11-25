import { voxelHeight, type Vec3 } from './world-layout.ts';
import { VoxelMesh } from './voxel-mesh.ts';

export const BACKDROP_BOUNDARY=400;
export const BACKDROP_BLEND_EDGE=416;
export const BACKDROP_OUTER_EDGE=896;
export interface BackdropColumn {x:number;z:number;size:number;height:number}
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
const smooth=(n:number)=>{const t=clamp(n,0,1);return t*t*(3-2*t);};
const inside=(x:number,z:number,edge:number)=>x>=-edge&&x<edge&&z>=-edge&&z<edge;
const hill=(x:number,z:number,cx:number,cz:number,rx:number,rz:number)=>Math.exp(-(((x-cx)/rx)**2+((z-cz)/rz)**2));

/** Three distinct ranges, with a low southern opening visible from the ridge. */
function mountainEnvelope(x:number,z:number):number{
 // Broad shoulders carry a few offset summits; their overlap makes saddles,
 // rather than a periodic ridge running around the entire playable valley.
 const southwest=90*hill(x,z,-650,-590,240,190)+58*hill(x,z,-690,-625,105,125)
   +27*hill(x,z,-465,-665,130,100);
 const southeast=102*hill(x,z,640,-545,230,205)+128*hill(x,z,670,-535,98,115)
   +66*hill(x,z,495,-710,110,95);
 const north=95*hill(x,z,-100,710,300,175)+77*hill(x,z,-180,735,110,105)
   +39*hill(x,z,105,765,125,90);
 // Two cool shoulders beyond the playable land flank the high-porch view.
 // Keep the east-facing gap between them low behind the twin rock summits.
 const postalWest=150*hill(x,z,-213,559,140,87)+82*hill(x,z,-128,580,64,49)
   +109*hill(x,z,-395,626,96,101);
 const postalEast=113*hill(x,z,364,583,113,83)+94*hill(x,z,442,607,72,57)
   +59*hill(x,z,520,721,122,114);
 const mass=Math.max(southwest,southeast,north,postalWest,postalEast);
 // Only broad, low-amplitude geological variation; no independent cell noise.
 const base=22+3*Math.sin(x*.003+z*.0015)*Math.cos(z*.002);
 const detail=3*Math.sin(x*.009+z*.005)*smooth(mass/90);
 return base+mass+detail;
}

/** A 16m apron retains the main terrain's exact 4m edge heights; only the background then changes to32m cells. */
export function createBackdropGrid(){
 const cache=new Map<string,number>();
 const coarse=(x:number,z:number):number=>{
  const gx=Math.floor(x/32)*32,gz=Math.floor(z/32)*32,key=`c/${gx}/${gz}`;
  const old=cache.get(key);if(old!==undefined)return old;
  const cx=gx+16,cz=gz+16,inner=voxelHeight(clamp(cx,-398,398),clamp(cz,-398,398));
  const silhouette=mountainEnvelope(cx,cz);
  const t=smooth((Math.max(Math.abs(cx),Math.abs(cz))-400)/180);
  const h=Math.round((inner*(1-t)+silhouette*t)/2)*2;cache.set(key,h);return h;
 };
 const heightAt=(x:number,z:number):number=>{
  if(!inside(x,z,BACKDROP_OUTER_EDGE))return -40;
  if(inside(x,z,400))return voxelHeight(x,z);
  if(!inside(x,z,416))return coarse(x,z);
  const gx=Math.floor(x/4)*4,gz=Math.floor(z/4)*4,key=`f/${gx}/${gz}`;
  const old=cache.get(key);if(old!==undefined)return old;
  const cx=gx+2,cz=gz+2,dx=Math.max(0,Math.abs(cx)-400),dz=Math.max(0,Math.abs(cz)-400);
  const inner=voxelHeight(clamp(cx,-398,398),clamp(cz,-398,398));
  const hx=dx>0?coarse(Math.sign(cx)*432,cz):0,hz=dz>0?coarse(cx,Math.sign(cz)*432):0;
  const outer=(hx*dx+hz*dz)/Math.max(1,dx+dz),t=clamp((Math.max(dx,dz)-2)/12,0,1);
  const h=Math.round((inner*(1-t)+outer*t)*2)/2;cache.set(key,h);return h;
 };
 const columns:BackdropColumn[]=[];
 for(let z=-416;z<416;z+=4)for(let x=-416;x<416;x+=4)if(!inside(x,z,400))columns.push({x,z,size:4,height:heightAt(x+2,z+2)});
 for(let z=-896;z<896;z+=32)for(let x=-896;x<896;x+=32)if(!inside(x,z,416))columns.push({x,z,size:32,height:heightAt(x+16,z+16)});
 return{columns,heightAt};
}

/** Emit only top faces and exposed risers. Shared faces between full solid columns are omitted. */
export function buildBackdropMesh():VoxelMesh{
 const grid=createBackdropGrid(),m=new VoxelMesh();
 const shoulder=(x:number,z:number,own:number):number=>{
  const edge=Math.max(Math.abs(x),Math.abs(z));
  if(edge<=448 || edge>=BACKDROP_OUTER_EDGE)return own;
  return (grid.heightAt(x-16,z-16)+grid.heightAt(x+16,z-16)+grid.heightAt(x+16,z+16)+grid.heightAt(x-16,z+16))/4;
 };
 for(const{x,z,size,height:h}of grid.columns){
  const cx=x+size/2,cz=z+size/2;
  // Two continuous depth bands, independent of the square grid and light facing.
  const hazeFront=660+38*Math.sin(Math.atan2(cz,cx)*2+.4);
  const material=Math.hypot(cx,cz)>hazeFront?'skyrock':'rock';
  const a=shoulder(x,z,h),b=shoulder(x+size,z,h),c=shoulder(x+size,z+size,h),d=shoulder(x,z+size,h);
  const sx=(a+d-b-c)/(2*size),sz=(a+b-d-c)/(2*size),length=Math.hypot(sx,1,sz);
  m.quadShaded([[x,a,z],[x+size,b,z],[x+size,c,z+size],[x,d,z+size]],[0,1,0],[sx/length,1/length,sz/length],material);
  const edges:{a:Vec3;b:Vec3;n:Vec3}[]=[
   {a:[x,0,z],b:[x,0,z+size],n:[-1,0,0]}, {a:[x+size,0,z],b:[x+size,0,z+size],n:[1,0,0]},
   {a:[x,0,z],b:[x+size,0,z],n:[0,0,-1]}, {a:[x,0,z+size],b:[x+size,0,z+size],n:[0,0,1]},
  ];
  for(const{a,b,n}of edges){
   // A coarse face bordering the apron can meet eight distinct fine heights.
   // Merge consecutive equal-height strips so ordinary far neighbours still use one quad.
   const count=size/4,heights:number[]=[];
   for(let k=0;k<count;k++){const t=(k+.5)/count;heights.push(grid.heightAt(a[0]+(b[0]-a[0])*t+n[0]*.01,a[2]+(b[2]-a[2])*t+n[2]*.01));}
   for(let k=0;k<count;){const low=heights[k]!,start=k;while(++k<count&&heights[k]===low){}if(low>=h)continue;
    const u=start/count,v=k/count,ax=a[0]+(b[0]-a[0])*u,az=a[2]+(b[2]-a[2])*u,bx=a[0]+(b[0]-a[0])*v,bz=a[2]+(b[2]-a[2])*v;
    const la=shoulder(ax,az,low),lb=shoulder(bx,bz,low),ha=shoulder(ax,az,h),hb=shoulder(bx,bz,h);
    if(la!==ha || lb!==hb)m.quadShaded([[ax,la,az],[bx,lb,bz],[bx,hb,bz],[ax,ha,az]],n,[n[0]*.22,Math.sqrt(1-.22**2),n[2]*.22],material);
   }
  }
 }
 return m;
}
