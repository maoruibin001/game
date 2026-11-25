import { describe, expect, it } from 'vitest';
import { drawGoldenWillow } from '../firework-shape.ts';
import { NIGHT_GLOW_PALETTE } from '../../shanye-world/night-art.ts';

describe('first willow',()=>{
  it('uses three isolated warm tiers while the shared willow still uses its existing batches',()=>{
    const gold:number[]=[],amber:number[]=[],pearl:number[]=[];
    const first={ivory:[] as number[],honey:[] as number[],copper:[] as number[]};
    drawGoldenWillow(gold,amber,pearl,[0,0,0],3.2,10.7,29,first);
    expect([gold.length,amber.length,pearl.length]).toEqual([0,0,0]);
    expect(first.honey.length).toBeGreaterThan(first.ivory.length);
    expect(first.ivory.length).toBeGreaterThan(0);
    expect(first.copper.length).toBeGreaterThan(0);
    expect(NIGHT_GLOW_PALETTE['night-spark-willow-honey'].intensity)
      .toBeLessThan(NIGHT_GLOW_PALETTE['night-spark-gold'].intensity);

    const untouched=Object.values(first).map(tier=>tier.slice());
    drawGoldenWillow(gold,amber,pearl,[0,0,0],3.2,10.7,29);
    expect(gold.length+amber.length+pearl.length).toBeGreaterThan(0);
    expect(Object.values(first)).toEqual(untouched);
  });
  it('switches the first willow to six bundles without increasing its peak segment count',()=>{
    const sample=(age:number,inBundles:boolean)=>{
      const first={ivory:[] as number[],honey:[] as number[],copper:[] as number[]};
      drawGoldenWillow([],[],[],[0,0,0],age,10.7,29,first,inBundles);
      return [...first.ivory,...first.honey,...first.copper];
    };
    const legacy=sample(3.2,false), grouped=sample(3.2,true);
    expect(grouped).not.toEqual(legacy);
    expect(grouped.every(Number.isFinite)).toBe(true);
    const ends=grouped.filter((_,i)=>i%16===12&&grouped[i+1]!<-3.3);
    const lanes=[[-10.7,-9.2],[-6.7,-5.2],[-3.2,-1.65],[1.85,3.3],[5.6,7.1],[9.3,10.6]] as const;
    for(const [left,right] of lanes){
      expect(ends.some(x=>x>=left&&x<=right)).toBe(true);
    }
    expect(ends.every(x=>lanes.some(([left,right])=>x>=left&&x<=right))).toBe(true);
    const times=Array.from({length:210},(_,i)=>.04*(i+1));
    const peak=(bundles:boolean)=>Math.max(...times.map(age=>sample(age,bundles).length/16));
    expect(peak(true)).toBe(peak(false));
  });
});
