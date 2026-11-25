import {describe,expect,it} from 'vitest';
import {allRetainedPhotos,canSendLetter,copyPhoto,createJourney,evaluateCourtyardFrame,FINAL_REPLY,hasStoryReplies,reduceJourney,replyNoteOptions,replyPhotoCandidates,replyResponse,replyVariant,restoreJourney,serializeJourney,worldState} from '../index.ts';
import type {CardId,JourneyAction,JourneyState,PhotoObservation,PhotoSceneRecord,ProjectedAnchor,WeatherId} from '../types.ts';

const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC9sAAAAASUVORK5CYII=';
const original={key:'shanye:original:reply-test',width:1920,height:1080,bytes:12000,mime:'image/jpeg' as const};
const a=(x:number,y:number,width:number,height:number,depth:number):ProjectedAnchor=>({x,y,width,height,depth,visibleFraction:1,occluded:false});
const forest=():PhotoObservation=>({area:'forest',vantageTags:['forest-view'],anchors:{'forest-chime':a(.68,.55,.035,.06,5),windmill:a(.5,.45,.15,.18,50)}});
const town=():PhotoObservation=>({area:'town',vantageTags:['town-view'],anchors:{'stone-arch':a(.5,.4,.45,.5,10),mountain:a(.5,.35,.12,.13,200),'red-mailbox':a(.63,.75,.05,.1,8)}});
const courtyard=():PhotoObservation=>({area:'town',vantageTags:['courtyard-view'],anchors:{'courtyard-bell':a(.6,.6,.07,.1,5),'courtyard-eave':a(.5,.3,.4,.08,6)}});
const scene=(weather:WeatherId='morning',weatherBlend=1):PhotoSceneRecord=>({weather,weatherBlend,clock:{day:1,minute:930},mode:'landscape',lens:'wide',exposure:0,pose:'look',camera:{position:[157,25.6,48.8],forward:[1,0,0],verticalFovRadians:.7,aspect:16/9},subject:{position:[157,24,48.8],yaw:0,visible:false}});
const step=(s:JourneyState,action:JourneyAction)=>reduceJourney(s,action).state;
const begin=()=>step(createJourney(),{type:'start'});
function at(s:JourneyState,area:PhotoObservation['area']){
  s=step(s,{type:'close-camera'});return step(s,{type:'set-pose',pose:{...s.durable.player,area}});
}
function snap(s:JourneyState,observation:PhotoObservation,capturedScene=scene(),hasOriginal=true){
  s=at(s,observation.area);s=step(s,{type:'open-camera'});
  return reduceJourney(s,{type:'take-photo',observation,thumbnail:image,...(hasOriginal?{original}:{}),scene:capturedScene});
}
function match(s:JourneyState,id:CardId,weather:WeatherId='morning'){
  s=at(s,id);
  if(id==='town') {s=step(s,{type:'set-context',nearby:'town-lever'});s=step(s,{type:'interact',id:'town-lever'});}
  return snap(s,id==='forest'?forest():town(),scene(weather));
}
function matchedBoth(){return match(match(begin(),'forest').state,'town').state;}
function choose(s:JourneyState,id:CardId,photoId=s.durable.cardPhotos[id]!.id,note?:string){return step(s,{type:'select-reply-photo',letterId:id,photoId,note});}
function ready(){let s=matchedBoth();s=choose(choose(s,'forest'),'town');return step(s,{type:'select-ending-photo',photoId:s.durable.cardPhotos.town!.id});}
function bridgeReady(s=matchedBoth()){for(let n=0;n<8;n++)s=step(s,{type:'tick',deltaSeconds:1});return s;}
function legacy(s:JourneyState,version:number){
  const p=JSON.parse(serializeJourney(s));p.version=version;p.journey.version=version;
  delete p.journey.replyPhotos;delete p.journey.legacyReplyUnlock;delete p.journey.endingNote;
  for(const photo of Object.values(p.photoTable) as Record<string,unknown>[]){delete photo.replyCandidates;delete photo.legacyCapture;}
  if(version<5)for(const key of ['clock','checkIns','trackedPhotoSpot','creativeMode','creativeReturn'])delete p.journey[key];
  // V1–V3 stored embedded photographs instead of the V4 photo table.
  if(version<4){
    const resolve=(id:string|null)=>id?p.photoTable[id]:null;
    p.journey.album=p.journey.album.map(resolve);p.journey.cardPhotos={forest:resolve(p.journey.cardPhotos.forest),town:resolve(p.journey.cardPhotos.town)};
    p.journey.endingPhoto=resolve(p.journey.endingPhoto);p.journey.pendingPhoto=resolve(p.journey.film.at(-1));delete p.journey.film;
    delete p.journey.weather;delete p.journey.weatherCycle;delete p.journey.photography;delete p.photoTable;
    for(const photo of [...p.journey.album,...Object.values(p.journey.cardPhotos),p.journey.endingPhoto,p.journey.pendingPhoto] as (Record<string,unknown>|null)[]){if(photo){delete photo.scene;delete photo.original;}}
    if(version===1)return {...p.journey,version,photos:p.journey.album,completed:p.journey.stamps,selectedPhotoId:p.journey.endingPhoto?.id};
  }
  return p;
}

