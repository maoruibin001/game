import { describe, expect, it } from 'vitest';
import { advanceWeather, cleanWeatherCycle, createJourney, createWeatherCycle, DEFAULT_WEATHER_SEED, reduceJourney, restoreJourney, serializeJourney, toPresentationView, weatherForecast, weatherProbabilities } from '../index.ts';
import type { JourneyAction, JourneyState, WeatherId } from '../types.ts';

const ids: WeatherId[]=['morning','rain','afterglow'];
const step=(s:JourneyState,a:JourneyAction)=>reduceJourney(s,a).state;
const begin=(seed=23)=>step(createJourney(undefined,{weatherSeed:seed}),{type:'start'});
function ticks(s:JourneyState,seconds:number):JourneyState { for(let i=0;i<seconds;i++)s=step(s,{type:'tick',deltaSeconds:1});return s; }
function differentSeed():number {
  for(let seed=0;seed<128;seed++) {
    const c=createWeatherCycle(seed);
    if(advanceWeather('morning',c,c.durationSeconds).weather!=='morning')return seed;
  }
  throw new Error('expected a seeded non-morning outcome');
}

describe('probability forecast and deterministic natural weather',()=>{
  it('shows three integer probabilities totaling 100 and never exposes the draw or seed in the forecast DTO',()=>{
    for(const weather of ids)for(let cycle=0;cycle<9;cycle++){
      const p=weatherProbabilities(weather,cycle);
      expect(Object.keys(p)).toEqual(ids);
      expect(Object.values(p).every(n=>Number.isInteger(n)&&n>0&&n<100)).toBe(true);
      expect(Object.values(p).reduce((a,b)=>a+b,0)).toBe(100);
    }
    const s=ticks(begin(),37),view=toPresentationView(s).weather!.forecast!;
    expect(Object.keys(view).sort()).toEqual(['changeInSeconds','observedAtSeconds','probabilities']);
    expect(view.observedAtSeconds).toBe(0);expect(view.changeInSeconds).toBe(s.durable.weatherCycle.durationSeconds-37);
    expect(view.probabilities).toEqual(weatherProbabilities(s.durable.weather,s.durable.weatherCycle.cycle));
  });
  it('samples all outcomes with the advertised weights, including non-leading predictions',()=>{
    const count=4096;
    for(const weather of ids){
      const results:Record<WeatherId,number>={morning:0,rain:0,afterglow:0};
      for(let seed=0;seed<count;seed++){
        const c=createWeatherCycle(seed);results[advanceWeather(weather,c,c.durationSeconds).weather]++;
      }
      const weights=weatherProbabilities(weather,0);
      for(const id of ids) expect(Math.abs(results[id]/count*100-weights[id])).toBeLessThan(3);
    }
    let selected:JourneyState|undefined;
    for(let seed=0;seed<128;seed++){
      const s=begin(seed),forecast=weatherForecast(s.durable),c=s.durable.weatherCycle;
      const outcome=advanceWeather(s.durable.weather,c,c.durationSeconds).weather;
      if(forecast.probabilities[outcome]<Math.max(...Object.values(forecast.probabilities))){selected=s;break;}
    }
    expect(selected).toBeDefined();
    const advertised=weatherForecast(selected!.durable).probabilities;
    const completed=ticks(selected!,selected!.durable.weatherCycle.durationSeconds);
    expect(advertised[completed.durable.weather]).toBeLessThan(Math.max(...Object.values(advertised)));
    expect(completed.durable.weatherCycle.cycle).toBe(1);
  });
  it('changes only on the due active tick, emits one change, and starts the next real-length period',()=>{
    let s=begin(differentSeed());const duration=s.durable.weatherCycle.durationSeconds;
    expect(duration).toBeGreaterThanOrEqual(210);expect(duration).toBeLessThanOrEqual(300);
    s=ticks(s,duration-1);expect(s.durable.weather).toBe('morning');
    const result=reduceJourney(s,{type:'tick',deltaSeconds:1});
    expect(result.state.durable.weather).not.toBe('morning');
    expect(result.events.filter(e=>e.type==='weather:changed')).toHaveLength(1);
    expect(result.state.durable.weatherCycle.cycle).toBe(1);expect(result.state.durable.weatherCycle.elapsedSeconds).toBe(0);
    expect(result.state.durable.weatherCycle.durationSeconds).toBeGreaterThanOrEqual(210);
    expect(result.state.durable.weatherCycle.durationSeconds).toBeLessThanOrEqual(300);
    expect(reduceJourney(result.state,{type:'tick',deltaSeconds:1}).events.some(e=>e.type==='weather:changed')).toBe(false);
    expect(s.durable.weatherCycle.elapsedSeconds).toBe(duration-1); // No mutation of the earlier frame.
  });
  it('preserves the same future sequence and fractional progress through save/reload',()=>{
    let uninterrupted=ticks(begin(823778),123);
    uninterrupted=step(uninterrupted,{type:'tick',deltaSeconds:.375});
    let resumed=step(restoreJourney(serializeJourney(uninterrupted)).state,{type:'start'});
    expect(resumed.durable.weatherCycle).toEqual(uninterrupted.durable.weatherCycle);
    const observed:WeatherId[]=[];
    for(let n=0;n<1000;n++){
      const a=reduceJourney(uninterrupted,{type:'tick',deltaSeconds:1}),b=reduceJourney(resumed,{type:'tick',deltaSeconds:1});
      uninterrupted=a.state;resumed=b.state;
      expect(resumed.durable.weatherCycle).toEqual(uninterrupted.durable.weatherCycle);
      expect(resumed.durable.weather).toBe(uninterrupted.durable.weather);
      expect(b.events.map(e=>e.type)).toEqual(a.events.map(e=>e.type));
      if(a.events.some(e=>e.type==='weather:changed'))observed.push(a.state.durable.weather);
    }
    expect(uninterrupted.durable.weatherCycle.cycle).toBeGreaterThan(3);
    expect(observed.length).toBeGreaterThan(0);
  });
});

