import { FOREST_TIMBER, FOREST_CHIME, LUNCH_STONE, POSTAL_ARROW } from './forest-composition.ts';
/** Game-authored local voxel scenery. Render and collision consume these same solid parts. */
export type DetailVec3 = readonly [number, number, number];
export interface DetailBox { id:string; center:DetailVec3; size:DetailVec3; material:string; solid:boolean }
export interface ScenicNode { id:string; route:string; distance:number; center:DetailVec3; theme:'cairn'|'rest'|'rill'|'parcel'|'flowers'; boxes:DetailBox[] }
interface ScenicRoute { id:string; width:number; points:readonly DetailVec3[] }
type Ground=(x:number,z:number)=>number;
export const detailObstacles=(boxes:readonly DetailBox[])=>boxes.filter(b=>b.solid).map(b=>({id:b.id,
 min:b.center.map((v,i)=>v-b.size[i]!/2) as unknown as DetailVec3,
 max:b.center.map((v,i)=>v+b.size[i]!/2) as unknown as DetailVec3}));

/** Fixed 30m rhythm, alternating shoulders: the path stays as short and fast as before. */
export function buildRouteScenery(routes:readonly ScenicRoute[],ground:Ground):ScenicNode[]{
 const nodes:ScenicNode[]=[],themes=['cairn','rest','rill','parcel','flowers'] as const;
 const decoratedRoutes=new Set(['forest-low','town-low','valley-cross','forest-high','town-high']);
 const nearLandmark=(x:number,z:number)=>Math.hypot(x,z+235)<36||Math.hypot(x+170,z+35)<38||Math.hypot(x-155,z-20)<44||Math.hypot(x,z-235)<40||(x>120&&x<190&&z>40&&z<95)||(x>48&&x<82&&z>192&&z<220);
 for(const route of routes.filter(r=>decoratedRoutes.has(r.id))){
  const segments=route.points.slice(1).map((b,i)=>{const a=route.points[i]!;return{a,b,len:Math.hypot(b[0]-a[0],b[2]-a[2])};});
  const length=segments.reduce((s,p)=>s+p.len,0);
  const step=route.id==='forest-low'||route.id==='town-low'?30:42;
  for(let distance=28,index=0;distance<length-24;distance+=step,index++){
   let remaining=distance;const segment=segments.find(p=>{if(remaining<=p.len)return true;remaining-=p.len;return false;})!;
   const{a,b,len}=segment,t=remaining/len,dx=(b[0]-a[0])/len,dz=(b[2]-a[2])/len;
   const side=index%2===0?1:-1,offset=route.width*.5+2.1;
   const x=a[0]+(b[0]-a[0])*t-dz*offset*side,z=a[2]+(b[2]-a[2])*t+dx*offset*side;
   if(route.id!=='forest-low'&&route.id!=='town-low'){
    if(nearLandmark(x,z))continue;
    const minDist=(px:number,pz:number)=>{
     let best=true;
     for(const r of routes){
      const half=r.id==='hidden-trail'?.675:Math.min(2.8,Math.max(1.9,r.width*.52))*.5;
      for(let k=1;k<r.points.length;k++){
       const p0=r.points[k-1]!,p1=r.points[k]!,rx=p1[0]-p0[0],rz=p1[2]-p0[2],l2=rx*rx+rz*rz;
       const tt=Math.max(0,Math.min(1,((px-p0[0])*rx+(pz-p0[2])*rz)/l2));
       if(Math.hypot(px-p0[0]-rx*tt,pz-p0[2]-rz*tt)<=half+.65){best=false;break;}
      }
      if(!best)break;
     }
     return best;
    };
    let clear=true;
    for(const ox of[-1.6,0,1.6])for(const oz of[-1.6,0,1.6])if(!minDist(x+ox,z+oz)){clear=false;break;}
    if(!clear)continue;
   }
   const id=`route-detail/${route.id}/${index}`,theme=themes[(index+(route.id==='town-low'?2:route.id==='valley-cross'?1:3))%themes.length]!;
   const node:ScenicNode={id,route:route.id,distance,center:[x,ground(x,z),z],theme,boxes:[]};
   // Each footing samples the actual solid column; small ornaments never float above a sloping shoulder.
   const box=(name:string,px:number,pz:number,bottom:number,size:DetailVec3,material:string,solid=true,base=ground(x+px,z+pz))=>node.boxes.push({id:`${id}/${name}`,center:[x+px,base+bottom+size[1]/2,z+pz],size,material,solid});
   const flowers=(px:number,pz:number,tone:string)=>{
    for(let i=0;i<9;i++){const fx=px+(i%3)*.34,fz=pz+Math.floor(i/3)*.31,h=.19+(i%3)*.07;
     box(`stem-${px}-${pz}-${i}`,fx,fz,0,[.06,h,.06],'leaf',false);
     box(`petal-${px}-${pz}-${i}`,fx,fz,h,[.23,.08,.23],i%4===0?'cream':tone,false);
    }
   };
   if(theme==='cairn'){
    box('stone-foot',0,0,0,[1.55,.42,1.1],'rock');box('stone-middle',.12,.1,.42,[.95,.3,.75],'rock-light',true,node.center[1]);box('stone-top',-.08,.08,.72,[.6,.26,.55],'rock',true,node.center[1]);
    box('mile-post',1.05,.15,0,[.22,1.8,.22],'wood');box('mile-board',1.05,.15,1.35,[1.1,.37,.18],'wood-light');
    box('red-route-mark',1.05,.04,1.41,[.28,.22,.04],'red',false);flowers(-1.2,-.2,'flower-red');
   }else if(theme==='rest'){
    box('stump',-.8,0,0,[.7,.62,.7],'bark');box('stump-rings',-.8,0,.62,[.66,.08,.66],'wood-light');
    const seatBase=Math.max(ground(x+.3,z),ground(x+1.6,z),ground(x+.95,z));
    for(const[name,px]of [['a',.3],['b',1.6]]as const)box(`seat-leg-${name}`,px,0,0,[.28,seatBase-ground(x+px,z)+.5,.5],'wood');
    box('seat',.95,0,.5,[1.8,.2,.7],'wood-light',true,seatBase);box('thermos',1.25,.02,.7,[.15,.3,.15],'red',false,seatBase);flowers(-1.4,.6,'flower');
   }else if(theme==='rill'){
    // A dry pebbled runnel is deliberately solid land: no unsupported water/reflection dependency.
    for(let i=0;i<7;i++)box(`rill-pebble-${i}`,-1.2+i*.42,Math.sin(i*1.7)*.4,0,[.55,.12+(i%2)*.06,.45],i%2?'rock':'rock-light',false);
    box('bank-rock',.85,.9,0,[1.1,.45,.8],'rock');box('bank-moss',.85,.9,.45,[.75,.1,.6],'leaf-light',false);flowers(-1.1,1.1,'flower');
   }else if(theme==='parcel'){
    box('rest-post',0,0,0,[.8,.6,.8],'wood');box('old-mailbag',0,0,.6,[.75,.55,.5],'cream');
    box('bag-strap',0,-.26,.65,[.15,.45,.05],'red',false);box('fallen-board',1,.3,0,[1.4,.16,.35],'wood-light',false);flowers(-1.1,.45,'flower-red');
   }else{
    box('sun-warmed-stone',0,0,0,[1.4,.45,1.2],'rock-light');box('stone-cap',.1,.1,.45,[.8,.18,.7],'rock',true,node.center[1]);
    flowers(-1.5,-.4,'flower-red');flowers(.65,.6,'flower');
   }
   if((route.id==='forest-low'||route.id==='town-low')&&(theme==='rest'||theme==='flowers')){
    // A few small, asymmetrical roadside trees cast close shadows; they are authored compositions, not another scatter layer.
    const px=-dz*side*2.25,pz=dx*side*2.25,base=ground(x+px,z+pz),leaf=route.id==='forest-low'?'gold':'leaf';
    box('young-tree-trunk',px,pz,0,[.25,2.9,.25],'bark',true,base);
    box('young-tree-branch',px+.4,pz,2.25,[1.05,.18,.2],'wood',true,base);
    box('young-tree-crown-low',px+.4,pz,2.65,[2.4,.8,2.05],leaf,true,base);
    box('young-tree-crown-high',px-.25,pz+.2,3.45,[1.8,.65,1.7],route.id==='forest-low'?'gold-light':'leaf-light',true,base);
    box('young-tree-crown-side',px+1.1,pz-.1,2.85,[1.05,.65,1.2],leaf,true,base);
   }
   nodes.push(node);
  }
 }
 return nodes;
}

