import {COURT_PINES} from './courtyard-garden.ts';
import {LANTERN_POS} from './courtyard-structure.ts';
import {VoxelMesh} from './voxel-mesh.ts';
import type {Vec3} from './world-layout.ts';

type Ground=(x:number,z:number)=>number;
export const GINKGO_BARK='ginkgo-bark';
const TAU=2*Math.PI;
function random(seed:number){
 let state=seed>>>0;
 return ()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
}

/** A slightly folded, notched fan; the same outline appears on the tree, in flight and on stone. */
export function ginkgoFan(m:VoxelMesh,base:Vec3,size:number,yaw:number,lift:number,mat:string):void{
 const cx=Math.cos(yaw),cz=Math.sin(yaw),flat=Math.sqrt(1-lift*lift);
 const vertex=(w:number,h:number):Vec3=>[base[0]+size*(cx*w+cz*h*flat),base[1]+size*(h*lift+.11*(1-Math.min(1,Math.abs(w)*2))*h),base[2]+size*(cz*w-cx*h*flat)];
 const rim=[[-.60,.67],[-.48,.93],[-.20,1.04],[0,.86],[.22,1.05],[.49,.92],[.60,.67]] as const;
 const first=m.vertices.length/8,n=Math.hypot(.24*lift,1);
 const shade:Vec3=[.24*lift*cz/n,1/n,-.24*lift*cx/n];
 // Both windings share the same lit surface and the same vertices on these thin leaves.
 m.vertices.push(...base,...shade,.5,0);
 for(const [w,h] of rim)m.vertices.push(...vertex(w,h),...shade,.5+w*.75,h);
 const indices=m.groups.get(mat)??[];
 if(!m.groups.has(mat))m.groups.set(mat,indices);
 for(let i=1;i<rim.length;i++)indices.push(first,first+i,first+i+1,first,first+i+1,first+i);

}
export function ginkgoCrown(m:VoxelMesh,x:number,y:number,z:number,rx:number,rz:number,h:number,angle:number,mat:string){
 const rings=[[.57,-.48],[1,-.12],[.89,.18],[.58,.48]] as const;
 const n=9,point=(k:number,r:number,dy:number):Vec3=>{
  const a=angle+TAU*k/n,irregular=1+.11*Math.sin(3*a+angle);
  return [x+rx*Math.cos(a)*r*irregular,y+dy*h,z+rz*Math.sin(a)*r*irregular];
 };
 for(let k=0;k<n;k++){
  const a=angle+TAU*(k+.5)/n;
  for(let j=1;j<rings.length;j++){
   const lo=rings[j-1]!,hi=rings[j]!,up=j*.25+.1,len=Math.hypot(.62,up);
   m.quad([point(k,lo[0],lo[1]),point(k+1,lo[0],lo[1]),point(k+1,hi[0],hi[1]),point(k,hi[0],hi[1])],[.62*Math.cos(a)/len,up/len,.62*Math.sin(a)/len],mat);
  }
  m.quad([[x,y+h*.49,z],point(k,.58,.48),point(k,.58,.48),point(k+1,.58,.48)],[0,1,0],mat);
  m.quad([[x,y-h*.48,z],point(k+1,.57,-.48),point(k+1,.57,-.48),point(k,.57,-.48)],[0,-1,0],mat);
 }
}

