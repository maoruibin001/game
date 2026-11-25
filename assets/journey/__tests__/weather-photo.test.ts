import { describe, expect, it } from 'vitest';
import { actionFromPresentation, CAPTURE_THUMBNAIL_MAX_LENGTH, cleanOriginalPhoto, cleanPhotography, cleanPhotoScene, cleanThumbnail, createJourney, MAX_SAVE_LENGTH, reduceJourney, restoreJourney, serializeJourney, toPresentationView } from '../index.ts';
import { DEFAULT_PHOTOGRAPHY } from '../../shared/photography-contract.ts';
import type { JourneyAction, JourneyState, Photo, PhotoObservation, PhotoSceneRecord } from '../types.ts';

const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC9sAAAAASUVORK5CYII=';
const observation: PhotoObservation = { area: 'post', vantageTags: [], anchors: {} };
const original = { key: 'shanye:original:one', width: 1920, height: 1080, bytes: 1280000, mime: 'image/jpeg' as const };
const scene: PhotoSceneRecord = { weather: 'rain', weatherBlend: .65, mode: 'portrait', lens: 'standard', exposure: -.3, pose: 'letter',
  camera: { position: [0,17,-230], forward: [0,0,1], verticalFovRadians: .733, aspect: 16/9 }, subject: { position: [0,14,-220], yaw: 1.2, visible: true } };
const step = (s: JourneyState, action: JourneyAction) => reduceJourney(s, action).state;
const begin = () => step(step(createJourney(), { type: 'start' }), { type: 'open-camera' });
const capture = (s = begin()) => step(s, { type: 'take-photo', observation, thumbnail: image, original, scene });
const timer = (s = begin()) => step(step(s, { type: 'set-photography', settings: { timerSeconds: 3 } }), { type: 'begin-countdown' });

// Add a legal PNG text chunk to test the historical byte budget without changing
// pixels. These are deterministic size fixtures, not proof of browser rendering.
function sizedPNG(targetLength: number): string {
  const source = Uint8Array.from(atob(image.split(',')[1]!), c=>c.charCodeAt(0));
  const bytesBudget = Math.floor((targetLength - 'data:image/png;base64,'.length) / 4) * 3;
  const payloadLength = bytesBudget - source.length - 12;
  const chunk = new Uint8Array(payloadLength + 12), view = new DataView(chunk.buffer);
  view.setUint32(0,payloadLength); chunk.set([116,69,88,116],4); chunk.fill(65,8,chunk.length-4); chunk[8]=116;chunk[9]=0;
  let crc = 0xffffffff;
  for (const byte of chunk.subarray(4, -4)) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  view.setUint32(chunk.length-4,(crc ^ 0xffffffff) >>> 0);
  const combined = new Uint8Array(source.length + chunk.length);
  combined.set(source.subarray(0,-12));combined.set(chunk,source.length-12);combined.set(source.subarray(-12),combined.length-12);
  return `data:image/png;base64,${btoa(Array.from(combined,b=>String.fromCharCode(b)).join(''))}`;
}

