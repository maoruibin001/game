import {describe,it,expect} from 'vitest';
import {clockWeatherValues,createWeatherTransition,makeWeatherSky,solarPosition} from '../weather.ts';
import {sunDiscMesh,sunDiscShape,SUN_DISC_DISTANCE,SUN_DISC_RADIUS} from '../sun-disc.ts';
import {DAYLIGHT} from '../../journey/day-clock.ts';

const clock=(minute:number,day=1)=>({day,minute});
const clear={morning:1,rain:0,afterglow:0},rain={morning:0,rain:1,afterglow:0},cloud={morning:0,rain:0,afterglow:1};
describe('independent valley time and weather illumination',()=>{
  it('rises in the east at06:00 and reaches the southwest horizon at18:20, continuously across midnight',()=>{
    const rise=solarPosition(clock(DAYLIGHT.sunrise)),set=solarPosition(clock(DAYLIGHT.sunset));
    expect(rise.elevation).toBeCloseTo(0,8);expect(rise.direction[0]).toBeCloseTo(1,8);
    expect(set.elevation).toBeCloseTo(0,8);expect(set.direction[0]).toBeCloseTo(-Math.SQRT1_2,7);expect(set.direction[2]).toBeCloseTo(-Math.SQRT1_2,7);
    expect(solarPosition(clock(DAYLIGHT.sunsetStart)).elevation).toBeGreaterThan(set.elevation);
    const before=solarPosition(clock(1439.99)),after=solarPosition(clock(0,2));
    expect(Math.hypot(...before.direction.map((n,i)=>n-after.direction[i]!))).toBeLessThan(.001);
    for(let minute=0;minute<1440;minute+=5){
      const s=solarPosition(clock(minute));expect(Math.hypot(...s.direction)).toBeCloseTo(1,8);
      for(const weights of [clear,rain,cloud]){
        const v=clockWeatherValues(clock(minute),weights),sky=makeWeatherSky(v);
        expect(Array.from(new Float32Array(sky.data.buffer)).every(Number.isFinite)).toBe(true);
        expect(v.fillIntensity).toBeGreaterThanOrEqual(.9);
      }
    }
  });
  it('uses identical sun position in rain, clear or overcast while time changes the light and sky',()=>{
    const clearNoon=clockWeatherValues(clock(720),clear),cloudNoon=clockWeatherValues(clock(720),cloud),rainNoon=clockWeatherValues(clock(720),rain);
    expect(clearNoon.solar).toEqual(cloudNoon.solar);expect(clearNoon.solar).toEqual(rainNoon.solar);
    expect(rainNoon.rain).toBe(.8);expect(cloudNoon.rain).toBe(0);expect(cloudNoon.wetness).toBe(0);
    expect(cloudNoon.horizon[2]).toBeGreaterThan(cloudNoon.horizon[0]);
    const clearSunset=clockWeatherValues(clock(1080),clear),rainSunset=clockWeatherValues(clock(1080),rain);
    expect(clearSunset.horizon[0]).toBeGreaterThan(clearSunset.horizon[2]);
    expect(rainSunset.solar).toEqual(clearSunset.solar);expect(rainSunset.rain).toBe(.8);
    expect(sunDiscShape([64,86,204],rainSunset.solar,rainSunset.sunVisibility).visible).toBe(false);
    expect(sunDiscShape([64,86,204],cloudNoon.solar,cloudNoon.sunVisibility).visible).toBe(false);
    expect(sunDiscShape([64,86,204],clearSunset.solar,clearSunset.sunVisibility).visible).toBe(true);
  });
  it('keeps clock-driven lighting moving after clear weather settles and freezes actual light on demand',()=>{
    const t=createWeatherTransition('afterglow');
    const noon=t.step('afterglow',0,false,clock(720));expect(noon.settled).toBe(true);
    const later=t.step('afterglow',.1,false,clock(1000));expect(later.settled).toBe(true);
    expect(later.sunDirection).not.toEqual(noon.sunDirection);expect(later.horizon).not.toEqual(noon.horizon);
    expect(t.step('rain',.25,true,clock(1200))).toEqual(later);
    const interrupted=t.step('rain',0,false,clock(1000));expect(interrupted.horizon).toEqual(later.horizon);
    for(let i=0;i<30;i++)t.step('rain',.1,false,clock(1000));
    const settled=t.step('rain',0,false,clock(1000));expect(settled.rain).toBe(.8);expect(settled.clock).toEqual(clock(1000));
  });
  it('has a nonblack navigation night without leaving a visible sun or warm sunset sky',()=>{
    const midnight=clockWeatherValues(clock(0),clear),rainNight=clockWeatherValues(clock(0),rain);
    for(const v of [midnight,rainNight]){
      expect(v.sunIntensity).toBeGreaterThanOrEqual(.19);expect(v.fillIntensity).toBeGreaterThanOrEqual(1.1);
      expect(v.horizon.every(n=>n>.02)).toBe(true);expect(v.sunDirection[1]).toBeLessThan(0);
      expect(sunDiscShape([0,16,0],v.solar,v.sunVisibility).visible).toBe(false);
    }
    expect(midnight.horizon[2]).toBeGreaterThan(midnight.horizon[0]);
  });
  it('builds an actual outward-facing solid mesh and places its disc on the true solar ray',()=>{
    const m=sunDiscMesh(),p=m.attributes.position as Float32Array,index=m.indices!;
    expect(m.submeshes[0]!.topology).toBe('triangle-list');expect(index.length).toBeGreaterThan(100);
    for(let i=0;i<index.length;i+=3){
      const a=Array.from(p.slice(index[i]!*3,index[i]!*3+3)),b=Array.from(p.slice(index[i+1]!*3,index[i+1]!*3+3)),c=Array.from(p.slice(index[i+2]!*3,index[i+2]!*3+3));
      const u=b.map((v,k)=>v-a[k]!),v=c.map((n,k)=>n-a[k]!);
      const cross=[u[1]!*v[2]!-u[2]!*v[1]!,u[2]!*v[0]!-u[0]!*v[2]!,u[0]!*v[1]!-u[1]!*v[0]!];
      expect(cross.reduce((sum,n,k)=>sum+n*a[k]!,0)).toBeGreaterThan(0);
    }
    const eye=[64,85.72,204] as const,solar=solarPosition(clock(1080)),shape=sunDiscShape(eye,solar,1);
    expect(shape.radius).toBe(SUN_DISC_RADIUS);expect(Math.hypot(...shape.position.map((n,i)=>n-eye[i]!))).toBeCloseTo(SUN_DISC_DISTANCE,7);
    expect(shape.position[0]).toBeLessThan(eye[0]);expect(shape.position[2]).toBeLessThan(eye[2]);
  });
});
