import {VoxelMesh} from './voxel-mesh.ts';
import type {Vec3} from './world-layout.ts';

// The local origin is the existing animated suspension pivot. The mouth, shoulder
// and clapper stay inside the physical envelope of the original 0.25m voxel shell.
export function courtyardBronze():VoxelMesh {
 const m=new VoxelMesh(),count=32,step=2*Math.PI/count;
 const point=(a:number,r:number,y:number):Vec3=>[r*Math.sin(a),y,r*Math.cos(a)];
 const shell=(rings:readonly (readonly [number,number,string])[],inside=false)=>{
  for(let row=1;row<rings.length;row++){
   const [y0,r0]=rings[row-1]!,[y1,r1,mat]=rings[row]!;
   for(let i=0;i<count;i++){
    const a=i*step,b=a+step,mid=a+step/2,dy=y1-y0,dr=r1-r0,len=Math.hypot(dy,dr),sign=inside?-1:1;
    const n:Vec3=[Math.sin(mid)*dy/len*sign,-dr/len*sign,Math.cos(mid)*dy/len*sign];
    m.quad([point(a,r0,y0),point(b,r0,y0),point(b,r1,y1),point(a,r1,y1)],n,mat);
   }
  }
 };
 shell([[-2.49,1.08,'bell-gold'],[-2.45,1.13,'bell-gold'],[-2.37,1.13,'bell-bronze'],[-2.31,1.06,'bell-gold'],
  [-2.25,1.03,'bell-patina'],[-2.13,.978,'bell-bronze'],[-1.80,.904,'bell-body'],[-1.43,.862,'bell-body'],
  [-.98,.84,'bell-body'],[-.82,.80,'bell-bronze'],[-.63,.734,'bell-body'],[-.43,.61,'bell-bronze'],
  [-.31,.45,'bell-body'],[-.28,.18,'bell-bronze'],[-.28,.01,'bell-body']]);
 shell([[-2.49,.99,'bell-inner'],[-2.28,.93,'bell-inner'],[-1.5,.70,'bell-inner'],[-.70,.01,'bell-inner']],true);
 shell([[-2.49,.99,'bell-gold'],[-2.491,1.081,'bell-gold']]);
 m.box([0,-1.5,0],[.115,1.95,.115],'bell-inner');
 m.box([0,-2.56,0],[.34,.30,.34],'bell-bronze',.44);
 for(const side of [-1,1]){
  m.beam([side*.28,-.35,0],[side*.23,-.08,0],.15,.15,'bell-bronze');
  m.beam([side*.23,-.08,0],[side*.08,.015,0],.14,.14,'bell-gold');
 }
 m.beam([-.12,.01,0],[.12,.01,0],.14,.14,'bell-bronze');
 // Turned fillets and recessed grooves follow the change in profile.
 for(const [y,r] of [[-2.40,1.13],[-2.20,1.016],[-1.94,.94],[-1.01,.85],[-.92,.842],[-.73,.78],[-.38,.56]]){
  shell([[y!-.022,r!,'bell-bronze'],[y!,r!+.018,'bell-gold'],[y!+.021,r!,'bell-bronze']]);
 }
 for(let i=0;i<16;i++){
  const a=i*step*2,normal:Vec3=[Math.sin(a),.09,Math.cos(a)];
  // Cast lotus leaves make a continuous lower frieze. Each raised fold has two differently lit faces.
  const base=point(a,1.004,-2.16),tip=point(a,.948,-1.88),left=point(a-.144,.974,-2.035),right=point(a+.144,.974,-2.035),fold=point(a,.998,-2.015);
  m.quad([base,left,tip,fold],normal,'bell-patina');
  m.quad([base,fold,tip,right],normal,'bell-gold');
  // Alternating studs give the upper register a distinct scale at arm's length.
  for(let j=0;j<2;j++){
   const angle=a+j*.105,y=-.87+j*.09,r=.833-j*.030;
   m.box(point(angle,r,y),[.053,.055,.040],'bell-gold',angle);
  }
  if(i%4===0){
   // A round striking boss, concentric with a smaller recessed centre.
   const cy=-1.52;
   const profile=[[.24,.891,'bell-patina'],[.22,.916,'bell-gold'],[.193,.924,'bell-bronze'],
    [.164,.938,'bell-patina'],[.141,.971,'bell-bronze'],[.084,1.012,'bell-body'],[.001,1.031,'bell-gold']] as const;
   const vertex=(k:number,r:number,depth:number):Vec3=>{
    const t=k*Math.PI/8;
    return [Math.sin(a)*depth+Math.cos(a)*r*Math.cos(t),cy+r*Math.sin(t),Math.cos(a)*depth-Math.sin(a)*r*Math.cos(t)];
   };
   for(let ring=1;ring<profile.length;ring++){
    const [outer,d0]=profile[ring-1]!,[inner,d1,mat]=profile[ring]!;
    for(let k=0;k<16;k++){
     const t=(k+.5)*Math.PI/8,slope=(d1-d0)/(outer-inner),l=Math.hypot(1,slope);
     const n:Vec3=[(Math.sin(a)+Math.cos(a)*Math.cos(t)*slope)/l,Math.sin(t)*slope/l,(Math.cos(a)-Math.sin(a)*Math.cos(t)*slope)/l];
     m.quad([vertex(k,outer,d0),vertex(k+1,outer,d0),vertex(k+1,inner,d1),vertex(k,inner,d1)],n,mat);
    }
   }
  }else{
   // A slender frame on the tablet field, with a clear open centre.
   m.beam(point(a,.875,-1.89),point(a,.849,-1.08),.017,.017,'bell-bronze');
  }
 }
 // Two cast seals face opposite approaches. The backplate follows the bell's taper.
 for(const a of [-2.50,Math.PI-2.50]){
  const seal=(x:number,y:number,offset:number):Vec3=>{
   const depth=.878-(y+1.45)*.078+offset;
   return [Math.sin(a)*depth-Math.cos(a)*x,y,Math.cos(a)*depth+Math.sin(a)*x];
  };
  const xmin=-.194,xmax=.194,top=-1.11,bottom=-1.82,n:Vec3=[Math.sin(a),.078,Math.cos(a)];
  m.quad([seal(xmin,bottom,.012),seal(xmax,bottom,.012),seal(xmax,top,.012),seal(xmin,top,.012)],n,'bell-patina');
  const line=(x:number,y:number,u:number,v:number,w:number)=>m.beam(seal(x,y,.023),seal(u,v,.023),w,.020,'bell-gold');
  const corners=[[xmin,top],[xmax,top],[xmax,bottom],[xmin,bottom]] as const;
  for(let k=0;k<4;k++){const p=corners[k]!,q=corners[(k+1)%4]!;line(p[0],p[1],q[0],q[1],.023);}
  // 山 and 雨, cast on the same field as the lower lotus frieze.
  for(const [x,y,u,v] of [[-.105,-1.22,-.105,-1.39],[0,-1.17,0,-1.39],[.105,-1.22,.105,-1.39],[-.105,-1.39,.105,-1.39],
    [-.12,-1.49,.12,-1.49],[-.105,-1.56,.105,-1.56],[-.105,-1.56,-.105,-1.75],[.105,-1.56,.105,-1.75],[0,-1.49,0,-1.75],
    [-.075,-1.61,-.035,-1.63],[.032,-1.61,.076,-1.63],[-.076,-1.68,-.034,-1.70],[.032,-1.68,.076,-1.70]] as const)line(x,y,u,v,.022);
 }
 return m;
}
