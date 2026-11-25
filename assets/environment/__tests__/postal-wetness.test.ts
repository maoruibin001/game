import { describe, expect, it } from 'vitest';
import { createPostalWetness, postalExposure, type RainTraveler } from '../postal-wetness.ts';
import { POSTAL_POOLS } from '../../shanye-world/postal-rain-layout.ts';
import { rainShelterHeight } from '../../shanye-world/rain-shelter.ts';
import { terrainHeight } from '../../shanye-world/world-layout.ts';

const traveler = (x:number,z:number):RainTraveler=>({
  position:[x,terrainHeight(x,z),z],facingYaw:0,grounded:true,speed:0,stepPhase:0,
});
const elapsed = (weather:ReturnType<typeof createPostalWetness>, status:RainTraveler, rain:number, seconds:number) => {
  for(let i=0;i<seconds*10-1;i++)weather.step(status,rain,.1);
  return weather.step(status,rain,.1);
};

describe('postal rain exposure', () => {
  it('samples the actual post office eave at each part and respects a half-covered shoulder or pack',()=>{
    expect(postalExposure(traveler(-2.7,-227.7),rainShelterHeight)).toEqual({hat:1,shoulders:1,coat:1,bag:1});
    expect(postalExposure(traveler(-.45,-230.5),rainShelterHeight)).toEqual({hat:0,shoulders:0,coat:0,bag:0});
    const partial=postalExposure(traveler(-.6,-230),(_x,z)=>z<=-229.9?20:undefined);
    expect(partial).toMatchObject({hat:0,shoulders:0,coat:0,bag:1});
    const side=postalExposure(traveler(-2.7,-228),x=>x<=-2.7?20:undefined);
    expect(side.shoulders).toBe(.5);
  });

  it('wets clothing at different rates, dries beneath the eave during rain and leaves water after clearing',()=>{
    const open=traveler(-2.7,-227.7), underEave=traveler(-.45,-230.5);
    const state=createPostalWetness(rainShelterHeight);
    const dry=elapsed(state,open,0,1);
    expect(dry.clothing.hat).toBe(0);
    expect(dry.pools).toEqual([0,0,0]);
    const rain=elapsed(state,open,.8,1.2);
    const {hat,shoulders,coat,bag}=rain.clothing;
    expect(hat).toBeGreaterThan(shoulders);expect(shoulders).toBeGreaterThan(coat);
    expect(coat).toBeGreaterThan(bag);expect(bag).toBeGreaterThan(0);
    expect(rain.pools.every(level=>level>.25)).toBe(true);
    const sheltered=elapsed(state,underEave,.8,3);
    expect(sheltered.clothing.hat).toBeLessThan(hat);
    expect(sheltered.clothing.bag).toBeLessThan(bag);
    expect(sheltered.pools[0]).toBeGreaterThan(rain.pools[0]!);
    const clearing=elapsed(state,underEave,0,2);
    expect(clearing.pools[0]).toBeLessThan(sheltered.pools[0]!);
    expect(clearing.pools[0]).toBeGreaterThan(.25);
    expect(elapsed(state,underEave,0,22).pools).toEqual([0,0,0]);
  });

  it('sends one splash for wet ground contact and never for dry ground, idle or jumping overhead',()=>{
    const state=createPostalWetness(rainShelterHeight);
    const [x,,z]=POSTAL_POOLS[2].position, dry=traveler(1.5,-227);
    const status=traveler(x,z);
    expect(state.step({...status,speed:2},0,.1).splash).toBe(false);
    elapsed(state,dry,.8,4);
    expect(state.step(status,.8,.1).splash).toBe(false);
    expect(state.step({...status,speed:2,stepPhase:1.9},.8,.1).splash).toBe(true);
    expect(state.step({...status,speed:2,stepPhase:2},.8,.1).splash).toBe(false);
    expect(state.step({...status,speed:2,stepPhase:6,grounded:false},.8,.1).splash).toBe(false);
    expect(state.step({...status,speed:2,stepPhase:6},.8,.1).splash).toBe(true);
    expect(state.step({...dry,speed:2,stepPhase:9},.8,.1).splash).toBe(false);
  });
});
