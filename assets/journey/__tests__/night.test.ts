import { describe, expect, it } from 'vitest';
import { createJourney, reduceJourney } from '../journey.ts';
import { afterClosing, canSetFirework, fireworkCues, fireworkPlacement, firstWillowLantern, FIRST_WILLOW_CORE_OUT, FIRST_WILLOW_DURATION, FIRST_WILLOW_RESPONSE, hasBox, nightTravelBlock } from '../night.ts';
import { restoreJourney, serializeJourney } from '../save.ts';
import { terrainHeight } from '../../shanye-world/world-layout.ts';
import { NIGHT_STOPS } from '../../shanye-world/night-layout.ts';
import type { JourneyAction, JourneyState, Photo, Vec3 } from '../types.ts';

const ground = (x:number,z:number):Vec3 => [x,terrainHeight(x,z),z];
const at = (s:JourneyState, x:number, z:number, yaw=0) =>
  change(s,{type:'set-pose',pose:{position:ground(x,z),yaw,pitch:0,area:'town'}});
const change=(s:JourneyState,a:JourneyAction)=>reduceJourney(s,a).state;
const e=(s:JourneyState,id:string)=>change(change(s,{type:'set-context',nearby:id}),{type:'interact',id});
const begin=(minute=1120)=>{
  const state=change(createJourney(),{type:'start'});
  state.durable.clock={day:1,minute};
  return state;
};
const itemPhoto:Photo={
  id:'photo-3', sequence:3, title:'禅院老窗', area:'town',
  pose:{position:ground(159.17,94.6),yaw:0,pitch:0,area:'town'},
  capturedAt:110,playSeconds:110,thumbnail:null,matchedCards:[],memoryCandidates:[],tutorialMatch:false,
  caption:'禅院老窗里的山门',afternoonSubject:'hall-window',
  original:{key:'shanye:original:night-test',width:1920,height:1080,bytes:12000,mime:'image/jpeg'},
};
function withReward(){
  const state=begin();
  state.durable.fireworks={photo:itemPhoto,day:1,minute:930};
  state.durable.totalPhotos=3;
  return state;
}