describe('film selection and durable original references', () => {
  it('keeps photographing without a forced modal, bounds film, and protects chosen copies on eviction', () => {
    let s = capture(); const first = s.durable.film[0]!;
    s = step(s, { type: 'keep-photo', photoId: first.id });
    s = step(s, { type: 'select-ending-photo', photoId: first.id });
    for (let n = 0; n < 8; n++) s = capture(s);
    expect(s.durable.film.map(p => p.id)).toEqual(Array.from({length:8},(_,n)=>`photo-${n+2}`));
    expect(s.durable.pendingPhoto).toBeNull();
    expect(toPresentationView(s).screen).toBe('play');
    expect(toPresentationView(s).camera.active).toBe(true);
    expect(s.durable.album[0]!.id).toBe(first.id);
    expect(s.durable.endingPhoto!.original).toEqual(original);
    expect(s.durable.endingPhoto!.scene).toEqual(scene);
    expect(s.durable.endingPhoto!.scene!.camera.position).not.toBe(scene.camera.position);
    const restored = restoreJourney(serializeJourney(s)).state;
    expect(restored.durable).toEqual(s.durable);
  });
  it('selects a specified older film and replaces only the selected favorite', () => {
    let s = capture(capture());
    s = step(s, { type: 'keep-photo', photoId: 'photo-1' });
    s = step(s, { type: 'keep-photo', photoId: 'photo-2', replaceId: 'photo-1' });
    s = step(s, { type: 'delete-film-photo', photoId: 'photo-2' });
    expect(s.durable.album.map(p=>p.id)).toEqual(['photo-2']);
    expect(s.durable.film.map(p=>p.id)).toEqual(['photo-1']);
    expect(step(s, { type: 'keep-photo', photoId: 'missing' }).durable.album).toEqual(s.durable.album);
  });
  it('never awards a frame or stores descriptors when capture has no accepted thumbnail', () => {
    const large = sizedPNG(100000);
    expect(cleanThumbnail(large)).toBe(large); // Valid historical image, over the new capture budget.
    for (const thumbnail of [null, 'data:image/jpeg;base64,AA==', large]) {
      const r = reduceJourney(begin(), { type: 'take-photo', observation, thumbnail, original, scene });
      expect(r.state.durable.totalPhotos).toBe(0); expect(r.state.durable.film).toEqual([]);
      expect(r.events.some(e=>e.type==='photo:captured')).toBe(false);
      expect(r.state.durable.stamps).toEqual({forest:false,town:false});
    }
  });
  it('describes only supplied capture facts and routes export to the frontend', () => {
    const s = capture(), view = toPresentationView(s), photo = view.film![0]!;
    expect(photo.originalKey).toBe(original.key); expect(photo.width).toBe(1920); expect(photo.height).toBe(1080);
    expect(photo.sceneDescription).toContain('薄雾细雨'); expect(photo.sceneDescription).toContain('代拍');
    expect(actionFromPresentation(s,'export-photo',{photoId:photo.id})).toBeNull();
    expect(actionFromPresentation(s,'open-film')).toEqual({type:'set-screen',screen:'journal'});
    expect(actionFromPresentation(s,'save-photo',{photoId:'photo-1',replaceId:'photo-2'})).toEqual({type:'keep-photo',photoId:'photo-1',replaceId:'photo-2'});
    const noFacts = step(begin(),{type:'take-photo',observation,thumbnail:image});
    expect(toPresentationView(noFacts).film![0]!.originalKey).toBeUndefined();
    expect(toPresentationView(noFacts).film![0]!.sceneDescription).toBeUndefined();
  });
});

