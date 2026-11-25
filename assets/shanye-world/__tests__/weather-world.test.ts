import {describe,expect,it} from 'vitest';
import {AssetGuid} from '@forgeax/engine/pack/guid';
import {buildWorldContent,terrainChunk} from '../world.pack.ts';
import {travelerMeshes} from '../traveler-mesh.ts';
import {WET_SURFACES} from '../environment-refs.ts';
import {NATIVE_RAIN_SURFACES} from '../rain-surfaces.ts';
import {rainShelterHeight,RAIN_SHELTER_STATS} from '../rain-shelter.ts';
import {WORLD_SCENE_SOURCE_KEY} from '../world-refs.ts';
import {voxelHeight} from '../world-layout.ts';
const resources=buildWorldContent();

describe('portrait avatar and weather-ready world',()=>{
 it('preserves foot and joint contracts while giving the real avatar a visible face, clothing and a letter',()=>{
  const meshes=travelerMeshes(),scene=resources[WORLD_SCENE_SOURCE_KEY];if(scene?.kind!=='scene')throw Error('scene missing');
  for(const key of['body','head','left-arm','right-arm','left-leg','right-leg','camera','letter']){
   expect(scene.entities[`traveler/${key}`]?.components.ShadowParticipation).toEqual({cast:true,receive:true});
  }
  expect(scene.entities['traveler/head']?.components.Transform).toEqual({pos:[0,1.48,0]});
  expect(scene.entities['traveler/left-arm']?.components.Transform).toEqual({pos:[-.33,1.25,0]});
  expect(scene.entities['traveler/letter']?.components.Transform).toEqual({pos:[0,1.05,-.36],scale:[0,0,0]});
  const ys=(key:string)=>meshes[key]!.vertices.filter((_,i)=>i%8===1);
  expect(Math.min(...ys('leg'))+.57).toBeCloseTo(0,7);expect(Math.max(...ys('head'))+1.48).toBeLessThan(1.9);
  expect(meshes.body!.groups.has('traveler-scarf')).toBe(true);expect(meshes.body!.groups.has('traveler-pack')).toBe(true);
  expect(meshes.head!.groups.has('traveler-ink')).toBe(true);expect(meshes.head!.groups.has('traveler-hat-light')).toBe(true);
  for(const m of Object.values(meshes))for(const group of m.groups.values())for(let i=0;i<group.length;i+=3){
   const a=group[i]!*8,b=group[i+1]!*8,c=group[i+2]!*8,p=m.vertices,ab=[0,1,2].map(k=>p[b+k]!-p[a+k]!),ac=[0,1,2].map(k=>p[c+k]!-p[a+k]!);
   expect((ab[1]!*ac[2]!-ab[2]!*ac[1]!)*p[a+3]!+(ab[2]!*ac[0]!-ab[0]!*ac[2]!)*p[a+4]!+(ab[0]!*ac[1]!-ab[1]!*ac[0]!)*p[a+5]!).toBeGreaterThan(0);
  }
 });
 it('binds wetness only to the dedicated road, paving and actual roof slots',()=>{
  const bound=new Map<string,string[]>();
  for(const [key,r]of Object.entries(resources))if(r.kind==='mesh')for(const slot of r.materialSlots??[]){
   if(!slot.defaultMaterial)continue;if(!(slot.defaultMaterial instanceof Uint8Array))throw Error('source mesh should reference a material GUID');const guid=AssetGuid.format(slot.defaultMaterial),list=bound.get(guid)??[];list.push(key);bound.set(guid,list);
  }
  for(const s of WET_SURFACES){
   const m=resources[`material/${s.materialKey}`];if(m?.kind!=='material')throw Error(s.materialKey);
   // Engine material construction can differ from the authored linear colour by one double ULP.
   // Compare colour numerically; roughness and every structural wetness check stay exact.
   const base=m.values?.baseColor as readonly number[]|undefined;
   expect(base?.length).toBe(4);
   for(let i=0;i<4;i++)expect(base?.[i]).toBeCloseTo(s.dryColor[i],15);
   expect(m.values?.roughness).toBe(s.dryRoughness);
   const consumers=bound.get(s.guid)!;expect(consumers.length).toBeGreaterThan(0);
   expect(consumers.some(k=>k.includes('terrain')||k.includes('mountain')||k.includes('traveler')||k.includes('postbox'))).toBe(false);
   if(s.materialKey==='path'||s.materialKey==='road-stone')expect(new Set(consumers)).toEqual(new Set(['mesh/roads']));
  }
 });
 it('uses actual native upward surfaces as rain shelter and leaves outdoor openings uncovered',()=>{
  const names=['post-office/post-office','post-office/post-porch','post-office/postal-portal','forest-windmill/windmill-tower','town-street/town-arch','town-street/town-house-east','town-street/town-house-west','town-courtyard/town-courtyard-house','town-courtyard/town-awning','town-courtyard/town-courtyard-eave','ridge-station/ridge-shelter'];
  const scene=resources[WORLD_SCENE_SOURCE_KEY];if(scene?.kind!=='scene')throw Error('scene missing');
  const triangles:number[][][]=[];
  for(const name of names){const key=`hero/${name}`,mesh=resources[`mesh/${key}`];if(mesh?.kind!=='mesh')throw Error(key);
   const p=mesh.attributes.position,n=mesh.attributes.normal,indices=mesh.indices,o=(scene.entities[key]!.components.Transform as {pos:number[]}).pos;
   if(!(p instanceof Float32Array)||!(n instanceof Float32Array)||!indices)throw Error('native arrays missing');
   for(let i=0;i<indices.length;i+=3){const a=indices[i]!*3;if(n[a+1]!<.99||p[a+1]!<2.2)continue;triangles.push([0,1,2].map(k=>[0,1,2].map(axis=>p[indices[i+k]!*3+axis]!+o[axis]!)));}
  }
  const nativeTriangleCount=triangles.length;
  const roof=resources['mesh/props/bell-roof'];if(roof?.kind!=='mesh')throw Error('new roof missing');
  const p=roof.attributes.position as Float32Array,ix=roof.indices!;
  // Read the actual pitched tile field. Narrow decorative tile caps sit above this rain barrier.
  const slot=roof.materialSlots!.findIndex(s=>s.slotName==='temple-tile'),field=roof.submeshes!.find(s=>s.materialSlot===slot)!;
  for(let i=field.indexOffset;i<field.indexOffset+field.indexCount;i+=3)triangles.push([0,1,2].map(k=>Array.from(p.slice(ix[i+k]!*3,ix[i+k]!*3+3))));
  const actualTop=(x:number,z:number)=>{let top=-Infinity;for(const [a,b,c]of triangles){
   const den=(b![2]!-c![2]!)*(a![0]!-c![0]!)+(c![0]!-b![0]!)*(a![2]!-c![2]!);if(Math.abs(den)<1e-9)continue;
   const u=((b![2]!-c![2]!)*(x-c![0]!)+(c![0]!-b![0]!)*(z-c![2]!))/den,v=((c![2]!-a![2]!)*(x-c![0]!)+(a![0]!-c![0]!)*(z-c![2]!))/den;
   if(u>=-1e-7&&v>=-1e-7&&u+v<=1+1e-7)top=Math.max(top,u*a![1]!+v*b![1]!+(1-u-v)*c![1]!);
  }return top;};
  for(const [x0,x1,z0,z1]of NATIVE_RAIN_SURFACES){const x=(x0+x1)/2,z=(z0+z1)/2;expect(rainShelterHeight(x,z)).toBeCloseTo(actualTop(x,z),5);}
  for(const [x,z]of[[155,20],[64,204],[-170,-49.5]])expect(rainShelterHeight(x!,z!)).toBeUndefined();
  expect(RAIN_SHELTER_STATS.surfaces).toBe(nativeTriangleCount/2);expect(RAIN_SHELTER_STATS.maxCellSurfaces).toBeLessThan(250);
  expect(rainShelterHeight(158.5,51)).toBeCloseTo(actualTop(158.5,51),5);
  expect(rainShelterHeight(158.5,48.91)).toBeCloseTo(actualTop(158.5,48.91),5);expect(rainShelterHeight(158.5,46)).toBeUndefined();
 });
 it('keeps meadow rendering on the same terrain columns after the colour change',()=>{
  const mesh=terrainChunk(0,100);let sampled=0;
  for(let i=0;i<mesh.vertices.length;i+=32){if(mesh.vertices[i]===mesh.vertices[i+16] || mesh.vertices[i+2]===mesh.vertices[i+18])continue;const x=(mesh.vertices[i]!+mesh.vertices[i+16]!)/2,z=(mesh.vertices[i+2]!+mesh.vertices[i+18]!)/2;expect((mesh.vertices[i+1]!+mesh.vertices[i+17]!)/2).toBeCloseTo(voxelHeight(x,z),5);sampled++;}
  expect(sampled).toBeGreaterThan(600);
 });
});
