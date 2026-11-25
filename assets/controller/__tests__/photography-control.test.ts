import { describe,expect,it } from 'vitest';
import { DEFAULT_PHOTOGRAPHY,LENS_FOV } from '../../shared/photography-contract.ts';
import { createTravelController } from '../travel-controller.ts';
import { EMPTY_INPUT,type TraceSegment } from '../types.ts';
import { terrainHeight,resolveMove,traceSegment } from '../../shanye-world/world-layout.ts';

const flat=()=>createTravelController({spawn:[0,0,0],terrainHeight:()=>0,initialYaw:0,initialPitch:0});
const advance=(c:ReturnType<typeof flat>,n=60)=>{for(let i=0;i<n;i++){c.step(1/60);c.updateCamera(1/60);}};
describe('real handheld and assisted photography',()=>{
  it('applies all three actual camera FOVs and uses collision-aware slow movement even with Shift',()=>{
    const c=createTravelController({spawn:[0,0,0],initialYaw:0,terrainHeight:()=>0,resolveMove:(p,d)=>[p[0]+d[0],p[1],Math.max(-1,p[2]+d[2])]});
    c.toggleCamera();
    for(const lens of ['wide','standard','detail'] as const){c.configurePhotography({...DEFAULT_PHOTOGRAPHY,lens});expect(c.snapshot().camera.verticalFovRadians).toBe(LENS_FOV[lens]);}
    c.submitInput({...EMPTY_INPUT,vertical:1,run:true});advance(c);
    expect(c.snapshot().position[2]).toBe(-1);expect(c.snapshot().avatarVisible).toBe(false);
    const a=flat(),b=flat();a.toggleCamera();b.toggleCamera();a.submitInput({...EMPTY_INPUT,vertical:1});b.submitInput({...EMPTY_INPUT,vertical:1,horizontal:1,run:true});advance(a);advance(b);
    expect(a.snapshot().distanceWalked).toBeCloseTo(2.2);expect(b.snapshot().distanceWalked).toBeCloseTo(2.2);
  });
  it('places three real open-ground views, keeps the tripod fixed and admits actual character movement',()=>{
    const c=flat();c.configurePhotography({...DEFAULT_PHOTOGRAPHY,mode:'portrait'});c.toggleCamera();
    const before=c.snapshot();expect(before.photography.availableViewpoints).toEqual([0,1,2]);expect(before.photography.subjectVisible).toBe(true);expect(before.avatarVisible).toBe(true);
    c.submitInput({...EMPTY_INPUT,horizontal:1});advance(c,15);
    // The subject faces the photographer (+Z), so their own right is -X.
    expect(c.snapshot().position[0]).toBeLessThan(-.5);expect(c.snapshot().camera.position).toEqual(before.camera.position);
    const forward=c.snapshot().camera.forward;c.submitInput({...EMPTY_INPUT,lookActive:true,lookX:40,lookY:20});c.updateCamera(1/60);
    expect(c.snapshot().camera.position).toEqual(before.camera.position);expect(c.snapshot().camera.forward).not.toEqual(forward);
    c.submitInput({...EMPTY_INPUT,horizontal:1});advance(c,600);
    expect(c.snapshot().photography.candidateAvailable).toBe(false);expect(c.snapshot().photography.candidateStatus).toContain('画面');
  });
  it('recomputes a selected viewpoint from current feet, while repeated configuration leaves it fixed',()=>{
    const c=flat(),settings={...DEFAULT_PHOTOGRAPHY,mode:'portrait' as const};c.configurePhotography(settings);c.toggleCamera();
    const first=c.snapshot().camera.position;c.submitInput({...EMPTY_INPUT,horizontal:1});advance(c,20);
    c.configurePhotography(settings);expect(c.snapshot().camera.position).toEqual(first);
    c.configurePhotography({...settings,viewpoint:1});const other=c.snapshot();expect(other.camera.position).not.toEqual(first);expect(other.photography.selectedViewpoint).toBe(1);expect(other.photography.subjectVisible).toBe(true);
    for(let i=0;i<10;i++)c.configurePhotography({...settings,viewpoint:1});expect(c.snapshot().camera.position).toEqual(other.camera.position);
  });
  it('reports obstructed placements and keeps the real camera on the player side of a wall',()=>{
    const wall:TraceSegment=(a,b,clearance=0)=>{const boundary=1-clearance,hit=Math.max(a[2],b[2])>=boundary,t=(boundary-a[2])/(b[2]-a[2]||1);return {hit,point:[a[0],a[1],boundary],distance:Math.abs(boundary-a[2]),fraction:Math.max(0,Math.min(1,t))};};
    const c=createTravelController({spawn:[0,0,0],initialYaw:0,terrainHeight:()=>0,traceSegment:wall});c.configurePhotography({...DEFAULT_PHOTOGRAPHY,mode:'portrait'});c.toggleCamera();
    expect(c.snapshot().photography.availableViewpoints).toEqual([]);expect(c.snapshot().photography.candidateAvailable).toBe(false);expect(c.snapshot().photography.candidateStatus).toContain('挡住');expect(c.snapshot().camera.position[2]).toBeLessThan(1);
  });
  it('freezes applied camera, settings, pose clock and character during capture, then enforces release',()=>{
    const c=flat();c.configurePhotography({...DEFAULT_PHOTOGRAPHY,mode:'portrait',pose:'wave'});c.toggleCamera();c.submitInput({...EMPTY_INPUT,horizontal:1});advance(c,8);
    c.setPaused(true);const frozen=c.snapshot();c.configurePhotography({...DEFAULT_PHOTOGRAPHY,mode:'portrait',lens:'detail',pose:'letter'});c.setAspect(1);c.submitInput({...EMPTY_INPUT,vertical:1,lookActive:true,lookX:100});advance(c,120);
    const after=c.snapshot();expect(after.camera).toEqual(frozen.camera);expect(after.position).toEqual(frozen.position);expect(after.posePhase).toBe(frozen.posePhase);expect(after.photography.settings).toEqual(frozen.photography.settings);
    c.setPaused(false);expect(c.snapshot().photography.settings.pose).toBe('letter');expect(c.snapshot().camera.verticalFovRadians).toBe(LENS_FOV.detail);
    c.submitInput({...EMPTY_INPUT,vertical:1});advance(c,3);expect(c.snapshot().position).toEqual(frozen.position);
    c.submitInput({...EMPTY_INPUT});c.submitInput({...EMPTY_INPUT,vertical:1});advance(c,3);expect(c.snapshot().position).not.toEqual(frozen.position);
  });
  it('uses real authored terrain and walls for the normal valley portrait position',()=>{
    const c=createTravelController({spawn:[64,0,204],initialYaw:0,terrainHeight,resolveMove,traceSegment});c.configurePhotography({...DEFAULT_PHOTOGRAPHY,mode:'portrait'});c.toggleCamera();
    expect(c.snapshot().photography.availableViewpoints.length).toBeGreaterThanOrEqual(2);
    for(const candidate of c.snapshot().photography.candidates.filter(c=>c.available))expect(candidate.position[1]).toBeGreaterThan(terrainHeight(candidate.position[0],candidate.position[2])+.2);
  });
});

it('magnifies the projected scene from a fixed tripod and restores its preset without moving it',()=>{
 const c=flat(),preset={...DEFAULT_PHOTOGRAPHY,mode:'portrait' as const,lens:'standard' as const};
 c.configurePhotography(preset);c.toggleCamera();
 const before=c.snapshot().camera;
 c.configurePhotography({...preset,zoom:3.7});
 const zoomed=c.snapshot().camera;
 expect(zoomed.position).toEqual(before.position);expect(zoomed.forward).toEqual(before.forward);
 expect(Math.tan(LENS_FOV.wide/2)/Math.tan(zoomed.verticalFovRadians/2)).toBeCloseTo(3.7,8);
 c.configurePhotography(preset);expect(c.snapshot().camera).toEqual(before);
});
