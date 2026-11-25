import {describe,expect,it,vi} from 'vitest';
import {AssetRegistry} from '@forgeax/engine/assets-runtime';
import {World,type EntityHandle} from '@forgeax/engine/ecs';
import {equirectContribution} from '@forgeax/engine/image';
import {Camera,DirectionalLight,Fog,Lines,MeshFilter,MeshRenderer,ShadowParticipation,Skylight,perspective} from '@forgeax/engine/render';
import {Transform} from '@forgeax/engine/scene';
import {advanceDayClock,createDayClock,DAYLIGHT} from '../../journey/day-clock.ts';
import {installEnvironment,presentedSolarPosition} from '../runtime.ts';
import {skyGradientMaterial,skyGradientValues} from '../sky-gradient.ts';
import {clockWeatherValues,solarPosition} from '../weather.ts';
import {SUN_DISC_RADIUS} from '../sun-disc.ts';

function fixture(){
  const assets=new AssetRegistry();assets.installDecoder(equirectContribution.kind,equirectContribution.decoder);
  const world=new World({assets});
  for(const component of [Transform,Camera,DirectionalLight,Fog,Lines,MeshFilter,MeshRenderer,ShadowParticipation,Skylight])world.components.register(component).unwrap();
  const camera=world.spawn({component:Transform,data:{pos:[64,85.72,204]}},{component:Camera,data:perspective({fov:Math.PI/3,aspect:16/9,far:1900})}).unwrap();
  const sun=world.spawn({component:DirectionalLight,data:{direction:[0,-1,0]}}).unwrap();
  const skyMaterial=assets.create(skyGradientMaterial).unwrap();
  const ambient=world.spawn({component:Skylight,data:{}}).unwrap(),fog=world.spawn({component:Fog,data:{}}).unwrap();
  return {world,assets,camera,sun,skyMaterial,ambient,fog,wetSurfaces:[],terrainHeight:()=>0,shelterHeight:()=>undefined};
}
describe('native clock environment without a GPU claim',()=>{
  it.each([
    {weather:'morning' as const,near:280,far:1400,opacity:.369},
    {weather:'rain' as const,near:105,far:820,opacity:.4674},
    {weather:'afterglow' as const,near:240,far:1300,opacity:.369},
  ])('writes bounded $weather aerial-depth distances into native Fog',async({weather,near,far,opacity})=>{
    const f=fixture(),environment=await installEnvironment({...f,initial:weather,initialClock:{day:1,minute:930}});
    try{
      const fog=f.world.get(f.fog,Fog).unwrap();
      expect(fog.near).toBe(near);expect(fog.far).toBe(far);expect(fog.maxOpacity).toBeCloseTo(opacity,6);
      const snapshot=environment.snapshot();
      for(let channel=0;channel<3;channel++)expect(fog.color[channel]).toBeCloseTo(snapshot.fogColor[channel]!,6);
      // Native near/far now match the reported source distances, with the existing
      // opacity cap retained. No new pass, asset or weather timing is introduced.
      expect(snapshot.fogNear).toBe(fog.near);expect(snapshot.fogFar).toBe(fog.far);
      expect(f.assets.read(f.skyMaterial).unwrap().values).toMatchObject({zenith:snapshot.zenith,horizon:snapshot.horizon,ground:snapshot.ground});
    }finally{environment.dispose();f.assets.dispose();}
  });
  it('updates settled real light/sky/disc with time, freezes pauses and captures, resumes and releases native owned resources',async()=>{
    const f=fixture(),spawn=vi.spyOn(f.world,'spawn'),create=vi.spyOn(f.assets,'create'),release=vi.spyOn(f.assets,'release'),despawn=vi.spyOn(f.world,'despawn');
    const environment=await installEnvironment({...f,initialClock:{day:1,minute:930}});
    try{
      const disc=spawn.mock.results[2]!.value.unwrap() as EntityHandle;
      const initial=environment.snapshot();expect(initial.clock).toEqual({day:1,minute:930});expect(initial.sunDisc.visible).toBe(true);
      expect(f.world.get(f.sun,DirectionalLight).unwrap().shadowIntensity).toBeCloseTo(.84,5);
      expect(initial.fillIntensity).toBeCloseTo(1.0296,8);expect(f.world.get(f.ambient,Skylight).unwrap().intensity).toBeCloseTo(1.0296,5);
      expect(Array.from(f.world.get(disc,Transform).unwrap().scale)).toEqual([SUN_DISC_RADIUS,SUN_DISC_RADIUS,SUN_DISC_RADIUS]);
      expect(f.world.get(disc,ShadowParticipation).unwrap().cast).toBe(false);
      const discMaterial=f.world.get(disc,MeshRenderer).unwrap().materials[0]!;
      expect(f.assets.read(discMaterial).unwrap().passes![0]!.program.module).toBe('forgeax_material::unlit');
      expect(f.assets.read(discMaterial).unwrap().passes![0]!.renderState?.depthWriteEnabled).toBe(true);
      const skyHandle=f.world.get(f.ambient,Skylight).unwrap().equirect;
      const skyBefore=f.assets.read(skyHandle).unwrap().data.slice();
      const gradientBefore=f.assets.read(f.skyMaterial).unwrap().values;
      expect(gradientBefore?.sunAir).toBeCloseTo(1,6);
      const input={weather:'morning' as const,clock:{day:1,minute:1080},exposure:0,position:[64,85.72,204] as const,delta:.1,frozen:false,paused:false};
      environment.update(input);environment.update(input);
      const evening=environment.snapshot();expect(evening.settled).toBe(true);expect(evening.clock).toEqual(input.clock);
      expect(evening.sunDirection).not.toEqual(initial.sunDirection);
      expect(f.assets.read(f.skyMaterial).unwrap().values).not.toEqual(gradientBefore);
      expect(f.assets.read(f.skyMaterial).unwrap().values).toMatchObject({zenith:evening.zenith,horizon:evening.horizon,ground:evening.ground});
      expect(f.world.get(f.ambient,Skylight).unwrap().equirect).toBe(skyHandle);
      expect(f.assets.read(skyHandle).unwrap().data).toEqual(skyBefore);
      expect(Array.from(f.world.get(disc,Transform).unwrap().pos)).toEqual(evening.sunDisc.position);
      const solar=solarPosition(input.clock);expect(evening.sunDirection).toEqual(solar.direction.map(n=>-n));
      expect(evening.sunDisc.position[0]).toBeLessThan(64);expect(evening.sunDisc.position[2]).toBeLessThan(204);
      const sunBefore={...f.world.get(f.sun,DirectionalLight).unwrap()};
      environment.update({...input,clock:{day:2,minute:720},weather:'rain',position:[100,100,100],exposure:1,paused:true});
      expect(environment.snapshot()).toEqual(evening);
      expect(f.assets.read(f.skyMaterial).unwrap().values).toMatchObject({zenith:evening.zenith,horizon:evening.horizon,ground:evening.ground});
      environment.update({...input,clock:{day:2,minute:720},weather:'rain',position:[100,100,100],exposure:1,frozen:true});
      expect(environment.snapshot()).toEqual({...evening,frozen:true});expect(f.world.get(f.sun,DirectionalLight).unwrap()).toEqual(sunBefore);
      for(let i=0;i<32;i++)environment.update({...input,clock:{day:2,minute:720},weather:'rain'});
      expect(f.world.get(f.sun,DirectionalLight).unwrap().shadowIntensity).toBeCloseTo(.22,5);
      expect(f.assets.read(f.skyMaterial).unwrap().values?.sunAir).toBe(0);
      const rainy=environment.snapshot();expect(rainy.clock).toEqual({day:2,minute:720});expect(rainy.rainVisible).toBeGreaterThan(0);expect(rainy.sunDisc.visible).toBe(false);
      expect(Array.from(f.world.get(disc,Transform).unwrap().scale)).toEqual([0,0,0]);
      for(let i=0;i<32;i++)environment.update({...input,clock:{day:2,minute:0}});
      const night=environment.snapshot();expect(night.sunDisc.visible).toBe(false);expect(night.sunIntensity).toBeGreaterThanOrEqual(.19);expect(night.fillIntensity).toBeGreaterThanOrEqual(1.1);
      expect(night.fillIntensity).toBeCloseTo(1.1,8);expect(f.world.get(f.ambient,Skylight).unwrap().intensity).toBeCloseTo(1.1,5);
      expect(f.assets.read(f.skyMaterial).unwrap().values).toEqual(skyGradientValues(night,0));
      expect(f.assets.read(skyHandle).unwrap().data).toEqual(skyBefore);
      release.mockClear();environment.dispose();const released=release.mock.calls.map(args=>args[0]);
      for(const result of create.mock.results)expect(released).toContain(result.value.unwrap());
      const releaseCount=release.mock.calls.length;environment.dispose();expect(despawn).toHaveBeenCalledTimes(3);expect(release).toHaveBeenCalledTimes(releaseCount);
      expect(f.world.get(disc,Transform).ok).toBe(false);expect(f.assets.read(discMaterial).ok).toBe(false);
    }finally{environment.dispose();f.assets.dispose();}
  });
  it('holds the rendered opening sun while the clock and weather advance, then joins the normal trajectory', async () => {
    const f=fixture(),opening=createDayClock(),position=[64,85.72,204] as const;
    const environment=await installEnvironment({...f,initialClock:opening,initialPosition:position});
    const tick=(clock: typeof opening, weather:'morning'|'rain'='morning')=>{
      for(let i=0;i<2;i++)environment.update({weather,clock,position,delta:.1,exposure:0,frozen:false,paused:false});
      return environment.snapshot();
    };
    try{
      const initial=environment.snapshot(),direction=Array.from(f.world.get(f.sun,DirectionalLight).unwrap().direction);
      const afterTwelveSeconds=advanceDayClock(opening,12);
      const held=tick(afterTwelveSeconds);
      expect(held.clock).toEqual(afterTwelveSeconds);
      expect(held.sunDisc.position).toEqual(initial.sunDisc.position);
      expect(Array.from(f.world.get(f.sun,DirectionalLight).unwrap().direction)).toEqual(direction);
      const raw=clockWeatherValues(afterTwelveSeconds,{morning:1,rain:0,afterglow:0});
      expect(held.sunIntensity).toBeGreaterThan(raw.sunIntensity * 1.15);
      expect(held.fillIntensity).toBeLessThan(raw.fillIntensity * .8);
      expect(held.fogNear).toBeLessThan(150);
      expect(held.sunDirection[0]).toBeLessThan(-.55);
      expect(held.horizon).toEqual(raw.horizon);
      expect(held.sunDirection).not.toEqual(raw.sunDirection);
      for(let i=0;i<13;i++)tick(afterTwelveSeconds,'rain');
      const rain = environment.snapshot();
      expect(rain.rainVisible).toBeGreaterThan(0);
      expect(rain.sunIntensity).toBeCloseTo(clockWeatherValues(afterTwelveSeconds,{morning:0,rain:1,afterglow:0}).sunIntensity);
      expect(rain.sunDirection).toEqual(held.sunDirection);

      const directionAt=(offset:number)=>tick({day:1,minute:opening.minute+offset}).sunDirection;
      expect(directionAt(25)).not.toEqual(held.sunDirection);
      const distance=(a: readonly number[],b: readonly number[])=>Math.hypot(...a.map((v,i)=>v-b[i]!));
      for(const join of [-40,-20,20,40]) {
        expect(distance(directionAt(join-.001),directionAt(join+.001))).toBeLessThan(.00002);
      }
      for(const clock of [{day:1,minute:opening.minute+40},{day:1,minute:DAYLIGHT.sunset},{day:2,minute:opening.minute+3}]) {
        expect(tick(clock).sunDirection).toEqual(presentedSolarPosition(clock).direction.map(v=>-v));
      }
      expect(tick({day:2,minute:0}).sunDisc.visible).toBe(false);
    }finally{environment.dispose();f.assets.dispose();}
  });
  it('releases the sun mesh/material/entity as well as rain/sky if wet material loading fails',async()=>{
    const f=fixture(),create=vi.spyOn(f.assets,'create'),despawn=vi.spyOn(f.world,'despawn');
    vi.spyOn(f.assets,'load').mockRejectedValue(new Error('test wet load failure'));
    try{
      await expect(installEnvironment({...f,initialClock:{day:1,minute:1080},wetSurfaces:[{guid:'missing',dryColor:[1,1,1,1],dryRoughness:1}]})).rejects.toThrow('test wet load failure');
      expect(despawn).toHaveBeenCalledTimes(3);
      for(const result of create.mock.results)expect(f.assets.read(result.value.unwrap()).ok).toBe(false);
    }finally{f.assets.dispose();}
  });
});
