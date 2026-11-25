import type { EquirectAsset } from '@forgeax/engine/types';
import type { WetChannels } from './postal-wetness.ts';
import type { WeatherId } from '../shared/photography-contract.ts';
import { cleanDayClock, DAYLIGHT, DAY_MINUTES, type JourneyClock } from '../journey/day-clock.ts';

type RGB = readonly [number, number, number];
export interface WeatherValues {
  sunDirection: RGB; sunColor: RGB; sunIntensity: number; fillIntensity: number;
  fogColor: RGB; fogNear: number; fogFar: number; fogOpacity: number;
  zenith: RGB; horizon: RGB; ground: RGB; rain: number; wind: number; wetness: number;
}
export interface EnvironmentSnapshot extends WeatherValues {
  weather: WeatherId; from: WeatherId; blend: number; settled: boolean; exposure: number;
  /** Simulation state actually applied to native components, never a promised GPU receipt. */
  revision: number; frozen: boolean; rainVisible: number; sheltered: boolean;
  /** Absent only for compatibility callers without the journey clock. */
  clock?: JourneyClock;
  sunDisc: SunDiscSnapshot;
  postalRain?: { clothing:WetChannels; pools:number[]; sheltered:boolean; underfoot:boolean; splashes:number };
}
export interface SunDiscSnapshot { position: RGB; radius: number; visible: boolean }
export interface SolarPosition { direction: RGB; elevation: number }
export type WeatherWeights = Readonly<Record<WeatherId,number>>;
export interface AppliedWeather extends WeatherValues {
  weather: WeatherId; from: WeatherId; blend:number; settled:boolean;
  clock?:JourneyClock; solar?:SolarPosition; sunVisibility:number;
}
export const WEATHER: Readonly<Record<WeatherId, WeatherValues>> = {
  // Cross-valley morning light models risers; the evening lights their opposite faces.
  morning: {sunDirection:[-.68,-.50,.53],sunColor:[1,.93,.81],sunIntensity:2.4,fillIntensity:.90,
    fogColor:[.32,.56,.76],fogNear:280,fogFar:1400,fogOpacity:.6,
    zenith:[.025,.18,.52],horizon:[.34,.62,.85],ground:[.075,.095,.045],rain:0,wind:.24,wetness:0},
  rain: {sunDirection:[-.32,-.83,.45],sunColor:[.78,.86,1],sunIntensity:.85,fillIntensity:.92,
    fogColor:[.36,.46,.51],fogNear:105,fogFar:820,fogOpacity:.57,
    zenith:[.19,.25,.31],horizon:[.48,.54,.57],ground:[.055,.073,.055],rain:.8,wind:.48,wetness:1},
  afterglow: {sunDirection:[.68,-.32,.54],sunColor:[1,.71,.50],sunIntensity:2.05,fillIntensity:.88,
    fogColor:[.52,.34,.29],fogNear:230,fogFar:1350,fogOpacity:.43,
    zenith:[.055,.10,.23],horizon:[1.05,.38,.14],ground:[.07,.045,.025],rain:0,wind:.18,wetness:.72},
};
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
const smooth=(n:number)=>{const p=clamp(n);return p*p*(3-2*p);};
const mix=(a:RGB,b:RGB,t:number):RGB=>a.map((v,i)=>v+(b[i]!-v)*t) as unknown as RGB;
function reduceSkyChroma(color:RGB,amount:number):RGB {
  if(amount===0)return color;
  // Linear Rec.709 luminance stays constant: this changes the shared sky/IBL's
  // blue cast, not exposure or the existing daytime fill lift.
  const luminance=color[0]*.2126+color[1]*.7152+color[2]*.0722;
  return mix(color,[luminance,luminance,luminance],amount);
}
/** Direction from the valley toward the astronomical sun. +X east, +Z north.
 * Sunrise is east; sunset is southwest. Elevation is in radians. */
