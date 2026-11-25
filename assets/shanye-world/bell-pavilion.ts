import type {Vec3} from './world-layout.ts';
import {VoxelMesh} from './voxel-mesh.ts';
import {CX,CZ,HALF_X,HALF_Z,XS,TS,eaveY,roofPoint,sections,bellRoofHeight} from './courtyard-structure.ts';

export function pavilionRoof():VoxelMesh{
 const m=new VoxelMesh();
 for(const side of [-1,1]){
  for(const [a,b] of sections(XS))for(const [c,d] of sections(TS)){
   const pts=[roofPoint(a,c,side),roofPoint(b,c,side),roofPoint(b,d,side),roofPoint(a,d,side)] as const;
   const slope=(eaveY(a,d)-eaveY(a,c))/((d-c)*HALF_Z),len=Math.hypot(1,slope);
   m.quad(pts,[0,1/len,side*slope/len],'temple-tile');
   // Timber lining closes off the underside of every curved roof course.
   const soffit=pts.map(([x,y,z]):Vec3=>[x,y-.13,z]);
   m.quad(soffit,[0,-1/len,-side*slope/len],'cedar-lining');
   if(c===0){
    const [p,q]=pts;
    m.quad([p,q,[q[0],q[1]-.16,q[2]],[p[0],p[1]-.16,p[2]]],[0,0,side],'tile-edge');
    m.beam([p[0],p[1]-.17,p[2]],[q[0],q[1]-.17,q[2]],.10,.14,'temple-lacquer');
   }
   if(a===-1||b===1){
    const u=a===-1?a:b,p=roofPoint(u,c,side),q=roofPoint(u,d,side);
    // Fill the gable end behind its verge; the rafters bear on the tie beam.
    const foot=28.68;
    m.quad([[p[0],p[1]-.14,p[2]],[q[0],q[1]-.14,q[2]],[q[0],foot,q[2]],[p[0],foot,p[2]]],[u,0,0],'cedar-lining');
    m.quad([p,q,[q[0],q[1]-.22,q[2]],[p[0],p[1]-.22,p[2]]],[u,0,0],'tile-edge');
   }
  }
  // Raised cover tiles run downslope. Round end caps catch a narrow rim of light.
  for(let tile=0;tile<=32;tile++){
   const x=CX-HALF_X+.085+(2*HALF_X-.17)*tile/32;
   for(const [c,d] of sections(TS)){
    const z0=CZ+side*HALF_Z*(1-c),z1=CZ+side*HALF_Z*(1-d);
    const y0=bellRoofHeight(x,z0)??eaveY((x-CX)/HALF_X,c),y1=bellRoofHeight(x,z1)??eaveY((x-CX)/HALF_X,d);
    m.beam([x,y0+.036,z0],[x,y1+.036,z1],.092,.074,tile%7===3?'tile-edge':'tile-cap');
    if(c===0)m.box([x,y0+.018,z0+side*.032],[.145,.115,.105],'tile-cap');
   }
  }
 }
 for(const [a,b] of sections(XS)){
  const p=roofPoint(a,1,1),q=roofPoint(b,1,1);
  m.beam(p,q,.26,.24,'tile-cap');
 }
 for(const side of [-1,1]){
  const p=roofPoint(side,1,1);
  m.beam([p[0]-side*.2,p[1]+.02,p[2]],[p[0]+side*.16,p[1]+.32,p[2]],.21,.22,'tile-cap');
 }
 return m;
}

export function pavilionJoinery(m:VoxelMesh):void{
 for(const x of [156.875,163.375])for(const z of [49.875,52.625]){
  const dir=x<CX?1:-1;
  m.box([x,24.26,z],[.55,.22,.55],'stone-jade');
  m.box([x,24.44,z],[.39,.16,.39],'stone-pale');
  m.box([x,27.93,z],[.38,.16,.38],'temple-lacquer');
  m.box([x,28.10,z],[.57,.18,.49],'temple-wood');
  m.box([x,28.26,z],[.86,.13,.66],'temple-lacquer');
  m.box([x,28.39,z],[1.07,.13,.84],'temple-wood');
  m.beam([x,27.49,z],[x+dir*.76,28.11,z],.15,.13,'temple-wood');
  m.beam([x+dir*.28,27.86,z],[x+dir*.55,28.11,z],.091,.11,'tile-edge');
 }
 // A warm paper shade hangs from the beam beside the garden. Its light source shares this position.
 const lx=163.03,lz=50.40,ly=27.05;
 m.beam([lx,28.42,lz],[lx,ly+.34,lz],.026,.026,'bell-inner');
 for(const dy of [-.29,.29])m.box([lx,ly+dy,lz],[.43,.07,.43],'temple-wood');
 m.box([lx,ly,lz],[.355,.52,.355],'paper-light');
 for(const x of [-.18,.18])for(const z of [-.18,.18])m.box([lx+x,ly,lz+z],[.029,.54,.029],'temple-wood');
 for(const dy of [-.18,.18])m.box([lx,ly+dy,lz],[.37,.018,.37],'bell-bronze');
 for(let i=0;i<17;i++){
  const x=156.23+i*.49;
  for(const side of [-1,1]){
   const z=CZ+side*2.32;
   m.box([x,28.64+.32*Math.max(0,Math.abs(x-CX)-3.25),z],[.13,.16,.62],'temple-wood');
  }
 }
}

/** Two painted characters on a lacquered timber panel, facing the approach from the bridge. */
export function listeningPlaque(m:VoxelMesh):void{
 const cx=160.12,cy=28.35,z=48.67;
 m.box([cx,cy,z],[1.58,.56,.10],'temple-wood');
 m.box([cx,cy,z-.061],[1.49,.48,.03],'bell-inner');
 for(const side of [-1,1]){
  m.box([cx,cy+side*.205,z-.083],[1.42,.018,.017],'bell-gold');
  m.box([cx+side*.70,cy,z-.083],[.018,.416,.017],'bell-gold');
 }
 type Line=readonly [number,number,number,number];
 const write=(origin:number,strokes:readonly Line[])=>{
  const p=(x:number,y:number):Vec3=>[origin-.39*x,cy+.168-y*.35,z-.105];
  for(const [x,y,u,v]of strokes)m.beam(p(x,y),p(u,v),.025,.019,'inscription');
 };
 write(cx+.47,[[.06,.26,.08,.78],[.06,.26,.32,.23],[.32,.23,.30,.73],[.08,.76,.30,.73],
  [.89,.09,.48,.22],[.50,.2,.48,.61],[.48,.61,.34,.93],[.47,.43,.96,.38],[.75,.41,.72,.98]]);
 write(cx-.06,[[.07,.11,.92,.08],[.13,.29,.86,.26],[.13,.27,.13,.92],[.87,.26,.86,.91],
  [.86,.91,.75,.84],[.50,.12,.49,.88],[.23,.42,.36,.50],[.60,.40,.75,.47],[.23,.62,.37,.7],[.61,.59,.75,.68]]);
}
