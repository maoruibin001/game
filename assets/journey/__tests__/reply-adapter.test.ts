import { describe, expect, it } from 'vitest';
import { createJourney, reduceJourney } from '../journey.ts';
import { actionFromPresentation, toPresentationView } from '../presentation-adapter.ts';
import type { Photo } from '../types.ts';
import { createTravelController } from '../../controller/travel-controller.ts';
import { COURTYARD_PHOTO } from '../../shanye-world/courtyard.ts';
import { terrainHeight } from '../../shanye-world/world-layout.ts';
import { observeAppliedPhoto } from '../../entry/journey-host.ts';
import type { EnvironmentSnapshot } from '../../environment/weather.ts';
const photo = (): Photo => ({ id:'photo-1', sequence:1, area:'forest', title:'林地雨景', pose:{position:[-170,38,-49.5],yaw:0,pitch:0,area:'forest'},
  capturedAt:1,playSeconds:3,thumbnail:'data:image/jpeg;base64,actual',matchedCards:['forest'],memoryCandidates:[],tutorialMatch:false,caption:'',
  original:{key:'photo-original:11111111-1111-4111-8111-111111111111',width:1920,height:1080,mime:'image/jpeg',bytes:20000},
  scene:{clock:{day:1,minute:1000},weather:'rain',weatherBlend:1,mode:'landscape',lens:'wide',exposure:0,pose:'look',camera:{position:[-170,40,-49.5],forward:[0,0,1],verticalFovRadians:1,aspect:16/9},subject:{position:[-170,38,-49.5],yaw:0,visible:false}} });
describe('letters use retained photographic facts in the actual UI projection',()=>{
 it('shows a candidate without auto-answering and chooses its own weather presets',()=>{
  let s=reduceJourney(createJourney(),{type:'start'}).state;s.durable.film=[photo()];s.durable.stamps.forest=true;
  const letter=toPresentationView(s).replies!.items[0];expect(letter.status).toBe('choose');expect(letter.photo).toBeUndefined();
  expect(letter.candidates[0].noteOptions).toContain('今天的风车藏在细雨里。');expect(letter.candidates[0].noteOptions).not.toContain('今天的叶片很清楚。');
  const action=actionFromPresentation(s,'select-reply-photo',{letterId:'forest',photoId:'photo-1',note:'今天的风车藏在细雨里。'});expect(action).not.toBeNull();
  s=reduceJourney(s,action!).state;const answered=toPresentationView(s).replies!.items[0];
  expect(answered.status).toBe('answered');expect(answered.photo!.originalKey).toBe(photo().original!.key);expect(answered.response).toContain('阿公');
  s=reduceJourney(s,{type:'delete-film-photo',photoId:'photo-1'}).state;
  expect(toPresentationView(s).replies!.items[0].photo!.id).toBe('photo-1');
 });
 it('shows the real courtyard composition and suppresses the unrelated stone arch reference',()=>{
  const {feet,target}=COURTYARD_PHOTO.view,dx=target[0]-feet[0],dz=target[2]-feet[2];
  const c=createTravelController({spawn:feet,terrainHeight,initialYaw:Math.atan2(dx,-dz),initialPitch:-Math.atan2(target[1]-feet[1]-1.64,Math.hypot(dx,dz))});c.toggleCamera();
  let s=reduceJourney(createJourney({position:feet,yaw:0,pitch:0,area:'town'}),{type:'start'}).state;
  s=reduceJourney(s,{type:'open-camera'}).state;s.durable.stamps.town=true;s.runtime.bridgeProgress=1;
  s.runtime.observation=observeAppliedPhoto(c.snapshot(),{sunDisc:{visible:false}} as EnvironmentSnapshot);
  const view=toPresentationView(s);expect(view.camera.ready).toBe(true);expect(view.camera.target).toBeUndefined();expect(view.camera.referenceVisible).toBe(false);
  expect(view.camera.feedback).not.toContain('石拱');
 });
 it('keeps source actions semantic and carries a selected ending note',()=>{
  const s=createJourney();expect(actionFromPresentation(s,'select-reply-photo',{letterId:'other',photoId:'photo-1'})).toBeNull();
  expect(actionFromPresentation(s,'select-ending-photo',{photoId:'photo-1',note:'我想记住这阵天色。'})).toEqual({type:'select-ending-photo',photoId:'photo-1',note:'我想记住这阵天色。'});
  expect(actionFromPresentation(s,'export-postcard',{photoId:'photo-1'})).toBeNull();
  expect(toPresentationView(s).replies!.final.ready).toBe(false);
 });
});
