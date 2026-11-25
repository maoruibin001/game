import { describe, expect, it } from 'vitest';
import { createJourney, reduceJourney } from '../journey.ts';
import { restoreJourney, serializeJourney } from '../save.ts';
import { AFTERNOON_STOPS } from '../../shanye-world/afternoon-layout.ts';
import { createTravelController } from '../../controller/travel-controller.ts';
import { EMPTY_INPUT } from '../../controller/types.ts';

const step = (state: ReturnType<typeof createJourney>, action: Parameters<typeof reduceJourney>[1]) => reduceJourney(state, action).state;
const begin = () => step(createJourney(), {type:'start'});
const thumb = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC9sAAAAASUVORK5CYII=';
const original = {key:'shanye:original:afternoon-test', width:1920, height:1080, bytes:12000, mime:'image/jpeg' as const};
function at(state: ReturnType<typeof begin>, stop: keyof typeof AFTERNOON_STOPS) {
  const {position,id}=AFTERNOON_STOPS[stop];
  return step(step(state,{type:'set-pose',pose:{position,area:stop.endsWith('Bag')?'post':'town',yaw:0,pitch:0}}),
    {type:'set-context',nearby:id,observation:null});
}
function interact(state: ReturnType<typeof begin>, stop: keyof typeof AFTERNOON_STOPS) {
  return step(at(state,stop),{type:'interact',id:AFTERNOON_STOPS[stop].id});
}
function take(state: ReturnType<typeof begin>, subject: 'swallow-roof' | 'hall-window', proof = true) {
  state=step(state,{type:'open-camera'});
  return step(step(state,{type:'take-photo',thumbnail:thumb,...(proof?{original}:{}),
    observation:{area:'town',anchors:{},vantageTags:[],afternoonSubject:subject}}),{type:'close-camera'});
}

describe('afternoon route and ability migration',()=>{
  it('gates the actual walk-speed and jump inputs while keeping Space as a camera shutter',()=>{
    const events: string[]=[];
    const ctrl=createTravelController({spawn:[0,0,0],terrainHeight:()=>0,onAction:e=>events.push(e.type)});
    ctrl.setAbilities({run:false,jump:false});
    ctrl.submitInput({...EMPTY_INPUT,vertical:1,run:true,jump:true});ctrl.step(.05);
    expect(ctrl.snapshot().running).toBe(false);
    expect(ctrl.snapshot().grounded).toBe(true);
    expect(ctrl.snapshot().speed).toBeCloseTo(6.8);
    ctrl.submitInput({...EMPTY_INPUT});
    ctrl.toggleCamera();
    ctrl.submitInput({...EMPTY_INPUT,jump:true});
    expect(events).toContain('shutter');
    ctrl.toggleCamera();
    ctrl.setAbilities({run:true,jump:true});
    ctrl.submitInput({...EMPTY_INPUT});ctrl.submitInput({...EMPTY_INPUT,vertical:1,run:true,jump:true});
    ctrl.step(.05);
    expect(ctrl.snapshot().speed).toBeCloseTo(11);
    expect(ctrl.snapshot().grounded).toBe(false);
  });

  it('keeps legacy running and jumping, and persists only the new skills actually earned',()=>{
    const state=begin(), packed=JSON.parse(serializeJourney(state));
    delete packed.journey.skills;
    packed.journey.clock.minute=944;
    const old=restoreJourney(JSON.stringify(packed)).state;
    expect(old.durable.skills).toEqual({run:true,jump:true});
    expect(old.durable.clock.minute).toBe(944);
    expect(interact(state,'townBag').durable.skills).toEqual({run:false,jump:false});
    const run=interact(state,'pineBag');
    expect(restoreJourney(serializeJourney(run)).state.durable.skills).toEqual({run:true,jump:false});
    const atShoes=at(state,'shoes');
    expect(interact(take(atShoes,'swallow-roof',false),'shoes').durable.skills.jump).toBe(false);
    expect(interact(take(atShoes,'swallow-roof'),'shoes').durable.skills).toEqual({run:false,jump:true});
  });

  it('checks both postal directions and a real window photograph, then keeps the reward for a foot traveller',()=>{
    let state=take(at(begin(),'window'),'hall-window');
    expect(interact(state,'window').durable.fireworks).toBeNull();
    const photo=state.durable.film[0]!;
    state.durable.cardPhotos.forest={...photo,area:'forest',matchedCards:['forest']};
    state.durable.stamps.town=true;
    state.runtime.bridgeProgress=1;
    state.durable.clock.minute=1120;
    expect(interact(state,'window').durable.fireworks).toBeNull();
    state.durable.clock.minute=1119;
    state=interact(state,'window');
    expect(state.durable.fireworks).toMatchObject({photo:{id:photo.id,afternoonSubject:'hall-window'},day:1,minute:1119});
    state=step(state,{type:'delete-film-photo',photoId:photo.id});
    const restored=restoreJourney(serializeJourney(state)).state;
    expect(restored.durable.skills).toEqual({run:false,jump:false});
    expect(restored.durable.film).toEqual([]);
    expect(restored.durable.fireworks?.photo.original).toEqual(original);
  });
});