const b=(id:string,center:DetailVec3,size:DetailVec3,material:string,solid=true):DetailBox=>({id,center,size,material,solid});
/** Continuous stepped voxel timber, rather than a decorative floating diagonal.
 * Render and collision use the same overlapping solid courses. */
const steppedTimber=(id:string,a:DetailVec3,end:DetailVec3,width:number,depth:number,material:string):DetailBox[]=>{
 const count=Math.ceil(Math.max(Math.abs(end[0]-a[0]),Math.abs(end[1]-a[1]),Math.abs(end[2]-a[2]))/.2);
 return Array.from({length:count},(_,i)=>{
  const t=(i+.5)/count;
  return b(`${id}-${i}`,a.map((v,axis)=>v+(end[axis]!-v)*t) as unknown as DetailVec3,
   [Math.abs(end[0]-a[0])/count+width,Math.abs(end[1]-a[1])/count+width,Math.abs(end[2]-a[2])/count+depth],material);
 });
};
/** Two planted beds connect the chime approach to the existing bench and mill court.
 * All centres are authored, not scattered. The east bed follows the measured .25m
 * terrain courses; roots enter the ground while its tops form a continuous low mass.
 */
export const FOREST_GARDEN_BOXES:readonly DetailBox[]=(()=>{
 const out:DetailBox[]=[];
 const box=(id:string,x:number,y:number,z:number,size:DetailVec3,material:string,solid=true)=>out.push(b(`forest-bed/${id}`,[x,y,z],size,material,solid));
 const shrub=(id:string,x:number,z:number,width:number,height:number,ground:number,tone:string)=>{
  height*=.72;
  // Low dark roots connect the planted bank; offset narrower crowns break the previous flat terraces.
  box(`${id}/root`,x,ground+height*.23-.04,z,[.18,height*.46+.12,.18],'bark');
  box(`${id}/leaf-low`,x,ground+.08+height*.125,z,[width,height*.25,width*.82],'leaf');
  box(`${id}/leaf-middle`,x-width*.14,ground+.16+height*.38,z-width*.08,[width*.65,height*.68,width*.6],'leaf-light');
  box(`${id}/leaf-top`,x+width*.16,ground+.16+height*.82,z+width*.08,[width*.42,height*.36,width*.44],'leaf-light');
  // Five overlapping florets read as one flower head. Heads rest on actual leaf tiers.
  const flower=(name:string,dx:number,dz:number,y:number,color:string)=>{
   const px=x+dx,pz=z+dz;
   box(`${id}/${name}-centre`,px,y+.065,pz,[.24,.13,.24],color,false);
   for(const [i,ox,oz]of [[0,-.12,0],[1,.12,0],[2,0,-.12],[3,0,.12]]as const)
    box(`${id}/${name}-petal-${i}`,px+ox,y+.04,pz+oz,[.16,.08,.16],i===2?'cream':color,false);
  };
  flower('bloom-a',width*.16,width*.08,ground+.16+height,tone);
  flower('bloom-b',-width*.2,-width*.12,ground+.16+height*.72,'cream');
 };
 // The fuller west bed curls around the rowan and ends beside the existing bench.
 for(const[id,x,z,w,h,tone]of [
  ['west-01',-174.5,-45.2,1.6,.5,'cream'],['west-02',-176,-44.7,2,.7,'flower-red'],
  ['west-03',-177.6,-43.8,2.1,.9,'flower-red'],['west-04',-179.1,-42.6,2,.95,'cream'],
  ['west-05',-179.6,-40.9,2.15,.85,'flower-red'],['west-06',-179.1,-39.2,2.1,.8,'cream'],
  ['west-07',-177.5,-38.2,2.1,.65,'flower-red'],['west-08',-175.8,-37.9,2,.65,'cream'],
  ['west-09',-174.3,-38.6,1.6,.45,'cream'],
 ]as const)shrub(id,x,z,w,h,38.08,tone);
 // Low fern volumes fill the inside of the crescent below the rowan, keeping the outside walk clear.
 for(const[id,x,z,w]of [['fern-a',-176.8,-41.7,2.5],['fern-b',-177.5,-40.1,2.2]]as const){
  box(`${id}/root`,x,38.13,z,[.14,.26,.14],'leaf');
  box(`${id}/low`,x,38.32,z,[w,.3,w*.65],'leaf');
  box(`${id}/high`,x-.2,38.55,z,[w*.65,.2,w*.5],'leaf-light');
 }
 // A smaller cream-flower bank answers the west colour mass, rather than mirroring it.
 for(const[id,x,z,w,h,ground]of [
  ['east-01',-165.2,-43.8,1.5,.45,38.08],['east-02',-163.9,-42.9,1.5,.55,38.08],
  ['east-03',-163.6,-41.7,1.6,.85,37.58],['east-04',-164.1,-40.5,1.5,.75,37.58],
  ['east-05',-164.4,-39.3,1.5,.95,37.33],
 ]as const)shrub(id,x,z,w,h,ground,'cream');
 // A short broken stone edging follows the front of the planted bank; no new fence across a route.
 for(const[id,x,z,w]of [['west-a',-174.6,-46.15,.8],['west-b',-176.1,-45.85,.85],
  ['west-c',-177.6,-44.95,.7]]as const){
  box(`edge-${id}`,x,38.14,z,[w,.28,.35],'rock');
  box(`edge-${id}-cap`,x,38.31,z,[w+.05,.08,.4],'rock-light');
 }
 // The mill's existing stair and railing now belong to a small stone court.
 // These two raised beds stay outside both the tower entrance and the east-side walk.
 for(const[id,x,z,base,top]of [['mill-west',-174.8,-24.8,38.25,38.95],['mill-east',-166.3,-26.7,37.25,38.23]]as const){
  const width=1.5,depth=1.15,h=top-base;
  box(`${id}/soil`,x,base+h/2,z,[width-.22,h,depth-.22],'earth');
  for(const side of [-1,1])box(`${id}/wall-${side}`,x+side*(width-.14)/2,base+h/2,z,[.14,h,depth],'rock');
  for(const side of [-1,1])box(`${id}/end-${side}`,x,base+h/2,z+side*(depth-.14)/2,[width,h,.14],'rock');
  for(const side of [-1,1])box(`${id}/coping-${side}`,x+side*(width-.16)/2,top+.04,z,[.2,.08,depth+.04],'rock-light');
  shrub(`${id}/flowers`,x,z,1.1,.5,top,'cream');
 }
 // Flush paving joins the existing junction to the mill steps. Its top is below
 // the existing 38.08m walking surface, so it creates neither a hidden step nor a blocker.
 for(let i=0;i<8;i++)box(`court-paver-${i}`,-170,38.0325,-32.1+i*1.1,[1.6,.085,.9],i%3===1?'path-light':'rock-light');
 return out;
})();
/** A roadside timber chime and unequal planting groups. The stable mesh identity
 * is retained, while every solid detail remains authoritative for movement and sight. */
