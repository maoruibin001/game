import {createHash} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {clockWeatherValues,createWeatherTransition,makeWeatherSky,type WeatherWeights} from '../weather.ts';
import {DAYLIGHT} from '../../journey/day-clock.ts';

// Captured before the fill-only change from the actual image candidate d043b03,
// weather.ts SHA256 9461cb54…. The two minutes are applied native snapshot times,
// not rounded HUD labels. Full source/evidence lives in LIGHTING-DIAGNOSIS-01.json.
// Final visual polish intentionally desaturates the clear blue sky; the fill
// limits and solar/weather trajectory remain locked to the earlier candidate.
const weights:WeatherWeights[]=[{morning:1,rain:0,afterglow:0},{morning:0,rain:1,afterglow:0},{morning:0,rain:0,afterglow:1}];
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const minutes=Array.from({length:1440},(_,n)=>n).concat([359.99,360.01,1099.99,1100.01]);
const trajectory=()=>minutes.flatMap(minute=>weights.map(w=>clockWeatherValues({day:1,minute},w)));

describe('bounded daytime skylight lift against the real screenshot baseline',()=>{
  it.each([
    {label:'clear 15:32',minute:932.4134162500051,weather:0,before:.9001742051190593,sky:null},
    {label:'rain 16:45',minute:1005.0409099999495,weather:1,before:1.0309994797238877,sky:'89b8e1868e2f28c6abd89feb7e42f50db7c56c78ce3f14041c612691bcc13383'},
  ])('retains the bounded fill lift for $label',sample=>{
    const actual=clockWeatherValues({day:1,minute:sample.minute},weights[sample.weather]!);
    expect(actual.fillIntensity).toBeCloseTo(sample.before*1.3,12);
    if(sample.sky)expect(createHash('sha256').update(makeWeatherSky(actual).data).digest('hex')).toBe(sample.sky);
  });
  it('preserves the full solar, fill and weather trajectory while allowing the intentional palette change',()=>{
    const withoutPalette=trajectory().map(({zenith,horizon,ground,fogColor,...values})=>values);
    // Captured before final polish at a46800f; see ENVIRONMENT-VISUAL-BEFORE.json.
    expect(digest(withoutPalette)).toBe('fcb69a71dd82fe0bafc6636678c489244034bdbd6bc7f3bb295e78d908b9229e');
  });
  it('preserves every nighttime value and the no-clock compatibility presets',()=>{
    expect(digest(trajectory().filter(v=>v.solar.elevation<=0))).toBe('950c506c0abf65bd95997d77c6525156c01ba162ab5f63ba6a633814a412af4e');
    for(const [weather,fill] of [['morning',.9],['rain',.92],['afterglow',.88]] as const)expect(createWeatherTransition(weather).step(weather,0).fillIntensity).toBe(fill);
  });
  it('returns continuously to baseline at sunrise and sunset and never exceeds the daytime cap',()=>{
    for(const [minute,base] of [[DAYLIGHT.sunrise,1],[DAYLIGHT.sunset,1.06]] as const){
      for(const [index,extra] of [[0,0],[1,.08],[2,.04]] as const){
        const at=clockWeatherValues({day:1,minute},weights[index]!);
        expect(at.fillIntensity).toBeCloseTo(base+extra,12);
        for(const epsilon of [-.001,.001])expect(Math.abs(clockWeatherValues({day:1,minute:minute+epsilon},weights[index]!).fillIntensity-at.fillIntensity)).toBeLessThan(1e-7);
      }
    }
    // Known noon baseline keyframe; the addition never boosts the night palette.
    for(const [index,extra] of [[0,0],[1,.08],[2,.04]] as const)expect(clockWeatherValues({day:1,minute:720},weights[index]!).fillIntensity).toBeCloseTo((.9+extra)*1.3,12);
    for(const value of trajectory())expect(value.fillIntensity).toBeLessThanOrEqual((1.1+.08)*1.3);
  });
});
