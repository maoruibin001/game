import { meshFromInterleaved } from '@forgeax/engine/geometry';
import type { AssetGuid, MeshAsset, Submesh, MeshMaterialSlot } from '@forgeax/engine/types';
import type { Vec3 } from './world-layout.ts';

/** Hidden terrain faces are omitted before emission; all faces of one palette share a submesh. */
export class VoxelMesh {
  readonly vertices: number[]=[];
  readonly groups=new Map<string,number[]>();
  quad(points:readonly Vec3[],normal:Vec3,material:string):void{
    this.quadShaded(points,normal,normal,material);
  }
  quadShaded(points:readonly Vec3[],windingNormal:Vec3,shadeNormal:Vec3,material:string,cornerNormals?:readonly Vec3[]):void{
    const start=this.vertices.length/8;
    for(let i=0;i<4;i++){const p=points[i]!;this.vertices.push(...p,...(cornerNormals?.[i]??shadeNormal),i===1||i===2?1:0,i>=2?1:0);}
    // At a grass-to-terrace seam one endpoint of a riser can close completely.
    // Index only the real triangle, and use its own winding in that case.
    const equal=(a:Vec3,b:Vec3)=>a[0]===b[0]&&a[1]===b[1]&&a[2]===b[2];
    const closedEnd=equal(points[1]!,points[2]!),closedStart=equal(points[0]!,points[3]!);
    const a=points[0]!,b=points[closedEnd?2:1]!,c=points[closedEnd?3:2]!;
    const ab=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],ac=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];
    const dot=(ab[1]!*ac[2]!-ab[2]!*ac[1]!)*windingNormal[0]+(ab[2]!*ac[0]!-ab[0]!*ac[2]!)*windingNormal[1]+(ab[0]!*ac[1]!-ab[1]!*ac[0]!)*windingNormal[2];
    const index=this.groups.get(material)??[];if(!this.groups.has(material))this.groups.set(material,index);
    if(!closedEnd)index.push(start,start+(dot>=0?1:2),start+(dot>=0?2:1));
    if(!closedStart)index.push(start,start+(dot>=0?2:3),start+(dot>=0?3:2));
  }
  box(center:Vec3,size:Vec3,material:string,yaw=0):void{
    const hx=size[0]/2,hy=size[1]/2,hz=size[2]/2,c=Math.cos(yaw),s=Math.sin(yaw);
    const p=(x:number,y:number,z:number):Vec3=>[center[0]+x*c+z*s,center[1]+y,center[2]-x*s+z*c];
    const n=(x:number,y:number,z:number):Vec3=>[x*c+z*s,y,-x*s+z*c];
    this.quad([p(-hx,hy,-hz),p(hx,hy,-hz),p(hx,hy,hz),p(-hx,hy,hz)],n(0,1,0),material);
    this.quad([p(-hx,-hy,-hz),p(hx,-hy,-hz),p(hx,-hy,hz),p(-hx,-hy,hz)],n(0,-1,0),material);
    this.quad([p(-hx,-hy,-hz),p(hx,-hy,-hz),p(hx,hy,-hz),p(-hx,hy,-hz)],n(0,0,-1),material);
    this.quad([p(-hx,-hy,hz),p(hx,-hy,hz),p(hx,hy,hz),p(-hx,hy,hz)],n(0,0,1),material);
    this.quad([p(-hx,-hy,-hz),p(-hx,-hy,hz),p(-hx,hy,hz),p(-hx,hy,-hz)],n(-1,0,0),material);
    this.quad([p(hx,-hy,-hz),p(hx,-hy,hz),p(hx,hy,hz),p(hx,hy,-hz)],n(1,0,0),material);
  }
  /** Beam with its narrow local Z pointing between arbitrary endpoints. */
  beam(a:Vec3,b:Vec3,width:number,depth:number,material:string):void{
    const z=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],length=Math.hypot(...z);if(length<1e-6)return;
    z.forEach((v,i)=>z[i]=v/length);
    let x: number[]=Math.abs(z[1]!)>.99?[1,0,0]:[z[2]!,0,-z[0]!];const xl=Math.hypot(...x);x=x.map(v=>v/xl);
    const y=[z[1]!*x[2]!-z[2]!*x[1]!,z[2]!*x[0]!-z[0]!*x[2]!,z[0]!*x[1]!-z[1]!*x[0]!];
    const p=(ix:number,iy:number,iz:number):Vec3=>[a[0]+x[0]!*ix+y[0]!*iy+z[0]!*iz,a[1]+x[1]!*ix+y[1]!*iy+z[1]!*iz,a[2]+x[2]!*ix+y[2]!*iy+z[2]!*iz];
    const w=width/2,d=depth/2;
    this.quad([p(-w,-d,0),p(w,-d,0),p(w,d,0),p(-w,d,0)],[-z[0]!,-z[1]!,-z[2]!],material);
    this.quad([p(-w,-d,length),p(w,-d,length),p(w,d,length),p(-w,d,length)],z as unknown as Vec3,material);
    this.quad([p(w,-d,0),p(w,-d,length),p(w,d,length),p(w,d,0)],x as unknown as Vec3,material);
    this.quad([p(-w,-d,0),p(-w,-d,length),p(-w,d,length),p(-w,d,0)],[-x[0]!,-x[1]!,-x[2]!],material);
    this.quad([p(-w,d,0),p(w,d,0),p(w,d,length),p(-w,d,length)],y as unknown as Vec3,material);
    this.quad([p(-w,-d,0),p(w,-d,0),p(w,-d,length),p(-w,-d,length)],[-y[0]!,-y[1]!,-y[2]!],material);
  }
  build(materialGuid:(name:string)=>AssetGuid):MeshAsset{
    const indices:number[]=[],submeshes:Submesh[]=[],materialSlots:MeshMaterialSlot[]=[];
    let slot=0;
    for(const[name,group]of this.groups){
      submeshes.push({indexOffset:indices.length,indexCount:group.length,vertexCount:this.vertices.length/8,topology:'triangle-list',materialSlot:slot++});
      for(const index of group)indices.push(index);materialSlots.push({slotName:name,sourceKey:`material/${name}`,defaultMaterial:materialGuid(name)});
    }
    const result=meshFromInterleaved(new Float32Array(this.vertices),new Uint32Array(indices));if(!result.ok)throw result.error;
    return{...result.value,submeshes,materialSlots};
  }
  get triangleCount(){return [...this.groups.values()].reduce((n,a)=>n+a.length/3,0);}
}