describe('active story replies independent of world rewards and weather',()=>{
  const arrow:PhotoObservation = {area:'forest',vantageTags:[],anchors:{'postal-arrow':a(.73,.64,.09,.042,8),windmill:a(.42,.43,.17,.22,40)}};
  const panorama:PhotoObservation = {area:'ridge',vantageTags:['valley-letter-view'],anchors:{'memory-windmill':a(.18,.43,.025,.033,200),'memory-town':a(.72,.56,.028,.025,180)}};
  it.each([[arrow,'sign-route','看见红箭头']] as const)('answers the road letter with the visible route and restores the physical outcome', (frame,variant,words)=>{
    const shot=snap(begin(),frame).state, photo=shot.durable.film.at(-1)!;
    expect(photo.matchedCards).toEqual([]);
    expect(replyVariant(photo,'forest')).toBe(variant);
    expect(worldState(shot).lunchDelivered).toBe(false);
    let state=choose(shot,'forest',photo.id);
    expect(state.durable.stamps.forest).toBe(false);
    expect(replyResponse('forest',state.durable.replyPhotos.forest!)).toContain(words);
    state=match(state,'town').state;
    state=choose(state,'town');
    state=step(state,{type:'select-ending-photo',photoId:photo.id});
    expect(canSendLetter(state)).toBe(true);
    const restored=restoreJourney(serializeJourney(state)).state;
    expect(restored.durable.replyPhotos.forest).toEqual(state.durable.replyPhotos.forest);
    expect(canSendLetter(restored)).toBe(true);
    expect(worldState(restored)).toMatchObject({windmillTurning:false,lunchDelivered:true});
    expect(restored.durable.memories['valley-letter']).toBeNull();
  });
  it('keeps historical answered panoramas but a new wide landscape cannot stand in for two directions',()=>{
    const s=snap(begin(),panorama).state, photo=s.durable.film.at(-1)!;
    expect(replyVariant(photo,'forest')).toBeNull();
    s.durable.replyPhotos.forest={photo,variant:'ridge-route',note:'找到红屋顶，再看看山谷另一头。'};
    expect(restoreJourney(serializeJourney(s)).state.durable.replyPhotos.forest).toEqual(s.durable.replyPhotos.forest);
  });
  it('requires two different full originals, retains partial and sent letters through reload and film eviction',()=>{
    let s=begin();
    const capture=(id:'ridge-arrow'|'memory-windmill',key:string, occluded=false)=>{
      const obs:PhotoObservation={area:'ridge',vantageTags:['valley-letter-view'],anchors:{[id]:{...a(.48,.51,.19,.21,40),occluded}}};
      s=step(at(s,'ridge'),{type:'open-camera'});
      s=step(s,{type:'take-photo',observation:obs,thumbnail:image,original:{...original,key:'shanye:original:'+key},scene:scene()});
      return s.durable.film.at(-1)!;
    };
    expect(capture('ridge-arrow','hidden',true).routeSlot).toBeUndefined();
    const turn=capture('ridge-arrow','turn');
    s=step(s,{type:'attach-route-photo',slot:'turn',photoId:turn.id});
    s=step(restoreJourney(serializeJourney(s)).state,{type:'start'});
    expect(s.durable.routeDraft.turn?.id).toBe(turn.id);
    const attach=(id:string)=>{s=step(s,{type:'attach-route-photo',slot:'destination',photoId:id});s=step(s,{type:'send-route-pair'});};
    attach(turn.id);expect(s.durable.replyPhotos.forest).toBeNull();
    attach(capture('memory-windmill','turn').id);expect(s.durable.replyPhotos.forest).toBeNull();
    const end=capture('memory-windmill','end');attach(end.id);
    for(let i=0;i<14;i++)s=snap(s,{area:'post',vantageTags:[],anchors:{}}).state;
    s=restoreJourney(serializeJourney(s)).state;
    expect(s.durable.film.some(p=>p.id===turn.id||p.id===end.id)).toBe(false);
    expect(s.durable.replyPhotos.forest).toMatchObject({variant:'route-pair',photo:{id:turn.id},destination:{id:end.id}});
    expect(worldState(s).lunchDelivered).toBe(true);
  });
  it('preserves a photo of the windmill alone and explains which turn the receiver cannot see',()=>{
    const partial={...arrow,anchors:{...arrow.anchors,'postal-arrow':{...arrow.anchors['postal-arrow']!,occluded:true}}};
    const photo=snap(begin(),partial).state.durable.film.at(-1)!;
    expect(replyVariant(photo,'forest')).toBeNull();expect(photo.caption).toContain('拐');
    expect(replyVariant(snap(begin(),panorama,scene(),false).state.durable.film.at(-1)!,'forest')).toBeNull();
  });
  for(const weather of ['morning','rain','afterglow'] as const)it(`allows two explicit replies and an ending in ${weather} without clock or daily check-in gates`,()=>{
    const f=match(begin(),'forest',weather);expect(f.events.filter(e=>e.type==='world:windmill-awaken')).toHaveLength(1);
    const t=match(f.state,'town',weather);let s=t.state;
    expect(t.events.filter(e=>e.type==='world:bridge-lowering')).toHaveLength(1);
    expect(t.events.some(e=>e.type==='notice'&&e.message?.includes('按 J 选择回信照片'))).toBe(true);
    expect(s.durable.replyPhotos).toEqual({forest:null,town:null});expect(worldState(s).windmillTurning).toBe(true);
    s=step(s,{type:'select-ending-photo',photoId:s.durable.cardPhotos.town!.id});expect(canSendLetter(s)).toBe(false);
    s=choose(s,'forest');expect(canSendLetter(s)).toBe(false);
    const selected=reduceJourney(s,{type:'select-reply-photo',letterId:'town',photoId:s.durable.cardPhotos.town!.id});s=selected.state;
    expect(selected.events.filter(e=>e.type==='reply:photo-selected')).toHaveLength(1);
    expect(selected.events.some(e=>e.type.startsWith('world:'))).toBe(false);
    expect(canSendLetter(s)).toBe(true);expect(s.durable.checkIns).toEqual([]);expect(s.durable.clock).toEqual({day:1,minute:780});
  });
  it('does not accept missing images, unrelated photos, remote area metadata, or UI-only courtyard markers',()=>{
    let s=matchedBoth();const unrelated=snap(s,{area:'post',vantageTags:[],anchors:{}}).state;
    expect(choose(unrelated,'forest',unrelated.durable.film.at(-1)!.id).durable.replyPhotos.forest).toBeNull();
    const noOriginal=snap(s,forest(),scene(),false).state,p=noOriginal.durable.film.at(-1)!;
    expect(replyVariant(p,'forest')).toBeNull();expect(step(noOriginal,{type:'select-ending-photo',photoId:p.id}).durable.endingPhoto).toBeNull();
    expect(choose(s,'forest','missing').durable.replyPhotos.forest).toBeNull();
    const fake={...s.durable.cardPhotos.forest!,area:'post' as const};expect(replyVariant(fake,'forest')).toBeNull();
    s=at(s,'town');s=step(s,{type:'set-context',nearby:null,observation:courtyard()});s=step(s,{type:'open-camera'});
    expect(s.durable.film.some(photo=>photo.replyCandidates?.length)).toBe(false);
  });
  it('keeps chosen replies independent through replacement, film eviction, album removal, persistence and final mailing',()=>{
    let s=choose(choose(matchedBoth(),'forest'),'town'), oldForest=s.durable.replyPhotos.forest!.photo;
    s=match(s,'forest','rain').state;
    expect(s.durable.replyPhotos.forest!.photo.id).toBe(oldForest.id);
    const newer=s.durable.film.at(-1)!;s=choose(s,'forest',newer.id,'今天的风车藏在细雨里。');
    expect(s.durable.replyPhotos.forest!.photo).not.toBe(newer);
    expect(s.durable.replyPhotos.forest!.photo.scene!.clock).not.toBe(newer.scene!.clock);
    for(let n=0;n<12;n++)s=snap(s,{area:'post',vantageTags:[],anchors:{}}).state;
    expect(s.durable.film.some(p=>p.id===newer.id)).toBe(false);expect(replyPhotoCandidates(s.durable,'forest').some(p=>p.id===newer.id)).toBe(true);
    s=step(s,{type:'select-ending-photo',photoId:newer.id,note:FINAL_REPLY.noteOptions[1]});
    const saved=serializeJourney(s), parsed=JSON.parse(saved), restored=restoreJourney(saved);
    expect(parsed.version).toBe(6);expect(restored.status).toBe('loaded');expect(restored.state.durable).toEqual(s.durable);
    expect(parsed.journey.replyPhotos.forest.photo).toBe(parsed.journey.endingPhoto);
    expect(allRetainedPhotos(restored.state.durable).some(p=>p.original?.key===original.key)).toBe(true);
    s=step(restored.state,{type:'start'});s=step(s,{type:'close-camera'});s=step(s,{type:'set-context',nearby:'post-mailbox'});s=step(s,{type:'interact',id:'post-mailbox'});
    expect(s.durable.mailed).toBe(true);const locked=JSON.stringify(s.durable.replyPhotos);
    s=choose(s,'forest',oldForest.id);s=step(s,{type:'select-ending-photo',photoId:newer.id,note:FINAL_REPLY.noteOptions[0]});
    expect(JSON.stringify(s.durable.replyPhotos)).toBe(locked);expect(s.durable.endingNote).toBe(FINAL_REPLY.noteOptions[1]);
  });
});

