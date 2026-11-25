import { describe,expect,it } from 'vitest';
import { createTravelController,projectAnchor,cameraRay } from '../travel-controller.ts';
import { EMPTY_INPUT,type CameraPose,type InputFrame,type TravelAction,type Vec3 } from '../types.ts';
import { safeCameraPosition } from '../geometry.ts';
import { terrainHeight,resolveMove,traceSegment,ROUTES,WORLD } from '../../shanye-world/world-layout.ts';
const frame=(patch:Partial<InputFrame>):InputFrame=>({...EMPTY_INPUT,...patch});
const forward:CameraPose={position:[0,2,0],forward:[0,0,-1],up:[0,1,0],verticalFovRadians:Math.PI/2,aspect:2};

describe('traveller controls and photography',()=>{
  it('walks along terrain without diagonal acceleration and slows down while taking photos',()=>{
    const events:TravelAction[]=[];
    const make=()=>createTravelController({spawn:[0,0,0],initialYaw:0,terrainHeight:(x,z)=>x*.1+z*.1,onAction:e=>events.push(e.type)});
    const a=make(),b=make();a.submitInput(frame({vertical:1}));b.submitInput(frame({vertical:1,horizontal:1}));
    for(let i=0;i<60;i++){a.step(1/60);b.step(1/60);}
    expect(a.snapshot().distanceWalked).toBeCloseTo(b.snapshot().distanceWalked,5);
    expect(b.snapshot().position[1]).toBeCloseTo(b.snapshot().position[0]*.1+b.snapshot().position[2]*.1,5);
    a.submitInput(frame({camera:true}));expect(a.snapshot().mode).toBe('photo');const p=a.snapshot().position;
    a.submitInput(frame({vertical:1,shutter:true}));for(let i=0;i<60;i++)a.step(1/60);
    expect(Math.hypot(a.snapshot().position[0]-p[0],a.snapshot().position[2]-p[2])).toBeCloseTo(2.2,5);expect(events.filter(e=>e==='shutter')).toHaveLength(1);
    a.submitInput(frame({shutter:true}));expect(events.filter(e=>e==='shutter')).toHaveLength(1);
    a.submitInput(frame({}));a.submitInput(frame({shutter:true}));expect(events.filter(e=>e==='shutter')).toHaveLength(2);
  });
  it('cancels held movement over pause/resume and does not click through a menu',()=>{
    const events:TravelAction[]=[];const c=createTravelController({spawn:[0,0,0],terrainHeight:()=>0,onAction:e=>events.push(e.type)});
    c.submitInput(frame({vertical:1}));c.step(.1);c.setPaused(true);const p=c.snapshot().position;
    c.submitInput(frame({vertical:1}));c.step(.1);c.setPaused(false);c.submitInput(frame({vertical:1,shutter:true}));c.step(.1);
    expect(c.snapshot().position).toEqual(p);expect(events).toEqual([]);
    c.submitInput(frame({}));c.submitInput(frame({vertical:1}));c.step(.1);expect(c.snapshot().position).not.toEqual(p);
  });
  it('refreshes camera pose before shutter and Escape lowers camera before requesting pause',()=>{
    const events:{type:TravelAction;forward:Vec3}[]=[];const c=createTravelController({spawn:[0,0,0],terrainHeight:()=>0,initialYaw:0,onAction:e=>events.push({type:e.type,forward:e.state.camera.forward})});
    c.toggleCamera();c.submitInput(frame({lookActive:true,lookX:Math.PI/.0022/2,shutter:true}));
    expect(events.find(e=>e.type==='shutter')!.forward[0]).toBeGreaterThan(.9);
    c.submitInput(frame({pause:true}));expect(c.snapshot().mode).toBe('walk');expect(events.at(-1)?.type).toBe('camera-exit');
    c.submitInput(frame({}));c.submitInput(frame({pause:true}));expect(events.at(-1)?.type).toBe('pause');
  });
  it('rejects climbing a cliff and falls to a lower surface without tunnelling',()=>{
    const c=createTravelController({spawn:[0,0,0],initialYaw:Math.PI/2,terrainHeight:x=>x>1?5:0});
    c.submitInput(frame({vertical:1}));for(let i=0;i<120;i++)c.step(1/60);expect(c.snapshot().position[0]).toBeLessThanOrEqual(1);
    const d=createTravelController({spawn:[0,5,0],initialYaw:Math.PI/2,terrainHeight:x=>x>1?0:5});
    d.submitInput(frame({vertical:1}));for(let i=0;i<120;i++)d.step(1/60);expect(d.snapshot().position[1]).toBe(0);expect(d.snapshot().grounded).toBe(true);
  });
  it('applies saved mouse sensitivity and inverted Y to the actual photograph direction',()=>{
    const a=createTravelController({spawn:[0,0,0],terrainHeight:()=>0,initialYaw:0,initialPitch:0});
    a.setLookSettings({sensitivity:2,invertY:true});a.toggleCamera();a.submitInput(frame({lookActive:true,lookX:100,lookY:100}));
    expect(a.snapshot().yaw).toBeCloseTo(.44);expect(a.snapshot().pitch).toBeCloseTo(-.44);expect(a.snapshot().camera.forward[1]).toBeGreaterThan(0);
  });
  it('looks into the high sky while walking without dragging the orbit through the ground',()=>{
    const c=createTravelController({spawn:[0,0,0],terrainHeight:()=>0,initialYaw:0,initialPitch:0});
    c.submitInput(frame({lookActive:true,lookY:-.54/.0022}));
    const walking=c.updateCamera(1/60);
    expect(walking.forward[1]).toBeCloseTo(Math.sin(.54));
    expect(walking.position[1]).toBeGreaterThan(.3);
    expect(c.snapshot().avatarVisible).toBe(true);
    expect(projectAnchor(walking,[0,1.38,0],.35).visible).toBe(true);
    c.submitInput(frame({lookActive:true,lookY:-1000}));
    expect(c.updateCamera(1/60).forward[1]).toBeGreaterThan(Math.sin(58*Math.PI/180));
    c.toggleCamera();
    expect(c.snapshot().camera.forward[1]).toBeGreaterThan(Math.sin(58*Math.PI/180));
    expect(c.snapshot().camera.position[1]).toBeCloseTo(1.64);
  });
  it('mounts, pauses and lands the zipline once, clearing held keys at the landing',()=>{
    const events:TravelAction[]=[];const c=createTravelController({spawn:[0,0,0],terrainHeight:()=>0,onAction:e=>events.push(e.type)});
    expect(c.startZipline({start:[40,5,0],end:[80,0,0]})).toBe(false);
    expect(c.startZipline({start:[0,5,0],end:[30,0,0],speed:10})).toBe(true);
    c.step(.1);const p=c.snapshot().position;c.setPaused(true);c.step(.1);expect(c.snapshot().position).toEqual(p);c.setPaused(false);
    for(let i=0;i<400;i++)c.step(1/60);
    expect(c.snapshot().position).toEqual([30,0,0]);expect(c.snapshot().mode).toBe('walk');expect(events).toEqual(['zipline-start','zipline-land']);
  });
  it('looks around with RMB during a zipline without changing the path, progress or landing',()=>{
    const route={start:[0,3,0] as Vec3,points:[[20,5,0] as Vec3],end:[40,3,-10] as Vec3,speed:10,sag:0};
    const make=()=>createTravelController({spawn:[0,0,0],initialYaw:Math.PI/2,terrainHeight:()=>0});
    const baseline=make(),looking=make();baseline.startZipline(route);looking.startZipline(route);
    for(let i=0;i<60;i++){baseline.step(1/60);looking.step(1/60);baseline.updateCamera(1/60);looking.updateCamera(1/60);}
    const before=looking.snapshot();looking.submitInput(frame({lookActive:true,lookX:300,lookY:150,vertical:1,horizontal:1}));
    expect(looking.snapshot().yaw-before.yaw).toBeCloseTo(.66);expect(looking.snapshot().pitch-before.pitch).toBeCloseTo(.33);
    baseline.step(1/60);looking.step(1/60);
    expect(looking.snapshot().position).toEqual(baseline.snapshot().position);expect(looking.snapshot().ziplineProgress).toEqual(baseline.snapshot().ziplineProgress);
    looking.submitInput(frame({}));const released=looking.snapshot();
    for(let i=0;i<45;i++){baseline.step(1/60);looking.step(1/60);}
    expect(looking.snapshot().yaw).toBeCloseTo(released.yaw);expect(looking.snapshot().pitch).toBeCloseTo(released.pitch);
    for(let i=0;i<45;i++){baseline.step(1/60);looking.step(1/60);}
    expect(looking.snapshot().pitch).toBeLessThan(released.pitch);
    for(let i=0;i<600&&looking.snapshot().mode==='zipline';i++){
      const previous=looking.snapshot();looking.submitInput(frame({lookActive:true}));baseline.step(1/60);looking.step(1/60);looking.updateCamera(1/60);
      expect(looking.snapshot().position).toEqual(baseline.snapshot().position);
      if(looking.snapshot().mode==='walk'){expect(looking.snapshot().yaw).toBeCloseTo(previous.yaw);expect(looking.snapshot().pitch).toBeCloseTo(previous.pitch);}
    }
    expect(looking.snapshot().mode).toBe('walk');expect(looking.snapshot().position).toEqual([40,0,-10]);
    const landedDistance=Math.hypot(...looking.snapshot().camera.position.map((n,i)=>n-([40,1.38,-10][i]??0)));
    looking.updateCamera(1/60);const nextDistance=Math.hypot(...looking.snapshot().camera.position.map((n,i)=>n-([40,1.38,-10][i]??0)));
    expect(Math.abs(nextDistance-landedDistance)).toBeLessThan(.4);
  });
  it('projects an authored opening with correct aspect, depth, clipping and occlusion',()=>{
    const a=projectAnchor(forward,{position:[0,2,-10],size:[4,2,0],right:[1,0,0]});
    expect(a.x).toBeCloseTo(.5);expect(a.y).toBeCloseTo(.5);expect(a.width).toBeCloseTo(.1);expect(a.height).toBeCloseTo(.1);expect(a.depth).toBe(10);expect(a.visible).toBe(true);
    expect(projectAnchor(forward,[0,2,10],1).visible).toBe(false);
    const blocked=projectAnchor(forward,[0,2,-10],1,()=>({hit:true,point:[0,2,-5],distance:5,fraction:.5}));expect(blocked.occluded).toBe(true);
    const ray=cameraRay(forward,.5,.5);expect(ray.direction).toEqual([0,0,-1]);expect(cameraRay(forward,1,.5).direction[0]).toBeGreaterThan(0);
  });
  it('pulls camera in before a wall and above ground',()=>{
    const p=safeCameraPosition([0,2,0],[0,3,8],()=>0,()=>({hit:true,point:[0,2.5,4],distance:4,fraction:.5}));expect(p[2]).toBeLessThan(4);expect(p[1]).toBeGreaterThan(.3);
    const low=safeCameraPosition([0,2,0],[0,-5,8],()=>0);expect(low[1]).toBeGreaterThanOrEqual(.3);
  });
});

