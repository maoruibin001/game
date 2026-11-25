import { describe,expect,it } from 'vitest';
import { Camera,perspective } from '@forgeax/engine/render';
import { Transform } from '@forgeax/engine/scene';
import { INPUT_SNAPSHOT_RESOURCE_KEY,createInputSnapshot } from '@forgeax/engine/input';
import { installTravelController } from '../../controller/forgeax-controller.ts';
import { DEFAULT_PHOTOGRAPHY } from '../../shared/photography-contract.ts';
import { pluginFixture } from '../../shared/__tests__/plugin-fixture.ts';
import { portraitCameraProp } from '../portrait-prop.ts';

describe('assisted photograph camera prop visibility',()=>{
  it('hides only the held camera through all native portrait poses and pause, then restores its authored scale',async()=>{
    const {world,ctx,entity}=await pluginFixture();
    world.components.register(Camera).unwrap();world.addComponent(entity('camera'),{component:Camera,data:perspective({fov:Math.PI/3,aspect:16/9})}).unwrap();
    world.insertResource(INPUT_SNAPSHOT_RESOURCE_KEY,createInputSnapshot());
    const prop=world.spawn({component:Transform,data:{scale:[.8,1.2,.6]}}).unwrap(),visibility=portraitCameraProp(world,prop);
    const joints={cameraProp:prop,head:entity('player/joint/Head'),leftArm:entity('player/joint/UpperArm.L'),rightArm:entity('player/joint/UpperArm.R')};
    const original=Array.from(world.get(prop,Transform).unwrap().scale);
    const handle=installTravelController({world,host:ctx.gameHost!,player:entity('player'),camera:entity('camera'),spawn:[0,0,0],terrainHeight:()=>0,joints,onFrame:visibility.update});
    const propScale=()=>Array.from(world.get(prop,Transform).unwrap().scale);
    try{
      for(const pose of ['look','wave','letter'] as const){
        handle.controller.configurePhotography({...DEFAULT_PHOTOGRAPHY,mode:'portrait',pose});
        if(handle.controller.snapshot().mode==='walk')handle.controller.toggleCamera();
        world.update(1/60).unwrap();expect(propScale()).toEqual([0,0,0]);
        for(const part of [entity('player'),joints.head,joints.leftArm,joints.rightArm])expect(Array.from(world.get(part,Transform).unwrap().scale)).toEqual([1,1,1]);
      }
      handle.controller.setPaused(true);for(let i=0;i<5;i++)world.update(1/60).unwrap();expect(propScale()).toEqual([0,0,0]);
      handle.controller.setPaused(false);handle.controller.configurePhotography({...DEFAULT_PHOTOGRAPHY,mode:'landscape'});world.update(1/60).unwrap();expect(propScale()).toEqual(original);
      handle.controller.configurePhotography({...DEFAULT_PHOTOGRAPHY,mode:'portrait'});world.update(1/60).unwrap();expect(propScale()).toEqual([0,0,0]);
      handle.controller.toggleCamera();world.update(1/60).unwrap();expect(propScale()).toEqual(original);
      handle.controller.toggleCamera();world.update(1/60).unwrap();expect(propScale()).toEqual([0,0,0]);
      visibility.dispose();visibility.dispose();expect(propScale()).toEqual(original);
    }finally{handle.dispose();visibility.dispose();world.despawn(prop).unwrap();await ctx.fiber.dispose();}
  });
});