/** A divided trunk, distinct boughs and openings in the crown, seen from every side. */
export function ginkgoCanopy(ground:Ground):VoxelMesh{
 const m=new VoxelMesh(),roll=random(1739);
 const root:Vec3=[168.5,24,53.5],fork:Vec3=[168.46,27.85,53.43];
 m.beam(root,fork,.60,.53,GINKGO_BARK);
 const limbs:[Vec3,Vec3,number][]=[
  [[168.46,27.85,53.43],[166.75,29.7,53.17],.38],
  [[166.75,29.7,53.17],[163.8,30.55,52.7],.25],
  [[166.75,29.7,53.17],[165.2,31.66,54.55],.21],
  [[168.46,27.85,53.43],[169.65,30.4,53.9],.37],
  [[169.65,30.4,53.9],[168.8,33.12,54.84],.25],
  [[169.65,30.4,53.9],[172.42,31.28,53.25],.25],
  [[168.25,28.35,53.45],[166.88,29.18,50.44],.22],
  [[169.02,29.05,53.76],[170.48,30.2,56.15],.22],
 ];
 for(const [a,b,w]of limbs)m.beam(a,b,w,w*.86,GINKGO_BARK);
 const heads:readonly (readonly [number,number,number,number,number])[]=[
  [163.6,30.67,52.80,2.05,1.38],[165.35,31.04,53.24,1.9,1.66],
  [165.12,31.85,54.8,2.05,1.60],[166.4,32.48,55.20,2.05,1.72],
  [168.7,33.4,54.74,2.32,1.86],[169.6,32.53,54.25,2.3,1.85],
  [171.22,31.80,53.5,2.38,1.8],[172.68,31.35,53.07,2,1.55],
  [170.55,30.48,56.40,2.16,1.54],[166.72,29.48,50.23,1.65,1.48],
  [167.68,30.50,51.94,2.15,1.55],
 ];
 const hues=['ginkgo-ochre','ginkgo-amber','ginkgo-gold','ginkgo-light'];
 for(const [x,y,z,rx,rz]of heads){
  for(let j=0;j<12;j++){
   const a=roll()*TAU,r=Math.sqrt(roll()),px=x+Math.cos(a)*r*rx,pz=z+Math.sin(a)*r*rz,py=y+.34*roll()+.48*(1-r);
   const shade=py>31.65?2:roll()>.42?1:0;
   ginkgoCrown(m,px,py,pz,.49+roll()*.42,.42+roll()*.37,.25+roll()*.23,a,hues[shade]!);
   // Small, overlapping sprays vary the edge at the scale of a photograph.
   for(let f=0;f<26;f++){
    const dir=TAU*roll(),rr=.36+roll()*.76,base:Vec3=[px+.79*rr*Math.cos(dir),py-.24+roll()*.55,pz+.67*rr*Math.sin(dir)];
    ginkgoFan(m,base,.24+roll()*.19,dir,(roll()-.45)*1.74,hues[Math.min(3,shade+(roll()>.48?1:0)+(roll()>.82?1:0))]!);
   }
  }
 }
 // Layered pine boughs outside the white wall silhouette the garden against the hillside.
 // Each tier forks from a real bough; leave an opening between the two trees at the moon window.
 for(const {x,z,height:h,spread:w} of COURT_PINES){
  const base=ground(x,z)-.08,top:Vec3=[x+.35,base+h,z-.22];
  m.beam([x,base,z],top,.30,.26,GINKGO_BARK);
  for(let j=0;j<9;j++){
   const level=j/9,a=j*2.4+z,spread=w*(1-level*.78);
   const fork:Vec3=[x+.35*level,base+h*(.36+.59*level),z-.22*level];
   const end:Vec3=[fork[0]+spread*Math.sin(a),fork[1]+.54,fork[2]+spread*Math.cos(a)];
   m.beam(fork,end,.13-.07*level,.12-.06*level,GINKGO_BARK);
   for(let k=0;k<5;k++){
    const yaw=a+k*1.26,r=k===0?0:.82;
    ginkgoCrown(m,end[0]+Math.cos(yaw)*r,end[1]+.20*(k%2),end[2]+Math.sin(yaw)*r,
     1.05-.32*level,1.20-.33*level,.55+roll()*.18,yaw,k%4===0?'grove-tip':j%2?'grove-pine':'grove-jade');
   }
  }
 }
 return m;
}