export const FOREST_FRAME_BOXES:readonly DetailBox[]=[
 b('forest-chime-post',[FOREST_TIMBER.x,FOREST_TIMBER.base+FOREST_TIMBER.height/2,FOREST_TIMBER.z],[.22,FOREST_TIMBER.height,.22],'wood'),
 b('forest-chime-foot',[FOREST_TIMBER.x,38.18,-41],[.42,.2,.42],'rock'),
 ...steppedTimber('forest-chime-arm',FOREST_TIMBER.armStart,FOREST_TIMBER.armEnd,.16,.22,'wood'),
 ...steppedTimber('forest-chime-brace',[-177.4,40.9,-41],[-176.28,41.86,-41],.12,.16,'wood-light'),
 b('forest-chime-post-cap',[-177.4,41.91,-41],[.36,.12,.36],'wood-light'),
 b('forest-chime-arm-cap',[-175.1,42.02,-41],[.3,.18,.3],'wood'),
 b('forest-chime-joint',[-177.4,41.71,-41.15],[.08,.08,.08],'iron'),
 b('forest-chime-string',[-175.4,41.77,-41],[.035,.32,.035],'iron'),
 b('forest-chime-top',[FOREST_CHIME.position[0],41.56,-41],[.26,.1,.26],'gold'),
 b('forest-chime-shoulder',[-175.4,41.45,-41],[.38,.14,.38],'gold'),
 b('forest-chime-body',[-175.4,41.31,-41],[.48,.2,.48],'gold-light'),
 b('forest-chime-lip',[-175.4,41.145,-41],[.6,.11,.6],'gold'),
 b('forest-chime-clapper',[-175.4,41,-41],[.08,.2,.08],'wood'),
 b('forest-chime-tail-string',[-175.4,40.78,-41],[.025,.24,.025],'iron'),
 b('forest-chime-paper',[-175.4,40.46,-41],[.2,.4,.035],'cream'),
 b('forest-chime-paper-mark',[-175.4,40.46,-41.022],[.06,.17,.012],'red',false),
 // A two-sided enamel fingerpost on the existing timber. +X points towards the mill.
 b('postal-sign-board',[-177.16,40.33,-41],[1.72,.53,.27],'wood'),
 b('postal-sign-enamel',POSTAL_ARROW.position,POSTAL_ARROW.size,'cream'),
 ...[-1,1].flatMap(side=>[
  b(`postal-sign-shaft-${side}`,[-177.16,40.33,-41+side*.153],[1.00,.12,.016],'red',false),
  ...[0,1,2].map(i=>b(`postal-sign-tip-${side}-${i}`,[-176.78+i*.085,40.33,-41+side*.153],[.09,.33-i*.095,.016],'red',false)),
 ]),
 b('postal-sign-stone',[LUNCH_STONE[0],38.37,LUNCH_STONE[2]],[1.21,.52,.79],'rock'),
 b('postal-sign-stone-cap',[LUNCH_STONE[0],38.66,LUNCH_STONE[2]],[1.29,.08,.85],'rock-light'),
 // A small rowan leans in from the left shoulder; its crown stops outside the timber opening.
 b('forest-garden/rowan-trunk',[-178.75,39.33,-39.7],[.22,2.5,.22],'bark'),
 b('forest-garden/rowan-branch',[-178.38,40.21,-39.7],[.96,.18,.2],'wood'),
 b('forest-garden/rowan-upper-stem',[-178.01,40.62,-39.7],[.18,.82,.18],'bark'),
 b('forest-garden/rowan-crown-low',[-178.95,40.46,-39.7],[1.45,.55,1.1],'leaf'),
 b('forest-garden/rowan-crown-mid',[-178.15,41.02,-39.7],[1.4,.55,1.2],'leaf-light'),
 b('forest-garden/rowan-crown-top',[-178.35,41.46,-39.64],[.85,.35,.8],'leaf-light'),
 b('forest-garden/rowan-crown-outside',[-179.6,40.24,-39.6],[.75,.4,.85],'leaf'),
 b('forest-garden/rowan-berries-a',[-179,40.23,-40.22],[.16,.15,.12],'flower-red',false),
 b('forest-garden/rowan-berries-b',[-177.85,40.81,-40.28],[.14,.14,.12],'flower-red',false),
 // Right side stays low and open: three connected stones and a narrow cream flower drift.
 b('forest-garden/east-stone-low',[-164.8,38.25,-42.7],[1.25,.34,.8],'rock'),
 b('forest-garden/east-stone-high',[-165.2,38.37,-42.45],[.9,.58,.8],'rock-light'),
 b('forest-garden/east-stone-small',[-164.1,38.18,-42.4],[.65,.2,.6],'rock'),
 ...([[-165.1,-43.4],[-164.72,-43.58],[-164.35,-43.42],[-163.98,-43.22],[-163.62,-43.12]] as const).flatMap(([x,z],i)=>[
  b(`forest-garden/flower-${i}-stem`,[x,38.25,z],[.045,.34,.045],'leaf',false),
  b(`forest-garden/flower-${i}-head`,[x,38.44,z],[.21,.07,.21],i===2?'flower':'cream',false),
 ]),
 ...FOREST_GARDEN_BOXES,
];