describe('forecast time ownership and capture boundaries',()=>{
  for(const action of [
    {type:'pause',reason:'hidden'},{type:'pause',reason:'platform'},{type:'pause',reason:'blur'},{type:'pause',reason:'ui'},
    {type:'set-screen',screen:'journal'},{type:'set-screen',screen:'map'},{type:'set-screen',screen:'paused'},{type:'return-to-menu'},
  ] as const)it(`does not advance after ${JSON.stringify(action)}`,()=>{
    const s=step(ticks(begin(),51),action),cycle={...s.durable.weatherCycle};
    const later=ticks(s,320);
    expect(later.durable.weatherCycle).toEqual(cycle);expect(later.durable.playSeconds).toBe(s.durable.playSeconds);
    expect(later.durable.weather).toBe(s.durable.weather);
  });
  it('manual selection in explicit creative mode resets observation and cancels rather than starts a timer',()=>{
    let s=ticks(begin(),34);s=step(s,{type:'set-creative-mode',enabled:true});s=step(s,{type:'open-camera'});s=step(s,{type:'set-photography',settings:{timerSeconds:3}});s=step(s,{type:'begin-countdown'});
    const before={...s.durable.weatherCycle},p=weatherForecast(s.durable).probabilities;
    const reset=reduceJourney(s,{type:'set-weather',weather:'morning'});
    expect(reset.state.durable.weatherCycle).toMatchObject({seed:before.seed,cycle:before.cycle+1,elapsedSeconds:0});
    expect(weatherForecast(reset.state.durable).observedAtSeconds).toBe(34);
    expect(weatherForecast(reset.state.durable).probabilities).not.toEqual(p);
    expect(reset.events.some(e=>e.type==='weather:changed')).toBe(false);
    expect(reset.events.filter(e=>e.type==='photo:timer-cancelled')).toHaveLength(1);
    expect(reset.events.some(e=>e.type==='photo:timer-ready'||e.type==='photo:timer-started')).toBe(false);
    expect(reset.state.runtime.countdownSeconds).toBeNull();expect(reset.state.durable.totalPhotos).toBe(0);
    const changed=reduceJourney(reset.state,{type:'set-weather',weather:'rain'});
    expect(changed.state.durable.weather).toBe('rain');expect(changed.state.durable.weatherCycle.cycle).toBe(before.cycle+2);
    expect(changed.events.filter(e=>e.type==='weather:changed')).toHaveLength(1);
  });
  it('does not let normal journey actions remotely guarantee a different weather',()=>{
    const s=ticks(begin(),34),result=reduceJourney(s,{type:'set-weather',weather:'rain'});
    expect(result.state.durable.weather).toBe(s.durable.weather);
    expect(result.state.durable.weatherCycle).toEqual(s.durable.weatherCycle);
    expect(result.events.some(e=>e.type==='weather:changed')).toBe(false);
  });
  it('gives natural weather cancellation priority over a shutter due on the same tick',()=>{
    let s=begin(differentSeed());s=ticks(s,s.durable.weatherCycle.durationSeconds-3);
    s=step(s,{type:'open-camera'});s=step(s,{type:'set-photography',settings:{timerSeconds:3}});s=step(s,{type:'begin-countdown'});
    s=ticks(s,2);expect(s.runtime.countdownSeconds).toBe(1);
    const due=reduceJourney(s,{type:'tick',deltaSeconds:1});
    expect(due.events.filter(e=>e.type==='weather:changed')).toHaveLength(1);
    expect(due.events.filter(e=>e.type==='photo:timer-cancelled')).toHaveLength(1);
    expect(due.events.some(e=>e.type==='photo:timer-ready')).toBe(false);
    expect(due.state.runtime.countdownSeconds).toBeNull();expect(due.state.durable.totalPhotos).toBe(0);
  });
});