export function solarPosition(clock:JourneyClock):SolarPosition {
  const minute=cleanDayClock(clock).minute,{sunrise,sunset}=DAYLIGHT;
  let azimuth:number,elevation:number;
  if(minute>=sunrise&&minute<=sunset){
    const phase=(minute-sunrise)/(sunset-sunrise);
    azimuth=phase*Math.PI*.75;elevation=Math.sin(phase*Math.PI)*Math.PI*.3222;
  }else{
    const phase=(minute<sunrise?minute+DAY_MINUTES-sunset:minute-sunset)/(DAY_MINUTES-sunset+sunrise);
    azimuth=Math.PI*.75+phase*Math.PI*1.25;elevation=-Math.sin(phase*Math.PI)*Math.PI*.32;
  }
  return {direction:[Math.cos(azimuth)*Math.cos(elevation),Math.sin(elevation),-Math.sin(azimuth)*Math.cos(elevation)],elevation};
}
interface DayLight { minute:number;zenith:RGB;horizon:RGB;ground:RGB;sunColor:RGB;sunIntensity:number;fillIntensity:number;day:number }
const night={zenith:[.035,.055,.13] as RGB,horizon:[.10,.15,.23] as RGB,ground:[.07,.085,.12] as RGB,sunColor:[.48,.62,.92] as RGB,sunIntensity:0,fillIntensity:1.1,day:.25};
const DAY_LIGHTS:readonly DayLight[]=[
  {minute:0,...night},{minute:DAYLIGHT.sunrise-50,...night},
  {minute:DAYLIGHT.sunrise,zenith:[.055,.12,.25],horizon:[.85,.37,.18],ground:[.075,.08,.085],sunColor:[1,.58,.30],sunIntensity:.65,fillIntensity:1,day:.65},
  {minute:DAYLIGHT.sunrise+70,zenith:[.025,.18,.52],horizon:[.38,.64,.88],ground:[.075,.095,.045],sunColor:[1,.90,.72],sunIntensity:2.2,fillIntensity:.92,day:1},
  {minute:720,zenith:[.025,.21,.58],horizon:[.42,.68,.90],ground:[.08,.11,.055],sunColor:[1,.98,.91],sunIntensity:2.5,fillIntensity:.9,day:1},
  {minute:930,zenith:[.025,.18,.48],horizon:[.46,.64,.79],ground:[.085,.09,.045],sunColor:[1,.88,.68],sunIntensity:2.25,fillIntensity:.9,day:1},
  {minute:DAYLIGHT.goldenStart,zenith:[.045,.14,.34],horizon:[.84,.52,.29],ground:[.09,.075,.04],sunColor:[1,.75,.45],sunIntensity:2.05,fillIntensity:.95,day:1},
  {minute:DAYLIGHT.sunsetStart,zenith:[.065,.105,.25],horizon:[1.05,.40,.17],ground:[.08,.06,.04],sunColor:[1,.58,.28],sunIntensity:1.45,fillIntensity:1,day:.9},
  {minute:DAYLIGHT.sunset,zenith:[.06,.075,.20],horizon:[.90,.26,.12],ground:[.075,.065,.07],sunColor:[1,.40,.17],sunIntensity:.25,fillIntensity:1.06,day:.6},
  {minute:DAYLIGHT.sunset+35,zenith:[.035,.055,.16],horizon:[.19,.22,.35],ground:[.07,.075,.11],sunColor:[.48,.62,.92],sunIntensity:0,fillIntensity:1.1,day:.3},
  {minute:DAYLIGHT.sunset+70,...night},{minute:DAY_MINUTES,...night},
];
function dayLightAt(minute:number):DayLight {
  let index=1;while(index<DAY_LIGHTS.length-1&&DAY_LIGHTS[index]!.minute<minute)index++;
  const a=DAY_LIGHTS[index-1]!,b=DAY_LIGHTS[index]!,t=smooth((minute-a.minute)/(b.minute-a.minute));
  return {minute,zenith:mix(a.zenith,b.zenith,t),horizon:mix(a.horizon,b.horizon,t),ground:mix(a.ground,b.ground,t),sunColor:mix(a.sunColor,b.sunColor,t),
    sunIntensity:a.sunIntensity+(b.sunIntensity-a.sunIntensity)*t,fillIntensity:a.fillIntensity+(b.fillIntensity-a.fillIntensity)*t,day:a.day+(b.day-a.day)*t};
}
/** Clock supplies illumination; old IDs now only supply clear/rain/overcast air. */
export function clockWeatherValues(clock:JourneyClock,weights:WeatherWeights):WeatherValues&{clock:JourneyClock;solar:SolarPosition;sunVisibility:number} {
  const applied=cleanDayClock(clock),light=dayLightAt(applied.minute),solar=solarPosition(applied);
  const rain=clamp(weights.rain),cloud=clamp(weights.afterglow),overcast=clamp(rain*.8+cloud*.58),day=light.day;
  const grayZenith:RGB=[.20*day,.25*day,.31*day],grayHorizon:RGB=[.46*day,.51*day,.55*day];
  // Only the clear, blue daytime palette needs less saturation in shaded
  // surfaces. Fade out at a warm horizon and at sunrise/sunset; keep rain,
  // overcast, golden-hour and night palettes unchanged.
  const neutralAir=.24*clamp(1-rain-cloud)*smooth(solar.elevation/.12)*smooth((light.horizon[2]-light.horizon[0])/.25);
  const zenith=reduceSkyChroma(mix(light.zenith,grayZenith,overcast),neutralAir),horizon=reduceSkyChroma(mix(light.horizon,grayHorizon,overcast),neutralAir);
  const moon=smooth((-solar.elevation-.025)/.16),nightSide=solar.elevation<0;
  const direction:RGB=nightSide?[.35,-.85,-.3937]:solar.direction.map(n=>-n) as unknown as RGB;
  return {clock:applied,solar,sunVisibility:(1-rain)*(1-cloud*.94)*smooth((solar.elevation+.018)/.035),
    sunDirection:direction,sunColor:nightSide?[.48,.62,.92]:light.sunColor,
    sunIntensity:light.sunIntensity*smooth(solar.elevation/.02)*(1-rain*.73-cloud*.45)+.20*moon,
    // Lift shaded daytime surfaces without brightening the sky or moving the
    // sun. Fade the extra fill smoothly over 0–6.9° solar elevation; no night gain.
    fillIntensity:(light.fillIntensity+rain*.08+cloud*.04)*(1+.30*smooth(solar.elevation/.12)),
    fogColor:mix(horizon,[.36*day,.46*day,.51*day],rain),fogNear:280-rain*175-cloud*40,fogFar:1400-rain*580-cloud*100,fogOpacity:.45+rain*.12,
    zenith,horizon,ground:light.ground,rain:rain*.8,wind:.24+rain*.24+cloud*.08,wetness:rain};
}
export function blendWeather(a:WeatherValues,b:WeatherValues,t:number):WeatherValues {
  const p=clamp(t),result={} as WeatherValues;
  for(const key of Object.keys(a) as (keyof WeatherValues)[]){
    const av=a[key],bv=b[key];
    (result as unknown as Record<string,unknown>)[key]=typeof av==='number'?av+((bv as number)-av)*p:av.map((v,i)=>v+((bv as RGB)[i]!-v)*p);
  }
  return result;
}
/** Interrupted transitions begin at the actual intermediate light, never jump to a preset. */
export function createWeatherTransition(initial:WeatherId='morning') {
  let weather=initial,from=initial,start:WeatherValues=WEATHER[initial],values:WeatherValues=WEATHER[initial],blend=1;
  let weights:WeatherWeights={morning:Number(initial==='morning'),rain:Number(initial==='rain'),afterglow:Number(initial==='afterglow')},startWeights=weights;
  let applied:AppliedWeather={...values,weather,from,blend:1,settled:true,sunVisibility:0};
  return {
    step(target:WeatherId,seconds:number,frozen=false,clock?:JourneyClock):AppliedWeather {
      if(!frozen){
        if(target!==weather){from=weather;weather=target;start=values;startWeights=weights;blend=0;}
        blend=clamp(blend+Math.max(0,Math.min(.25,seconds))/2.4);
        const p=smooth(blend);values=blendWeather(start,WEATHER[weather],p);
        weights=Object.fromEntries((['morning','rain','afterglow'] as const).map(id=>[id,startWeights[id]+(Number(id===weather)-startWeights[id])*p])) as unknown as WeatherWeights;
        const illuminated=clock?clockWeatherValues(clock,weights):{...values,sunVisibility:0};
        applied={...illuminated,weather,from,blend:p,settled:blend===1};
      }
      return applied;
    },
  };
}
/** Small linear HDR source. Native sky/IBL derives from this same evolving radiance. */
export function makeWeatherSky(values:WeatherValues,width=64,height=32):EquirectAsset {
  const pixels=new Float32Array(width*height*4);
  for(let y=0;y<height;y++){
    const elevation=Math.sin(Math.PI*(.5-(y+.5)/height)),h=Math.exp(-Math.max(elevation,0)*6),g=clamp((elevation+.06)/.08),b=g*g*(3-2*g);
    for(let x=0;x<width;x++)for(let c=0;c<4;c++)pixels[(y*width+x)*4+c]=c===3?1:values.ground[c]!+(values.zenith[c]!+(values.horizon[c]!-values.zenith[c]!)*h-values.ground[c]!)*b;
  }
  return {kind:'equirect',width,height,format:'rgba32float',data:new Uint8Array(pixels.buffer),colorSpace:'linear'};
}
