import {describe,expect,it} from 'vitest';
import {findRecoveryPoint,isSafeRoadPose,travelBlockers,traceTravelSegment,type TravelSafetyFlags} from '../road-safety.ts';
import {STATIC_OBSTACLES,WORLD,terrainHeight,type Vec3} from '../world-layout.ts';

const locked:TravelSafetyFlags={gateOpen:false,bridgeWalkable:false};
const gateOnly:TravelSafetyFlags={gateOpen:true,bridgeWalkable:false};
const open:TravelSafetyFlags={gateOpen:true,bridgeWalkable:true};
const feet=(x:number,z:number):Vec3=>[x,terrainHeight(x,z),z];

describe('normal-play road recovery',()=>{
 it('finds clear connected paving throughout the world under all lock states',()=>{
  const origins=[feet(173,31.5),feet(177,32.5),feet(-188,-42),feet(5,242),feet(87,-101),feet(155,45)];
  for(const flags of [locked,gateOnly,open]){
   // Neither recovery nor the assertions mutate these flag-owned blockers.
   const blockers=[...STATIC_OBSTACLES,...travelBlockers(flags)];
   for(const origin of origins){
   const result=findRecoveryPoint(origin,flags);expect(result).not.toBeNull();
   const p=result!.position;expect(isSafeRoadPose(p,flags)).toBe(true);
   expect(p[1]).toBe(terrainHeight(p[0],p[2]));expect(Number.isFinite(result!.yaw)).toBe(true);
   const top=p[1]+1.72,left=p[0]-.28,right=p[0]+.28,back=p[2]-.28,front=p[2]+.28,overlaps:string[]=[];
   for(const b of blockers){
    // The same capsule predicate still examines every obstacle. Collect only
    // failures instead of creating a matcher and diagnostic string for each
    // successful comparison; an empty set means every old assertion passed.
    if(top>b.min[1]&&p[1]<b.max[1]&&right>b.min[0]&&left<b.max[0]&&front>b.min[2]&&back<b.max[2])overlaps.push(b.id);
   }
   expect(overlaps,`capsule from ${origin} under ${flags.gateOpen}/${flags.bridgeWalkable}`).toEqual([]);
   }
  }
 });
 it('recovers locally instead of silently accepting a distant spawn fallback from a broken road graph',()=>{
  for(const flags of [locked,gateOnly,open])for(const [x,z,maxDistance,route]of [
   [173,31.5,flags.gateOpen?6:30,flags.gateOpen?'town-postcard-alley':'valley-cross'],
   [-188,-42,17,'hidden-trail'],[5,242,9,'town-high'],
  ]as const){
   const result=findRecoveryPoint(feet(x,z),flags)!;
   expect(Math.hypot(result.position[0]-x,result.position[2]-z)).toBeLessThan(maxDistance);
   expect(result.routeId).toBe(route);
  }
 });
 it('cannot use rescue or a stale last-safe position to bypass the unopened town gate or bridge',()=>{
  for(const origin of [feet(155,8),feet(155,12),feet(173,31.5),feet(155,45)]){
   const result=findRecoveryPoint(origin,locked,feet(155,20))!;
   expect(result.position[2]).toBeLessThan(9.4);expect(isSafeRoadPose(feet(155,20),locked)).toBe(false);
  }
  const courtyard=findRecoveryPoint(feet(155,45),gateOnly,feet(155,42))!;
  expect(courtyard.position[2]).toBeLessThan(24);
  expect(isSafeRoadPose(feet(155,42),gateOnly)).toBe(false);
  expect(isSafeRoadPose(feet(155,42),open)).toBe(true);
  expect(findRecoveryPoint(feet(155,45),open)!.routeId).toBe('town-courtyard');
 });
 it('keeps a nearby proven foothold, but rejects stale height, wall occupancy and locked poses',()=>{
  const recent=feet(172,27),result=findRecoveryPoint(feet(173,31.5),gateOnly,recent)!;
  expect(result.position).toEqual(recent);expect(result.routeId).toBe('town-postcard-alley');
  for(const invalid of [[172,0,27],[165.75,25,21],[NaN,0,0]] as Vec3[]){
   expect(isSafeRoadPose(invalid,open)).toBe(false);
   expect(findRecoveryPoint(feet(173,31.5),gateOnly,invalid)!.position).not.toEqual(invalid);
  }
  expect(isSafeRoadPose(WORLD.spawn,locked)).toBe(true);
  expect(findRecoveryPoint([NaN,Infinity,0],locked)!.routeId).toBe('post-lookout');
 });
 it('exports exactly the active physical blockers for the movement adapter',()=>{
  expect(travelBlockers(locked).map(b=>b.id)).toEqual(['town-closed-gate','town-raised-bridge']);
  expect(travelBlockers(gateOnly).map(b=>b.id)).toEqual(['town-raised-bridge']);
  expect(travelBlockers(open)).toEqual([]);
 });
 it('blocks camera rays and stationary camera probes only while the gate or bridge is closed',()=>{
  const gate=traceTravelSegment([155,26,6],[155,26,14],locked,0);
  expect(gate.obstacle).toBe('town-closed-gate');expect(gate.point[2]).toBeCloseTo(9.7,7);
  expect(traceTravelSegment([155,26,6],[155,26,14],gateOnly,0).hit).toBe(false);
  const bridge=traceTravelSegment([155,26,22],[155,26,30],gateOnly,0);
  expect(bridge.obstacle).toBe('town-raised-bridge');expect(bridge.point[2]).toBeCloseTo(24.2,7);
  expect(traceTravelSegment([155,26,22],[155,26,30],open,0).hit).toBe(false);
  expect(traceTravelSegment([155,26,10],[155,26,10],locked,.3).hit).toBe(true);
  expect(traceTravelSegment([155,26,10],[155,26,10],open,.3).hit).toBe(false);
  expect(traceTravelSegment([150,26,9],[155,26,11],locked,0).obstacle).toBe('town-arch-left');
 });
});