describe('courtyard photograph evidence',()=>{
  it('records a courtyard candidate only after the actual original shutter with a completed bridge',()=>{
    expect(snap(begin(),courtyard()).state.durable.film[0]!.replyCandidates).toBeUndefined();
    expect(snap(matchedBoth(),courtyard()).state.durable.film.at(-1)!.replyCandidates).toBeUndefined();
    expect(snap(bridgeReady(),courtyard(),scene(),false).state.durable.film.at(-1)!.replyCandidates).toBeUndefined();
    const result=snap(bridgeReady(),courtyard(),scene('rain')),photo=result.state.durable.film.at(-1)!;
    expect(photo.replyCandidates).toEqual([{letter:'town',variant:'courtyard',ruleVersion:1}]);
    expect(result.state.runtime.notice).toContain('这张可以回答');
    expect(result.events.some(e=>e.type==='world:bridge-lowering')).toBe(false);
    const selected=choose(result.state,'town',photo.id);expect(selected.durable.replyPhotos.town!.variant).toBe('courtyard');
    expect(selected.durable.stamps.town).toBe(true);expect(worldState(selected).bridgeWalkable).toBe(true);
    expect(replyResponse('town',selected.durable.replyPhotos.town!)).toContain('照片里的雨');
    const copy=copyPhoto(photo);expect(copy.replyCandidates![0]).not.toBe(photo.replyCandidates![0]);
    expect(copy.scene!.clock).not.toBe(photo.scene!.clock);
    expect(restoreJourney(serializeJourney(selected)).state.durable.replyPhotos.town).toEqual(selected.durable.replyPhotos.town);
  });
  for(const [label,change,reason] of [
    ['wrong area',(o:PhotoObservation)=>{o.area='forest';},'wrong-area'],
    ['missing view',(o:PhotoObservation)=>{o.vantageTags=[];},'find-viewpoint'],
    ['missing bell',(o:PhotoObservation)=>{delete o.anchors['courtyard-bell'];},'missing-landmark'],
    ['non-finite',(o:PhotoObservation)=>{o.anchors['courtyard-bell']!.depth=NaN;},'missing-landmark'],
    ['behind',(o:PhotoObservation)=>{o.anchors['courtyard-bell']!.depth=-1;},'behind-camera'],
    ['blocked',(o:PhotoObservation)=>{o.anchors['courtyard-eave']!.occluded=true;},'occluded'],
    ['partly visible',(o:PhotoObservation)=>{o.anchors['courtyard-eave']!.visibleFraction=.649;},'occluded'],
    ['off screen',(o:PhotoObservation)=>{o.anchors['courtyard-bell']!.x=.99;},'outside-frame'],
    ['tiny bell',(o:PhotoObservation)=>{o.anchors['courtyard-bell']!.width=.001;},'too-small'],
    ['tiny eave',(o:PhotoObservation)=>{o.anchors['courtyard-eave']!.height=.001;},'too-small'],
    ['above eave',(o:PhotoObservation)=>{o.anchors['courtyard-bell']!.y=.2;},'alignment'],
  ] as const)it(`rejects ${label}`,()=>{const o=courtyard();change(o);expect(evaluateCourtyardFrame(o).reason).toBe(reason);});
  it('accepts broad clear composition without requiring a frame inset or weather',()=>{
    const o=courtyard();o.anchors['courtyard-bell']!.x=.85;o.anchors['courtyard-bell']!.visibleFraction=.65;
    expect(evaluateCourtyardFrame(o).matched).toBe(true);
  });
  it('rejects unknown/future marker variants on reload rather than retroactively awarding old courtyard photos',()=>{
    const s=snap(bridgeReady(),courtyard()).state, p=JSON.parse(serializeJourney(choose(s,'town',s.durable.film.at(-1)!.id)));
    const id=p.journey.replyPhotos.town.photo;
    for(const marker of [{letter:'forest',variant:'courtyard',ruleVersion:1},{letter:'town',variant:'courtyard',ruleVersion:2},{letter:'town',variant:'temple',ruleVersion:1}]){
      p.photoTable[id].replyCandidates=[marker];const restored=restoreJourney(JSON.stringify(p)).state;
      expect(restored.durable.replyPhotos.town).toBeNull();expect(restored.durable.stamps.town).toBe(true);
    }
  });
  it('uses rain wording only for a fully applied rain snapshot and rejects inapplicable note text',()=>{
    for(const [weather,blend,rain] of [['rain',1,true],['rain',.97,false],['morning',1,false],['afterglow',1,false]] as const){
      const s=snap(bridgeReady(),courtyard(),scene(weather,blend)).state, p=s.durable.film.at(-1)!;
      const selected=choose(s,'town',p.id,'今天的旧镇落着细雨。').durable.replyPhotos.town!;
      expect(replyResponse('town',selected).includes('照片里的雨')).toBe(rain);
      expect(selected.note==='今天的旧镇落着细雨。').toBe(rain);
      expect(replyNoteOptions('town',p)).toContain('这是我今天见到的样子');expect(replyNoteOptions('town',p)).toContain('');
    }
  });
});

