import { describe, expect, it } from 'vitest';
import { BACKDROP_BOUNDARY, BACKDROP_BLEND_EDGE, BACKDROP_OUTER_EDGE, buildBackdropMesh, createBackdropGrid } from '../backdrop-mesh.ts';
import { voxelHeight } from '../world-layout.ts';

describe('three-range background',()=>{
 it('leaves a low southern opening between a broad west shoulder and a taller east summit',()=>{
  const {heightAt}=createBackdropGrid();
  const west=heightAt(-656,-624),east=heightAt(656,-560),north=heightAt(-176,720);
  expect(west).toBeGreaterThan(150);expect(west).toBeLessThan(190);
  expect(east).toBeGreaterThan(230);expect(east).toBeLessThan(270);
  expect(north).toBeGreaterThan(170);expect(north).toBeLessThan(210);
  expect(east-west).toBeGreaterThan(55);
  for(let z=-624;z>=-880;z-=32)for(let x=-192;x<=192;x+=32){
   const h=heightAt(x,z);expect(h).toBeGreaterThanOrEqual(16);expect(h).toBeLessThanOrEqual(60);
  }
  // Summits have substantial shoulders and readable lower saddles, not needles.
  expect(heightAt(-496,-624)).toBeGreaterThan(85);
  expect(heightAt(496,-688)).toBeGreaterThan(110);
  expect(heightAt(496,-688)).toBeLessThan(east-55);
  expect(heightAt(-304,720)).toBeGreaterThan(100);
  expect(heightAt(144,752)).toBeGreaterThan(80);
 });
 it('preserves every main-terrain boundary sample and exactly tiles both ring resolutions',()=>{
  const grid=createBackdropGrid(),occupied=new Set<string>(),insideBoundary:string[]=[],overlapping:string[]=[];
  for(let p=-398;p<400;p+=4){
   expect(grid.heightAt(p,402)).toBe(voxelHeight(p,398));expect(grid.heightAt(p,-402)).toBe(voxelHeight(p,-398));
   expect(grid.heightAt(402,p)).toBe(voxelHeight(398,p));expect(grid.heightAt(-402,p)).toBe(voxelHeight(-398,p));
  }
  for(const c of grid.columns){
   const edge=Math.max(Math.abs(c.x+c.size/2),Math.abs(c.z+c.size/2));
   expect(c.size).toBe(edge<BACKDROP_BLEND_EDGE?4:32);
   expect(Number.isFinite(c.height)).toBe(true);
   for(let x=c.x;x<c.x+c.size;x+=4)for(let z=c.z;z<c.z+c.size;z+=4){
    const key=`${x},${z}`;
    // Keep both predicates for every 4m sample, without allocating two matcher
    // chains per successful cell. All predicates passing is equivalent to both
    // failure collections being empty; retain the exact string occupancy key.
    if(!(Math.max(Math.abs(x+2),Math.abs(z+2))>=BACKDROP_BOUNDARY))insideBoundary.push(key);
    if(occupied.has(key))overlapping.push(key);occupied.add(key);
   }
  }
  expect(insideBoundary,'4m cells intrude into the main terrain').toEqual([]);
  expect(overlapping,'4m cells overlap another backdrop column').toEqual([]);
  expect(occupied.size*16).toBe((BACKDROP_OUTER_EDGE*2)**2-(BACKDROP_BOUNDARY*2)**2);
 });
 it('keeps exposed-face geometry within budget and emits no hidden bottoms or invalid faces',()=>{
  const grid=createBackdropGrid(),mesh=buildBackdropMesh();let topArea=0;
  expect(mesh.triangleCount).toBeLessThan(55000);
  expect(mesh.triangleCount).toBeLessThan(grid.columns.length*12);
  expect([...mesh.groups.keys()].sort()).toEqual(['rock','skyrock']);
  for(const indices of mesh.groups.values())for(let i=0;i<indices.length;i+=3){
   const a=indices[i]!*8,b=indices[i+1]!*8,c=indices[i+2]!*8,v=mesh.vertices;
   const ab=[v[b]!-v[a]!,v[b+1]!-v[a+1]!,v[b+2]!-v[a+2]!],ac=[v[c]!-v[a]!,v[c+1]!-v[a+1]!,v[c+2]!-v[a+2]!];
   const cross=[ab[1]!*ac[2]!-ab[2]!*ac[1]!,ab[2]!*ac[0]!-ab[0]!*ac[2]!,ab[0]!*ac[1]!-ab[1]!*ac[0]!];
   expect(cross[0]!*v[a+3]!+cross[1]!*v[a+4]!+cross[2]!*v[a+5]!).toBeGreaterThan(0);
   expect(v[a+4]!).toBeGreaterThanOrEqual(0);
   topArea+=Math.abs(cross[1]!)/2; // All top triangles project onto XZ; vertical walls contribute zero.
  }
  expect(topArea).toBe((BACKDROP_OUTER_EDGE*2)**2-(BACKDROP_BOUNDARY*2)**2);
 });
});
