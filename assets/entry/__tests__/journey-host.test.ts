import { cliffPhotoNote } from '../../journey/photography.ts';
import { describe,expect,it } from 'vitest';
import { snapshotFromSample } from '@forgeax/engine/input';
import { add,normalize,subtract } from '../../controller/geometry.ts';
import { createTravelController } from '../../controller/travel-controller.ts';
import { EMPTY_INPUT,type Vec3 } from '../../controller/types.ts';
import { createWeatherTransition,type EnvironmentSnapshot } from '../../environment/weather.ts';
import { sunDiscShape } from '../../environment/sun-disc.ts';
import { createJourney,reduceJourney } from '../../journey/journey.ts';
import { REST_POINTS } from '../../journey/rest-points.ts';
import { SWALLOW_RIDGE } from '../../shanye-world/afternoon-layout.ts';
import { terrainHeight,WORLD } from '../../shanye-world/world-layout.ts';
import { appliedPhotoScene,boundedSunTrace,nearestPhysicalInteraction,observeAppliedPhoto,validatedRestTarget } from '../journey-host.ts';
import { createInputDiagnostics } from '../input-diagnostics.ts';

const statusAt=(x:number,z:number,target:Vec3)=>{
  const c=createTravelController({spawn:[x,0,z],terrainHeight}),status=c.snapshot(),eye=add(status.position,[0,1.64,0]);
  return{...status,mode:'photo' as const,camera:{...status.camera,position:eye,forward:normalize(subtract(target,eye))}};
};
const environmentAt=(position:Vec3,minute=930):EnvironmentSnapshot=>{
  const values=createWeatherTransition().step('morning',0,false,{day:2,minute});
  return{...values,exposure:0,revision:7,frozen:false,rainVisible:0,sheltered:false,sunDisc:sunDiscShape(position,values.solar,values.sunVisibility)};
};

describe('native clock, subjects and physical rest boundary',()=>{
  it('projects the real postal doorway from its ordinary viewpoint and rejects the reverse view',()=>{
    const status=statusAt(2,-214,[-3,17.5,-235]),env=environmentAt(status.camera.position);
    const doorway=observeAppliedPhoto(status,env).anchors['post-door'];
    expect(doorway).toMatchObject({occluded:false,visibleFraction:1});
    expect(doorway!.width*doorway!.height).toBeGreaterThan(.01);
    status.camera.forward=status.camera.forward.map(v=>-v) as unknown as Vec3;
    expect(observeAppliedPhoto(status,env).anchors['post-door']!.depth).toBeLessThan(0);
    const behind=statusAt(-3,-250,[-3,16.75,-231.7]);
    expect(observeAppliedPhoto(behind,environmentAt(behind.camera.position)).anchors['post-door']!.occluded).toBe(true);
  });

  it('sees the new crest from the road while the real lower roof occludes it from directly below',()=>{
    const clear=statusAt(154.7,16,SWALLOW_RIDGE.position);
    const blocked=statusAt(155.85,17.5,SWALLOW_RIDGE.position);
    expect(observeAppliedPhoto(clear,environmentAt(clear.camera.position)).afternoonSubject).toBe('swallow-roof');
    expect(observeAppliedPhoto(blocked,environmentAt(blocked.camera.position)).afternoonSubject).toBeUndefined();
  });

  it('clips solar occlusion traces to rendered world bounds and retains real interior hits',()=>{
    const seen:{a:Vec3;b:Vec3}[]=[];
    const clear=boundedSunTrace([64,85,204],[-700,290,-740],.025,(a,b)=>{
      seen.push({a,b});return{hit:false,point:b,fraction:1,distance:0};
    });
    expect(clear.hit).toBe(false);expect(seen).toHaveLength(1);
    for(const p of [seen[0]!.a,seen[0]!.b]){
      expect(p[0]).toBeGreaterThanOrEqual(WORLD.bounds.minX);expect(p[0]).toBeLessThanOrEqual(WORLD.bounds.maxX);
      expect(p[2]).toBeGreaterThanOrEqual(WORLD.bounds.minZ);expect(p[2]).toBeLessThanOrEqual(WORLD.bounds.maxZ);
    }
    const hit=boundedSunTrace([64,85,204],[-700,290,-740],.025,(a,b)=>({hit:true,point:add(a,subtract(b,a).map(v=>v*.4) as unknown as Vec3),fraction:.4,distance:0}));
    expect(hit.hit).toBe(true);expect(hit.fraction).toBeGreaterThan(0);expect(hit.fraction).toBeLessThan(.4);
    expect(boundedSunTrace([500,30,500],[800,40,800],.025,()=>{throw new Error('Outside terrain must not be sampled');}).hit).toBe(false);
  });

  it('requires an enabled actual sun shape and snapshots the applied clock by value',()=>{
    const status=statusAt(64,204,[-659,290,-731]),env=environmentAt(status.camera.position,1060);
    const visible=observeAppliedPhoto(status,env).anchors['sun-disc'];
    expect(visible).toBeDefined();expect(visible!.depth).toBeGreaterThan(0);
    expect(observeAppliedPhoto(status,{...env,sunDisc:{...env.sunDisc,visible:false}}).anchors['sun-disc']).toBeUndefined();
    const scene=appliedPhotoScene(status,env);expect(scene.clock).toEqual({day:2,minute:1060});
    env.clock!.minute=1100;expect(scene.clock!.minute).toBe(1060);
  });

  it('selects nearby physical rest for E while preserving closer ordinary interactions',()=>{
    expect(nearestPhysicalInteraction(REST_POINTS[0].position,false)).toBe('rest:post');
    expect(nearestPhysicalInteraction([-3,14.08,-228],false)).toBe('postman');
    expect(nearestPhysicalInteraction(REST_POINTS[2].position,false)).not.toBe('rest:town');
    expect(nearestPhysicalInteraction(REST_POINTS[0].position,false,true)).not.toBe('rest:post');
  });

  it('validates rest against actual controller feet and refuses forged locations, creative mode and airborne requests',()=>{
    let state=reduceJourney(createJourney(),{type:'start'}).state;
    const status=createTravelController({spawn:REST_POINTS[0].position,terrainHeight}).snapshot();
    expect(validatedRestTarget({target:'golden'},status,state)).toBe('golden');
    expect(validatedRestTarget({target:'day99'},status,state)).toBeNull();
    expect(validatedRestTarget({target:'morning',position:REST_POINTS[0].position},{...status,position:[80,20,-100]},state)).toBeNull();
    expect(validatedRestTarget('sunset',{...status,grounded:false},state)).toBeNull();
    state={...state,durable:{...state.durable,creativeMode:true}};expect(validatedRestTarget('sunset',status,state)).toBeNull();
    state={...state,durable:{...state.durable,creativeMode:false},runtime:{...state.runtime,pauseReasons:['ui']}};expect(validatedRestTarget('sunset',status,state)).toBe('sunset');
    state.runtime.pauseReasons=['hidden'];expect(validatedRestTarget('sunset',status,state)).toBeNull();
  });
});

