import { expect, it } from 'vitest';
import type { Vec3 } from '../../controller/types.ts';
import { POSTAL_POOLS, travelerRainMaterial } from '../postal-rain-layout.ts';
import { rainShelterHeight } from '../rain-shelter.ts';
import { STATIC_OBSTACLES, terrainHeight } from '../world-layout.ts';
import { pathMesh } from '../world.pack.ts';

it('keeps the wet verge, three level pools and dry eave on the existing visible road skin', () => {
  const mesh=pathMesh();
  const faces=[...mesh.groups].flatMap(([material,indices])=>{
    const out:{a:Vec3;b:Vec3;c:Vec3;material:string}[]=[];
    const p=(index:number)=>mesh.vertices.slice(index*8,index*8+3) as unknown as Vec3;
    for(let i=0;i<indices.length;i+=3){
      const a=p(indices[i]!),b=p(indices[i+1]!),c=p(indices[i+2]!);
      if(mesh.vertices[indices[i]!*8+4]!<.9||Math.max(a[0],b[0],c[0])<-9||Math.min(a[0],b[0],c[0])>4||
          Math.max(a[2],b[2],c[2])<-233||Math.min(a[2],b[2],c[2])>-222) continue;
      out.push({a,b,c,material});
    }
    return out;
  });
  const top=(x:number,z:number)=>{
    const hits:{y:number;material:string}[]=[];
    for(const {a:[ax,ay,az],b:[bx,by,bz],c:[cx,cy,cz],material} of faces){
      const d=(bx-ax)*(cz-az)-(bz-az)*(cx-ax);
      if(Math.abs(d)<1e-10)continue;
      const u=((x-ax)*(cz-az)-(z-az)*(cx-ax))/d,v=((bx-ax)*(z-az)-(bz-az)*(x-ax))/d;
      if(u>1e-9&&v>1e-9&&u+v<1-1e-9)hits.push({y:ay+(by-ay)*u+(cy-ay)*v,material});
    }
    hits.sort((a,b)=>b.y-a.y);
    expect(hits.length,`a pavement surface at ${x},${z}`).toBeGreaterThan(0);
    expect(hits.filter(hit=>hits[0]!.y-hit.y<1e-6),`one visible top at ${x},${z}`).toHaveLength(1);
    return hits[0]!;
  };
  for(const x of [-5.32,-4.1,-2.9,-1.53,-.327,1.32]){
    const under=-230.584, open=-228.562;
    expect(rainShelterHeight(x,under)).toBeGreaterThan(terrainHeight(x,under)+1.9);
    expect(rainShelterHeight(x,open)).toBeUndefined();
    expect(top(x,under).material).toMatch(/^postal-rain\/sheltered-/);
    expect(top(x,open).material).toMatch(/^postal-rain\/exposed-/);
  }
  for(const {position:[cx,y,cz],radius:[rx,rz]} of POSTAL_POOLS) {
    for(let i=0;i<8;i++)for(let j=0;j<8;j++){
      const x=cx+rx*(.25+i-4)/4,z=cz+rz*(.37+j-4)/4;
      expect(rainShelterHeight(x,z)).toBeUndefined();
      const exposed=top(x,z);
      expect(exposed.material).toMatch(/^postal-rain\/exposed-/);
      expect(y-exposed.y).toBeGreaterThan(.007);
      expect(y-exposed.y).toBeLessThan(.02);
      expect(STATIC_OBSTACLES.some(o=>x+.24>o.min[0]&&x-.24<o.max[0]&&z+.24>o.min[2]&&z-.24<o.max[2]&&
        y+.20<o.max[1]&&y+1.78>o.min[1])).toBe(false);
    }
  }
});

it('names only private player material slots by body part',()=>{
  expect(travelerRainMaterial('head','mail-wicker')).toBe('traveler-rain/hat/mail-wicker');
  expect(travelerRainMaterial('arm','mail-blue')).toBe('traveler-rain/shoulders/mail-blue');
  expect(travelerRainMaterial('body','mail-blue')).toBe('traveler-rain/coat/mail-blue');
  expect(travelerRainMaterial('body','traveler-pack')).toBe('traveler-rain/bag/traveler-pack');
  expect(travelerRainMaterial('leg','mail-blue')).toBe('mail-blue');
  expect(travelerRainMaterial('head','traveler-skin')).toBe('traveler-skin');
});