describe('compatible forecast restoration',()=>{
  it('opens a previously released v4 without forecast fields and keeps its existing photo/settings',()=>{
    let s=begin();s=step(s,{type:'set-creative-mode',enabled:true});s=step(s,{type:'set-weather',weather:'rain'});s=step(s,{type:'set-photography',settings:{lens:'detail',exposure:.4}});
    s=step(s,{type:'open-camera'});
    s=step(s,{type:'take-photo',observation:{area:'post',vantageTags:[],anchors:{}},thumbnail:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC9sAAAAASUVORK5CYII='});
    s=step(s,{type:'keep-photo',photoId:'photo-1'});
    const encoded=JSON.parse(serializeJourney(s));encoded.version=4;encoded.journey.version=4;
    encoded.journey.endingPhoto='photo-1'; // Actual V4 could select its thumbnail-only photograph.
    for(const field of ['weatherCycle','clock','checkIns','trackedPhotoSpot','creativeMode','creativeReturn','replyPhotos','legacyReplyUnlock','endingNote'])delete encoded.journey[field];
    const restored=restoreJourney(JSON.stringify(encoded)),again=restoreJourney(JSON.stringify(encoded));
    expect(restored.status).toBe('migrated');expect(restored.state.durable.weather).toBe('rain');
    expect(restored.state.durable.photography).toEqual(s.durable.photography);
    expect(restored.state.durable.weatherCycle).toEqual(again.state.durable.weatherCycle);
    expect(restored.state.durable.weatherCycle).toMatchObject({seed:DEFAULT_WEATHER_SEED,cycle:0,elapsedSeconds:0});
    expect(restored.state.durable.album).toEqual(s.durable.album.map(p=>({...p,legacyCapture:true})));
    expect(restored.state.durable.film).toEqual(s.durable.film.map(p=>({...p,legacyCapture:true})));
    expect(restored.state.durable.endingPhoto).toEqual({...s.durable.album[0],legacyCapture:true});
  });
  for(const version of [1,2,3])it(`adds one stable forecast to legacy version ${version}`,()=>{
    const journey={...begin().durable,version};
    const saved=JSON.stringify(version===1?journey:{game:'shanye-laixin',version,journey});
    const a=restoreJourney(saved),b=restoreJourney(saved);
    expect(a.status).toBe('migrated');expect(a.state.durable.weatherCycle).toEqual(b.state.durable.weatherCycle);
    expect(a.state.durable.weatherCycle.seed).toBe(DEFAULT_WEATHER_SEED);
    expect(restoreJourney(serializeJourney(a.state)).state.durable.weatherCycle).toEqual(a.state.durable.weatherCycle);
  });
  it('sanitizes malformed cycle numbers without accepting zero-length periods or losing the journey',()=>{
    const cycle=cleanWeatherCycle({seed:-1,cycle:Infinity,elapsedSeconds:NaN,durationSeconds:0});
    expect(cycle).toEqual(createWeatherCycle());
    const bounded=cleanWeatherCycle({seed:0,cycle:4,elapsedSeconds:99999,durationSeconds:250});
    expect(bounded).toEqual({seed:0,cycle:4,elapsedSeconds:250,durationSeconds:250});
    expect(createWeatherCycle(0)).toEqual(createWeatherCycle(0));
    expect(createWeatherCycle(1)).not.toEqual(createWeatherCycle(0));
  });
});
