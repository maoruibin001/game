import {VoxelMesh} from './voxel-mesh.ts';
import {listeningPlaque,pavilionJoinery} from './bell-pavilion.ts';
import type {Vec3} from './world-layout.ts';

import {MOON_WINDOW} from './courtyard-structure.ts';

export function courtyardFinish():VoxelMesh{
 const m=new VoxelMesh();
 pavilionJoinery(m);listeningPlaque(m);
 // Glazed inner reveal follows the cut-through window; bamboo remains visible between the lattice bars.
 const w=MOON_WINDOW,n=20;
 for(let i=0;i<n;i++){
  const p=(j:number,z:number):Vec3=>[w.x+w.r*Math.cos(j*Math.PI*2/n),w.y+w.r*Math.sin(j*Math.PI*2/n),z];
  for(const z of [57.17,57.82])m.beam(p(i,z),p(i+1,z),.14,.17,'tile-cap');
 }
 for(const slope of [-1,1])for(const offset of [-.50,0,.50]){
  const root=Math.sqrt(2*w.r*w.r-offset*offset),u=(-slope*offset-root)/2,v=(-slope*offset+root)/2;
  m.beam([w.x+u,w.y+slope*u+offset,57.38],[w.x+v,w.y+slope*v+offset,57.38],.039,.046,'temple-wood');
 }
 // A small landscape painted directly on the west lime wall: two distant ridges,
 // a dark near bank and a cinnabar seal. The centre of the wall stays pale behind the bell.
 const landscape=(profile:readonly number[],base:number,z:number,ink:string)=>{
  for(let i=1;i<profile.length;i++){
   const x=160.26+3.77*(i-1)/(profile.length-1),xx=160.26+3.77*i/(profile.length-1);
   m.quad([[x,base,z],[xx,base,z],[xx,base+profile[i]!,z],[x,base+profile[i-1]!,z]],[0,0,-1],ink);
  }
 };
 landscape([0,.08,.19,.15,.32,.21,.35,.51,.43,.63,.47,.54,.33,.38,.18,.09,.04,0],24.82,57.265,'ink-mist');
 landscape([0,.11,.08,.27,.22,.38,.28,.21,.27,.16,.19,.15,.11,.17,.12,.07,.04,0],24.82,57.258,'ink-sage');
 m.box([160.41,24.94,57.246],[.12,.16,.016],'temple-lacquer');
 m.box([160.41,24.95,57.234],[.044,.064,.012],'gravel');
 // Weathered sill, fascia and screens on the quiet side of the hall.
 for(const x of [146.75,151.75]){
  m.box([x,26.7,48.70],[1.78,1.5,.07],'bell-inner');
  for(const off of [-.9,.9])m.box([x+off,26.7,48.63],[.095,1.72,.12],'temple-wood');
  for(const dy of [-.78,-.30,.79])m.box([x,26.7+dy,48.62],[1.9,.086,.12],'temple-wood');
  for(let j=-2;j<=2;j++)m.box([x+j*.27,26.94,48.64],[.045,1.04,.065],'wood-light');
 }
 // Fine timber joins follow the outside of the existing side wall.
 for(const z of [52.6,54.65]){
  m.box([154.30,26.37,z],[.09,1.61,1.78],'bell-inner');
  for(const off of [-.89,0,.89])m.box([154.37,26.37,z+off],[.11,1.73,.09],'temple-wood');
  for(const dy of [-.79,-.36,.78])m.box([154.37,26.37+dy,z],[.11,.08,1.87],'temple-wood');
  for(const off of [-.60,-.31,.31,.60])m.box([154.36,26.58,z+off],[.065,1.05,.044],'wood-light');
 }
 // A copper chain terminates above the real water basin under the north eave.
 const bx=160.25,bz=53.15;
 for(let i=0;i<13;i++){
  const y=28.72-i*.29,side=i%2?-1:1;
  m.beam([bx-.046,y,bz],[bx,y-.10,bz+side*.047],.031,.031,'bell-bronze');
  m.beam([bx,y-.10,bz+side*.047],[bx+.046,y-.18,bz],.031,.031,'bell-bronze');
  m.beam([bx+.046,y-.18,bz],[bx-.046,y-.29,bz],.028,.028,'bell-bronze');
 }
 for(const r of [.11,.23,.35])for(let j=0;j<16;j++){
  const p=(k:number):Vec3=>[bx+r*Math.cos(k*Math.PI/8),24.789,bz+r*.83*Math.sin(k*Math.PI/8)];
  m.beam(p(j),p(j+1),.014,.008,'water-jade');
 }
 // Unequal-height bamboo culms mass at the two ends of the wall, leaving pale plaster behind the bell.
 for(const [x,z,height]of [[170.3,57.96,4.5],[171.85,56.3,5.6],[170.9,59.8,4.7],[172.12,59.25,6.1],
   [159.7,60.6,4.65],[158.6,60.1,4.2],[157.74,59.42,4.66],[156.54,60.68,3.95],[164.2,60.35,4.9]] as const){
  const rootY=24,phase=x*.7;
  const point=(t:number):Vec3=>[x+.32*t*t,rootY+height*t,z+.23*t*t];
  m.beam(point(0),point(1),.10,.09,'bamboo');
  for(let j=1;j<=7;j++){
   const t=j/8,p=point(t);
   m.box(p,[.12,.037,.112],'bamboo-node');
   if(j<3)continue;
   const sign=j%2?1:-1,branch:Vec3=[p[0]+sign*(.55+.18*Math.sin(phase+j)),p[1]+.22,p[2]+.30*Math.cos(phase+j)];
   m.beam(p,branch,.035,.031,'bamboo');
   for(let k=0;k<5;k++){
    const a=phase+k*1.20+j,tip:Vec3=[branch[0]+.46*Math.cos(a),branch[1]-.15+k*.032,branch[2]+.4*Math.sin(a)];
    const mid:Vec3=[(branch[0]+tip[0])/2+.064*Math.sin(a),branch[1]+.06,(branch[2]+tip[2])/2-.064*Math.cos(a)];
    const back:Vec3=[mid[0]-.11*Math.sin(a),mid[1]-.028,mid[2]+.11*Math.cos(a)];
    m.quad([branch,mid,tip,back],[0,1,0],k%2?'bamboo-leaf':'leaf');
    m.quadShaded([branch,back,tip,mid],[0,-1,0],[0,1,0],'bamboo-leaf');
   }
  }
 }
 return m;
}
