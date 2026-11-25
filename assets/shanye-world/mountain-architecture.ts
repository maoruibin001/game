import {VoxelMesh} from './voxel-mesh.ts';
import {gardenStairTop,UPPER_PORCH,roofLevels,roofRing,roofsFor,structureParts,terraceY,type Building,type Roof} from './mountain-precinct.ts';
import type {Vec3} from './world-layout.ts';

export const MOUNTAIN_PALETTE={
 'stair-surface':'#a6ad9f','stair-riser':'#9da597',
 'oxblood':'#944434','red-plaster':'#bd654a','ivory-plaster':'#e7d5ad','warm-plaster':'#d7ae82',
 'foundation':'#78837d','stone-rim':'#bbb7a1','celadon-roof':'#52828a','slate-roof':'#4c6675','oxide-roof':'#976347',
 'celadon-cap':'#819f9c','slate-cap':'#778a91','oxide-cap':'#c08d64','window-shadow':'#374d49',
 'postal-glaze':'#588589','postal-ridge':'#809b91',
 'screen-paper':'#ddbf82','indigo-cloth':'#486878','dyed-cloth':'#b76146','weathered-brass':'#c0a05e',
};
const lerp=(a:Vec3,b:Vec3,t:number):Vec3=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
const lower=(p:Vec3,h:number):Vec3=>[p[0],p[1]-h,p[2]];
function tiledRoof(m:VoxelMesh,r:Roof,postalGlaze=false){
 const material=postalGlaze?'postal-glaze':r.color+'-roof',cap=postalGlaze?'postal-ridge':r.color+'-cap';
 for(let side=0;side<4;side++){
  const outward:Vec3=side===0?[0,.90,-.44]:side===1?[.44,.90,0]:side===2?[0,.90,.44]:[-.44,.90,0];
  const divisions=Math.max(6,Math.round((side%2?r.d:r.w)/.47));
  for(let k=0;k<divisions;k++){
   const u=2*k/divisions-1,v=2*(k+1)/divisions-1;
   for(let j=1;j<roofLevels.length;j++){
    const a=roofLevels[j-1]!,b=roofLevels[j]!;
    const p=roofRing(r,a,side,u),q=roofRing(r,a,side,v),s=roofRing(r,b,side,u),t=roofRing(r,b,side,v);
    m.quad([p,q,t,s],outward,material);
    m.quad([lower(p,.17),lower(q,.17),lower(t,.17),lower(s,.17)],[-outward[0],-outward[1],-outward[2]],'temple-wood');
    if(j===1){
     m.quad([p,q,lower(q,.22),lower(p,.22)],[outward[0],0,outward[2]],cap);
     m.beam(lower(p,.27),lower(q,.27),.15,.17,'oxblood');
    }
    // Cover tiles follow the real folds. The taper keeps the hip and ridge clean.
    if(side%2===0||k%2===0){
     // A shallow ridge needs its two visible faces. It rests against the opaque tile field.
     const ux=side%2?0:1,uz=side%2?1:0,v0=.051*(1-a*.42),v1=.051*(1-b*.42);
     for(const sign of [-1,1]){
      const p0:Vec3=[p[0]+sign*ux*v0,p[1]+.019,p[2]+sign*uz*v0],p1:Vec3=[s[0]+sign*ux*v1,s[1]+.019,s[2]+sign*uz*v1];
      m.quad([p0,p1,lower(s,-.084),lower(p,-.084)],[outward[0]+sign*ux*.31,.86,outward[2]+sign*uz*.31],cap);
     }
    }
   }
  }
  for(let j=1;j<roofLevels.length;j++){
   m.beam(roofRing(r,roofLevels[j-1]!,side,-1),roofRing(r,roofLevels[j]!,side,-1),.18,.17,cap);
  }
  const corner=roofRing(r,0,side,-1),dx=Math.sign(corner[0]-r.x),dz=Math.sign(corner[2]-r.z);
  m.beam(corner,[corner[0]+dx*.33,corner[1]+.38,corner[2]+dz*.33],.20,.20,cap);
 }
 const top=r.y+r.rise;
 m.box([r.x,top-.03,r.z],[r.w*r.ridge,.16,r.d*.016+.10],cap);
 m.box([r.x,top+.12,r.z],[r.w*r.ridge+.16,.16,.25],cap);
}
function lamp(m:VoxelMesh,x:number,y:number,z:number,scale:number,lit=true){
 m.beam([x,y+.79*scale,z],[x,y+.34*scale,z],.045,.045,'temple-wood');
 m.box([x,y,z],[.46*scale,.67*scale,.46*scale],lit?'paper-light':'cream');
 for(const t of [-1,1]){
  m.box([x,y+t*.35*scale,z],[.54*scale,.072*scale,.54*scale],'temple-wood');
  for(const s of [-1,1])m.box([x+t*.23*scale,y,z+s*.23*scale],[.031*scale,.7*scale,.031*scale],'temple-wood');
 }
 m.beam([x,y-.38*scale,z],[x,y-.64*scale,z],.06,.06,'dyed-cloth');
}
function rail(m:VoxelMesh,a:Vec3,b:Vec3){
 const n=Math.max(1,Math.round(Math.hypot(b[0]-a[0],b[2]-a[2])/2.15));
 for(const dy of [.43,.99])m.beam(lower(a,-dy),lower(b,-dy),.10,dy>.5?.15:.09,'oxblood');
 for(let i=0;i<=n;i++){
  const p=lerp(a,b,i/n);m.box(lower(p,-.54),[.16,1.08,.16],'oxblood');m.box(lower(p,-1.12),[.21,.11,.21],'weathered-brass');
  if(i<n){const mid=lerp(a,b,(i+.5)/n);m.box(lower(mid,-.70),[.074,.5,.074],'temple-wood');}
 }
}
function screens(m:VoxelMesh,b:Building,tier:number,y:number,w:number,d:number,h:number){
 const {x,z}=b;
 for(let side=0;side<4;side++){
  const length=(side%2?d:w),normal=side===0?-1:side===1?1:side===2?1:-1,span=length-.55;
  const boxes=(s:number,yy:number,out:number,ww:number,hh:number,dd:number,mat:string)=>{
   const center:Vec3=side%2?[x+normal*(w*.5+out),yy,z+s]:[x+s,yy,z+normal*(d*.5+out)];
   m.box(center,side%2?[dd,hh,ww]:[ww,hh,dd],mat);
  };
  const n=Math.max(1,Math.round(span/2.75)),step=span/n,winW=step*.70;
  const cy=y+h*.58,wh=Math.min(1.55,h*.52);
  for(let i=0;i<n;i++){
   const s=-span/2+step*(i+.5);
   if(b.kind==='hall'&&side===0&&Math.abs(s)<2.7&&tier===0){
    boxes(s,y+h*.37,.025,step*.82,h*.73,.10,'oxblood');
    boxes(s,y+h*.54,.094,step*.65,h*.25,.046,'screen-paper');
    for(const t of [-.21,0,.21])boxes(s+t*step,y+h*.54,.13,.048,h*.26,.05,'temple-wood');
    boxes(s,y+h*.30,.14,.115,.13,.06,'weathered-brass');continue;
   }
   boxes(s,cy,.033,winW+.16,wh+.17,.11,'temple-wood');
   boxes(s,cy,.103,winW,wh,.055,(b.kind==='tower'||i%4!==2)?'screen-paper':'window-shadow');
   for(let k=1;k<4;k++)boxes(s+winW*(k/4-.5),cy,.144,.05,wh,.05,'temple-wood');
   for(const f of [-.27,.18])boxes(s,cy+wh*f,.144,winW,.047,.05,'temple-wood');
   boxes(s,cy-wh/2-.12,.095,winW+.26,.11,.23,'temple-wood');
  }
 }
}
const marks:Record<string,readonly string[]>={
 山:['00100','00100','10101','10101','11111'],邮:['01010','11111','11101','11111','00110'],驿:['11011','01001','11010','01011','10010'],
 藏:['10101','11111','01010','11111','10101'],书:['01010','11110','01011','11111','01001'],楼:['10101','11111','10101','01110','10101'],
};
function plaque(m:VoxelMesh,x:number,y:number,z:number,word:string[]){
 const width=word.length*.63+.42;
 m.box([x,y,z],[width,.87,.15],'temple-wood');m.box([x,y,z-.091],[width-.12,.75,.05],'window-shadow');
 for(const sign of [-1,1])m.box([x,y+sign*.33,z-.123],[width-.2,.025,.02],'weathered-brass');
 word.forEach((g,i)=>marks[g]!.forEach((row,j)=>Array.from(row).forEach((v,k)=>{
  if(v==='1')m.box([x+width/2-.39-i*.63-k*.086,y+.19-j*.096,z-.138],[.087,.095,.033],'inscription');
 })));
}
function buildingMesh(m:VoxelMesh,b:Building,ground:(x:number,z:number)=>number){
 const {x,z,floor:y,width:w,depth:d,height:h}=b;
 for(const p of structureParts(b)){
  m.box(p.center,p.size,p.mat);
  if(p.id.includes('/pier-')){
   const g=ground(p.center[0],p.center[2])-.25,top=p.center[1]-.425;
   if(top>g)m.box([p.center[0],(top+g)/2,p.center[2]],[p.size[0]+.13,top-g,p.size[2]+.13],'foundation');
   if(b.kind==='passage')for(const sign of [-1,1])
    m.beam([p.center[0],y+h-1.7,p.center[2]],[p.center[0]+sign*.95,y+h-.55,p.center[2]],.18,.23,'oxblood');
  }
 }
 if(b.kind==='shop'||b.kind==='hall'||b.kind==='tower'){
  screens(m,b,0,y,w-1.65,d-1.42,h*.94);
  m.box([x,y+.17,z],[w-.24,.31,d+.1],'stone-rim');
 }
 for(const [i,r] of roofsFor(b).entries()){
  const tower=b.kind==='tower',ww=(r.w-2.05),dd=(r.d-2.05),yy=r.y;
  if(i>0){
   const base=yy-(tower?3.3:2.35);
   m.box([x,base-.12,z],[ww+.87,.36,dd+.85],'temple-wood');
   m.box([x,(yy+base)/2,z],[ww-1.0,yy-base,dd-.85],tower?'red-plaster':'ivory-plaster');
   screens(m,b,i,base,ww-1.0,dd-.85,yy-base);
   for(const sign of [-1,1]){
    rail(m,[x-ww/2,base,z+sign*dd/2],[x+ww/2,base,z+sign*dd/2]);
    rail(m,[x+sign*ww/2,base,z-dd/2],[x+sign*ww/2,base,z+dd/2]);
   }
  }
  for(const side of [-1,1]){
   m.box([x,yy-.30,z+side*(dd/2)],[ww+.85,.53,.54],'temple-wood');
   m.box([x+side*ww/2,yy-.30,z],[.56,.53,dd+.64],'oxblood');
   const n=Math.max(2,Math.round(ww/3));
   for(let j=0;j<=n;j++){
    const px=x-ww/2+j*ww/n,pz=z+side*dd/2;
    m.box([px,yy-.68,pz],[.54,.38,.51],'oxblood');
    m.box([px,yy-.47,pz],[.91,.17,.68],'temple-wood');
    m.box([px,yy-.30,pz],[1.05,.15,.88],'oxblood');
   }
  }
  tiledRoof(m,r,b.id==='sorting-gate');
 }
 if(b.kind==='tower'){
  const top=roofsFor(b).at(-1)!,fy=top.y+top.rise;
  m.box([x,fy+.95,z],[.13,1.9,.13],'weathered-brass');
  for(let j=0;j<4;j++)m.box([x,fy+.32+j*.35,z],[.76-j*.15,.13,.76-j*.15],'weathered-brass');
 }
 if(b.kind==='passage'||b.kind==='hall'){
  for(const sign of [-1,1])lamp(m,x+sign*w*.33,y+h-1.53,z-d*.5-.5,1.25,z<62);
  if(b.kind==='passage')plaque(m,x,y+h-.65,z-d*.5-.1,b.id==='sorting-gate'?['山','邮']:['山']);
 }
 if(b.kind==='gallery'){
  for(const sign of [-1,1])for(let j=0;j<3;j++){
   const px=x-w*.42+w*j*.32;
   if(sign<0&&j===1)continue;
   rail(m,[px,y+.08,z+sign*d/2],[px+w*.20,y+.08,z+sign*d/2]);
  }
 }
 if(b.kind==='shop'){
  // Dyed shop curtains hang in individual leaves; lintels, sill and side frames stay visible behind them.
  const zz=z-d*.5-.51,half=w*.32;
  m.beam([x-half,y+h*.64,zz],[x+half,y+h*.64,zz],.09,.11,'temple-wood');
  for(let j=0;j<5;j++)m.box([x-half+(j+.5)*2*half/5,y+h*.64-.42,zz],[2*half/5-.10,.83-(j%2)*.11,.07],b.roof==='oxide'?'indigo-cloth':'dyed-cloth');
 }
}
export function architecture(buildings:readonly Building[],ground:(x:number,z:number)=>number):VoxelMesh{
 const m=new VoxelMesh();for(const b of buildings)buildingMesh(m,b,ground);return m;
}
/** A stone run has one exposed surface. Equal-height treads share a landing;
 * a narrow dressed edge joins each vertical riser to the following tread. */
