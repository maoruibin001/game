import {describe,expect,it} from 'vitest';
import {createWeatherTransition,makeWeatherSky,WEATHER} from '../weather.ts';
import {createRainField} from '../rain.ts';
import {rainShelterHeight} from '../../shanye-world/rain-shelter.ts';
import {terrainHeight} from '../../shanye-world/world-layout.ts';

describe('weather source transitions and physical rain',()=>{
  it('freezes the actual intermediate weather, then continues from it without jumping',()=>{
    const weather=createWeatherTransition();
    let a=weather.step('rain',.1);for(let i=0;i<7;i++)a=weather.step('rain',.1);
    expect(a.blend).toBeGreaterThan(0);expect(a.blend).toBeLessThan(1);
    expect(a.sunIntensity).toBeLessThan(WEATHER.morning.sunIntensity);
    expect(weather.step('afterglow',.25,true)).toEqual(a);
    const b=weather.step('afterglow',0);
    expect(b.sunIntensity).toBe(a.sunIntensity);expect(b.fogColor).toEqual(a.fogColor);
    for(let i=0;i<30;i++)weather.step('afterglow',.1);
    const settled=weather.step('afterglow',0);expect(settled.settled).toBe(true);expect(settled.rain).toBe(0);expect(settled.wetness).toBe(.72);
  });
  it('provides finite distinct linear HDR sources for sky and shared IBL',()=>{
    const sources=Object.values(WEATHER).map(value=>makeWeatherSky(value));
    for(const source of sources){expect(source.data.byteLength).toBe(64*32*16);expect(Array.from(new Float32Array(source.data.buffer)).every(Number.isFinite)).toBe(true);}
    expect(sources[0]!.data).not.toEqual(sources[1]!.data);expect(sources[1]!.data).not.toEqual(sources[2]!.data);
  });
  it('keeps every visible strand above the real roof and stops rain at terrain',()=>{
    const rain=createRainField({count:80,terrainHeight:()=>0,shelterHeight:()=>8});
    let facts=rain.update([0,2,0],.1,1);
    for(let frame=0;frame<160;frame++){
      facts=rain.update([0,2,0],.05,1);expect(facts.sheltered).toBe(true);
      for(let i=0;i<80;i++)if(rain.colors[i*8+3]!>0)expect(Math.min(rain.positions[i*6+1]!,rain.positions[i*6+4]!)).toBeGreaterThanOrEqual(8.05);
    }
    expect(rain.mesh().submeshes[0]!.topology).toBe('line-list');
    expect(rain.update([0,2,0],.05,0).visible).toBe(0);
  });
  it('uses authored roof shelter while keeping nearby open sky rainy',()=>{
    const rain=createRainField({count:160,terrainHeight,shelterHeight:rainShelterHeight});
    expect(rain.update([0,16,-235],.05,.8).sheltered).toBe(true);
    const open=rain.update([64,85.7,204],.05,.8);expect(open.sheltered).toBe(false);expect(open.visible).toBeGreaterThan(0);
  });
  it('keeps fine rain translucent and suppresses an existing strand when the camera approaches',()=>{
    const rain=createRainField({terrainHeight:()=>0,shelterHeight:()=>undefined});
    rain.update([0,2,0],0,1);
    expect(rain.positions.length).toBe(160*6);
    for(let i=0;i<160;i++){
      expect(rain.colors[i*8+3]!).toBeLessThanOrEqual(.140001);
      expect(Math.hypot(rain.positions[i*6]!-rain.positions[i*6+3]!,rain.positions[i*6+1]!-rain.positions[i*6+4]!,rain.positions[i*6+2]!-rain.positions[i*6+5]!)).toBeLessThan(.29);
    }
    const eye=[rain.positions[0]!,rain.positions[1]!,rain.positions[2]!] as const;
    expect(rain.colors[3]!).toBeGreaterThan(0);
    rain.update(eye,0,1);expect(rain.colors[3]).toBe(0);
    rain.update([eye[0]+.1,eye[1],eye[2]],0,1);expect(rain.colors[3]).toBe(0);
  });
  it('submits only strands wholly in front of the near-plane reserve while the camera rotates',()=>{
    const rain=createRainField({terrainHeight:()=>0,shelterHeight:()=>undefined});
    const eye=[0,2,0] as const;
    for(let frame=0;frame<120;frame++){
      const angle=frame*.1;
      const forward=[Math.cos(angle)*.8,-.6,Math.sin(angle)*.8] as const;
      const facts=rain.update(eye,.04,1,{forward,up:[0,1,0]});
      expect(facts.visible).toBeGreaterThan(0);
      for(let vertex=0;vertex<320;vertex++){
        const offset=vertex*3;
        const depth=(rain.positions[offset]!-eye[0])*forward[0]+
          (rain.positions[offset+1]!-eye[1])*forward[1]+(rain.positions[offset+2]!-eye[2])*forward[2];
        expect(depth).toBeGreaterThan(.7999);
      }
    }
  });

});