describe('countdown is a cancellable request, never a photo', () => {
  it('emits one ready at three active seconds, uses no earlier observation, and never creates an image itself', () => {
    let s = timer();
    expect(s.runtime.countdownSeconds).toBe(3);
    s = step(s,{type:'tick',deltaSeconds:1});
    expect(step(s,{type:'begin-countdown'}).runtime.countdownSeconds).toBe(2);
    expect(step(s,{type:'take-photo',observation,thumbnail:image}).durable.totalPhotos).toBe(0);
    s = step(s,{type:'tick',deltaSeconds:1});
    const ready = reduceJourney(s,{type:'tick',deltaSeconds:1});
    expect(ready.events.filter(e=>e.type==='photo:timer-ready')).toHaveLength(1);
    expect(ready.state.runtime.countdownSeconds).toBeNull(); expect(ready.state.durable.totalPhotos).toBe(0);
    expect(reduceJourney(ready.state,{type:'tick',deltaSeconds:1}).events.some(e=>e.type==='photo:timer-ready')).toBe(false);
    expect(capture(ready.state).durable.film).toHaveLength(1);
  });
  it('immediate capture only emits readiness; host failure or cancellation gives no image or reward', () => {
    const r = reduceJourney(begin(),{type:'begin-countdown'});
    expect(r.events.filter(e=>e.type==='photo:timer-ready')).toHaveLength(1);
    expect(r.state.durable.totalPhotos).toBe(0);
    const cancelled = step(timer(),{type:'cancel-countdown'});
    expect(reduceJourney(cancelled,{type:'tick',deltaSeconds:1}).events.some(e=>e.type==='photo:timer-ready')).toBe(false);
  });
  for (const action of [
    {type:'pause',reason:'hidden'}, {type:'pause',reason:'platform'}, {type:'pause',reason:'ui'},
    {type:'close-camera'}, {type:'set-screen',screen:'journal'}, {type:'set-screen',screen:'paused'},
    {type:'return-to-menu'}, {type:'set-weather',weather:'rain'}, {type:'set-photography',settings:{lens:'detail'}},
  ] as const) it(`cancels on ${JSON.stringify(action)} without a delayed shutter after resume`, () => {
    const started = action.type === 'set-weather' ? step(begin(), {type:'set-creative-mode',enabled:true}) : begin();
    const r = reduceJourney(timer(started),action);
    expect(r.events.filter(e=>e.type==='photo:timer-cancelled')).toHaveLength(1);
    expect(r.state.runtime.countdownSeconds).toBeNull();
    let s = step(r.state,{type:'resume',reason:'hidden'});
    for(let i=0;i<4;i++) { const tick=reduceJourney(s,{type:'tick',deltaSeconds:1}); s=tick.state; expect(tick.events.some(e=>e.type==='photo:timer-ready')).toBe(false); }
    expect(s.durable.totalPhotos).toBe(0);
  });
  it('ignores an unavailable weather command during an ordinary countdown without cancelling or firing early', () => {
    const started = timer(), changed = reduceJourney(started,{type:'set-weather',weather:'rain'});
    expect(changed.state.durable.weather).toBe(started.durable.weather);
    expect(changed.state.durable.weatherCycle).toEqual(started.durable.weatherCycle);
    expect(changed.state.runtime.countdownSeconds).toBe(3);
    expect(changed.events.some(e=>e.type==='photo:timer-cancelled'||e.type==='photo:timer-ready'||e.type==='weather:changed')).toBe(false);
    let s=changed.state;
    for(let i=0;i<3;i++) {
      const tick=reduceJourney(s,{type:'tick',deltaSeconds:1});s=tick.state;
      expect(tick.events.filter(e=>e.type==='photo:timer-ready')).toHaveLength(i===2?1:0);
      expect(s.durable.totalPhotos).toBe(0);
    }
  });
  it('keeps an active timer on a no-op configuration, resets no timer from storage, and accepts controller movement', () => {
    let s=timer(); s=step(s,{type:'set-photography',settings:{lens:'wide'}});
    expect(s.runtime.countdownSeconds).toBe(3);
    s=step(s,{type:'set-pose',pose:{...s.durable.player,position:[2,0,0]}});
    expect(s.durable.player.position).toEqual([2,0,0]);
    const restored=restoreJourney(serializeJourney(s)).state;
    expect(restored.runtime.countdownSeconds).toBeNull(); expect(restored.durable.photography.timerSeconds).toBe(3);
  });
});

