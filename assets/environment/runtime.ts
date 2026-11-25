import type { AssetRegistry } from '@forgeax/engine/assets-runtime';
import type { EntityHandle, World } from '@forgeax/engine/ecs';
import { Camera, DirectionalLight, Fog, FogModeValue, Lines, LineWidthUnitsValue, Materials, MeshFilter, MeshRenderer, ShadowParticipation, Skylight } from '@forgeax/engine/render';
import { Transform } from '@forgeax/engine/scene';
import { RenderQueue, type AssetHandle, type MaterialValue } from '@forgeax/engine/types';
import type { WeatherId } from '../shared/photography-contract.ts';
import { distance } from '../controller/geometry.ts';
import type { CameraPose, Vec3 } from '../controller/types.ts';
import { createDayClock, DAYLIGHT, GAME_MINUTES_PER_REAL_SECOND, type JourneyClock } from '../journey/day-clock.ts';
import { createRainField } from './rain.ts';
import { createWeatherTransition, makeWeatherSky, solarPosition, type AppliedWeather, type EnvironmentSnapshot, type SolarPosition } from './weather.ts';
import { sunDiscMesh,sunDiscShape } from './sun-disc.ts';
import { skyFillColor, skyGradientMesh, skyGradientValues } from './sky-gradient.ts';

export interface WetSurface {
  guid:string;dryColor:readonly[number,number,number,number];dryRoughness:number;
  wetColor?:readonly[number,number,number,number];wetRoughness?:number;
}
export interface NightLightSurface {
  guid:string;emissive:readonly[number,number,number];maxIntensity:number;
}
export interface EnvironmentOptions {
  world:World;assets:AssetRegistry;camera:EntityHandle;sun:EntityHandle;skyMaterial:AssetHandle<'material'>;ambient:EntityHandle;fog:EntityHandle;
  wetSurfaces:readonly WetSurface[];nightLights?:readonly NightLightSurface[];
  terrainHeight:(x:number,z:number)=>number;shelterHeight:(x:number,z:number)=>number|undefined;
  cloud?:EntityHandle;initial?:WeatherId;
  initialClock?:JourneyClock;initialPosition?:Vec3;
}
const openingMinute = createDayClock().minute;
const openingSunHold = 30 * GAME_MINUTES_PER_REAL_SECOND;
const normalSolarTrack = 40;

const ease = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

function clearAfternoon(weather: AppliedWeather) {
  const minute = weather.clock?.minute ?? 0;
  return ease((minute - 650) / 100) * ease((930 - minute) / 125) * weather.sunVisibility;
}

/** Let the afternoon beam approach across the porch before rejoining the evening arc. */
export function presentedSolarPosition(clock: JourneyClock): SolarPosition {
  if (clock.minute <= DAYLIGHT.sunrise || clock.minute >= 930) return solarPosition(clock);
  const phase = (clock.minute - DAYLIGHT.sunrise) / (DAYLIGHT.sunset - DAYLIGHT.sunrise);
  const blend = ease((clock.minute - 800) / 130);
  const authoredPhase = phase ** 2.45;
  const azimuth = (authoredPhase + (phase - authoredPhase) * blend) * Math.PI * .75;
  const elevation = solarPosition(clock).elevation * (.72 + .28 * blend);
  return { direction: [Math.cos(azimuth) * Math.cos(elevation), Math.sin(elevation),
    -Math.sin(azimuth) * Math.cos(elevation)], elevation };
}

function presentSun(weather: AppliedWeather): AppliedWeather {
  const clock = weather.clock;
  if (!clock || !weather.solar || weather.solar.elevation < 0) return weather;

  // Hold the opening beam for thirty seconds. The simulation clock and weather
  // continue, and both sides of the hold ease back into the same live trajectory.
  const offset = clock.minute - openingMinute;
  const distance = Math.abs(offset);
  const minute = clock.day === 1 && distance < normalSolarTrack
    ? openingMinute + offset * ease((distance - openingSunHold) / (normalSolarTrack - openingSunHold))
    : clock.minute;
  const solar = presentedSolarPosition({ day: clock.day, minute });
  const [x, y, z] = solar.direction;
  const clear = clearAfternoon(weather);
  const clearDay = ease(solar.elevation / .28) * weather.sunVisibility;
  const fogColor = weather.fogColor.map((channel, i) => channel + ([.25, .37, .52][i]! - channel) * .36 * clear) as unknown as AppliedWeather['fogColor'];
  return {
    ...weather, solar, sunDirection: [-x, -y, -z],
    sunIntensity: weather.sunIntensity * (1 + .18 * clear) * (1 + .11 * clearDay),
    fillIntensity: weather.fillIntensity * (1 - .34 * clear) * (1 - .12 * clearDay),
    fogColor, fogNear: weather.fogNear - 145 * clear,
    fogFar: weather.fogFar - 350 * clear, fogOpacity: weather.fogOpacity + .23 * clear,
  };
}

