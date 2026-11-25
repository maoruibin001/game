import { AssetGuid } from '@forgeax/engine/pack/guid';
import { definePackageId } from '@forgeax/engine/pack/source';
import { sceneEntity, worldResolveSceneEntity } from '@forgeax/engine/scene';
import type { EntityHandle, World } from '@forgeax/engine/ecs';
export const WORLD_PACKAGE_ID=definePackageId('01a1e000-6600-7000-8000-000000000050');
export const WORLD_SCENE_SOURCE_KEY='scene/shanye-valley';
export const worldAsset=(key:string)=>AssetGuid.derive(WORLD_PACKAGE_ID,key);
export const worldGuidText=(key:string)=>AssetGuid.format(worldAsset(key));
export const WORLD_SCENE_GUID=worldGuidText(WORLD_SCENE_SOURCE_KEY);
export const WORLD_ENTITY_KEYS={
  player:'traveler',body:'traveler/body',head:'traveler/head',leftArm:'traveler/left-arm',rightArm:'traveler/right-arm',leftLeg:'traveler/left-leg',rightLeg:'traveler/right-leg',leftShoe:'traveler/left-shoe',rightShoe:'traveler/right-shoe',cameraProp:'traveler/camera',letterProp:'traveler/letter',
  sails:'hero/forest-windmill/windmill-sails',curtain:'hero/forest-windmill/windmill-curtain',gate:'hero/town-street/town-gate',bridge:'hero/town-street/town-bridge',
  lampWest:'hero/town-street/town-lamp-west',lampEast:'hero/town-street/town-lamp-east',flag:'hero/ridge-station/ridge-flag',
  courtyardBell:'hero/town-courtyard/town-courtyard-bell',
  bird0:'ambient/bird-0',bird1:'ambient/bird-1',bird2:'ambient/bird-2',bird3:'ambient/bird-3',
  forestLunch:'props/forest-lunch-tin',
  valleyLetterFolded:'props/valley-letter-folded',valleyLetterOpened:'props/valley-letter-opened',
} as const;
export function resolveWorldEntity(world:World,root:EntityHandle,key:string):EntityHandle{
  const r=worldResolveSceneEntity(world,root,sceneEntity(WORLD_SCENE_SOURCE_KEY,key));if(!r.ok)throw r.error;return r.value;
}