function stoneProfile(mesh:VoxelMesh,start:number,end:number,x:number,width:number,offset:number,top:string,face:string,side:string){
 const levels:{z:number;y:number}[]=[];
 for(let z=start;z<end;z+=.5){
  const y=gardenStairTop(z+.25)+offset;
  if(!levels.length||y!==levels[levels.length-1]!.y)levels.push({z,y});
 }
 const left=x-width/2,right=x+width/2,base=levels[0]!.y-1.62;
 const points:{z:number;y:number}[]=[levels[0]!];
 for(let i=1;i<levels.length;i++){
  const {z,y}=levels[i]!,last=levels[i-1]!.y;
  points.push({z,y:last},{z,y:y-.032},{z:z+.032,y});
 }
 points.push({z:end,y:levels[levels.length-1]!.y});
 for(let i=1;i<points.length;i++){
  const a=points[i-1]!,b=points[i]!,rise=b.y-a.y,run=b.z-a.z,n=Math.hypot(run,rise);
  const normal:Vec3=[0,run/n,-rise/n];
  const colour=rise===0?top:face;
  // Dressed stone scatters a little light into the riser, even when viewed edge-on.
  const shade:Vec3=run===0?[0,.27,-.96286]:normal;
  mesh.quadShaded([[left,a.y,a.z],[left,b.y,b.z],[right,b.y,b.z],[right,a.y,a.z]],normal,shade,colour);
  if(run>0)for(const [xx,nx] of [[left,-1],[right,1]] as const){
   mesh.quad([[xx,base,a.z],[xx,a.y,a.z],[xx,b.y,b.z],[xx,base,b.z]],[nx,0,0],side);
  }
 }
 for(const [p,nz] of [[points[0]!,-1],[points[points.length-1]!,1]] as const){
  mesh.quad([[left,base,p.z],[right,base,p.z],[right,p.y,p.z],[left,p.y,p.z]],[0,0,nz],side);
 }
}
export function stairPaving():VoxelMesh{
 const mesh=new VoxelMesh();
 stoneProfile(mesh,62,96,158,7,0,'stair-surface','stair-riser','foundation');
 return mesh;
}
export function stairCourt():VoxelMesh{
 const m=new VoxelMesh(),cx=158;
 for(const [start,end] of [[66,77],[82,94]] as const)for(const side of [-1,1]){
  stoneProfile(m,start,end,cx+side*3.88,.77,.45,'stone-rim','foundation','foundation');
 }
 for(const z of [66,69.5,73,76.5,82,86,90,93.5])for(const side of [-1,1]){
  const x=cx+side*3.88,y=terraceY(z);
  m.box([x,y+.67,z],[.56,1.38,.58],'stone-blue');m.box([x,y+1.39,z],[.71,.16,.73],'stone-rim');
  m.box([x,y+1.56,z],[.38,.24,.38],'stone-jade');
 }
 // Two retaining walls turn back into the grade at the edge of the landings.
 for(const z of [77.3,94.2]){
  const y=terraceY(z);
  for(const sign of [-1,1])for(let j=0;j<5;j++){
   const x=cx+sign*(5.45+2.72*j);
   m.box([x,y-.65,z],[2.70,1.32,.63],j%2?'stone-blue':'foundation');
   m.box([x,y+.08,z],[2.70,.15,.78],'stone-rim');
  }
 }
 return m;
}

