import {describe,expect,it} from 'vitest';
import {advanceWeather,createWeatherCycle,weatherProbabilities,weatherProbabilitiesAtOffset,MAX_WEATHER_ADVANCE_SECONDS,MAX_WEATHER_FORECAST_SECONDS,WEATHER_CYCLE_MAX_SECONDS} from '../weather.ts';
import {restDayClock} from '../day-clock.ts';
import type {WeatherCycle,WeatherId} from '../types.ts';

const ids:WeatherId[]=['morning','rain','afterglow'];
const mix=(state:Record<WeatherId,number>,phase:number)=>{
 const next={morning:0,rain:0,afterglow:0};
 for(const current of ids)for(const target of ids)next[target]+=state[current]*weatherProbabilities(current,phase)[target]/100;
 return next;
};

describe('bounded multi-period weather advance',()=>{
 it('consumes a whole next-day rest exactly like small active ticks, keeping seed and fractional remainder',()=>{
  const seconds=restDayClock({day:3,minute:1060.375},'sunset').weatherSeconds;
  for(const seed of [0,1,23,823778]){
   const start={...createWeatherCycle(seed,4),elapsedSeconds:35.625},original={...start};
   const once=advanceWeather('rain',start,seconds);let split={weather:'rain' as WeatherId,cycle:start,expired:false},left=seconds;
   while(left>0){const step=Math.min(left,7.25);split=advanceWeather(split.weather,split.cycle,step);left-=step;}
   expect(once.weather).toBe(split.weather);expect(once.cycle).toEqual(split.cycle);expect(once.cycle.seed).toBe(seed);
   expect(once.cycle.cycle-start.cycle).toBeGreaterThanOrEqual(Math.floor(seconds/WEATHER_CYCLE_MAX_SECONDS));expect(once.cycle.elapsedSeconds).toBeLessThan(once.cycle.durationSeconds);
   expect(once.expired).toBe(true);expect(start).toEqual(original);
  }
 });
 it('preserves the continuation after serializing a rested cycle and does not guarantee clear skies',()=>{
  const outcomes=new Set<WeatherId>();
  for(let seed=0;seed<96;seed++){
   const start=createWeatherCycle(seed),rested=advanceWeather('morning',start,3560);outcomes.add(rested.weather);
   const restored=JSON.parse(JSON.stringify(rested));
   expect(advanceWeather(restored.weather,restored.cycle,173.375)).toEqual(advanceWeather(rested.weather,rested.cycle,173.375));
  }
  expect([...outcomes].sort()).toEqual([...ids].sort());
 });
 it('keeps malformed deltas from reversing time and rejects unbounded work explicitly',()=>{
  const cycle={...createWeatherCycle(11),elapsedSeconds:17.5};
  for(const delta of [NaN,Infinity,-2,0])expect(advanceWeather('rain',cycle,delta)).toEqual({weather:'rain',cycle,expired:false});
  expect(()=>advanceWeather('rain',cycle,MAX_WEATHER_ADVANCE_SECONDS+.01)).toThrow(RangeError);
  expect(()=>weatherProbabilitiesAtOffset('rain',cycle,MAX_WEATHER_FORECAST_SECONDS+1)).toThrow(RangeError);
 });
});

describe('forecast without future seeded draws',()=>{
 const cycle:WeatherCycle={seed:321,cycle:4,elapsedSeconds:10,durationSeconds:240};
 it('reports the observed weather before the known boundary and public probabilities at the boundary',()=>{
  for(const offset of [0,20,229.999])expect(weatherProbabilitiesAtOffset('rain',cycle,offset)).toEqual({morning:0,rain:100,afterglow:0});
  expect(weatherProbabilitiesAtOffset('rain',cycle,230)).toEqual(weatherProbabilities('rain',4));
  expect(weatherProbabilitiesAtOffset('rain',cycle,439.99)).toEqual(weatherProbabilities('rain',4));
 });
 it('marginalizes unknown next-period length at its earliest/latest boundary instead of reading its seed',()=>{
  const first=weatherProbabilities('rain',4),second=mix(first,5),early=weatherProbabilitiesAtOffset('rain',cycle,440),late=weatherProbabilitiesAtOffset('rain',cycle,530);
  for(const id of ids){expect(early[id]).toBeCloseTo(first[id]*90/91+second[id]/91,9);expect(late[id]).toBeCloseTo(second[id],9);}
 });
 it('never accesses seed, remains normalized and uncertain, and protects cache entries from caller mutation',()=>{
  const hiddenSeed={cycle:4,elapsedSeconds:10,durationSeconds:240,get seed():number{throw new Error('Forecast must not inspect the seed');}};
  for(const seconds of [231,700,3560,5760,11520]){
   const forecast=weatherProbabilitiesAtOffset('rain',hiddenSeed,seconds);
   expect(forecast).toEqual(weatherProbabilitiesAtOffset('rain',{...cycle,seed:0xffffffff},seconds));
   expect(ids.reduce((sum,id)=>sum+forecast[id],0)).toBeCloseTo(100,9);
   for(const id of ids)expect(forecast[id]).toBeGreaterThan(0);
   expect(Math.max(...Object.values(forecast))).toBeLessThan(100);
  }
  const a=weatherProbabilitiesAtOffset('rain',cycle,1000),copy={...a};a.morning=999;
  expect(weatherProbabilitiesAtOffset('rain',cycle,1000)).toEqual(copy);
  expect(weatherProbabilitiesAtOffset('rain',{...cycle,elapsedSeconds:20},990)).toEqual(copy);
 });
 it('agrees with a bounded sample of actual later outcomes without promising a specific one',()=>{
  const expected=weatherProbabilitiesAtOffset('morning',{...cycle,cycle:0,elapsedSeconds:0},1000),counts={morning:0,rain:0,afterglow:0},total=2048;
  for(let seed=0;seed<total;seed++)counts[advanceWeather('morning',{...cycle,seed,cycle:0,elapsedSeconds:0},1000).weather]++;
  for(const id of ids)expect(Math.abs(counts[id]/total*100-expected[id])).toBeLessThan(4);
 });
});