describe('closed hall, flower market and carried fireworks',()=>{
  it('can leave the mountain at the last bell and checks a lit torch only on entry',()=>{
    const feet=ground(158,65.55),up=ground(158,65.85);
    const state=begin(1119.99);
    expect(nightTravelBlock(state.durable,false,feet,up)).toBeNull();
    const bell=reduceJourney(state,{type:'tick',deltaSeconds:.05});
    expect(bell.events.map(x=>x.type)).toContain('clock:market-open');
    expect(bell.state.durable.player).toEqual(state.durable.player);
    expect(nightTravelBlock(bell.state.durable,false,feet,up)).toBe('mountain');
    expect(nightTravelBlock(bell.state.durable,false,up,feet)).toBeNull();
    const traveler=e(withReward(),NIGHT_STOPS.footTorch.id);
    expect(nightTravelBlock(traveler.durable,false,feet,up)).toBe('mountain');
    expect(nightTravelBlock(traveler.durable,traveler.runtime.torchLit,feet,up)).toBeNull();
  });

  it('opens the market to any traveler and preserves photos while lodging until 06:20',()=>{
    const outside=ground(146.1,-16.5), inside=ground(145.9,-16.5);
    const day=begin(1119.99), night=begin();
    expect(nightTravelBlock(day.durable,false,outside,inside)).toBe('market');
    expect(nightTravelBlock(day.durable,false,inside,outside)).toBeNull();
    expect(nightTravelBlock(night.durable,false,outside,inside)).toBeNull();
    night.durable.film=[itemPhoto];
    night.durable.totalPhotos=3;
    let state=e(night,NIGHT_STOPS.fish.id);
    expect(state.runtime.fishMotionUntil).toBeGreaterThan(state.durable.playSeconds);
    state=e(e(state,NIGHT_STOPS.letter.id),NIGHT_STOPS.repair.id);
    state=e(state,NIGHT_STOPS.inn.id);
    expect(state.durable.clock).toEqual({day:2,minute:380});
    expect(afterClosing(state.durable)).toBe(false);
    expect(state.durable.fireworks).toBeNull();
    const loaded=restoreJourney(serializeJourney(state)).state;
    expect(loaded.durable.film[0]?.original).toEqual(itemPhoto.original);
    expect(loaded.durable.night.fishLetter).toBe('delivered');
  });

  it('keeps legacy rewards, prevents lighting in town or without the torch, and consumes only on ignition',()=>{
    let state=withReward();
    const old=JSON.parse(serializeJourney(state)); delete old.journey.night;
    expect(hasBox(restoreJourney(JSON.stringify(old)).state.durable)).toBe(true);
    state=e(state,NIGHT_STOPS.footTorch.id);
    state=change(at(state,155,-10),{type:'night-gear',operation:'take'});
    expect(e(state,'night-place').durable.night.placed).toBeNull();
    expect(canSetFirework(ground(160.35,79.6))).toBe(true);
    expect(canSetFirework(ground(133.5,-43.5))).toBe(true);
    state=e(at(state,160.35,81.15),'night-place');
    const placed=state.durable.night.placed!;
    expect(placed[0]).toBeCloseTo(160.35);
    expect(placed[2]).toBeCloseTo(79.6);
    state=restoreJourney(serializeJourney(state)).state;
    state=change(state,{type:'start'});
    expect(state.durable.night.placed).not.toBeNull();
    expect(e(state,'night-ignite').durable.night.spent).toBe(false);
    state=change(state,{type:'night-gear',operation:'retrieve'});
    expect(state.runtime.placingFirework).toBe(true);
    state=e(state,'night-place');
    state=change(state,{type:'night-gear',operation:'torch'});
    state=e(state,'night-ignite');
    expect(state.runtime.fireworkShow).toMatchObject({position:placed, firstWillow:true});
    const first = fireworkCues(state.runtime.fireworkShow!);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({kind:'gold',shape:'willow',rise:3.2,burst:8.9});
    const events = [];
    let playing = state;
    for(let i=0;i<Math.ceil(FIRST_WILLOW_DURATION);i++){
      const next=reduceJourney(playing,{type:'tick',deltaSeconds:1});
      playing=next.state;
      events.push(...next.events);
    }
    expect(playing.runtime.fireworkShow).toBeNull();
    expect(events.filter(event=>event.type.startsWith('night:')).map(event=>event.type)).toEqual(['night:launch','night:burst']);
    expect(events.some(event=>event.message?.includes('阿公把灯挑过屋脊了'))).toBe(true);
    expect(FIRST_WILLOW_RESPONSE.end).toBeLessThan(FIRST_WILLOW_DURATION);
    expect(state.durable.night.spent).toBe(true);
    const restored=restoreJourney(serializeJourney(state)).state;
    expect(restored.durable.fireworks?.photo.original).toEqual(itemPhoto.original);
    expect(hasBox(restored.durable)).toBe(false);
    expect(restored.runtime.fireworkShow).toBeNull();
  });


  it('lifts the lantern after the core goes out, holds it when reloaded and stows it at dawn',()=>{
    const state=withReward();
    state.durable.playSeconds=120;
    state.durable.night={...state.durable.night,spent:true,firstWillowLantern:{night:1,ignitedAt:120}};
    const atTime=(seconds:number)=>({...state.durable,playSeconds:120+seconds});
    const {start,end,swayEnd}=FIRST_WILLOW_RESPONSE;
    const before=start-.05;
    expect(FIRST_WILLOW_CORE_OUT).toBeLessThan(before);
    expect(firstWillowLantern(atTime(before))).toBeUndefined();
    const rising=firstWillowLantern(atTime((start+end)/2));
    expect(rising?.extension).toBeCloseTo(.5);
    expect(rising?.lit).toBe(false);
    const seating=firstWillowLantern(atTime(end+.25));
    expect(seating?.extension).toBe(1);
    expect(Math.abs(seating?.angle??0)).toBeGreaterThan(.05);
    const steady=firstWillowLantern(atTime(swayEnd+1));
    expect(steady).toEqual({extension:1,angle:0,lit:true});

    state.durable.playSeconds+=swayEnd+5;
    const loaded=restoreJourney(serializeJourney(state)).state.durable;
    expect(firstWillowLantern(loaded)).toEqual(steady);
    expect(firstWillowLantern({...loaded,clock:{day:2,minute:200}})).toEqual(steady);
    expect(firstWillowLantern({...loaded,clock:{day:2,minute:380}})).toBeUndefined();
    expect(firstWillowLantern({...loaded,clock:{day:2,minute:1150}})).toBeUndefined();

    state.durable.clock={day:2,minute:380};
    const morning=restoreJourney(serializeJourney(state)).state.durable;
    expect(morning.night.firstWillowLantern).toEqual({night:1,ignitedAt:120});
    expect(firstWillowLantern(morning)).toBeUndefined();

    const older=JSON.parse(serializeJourney(state));
    delete older.journey.night.firstWillowLantern;
    const legacy=restoreJourney(JSON.stringify(older)).state.durable;
    expect(legacy.night.spent).toBe(true);
    expect(firstWillowLantern(legacy)).toBeUndefined();
  });

  it('remembers early delivery and grants one distinct box after the hall reward',()=>{
    let state=e(e(begin(),NIGHT_STOPS.letter.id),NIGHT_STOPS.repair.id);
    expect(state.durable.night).toMatchObject({fishLetter:'delivered',scarletClaimed:false});
    state=change(restoreJourney(serializeJourney(state)).state,{type:'start'});
    state.durable.fireworks=withReward().durable.fireworks;
    state=e(state,NIGHT_STOPS.repair.id);
    expect(hasBox(state.durable,'scarlet')).toBe(true);
    expect(e(state,NIGHT_STOPS.repair.id).durable.night).toEqual(state.durable.night);
  });

  it.each([['gold','scarlet'],['scarlet','gold']] as const)('recovers old spent gold and lights both positions in order %s / %s', (first,second)=>{
    const state=withReward();
    state.durable.clock={day:2,minute:1160};
    state.durable.night={...state.durable.night,spent:true,fishLetter:'delivered'};
    let next=change(restoreJourney(serializeJourney(state)).state,{type:'start'});
    expect(hasBox(next.durable)).toBe(false);
    next=e(next,NIGHT_STOPS.repair.id);
    expect(next.durable.night.scarletClaimed).toBe(true);
    next=e(next,NIGHT_STOPS.footTorch.id);
    next=at(next,133.5,-42);
    next=change(next,{type:'night-gear',operation:'invite-gold'});
    expect(next.durable.night.goldEncore).toEqual({night:2,spent:false});
    expect(change(next,{type:'night-gear',operation:'invite-gold'}).durable.night).toEqual(next.durable.night);
    next=e(change(next,{type:'night-gear',operation:'take',kind:first}),'night-place');
    expect(fireworkPlacement(next.durable,second,ground(133.5,-43.55)).valid).toBe(false);
    expect(fireworkPlacement(next.durable,second,ground(160.35,79.6)).valid).toBe(false);
    next=at(next,136,-42);
    next=e(change(next,{type:'night-gear',operation:'take',kind:second}),'night-place');
    const {placed,scarletPlaced}=next.durable.night;
    expect(placed && scarletPlaced).toBeTruthy();
    next=change(restoreJourney(serializeJourney(next)).state,{type:'start'});
    expect(next.durable.night).toMatchObject({placed,scarletPlaced,goldEncore:{night:2,spent:false}});
    next=change(next,{type:'night-gear',operation:'retrieve',kind:second});
    next=e(at(next,137,-42),'night-place');
    next=change(next,{type:'night-gear',operation:'torch'});
    const before=next.durable.night;
    next=e(next,'night-ignite');
    expect(next.runtime.fireworkShow?.launches).toEqual({gold:before.placed,scarlet:before.scarletPlaced});
    expect(next.durable.night).toMatchObject({goldEncore:{night:2,spent:true},scarletClaimed:true,scarletSpent:true});
    expect(restoreJourney(serializeJourney(next)).state.durable.night).toEqual(next.durable.night);
    expect(e(next,'night-ignite').runtime.fireworkShow).toEqual(next.runtime.fireworkShow);
  });


  it('replays both spent types in place through midnight, preserves the trophies, and spends only the rehearsal',()=>{
    let state=withReward();
    state.durable.clock={day:2,minute:22};
    state.durable.night={...state.durable.night,torch:true,spent:true,fishLetter:'delivered',scarletClaimed:true,scarletSpent:true};
    const original=state.durable.fireworks?.photo.original;
    state=change(at(state,155,-16),{type:'night-gear',operation:'reprise'});
    expect(state.durable.night.repriseNight).toBeNull();
    state=change(at(state,133.5,-42),{type:'night-gear',operation:'reprise'});
    expect(state.durable.night.repriseNight).toBe(1);
    expect(hasBox(state.durable)).toBe(true);
    expect(hasBox(state.durable,'scarlet')).toBe(true);
    state=e(change(state,{type:'night-gear',operation:'take',kind:'gold'}),'night-place');
    state=change(state,{type:'night-gear',operation:'torch'});
    expect(e(state,'night-ignite').runtime.fireworkShow).toBeNull();
    state=e(change(at(state,136,-42),{type:'night-gear',operation:'take',kind:'scarlet'}),'night-place');
    const held=state.durable.night;
    state=change(restoreJourney(serializeJourney(state)).state,{type:'start'});
    expect(state.durable.night).toEqual(held);
    state=e(change(state,{type:'night-gear',operation:'torch'}),'night-ignite');
    expect(state.runtime.fireworkShow?.launches).toEqual({gold:held.placed,scarlet:held.scarletPlaced});
    expect(state.durable.night).toMatchObject({spent:true,scarletSpent:true,repriseNight:null,placed:null,scarletPlaced:null});
    expect(state.durable.fireworks?.photo.original).toEqual(original);
    expect(hasBox(state.durable)).toBe(false);
    expect(hasBox(state.durable,'scarlet')).toBe(false);
    expect(change(state,{type:'night-gear',operation:'reprise'}).durable.night.repriseNight).toBeNull();
  });
});
