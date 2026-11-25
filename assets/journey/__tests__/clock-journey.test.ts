import { describe, expect, it } from 'vitest';
import { createJourney, reduceJourney, serializeJourney, restoreJourney } from '../index.ts';
import { REST_POINTS } from '../rest-points.ts';
import { photoSpotById } from '../photo-outings.ts';
import type { JourneyState, JourneyAction, PhotoObservation } from '../types.ts';
import type { PhotoSceneRecord } from '../../shared/photography-contract.ts';
const step=(s:JourneyState,a:JourneyAction)=>reduceJourney(s,a).state;
const begin=()=>step(createJourney(),{type:'start'});
const thumbnail='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC9sAAAAASUVORK5CYII=';
function postPhoto(s:JourneyState, visible=true){
 const spot=photoSpotById('post-porch')!;
 s=step(s,{type:'set-pose',pose:{position:spot.position,yaw:0,pitch:0,area:'post'}});
 s=step(s,{type:'open-camera'});
 const observation:PhotoObservation={area:'post',vantageTags:[],anchors:visible?{'post-door':{x:.5,y:.5,width:.4,height:.4,depth:20,visibleFraction:1,occluded:false}}:{}};
 const scene:PhotoSceneRecord={clock:{...s.durable.clock,minute:s.durable.clock.minute},weather:s.durable.weather,weatherBlend:1,mode:'landscape',lens:'wide',exposure:0,pose:'look',
 camera:{position:[2,16,-214],forward:[0,0,-1],verticalFovRadians:Math.PI/3,aspect:16/9},subject:{position:spot.position,yaw:0,visible:false}};
 return step(s,{type:'take-photo',observation,thumbnail,capturedAt:1234,scene,original:{key:'original-test',width:1920,height:1080,mime:'image/jpeg',bytes:1000}});
}
describe('clock, rest and original-photo journey integration',()=>{
 it('advances actual active time but freezes map and all pause reasons',()=>{
  let s=step(begin(),{type:'tick',deltaSeconds:1}); expect(s.durable.clock.minute).toBeCloseTo(780+40/60,8);
  for(const action of [{type:'set-screen',screen:'map'},{type:'pause',reason:'hidden'},{type:'pause',reason:'ui'}] as const){
   const paused=step(s,action),later=step(paused,{type:'tick',deltaSeconds:1});
   expect(later.durable.clock).toEqual(s.durable.clock);expect(later.durable.weatherCycle).toEqual(s.durable.weatherCycle);
  }
 });
 it('permits physical rest with only UI modal paused, advances weather and not walking/play time',()=>{
  let s=begin();s=step(s,{type:'set-pose',pose:{...s.durable.player,position:REST_POINTS[0].position}});
  s=step(s,{type:'pause',reason:'ui'});const before=s.durable;
  const rested=step(s,{type:'rest-until',target:'sunset'});
  expect(rested.durable.clock).toEqual({day:1,minute:1060});expect(rested.durable.weatherCycle.cycle).toBeGreaterThan(0);
  expect(rested.durable.playSeconds).toBe(before.playSeconds);expect(rested.durable.distanceWalked).toBe(before.distanceWalked);
  expect(rested.runtime.pauseReasons).toEqual([]);
  const hidden=step(s,{type:'pause',reason:'hidden'});expect(step(hidden,{type:'rest-until',target:'sunset'}).durable.clock).toEqual(before.clock);
  const away=begin();expect(step(away,{type:'rest-until',target:'sunset'}).durable.clock).toEqual(away.durable.clock);
 });
 it('restores pre-creative clock/weather exactly after repeated enable and save/reload',()=>{
  let s=step(begin(),{type:'tick',deltaSeconds:1});const original={clock:s.durable.clock,weather:s.durable.weather,weatherCycle:s.durable.weatherCycle};
  s=step(s,{type:'set-creative-mode',enabled:true});s=step(s,{type:'set-time',minute:1070});s=step(s,{type:'set-weather',weather:'rain'});
  s=step(s,{type:'set-creative-mode',enabled:true});expect(s.durable.creativeReturn).toEqual(original);
  s=step(s,{type:'tick',deltaSeconds:1});expect(s.durable.clock.minute).toBe(1070);
  s=step(restoreJourney(serializeJourney(s)).state,{type:'start'});s=step(s,{type:'set-creative-mode',enabled:false});
  expect(s.durable.clock).toEqual(original.clock);expect(s.durable.weather).toBe(original.weather);expect(s.durable.weatherCycle).toEqual(original.weatherCycle);expect(s.durable.creativeReturn).toBe(null);
 });
 it('requires a real observed photo, uses applied capture clock and retains original after deleting film',()=>{
  let s=postPhoto(begin(),false);expect(s.durable.checkIns).toHaveLength(0);
  s=postPhoto(s);expect(s.durable.checkIns).toHaveLength(1);expect(s.durable.checkIns[0].photo.scene!.clock!.minute).toBe(780);
  const id=s.durable.checkIns[0].photo.id;s=step(s,{type:'delete-film-photo',photoId:id});
  const packed=JSON.parse(serializeJourney(s));expect(typeof packed.journey.checkIns[0].photo).toBe('string');
  const loaded=restoreJourney(JSON.stringify(packed));expect(loaded.status).toBe('loaded');
  expect(loaded.state.durable.checkIns[0].photo.original!.key).toBe('original-test');
  expect(postPhoto(step(loaded.state,{type:'start'})).durable.checkIns).toHaveLength(1);
 });
 it('does not award creative photos or allow remote time changes',()=>{
  const initial=begin();expect(step(initial,{type:'set-time',minute:1070}).durable.clock).toEqual(initial.durable.clock);
  expect(step(initial,{type:'set-weather',weather:'rain'}).durable.weather).toBe('morning');
  const creative=step(initial,{type:'set-creative-mode',enabled:true});const photo=postPhoto(creative);
  expect(photo.durable.totalPhotos).toBe(1);expect(photo.durable.checkIns).toHaveLength(0);
 });
 it('migrates true V4 evening into clear sunset clock without rewriting historic photo facts',()=>{
  const s=postPhoto(begin());const old=JSON.parse(serializeJourney(s));old.version=4;old.journey.version=4;old.journey.weather='afterglow';
  delete old.journey.clock;delete old.journey.checkIns;delete old.journey.creativeReturn;delete old.journey.creativeMode;
  const result=restoreJourney(JSON.stringify(old));expect(result.status).toBe('migrated');expect(result.state.durable.clock).toEqual({day:1,minute:1060});
  expect(result.state.durable.weather).toBe('morning');expect(result.state.durable.film[0].original).toEqual(s.durable.film[0].original);
 });
});
