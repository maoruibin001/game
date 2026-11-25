import { describe, expect, it } from 'vitest';
import { SOURCE_BUNDLES } from '../pipeline-sources.ts';
import { columnHeight, meadowCorner, pavedSurfaceHeight, terrainCellSize, terrainHeight, type Vec3 } from '../world-layout.ts';
import { TOWN_BRIDGE_DECK } from '../town-postcard-layout.ts';

type Point = readonly [number, number];
type Triangle = readonly [Vec3, Vec3, Vec3];
const cross = (a:Point,b:Point,p:Point) => (b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
const plan = (p:Vec3):Point => [p[0],p[2]];

function clipToTriangle(deck:Triangle, ground:Triangle): Point[] {
  const edges=ground.map(plan),direction=Math.sign(cross(edges[0]!,edges[1]!,edges[2]!));
  let polygon=deck.map(plan);
  for(let i=0;i<3&&polygon.length;i++){
    const a=edges[i]!,b=edges[(i+1)%3]!;
    const distance=(p:Point)=>direction*cross(a,b,p);
    const next:Point[]=[];
    let previous=polygon.at(-1)!,prior=distance(previous);
    for(const point of polygon){
      const current=distance(point);
      if((prior<0)!==(current<0)){
        const t=prior/(prior-current);
        next.push([previous[0]+(point[0]-previous[0])*t,previous[1]+(point[1]-previous[1])*t]);
      }
      if(current>=0)next.push(point);
      previous=point;prior=current;
    }
    polygon=next;
  }
  return polygon;
}
function heightOn(triangle:Triangle, p:Point) {
  const [a,b,c]=triangle.map(plan) as [Point,Point,Point];
  const total=cross(a,b,c);
  return (triangle[0][1]*cross(b,c,p)+triangle[1][1]*cross(c,a,p)+triangle[2][1]*cross(a,b,p))/total;
}
function horizontalTop(entity:string, level:number):Triangle[] {
  const faces:Triangle[]=[];
  for(const bundle of SOURCE_BUNDLES)for(const mesh of bundle.meshes){
    if(mesh.entityId!==entity)continue;
    const {positions,normals,indices}=mesh.geometry,pivot=bundle.pivotSourceMeters, origin=bundle.worldAnchorEngine;
    const vertex=(i:number):Vec3=>[
      positions[i*3]!-pivot[0]!+origin[0]!,positions[i*3+2]!-pivot[2]!+origin[1]!,pivot[1]!-positions[i*3+1]!+origin[2]!,
    ];
    for(let i=0;i<indices.length;i+=3){
      const ids=[indices[i]!,indices[i+1]!,indices[i+2]!] as const;
      const triangle=ids.map(vertex) as unknown as Triangle;
      if(triangle.every(p=>Math.abs(p[1]-level)<1e-7)&&ids.every(id=>normals[id*3+2]!>.99))faces.push(triangle);
    }
  }
  return faces;
}
/** Match the actual terrain mesh diagonal. Compare affine height over exact
 * intersecting polygons, including cell edges and triangle intersections. */
function clearance(face:Triangle):number {
  const xs=face.map(p=>p[0]),zs=face.map(p=>p[2]);
  const cells=new Set<string>();
  let minimum=Infinity;
  for(let x=Math.floor(Math.min(...xs));x<Math.ceil(Math.max(...xs));x++){
    for(let z=Math.floor(Math.min(...zs));z<Math.ceil(Math.max(...zs));z++){
      const size=terrainCellSize(x+.01,z+.01),x0=Math.floor(x/size)*size,z0=Math.floor(z/size)*size;
      const key=`${x0}/${z0}/${size}`;
      if(cells.has(key))continue;cells.add(key);
      const h=columnHeight(x0,z0),vertex=(a:number,b:number):Vec3=>[a,meadowCorner(a,b,h),b];
      const a=vertex(x0,z0),b=vertex(x0+size,z0),c=vertex(x0+size,z0+size),d=vertex(x0,z0+size);
      for(const ground of [[a,b,c],[a,c,d]] as const){
        const polygon=clipToTriangle(face,ground);
        if(polygon.length<3)continue;
        for(const p of polygon)minimum=Math.min(minimum,heightOn(face,p)-heightOn(ground,p));
      }
    }
  }
  return minimum;
}

describe('exposed walking surfaces against the final terrain mesh',()=>{
  const assemblies=[
    { usage:'旧镇桥主木板',entity:'town_bridge',level:24.25,margin:.22 },
    { usage:'旧镇桥暗梁顶面',entity:'town_bridge',level:24.5,margin:.22 },
    { usage:'山脊外露平台',entity:'ridge_deck',level:96.5,margin:.45 },
  ];
  for(const {usage,entity,level,margin} of assemblies)it(usage+' retains positive clearance',()=>{
    const faces=horizontalTop(entity,level);
    expect(faces.length).toBeGreaterThan(0);
    const results=faces.map(face=>({face,clearance:clearance(face)}));
    expect(results.filter(r=>r.clearance<margin),`terrain reaches ${usage}`).toEqual([]);
  });
  it('walks at the visible bridge surface and keeps both approaches within a walkable step',()=>{
    const {south,north,y}=TOWN_BRIDGE_DECK;
    for(let z=south+.06;z<north;z+=.125){
      expect(terrainHeight(155,z)).toBeCloseTo(y,5);
      expect(pavedSurfaceHeight(155,z)).toBeLessThan(y-.1);
    }
    for(const z of [south-.1,north+.1])expect(Math.abs(terrainHeight(155,z)-y)).toBeLessThan(.55);
  });
});
