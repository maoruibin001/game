import { createInputSnapshot, INPUT_SNAPSHOT_RESOURCE_KEY, snapshotFromSample } from '@forgeax/engine/input';
import { Camera,perspective } from '@forgeax/engine/render';
import { Transform } from '@forgeax/engine/scene';
import { describe,expect,it } from 'vitest';
import { pluginFixture } from '../../shared/__tests__/plugin-fixture.ts';
import { installTravelController,sampleTravelInput,TRAVEL_CAMERA_SYSTEM,TRAVEL_INPUT_SYSTEM,TRAVEL_MOVE_SYSTEM } from '../forgeax-controller.ts';
import { DEFAULT_PHOTOGRAPHY,LENS_FOV } from '../../shared/photography-contract.ts';

describe('native ForgeaX 0.5.0 controller adapter',()=>{
  it('keeps action taps released before the next frame without inventing movement',()=>{
    const snapshot = snapshotFromSample({
      downKeys:new Set(),upKeys:new Set(),downCodes:new Set(),
      pressedCodes:new Set(['KeyC','Space','KeyE','Escape','KeyM','KeyJ','KeyW','ShiftLeft']),
      buttons:[false,false,false],pressedButtons:[true,false,false],
      movementX:0,movementY:0,wheelDelta:0,focused:true,pointerLocked:false,
    });
    expect(sampleTravelInput(snapshot,'photo')).toMatchObject({
      camera:true,jump:true,interact:true,pause:true,map:true,journal:true,shutter:false,
      vertical:0,horizontal:0,run:false,lookActive:false,
    });
  });

  it('lets the left button aim without firing and retains the dedicated F shortcut',()=>{
    const sample={downKeys:new Set<string>(),upKeys:new Set<string>(),downCodes:new Set<string>(),
      buttons:[true,false,false] as const,pressedButtons:[false,false,false] as const,
      movementX:16,movementY:-4,wheelDelta:0,focused:true,pointerLocked:false};
    expect(sampleTravelInput(snapshotFromSample({...sample,pressedButtons:[true,false,false]}),'photo')).toMatchObject({lookActive:false,shutter:false});
    expect(sampleTravelInput(snapshotFromSample(sample),'photo')).toMatchObject({lookActive:true,lookX:16,lookY:-4,shutter:false});
    expect(sampleTravelInput(snapshotFromSample({...sample,pressedCodes:new Set(['KeyF'])}),'photo').shutter).toBe(true);
  });

  it('observes each native sample before submission without exposing the submitted frame to mutation',async()=>{
    const {world,ctx,entity}=await pluginFixture();
    world.components.register(Camera).unwrap();world.addComponent(entity('camera'),{component:Camera,data:perspective({fov:Math.PI/3,aspect:16/9})}).unwrap();
    const source=snapshotFromSample({downKeys:new Set(),upKeys:new Set(),downCodes:new Set(['Space','KeyC','ShiftLeft']),buttons:[false,false,true],movementX:2,movementY:3,wheelDelta:0,focused:true,pointerLocked:false});
    world.insertResource(INPUT_SNAPSHOT_RESOURCE_KEY,source);
    const seen:{jump:boolean;camera:boolean;run:boolean;shutter:boolean;lookActive:boolean;mode:string;sameSource:boolean}[]=[];
    const handle=installTravelController({world,host:ctx.gameHost!,player:entity('player'),camera:entity('camera'),spawn:[0,0,0],terrainHeight:()=>0,onInputSample(frame,snapshot){
      seen.push({jump:frame.jump,camera:frame.camera,run:frame.run,shutter:frame.shutter,lookActive:frame.lookActive,mode:handle.controller.snapshot().mode,sameSource:snapshot===source});
      // Diagnostic observers receive a copy, never an input injection handle.
      frame.horizontal=1;frame.camera=false;
    }});
    try{
      world.update(1/60).unwrap();
      expect(seen).toEqual([{jump:true,camera:true,run:true,shutter:false,lookActive:true,mode:'walk',sameSource:true}]);
      expect(handle.controller.snapshot().mode).toBe('photo');expect(handle.controller.snapshot().distanceWalked).toBe(0);
      world.update(1/60).unwrap();expect(seen).toHaveLength(2);
    }finally{handle.dispose();await ctx.fiber.dispose();}
  });

  it('installs engine systems, writes native player/camera state and restores visibility on cleanup',async()=>{
    const {world,ctx,entity}=await pluginFixture();
    world.components.register(Camera).unwrap();world.addComponent(entity('camera'),{component:Camera,data:perspective({fov:Math.PI/3,aspect:16/9})}).unwrap();
    world.insertResource(INPUT_SNAPSHOT_RESOURCE_KEY,createInputSnapshot());
    const handle=installTravelController({world,host:ctx.gameHost!,player:entity('player'),camera:entity('camera'),spawn:[10,0,20],terrainHeight:()=>7,initialYaw:Math.PI});
    try{
      world.update(1/60).unwrap();
      expect(Array.from(world.get(entity('player'),Transform).unwrap().pos)).toEqual([10,7,20]);
      const pose=world.get(entity('camera'),Transform).unwrap();expect(pose.pos[1]).toBeGreaterThan(8);expect(pose.pos[2]).toBeLessThan(20);
      handle.controller.toggleCamera();world.update(1/60).unwrap();
      expect(world.get(entity('player'),Transform).unwrap().scale[0]).toBeLessThan(.001);
      expect(world.get(entity('camera'),Transform).unwrap().pos[1]).toBeCloseTo(8.64,4);
      handle.dispose();expect(Array.from(world.get(entity('player'),Transform).unwrap().scale)).toEqual([1,1,1]);
      const names=world.inspect().systems.map(s=>s.name);for(const name of [TRAVEL_INPUT_SYSTEM,TRAVEL_MOVE_SYSTEM,TRAVEL_CAMERA_SYSTEM])expect(names).not.toContain(name);
    }finally{handle.dispose();await ctx.fiber.dispose();}
  });
  it('writes three distinguishable native poses, reveals the held letter and freezes the rendered transforms',async()=>{
    const {world,ctx,entity}=await pluginFixture();
    world.components.register(Camera).unwrap();world.addComponent(entity('camera'),{component:Camera,data:perspective({fov:Math.PI/3,aspect:16/9})}).unwrap();world.insertResource(INPUT_SNAPSHOT_RESOURCE_KEY,createInputSnapshot());
    const joints={head:entity('player/joint/Head'),leftArm:entity('player/joint/UpperArm.L'),rightArm:entity('player/joint/UpperArm.R'),letterProp:entity('player/joint/Foot.L')};
    const handle=installTravelController({world,host:ctx.gameHost!,player:entity('player'),camera:entity('camera'),spawn:[0,0,0],initialYaw:0,terrainHeight:()=>0,joints});
    const q=()=>Array.from(world.get(joints.rightArm,Transform).unwrap().quat);
    try{
      handle.controller.configurePhotography({...DEFAULT_PHOTOGRAPHY,mode:'portrait'});handle.controller.toggleCamera();world.update(1/60).unwrap();const look=q();
      expect(Array.from(world.get(entity('player'),Transform).unwrap().scale)).toEqual([1,1,1]);
      handle.controller.configurePhotography({...DEFAULT_PHOTOGRAPHY,mode:'portrait',pose:'wave'});world.update(1/60).unwrap();const wave=q();expect(wave).not.toEqual(look);
      handle.controller.configurePhotography({...DEFAULT_PHOTOGRAPHY,mode:'portrait',pose:'letter',lens:'standard'});world.update(1/60).unwrap();expect(q()).not.toEqual(wave);expect(Array.from(world.get(joints.letterProp,Transform).unwrap().scale)).toEqual([1,1,1]);expect(world.get(entity('camera'),Camera).unwrap().fov).toBeCloseTo(LENS_FOV.standard);
      handle.controller.setPaused(true);const frozen=q(),camera=Array.from(world.get(entity('camera'),Transform).unwrap().pos),head=Array.from(world.get(joints.head,Transform).unwrap().quat);
      for(let i=0;i<40;i++)world.update(1/60).unwrap();expect(q()).toEqual(frozen);expect(Array.from(world.get(joints.head,Transform).unwrap().quat)).toEqual(head);expect(Array.from(world.get(entity('camera'),Transform).unwrap().pos)).toEqual(camera);
      // A pose change and capture may be delivered before one native Update.
      // That completed frame must contain the new frozen pose, never the old letter.
      handle.controller.setPaused(false);handle.controller.configurePhotography({...DEFAULT_PHOTOGRAPHY,mode:'portrait',pose:'wave',lens:'detail'});handle.controller.setPaused(true);world.update(1/60).unwrap();
      expect(q()).not.toEqual(frozen);expect(Array.from(world.get(joints.letterProp,Transform).unwrap().scale)).toEqual([0,0,0]);expect(world.get(entity('camera'),Camera).unwrap().fov).toBeCloseTo(LENS_FOV.detail);
      const newlyFrozen=q();for(let i=0;i<10;i++)world.update(1/60).unwrap();expect(q()).toEqual(newlyFrozen);
    }finally{handle.dispose();await ctx.fiber.dispose();}
  });
});
