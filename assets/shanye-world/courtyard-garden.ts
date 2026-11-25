import {MOON_WINDOW,LANTERN_POS} from './courtyard-structure.ts';
import type { DetailBox } from './scene-details.ts';
import type { Vec3 } from './world-layout.ts';

// Planted between the eaves, clear of the gate passage and the two flights.
export const COURT_PINES = [
 {x:150.5,z:72,height:6.6,spread:2.5},
 {x:168.2,z:72.4,height:5.6,spread:2.15},
 {x:185,z:55.3,height:7.3,spread:3.2},
] as const;

export const COURTYARD_GARDEN_ENTITY='props/courtyard-garden';

/** A bounded courtyard composition. Rendering and collision consume this exact
 * box list; the entrance and central walk to the seat stay empty. */
export function courtyardGardenBoxes(ground:(x:number,z:number)=>number):DetailBox[]{
 const boxes:DetailBox[]=[];
 const box=(id:string,center:Vec3,size:Vec3,material:string)=>boxes.push({id:`courtyard-garden/${id}`,center,size,material,solid:true});
 const base=(x:number,z:number)=>ground(x,z)-.08;

 // Give the existing square rain basin a readable rim and a dark, still inset.
 // The water-like inset is a real flat voxel surface, not a reflection effect.
 const basinY=base(160.25,53)+.5;
 box('basin/south',[160.25,basinY+.1875,52.375],[1.5,.375,.25],'rock-light');
 box('basin/north',[160.25,basinY+.1875,53.625],[1.5,.375,.25],'rock-light');
 box('basin/west',[159.625,basinY+.1875,53],[.25,.375,1],'rock');
 box('basin/east',[160.875,basinY+.1875,53],[.25,.375,1],'rock-light');
 box('basin/inset',[160.25,basinY+.27,53],[.9,.04,.9],'iron');

 // The bell's entrance sightline reaches x~166 at this depth. A connected
 // plaster garden wall occupies that background instead of ending beside it.
 // Its stepped cap and a short east return leave the south/west approaches open.
 for(const[id,x,z,width,height]of [['west',155.32,57.5,.64,2.25],['west-jamb',159.18,57.5,.84,2.25],['middle',162.2,57.5,5.2,3],['east',167.5,57.5,5.4,3.8]] as const){
  const y=base(x,z);
  if(id!=='east')box(`border/${id}`,[x,y+height/2,z],[width,height,.45],'cream');
  else{
   const w=MOON_WINDOW,bottom=w.y-w.r,top=w.y+w.r;
   box('border/east',[x,(y+bottom)/2,z],[width,bottom-y,.45],'cream');
   box('border/window-head',[x,(top+y+height)/2,z],[width,y+height-top,.45],'cream');
   // Stepped plaster jambs are solid in precisely the same places as their collision.
   for(let j=0;j<6;j++){
    const h=2*w.r/6,cy=bottom+(j+.5)*h,dx=Math.sqrt(w.r*w.r-(cy-w.y)**2);
    const left=w.x-dx,right=w.x+dx,x0=x-width/2,x1=x+width/2;
    box('border/window-west-'+j,[(left+x0)/2,cy,z],[left-x0,h,.45],'cream');
    box('border/window-east-'+j,[(right+x1)/2,cy,z],[x1-right,h,.45],'cream');
   }
  }
  box(`border/${id}-cap`,[x,y+height+.12,z],[width+.12,.24,.65],'rock');
  box(`border/${id}-foot`,[x,y+.125,z-.06],[width+.12,.25,.57],'rock-light');
 }
 const returnY=base(170.05,55);
 box('border/return',[170.05,returnY+1.1,55],[.45,2.2,5.5],'cream');
 box('border/return-cap',[170.05,returnY+2.32,55],[.65,.24,5.62],'rock');
 box('border/return-foot',[170.05,returnY+.125,55],[.57,.25,5.62],'rock-light');

 // The mature ginkgo's trunk backs the fine branch mesh. Its leaves are traversable.
 const tx=168.5,tz=53.5,ty=base(tx,tz);
 box('tree/trunk',[tx,ty+1.9,tz],[.5,3.8,.5],'ginkgo-bark');
 for(const [i,pine] of COURT_PINES.entries()){
  const foot=base(pine.x,pine.z);
  box('pine/trunk-'+i,[pine.x,foot+1.6,pine.z],[.27,3.2,.25],'ginkgo-bark');
 }
 const [lx,lz]=LANTERN_POS,ly=base(lx,lz);
 // Three real courses back the freestanding lantern at foot, shaft and light chamber.
 box('lantern/foot',[lx,ly+.075,lz],[.60,.15,.57],'stone-deep');
 box('lantern/shaft',[lx,ly+.62,lz],[.24,.73,.24],'stone-jade');
 box('lantern/chamber',[lx,ly+1.44,lz],[.35,.36,.35],'paper-light');

 // One connected stone/moss cluster at the left foreground gives the photo
 // depth without obstructing the diagonal entrance path or the seated rest.
 const stoneY=base(162.9,47.1);
 box('entry-stone/base',[162.9,stoneY+.3,47.1],[2,.6,1.35],'rock');
 box('entry-stone/crown',[163.2,stoneY+.82,47.15],[1.15,.45,.95],'rock-light');
 box('entry-stone/foot',[162.2,stoneY+.15,46.8],[1.1,.3,.95],'rock');
 box('entry-stone/moss',[163.2,stoneY+1.07,47.15],[.9,.06,.7],'leaf-light');
 for(const[i,x,z]of [[0,161.6,47.9],[1,162,48.1]] as const){
  const y=base(x,z);
  box(`entry-flower-${i}/stem`,[x,y+.28,z],[.08,.56,.08],'leaf');
  box(`entry-flower-${i}/petal`,[x,y+.6,z],[.28,.12,.28],i?'flower-red':'flower');
 }
 return boxes;
}
