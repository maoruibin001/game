import { describe,expect,it } from 'vitest';
import { createInputSnapshot, INPUT_SNAPSHOT_RESOURCE_KEY, snapshotFromSample } from '@forgeax/engine/input';
import { Camera,perspective } from '@forgeax/engine/render';
import { createTravelController } from '../travel-controller.ts';
import { installTravelController } from '../forgeax-controller.ts';
import { EMPTY_INPUT,type ControllerOptions,type TraceSegment,type Vec3 } from '../types.ts';
import { pluginFixture } from '../../shared/__tests__/plugin-fixture.ts';

type Box={min:Vec3;max:Vec3};
function solidWorld(boxes:Box[]):Pick<ControllerOptions,'traceSegment'|'resolveMove'> {
  const traceSegment:TraceSegment=(a,b,clearance=0)=>{
    const delta:Vec3=[b[0]-a[0],b[1]-a[1],b[2]-a[2]];let fraction=1;
    for(const box of boxes){
      let entry=0,exit=1;
      for(let axis=0;axis<3;axis++){
        const lo=box.min[axis]!-clearance,hi=box.max[axis]!+clearance;
        if(Math.abs(delta[axis]!)<1e-9){if(a[axis]!<lo||a[axis]!>hi){entry=2;break;}}
        else {const edges=[(lo-a[axis]!)/delta[axis]!,(hi-a[axis]!)/delta[axis]!];entry=Math.max(entry,Math.min(...edges));exit=Math.min(exit,Math.max(...edges));}
      }
      if(entry<=exit)fraction=Math.min(fraction,entry);
    }
    return {hit:fraction<1,fraction,distance:Math.hypot(...delta)*fraction,point:[a[0]+delta[0]*fraction,a[1]+delta[1]*fraction,a[2]+delta[2]*fraction]};
  };
  return {traceSegment,resolveMove:(from,delta,radius=.28,height=1.86)=>{
    const p:[number,number,number]=[...from];
    for(const axis of [0,2] as const){
      const next=p[axis]+delta[axis],other=axis===0?2:0;
      if(!boxes.some(box=>from[1]+height>box.min[1]&&from[1]<box.max[1]&&next+radius>box.min[axis]&&next-radius<box.max[axis]&&p[other]+radius>box.min[other]&&p[other]-radius<box.max[other]))p[axis]=next;
    }
    return p;
  }};
}
const make=(options:Partial<ControllerOptions>={})=>createTravelController({spawn:[0,0,0],initialYaw:Math.PI/2,terrainHeight:()=>0,...options});

