import {it,expect} from 'vitest';
import {stairPaving} from '../mountain-architecture.ts';
import {COURT_PINES} from '../courtyard-garden.ts';
import {gardenStairTop,ALL_ROOFS,precinctShelter} from '../mountain-precinct.ts';
import {terrainHeight,traceSegment,resolveMove,type Vec3} from '../world-layout.ts';

it('carries the walking capsule up the dressed stone stairs and back to the garden',()=>{
 let p:Vec3=[158,terrainHeight(158,62),62];
 for(const goal of [94,62])for(let i=0;i<128;i++){
  const z=p[2]+Math.sign(goal-p[2])*.25;
  const next=resolveMove(p,[0,0,z-p[2]]);
  expect(next[2]).toBeCloseTo(z,7);p=[next[0],terrainHeight(next[0],next[2]),next[2]];
  expect(p[1]).toBeCloseTo(gardenStairTop(z),6);
 }
 expect(p[2]).toBe(62);
});
it('keeps the pass, arcade, and garden doorways open while their upper roofs shelter the player',()=>{
 for(const [x,z]of [[-19,-205],[156.4,57.5],[158,63],[158,80]]){
  const y=terrainHeight(x!,z!)+1.45;expect(traceSegment([x!,y,z!-.5],[x!,y,z!+.5],.16).hit).toBe(false);
 }
 for(const roof of ALL_ROOFS)expect(precinctShelter(roof.x,roof.z)).toBeGreaterThan(roof.y);
});

it('keeps the full pine crown outside the monastery roof footprints',()=>{
 for(const pine of COURT_PINES)for(const roof of ALL_ROOFS){
  const dx=Math.max(0,Math.abs(pine.x-roof.x)-roof.w/2);
  const dz=Math.max(0,Math.abs(pine.z-roof.z)-roof.d/2);
  expect(Math.hypot(dx,dz)).toBeGreaterThan(pine.spread+2);
 }
});

it('uses edge-to-edge treads and one top face per landing with no overlapping strips',()=>{
 const mesh=stairPaving(),indices=mesh.groups.get('stair-surface')!;
 const spans:{start:number;end:number;y:number}[]=[];
 for(let i=0;i<indices.length;i+=6){
  const zs=indices.slice(i,i+6).map(k=>mesh.vertices[8*k+2]!);
  spans.push({start:Math.min(...zs),end:Math.max(...zs),y:mesh.vertices[8*indices[i]!+1]!});
 }
 expect(spans.filter(s=>s.end-s.start>1)).toHaveLength(3);
 for(const [i,s] of spans.entries()){
  expect(s.y).toBeCloseTo(gardenStairTop((s.start+s.end)/2),6);
  if(i>0)expect(s.start-spans[i-1]!.end).toBeCloseTo(.032,6);
 }
 expect(spans[0]!.start).toBe(62);expect(spans.at(-1)!.end).toBe(96);
});
