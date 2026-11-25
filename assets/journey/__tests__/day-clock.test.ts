import {describe,expect,it} from 'vitest';
import {advanceDayClock,cleanDayClock,createDayClock,formatClock,restDayClock,DAY_MINUTES,GAME_MINUTES_PER_REAL_SECOND,DAYLIGHT,MAX_JOURNEY_DAY} from '../day-clock.ts';

describe('valley day clock',()=>{
 it('starts at day one 13:00 and advances forty valley minutes per real minute',()=>{
  const first=createDayClock();expect(first).toEqual({day:1,minute:780});expect(formatClock(first)).toBe('第 1 天 · 13:00');
  expect(GAME_MINUTES_PER_REAL_SECOND).toBe(40/60);expect(advanceDayClock(first,60)).toEqual({day:1,minute:820});
  let frames=first;for(let i=0;i<60;i++)frames=advanceDayClock(frames,1/60);
  expect(frames.minute).toBeCloseTo(780+40/60,8);expect(first).toEqual({day:1,minute:780});
  expect(DAYLIGHT).toEqual({sunrise:360,goldenStart:1000,sunsetStart:1060,sunset:1100});
 });
 it('carries fractional time across midnight and multiple days without resetting the date',()=>{
  expect(advanceDayClock({day:3,minute:1439.875},1).minute).toBeCloseTo(13/24,8);
  expect(advanceDayClock({day:3,minute:1439.875},1).day).toBe(4);
  expect(advanceDayClock({day:7,minute:100},DAY_MINUTES/GAME_MINUTES_PER_REAL_SECOND*2+6)).toEqual({day:9,minute:104});
  expect(formatClock({day:2,minute:0})).toBe('第 2 天 · 00:00');
  expect(formatClock({day:3,minute:1439.9})).toBe('第 3 天 · 23:59');
 });
 it('cleans saved values independently, normalizes finite overflow and rejects non-finite time',()=>{
  expect(cleanDayClock(undefined)).toEqual(createDayClock());
  expect(cleanDayClock({day:NaN,minute:Infinity})).toEqual(createDayClock());
  expect(cleanDayClock({day:2.8,minute:1500.25})).toEqual({day:3,minute:60.25});
  expect(cleanDayClock({day:2,minute:-60})).toEqual({day:1,minute:1380});
  expect(cleanDayClock({day:-4,minute:-100})).toEqual({day:1,minute:0});
  const huge=cleanDayClock({day:1e300,minute:1e300});expect(huge.day).toBe(MAX_JOURNEY_DAY);expect(huge.minute).toBeLessThan(DAY_MINUTES);
  for(const dt of [NaN,Infinity,-10,0])expect(advanceDayClock(createDayClock(),dt)).toEqual(createDayClock());
 });
});

describe('rest to the next light window',()=>{
 it('reaches today golden hour or sunset, and tomorrow morning, from the default clock',()=>{
  const start=createDayClock();
  expect(restDayClock(start,'golden')).toEqual({clock:{day:1,minute:1000},skippedMinutes:220,weatherSeconds:330});
  expect(restDayClock(start,'sunset')).toEqual({clock:{day:1,minute:1060},skippedMinutes:280,weatherSeconds:420});
  expect(restDayClock(start,'morning')).toEqual({clock:{day:2,minute:380},skippedMinutes:1040,weatherSeconds:1560});
  expect(start).toEqual(createDayClock());
 });
 it('uses tomorrow at an exact or already passed target, preserving fractional skipped time',()=>{
  for(const [target,minute]of [['morning',380],['golden',1000],['sunset',1060]]as const){
   expect(restDayClock({day:4,minute},target)).toEqual({clock:{day:5,minute},skippedMinutes:1440,weatherSeconds:2160});
   const late=restDayClock({day:4,minute:minute+.375},target);
   expect(late.clock).toEqual({day:5,minute});expect(late.skippedMinutes).toBe(1439.625);expect(late.weatherSeconds).toBe(2159.4375);
  }
 });
});