/** Inlaid polychrome fascia and a recessed three-bay porch, at the top of the public stairs. */
export function upperHallPorch():VoxelMesh{
 const m=new VoxelMesh(),cx=157.9,front=92.9,y=35.07;
 tiledRoof(m,UPPER_PORCH);
 for(const dx of [-5.45,-2.16,2.16,5.45]){
  const x=cx+dx;
  m.box([x,y+.15,front],[.66,.38,.66],'stone-blue');
  m.box([x,y+2.37,front],[.37,4.54,.40],'oxblood');
  m.box([x,y+4.22,front],[.71,.24,.70],'temple-wood');
  m.beam([x,y+3.48,front],[x+Math.sign(dx)*.8,y+4.34,front],.15,.16,'weathered-brass');
 }
 m.box([cx,y+4.27,front],[11.85,.57,.40],'window-shadow');
 for(let k=-8;k<=8;k++){
  const x=cx+k*.66;
  for(const side of [-1,1]){
   m.beam([x,y+4.10,front-.21],[x+side*.29,y+4.31,front-.21],.048,.042,'weathered-brass');
   m.beam([x+side*.29,y+4.31,front-.21],[x,y+4.45,front-.21],.048,.042,'dye-fade');
  }
 }
 plaque(m,cx,y+4.08,front-.25,['藏','书','楼']);
 for(const x of [cx-4.3,cx+4.3])lamp(m,x,y+3.45,front-.15,1.04,false);
 // In the upper court the five rooflines can also be photographed from the side.
 for(const z of [77.9,84.0,91.3])for(const side of [-1,1]){
  const x=cx+side*5.35,g=terraceY(z);
  m.box([x,g+.2,z],[.90,.42,.82],'foundation');
  m.box([x,g+.83,z],[.34,1.02,.34],'stone-blue');
  m.box([x,g+1.39,z],[.68,.15,.67],'stone-rim');
  m.box([x,g+1.7,z],[.45,.5,.45],'cream');
  for(const i of [-1,1])for(const j of [-1,1])m.box([x+i*.226,g+1.71,z+j*.226],[.070,.51,.070],'stone-blue');
  m.box([x,g+2.01,z],[.86,.13,.84],'stone-blue');
  m.box([x,g+2.15,z],[.58,.17,.56],'stone-jade');m.box([x,g+2.29,z],[.24,.15,.24],'stone-rim');
 }
 return m;
}
