import {describe,expect,it} from 'vitest';
import {SIDE_ROUTES,ROUTES,terrainHeight,resolveMove,traceSegment,type Vec3} from '../world-layout.ts';
import {pathMesh} from '../world.pack.ts';
import {createTravelController} from '../../controller/travel-controller.ts';
import {EMPTY_INPUT} from '../../controller/types.ts';

function walk(points:readonly Vec3[],stop=.08):void{
 const c=createTravelController({spawn:points[0]!,terrainHeight,resolveMove,traceSegment});
 for(const target of points.slice(1)){
  let steps=0;
  while(Math.hypot(c.snapshot().position[0]-target[0],c.snapshot().position[2]-target[2])>stop&&steps++<1800){
   const s=c.snapshot(),yaw=Math.atan2(target[0]-s.position[0],-(target[2]-s.position[2]));
   c.submitInput({...EMPTY_INPUT,vertical:1,lookActive:true,lookX:Math.atan2(Math.sin(yaw-s.yaw),Math.cos(yaw-s.yaw))/.0022});c.step(1/60);
  }
  expect(steps,`stopped at ${c.snapshot().position} before ${target}`).toBeLessThan(1800);
 }
}

describe('old postcard side lane',()=>{
 it('joins the existing grade and remains bidirectionally walkable across 1.1m stop disks',()=>{
  const points=SIDE_ROUTES[0]!.points;
  expect(ROUTES).toHaveLength(8);
  expect(points[0]![1]).toBeCloseTo(24+(166-155)*9/39,8);
  for(let angle=0;angle<Math.PI*2;angle+=Math.PI/8){
   const offset=points.map((p,i):Vec3=>[p[0]+1.1*Math.cos(angle+i*.7),p[1],p[2]+1.1*Math.sin(angle+i*.7)]);
   walk(offset);walk([...offset].reverse());
  }
  // Actual north courtyard return and ordinary main-road arrival, with the owner's 1.1m stop tolerance.
  walk([[158.5,24.08,51],[155,24,42],[155,24,35],[155,24,20],...points,...[...points].reverse(),[155,24,20]],1.1);
 });
 it('keeps the full 2.2m travel corridor on the visible paving and away from the east house',()=>{
  const mesh=pathMesh(),triangles:number[][]=[];
  for(const indices of mesh.groups.values())for(let i=0;i<indices.length;i+=3){
   const ids=[indices[i]!,indices[i+1]!,indices[i+2]!];if(mesh.vertices[ids[0]!*8+4]!<.9)continue;
   const v=ids.flatMap(id=>mesh.vertices.slice(id*8,id*8+3));
   if(Math.max(v[0]!,v[3]!,v[6]!)<164||Math.min(v[0]!,v[3]!,v[6]!)>178||Math.max(v[2]!,v[5]!,v[8]!)<24||Math.min(v[2]!,v[5]!,v[8]!)>33)continue;
   triangles.push(v);
  }
  const topAt=(x:number,z:number)=>{
   let top=-Infinity;
   for(const v of triangles){
    const [ax,ay,az,bx,by,bz,cx,cy,cz]=v as [number,number,number,number,number,number,number,number,number];
    const den=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);if(Math.abs(den)<1e-8)continue;
    const a=((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/den,b=((cz-az)*(x-cx)+(ax-cx)*(z-cz))/den,c=1-a-b;
    if(a>=-1e-7&&b>=-1e-7&&c>=-1e-7)top=Math.max(top,a*ay+b*by+c*cy);
   }return top;
  };
  const points=SIDE_ROUTES[0]!.points;let maxStep=0;
  for(let i=1;i<points.length;i++){
   const a=points[i-1]!,b=points[i]!,dx=b[0]-a[0],dz=b[2]-a[2],len=Math.hypot(dx,dz);
   for(const offset of[-1.1,-.55,0,.55,1.1]){
    let previous:number|undefined;
    for(let d=0;d<=len;d+=.1){
     const x=a[0]+dx*d/len-dz/len*offset,z=a[2]+dz*d/len+dx/len*offset,foot=terrainHeight(x,z),top=topAt(x,z);
     expect(Number.isFinite(top)).toBe(true);expect(foot-top,`surface ${x},${z}: feet ${foot}, visible ${top}`).toBeGreaterThanOrEqual(-.000001);expect(foot-top).toBeLessThan(.006);
     const houseDistance=Math.hypot(Math.max(161.5-x,0,x-170),Math.max(17.25-z,0,z-24.75));
     expect(houseDistance).toBeGreaterThan(1.7);
     if(previous!==undefined)maxStep=Math.max(maxStep,Math.abs(foot-previous));previous=foot;
    }
   }
  }
  expect(maxStep).toBeLessThan(.72);
 });
});
