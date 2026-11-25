import type { EntityHandle, World } from '@forgeax/engine/ecs';
import { Transform } from '@forgeax/engine/scene';
import type { TravelStatus } from '../controller/types.ts';

/** The assisted photographer owns a separate viewpoint; the traveller should
 * not also hold a camera. Hide only that prop, keeping the complete pose rig. */
export function portraitCameraProp(world:World,entity:EntityHandle){
  const original=Array.from(world.get(entity,Transform).unwrap().scale) as [number,number,number];
  let disposed=false;
  const write=(scale:readonly[number,number,number])=>{
    const current=world.get(entity,Transform).unwrap().scale;
    if(scale.some((n,i)=>current[i]!==Math.fround(n)))world.set(entity,Transform,{scale}).unwrap();
  };
  return{
    update(status:TravelStatus){
      if(disposed)return;
      write(status.mode==='photo'&&status.photography.settings.mode==='portrait'?[0,0,0]:original);
    },
    dispose(){if(disposed)return;write(original);disposed=true;},
  };
}