// The hillside directly over the pavilion has a softer, divided canopy. This local
// mesh fits the existing tree collider and instance envelope (about 8m of solid trunk).
export function courtyardHillsideTree():VoxelMesh{
 const m=new VoxelMesh();
 m.box([0,4,0],[.76,8,.76],'ginkgo-bark');
 const tiers:readonly (readonly [number,number,number,number])[]=[
  [-1.95,5.60,.58,1.73],[1.46,6.20,-1.05,1.80],[-.96,7.05,-1.34,1.68],
  [1.38,7.68,1.07,1.57],[-1.40,8.22,.81,1.65],[.41,8.90,-.42,1.52],[.15,9.70,.38,1.14],
 ];
 for(const [i,[x,y,z,r]] of tiers.entries()){
  m.beam([0,y-1.72,0],[x*.48,y-.50,z*.48],.21,.19,'ginkgo-bark');
  m.beam([x*.48,y-.50,z*.48],[x,y,z],.14,.12,'ginkgo-bark');
  for(let j=0;j<4;j++){
   const angle=i*1.75+j*Math.PI/2,rad=j===0?0:r*.45;
   ginkgoCrown(m,x+rad*Math.cos(angle),y+.23*(j%2),z+rad*Math.sin(angle),r*.79,r*.71,.65+.12*(j%2),angle,
    j===2?'hillside-sun':i%2?'hillside-jade':'hillside-shade');
  }
 }
 return m;
}

/** Large, bevelled paving slabs read across the path; fine joints are visible only near the feet. */
function slab(m:VoxelMesh,x:number,y:number,z:number,w:number,d:number,h:number,mat:string,chamfer=.11,yaw=0){
 const wx=w/2,dz=d/2,cut=Math.min(chamfer,wx*.48,dz*.48),c=Math.cos(yaw),s=Math.sin(yaw);
 const outline=[[-wx+cut,-dz],[wx-cut,-dz],[wx,-dz+cut],[wx,dz-cut],[wx-cut,dz],[-wx+cut,dz],[-wx,dz-cut],[-wx,-dz+cut]];
 const at=(k:number,dy:number):Vec3=>{const [a,b]=outline[k%8]!;return [x+a!*c+b!*s,y+dy,z-a!*s+b!*c];};
 for(let i=0;i<8;i++){
  const a=at(i,0),b=at(i+1,0),dx=b[0]-a[0],dz=b[2]-a[2],l=Math.hypot(dx,dz);
  m.quad([[x,y,z],a,a,b],[0,1,0],mat);
  m.quad([a,b,at(i+1,-h),at(i,-h)],[dz/l,0,-dx/l],mat);
 }
}

