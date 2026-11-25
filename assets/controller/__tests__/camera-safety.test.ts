import { describe, expect, it } from 'vitest';
import { distance, safeCameraPosition } from '../geometry.ts';
import { createTravelController } from '../travel-controller.ts';
import { EMPTY_INPUT, type TraceSegment, type Vec3 } from '../types.ts';
import { STATIC_OBSTACLES, terrainHeight, traceSegment } from '../../shanye-world/world-layout.ts';

type Box = { min:Vec3; max:Vec3 };
/** A solid-box fixture independent of the camera placement algorithm. */
function boxesTrace(boxes:Box[]):TraceSegment {
  return (a,b,clearance=0)=>{
    const delta=b.map((value,i)=>value-a[i]!) as unknown as Vec3;
    let fraction=1;
    for(const box of boxes){
      let entry=0,exit=1;
      for(let axis=0;axis<3;axis++){
        const lo=box.min[axis]!-clearance,hi=box.max[axis]!+clearance;
        if(Math.abs(delta[axis]!)<1e-9){if(a[axis]!<lo||a[axis]!>hi){entry=2;break;}}
        else {const edges=[(lo-a[axis]!)/delta[axis]!, (hi-a[axis]!)/delta[axis]!];entry=Math.max(entry,Math.min(...edges));exit=Math.min(exit,Math.max(...edges));}
      }
      if(entry<=exit)fraction=Math.min(fraction,entry);
    }
    return {hit:fraction<1,fraction,distance:distance(a,b)*fraction,point:[a[0]+delta[0]*fraction,a[1]+delta[1]*fraction,a[2]+delta[2]*fraction]};
  };
}