describe('jumping and running physics',()=>{
  it.each([.5,.75,1])('walks a %sm grass bank without jumping while tall terrain remains blocked',height=>{
    const c=make({terrainHeight:x=>x>=1?height:0});
    c.submitInput({...EMPTY_INPUT,vertical:1});
    for(let i=0;i<30;i++)c.step(1/60);
    expect(c.snapshot().position[0]).toBeGreaterThan(2);
    expect(c.snapshot().position[1]).toBe(height);
    expect(c.snapshot().grounded).toBe(true);
  });

  it('rejects a grass step when it would push the traveller into a low ceiling',()=>{
    const c=make({...solidWorld([{min:[.7,2.4,-2],max:[3,3,2]}]),terrainHeight:x=>x>=1?1:0});
    c.submitInput({...EMPTY_INPUT,vertical:1});
    for(let i=0;i<60;i++)c.step(1/60);
    expect(c.snapshot().position[0]).toBeLessThan(1);
    expect(c.snapshot().position[1]).toBe(0);
  });
  it('follows a 1.1m ballistic arc, rejects an airborne second jump, and does not auto-jump on landing',()=>{
    const c=make();c.submitInput({...EMPTY_INPUT,jump:true});
    const heights:number[]=[];
    for(let i=0;i<90;i++){
      if(i===10)c.submitInput({...EMPTY_INPUT});
      if(i===11)c.submitInput({...EMPTY_INPUT,jump:true});
      c.step(1/60);heights.push(c.snapshot().position[1]);
    }
    expect(heights[0]).toBeGreaterThan(.09);
    expect(Math.max(...heights)).toBeGreaterThan(1.09);
    expect(Math.max(...heights)).toBeLessThanOrEqual(1.101);
    expect(heights.slice(45).every(y=>y===0)).toBe(true);
    expect(c.snapshot().grounded).toBe(true);expect(c.snapshot().verticalVelocity).toBe(0);
    c.submitInput({...EMPTY_INPUT});c.submitInput({...EMPTY_INPUT,jump:true});c.step(1/60);
    expect(c.snapshot().position[1]).toBeGreaterThan(0);
  });

  it.each([1/60,.1])('sweeps the whole head against a thin ceiling with dt=%s',dt=>{
    const world=solidWorld([{min:[-4,2.4,-4],max:[4,2.48,4]}]),c=make(world);
    c.submitInput({...EMPTY_INPUT,jump:true});let peak=0;
    for(let t=0;t<1.5;t+=dt){c.step(dt);peak=Math.max(peak,c.snapshot().position[1]);expect(c.snapshot().position[1]+1.86).toBeLessThanOrEqual(2.4);}
    expect(peak).toBeGreaterThan(.45);expect(peak).toBeLessThan(.54);
    expect(c.snapshot().position[1]).toBe(0);expect(c.snapshot().grounded).toBe(true);
  });

  it('preserves airborne steering while tall walls still block horizontal movement',()=>{
    const c=make(solidWorld([{min:[1,0,-5],max:[1.2,4,5]}]));
    c.submitInput({...EMPTY_INPUT,jump:true,vertical:1,run:true});let peak=0;
    for(let i=0;i<90;i++){c.step(1/60);peak=Math.max(peak,c.snapshot().position[1]);expect(c.snapshot().position[0]+.28).toBeLessThanOrEqual(1);}
    expect(c.snapshot().position[0]).toBeGreaterThan(.5);expect(peak).toBeGreaterThan(1.09);
    expect(c.snapshot().position[1]).toBe(0);expect(c.snapshot().running).toBe(false);
  });

  it('lands on a low solid platform and remains supported rather than falling through it',()=>{
    const c=make(solidWorld([{min:[1,0,-2],max:[4,.7,2]}]));
    c.submitInput({...EMPTY_INPUT,jump:true,vertical:1});
    for(let i=0;i<100;i++){
      if(c.snapshot().position[0]>=2)c.submitInput({...EMPTY_INPUT});
      c.step(1/60);
    }
    expect(c.snapshot().position[0]).toBeGreaterThan(1.5);
    expect(c.snapshot().position[1]).toBeCloseTo(.715,4);
    expect(c.snapshot().grounded).toBe(true);
    c.submitInput({...EMPTY_INPUT,vertical:1});for(let i=0;i<90;i++)c.step(1/60);
    expect(c.snapshot().position[1]).toBe(0);expect(c.snapshot().grounded).toBe(true);
  });

  it.each([[1,true],[3,false]] as const)('can clear a %sm terrain ledge only when the feet physically rise above it', (ledge,cleared)=>{
    const c=make({terrainHeight:x=>x>=1?ledge:0});c.submitInput({...EMPTY_INPUT,jump:true,vertical:1});
    for(let i=0;i<90;i++)c.step(1/60);
    expect(c.snapshot().position[0]>1).toBe(cleared);
    expect(c.snapshot().position[1]).toBe(cleared?ledge:0);
    expect(c.snapshot().grounded).toBe(true);
  });

  it('freezes airborne motion over pause, suppresses held input on resume, and cancels the arc on restore',()=>{
    const c=make();c.submitInput({...EMPTY_INPUT,jump:true,vertical:1});for(let i=0;i<8;i++)c.step(1/60);
    c.setPaused(true);const frozen=c.snapshot();for(let i=0;i<60;i++)c.step(1/60);
    expect(c.snapshot().position).toEqual(frozen.position);expect(c.snapshot().verticalVelocity).toBe(frozen.verticalVelocity);
    c.setPaused(false);c.submitInput({...EMPTY_INPUT,jump:true,vertical:1});for(let i=0;i<90;i++)c.step(1/60);
    expect(c.snapshot().position[0]).toBe(frozen.position[0]);expect(c.snapshot().position[1]).toBe(0);
    c.submitInput({...EMPTY_INPUT});c.submitInput({...EMPTY_INPUT,jump:true});c.step(1/60);expect(c.snapshot().grounded).toBe(false);
    c.setPaused(true);c.restore([20,0,0]);c.setPaused(false);c.submitInput({...EMPTY_INPUT,jump:true});c.step(1/60);
    expect(c.snapshot().position).toEqual([20,0,0]);expect(c.snapshot().verticalVelocity).toBe(0);
  });

  it('ignores Space during a zipline and carries no held jump into the landing',()=>{
    const a=make(),b=make(),route={start:[0,3,0] as Vec3,end:[12,1,0] as Vec3,speed:10,sag:0};
    expect(a.startZipline(route)).toBe(true);expect(b.startZipline(route)).toBe(true);
    for(let i=0;i<300;i++){a.submitInput({...EMPTY_INPUT,jump:true});a.step(1/60);b.step(1/60);expect(a.snapshot().position).toEqual(b.snapshot().position);}
    expect(a.snapshot().mode).toBe('walk');expect(a.snapshot().grounded).toBe(true);expect(a.snapshot().verticalVelocity).toBe(0);
    a.submitInput({...EMPTY_INPUT});a.submitInput({...EMPTY_INPUT,jump:true});a.step(1/60);
    expect(a.snapshot().grounded).toBe(false);expect(a.startZipline({...route,start:a.snapshot().position})).toBe(false);
  });
});