describe('authored world travel',()=>{
  it.each(ROUTES.map(route=>[route.id,route] as const))('walks every segment of %s using the actual ground and collision contract',(_id,route)=>{
    const c=createTravelController({spawn:route.points[0]!,terrainHeight,resolveMove,traceSegment});
    for(const target of route.points.slice(1)){
      let iterations=0;
      while(Math.hypot(c.snapshot().position[0]-target[0],c.snapshot().position[2]-target[2])>.18&&iterations++<7000){
        const state=c.snapshot(),heading=Math.atan2(target[0]-state.position[0],-(target[2]-state.position[2]));
        c.submitInput(frame({vertical:1,lookActive:true,lookX:Math.atan2(Math.sin(heading-state.yaw),Math.cos(heading-state.yaw))/.0022}));c.step(1/60);
      }
      expect(iterations,`stuck before ${target} at ${c.snapshot().position}`).toBeLessThan(7000);
      expect(c.snapshot().position[1]).toBeCloseTo(terrainHeight(c.snapshot().position[0],c.snapshot().position[2]),4);
    }
  });
  it('uses the actual elevated zipline contract and lands on the terrain',()=>{
    const c=createTravelController({spawn:[WORLD.zipline.start[0],0,WORLD.zipline.start[2]],terrainHeight,resolveMove,traceSegment});
    expect(c.startZipline(WORLD.zipline)).toBe(true);
    for(let i=0;i<1300;i++){
      c.step(1/60);const position=c.snapshot().position;
      expect(position[1],`zipline entered terrain at ${position}`).toBeGreaterThanOrEqual(terrainHeight(position[0],position[2])-.001);
    }
    expect(c.snapshot().mode).toBe('walk');expect(c.snapshot().position).toEqual([WORLD.zipline.end[0],terrainHeight(WORLD.zipline.end[0],WORLD.zipline.end[2]),WORLD.zipline.end[2]]);
  });
});