/** Details project only a few centimetres from the solid house, above the walkable rear lane. */
export function townRearDetails():DetailBox[]{
 const out:DetailBox[]=[];
 const add=(name:string,p:DetailVec3,s:DetailVec3,mat:string)=>out.push(b(`town-rear/${name}`,p,s,mat));
 for(const x of [162.3,165.7,169.1]){
  add(`timber-${x}`,[x,27.7,24.8],[.2,4.6,.18],'wood-light');
  add(`bracket-${x}`,[x,29.6,25],[.24,.55,.45],'wood');
 }
 add('eave',[165.75,30,25],[8.65,.22,.7],'wood');add('eave-trim',[165.75,30.15,25.2],[8.8,.12,.25],'wood-light');
 for(const x of [163.6,167.5]){
  add(`window-dark-${x}`,[x,28,24.77],[1.5,1.6,.1],'night-window');
  for(const dx of [-.85,0,.85])add(`window-bar-${x}-${dx}`,[x+dx,28,24.88],[.13,1.85,.16],'wood-light');
  for(const y of [27.12,28.88])add(`window-frame-${x}-${y}`,[x,y,24.9],[1.85,.13,.18],'wood-light');
  add(`window-sill-${x}`,[x,27.03,24.98],[2.05,.16,.35],'rock-light');
 }
 // East elevation: three contrasting inset panels break the long unadorned gable.
 for(const z of [18.5,21,23.5]){
  add(`east-post-${z}`,[170.04,27.6,z],[.12,4.2,.2],'wood-light');
  add(`east-plinth-${z}`,[170.08,25,z],[.16,.45,1.75],'rock-light');
 }
 // This is the wall seen from the playable eastern back lane (camera looking -X).
 // Keep every new part inside the existing 170.16m wall/plinth envelope.
 for(const z of [19.7,22.2]){
  add(`east-window-${z}/recess`,[170.03,27.4,z],[.08,1.35,1.2],'night-window');
  for(const dz of [-.69,0,.69])add(`east-window-${z}/stile-${dz}`,[170.065,27.4,z+dz],[.13,1.6,.12],'wood-light');
  for(const y of [26.63,28.17])add(`east-window-${z}/rail-${y}`,[170.065,y,z],[.13,.12,1.5],'wood-light');
  add(`east-window-${z}/sill`,[170.075,26.46,z],[.16,.18,1.65],'rock-light');
 }
 add('east-stone-course',[170.08,25.45,21],[.16,.55,6.55],'rock-light');
 add('east-eave',[170.1,30,21],[.28,.2,7.3],'wood');
 return out;
}

