import type { DurableJourney, WeatherCycle, WeatherForecast, WeatherId } from './types.ts';
import { DAY_MINUTES } from './day-clock.ts';

export const WEATHER_CYCLE_MIN_SECONDS = 210;
export const WEATHER_CYCLE_MAX_SECONDS = 300;
// Old saves have no random seed; deterministic fallback avoids a reload lottery.
export const DEFAULT_WEATHER_SEED = 0x7368616e;
/** Preserve the bounded weather horizon supported by earlier saves and callers. */
export const MAX_WEATHER_ADVANCE_SECONDS=DAY_MINUTES*4;
/** Forecasts may include tomorrow's outing and its travel margin, never an unbounded allocation. */
export const MAX_WEATHER_FORECAST_SECONDS=MAX_WEATHER_ADVANCE_SECONDS*2;
const WEATHER_IDS: readonly WeatherId[] = ['morning', 'rain', 'afterglow'];
const BASE_WEIGHTS: Readonly<Record<WeatherId, readonly [number, number, number]>> = {
  morning: [25, 45, 30], rain: [30, 25, 45], afterglow: [50, 30, 20],
};

/** Stable uint32 mixing. This is a game sequence, not a cryptographic random source. */
function unit(seed: number, cycle: number, salt: number): number {
  let x = (seed ^ Math.imul(cycle + 1, 0x9e3779b9) ^ salt) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return ((x ^ (x >>> 16)) >>> 0) / 0x100000000;
}

export function createWeatherCycle(seed = DEFAULT_WEATHER_SEED, cycle = 0): WeatherCycle {
  const stableSeed = Number.isFinite(seed) ? Math.floor(seed) >>> 0 : DEFAULT_WEATHER_SEED;
  const index = Number.isFinite(cycle) ? Math.max(0, Math.floor(cycle)) : 0;
  return { seed: stableSeed, cycle: index, elapsedSeconds: 0,
    durationSeconds: WEATHER_CYCLE_MIN_SECONDS + Math.floor(unit(stableSeed, index, 0x64757261) * (WEATHER_CYCLE_MAX_SECONDS - WEATHER_CYCLE_MIN_SECONDS + 1)) };
}

export function cleanWeatherCycle(value: unknown): WeatherCycle {
  const p = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const valid = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
  const seed = valid(p.seed) && Number.isInteger(p.seed) && p.seed >= 0 && p.seed <= 0xffffffff ? p.seed : DEFAULT_WEATHER_SEED;
  const cycle = valid(p.cycle) && p.cycle >= 0 ? Math.min(1e9, Math.floor(p.cycle)) : 0;
  const result = createWeatherCycle(seed, cycle);
  if (valid(p.durationSeconds) && Number.isInteger(p.durationSeconds) && p.durationSeconds >= WEATHER_CYCLE_MIN_SECONDS && p.durationSeconds <= WEATHER_CYCLE_MAX_SECONDS) result.durationSeconds = p.durationSeconds;
  if (valid(p.elapsedSeconds)) result.elapsedSeconds = Math.max(0, Math.min(result.durationSeconds, p.elapsedSeconds));
  return result;
}

/** Integer percentages shown before the draw. Every outcome remains possible. */
export function weatherProbabilities(weather: WeatherId, cycle: number): Record<WeatherId, number> {
  const [morning, rain, afterglow] = BASE_WEIGHTS[weather];
  const phase = cycle % 3;
  return phase === 1 ? { morning: morning + 5, rain: rain - 5, afterglow }
    : phase === 2 ? { morning: morning - 5, rain, afterglow: afterglow + 5 }
    : { morning, rain, afterglow };
}

const offsetForecasts=new Map<string,Record<WeatherId,number>>();
const FORECAST_CACHE_LIMIT=64;
const finiteOffset=(value:number,max:number)=>{
  if(!Number.isFinite(value)||value<=0)return 0;
  if(value>max)throw new RangeError(`Weather offset exceeds the supported ${max} seconds`);
  return value;
};
function transitionDistribution(distribution:Record<WeatherId,number>,cycle:number):Record<WeatherId,number>{
  const next:Record<WeatherId,number>={morning:0,rain:0,afterglow:0};
  for(const weather of WEATHER_IDS){const weights=weatherProbabilities(weather,cycle);for(const id of WEATHER_IDS)next[id]+=distribution[weather]*weights[id]/100;}
  return next;
}

/** A probability estimate at an active-time offset, not a preview of the seeded
 * outcome. Only the currently observed duration/elapsed time is known. Later
 * integer durations use their public 210–300s distribution and Markov transitions.
 * This function deliberately never reads cycle.seed. */