export async function installEnvironment(options:EnvironmentOptions){
  const {world,assets,camera,sun,skyMaterial,ambient,fog}=options,initial=options.initial??'morning';
  const transition=createWeatherTransition(initial),owned:AssetHandle[]=[],entities:EntityHandle[]=[];
  const releaseOwned=()=>{for(const entity of [...entities].reverse())world.despawn(entity).unwrap();for(const handle of [...owned].reverse())assets.release(handle).unwrap();};
  try{
  const initialValues=presentSun(transition.step(initial,0,false,options.initialClock));
  const skyProbe=assets.create(makeWeatherSky(initialValues)).unwrap();owned.push(skyProbe);
  const probeColor=skyFillColor(initialValues);
  const skyMesh=assets.create(skyGradientMesh()).unwrap();owned.push(skyMesh);
  const sky=world.spawn({component:Transform,data:{pos:options.initialPosition??world.get(camera,Transform).unwrap().pos}},
    {component:MeshFilter,data:{assetHandle:skyMesh}},{component:MeshRenderer,data:{materials:[skyMaterial]}},
    {component:ShadowParticipation,data:{cast:false,receive:false}}).unwrap();entities.push(sky);
  const rain=createRainField(options);rain.update([0,18,-230],0,0);
  const rainMesh=assets.create(rain.mesh()).unwrap();owned.push(rainMesh);
  const rainMaterial=assets.create(Materials.unlit([1,1,1,1],{queue:RenderQueue.Transparent,renderState:{depthWriteEnabled:false,blend:{color:{srcFactor:'src-alpha',dstFactor:'one-minus-src-alpha',operation:'add'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'}}}})).unwrap();owned.push(rainMaterial);
  const rainEntity=world.spawn({component:Transform,data:{scale:[0,0,0]}},{component:MeshFilter,data:{assetHandle:rainMesh}},{component:MeshRenderer,data:{materials:[rainMaterial]}},{component:Lines,data:{width:.0045,widthUnits:LineWidthUnitsValue.world}},{component:ShadowParticipation,data:{cast:false,receive:false}}).unwrap();entities.push(rainEntity);
  const discMesh=assets.create(sunDiscMesh()).unwrap();owned.push(discMesh);
  const discMaterialSource=Materials.unlit([2.7,2.05,1.28,1],{renderState:{depthWriteEnabled:true}});
  const discMaterial=assets.create(discMaterialSource).unwrap();owned.push(discMaterial);
  const discEntity=world.spawn({component:Transform,data:{scale:[0,0,0]}},{component:MeshFilter,data:{assetHandle:discMesh}},{component:MeshRenderer,data:{materials:[discMaterial]}},{component:ShadowParticipation,data:{cast:false,receive:false}}).unwrap();entities.push(discEntity);
  const wet=[] as {source:WetSurface;handle:AssetHandle<'material'>;values:Record<string,MaterialValue|null>}[];
  for(const source of options.wetSurfaces){const handle=(await assets.load(source.guid,'material')).unwrap();owned.push(handle);wet.push({source,handle,values:{...assets.read(handle).unwrap().values}});}
  const nightLights=[] as {source:NightLightSurface;handle:AssetHandle<'material'>;values:Record<string,MaterialValue|null>}[];
  for(const source of options.nightLights??[]){
    const loaded=assets.load(source.guid,'material');
    const resolved=await loaded;
    if(resolved.ok){owned.push(resolved.value);nightLights.push({source,handle:resolved.value,values:{...assets.read(resolved.value).unwrap().values}});}
  }
  const {solar:initialSolar,sunVisibility:initialVisibility,...initialApplied}=initialValues;
  let snapshot:EnvironmentSnapshot={...initialApplied,weather:initial,from:initial,blend:1,settled:true,exposure:0,revision:0,frozen:false,rainVisible:0,sheltered:false,sunDisc:sunDiscShape([0,0,0],undefined,0)};
  let skyElapsed=1,rainElapsed=0,cloudClock=0,lastRain=false,disposed=false;
  let lastSkyMinute:number|undefined=initialValues.clock?.minute,lastSkyDay:number|undefined=initialValues.clock?.day,lastSkyWeather:WeatherId|undefined=initial;
  let appliedSolar:SolarPosition|undefined=initialSolar,appliedSunVisibility=initialVisibility;
  const cloudBase=options.cloud?Array.from(world.get(options.cloud,Transform).unwrap().pos):undefined;
  function applyDirectSun(next: AppliedWeather) {
    // A low sun casts very long shadows. Let terrain contrast fade as the
    // horizon or cloud cover reduces the direct beam.
    const elevation = next.solar ? Math.max(0, Math.min(1, next.solar.elevation / .23)) : 1;
    const beam = (next.solar ? next.sunVisibility : 1 - next.wetness) * elevation * elevation * (3 - 2 * elevation);
    world.set(sun,DirectionalLight,{
      direction:next.sunDirection,color:next.sunColor,intensity:next.sunIntensity,shadowIntensity:.22+.62*beam+.08*clearAfternoon(next),
    }).unwrap();
  }
  function applyEnvironment(next:AppliedWeather){
    // Reuse the baked probe. The visible gradient and ambient tint remain live
    // while the renderer continues presenting the same environment resources.
    const sunAir = next.solar ? next.sunVisibility * ease(next.solar.elevation/.08) : 0;
    assets.update(skyMaterial,{values:skyGradientValues(next,sunAir)}).unwrap();
    const clear=clearAfternoon(next);
    const color=skyFillColor(next).map((value,index)=>value/probeColor[index]! * (1 + clear * [-.10, -.025, .035][index]!));
    world.set(ambient,Skylight,{equirect:skyProbe,color,intensity:next.fillIntensity}).unwrap();
    applyDirectSun(next);
    // Use the authored weather distances: the previous extra 1.45/1.25 scales
    // kept mid/far valley slopes almost as crisp as the foreground. Retain the
    // bounded opacity, so nearby landmarks stay clear and weather stays distinct.
    world.set(fog,Fog,{mode:FogModeValue.linear,color:next.fogColor,near:next.fogNear,far:next.fogFar,maxOpacity:next.fogOpacity*.82}).unwrap();
    for(const {source,handle,values} of wet){
      const target=source.wetColor??source.dryColor.map((v,i)=>i===3?v:v*.73),w=next.wetness;
      const baseColor=source.dryColor.map((v,i)=>v+(target[i]!-v)*w),roughness=source.dryRoughness+((source.wetRoughness??.36)-source.dryRoughness)*w;
      assets.update(handle,{values:{...values,baseColor,roughness}}).unwrap();
    }
    const duskProgress=next.solar?Math.max(0,Math.min(1,(-next.solar.elevation+.09)/.18)):0;
    const nightGlow=duskProgress*duskProgress*(3-2*duskProgress);
    for(const {source,handle,values} of nightLights){
      assets.update(handle,{values:{...values,emissive:nightGlow>.01?source.emissive:[0,0,0],emissiveIntensity:source.maxIntensity*nightGlow}}).unwrap();
    }
    const {solar,sunVisibility,...applied}=next;appliedSolar=solar;appliedSunVisibility=sunVisibility;
    assets.update(discMaterial,{values:{...discMaterialSource.values,baseColor:[next.sunColor[0]*2.7,next.sunColor[1]*2.4,next.sunColor[2]*1.7,1]}}).unwrap();
    lastSkyMinute=applied.clock?.minute;lastSkyDay=applied.clock?.day;lastSkyWeather=next.weather;
    snapshot={...snapshot,...applied,clock:applied.clock,revision:snapshot.revision+1};
  }
  let lastRainCamera: CameraPose|undefined;
  function applySunPosition(eye:Vec3){
    world.set(sky,Transform,{pos:eye}).unwrap();
    const shape=sunDiscShape(eye,appliedSolar,appliedSunVisibility),radius=shape.visible?shape.radius:0;
    world.set(discEntity,Transform,{pos:shape.position,scale:[radius,radius,radius]}).unwrap();
    const position=Array.from(world.get(discEntity,Transform).unwrap().pos) as unknown as Vec3;
    snapshot={...snapshot,sunDisc:{...shape,position}};
  }
  applyEnvironment(initialValues);applySunPosition(options.initialPosition??Array.from(world.get(camera,Transform).unwrap().pos) as unknown as Vec3);
  return {
    snapshot:():EnvironmentSnapshot=>JSON.parse(JSON.stringify(snapshot)) as EnvironmentSnapshot,
    sunDirection: ():Vec3 => snapshot.sunDirection,
    rainIntensity: ():number => snapshot.rain,
    update(input:{weather:WeatherId;clock?:JourneyClock;exposure:number;position:Vec3;view?:CameraPose;delta:number;frozen:boolean;paused:boolean}){
      if(disposed)return;
      snapshot={...snapshot,frozen:input.frozen};
      if(input.frozen||input.paused)return;
      const dt=Math.max(0,Math.min(.1,input.delta)),next=presentSun(transition.step(input.weather,dt,false,input.clock));
      skyElapsed+=dt;
      const skyClockJump=next.clock&&(lastSkyDay!==next.clock.day||lastSkyMinute===undefined||Math.abs(next.clock.minute-lastSkyMinute)>=2);
      const clockChanged=next.clock&&(next.clock.day!==snapshot.clock?.day||next.clock.minute!==snapshot.clock?.minute);
      // Keep the direct beam and its projection on the simulation cadence.
      if(next.sunDirection.some((axis,index)=>axis!==snapshot.sunDirection[index])){
        world.set(sun,DirectionalLight,{direction:next.sunDirection}).unwrap();
        snapshot={...snapshot,sunDirection:next.sunDirection};
        appliedSolar=next.solar;
      }
      if(skyElapsed>=.125&&(!snapshot.settled||next.weather!==lastSkyWeather||!next.settled||skyClockJump)){applyEnvironment(next);skyElapsed=0;}
      else if(skyElapsed>=.125&&clockChanged){
        const {solar,sunVisibility,...applied}=next;appliedSolar=solar;appliedSunVisibility=sunVisibility;
        applyDirectSun(next);
        snapshot={...snapshot,...applied,clock:applied.clock,revision:snapshot.revision+1};
        skyElapsed=0;
      }
      applySunPosition(input.position);
      const exposure=Math.max(-1,Math.min(1,Number.isFinite(input.exposure)?input.exposure:0));
      if(exposure!==snapshot.exposure){world.set(camera,Camera,{exposure:Math.pow(2,exposure)}).unwrap();snapshot={...snapshot,exposure,revision:snapshot.revision+1};}
      const active=snapshot.rain>.005;
      if(active!==lastRain){world.set(rainEntity,Transform,{scale:active?[1,1,1]:[0,0,0]}).unwrap();lastRain=active;}
      rainElapsed+=dt;
      const view=input.view;
      const moved=active&&view&&(!lastRainCamera||distance(lastRainCamera.position,view.position)>.12||distance(lastRainCamera.forward,view.forward)>.015);
      if(active&&(rainElapsed>=1/30||moved)){
        const facts=rain.update(input.position,rainElapsed,snapshot.rain,view);rainElapsed=0;lastRainCamera=view;
        assets.writeRange(rainMesh,[{attribute:'position',first:0,values:rain.positions},{attribute:'color',first:0,values:rain.colors}]).unwrap();
        snapshot={...snapshot,rainVisible:facts.visible,sheltered:facts.sheltered};
      }else if(!active)snapshot={...snapshot,rainVisible:0,sheltered:false};
      if(options.cloud&&cloudBase){cloudClock+=dt*snapshot.wind;world.set(options.cloud,Transform,{pos:[cloudBase[0]!+Math.sin(cloudClock*.015)*14,cloudBase[1]!,cloudBase[2]!+Math.sin(cloudClock*.01)*5]}).unwrap();}
    },
    dispose(){if(disposed)return;disposed=true;releaseOwned();},
  };
  }catch(error){releaseOwned();throw error;}
}