/** The lost postcard rests beside the lane, never inside its recovery/walking centreline. */
export function lostPostcardDisplay(ground:Ground):DetailBox[]{
 const x=177.3,z=28.1;
 // Sink the base into the lowest actual terrain column under its footprint;
 // this tolerates the adjacent quarter-metre ground course without a floating slab.
 const base=Math.min(...[-.525,0,.525].flatMap(dx=>[-.425,0,.425].map(dz=>ground(x+dx,z+dz))))-.08;
 return[
  b('lost-postcard-display/base',[x,base+.17,z],[.95,.34,.8],'rock'),
  b('lost-postcard-display/cap',[x,base+.4,z],[1.05,.12,.85],'rock-light'),
  b('lost-postcard-display/letter',[x,base+.48,z],[.65,.04,.45],'cream'),
  b('lost-postcard-display/stamp',[x+.2,base+.5075,z-.1],[.1,.015,.1],'red'),
 ];
}

/** P0-C: selective side/rear structure, leaving the original doors and the open lookout open.
 * Existing compiled front/rear windows are retained; these additions address the plain gable sides.
 * All wall pieces project less than 0.25m. Ridge supports are above head height.
 */
export function landmarkBackDetails():DetailBox[]{
 const out:DetailBox[]=[];
 const add=(id:string,p:DetailVec3,s:DetailVec3,mat:string)=>out.push(b(id,p,s,mat));
 const sideWindow=(id:string,x:number,y:number,z:number,outward:number,width=1.25,height=1.35)=>{
  add(`${id}/recess`,[x,y,z],[.08,height,width],'night-window');
  for(const dz of [-width/2-.09,0,width/2+.09])add(`${id}/stile-${dz}`,[x+outward*.07,y,z+dz],[.13,height+.25,.12],'wood-light');
  for(const dy of [-height/2-.1,height/2+.1])add(`${id}/rail-${dy}`,[x+outward*.07,y+dy,z],[.15,.12,width+.32],'wood-light');
  add(`${id}/sill`,[x+outward*.1,y-height/2-.23,z],[.25,.16,width+.5],'rock-light');
 };
 // Postal house side windows and a complete rear rainwater silhouette; not an extra blocked doorway.
 sideWindow('post-back/west-window',-8.08,16.75,-236,-1);
 sideWindow('post-back/east-window',2.08,16.75,-236,1);
 add('post-back/gutter',[-3,18.7,-239.75],[10.3,.14,.2],'iron');
 add('post-back/downpipe',[2.15,16.5,-239.75],[.13,4.4,.13],'iron');
 for(const x of [-7.65,-3,1.65])add(`post-back/eave-bracket-${x}`,[x,18.35,-239.72],[.2,.6,.4],'wood-light');
 add('post-back/rain-barrel',[1.15,14.6,-241.3],[.9,1.2,.9],'wood');
 for(const y of [14.25,14.9])add(`post-back/barrel-band-${y}`,[1.15,y,-241.3],[.96,.1,.96],'iron');
 add('post-back/barrel-lid',[1.15,15.25,-241.3],[.96,.1,.96],'wood-light');
 // The tower's front and rear already have compiled windows. Open the plain side faces visually.
 sideWindow('forest-back/west-window',-173.32,41.65,-20.25,-1,1.1,1.15);
 sideWindow('forest-back/east-window',-166.68,41.65,-20.25,1,1.1,1.15);
 add('forest-back/north-fascia',[-170,43.55,-17.65],[6.5,.18,.2],'wood-light');
 for(const x of [-172.75,-167.25])add(`forest-back/roof-bracket-${x}`,[x,43.25,-17.7],[.22,.6,.35],'wood');
 // Other old-town houses retain their existing windowed ends; modest gable details support circling them.
 sideWindow('town-back/west-house-west-window',139.63,26.9,21.25,-1);
 sideWindow('town-back/west-house-east-window',147.87,26.9,21.25,1);
 sideWindow('town-back/courtyard-west-window',144.13,27.4,53,-1,1.4,1.6);
 sideWindow('town-back/courtyard-east-window',154.37,27.4,53,1,1.4,1.6);
 add('town-back/west-house-rear-eave',[143.75,29.1,18.1],[8.3,.2,.35],'wood-light');
 add('town-back/courtyard-rear-eave',[149.25,29.8,48.7],[10.3,.2,.35],'wood-light');
 // Four corner knee-braces have real stepped silhouettes under the pavilion beam.
 // No additional screens/walls in its north entrance, side entrances or southern valley view.
 for(const x of [-6.25,6])for(const z of [232.25,240.5]){
  const side=x<0?1:-1;
  for(let step=0;step<4;step++)add(`ridge-back/brace-${x}-${z}-${step}`,[x+side*(.15+step*.23),99.55+step*.23,z],[.3,.3,.3],'wood-light');
 }
 for(const z of [231.95,240.8])add(`ridge-back/frieze-${z}`,[-.25,100.35,z],[12.7,.18,.16],'wood-light');
 return out;
}