export function weatherProbabilitiesAtOffset(weather:WeatherId,cycle:WeatherCycle,futureActiveSeconds:number):Record<WeatherId,number>{
  const offset=finiteOffset(futureActiveSeconds,MAX_WEATHER_FORECAST_SECONDS);
  const observed:Record<WeatherId,number>={morning:0,rain:0,afterglow:0};observed[weather]=100;
  if(offset===0)return observed;
  const duration=Number.isFinite(cycle.durationSeconds)&&cycle.durationSeconds>=WEATHER_CYCLE_MIN_SECONDS&&cycle.durationSeconds<=WEATHER_CYCLE_MAX_SECONDS?cycle.durationSeconds:(WEATHER_CYCLE_MIN_SECONDS+WEATHER_CYCLE_MAX_SECONDS)/2;
  const elapsed=Number.isFinite(cycle.elapsedSeconds)?Math.max(0,Math.min(duration,cycle.elapsedSeconds)):0;
  const remaining=duration-elapsed;if(offset<remaining)return observed;
  // Future durations are integers: sub-second offsets within this bucket have
  // exactly the same transition-count distribution. A fixed outing time therefore
  // normally reuses one entry throughout the current observed weather period.
  const future=Math.floor(Math.max(0,offset-remaining)+1e-8),phase=Number.isFinite(cycle.cycle)?Math.max(0,Math.floor(cycle.cycle))%3:0,key=`${weather}/${phase}/${future}`;
  const cached=offsetForecasts.get(key);if(cached){offsetForecasts.delete(key);offsetForecasts.set(key,cached);return{...cached};}
  let distribution=weatherProbabilities(weather,phase);
  const result:Record<WeatherId,number>={morning:0,rain:0,afterglow:0};
  // F_n is the probability that n later period durations fit into `future`.
  // P(exactly n later draws) = F_n - F_(n+1). Sliding-window convolution keeps
  // work bounded by horizon * possible periods, with only two reusable arrays.
  let previous=new Float64Array(future+1),next=new Float64Array(future+1),previousCdf=1;previous[0]=1;
  const durationCount=WEATHER_CYCLE_MAX_SECONDS-WEATHER_CYCLE_MIN_SECONDS+1;
  for(let n=0;n<=Math.floor(future/WEATHER_CYCLE_MIN_SECONDS);n++){
    let nextCdf=0;
    if((n+1)*WEATHER_CYCLE_MIN_SECONDS<=future){
      let window=0;
      for(let t=0;t<=future;t++){
        if(t>=WEATHER_CYCLE_MIN_SECONDS)window+=previous[t-WEATHER_CYCLE_MIN_SECONDS]!;
        if(t>WEATHER_CYCLE_MAX_SECONDS)window-=previous[t-WEATHER_CYCLE_MAX_SECONDS-1]!;
        next[t]=Math.max(0,window/durationCount);nextCdf+=next[t]!;
      }
      nextCdf=Math.max(0,Math.min(previousCdf,nextCdf));
    }
    const probability=previousCdf-nextCdf;for(const id of WEATHER_IDS)result[id]+=distribution[id]*probability;
    if(nextCdf<1e-12)break;
    distribution=transitionDistribution(distribution,phase+n+1);[previous,next]=[next,previous];previousCdf=nextCdf;
  }
  const total=result.morning+result.rain+result.afterglow;for(const id of WEATHER_IDS)result[id]=result[id]/total*100;
  if(offsetForecasts.size>=FORECAST_CACHE_LIMIT)offsetForecasts.delete(offsetForecasts.keys().next().value!);
  offsetForecasts.set(key,{...result});return result;
}

export function weatherForecast(durable: Pick<DurableJourney, 'weather' | 'weatherCycle' | 'playSeconds'>): WeatherForecast {
  const c = durable.weatherCycle;
  return { observedAtSeconds: Math.max(0, durable.playSeconds - c.elapsedSeconds),
    changeInSeconds: Math.max(0, c.durationSeconds - c.elapsedSeconds),
    probabilities: weatherProbabilities(durable.weather, c.cycle) };
}

/** Consume bounded active time, including one whole rest. The same seeded draws
 * occur whether the interval arrives in ticks or one call; unused time is retained. */
export function advanceWeather(weather: WeatherId, current: WeatherCycle, deltaSeconds: number): { weather: WeatherId; cycle: WeatherCycle; expired: boolean } {
  const delta=finiteOffset(deltaSeconds,MAX_WEATHER_ADVANCE_SECONDS);
  let cycle=cleanWeatherCycle(current),elapsed=cycle.elapsedSeconds+delta,expired=false;
  while(elapsed+1e-8>=cycle.durationSeconds){
    const weights=weatherProbabilities(weather,cycle.cycle),draw=unit(cycle.seed,cycle.cycle,0x64726177)*100;
    let cumulative=0,nextWeather:WeatherId='afterglow';
    for(const id of WEATHER_IDS){cumulative+=weights[id];if(draw<cumulative){nextWeather=id;break;}}
    elapsed=Math.max(0,elapsed-cycle.durationSeconds);weather=nextWeather;cycle=createWeatherCycle(cycle.seed,cycle.cycle+1);expired=true;
  }
  cycle.elapsedSeconds=elapsed;return{weather,cycle,expired};
}