describe('native Space and Shift input',()=>{
  async function fixture(){
    const {world,ctx,entity}=await pluginFixture();
    world.components.register(Camera).unwrap();world.addComponent(entity('camera'),{component:Camera,data:perspective({fov:Math.PI/3,aspect:16/9})}).unwrap();
    world.insertResource(INPUT_SNAPSHOT_RESOURCE_KEY,createInputSnapshot());const actions:string[]=[];
    const handle=installTravelController({world,host:ctx.gameHost!,player:entity('player'),camera:entity('camera'),spawn:[0,0,0],initialYaw:0,terrainHeight:()=>0,onAction:e=>actions.push(e.type)});
    const frame=(codes:string[]=[],count=1)=>{for(let i=0;i<count;i++){world.insertResource(INPUT_SNAPSHOT_RESOURCE_KEY,snapshotFromSample({downKeys:new Set(),upKeys:new Set(),downCodes:new Set(codes),buttons:[false,false,false],movementX:0,movementY:0,wheelDelta:0,focused:true,pointerLocked:false}));world.update(1/60).unwrap();}};
    return {c:handle.controller,actions,frame,dispose:async()=>{handle.dispose();await ctx.fiber.dispose();}};
  }

  it('runs at 11m/s on either Shift, walks at 6.8m/s, and never reports stationary/photo input as running',async()=>{
    const f=await fixture();try{
      f.frame(['KeyW'],60);expect(f.c.snapshot().speed).toBeCloseTo(6.8,4);expect(f.c.snapshot().running).toBe(false);
      for(const shift of ['ShiftLeft','ShiftRight']){f.frame(['KeyW',shift],60);expect(f.c.snapshot().speed).toBeCloseTo(11,4);expect(f.c.snapshot().running).toBe(true);}
      f.frame(['ShiftLeft']);expect(f.c.snapshot().running).toBe(false);
      f.frame(['KeyC']);f.frame();const before=f.c.snapshot().distanceWalked;f.frame(['KeyW','ShiftLeft'],60);
      expect(f.c.snapshot().distanceWalked-before).toBeCloseTo(2.2,4);expect(f.c.snapshot().running).toBe(false);
    }finally{await f.dispose();}
  });

  it('routes a new Space edge by mode and never turns a held Space into a second-mode action',async()=>{
    const f=await fixture();try{
      f.frame(['Space'],8);expect(f.c.snapshot().position[1]).toBeGreaterThan(0);expect(f.actions).not.toContain('shutter');
      f.frame(['Space','KeyC']);f.frame(['Space'],60);
      expect(f.c.snapshot().mode).toBe('photo');expect(f.actions).not.toContain('shutter');
      f.frame();f.frame(['Space']);expect(f.actions.filter(x=>x==='shutter')).toHaveLength(1);expect(f.c.snapshot().grounded).toBe(true);
      f.frame(['Space','KeyC']);f.frame(['Space'],60);
      expect(f.c.snapshot().mode).toBe('walk');expect(f.c.snapshot().position[1]).toBe(0);
      f.frame();f.frame(['Space']);expect(f.c.snapshot().position[1]).toBeGreaterThan(0);
      expect(f.actions.filter(x=>x==='shutter')).toHaveLength(1);
    }finally{await f.dispose();}
  });
});