describe('V6 migrations preserve old progress without invented photos',()=>{
  for(const version of [1,2,3,4,5])it(`carries usable V${version} card photos and retains originals only when they existed`,()=>{
    const encoded=legacy(ready(),version), restored=restoreJourney(JSON.stringify(encoded));
    expect(restored.status).toBe('migrated');expect(restored.state.durable.version).toBe(6);
    for(const id of ['forest','town'] as const){
      expect(restored.state.durable.replyPhotos[id]!.carriedOver).toBe(true);
      expect(restored.state.durable.replyPhotos[id]!.photo.thumbnail).toBe(image);
      expect(restored.state.durable.replyPhotos[id]!.photo.replyCandidates).toBeUndefined();
      expect(restored.state.durable.replyPhotos[id]!.photo.scene?.clock).toEqual(version>=4?{day:1,minute:930}:undefined);
      expect(Boolean(restored.state.durable.replyPhotos[id]!.photo.original)).toBe(version>=4);
    }
    expect(canSendLetter(restored.state)).toBe(true);
    expect(restoreJourney(serializeJourney(restored.state)).state.durable).toEqual(restored.state.durable);
  });
  it('preserves already-mailed V5 progress and absence of lost photographs across later V6 reloads',()=>{
    const encoded=legacy(ready(),5);encoded.journey.mailed=true;encoded.journey.endingSeen=true;encoded.journey.cardPhotos={forest:null,town:null};encoded.journey.endingPhoto=null;
    const migrated=restoreJourney(JSON.stringify(encoded)).state;
    expect(migrated.durable.mailed).toBe(true);expect(migrated.durable.endingSeen).toBe(true);
    expect(migrated.durable.replyPhotos).toEqual({forest:null,town:null});expect(migrated.durable.endingPhoto).toBeNull();
    expect(restoreJourney(serializeJourney(migrated)).state.durable).toEqual(migrated.durable);
  });
  it('preserves only a legacy half-journey stamp, requiring explicit selection for a later new stamp',()=>{
    const old=legacy(match(begin(),'forest').state,5);old.journey.cardPhotos.forest=null;
    let s=step(restoreJourney(JSON.stringify(old)).state,{type:'start'});s=match(s,'town').state;
    s=step(s,{type:'select-ending-photo',photoId:s.durable.cardPhotos.town!.id});
    expect(s.durable.legacyReplyUnlock).toEqual({forest:true,town:false});expect(hasStoryReplies(s.durable)).toBe(false);
    s=choose(s,'town');expect(canSendLetter(s)).toBe(true);
  });
  it('does not promote V5 metadata into a courtyard marker or a new completed story',()=>{
    const old=legacy(matchedBoth(),5),id=old.journey.cardPhotos.town;
    old.photoTable[id].matchedCards=[];old.photoTable[id].replyCandidates=[{letter:'town',variant:'courtyard',ruleVersion:1}];
    const restored=restoreJourney(JSON.stringify(old));expect(restored.state.durable.replyPhotos.town).toBeNull();
    expect(restored.state.durable.film.find(p=>p.id===id)!.replyCandidates).toBeUndefined();
    expect(restored.state.durable.mailed).toBe(false);
    const fresh=JSON.parse(serializeJourney(begin()));fresh.journey.mailed=true;fresh.journey.endingSeen=true;
    expect(restoreJourney(JSON.stringify(fresh)).state.durable.mailed).toBe(false);
    fresh.version=7;expect(restoreJourney(JSON.stringify(fresh)).status).toBe('future-version');
  });
});

