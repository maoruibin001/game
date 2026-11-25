import type { World } from '@forgeax/engine/ecs';
import type { AssetRegistry } from '@forgeax/engine/assets-runtime';
import { MeshFilter, MeshRenderer, PointLight, ShadowParticipation } from '@forgeax/engine/render';
import { Transform } from '@forgeax/engine/scene';
import { worldGuidText } from '../shanye-world/world-refs.ts';
import { SIXTH_ROOM_LAMP } from '../shanye-world/sixth-layout.ts';

export async function installSixthScene(world:World,assets:AssetRegistry){
  const handles=await Promise.all(['old','restored','door','inside'].map(async key=>(await assets.load(worldGuidText(`mesh/photo-shop/${key}`),'mesh')).unwrap()));
  const hidden=[0,-1024,0],shown=[0,0,0];
  const entities=handles.map((assetHandle,index)=>world.spawn(
    {component:Transform,data:{pos:index===0?shown:hidden}},{component:MeshFilter,data:{assetHandle}},
    {component:MeshRenderer,data:{materials:[]}},{component:ShadowParticipation,data:{cast:false,receive:false}},
  ).unwrap());
  const lamp=world.spawn({component:Transform,data:{pos:[...SIXTH_ROOM_LAMP]}},
    {component:PointLight,data:{color:[1,.74,.44],intensity:0,range:3.45}}).unwrap();
  let previous=false, wasClosed=false, wasInside=false;
  return {
    update(restored:boolean,closed:boolean,inside:boolean){
      if(wasInside!==inside){
        wasInside=inside;
        world.set(lamp,PointLight,{intensity:inside?2.35:0}).unwrap();
      }
      if(previous!==restored){
        previous=restored;
        world.set(entities[0]!,Transform,{pos:restored?hidden:shown}).unwrap();
        world.set(entities[1]!,Transform,{pos:restored?shown:hidden}).unwrap();
        world.set(entities[3]!,Transform,{pos:restored?shown:hidden}).unwrap();
      }
      if(wasClosed!==closed){
        wasClosed=closed;
        world.set(entities[2]!,Transform,{pos:closed?shown:hidden}).unwrap();
      }
    },
    dispose(){
      world.despawn(lamp).unwrap();
      for(const entity of entities)world.despawn(entity).unwrap();
      for(const asset of handles)assets.release(asset).unwrap();
    },
  };
}