describe('camera collision safety',()=>{
  it('does not impose a minimum orbit distance through a wall beside the focus',()=>{
    const trace=boxesTrace([{min:[-5,0,.32],max:[5,8,1]}]);
    const position=safeCameraPosition([0,2,0],[0,2,10],()=>0,trace);
    expect(position[2]).toBeLessThan(.02);
    expect(trace(position,position,.3).hit).toBe(false);
  });

  it('stops before a narrow terrain ledge instead of lifting into the roof above it',()=>{
    const ground=(_x:number,z:number)=>z>=7.9?2.5:0;
    const trace=boxesTrace([{min:[-2,2.6,7.5],max:[2,4,9]}]);
    const focus:Vec3=[0,2,0],position=safeCameraPosition(focus,[0,1,8],ground,trace);
    expect(position[2]).toBeLessThan(7.9);
    expect(position[1]).toBeGreaterThanOrEqual(ground(position[0],position[2])+.3);
    expect(trace(position,position,.3).hit).toBe(false);
    expect(trace(focus,position,.3).hit).toBe(false);
  });

  it('recovers the small clearance overlap when a legal traveller position hugs a wall',()=>{
    const trace=boxesTrace([{min:[.28,0,-5],max:[4,8,5]}]);
    const position=safeCameraPosition([0,1.38,0],[6,3,0],()=>0,trace);
    expect(trace(position,position,.3).hit).toBe(false);
    expect(position[0]).toBeLessThan(-.02);
    expect(distance(position,[0,1.38,0])).toBeLessThan(.7);
  });

  it('retains the last clear camera if the focus becomes enclosed',()=>{
    const trace=boxesTrace([{min:[-2,-1,-2],max:[2,5,2]}]);
    const previous:Vec3=[0,2,-5];
    expect(safeCameraPosition([0,2,0],[0,3,1],()=>0,trace,.3,previous)).toEqual(previous);
  });

  it('hides the traveller before its hat/backpack fill a compressed view and restores it outside',()=>{
    const trace=boxesTrace([{min:[-5,0,.32],max:[5,8,1]}]);
    const controller=createTravelController({spawn:[0,0,0],initialYaw:0,initialPitch:0,terrainHeight:()=>0,traceSegment:trace});
    expect(controller.snapshot().avatarVisible).toBe(false);
    expect(distance(controller.snapshot().camera.forward,[0,0,-1])).toBeLessThan(1e-8);
    expect(trace(controller.snapshot().camera.position,controller.snapshot().camera.position,.3).hit).toBe(false);
    controller.submitInput({...EMPTY_INPUT,lookActive:true,lookX:Math.PI/.0022});
    expect(controller.snapshot().avatarVisible).toBe(true);
    expect(distance(controller.snapshot().camera.position,[0,1.38,0])).toBeCloseTo(6.5);
  });

  it('preserves the look direction when a wall pushes the camera in front of the focus',()=>{
    const trace=boxesTrace([{min:[-5,0,.28],max:[5,8,1]}]);
    const controller=createTravelController({spawn:[0,0,0],initialYaw:0,initialPitch:0,terrainHeight:()=>0,traceSegment:trace});
    expect(controller.snapshot().camera.position[2]).toBeLessThan(0);
    expect(controller.snapshot().camera.forward[2]).toBeLessThan(-.99);
    expect(controller.snapshot().avatarVisible).toBe(false);
  });

  it('hides the backpack in a 1.5m compressed orbit and restores the view after walking away',()=>{
    const trace=boxesTrace([{min:[-5,0,1.8],max:[5,8,2.4]}]);
    const controller=createTravelController({spawn:[0,0,0],initialYaw:0,initialPitch:0,terrainHeight:()=>0,traceSegment:trace});
    const compressed=controller.snapshot();
    expect(distance(compressed.camera.position,[0,1.38,0])).toBeGreaterThan(1.4);
    expect(compressed.avatarVisible).toBe(false);
    expect(distance(compressed.camera.forward,[0,0,-1])).toBeLessThan(1e-8);
    controller.submitInput({...EMPTY_INPUT,vertical:1});
    for(let i=0;i<60;i++){controller.step(1/60);controller.updateCamera(1/60);}
    const restored=controller.snapshot();
    expect(restored.avatarVisible).toBe(true);
    expect(distance(restored.camera.position,[restored.position[0],1.38,restored.position[2]])).toBeGreaterThan(6);
    expect(trace(restored.camera.position,restored.camera.position,.3).hit).toBe(false);
  });

  it('snaps the camera on paused restore/resume without reopening held movement',()=>{
    const trace=boxesTrace([{min:[-5,0,.32],max:[5,8,1]}]);
    const controller=createTravelController({spawn:[0,0,0],initialYaw:0,terrainHeight:()=>0,traceSegment:trace});
    controller.setPaused(true);
    const frozen=controller.snapshot().camera;
    controller.restore([20,0,0],Math.PI/2);
    expect(controller.snapshot().paused).toBe(true);
    expect(controller.snapshot().camera).toEqual(frozen);
    controller.setPaused(false);
    const restored=controller.snapshot();
    const expected=createTravelController({spawn:[20,0,0],initialYaw:Math.PI/2,terrainHeight:()=>0,traceSegment:trace}).snapshot();
    expect(restored.camera).toEqual(expected.camera);
    expect(restored.avatarVisible).toBe(true);
    expect(trace(restored.camera.position,restored.camera.position,.3).hit).toBe(false);
    controller.submitInput({...EMPTY_INPUT,vertical:1});controller.step(.1);
    expect(controller.snapshot().position).toEqual([20,0,0]);
    controller.submitInput({...EMPTY_INPUT});controller.submitInput({...EMPTY_INPUT,vertical:1});controller.step(.1);
    expect(controller.snapshot().position[0]).toBeGreaterThan(20);
  });

  it('keeps every orbit outside real old-town solids and terrace tops at legal rear-house positions',()=>{
    let checked=0;
    const positions:readonly (readonly [number,number])[]=[...([164,168,170.28,172,176].flatMap(x=>[24,25.03,26,28,32].map(z=>[x,z] as const))),[166,31],[168,29],[172,27],[176,26],[170.5,25.5],[173,31.5],[177,32.5]];
    for(const [x,z]of positions){
      const y=terrainHeight(x,z);
      const occupied=STATIC_OBSTACLES.some(box=>y+1.72>box.min[1]&&y<box.max[1]&&x+.279>box.min[0]&&x-.279<box.max[0]&&z+.279>box.min[2]&&z-.279<box.max[2]);
      if(occupied)continue;
      for(const pitch of [-.12,.18,.8])for(let direction=0;direction<8;direction++){
        const c=createTravelController({spawn:[x,y,z],initialYaw:direction*Math.PI/4,initialPitch:pitch,terrainHeight,traceSegment});
        const camera=c.snapshot().camera.position,label=`feet=${[x,y,z]} pitch=${pitch} yaw=${direction*Math.PI/4} camera=${camera}`;
        expect(traceSegment(camera,camera,.299).hit,label).toBe(false);
        expect(camera[1],label).toBeGreaterThanOrEqual(terrainHeight(camera[0],camera[2])+.299);
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(240);
  });
});
