import {describe,expect,it} from 'vitest';
import {pathMesh} from '../world.pack.ts';
import {openingEnvelopeMesh} from '../opening-envelope.ts';
import {POSTAL_LOOKOUT_FLOOR} from '../postal-lookout.ts';
import {worldAsset} from '../world-refs.ts';
import {ROUTES,SIDE_ROUTES,LOCAL_ROUTES,terrainHeight,voxelHeight,resolveMove,traceSegment,type Vec3} from '../world-layout.ts';
import {createTravelController} from '../../controller/travel-controller.ts';
import {EMPTY_INPUT} from '../../controller/types.ts';

type Triangle = [number, number, number, number, number, number, number, number, number];

/** Intersect the authored road and deck triangles independently of the floor algorithm. */
function renderedRoadTop(){
 const cells = new Map<string,Triangle[]>(), size = 4;
 function indexTriangle(vertices: ArrayLike<number>, stride: number, a: number, b: number, c: number) {
  const v = [a,b,c].flatMap(id => [vertices[id*stride]!, vertices[id*stride+1]!, vertices[id*stride+2]!]) as Triangle;
  const xs = [v[0],v[3],v[6]], zs = [v[2],v[5],v[8]];
  for(let x=Math.floor(Math.min(...xs)/size);x<=Math.floor(Math.max(...xs)/size);x++)for(let z=Math.floor(Math.min(...zs)/size);z<=Math.floor(Math.max(...zs)/size);z++){
   const key=`${x}/${z}`, bucket=cells.get(key)??[];
   bucket.push(v);
   cells.set(key,bucket);
  }
 }
 const road = pathMesh();
 for(const indices of road.groups.values())for(let i=0;i<indices.length;i+=3){
  const first=indices[i]!;
  if(road.vertices[first*8+4]!>=.9)indexTriangle(road.vertices,8,first,indices[i+1]!,indices[i+2]!);
 }

 // The opening scene supplies both the visible cedar boards and the timber
 // underlay visible in their joints. Keep the furniture above them out of a floor query.
 const opening = openingEnvelopeMesh(name => worldAsset(`material/${name}`));
 const {position,normal} = opening.attributes, indices = opening.indices;
 if(!(position instanceof Float32Array) || !(normal instanceof Float32Array) || !indices)
  throw new Error('Missing rendered triangles for the postal lookout deck');
 for(const part of opening.submeshes){
  const material = opening.materialSlots[part.materialSlot ?? 0]?.sourceKey;
  if(material !== 'material/cedar-lining' && material !== 'material/lane-timber')continue;
  for(let i=part.indexOffset;i<part.indexOffset+part.indexCount;i+=3){
   const a=indices[i]!, b=indices[i+1]!, c=indices[i+2]!;
   if(normal[a*3+1]!>=.9 && [a,b,c].every(id => position[id*3+1]!<=POSTAL_LOOKOUT_FLOOR.top))
    indexTriangle(position,3,a,b,c);
  }
 }
 return (x:number,z:number)=>{
  let top=-Infinity;
  for(const v of cells.get(`${Math.floor(x/size)}/${Math.floor(z/size)}`)??[]){
   const [ax,ay,az,bx,by,bz,cx,cy,cz]=v;
   const den=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);if(Math.abs(den)<1e-9)continue;
   const a=((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/den,b=((cz-az)*(x-cx)+(ax-cx)*(z-cz))/den,c=1-a-b;
   if(a>=-1e-7&&b>=-1e-7&&c>=-1e-7)top=Math.max(top,a*ay+b*by+c*cy);
  }
  return top;
 };
}

describe('continuous visible road support',()=>{
 it('gives the postal fork one horizontal surface across all shared route caps',()=>{
  const road=pathMesh(),surfaces=[14.055,14.075,14.08].map(height=>({height,triangles:[] as [Vec3,Vec3,Vec3][]}));
  const point=(index:number):Vec3=>[road.vertices[index*8]!,road.vertices[index*8+1]!,road.vertices[index*8+2]!];
  for(const indices of road.groups.values())for(let i=0;i<indices.length;i+=3){
   if(road.vertices[indices[i]!*8+4]!<=.9)continue;
   const points:[Vec3,Vec3,Vec3]=[point(indices[i]!),point(indices[i+1]!),point(indices[i+2]!)];
   for(const {height,triangles} of surfaces)if(points.every(p=>Math.abs(p[1]-height)<1e-7))triangles.push(points);
  }
  const side=(a:Vec3,b:Vec3,x:number,z:number)=>(b[0]-a[0])*(z-a[2])-(b[2]-a[2])*(x-a[0]);
  for(let x=-2.45;x<2.5;x+=.065)for(let z=-222.446;z<-217.5;z+=.069)for(const {height,triangles} of surfaces){
   const covering=triangles.filter(([a,b,c])=>{
    const signs=[side(a,b,x,z),side(b,c,x,z),side(c,a,x,z)];
    return signs.every(n=>n>0)||signs.every(n=>n<0);
   });
   const label=`postal fork horizontal faces at ${x}, ${height}, ${z}`;
   if(height===14.08&&Math.abs(x)<1.4&&Math.abs(z+220)<1.4)expect(covering.length,label).toBe(1);
   else expect(covering.length,label).toBeLessThanOrEqual(1);
  }
 });

 it.each([[-102,-120],[-204,6]])('emits one visible top at the dirt and main road seam (%s,%s)',(cx,cz)=>{
  const road=pathMesh();
  const points=(index:number)=>road.vertices.slice(index*8,index*8+3) as unknown as Vec3;
  const triangles=[...road.groups.values()].flatMap(indices=>{
   const tops:Vec3[][]=[];
   for(let i=0;i<indices.length;i+=3){
    if(road.vertices[indices[i]!*8+4]!<.9)continue;
    const face=indices.slice(i,i+3).map(points);
    if(face.every(p=>Math.abs(p[0]-cx)>7||Math.abs(p[2]-cz)>7))continue;
    tops.push(face);
   }
   return tops;
  });
  const cross=(ax:number,az:number,bx:number,bz:number)=>ax*bz-az*bx;
  let sampled=0;
  for(let x=cx-.5973;x<cx+.60;x+=.1)for(let z=cz-.5929;z<cz+.61;z+=.1){
   const heights:number[]=[];
   for(const [a,b,c] of triangles){
    const ux=b![0]-a![0],uz=b![2]-a![2],vx=c![0]-a![0],vz=c![2]-a![2];
    const area=cross(ux,uz,vx,vz);
    if(Math.abs(area)<1e-10)continue;
    const tx=x-a![0],tz=z-a![2],u=cross(tx,tz,vx,vz)/area,v=cross(ux,uz,tx,tz)/area;
    if(u>1e-8&&v>1e-8&&u+v<1-1e-8)heights.push(a![1]+u*(b![1]-a![1])+v*(c![1]-a![1]));
   }
   if(!heights.length)continue;
   sampled++;
   const high=Math.max(...heights);
   expect(heights.filter(y=>high-y<1e-5),`multiple top faces at ${x},${z}`).toHaveLength(1);
  }
  expect(sampled).toBeGreaterThan(120);
 });

 it('supports every actual ribbon, earth shoulder and joint cap instead of nearest-centreline ownership',()=>{
  const rendered=renderedRoadTop();let count=0,maxBelow=0,maxGap=0;
  const check=(route:string,x:number,z:number)=>{
   // The ridge pavilion and the moving bridge have their own coverage in world.test.
   if(x>=-10.5&&x<=9.5&&z>=228&&z<=243)return;
   if(x>=152&&x<=158&&z>=24.25&&z<=30.75)return;
   const road=rendered(x,z);expect(Number.isFinite(road),`missing rendered road on ${route} at (${x}, ${z})`).toBe(true);
   const visual=Math.max(road,voxelHeight(x,z)),foot=terrainHeight(x,z);
   maxBelow=Math.max(maxBelow,visual-foot);maxGap=Math.max(maxGap,foot-visual);count++;
  };
  for(const route of [...ROUTES,...SIDE_ROUTES,...LOCAL_ROUTES]){
   const half=(route.id==='hidden-trail'?1.35:Math.min(2.8,Math.max(1.9,route.width*.52)))/2;
   for(let i=1;i<route.points.length;i++){
    const a=route.points[i-1]!,b=route.points[i]!,dx=b[0]-a[0],dz=b[2]-a[2],len=Math.hypot(dx,dz);
    for(let d=0;d<=len;d+=.2)for(const offset of[-half-.119,-half,-half*.5,0,half*.5,half,half+.119]){
     const x=a[0]+dx*d/len-dz/len*offset,z=a[2]+dz*d/len+dx/len*offset;
     check(route.id,x,z);
    }
   }
   for(const p of route.points)for(const dx of[-.999,0,.999])for(const dz of[-.999,0,.999]){
    check(route.id,p[0]+half*dx,p[2]+half*dz);
   }
  }
  // The original miss is on a board. A nearby board joint reaches the underlay.
  expect(rendered(-24.776,-248)).toBeCloseTo(24.06,5);
  expect(rendered(-26,-246.731)).toBeCloseTo(24.02,5);
  expect(count).toBeGreaterThan(75000);
  expect(maxBelow).toBeLessThan(1e-7);
  expect(maxGap).toBeLessThanOrEqual(.080001);
 });

 it.each([1/60,.1])('runs the western ridge shoulders at dt=%s without feet entering visible road triangles',dt=>{
  const rendered=renderedRoadTop(),route=ROUTES.find(r=>r.id==='forest-high')!;
  for(let i=2;i<7;i++)for(const side of[-1,1]){
   const a=route.points[i-1]!,b=route.points[i]!,dx=b[0]-a[0],dz=b[2]-a[2],len=Math.hypot(dx,dz),offset=1.1*side;
   const point=(d:number):Vec3=>[a[0]+dx*d/len-dz/len*offset,0,a[2]+dz*d/len+dx/len*offset];
   const c=createTravelController({spawn:point(2),initialYaw:Math.atan2(dx,-dz),terrainHeight,resolveMove,traceSegment});
   c.submitInput({...EMPTY_INPUT,vertical:1,run:true});
   for(let d=2;d<len-3;d+=11*dt){
    c.step(dt);const p=c.snapshot().position,visual=Math.max(rendered(p[0],p[2]),voxelHeight(p[0],p[2]));
    expect(p[1]+1e-6,`feet below rendered surface at ${p}`).toBeGreaterThanOrEqual(visual);
    expect(p[1]).toBeGreaterThan(30);
   }
   const target=point(len-3);
   expect(Math.hypot(c.snapshot().position[0]-target[0],c.snapshot().position[2]-target[2])).toBeLessThan(2);
  }
 });
});
