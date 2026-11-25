import {describe,expect,it} from 'vitest';
import {createTravelController} from '../../controller/travel-controller.ts';
import {createJourney,reduceJourney} from '../../journey/journey.ts';
import type {Photo} from '../../journey/types.ts';
import {INTERACTIONS,terrainHeight} from '../../shanye-world/world-layout.ts';
import {validatedMailTarget} from '../journey-host.ts';

function ready(){
  const state=reduceJourney(createJourney(),{type:'start'}).state;
  const photo:Photo={id:'mail-test',sequence:1,title:'test',area:'post',pose:state.durable.player,capturedAt:0,playSeconds:0,
    thumbnail:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC9sAAAAASUVORK5CYII=',caption:'',matchedCards:[],memoryCandidates:[],tutorialMatch:false,
    original:{key:'mail-test',width:1920,height:1080,mime:'image/jpeg',bytes:10000}};
  state.durable.stamps={forest:true,town:true};state.durable.endingPhoto=photo;
  state.durable.replyPhotos={forest:{photo:{...photo,area:'forest',matchedCards:['forest']},variant:'landmark',note:''},
    town:{photo:{...photo,area:'town',matchedCards:['town']},variant:'landmark',note:''}};
  return state;
}
const mailbox=(id='post-mailbox')=>INTERACTIONS.find(i=>i.id===id)!;
const atMailbox=(id='post-mailbox')=>createTravelController({spawn:mailbox(id).position,terrainHeight}).snapshot();

describe('mail confirmation physical boundary',()=>{
  it('accepts each current real mailbox while the confirmation modal alone pauses input',()=>{
    const state=ready();state.runtime.pauseReasons=['ui'];
    for(const place of ['post','forest','town','ridge'])expect(validatedMailTarget(atMailbox(`${place}-mailbox`),state)).toBe(`mailbox:${place}`);
    expect(state.durable.mailed).toBe(false);expect(state.runtime.pauseReasons).toEqual(['ui']);
  });
  it('rejects stale nearby and saved positions, airborne/ride views and non-modal pauses',()=>{
    const state=ready(),status=atMailbox();state.runtime.nearby='mailbox:post';state.durable.player.position=mailbox().position;
    expect(validatedMailTarget({...status,position:[80,20,-100]},state)).toBeNull();
    expect(validatedMailTarget({...status,position:[status.position[0],status.position[1]+7,status.position[2]]},state)).toBeNull();
    expect(validatedMailTarget({...status,grounded:false},state)).toBeNull();
    expect(validatedMailTarget({...status,mode:'zipline'},state)).toBeNull();
    for(const reason of ['hidden','platform','blur'] as const){state.runtime.pauseReasons=['ui',reason];expect(validatedMailTarget(status,state)).toBeNull();}
    state.runtime.pauseReasons=[];
    for(const screen of ['menu','map','paused'] as const){state.runtime.screen=screen;expect(validatedMailTarget(status,state)).toBeNull();}
  });
  it('accepts the journal confirmation at the actual mailbox and returns through the normal screen transition',()=>{
    for(const returnScreen of ['play','photo'] as const){
      let state=ready();const status=atMailbox();
      state.runtime.screen='journal';state.runtime.returnScreen=returnScreen;state.runtime.pauseReasons=['ui'];
      expect(validatedMailTarget(status,state)).toBe('mailbox:post');
      expect(validatedMailTarget({...status,position:[80,20,-100]},state)).toBeNull();
      state=reduceJourney(state,{type:'set-screen',screen:'play'}).state;
      expect(state.runtime.screen).toBe(returnScreen);expect(state.durable.mailed).toBe(false);
      state=reduceJourney(state,{type:'resume',reason:'ui'}).state;
      state=reduceJourney(state,{type:'set-context',nearby:'mailbox:post'}).state;
      state=reduceJourney(state,{type:'interact',id:'mailbox:post'}).state;
      expect(state.durable.mailed).toBe(true);
    }
  });
  it('does not accept unfinished letters or a repeated final send',()=>{
    const state=ready(),status=atMailbox();state.durable.replyPhotos.forest=null;expect(validatedMailTarget(status,state)).toBeNull();
    const sent=ready();sent.durable.mailed=true;expect(validatedMailTarget(status,sent)).toBeNull();
  });
});