describe('v6 migration, reference safety and storage envelope', () => {
  it('retains an independent completed v3 letter and its image while moving the unkept draft into film', () => {
    const s=capture(), old=JSON.parse(JSON.stringify(s.durable));old.version=3;
    for (const key of ['clock','checkIns','trackedPhotoSpot','creativeMode','creativeReturn','replyPhotos','legacyReplyUnlock','endingNote']) delete old[key];
    const p={...old.film[0],memoryCandidates:['valley-letter']};
    old.discoveries=[{id:'lost-postcard',foundAtPlaySeconds:4},{id:'sunset-seat',foundAtPlaySeconds:8}];
    old.memories={'valley-letter':{id:'valley-letter',photo:p,unlockedAtPlaySeconds:12}};
    old.pendingPhoto={...p,id:'photo-2',sequence:2}; old.film=[];
    const restored=restoreJourney(JSON.stringify({game:'shanye-laixin',version:3,journey:old}));
    expect(restored.state.durable.memories['valley-letter']!.photo.thumbnail).toBe(image);
    expect(restored.state.durable.memories['valley-letter']!.unlockedAtPlaySeconds).toBe(12);
    expect(restored.state.durable.memories['valley-letter']!.photo.original).toBeUndefined();
    expect(restored.state.durable.film[0]!.id).toBe('photo-2');
    expect(restored.state.durable.album).toEqual([]);
    expect(toPresentationView(restored.state).memories![0]!.status).toBe('completed');
  });
  for (const version of [1,2,3]) it(`preserves version ${version} photographs and old draft without invented weather or originals`, () => {
    let s=capture(); s=step(s,{type:'keep-photo'}); s=step(s,{type:'select-ending-photo',photoId:'photo-1'});
    const legacy=JSON.parse(JSON.stringify(s.durable)); legacy.version=version; legacy.stamps={forest:true,town:true};
    for (const key of ['clock','checkIns','trackedPhotoSpot','creativeMode','creativeReturn','replyPhotos','legacyReplyUnlock','endingNote']) delete legacy[key];
    legacy.pendingPhoto={...legacy.film[0],id:'photo-2',sequence:2,thumbnail:sizedPNG(179999)};
    legacy.film=[]; legacy.mailed=true; legacy.endingSeen=true;
    const data=version===1 ? {...legacy,completed:legacy.stamps,photos:legacy.album,selectedPhotoId:'photo-1'} : {game:'shanye-laixin',version,journey:legacy};
    const migrated=restoreJourney(JSON.stringify(data));
    expect(migrated.status).toBe('migrated'); expect(migrated.state.durable.version).toBe(6);
    expect(migrated.state.durable.album[0]!.thumbnail).toBe(image);
    expect(migrated.state.durable.endingPhoto!.id).toBe('photo-1'); expect(migrated.state.durable.mailed).toBe(true);
    expect(migrated.state.durable.film[0]!.id).toBe('photo-2'); expect(migrated.state.durable.film[0]!.thumbnail).toBe(legacy.pendingPhoto.thumbnail);
    expect(migrated.state.durable.pendingPhoto).toBeNull(); expect(migrated.state.durable.weather).toBe('morning');
    expect(migrated.state.durable.clock).toEqual({day:1,minute:1060}); // Legacy mailed夕照 becomes dusk time with clear weather.
    expect(migrated.state.durable.checkIns).toEqual([]); expect(migrated.state.durable.creativeMode).toBe(false);
    expect(migrated.state.durable.photography).toEqual(DEFAULT_PHOTOGRAPHY);
    expect(migrated.state.durable.album[0]!.scene).toBeUndefined(); expect(migrated.state.durable.album[0]!.original).toBeUndefined();
  });
  it('stores each identical photo only once while restoring independent mutable copies', () => {
    let s=capture(); s=step(s,{type:'keep-photo'});s=step(s,{type:'select-ending-photo',photoId:'photo-1'});
    const encoded=serializeJourney(s), parsed=JSON.parse(encoded);
    expect(Object.keys(parsed.photoTable)).toEqual(['photo-1']);
    expect(parsed.journey.album).toEqual(['photo-1']); expect(parsed.journey.film).toEqual(['photo-1']);
    const restored=restoreJourney(encoded).state;
    expect(restored.durable).toEqual(s.durable);
    expect(restored.durable.album[0]).not.toBe(restored.durable.endingPhoto);
    expect(restored.durable.album[0]!.scene!.camera.position).not.toBe(restored.durable.endingPhoto!.scene!.camera.position);
  });
  it('preserves conflicting legacy copies with the same id rather than silently overwriting one', () => {
    let s=capture(); s=step(s,{type:'select-ending-photo',photoId:'photo-1'});
    s.durable.endingPhoto!.caption='独立旧副本';
    const encoded=serializeJourney(s), restored=restoreJourney(encoded).state;
    expect(Object.keys(JSON.parse(encoded).photoTable)).toHaveLength(2);
    expect(restored.durable.endingPhoto!.caption).toBe('独立旧副本'); expect(restored.durable.film[0]!.caption).toBe('');
  });
  it('keeps a full mixed legacy/new collection inside the fixed envelope without dropping old images', () => {
    const old=sizedPNG(179999), current=sizedPNG(CAPTURE_THUMBNAIL_MAX_LENGTH);
    expect(cleanThumbnail(old)).toBe(old); expect(cleanThumbnail(current,CAPTURE_THUMBNAIL_MAX_LENGTH)).toBe(current);
    const s=capture(), base=s.durable.film[0]!;
    const p=(id:number,thumbnail:string):Photo=>({...base,id:`photo-${id}`,sequence:id,thumbnail,caption:'山'.repeat(140),matchedCards:['forest','town'],memoryCandidates:['valley-letter']});
    s.durable.album=Array.from({length:12},(_,i)=>p(i+1,old));
    s.durable.cardPhotos={forest:p(13,old),town:p(14,old)};s.durable.endingPhoto=p(15,old);
    s.durable.memories['valley-letter']={id:'valley-letter',photo:p(16,old),unlockedAtPlaySeconds:0};
    s.durable.discoveries=[{id:'lost-postcard',foundAtPlaySeconds:0},{id:'sunset-seat',foundAtPlaySeconds:0}];
    s.durable.film=Array.from({length:8},(_,i)=>p(i+17,current));s.durable.totalPhotos=24;
    const encoded=serializeJourney(s);
    expect(encoded.length).toBeGreaterThan(3500000); expect(encoded.length).toBeLessThan(MAX_SAVE_LENGTH);
    expect(encoded.length).toBeLessThan(5242856); // Previously measured Chromium own-origin value capacity, not all browsers.
    const restored=restoreJourney(encoded).state;
    expect(restored.durable.album.map(p=>p.thumbnail)).toEqual(s.durable.album.map(p=>p.thumbnail));
    expect(restored.durable.film).toHaveLength(8); expect(restored.durable.memories['valley-letter']!.photo.thumbnail).toBe(old);
    expect(restored.durable.endingPhoto!.thumbnail).toBe(old);
  });
  it('bounds unfamiliar settings and malformed original/scene fields without inventing metadata', () => {
    expect(cleanPhotography({exposure:NaN,viewpoint:100,lens:'zoom',timerSeconds:10})).toEqual({...DEFAULT_PHOTOGRAPHY,viewpoint:2});
    expect(cleanOriginalPhoto({...original,key:'',width:NaN})).toBeUndefined();
    expect(cleanPhotoScene({...scene,camera:{...scene.camera,forward:[0,0,0]}})).toBeUndefined();
    const p=JSON.parse(serializeJourney(capture()));p.photoTable['photo-1'].original.bytes=-1;p.photoTable['photo-1'].scene.weather='snow';
    p.journey.weather='snow'; p.journey.photography.exposure=100;
    const restored=restoreJourney(JSON.stringify(p)).state;
    expect(restored.durable.film[0]!.thumbnail).toBe(image);expect(restored.durable.film[0]!.original).toBeUndefined();expect(restored.durable.film[0]!.scene).toBeUndefined();
    expect(restored.durable.photography.exposure).toBe(1);expect(restored.durable.weather).toBe('morning');
    p.version=7;expect(restoreJourney(JSON.stringify(p)).status).toBe('future-version');
  });
});

it('restores a saved manual zoom, keeps it while editing exposure and clears it on a preset selection',()=>{
 const saved=cleanPhotography({mode:'landscape',lens:'standard',zoom:3.4});
 expect(cleanPhotography(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
 expect(cleanPhotography({exposure:.5},saved).zoom).toBe(3.4);
 expect(cleanPhotography({lens:'standard'},saved).zoom).toBeUndefined();
 expect(cleanPhotography({zoom:30},saved).zoom).toBe(10);
});