export const TOWN_CRANK_MARKER='props/town-crank-marker';
export const TOWN_CRANK_BOXES:readonly DetailBox[]=[
 b('town-crank/post',[148.45,25.2,10.12],[.22,2.4,.24],'wood'),
 b('town-crank/sign',[148.45,26.8,10.02],[1.55,.55,.14],'cream'),
 b('town-crank/sign-mark',[148.45,26.8,9.93],[.25,.32,.04],'red',false),
 b('town-crank/rope',[149.05,25.7,10.02],[.09,1.65,.09],'red',false),
 b('town-crank/rope-tail',[149.13,24.9,10.02],[.25,.28,.12],'red',false),
 b('town-crank/wheel-top',[148.45,25.83,9.95],[.85,.12,.12],'gold-light'),
 b('town-crank/wheel-bottom',[148.45,25.07,9.95],[.85,.12,.12],'gold-light'),
 b('town-crank/wheel-left',[148.07,25.45,9.95],[.12,.76,.12],'gold'),
 b('town-crank/wheel-right',[148.83,25.45,9.95],[.12,.76,.12],'gold'),
 b('town-crank/axle',[148.45,25.45,9.97],[.2,.2,.42],'iron'),
 b('town-crank/handle',[148.83,25.45,9.65],[.18,.18,.6],'red'),
];