describe('mail confirmation requests precede the host-validated final interaction',()=>{
  for(const mailbox of ['post','forest','town','ridge'] as const)it(`requests a ${mailbox} preview without mailing and permits a new request after cancellation`,()=>{
    let s=step(ready(),{type:'close-camera'});s=step(s,{type:'set-context',nearby:`${mailbox}-mailbox`});
    const before=structuredClone(s), first=reduceJourney(s,{type:'request-mail-confirmation'});
    expect(first.state.runtime.mailRequest).toBe(1);expect(first.state.runtime.screen).toBe('play');
    expect(first.state.durable).toEqual(before.durable);expect(first.events.some(e=>e.type==='ending:mailed')).toBe(false);
    expect(s).toEqual(before);
    // Cancelling the frontend preview sends no commit. A later ordinary E can reopen it.
    const second=reduceJourney(first.state,{type:'request-mail-confirmation'});
    expect(second.state.runtime.mailRequest).toBe(2);expect(second.state.durable.mailed).toBe(false);
    expect(restoreJourney(serializeJourney(second.state)).state.runtime.mailRequest).toBe(0);
    const committed=reduceJourney(second.state,{type:'interact',id:`${mailbox}-mailbox`});
    expect(committed.state.durable.mailed).toBe(true);expect(committed.state.runtime.screen).toBe('ending');
    expect(committed.events.filter(e=>e.type==='ending:mailed')).toHaveLength(1);
    expect(step(committed.state,{type:'request-mail-confirmation'}).runtime.mailRequest).toBe(2);
  });
  it('rejects incomplete stories, non-mailboxes, unknown mailbox names and suspended requests',()=>{
    const incomplete=step(begin(),{type:'set-context',nearby:'post-mailbox'});
    expect(step(incomplete,{type:'request-mail-confirmation'}).runtime.mailRequest).toBe(0);
    for(const nearby of [null,'town-lever','mailbox:unknown','mailbox:post-extra']){
      const s=step(ready(),{type:'set-context',nearby});
      expect(step(s,{type:'request-mail-confirmation'}).runtime.mailRequest).toBe(0);
      expect(step(s,{type:'request-mail-confirmation'}).durable.mailed).toBe(false);
    }
    for(const reason of ['ui','hidden','platform','blur'] as const){
      let s=step(ready(),{type:'set-context',nearby:'post-mailbox'});s=step(s,{type:'pause',reason});
      expect(step(s,{type:'request-mail-confirmation'}).runtime.mailRequest).toBe(0);
    }
    let s=step(ready(),{type:'set-context',nearby:'post-mailbox'});s=step(s,{type:'return-to-menu'});
    expect(step(s,{type:'request-mail-confirmation'}).runtime.mailRequest).toBe(0);
  });
});
