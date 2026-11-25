import { VoxelMesh } from './voxel-mesh.ts';
import type { Vec3 } from './world-layout.ts';

const DRIFTS = [
  [55.85,200.8,2.9,1.1,9], [62,198.2,2.1,1.2,8], [48,198,3.4,1.5,11],
  [75,196,2.5,.9,8], [85,191,2,.8,6], [55,210,2.8,1.2,8],
] as const;

/** A tapered blade folded down its midrib, with both sides visible against the sky. */
function blade(mesh:VoxelMesh,base:Vec3,tip:Vec3,halfWidth:number,heading:number,material:string):void{
  const mx=base[0]+(tip[0]-base[0])*.44,my=base[1]+(tip[1]-base[1])*.58,mz=base[2]+(tip[2]-base[2])*.44;
  const wx=Math.cos(heading)*halfWidth,wz=Math.sin(heading)*halfWidth;
  const left:Vec3=[mx-wx,my,mz-wz],right:Vec3=[mx+wx,my,mz+wz];
  const points=[base,left,tip,right] as const;
  const ab=[left[0]-base[0],left[1]-base[1],left[2]-base[2]],ac=[tip[0]-base[0],tip[1]-base[1],tip[2]-base[2]];
  const nx=ab[1]!*ac[2]!-ab[2]!*ac[1]!,ny=ab[2]!*ac[0]!-ab[0]!*ac[2]!,nz=ab[0]!*ac[1]!-ab[1]!*ac[0]!;
  const len=Math.hypot(nx,ny,nz)||1;
  const normal:Vec3=[nx/len,ny/len,nz/len];
  // Thin, translucent leaves catch skylight even when their tips turn away from the sun.
  const shade=(sign:number):Vec3=>{
    const x=normal[0]*sign*.42,y=.85+normal[1]*sign*.12,z=normal[2]*sign*.42,n=Math.hypot(x,y,z);
    return [x/n,y/n,z/n];
  };
  mesh.quadShaded(points,normal,shade(1),material);
  mesh.quadShaded(points,[-normal[0],-normal[1],-normal[2]],shade(-1),material);
}

/** Windward leaves lie low; the fine seed sprays sit above them on separate slender culms. */
export function ridgeSilvergrass(ground:(x:number,z:number)=>number):VoxelMesh {
  const mesh=new VoxelMesh();
  DRIFTS.forEach(([cx,cz,rx,rz,count],patch)=>{
    for(let tuft=0;tuft<count;tuft++){
      const angle=tuft*2.39996+patch,radius=Math.sqrt((tuft+.4)/count);
      const x=cx+rx*radius*Math.cos(angle),z=cz+rz*radius*Math.sin(angle),root=ground(x,z)-.12;
      for(let stem=0;stem<3;stem++){
        const spread=angle+stem*2.1,scale=.67+.25*Math.cos(tuft*3.7+stem);
        const foot:Vec3=[x+.07*Math.cos(spread),root,z+.07*Math.sin(spread)];
        const bend:Vec3=[x+.09+.21*Math.cos(spread),root+.76*scale,z+.15*Math.sin(spread)];
        const head:Vec3=[bend[0]+.16,root+1.04*scale,bend[2]-.05];
        mesh.beam(foot,bend,.019,.016,'reed-leaf');
        mesh.beam(bend,head,.015,.012,'reed-stem');
        const end:Vec3=[head[0]+.24*scale,head[1]+.35*scale,head[2]-.06];
        blade(mesh,head,end,.016,spread,'reed-husk');
        for(let barb=0;barb<7;barb++){
          const t=barb/8,side=barb%2===0?-1:1;
          const a:Vec3=[head[0]+(end[0]-head[0])*t,head[1]+(end[1]-head[1])*t,head[2]-.06*t];
          const fan=scale*(.065+.085*Math.sin(t*Math.PI));
          const tip:Vec3=[a[0]+.09*scale+side*fan*.8,a[1]+(.17-.065*t)*scale,a[2]+side*fan*.72];
          blade(mesh,a,tip,.017*scale,spread+barb*.64,barb%3===0?'reed-husk':'reed-silk');
        }
        const leaf:Vec3=[foot[0]+.41*Math.cos(spread),root+.45*scale,foot[2]+.38*Math.sin(spread)];
        blade(mesh,foot,leaf,.031,spread+Math.PI*.5,'reed-leaf');
      }
    }
  });
  return mesh;
}