/** Windward buttresses below the public walking path. The top courses carry
 * a single bent pine and stay to one side of both the windmill and sunset rays. */
export const CLIFF_PINE = { position:[34.1,88.485,185.8] as DetailVec3, size:[4.5,1.03,2.5] as DetailVec3 };
export const CLIFF_PINE_PROXIES = new Set(['evening-cliff/upper-needles',...Array.from({length:9},(_,i)=>'evening-cliff/pine-pad-'+i)]);
function eveningCliff():DetailBox[] {
 const out:DetailBox[]=[];
 const course=(id:string,x:number,z:number,width:number,depth:number,foot:number,top:number,material:string)=>{
  out.push(b('evening-cliff/'+id,[x,(foot+top)/2,z],[width,top-foot,depth],material));
 };
 // Each buttress rises out of the slope as one vertical face. Unequal joints
 // and receding caps break the skyline without wrapping bright bands around it.
 const pillars=[
  [27.2,183.8,6,7.4,80.6],[30.6,185.6,5.6,6.2,82.4],[33.5,184.3,4.4,7.5,81.3],
  [35.5,186.3,3.2,5.7,78.7],[26.6,188,4.3,3.4,78.8],[29.4,189.5,3.2,3.2,79.6],
  [32.4,188.4,3.5,4.7,80.2],[35.1,190.6,2.1,2.7,76.9],[38.0,187.2,3.8,5.2,77.6],
  [40.6,185.7,2.8,5.5,76.8],[42.1,188.0,2.2,3.7,74.9],[39.8,191.1,2.7,3.1,75.6],
  [36.2,181.8,4.6,6.3,79.5],[24.2,184.1,3.7,5.2,77.8],
 ] as const;
 pillars.forEach(([x,z,w,d,top],i)=>{
  const seam=top-(i%3)*.4-.8;
  course('rock-'+i,x,z,w,d,58,seam,i%4===1?'cliff-shadow':'cliff-slate');
  course('brow-'+i,x-.17,z+.12,w-.34,d-.24,seam,top,i%3===0?'cliff-ochre':'cliff-sun');
 });
 // Root, elbow and apex lean at different angles like a pine bent by prevailing wind.
 const limb=(id:string,start:DetailVec3,end:DetailVec3,width:number)=>{
  out.push(...steppedTimber('evening-cliff/'+id,start,end,width,width,'bark'));
 };
 limb('root',[30.9,82.35,185.7],[30.3,84.2,185.5],.58);
 limb('trunk',[30.3,84.0,185.5],[32.3,86.2,185.9],.50);
 limb('apex',[32.2,86.1,185.9],[33.2,88.3,185.8],.38);
 limb('lee',[31.4,85.2,185.7],[27.6,86.1,186.7],.31);
 limb('fan',[32.7,87.1,185.8],[36.7,88.0,184.2],.29);
 limb('low',[30.35,84.2,185.7],[33.5,85,187.3],.27);
 // A hooked windward twig and exposed roots connect the crown to the crag.
 limb('root-toe',[30.9,82.42,185.7],[32.75,82.4,186.45],.22);
 limb('root-seam',[32.75,82.4,186.45],[33.62,81.38,186.62],.17);
 limb('crook',[27.9,86.08,186.65],[26.6,85.88,187.3],.19);
 limb('crook-tip',[26.6,85.88,187.3],[25.85,86.6,187.5],.14);
 limb('wind-tip',[36.4,87.97,184.4],[38.7,88.42,183.55],.17);
 const foliage=[
  [27.1,186.8,3.25,1.8,85.9,.58],[28.1,186.7,2.8,2.1,86.4,.55],[26.5,186.2,1.9,1.5,86.28,.44],
  [33.5,187.4,2.85,1.75,84.9,.59],[34.5,187.3,1.9,1.55,85.4,.50],
  [36.4,184.4,3.9,2.2,87.95,.65],[37.7,184.0,1.7,1.4,88.38,.44],
  [33.7,185.5,3.15,2.55,88.85,.62],[32.7,185.1,1.9,1.45,89.42,.37],
 ] as const;
 foliage.forEach(([x,z,w,d,y,h],i)=>course('pine-pad-'+i,x,z,w,d,y,y+h,i===8?'leaf':'pine'));
 out.push(b('evening-cliff/upper-needles',CLIFF_PINE.position,CLIFF_PINE.size,'pine'));
 const tips=[
   [25.6,187.4,86.6,1.65,.38,1.15],[24.95,187.65,86.75,1.05,.25,.72],
   [26.15,187.22,86.94,1.25,.34,.90],[27.6,186.5,87.08,1.4,.36,1.05],
   [35.7,187.0,85.72,1.68,.33,1.02],[36.4,187.12,85.86,.88,.22,.62],
   [38.55,183.64,88.50,1.52,.38,1.20],[39.32,183.56,88.67,.86,.25,.62],
   [32.35,185.2,89.83,1.46,.38,1.06],[31.75,185.0,90.04,.76,.22,.65],
 ] as const;
 tips.forEach(([x,z,y,w,h,d],i)=>out.push(b('evening-cliff/needle-tip-'+i,[x,y,z],[w,h,d],i%3?'pine':'leaf')));
 return out;
}

