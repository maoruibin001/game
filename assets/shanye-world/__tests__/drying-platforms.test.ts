import { expect, it } from 'vitest';
import { SIXTH_PLATFORMS, SIXTH_ROOM, SIXTH_STOPS } from '../sixth-layout.ts';
import { sixthSceneMeshes } from '../sixth-portrait.ts';

it('tiles the six exterior planes of all three drying platforms without overlapping boards', () => {
  const mesh = sixthSceneMeshes().fixed;
  const tolerance = 1e-8;
  const samples = (min:number, max:number, count:number, offset:number) =>
    Array.from({length:count}, (_,i) => min+(i+offset)*(max-min)/count);
  const planes = [0,1,2].map(axis => {
    const [u,v] = [0,1,2].filter(other=>other!==axis) as [number,number];
    return [...mesh.groups].flatMap(([wood,indices]) => {
      const faces: {plane:number; fromU:number; toU:number; fromV:number; toV:number; wood:string}[] = [];
      // Every quad in this assembly owns four local vertices and two triangles.
      for (let i=0;i<indices.length;i+=3) {
        const start=Math.floor(indices[i]!/4)*4*8;
        if (i>0 && Math.floor(indices[i-3]!/4)*4*8===start) continue;
        const coords=(n:number)=>Array.from({length:4},(_,j)=>mesh.vertices[start+j*8+n]!);
        const along=coords(axis);
        if (Math.max(...along)-Math.min(...along)>tolerance) continue;
        const us=coords(u),vs=coords(v);
        faces.push({plane:along[0]!,fromU:Math.min(...us),toU:Math.max(...us),
          fromV:Math.min(...vs),toV:Math.max(...vs),wood});
      }
      return faces;
    });
  });

  for (const platform of SIXTH_PLATFORMS) {
    const {min,max}=platform;
    const topColors=new Set<string>();
    for (const axis of [0,1,2]) for (const side of [-1,1]) {
      const [u,v]=[0,1,2].filter(other=>other!==axis) as [number,number];
      const plane=(side<0?min:max)[axis]!;
      const coincident=planes[axis]!.filter(face=>Math.abs(face.plane-plane)<tolerance);
      const neighbor=axis===0?SIXTH_PLATFORMS.find(other=>(side<0?other.max[0]:other.min[0])===plane):undefined;
      for (const a of samples(min[u]!,max[u]!,97,.391)) {
        for (const b of samples(min[v]!,max[v]!,13,.727)) {
          const hits=coincident.filter(face=>a>face.fromU+tolerance&&a<face.toU-tolerance&&b>face.fromV+tolerance&&b<face.toV-tolerance);
          const overlap=neighbor&&a>neighbor.min[u]!&&a<neighbor.max[u]!&&b>neighbor.min[v]!&&b<neighbor.max[v]!;
          if (hits.length!==(overlap?0:1)) throw new Error(
            `${platform.id} plane ${axis}:${plane}, sample ${a},${b} has ${hits.length} visible layers`,
          );
          if (axis===1&&side>0) topColors.add(hits[0]!.wood);
        }
      }
    }
    expect([...topColors].sort()).toEqual(['bark','wood-light']);
  }

  // Positive depth separation from the unrelated interior floor and the tin top.
  expect(planes[1]!.filter(f=>Math.abs(f.plane-SIXTH_ROOM.floor)<tolerance
    && f.fromU<180&&f.toU>180&&f.fromV<24&&f.toV>24)).toHaveLength(1);
  const [x,y,z]=SIXTH_STOPS.tin.position;
  expect(planes[1]!.filter(f=>Math.abs(f.plane-(y+.395))<tolerance
    && f.fromU<x&&f.toU>x&&f.fromV<z&&f.toV>z)).toHaveLength(1);
});