describe('bounded native input evidence',()=>{
  it('retains only permitted input fields, caps samples/requests and preserves the triggering samples',()=>{
    const diagnostics=createInputDiagnostics(),source=snapshotFromSample({downKeys:new Set(),upKeys:new Set(),downCodes:new Set(['Space','KeyX']),buttons:[false,false,true],movementX:0,movementY:0,wheelDelta:0,focused:true,pointerLocked:false});
    diagnostics.observe({...EMPTY_INPUT,jump:true,lookActive:true},source,'photo','photo',false);
    diagnostics.shutter('native:shutter',false);
    for(let i=0;i<120;i++)diagnostics.observe({...EMPTY_INPUT},undefined,'walk','play',false);
    const first=diagnostics.read();expect(first.samples).toHaveLength(90);
    expect(first.shutters[0]!.samples[0]).toMatchObject({keys:{Space:true,KeyF:false,KeyC:false,ShiftLeft:false,ShiftRight:false},mouse:{left:false,right:true},translated:{jump:true,shutter:false,lookActive:true}});
    expect(JSON.stringify(first)).not.toContain('KeyX');
    first.shutters[0]!.samples[0]!.keys.Space=false;expect(diagnostics.read().shutters[0]!.samples[0]!.keys.Space).toBe(true);
    for(let i=0;i<20;i++)diagnostics.shutter('presentation:shutter',true);
    expect(diagnostics.read().shutters).toHaveLength(12);
  });
});

it('frames the cliff pine and the low solar disc from the actual public path, with a distinct rain exposure',()=>{
  const shot=statusAt(64,204,[6,87,136]);
  const env=environmentAt(shot.camera.position,1060);
  const frame=observeAppliedPhoto(shot,env);
  for(const id of ['cliff-pine','sun-disc'] as const) {
    const anchor=frame.anchors[id]!;
    expect(anchor,id).toBeDefined();
    expect(anchor.occluded,id).toBe(false);
    expect(anchor.visibleFraction,id).toBeGreaterThan(.9);
  }
  expect(frame.anchors['cliff-pine']!.x).toBeLessThan(frame.anchors['sun-disc']!.x);
  expect(cliffPhotoNote(frame,1060)).toContain('太阳');
  expect(cliffPhotoNote({...frame,anchors:{...frame.anchors,'sun-disc':undefined}},1060,true)).toContain('雨');
  expect(nearestPhysicalInteraction([66.5,84.08,205.8],true)).toBe('rest:cliff');
  expect(nearestPhysicalInteraction([64,84.08,204],true)).toContain('sunset-seat');
});