// West-pointing enamel fingerpost at the fork between town-high and ridge-loop.
const ridgeSignX=68.4, ridgeSignZ=199;
export function ridgeArrow(ground:Ground) {
 return {position:[ridgeSignX,ground(ridgeSignX,ridgeSignZ)+2.05,ridgeSignZ] as DetailVec3,size:[2.15,.58,.25] as DetailVec3};
}
function ridgeFingerpost(ground:Ground):DetailBox[] {
 const {position:[x,y,z]}=ridgeArrow(ground);
 const out=[b('ridge-sign/post',[x+.24,y-1.04,z],[.26,2.18,.24],'wood'),
  b('ridge-sign/board',[x+.03,y,z],[1.88,.54,.23],'cream'),
  b('ridge-sign/cap',[x+.24,y+.35,z],[.37,.16,.32],'wood-light')];
 for(const side of [-1,1]){
  const face=z+side*.13;
  out.push(b('ridge-sign/shaft-'+side,[x+.18,y,face],[1.38,.15,.035],'red',false));
  for(let i=0;i<3;i++)out.push(b('ridge-sign/tip-'+side+'-'+i,[x-.55-.13*i,y,face],[.14,.48-.14*i,.036],'red',false));
 }
 return out;
}

/** Low foreground clusters flank the ridge opening without filling its lookout sightline. */
export function ridgeForeground(ground:Ground):DetailBox[]{
 const out=[...eveningCliff(),...ridgeFingerpost(ground)];
 for(const[side,x,z]of [['west',-11,214],['east',13,211]]as const){
  for(let i=0;i<5;i++){
   const px=x+(i%3)*.72,pz=z+Math.floor(i/3)*.65,h=.3+(i%3)*.15;
   out.push(b(`ridge-foreground/${side}-stone-${i}`,[px,ground(px,pz)+h/2,pz],[1.15,h,.9],i%2?'rock':'rock-light'));
  }
  for(let i=0;i<12;i++){
   const px=x-1+(i%4)*.4,pz=z+1.5+Math.floor(i/4)*.35;
   out.push(b(`ridge-foreground/${side}-flower-${i}`,[px,ground(px,pz)+.22,pz],[.22,.12,.22],i%3?'flower':'flower-red',false));
  }
 }
 return out;
}
