import {describe,expect,it,vi} from 'vitest';
import {AssetRegistry} from '@forgeax/engine/assets-runtime';
import {World} from '@forgeax/engine/ecs';
import {equirectContribution} from '@forgeax/engine/image';
import {Camera,DirectionalLight,Fog,Lines,Materials,MeshFilter,MeshRenderer,ShadowParticipation,Skylight,perspective} from '@forgeax/engine/render';
import {Transform} from '@forgeax/engine/scene';
import type {AssetHandle} from '@forgeax/engine/types';
import {installEnvironment} from '../runtime.ts';
import {skyGradientMaterial,skyGradientValues} from '../sky-gradient.ts';
import {createTravelController} from '../../controller/travel-controller.ts';
import {DEFAULT_PHOTOGRAPHY} from '../../shared/photography-contract.ts';
import {photoSceneFrom} from '../../entry/engine-helper.ts';

describe('native environment component and managed asset integration',()=>{
  it('applies rain/sky/wet material/exposure, freezes them through capture, and records actual camera settings',async()=>{
    const assets=new AssetRegistry();assets.installDecoder(equirectContribution.kind,equirectContribution.decoder);
    const world=new World({assets});
    for(const component of [Transform,Camera,DirectionalLight,Fog,Lines,MeshFilter,MeshRenderer,ShadowParticipation,Skylight])world.components.register(component).unwrap();
    const camera=world.spawn({component:Transform,data:{}},{component:Camera,data:perspective({fov:Math.PI/3,aspect:16/9})}).unwrap();
    const sun=world.spawn({component:DirectionalLight,data:{direction:[0,-1,0]}}).unwrap();
    const skyMaterial=assets.create(skyGradientMaterial).unwrap();
    const ambient=world.spawn({component:Skylight,data:{}}).unwrap(),fog=world.spawn({component:Fog,data:{}}).unwrap();
    const material=assets.create(Materials.standard({baseColor:[.6,.5,.4,1],roughness:.88})).unwrap();
    const copies:AssetHandle<'material'>[]=[];
    const load=vi.spyOn(assets,'load').mockImplementation(async()=>{const result=assets.copy(material);if(result.ok)copies.push(result.value);return result;});
    let environment:Awaited<ReturnType<typeof installEnvironment>>|undefined;
    try{
      environment=await installEnvironment({world,assets,camera,sun,skyMaterial,ambient,fog,wetSurfaces:[{guid:'test-wet',dryColor:[.6,.5,.4,1],dryRoughness:.88,wetColor:[.3,.25,.2,1],wetRoughness:.32}],terrainHeight:()=>0,shelterHeight:()=>undefined});
      const probe=world.get(ambient,Skylight).unwrap().equirect;
      const initialProbe=assets.read(probe).unwrap().data.slice();
      const input={weather:'rain' as const,exposure:.5,position:[0,2,0] as const,delta:.1,frozen:false,paused:false};
      for(let i=0;i<32;i++)environment.update(input);
      const applied=environment.snapshot();expect(applied.weather).toBe('rain');expect(applied.settled).toBe(true);expect(applied.rainVisible).toBeGreaterThan(0);
      expect(world.get(camera,Camera).unwrap().exposure).toBeCloseTo(Math.SQRT2,5);
      expect(world.get(sun,DirectionalLight).unwrap().intensity).toBeCloseTo(.85,5);
      expect(world.get(ambient,Skylight).unwrap().equirect).toBe(probe);
      expect(assets.read(probe).unwrap().data).toEqual(initialProbe);
      expect(assets.read(skyMaterial).unwrap().values).toEqual(skyGradientValues(applied));
      expect(assets.read(copies[0]!).unwrap().values?.roughness).toBeCloseTo(.32,5);
      for(let i=0;i<12;i++)environment.update({...input,weather:'afterglow',exposure:-1,frozen:true});
      const frozen=environment.snapshot();expect(frozen).toEqual({...applied,frozen:true});
      expect(assets.read(skyMaterial).unwrap().values).toEqual(skyGradientValues(applied));
      const controller=createTravelController({spawn:[0,0,0],terrainHeight:()=>0});controller.configurePhotography({...DEFAULT_PHOTOGRAPHY,mode:'portrait',pose:'wave',exposure:.5});controller.toggleCamera();
      const scene=photoSceneFrom(controller.snapshot(),frozen);expect(scene.weather).toBe('rain');expect(scene.exposure).toBe(.5);expect(scene.pose).toBe('wave');expect(scene.subject.visible).toBe(true);expect(scene.camera.position).toEqual(controller.snapshot().camera.position);
      environment.update({...input,weather:'afterglow',exposure:-1});expect(environment.snapshot().exposure).toBe(-1);
    }finally{environment?.dispose();load.mockRestore();assets.release(material).unwrap();assets.dispose();}
  });
});
