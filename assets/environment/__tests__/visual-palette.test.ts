import {createHash} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {clockWeatherValues,makeWeatherSky,WEATHER,type WeatherWeights} from '../weather.ts';

const weights:WeatherWeights[]=[{morning:1,rain:0,afterglow:0},{morning:0,rain:1,afterglow:0},{morning:0,rain:0,afterglow:1}];
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const minutes=Array.from({length:1440},(_,minute)=>minute).concat([359.99,360.01,1099.99,1100.01]);
const luma=(rgb:ArrayLike<number>)=>rgb[0]!*.2126+rgb[1]!*.7152+rgb[2]!*.0722;
const chroma=(rgb:readonly number[])=>Math.max(...rgb)-Math.min(...rgb);

describe('bounded clear-sky palette polish without a GPU claim',()=>{
  it.each([
    {minute:720,zenith:[.025,.21,.58],horizon:[.42,.68,.90],ground:[.08,.11,.055]},
    {minute:930,zenith:[.025,.18,.48],horizon:[.46,.64,.79],ground:[.085,.09,.045]},
  ])('reduces blue-sky chroma by 24% while preserving linear luminance at $minute',sample=>{
    const actual=clockWeatherValues({day:1,minute:sample.minute},weights[0]!);
    for(const key of ['zenith','horizon'] as const){
      expect(luma(actual[key])).toBeCloseTo(luma(sample[key]),12);
      expect(chroma(actual[key])/chroma(sample[key])).toBeCloseTo(.76,12);
      expect(actual[key][2]).toBeGreaterThan(actual[key][0]);
    }
    expect(actual.ground).toEqual(sample.ground);
    // The source is linear HDR and shares the exact background/IBL pixels.
    const before=makeWeatherSky({...actual,zenith:sample.zenith as [number,number,number],horizon:sample.horizon as [number,number,number]});
    const after=makeWeatherSky(actual),a=new Float32Array(before.data.buffer),b=new Float32Array(after.data.buffer);
    for(let index=0;index<a.length;index+=4)expect(luma(b.subarray(index,index+3))).toBeCloseTo(luma(a.subarray(index,index+3)),7);
  });
  it('leaves every rain, overcast and warm clear palette at the pre-polish values',()=>{
    const trajectory=minutes.flatMap(minute=>weights.map(weight=>clockWeatherValues({day:1,minute},weight)));
    // Captured from a46800f before edits; ENVIRONMENT-VISUAL-BEFORE.json is the receipt.
    expect(digest(trajectory.filter((_,index)=>index%3===1))).toBe('d01a87a11362a5e44c80b70d76bb456d069a1307d07fb6cb4a1b438a8e72e3cd');
    expect(digest(trajectory.filter((_,index)=>index%3===2))).toBe('ed7373bbd17bcb0c4d6e340c96712c2d6b92c2ae0bb5fb934e7847721e9210da');
    expect(digest(trajectory.filter((value,index)=>index%3===0&&value.horizon[0]>=value.horizon[2]))).toBe('d050834aca11bed247bac24aa59755a100af97679221cdc1f1e3ade45d1fbae6');
    expect(digest(WEATHER)).toBe('46c0af4701efd7cc1f45e437f4b2deadc553e7c9bf95ba624a96d83a75120ca3');
  });
  it('fades continuously as the blue horizon warms and when rain interrupts it',()=>{
    for(const minute of [430,930,960,990,1020]){
      const a=clockWeatherValues({day:1,minute},weights[0]!);
      const b=clockWeatherValues({day:1,minute:minute+.001},weights[0]!);
      const c=clockWeatherValues({day:1,minute},{morning:1-.000001,rain:.000001,afterglow:0});
      for(const key of ['zenith','horizon','fogColor'] as const)for(let channel=0;channel<3;channel++){
        expect(Math.abs(a[key][channel]!-b[key][channel]!)).toBeLessThan(.00002);
        expect(Math.abs(a[key][channel]!-c[key][channel]!)).toBeLessThan(.000002);
      }
    }
  });
});