function stoneLantern(m:VoxelMesh,x:number,z:number,y:number){
 const layer=(dy:number,w:number,d:number,h:number,mat:string)=>slab(m,x,y+dy,z,w,d,h,mat,w*.19);
 layer(.16,.86,.82,.16,'stone-deep');layer(.26,.68,.66,.11,'stone-jade');
 layer(.99,.31,.31,.75,'stone-jade');layer(1.12,.5,.50,.14,'stone-deep');
 layer(1.23,.67,.65,.12,'stone-pale');
 m.box([x,y+1.46,z],[.37,.43,.37],'paper-light');
 for(const sx of[-1,1])for(const sz of[-1,1])m.box([x+sx*.218,y+1.47,z+sz*.218],[.094,.52,.094],'stone-jade');
 for(const off of [-.09,.09]){
  for(const sign of[-1,1]){m.box([x+off,y+1.47,z+sign*.20],[.024,.44,.026],'temple-wood');m.box([x+sign*.20,y+1.47,z+off],[.026,.44,.024],'temple-wood');}
 }
 layer(1.78,.91,.88,.10,'stone-deep');layer(1.87,.73,.70,.10,'stone-jade');
 layer(1.96,.54,.51,.10,'stone-jade');layer(2.03,.34,.32,.08,'stone-pale');
 layer(2.10,.18,.18,.09,'stone-deep');layer(2.21,.23,.23,.12,'stone-jade');layer(2.27,.12,.12,.07,'stone-pale');
}
export function gardenFloor(ground:Ground):VoxelMesh{
 const m=new VoxelMesh(),roll=random(5267);
 const stone=['stone-jade','stone-blue','stone-pale','stone-lichen'];
 // Align the first run to the bridge, then draw the eye diagonally into the bell pavilion.
 for(let row=0;row<17;row++){
  const z=36.8+row*1.08,cx=155+Math.max(0,Math.min(3.35,(z-41)*.36));
  const half=row<6?1.16:2.22+(row>8?.44:0),parts=row<6?2:3;
  let start=cx-half;
  for(let col=0;col<parts;col++){
   const end=col===parts-1?cx+half:cx-half+(col+1)*2*half/parts+(roll()-.5)*.62;
   const x=(start+end)/2;
   slab(m,x,ground(x,z)+.014,z,end-start-.037,1.035,.080,stone[Math.floor(roll()*4)]!,.055+roll()*.11);
   start=end;
  }
 }
 // The existing walk blockers form the buried heart of a three-piece weathered rock.
 // Visible bevelled shoulders meet the same rock and carry moss across its upper seam.
 const rockY=ground(162.9,47.1)-.08;
 slab(m,162.88,rockY+.54,47.08,2.25,1.51,.59,'stone-deep',.29,-.05);
 slab(m,163.20,rockY+.76,47.16,1.51,1.12,.24,'stone-jade',.24,.10);
 slab(m,163.20,rockY+1.055,47.15,1.24,1.0,.31,'stone-jade',.13,-.05);
 slab(m,163.17,rockY+1.113,47.16,1.17,.86,.07,'grove-jade',.17,-.08);
 for(const [x,z,size]of [[162.20,47.78,.81],[163.62,46.58,.55],[162.0,46.60,.48]] as const){
  for(let blade=0;blade<9;blade++){
   const a=blade*TAU/9+x,t=size*(.65+.35*roll()),start:Vec3=[x,rockY+.055,z],end:Vec3=[x+t*.65*Math.cos(a),rockY+t*.51,z+t*.65*Math.sin(a)];
   const mid:Vec3=[x+t*.32*Math.cos(a),rockY+t*.59,z+t*.32*Math.sin(a)];
   const p:Vec3=[mid[0]-.065*Math.sin(a),mid[1],mid[2]+.065*Math.cos(a)];
   const q:Vec3=[mid[0]+.065*Math.sin(a),mid[1]-.035,mid[2]-.065*Math.cos(a)];
   m.quad([start,p,end,q],[0,1,0],blade%2?'grove-tip':'grove-jade');
   m.quadShaded([start,q,end,p],[0,-1,0],[0,1,0],'grove-jade');
  }
 }
 const xy=LANTERN_POS;stoneLantern(m,xy[0],xy[1],ground(...xy)-.08);
 // A swept gravel crescent, with spaced curved rake marks bending around the lantern rock.
 const bedY=ground(162.55,45.8)-.08+.047;
 slab(m,162.55,bedY,45.8,2.68,2.12,.08,'gravel',.24,.015);
 for(let row=0;row<6;row++)for(let j=0;j<13;j++){
  const r=.47+row*.115,a=-2.90+j*.195,b=a+.195;
  m.beam([xy[0]+r*Math.sin(a),bedY+.011,xy[1]+r*.85*Math.cos(a)],[xy[0]+r*Math.sin(b),bedY+.011,xy[1]+r*.85*Math.cos(b)],.025,.018,'gravel-rake');
 }
 // Fallen fans collect at the edge, leaving a swept passage between the patches.
 for(const [cx,cz,rx,rz,n]of [[163.0,46.8,2.8,1.05,82],[164.85,51.4,2.55,3,96],[157.7,45.1,2.1,1.65,48],[155.55,40.7,1.1,2.9,22],[159.5,54.7,2.6,1.4,52]]){
  for(let j=0;j<n!;j++){
   const a=roll()*TAU,r=Math.sqrt(roll()),x=cx!+rx!*r*Math.cos(a),z=cz!+rz!*r*Math.sin(a);
   const onPaving=z>36.29&&z<54.6&&Math.abs(x-(155+Math.max(0,Math.min(3.35,(z-41)*.36))))<(z<42.8?1.14:2.21);
   const onGravel=Math.abs(x-162.55)<1.28&&Math.abs(z-45.8)<.99;
   const y=(onGravel?bedY:onPaving?ground(x,z)+.014:ground(x,z)-.08)+.006+roll()*.003;
   ginkgoFan(m,[x,y,z],.066+roll()*.065,roll()*TAU,.03+roll()*.09,roll()>.72?'ginkgo-light':'ginkgo-amber');
  }
 }
 return m;
}
