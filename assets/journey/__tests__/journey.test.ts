import { describe, expect, it } from 'vitest';
import {
  actionFromPresentation, canMove, canSendLetter, createJourney, evaluateFrame, loadFromStorage, reduceJourney,
  restoreJourney, saveToStorage, serializeJourney, toPresentationView, worldState,
} from '../index.ts';
import type { AreaId, CardId, DiscoveryId, JourneyAction, JourneyState, PhotoObservation, Pose, ProjectedAnchor } from '../types.ts';

const spawn: Pose = { position: [0, 14, -220], yaw: 0, pitch: 0, area: 'post' };
const original = {key:'shanye:original:journey-test',width:1920,height:1080,bytes:12000,mime:'image/jpeg' as const};
const anchor = (x: number, y: number, width: number, height: number, depth: number): ProjectedAnchor => ({ x, y, width, height, depth, visibleFraction: 1, occluded: false });
const forest = (): PhotoObservation => ({ area: 'forest', vantageTags: ['forest-view'], anchors: { 'forest-chime': anchor(.68, .55, .035, .06, 5), windmill: anchor(.5, .45, .15, .18, 50) } });
const town = (): PhotoObservation => ({ area: 'town', vantageTags: ['town-view'], anchors: { 'stone-arch': anchor(.5, .4, .45, .5, 10), mountain: anchor(.5, .35, .12, .13, 200), 'red-mailbox': anchor(.63, .75, .05, .1, 8) } });
const free = (area: AreaId = 'ridge'): PhotoObservation => ({ area, vantageTags: [], anchors: {} });
const step = (s: JourneyState, a: JourneyAction) => reduceJourney(s, a).state;
const begin = () => step(createJourney(spawn), { type: 'start' });
function move(s: JourneyState, area: AreaId): JourneyState {
  s = step(s, { type: 'close-camera' });
  return step(s, { type: 'set-pose', pose: { ...spawn, area, position: [30, 20, 40] } });
}
function interact(s: JourneyState, id: string): JourneyState {
  s = step(s, { type: 'set-context', nearby: id });
  return step(s, { type: 'interact', id });
}
function snap(s: JourneyState, observation: PhotoObservation): JourneyState {
  s = step(s, { type: 'open-camera' });
  return step(s, { type: 'take-photo', observation, thumbnail: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC9sAAAAASUVORK5CYII=', original, capturedAt: 1234 });
}
function complete(s: JourneyState, card: CardId): JourneyState {
  s = move(s, card);
  if (card === 'town') s = interact(s, 'town-lever');
  return snap(s, card === 'forest' ? forest() : town());
}
function answerReplies(s: JourneyState): JourneyState {
  for(const letterId of ['forest','town'] as const) s=step(s,{type:'select-reply-photo',letterId,photoId:s.durable.cardPhotos[letterId]!.id});
  return s;
}
function readyToMail(): JourneyState {
  let s = snap(move(begin(), 'ridge'), free());
  s = step(s, { type: 'select-ending-photo', photoId: s.durable.film.at(-1)!.id });
  s = answerReplies(complete(complete(s, 'forest'), 'town'));
  return step(s, { type: 'close-camera' });
}

describe('frame geometry owns photo completion', () => {
  it('requires the real near chime beside the distant windmill, visibility, and a valid viewpoint', () => {
    const state = begin();
    expect(evaluateFrame(state, forest(), 'forest').matched).toBe(true);
    for (const [change, reason] of [
      [(o: PhotoObservation) => { o.vantageTags = []; }, 'find-viewpoint'],
      [(o: PhotoObservation) => { o.anchors.windmill!.occluded = true; }, 'occluded'],
      [(o: PhotoObservation) => { o.anchors.windmill!.visibleFraction = .69; }, 'occluded'],
      [(o: PhotoObservation) => { o.anchors.windmill!.depth = -1; }, 'behind-camera'],
      [(o: PhotoObservation) => { o.anchors.windmill!.x = .99; }, 'outside-frame'],
      [(o: PhotoObservation) => { o.anchors.windmill!.width = .9; }, 'alignment'],
      [(o: PhotoObservation) => { o.anchors.windmill!.depth = 1; }, 'depth-order'],
      [(o: PhotoObservation) => { o.anchors.windmill!.x = NaN; }, 'missing-landmark'],
      [(o: PhotoObservation) => { delete o.anchors['forest-chime']; }, 'missing-landmark'],
      [(o: PhotoObservation) => { o.anchors['forest-chime']!.occluded = true; }, 'occluded'],
      [(o: PhotoObservation) => { o.anchors['forest-chime']!.height = .01; }, 'too-small'],
      [(o: PhotoObservation) => { o.anchors['forest-chime']!.x = .5; }, 'alignment'],
      [(o: PhotoObservation) => { o.anchors.windmill!.width = .08; }, 'too-small'],
    ] as const) {
      const observation = forest(); change(observation);
      expect(evaluateFrame(state, observation, 'forest').reason).toBe(reason);
    }
  });
  it('names the subject that failed while the other subjects are in frame', () => {
    const state = begin();
    for (const [id, name] of [['forest-chime', '风铃'], ['windmill', '风车']] as const) {
      const shot = forest();
      shot.anchors[id]!.occluded = true;
      expect(evaluateFrame(state, shot, 'forest').hint).toContain(name + '被挡住了');
      shot.anchors[id]!.occluded = false;
      shot.anchors[id]!.height = .012;
      expect(evaluateFrame(state, shot, 'forest').hint).toContain(name + '在画面里太小');
    }
    const shot = town();
    shot.anchors.mountain!.x = .98;
    expect(evaluateFrame(interact(move(state, 'town'), 'town-lever'), shot, 'town').hint).toContain('双峰出了画框');
  });
  it('town needs its opened gate, mountain inside arch, and red mailbox below', () => {
    let s = move(begin(), 'town');
    expect(evaluateFrame(s, town(), 'town').reason).toBe('open-gate');
    s = interact(s, 'town-lever');
    expect(evaluateFrame(s, town(), 'town').matched).toBe(true);
    const wrong = town(); wrong.anchors['red-mailbox']!.y = .3;
    expect(evaluateFrame(s, wrong, 'town').matched).toBe(false);
    const wrongMountain = town(); wrongMountain.anchors.mountain!.x = .9;
    expect(evaluateFrame(s, wrongMountain, 'town').matched).toBe(false);
    expect(evaluateFrame(s, forest(), 'town').reason).toBe('wrong-area');
  });
  it('allows an ordinary first photo without pretending it matched the tutorial', () => {
    const s = snap(begin(), free('post'));
    expect(s.durable.tutorial.photoTaken).toBe(true);
    expect(s.durable.tutorial.compositionMatched).toBe(false);
    expect(s.durable.stamps).toEqual({ forest: false, town: false });
  });
  it('completes the optional doorway tutorial only from its own geometry', () => {
    const observation: PhotoObservation = { area: 'post', vantageTags: ['post-overlook'], anchors: { 'post-door': anchor(.5,.5,.4,.5,4), windmill: anchor(.5,.5,.1,.12,200) } };
    const s = snap(begin(), observation);
    expect(s.durable.tutorial.compositionMatched).toBe(true);
    expect(s.durable.stamps).toEqual({ forest: false, town: false });
  });
});

describe('complete journey with player-selected order and photograph', () => {
  for (const order of [['forest', 'town'], ['town', 'forest']] as const) {
    for (const mailbox of ['post-mailbox', 'forest-mailbox', 'town-mailbox', 'ridge-mailbox']) {
      it(`finishes ${order.join(' → ')} at ${mailbox} with a photo selected before both cards`, () => {
        let s = snap(move(begin(), 'ridge'), free());
        const personal = s.durable.film.at(-1)!.id;
        s = step(s, { type: 'select-ending-photo', photoId: personal });
        expect(canSendLetter(s)).toBe(false);
        s = complete(complete(s, order[0]), order[1]);
        expect(canSendLetter(s)).toBe(false); // Matching opens the world; answering is an explicit choice.
        s = answerReplies(s);
        expect(canSendLetter(s)).toBe(true);
        s = step(s, { type: 'close-camera' });
        const beforeMail = {weather:s.durable.weather,clock:{...s.durable.clock},cycle:{...s.durable.weatherCycle},sunset:worldState(s).sunset};
        s = interact(s, mailbox);
        expect(s.durable.mailed).toBe(true);
        expect(s.durable.endingPhoto!.id).toBe(personal);
        expect(s.runtime.screen).toBe('ending');
        expect(worldState(s).sunset).toBe(beforeMail.sunset);
        expect(s.durable.weather).toBe(beforeMail.weather);
        expect(s.durable.clock).toEqual(beforeMail.clock);
        expect(s.durable.weatherCycle).toEqual(beforeMail.cycle);
        s = step(s, { type: 'finish-ending' });
        s = step(s, { type: 'set-weather', weather: 'rain' });
        expect(s.durable.weather).toBe(beforeMail.weather);
        expect(s.durable.clock).toEqual(beforeMail.clock);
        expect(s.durable.weatherCycle).toEqual(beforeMail.cycle);
        s = step(s, { type: 'set-creative-mode', enabled: true });
        s = step(s, { type: 'set-weather', weather: 'rain' });
        expect(s.durable.weather).toBe('rain');
        expect(canMove(s)).toBe(true);
        expect(s.durable.endingSeen).toBe(true);
      });
    }
  }
  it('keeps interactions local, rejects remote lever and premature mail, and triggers a card only once', () => {
    let s = move(begin(), 'town');
    s = step(s, { type: 'interact', id: 'town-lever' });
    expect(s.durable.gateOpened).toBe(false);
    s = interact(s, 'town-mailbox');
    expect(s.durable.mailed).toBe(false);
    s = complete(s, 'forest');
    const repeated = reduceJourney(s, { type: 'take-photo', observation: forest(), thumbnail: s.durable.film.at(-1)!.thumbnail });
    expect(repeated.events.some(e => e.type === 'world:windmill-awaken')).toBe(false);
    expect(repeated.events.some(e => e.type === 'photo:matched')).toBe(false);
    expect(repeated.state.durable.totalPhotos).toBe(2);
  });
  it('a full 12-photo album does not block either card or the selected ending photo', () => {
    let s = move(begin(), 'ridge');
    for (let i = 0; i < 12; i++) s = step(snap(s, free()), { type: 'keep-photo' });
    expect(s.durable.album).toHaveLength(12);
    s = answerReplies(complete(complete(s, 'forest'), 'town'));
    const draft = s.durable.film.at(-1)!;
    const full = reduceJourney(s, { type: 'keep-photo' });
    expect(full.events.some(e => e.type === 'album:full')).toBe(true);
    s = step(full.state, { type: 'select-ending-photo', photoId: draft.id });
    s = step(s, { type: 'delete-film-photo', photoId: s.durable.film.at(-1)!.id });
    s = step(s, { type: 'close-camera' });
    s = interact(s, 'post-mailbox');
    expect(s.durable.mailed).toBe(true);
    expect(s.durable.album).toHaveLength(12);
    expect(s.durable.cardPhotos.town!.id).toBe(draft.id);
  });
  it('replacing/deleting an album photo preserves its independently chosen postcard', () => {
    let s = snap(move(begin(), 'ridge'), free());
    const selected = s.durable.film.at(-1)!.id;
    s = step(s, { type: 'select-ending-photo', photoId: selected });
    s = step(s, { type: 'keep-photo' });
    s = snap(s, free());
    const replacement = s.durable.film.at(-1)!.id;
    s = step(s, { type: 'keep-photo', replaceId: selected });
    s = step(s, { type: 'delete-photo', photoId: replacement });
    expect(s.durable.album).toHaveLength(0);
    expect(s.durable.endingPhoto!.id).toBe(selected);
    expect(s.durable.endingPhoto!.thumbnail).toBeTruthy();
  });
  it('records six distinct discoveries only at their scene interactions; the courtyard letter waits for the town', () => {
    let s = begin();
    s = step(s, { type: 'discover', id: 'hidden-trail' });
    expect(s.durable.discoveries).toHaveLength(0);
    s = interact(s, 'discover:last-letter');
    expect(s.durable.discoveries).toHaveLength(0);
    const ids: DiscoveryId[] = ['hidden-trail', 'old-stamp', 'lost-postcard', 'sunset-seat', 'wind-song'];
    for (const id of ids) { s = interact(s, `discover:${id}`); s = interact(s, `discover:${id}`); }
    expect(s.durable.discoveries).toHaveLength(5);
    s = complete(s, 'town'); s = step(s, { type: 'close-camera' });
    s = interact(s, 'discover:last-letter');
    expect(s.durable.discoveries).toHaveLength(6);
  });
});

describe('pause, movement, and reversible traversal', () => {
  it('settings overlay pauses independently without changing screen or clearing blur/platform reasons', () => {
    let s = begin();
    s = step(s, { type: 'pause', reason: 'ui' });
    s = step(s, { type: 'pause', reason: 'ui' });
    expect(s.runtime.pauseReasons).toEqual(['ui']);
    expect(s.runtime.screen).toBe('play');
    expect(toPresentationView(s).screen).toBe('play');
    expect(canMove(s)).toBe(false);
    s = step(s, { type: 'tick', deltaSeconds: 1 });
    expect(s.durable.playSeconds).toBe(0);
    s = step(s, { type: 'set-settings', settings: { musicVolume: .3 } });
    expect(s.durable.settings.musicVolume).toBe(.3);
    s = step(s, { type: 'pause', reason: 'blur' });
    s = step(s, { type: 'pause', reason: 'platform' });
    s = step(s, { type: 'resume', reason: 'ui' });
    expect(s.runtime.pauseReasons).toEqual(['blur', 'platform']);
    expect(s.runtime.screen).toBe('play');
    expect(toPresentationView(s).screen).toBe('play');
    expect(canMove(s)).toBe(false);
    s = step(s, { type: 'resume', reason: 'blur' });
    expect(canMove(s)).toBe(false);
    s = step(s, { type: 'resume', reason: 'platform' });
    expect(canMove(s)).toBe(true);
    s = step(s, { type: 'open-camera' });
    s = step(s, { type: 'pause', reason: 'ui' });
    expect(s.runtime.screen).toBe('photo');
    expect(toPresentationView(s).screen).toBe('play');
    const restored = restoreJourney(serializeJourney(s), spawn).state;
    expect(restored.runtime.pauseReasons).toEqual([]);
    s = step(s, { type: 'resume', reason: 'ui' });
    expect(s.runtime.screen).toBe('photo');
    expect(s.runtime.pauseReasons).toEqual([]);
  });
  it('freezes time and input across menu, pause, journal, and stacked lifecycle reasons', () => {
    let s = step(createJourney(spawn), { type: 'tick', deltaSeconds: 10 });
    expect(s.durable.playSeconds).toBe(0);
    s = step(s, { type: 'start' });
    s = step(s, { type: 'pause', reason: 'hidden' });
    s = step(s, { type: 'pause', reason: 'platform' });
    s = step(s, { type: 'resume', reason: 'hidden' });
    s = step(s, { type: 'tick', deltaSeconds: 1 });
    expect(canMove(s)).toBe(false); expect(s.durable.playSeconds).toBe(0);
    s = step(s, { type: 'resume', reason: 'platform' });
    expect(canMove(s)).toBe(true);
    s = step(s, { type: 'set-screen', screen: 'journal' });
    s = step(s, { type: 'tick', deltaSeconds: 1 });
    expect(s.durable.playSeconds).toBe(0);
    s = step(s, { type: 'set-screen', screen: 'play' });
    s = step(s, { type: 'tick', deltaSeconds: 100 });
    expect(s.durable.playSeconds).toBe(1); // A long background frame cannot fast-forward traversal.
  });
  it('accepts controller-validated photography walking and turning and preserves modal return state', () => {
    let s = step(begin(), { type: 'open-camera' });
    s = step(s, { type: 'set-pose', pose: { ...spawn, position: [100, 100, 100], yaw: 1 } });
    expect(s.durable.player.position).toEqual([100,100,100]);
    expect(s.durable.player.yaw).toBe(1);
    s = step(s, { type: 'set-screen', screen: 'map' });
    s = step(s, { type: 'set-screen', screen: 'play' });
    expect(s.runtime.screen).toBe('photo');
  });
  it('animates the bridge once, freezes it during a pause, and restores a completed safe bridge', () => {
    let s = complete(begin(), 'town');
    expect(worldState(s).bridgeWalkable).toBe(false);
    s = step(s, { type: 'tick', deltaSeconds: 1 });
    const progress = s.runtime.bridgeProgress;
    s = step(s, { type: 'pause', reason: 'blur' });
    s = step(s, { type: 'tick', deltaSeconds: 1 });
    expect(s.runtime.bridgeProgress).toBe(progress);
    expect(worldState(restoreJourney(serializeJourney(s), spawn).state).bridgeWalkable).toBe(true);
    s = step(s, { type: 'resume', reason: 'blur' });
    let arrivals = 0;
    for (let i = 0; i < 8; i++) { const result = reduceJourney(s, { type: 'tick', deltaSeconds: 1 }); s = result.state; arrivals += result.events.filter(e => e.type === 'world:bridge-lowered').length; }
    expect(arrivals).toBe(1);
  });
  it('ride progress follows the controller and only a real landing finishes after any elapsed duration', () => {
    let s = move(begin(), 'forest');
    s = step(s, { type: 'set-context', nearby: 'zipline' });
    s = step(s, { type: 'start-ride', destination: spawn, duration: 4 });
    expect(s.runtime.ride).toBeNull();
    s = step(complete(s, 'forest'), { type: 'close-camera' });
    s = step(s, { type: 'set-context', nearby: 'zipline' });
    const boarding = s.durable.player;
    s = step(s, { type: 'start-ride', destination: spawn, duration: 4 });
    s = step(s, { type: 'tick', deltaSeconds: 1 });
    expect(s.runtime.ride!.progress).toBe(0);
    s = step(s, { type: 'ride-progress', progress: .25 });
    expect(s.runtime.ride!.progress).toBe(.25);
    const restored = restoreJourney(serializeJourney(s), spawn).state;
    expect(restored.runtime.ride).toBeNull();
    expect(restored.durable.player).toEqual(boarding);
    s = step(s, { type: 'pause', reason: 'hidden' });
    s = step(s, { type: 'tick', deltaSeconds: 1 });
    s = step(s, { type: 'ride-progress', progress: .75 });
    expect(s.runtime.ride!.progress).toBe(.25);
    s = step(s, { type: 'resume', reason: 'hidden' });
    for (let i = 0; i < 20; i++) s = step(s, { type: 'tick', deltaSeconds: 1 });
    expect(s.runtime.ride!.elapsed).toBe(21);
    expect(s.runtime.ride!.progress).toBe(.25);
    expect(s.durable.ziplineRides).toBe(0);
    s = step(s, { type: 'finish-ride' });
    expect(s.runtime.ride).not.toBeNull();
    s = step(s, { type: 'finish-ride', pose: { ...spawn, position: [200, 14, -220] } });
    expect(s.runtime.ride).not.toBeNull();
    const landing: Pose = { ...spawn, position: [0, 14.08, -220], yaw: 1 };
    const result = reduceJourney(s, { type: 'finish-ride', pose: landing });
    s = result.state;
    expect(result.events.filter(e => e.type === 'ride:arrived')).toHaveLength(1);
    expect(s.runtime.ride).toBeNull(); expect(s.durable.ziplineRides).toBe(1);
    expect(s.durable.player).toEqual(landing);
    const duplicate = reduceJourney(s, { type: 'finish-ride', pose: landing });
    expect(duplicate.state.durable.ziplineRides).toBe(1);
    expect(duplicate.events.some(e => e.type === 'ride:arrived')).toBe(false);
  });
  it('ride awaiting landing keeps safe-start saves, cancellation and menu return even at progress one', () => {
    let s = step(complete(begin(), 'forest'), { type: 'close-camera' });
    s = step(s, { type: 'set-context', nearby: 'zipline' });
    const boarding = s.durable.player;
    s = step(s, { type: 'start-ride', destination: spawn, duration: 4 });
    s = step(s, { type: 'ride-progress', progress: NaN });
    expect(s.runtime.ride!.progress).toBe(0);
    s = step(s, { type: 'ride-progress', progress: .7 });
    s = step(s, { type: 'ride-progress', progress: .2 });
    expect(s.runtime.ride!.progress).toBe(.7);
    s = step(s, { type: 'ride-progress', progress: 2 });
    expect(s.runtime.ride!.progress).toBe(1);
    expect(s.durable.ziplineRides).toBe(0);
    expect(restoreJourney(serializeJourney(s), spawn).state.durable.player).toEqual(boarding);
    const invalid = step(s, { type: 'finish-ride', pose: { ...spawn, yaw: NaN } });
    expect(invalid.runtime.ride).not.toBeNull();
    for (const type of ['cancel-ride', 'return-to-menu'] as const) {
      const stopped = step(s, { type });
      expect(stopped.durable.player).toEqual(boarding);
      expect(stopped.runtime.ride).toBeNull();
      expect(stopped.durable.ziplineRides).toBe(0);
    }
    const finished = step(s, { type: 'finish-ride' });
    expect(finished.durable.player).toEqual(spawn);
    expect(finished.durable.ziplineRides).toBe(1);
  });
  it('does not mutate its input state when stamps, discoveries, photos, or settings change', () => {
    const initial = begin(), before = JSON.stringify(initial);
    const progressed = complete(initial, 'forest');
    step(progressed, { type: 'set-settings', settings: { musicVolume: 0 } });
    expect(JSON.stringify(initial)).toBe(before);
    expect(progressed.durable.settings.musicVolume).not.toBe(0);
  });
});

describe('durable save boundaries', () => {
  it('round-trips the ending, independent photos, settings and discoveries without replaying effects', () => {
    let s = readyToMail(); s = interact(s, 'post-mailbox');
    s = step(s, { type: 'set-settings', settings: { masterVolume: .2, quality: 'balanced', reducedMotion: true } });
    const saved = serializeJourney(s), restored = restoreJourney(saved, spawn);
    expect(restored.status).toBe('loaded');
    expect(restored.state.durable).toEqual(s.durable);
    expect(restored.state.runtime.screen).toBe('menu');
    expect(saved).not.toContain('observation');
    expect(restored.state.runtime.pauseReasons).toEqual([]);
    expect(step(restored.state, { type: 'start' }).runtime.screen).toBe('ending');
  });
  it('bounds and sanitizes malformed optional content while preserving coherent progress', () => {
    const s = readyToMail(), encoded = JSON.parse(JSON.stringify({game:'shanye-laixin',version:3,journey:{...s.durable,version:3,pendingPhoto:s.durable.film.at(-1)}}));
    for (const key of ['clock','checkIns','trackedPhotoSpot','creativeMode','creativeReturn','replyPhotos','legacyReplyUnlock','endingNote']) delete encoded.journey[key];
    const p = encoded.journey.pendingPhoto;
    encoded.journey.album = [p, p, { ...p, id: 'bad-id' }];
    encoded.journey.pendingPhoto.thumbnail = 'javascript:alert(1)';
    encoded.journey.player = { position: [NaN, 0, 0], area: 'town', yaw: 0, pitch: 0 };
    encoded.journey.settings = { sensitivity: 100, masterVolume: -1, quality: 'ultra' };
    encoded.journey.totalPhotos = 0;
    encoded.journey.discoveries = [{ id: '__proto__' }, { id: 'old-stamp' }, { id: 'old-stamp' }];
    const restored = restoreJourney(JSON.stringify(encoded), spawn).state;
    expect(restored.durable.album).toHaveLength(1);
    expect(restored.durable.film.at(-1)!.thumbnail).toBeNull();
    expect(restored.durable.player).toEqual(spawn);
    expect(restored.durable.settings.sensitivity).toBe(3);
    expect(restored.durable.settings.masterVolume).toBe(0);
    expect(restored.durable.settings.quality).toBe('high');
    expect(restored.durable.discoveries).toHaveLength(1);
    expect(restored.durable.totalPhotos).toBeGreaterThanOrEqual(p.sequence);
  });
  it('does not invent a completed ending from a malformed save', () => {
    const encoded = JSON.parse(serializeJourney(begin())); encoded.journey.mailed = true;
    const restored = restoreJourney(JSON.stringify(encoded), spawn);
    expect(restored.state.durable.mailed).toBe(false);
    expect(restored.warnings.length).toBeGreaterThan(0);
  });
  it('migrates the documented v1 album, selected photo, card flags and discovery IDs', () => {
    const source = readyToMail().durable;
    const old = { version: 1, started: true, completed: source.stamps, gateOpen: true, photos: [source.endingPhoto], selectedPhotoId: source.endingPhoto!.id, player: spawn, discoveries: ['old-stamp'] };
    const migrated = restoreJourney(JSON.stringify(old), spawn);
    expect(migrated.status).toBe('migrated');
    expect(canSendLetter(migrated.state)).toBe(true);
    expect(migrated.state.durable.album).toHaveLength(1);
    expect(migrated.state.durable.discoveries[0]!.id).toBe('old-stamp');
    expect(restoreJourney(serializeJourney(migrated.state), spawn).status).toBe('loaded');
  });
  it('reads without modifying corrupt/future saves and returns storage failures instead of throwing', () => {
    for (const encoded of ['{', JSON.stringify({ version: 999, game: 'shanye-laixin' }), 'x'.repeat(3_500_001)]) {
      let writes = 0;
      const storage = { getItem: () => encoded, setItem: () => { writes++; } };
      expect(['invalid', 'future-version']).toContain(loadFromStorage(storage, spawn).status);
      expect(writes).toBe(0);
    }
    expect(loadFromStorage({ getItem() { throw new Error('blocked'); }, setItem() {} }, spawn).status).toBe('invalid');
    expect(saveToStorage({ getItem: () => null, setItem() { throw new Error('quota'); } }, begin())).toEqual({ ok: false, reason: 'quota' });
  });
});

describe('presentation projection', () => {
  it('postal onboarding accepts a free photograph and offers an explicit path to the later letters', () => {
    let s = step(begin(), { type: 'open-camera' });
    s = step(s, { type: 'set-context', nearby: null, observation: free('post') });
    const initial = toPresentationView(s);
    expect(initial.objective).toBe('给阿禾寄一座山');
    expect(initial.camera.feedback).toContain('按 A 或 D 横移');
    expect(initial.hint).not.toContain('门洞');
    expect(initial.camera.target).toBeUndefined();
    expect(initial.camera.ready).toBe(false);
    expect(s.durable.tutorial.photoTaken).toBe(false);
    s = snap(s, free('post'));
    expect(toPresentationView(s).mountainLetter?.candidates).toEqual([]);
    s = step(s, { type: 'set-screen', screen: 'journal' });
    s = step(s, { type: 'skip-opening-photo' });
    s = step(s, { type: 'set-screen', screen: 'play' });
    const photographed = toPresentationView(s);
    expect(s.durable.tutorial.photoTaken).toBe(true);
    expect(s.durable.tutorial.compositionMatched).toBe(false);
    expect(s.durable.film.at(-1)!.matchedCards).toEqual([]);
    expect(s.durable.stamps).toEqual({ forest: false, town: false });
    expect(photographed.objective).toContain('哪儿拐弯');
    expect(photographed.objectiveDetail).toContain('也可以先去石巷旧镇');
    expect(photographed.camera.feedback).toContain('不必对齐旧卡');
    const reloaded = step(restoreJourney(serializeJourney(s), spawn).state, { type: 'start' });
    expect(toPresentationView(reloaded).objective).toBe(photographed.objective);
  });
  it('keeps successful photographs in the film without forcing review UI without giving UI quest authority', () => {
    let s = move(begin(), 'forest'); s = step(s, { type: 'open-camera' });
    s = step(s, { type: 'set-context', nearby: null, observation: forest() });
    const frame = toPresentationView(s, { mapBounds: { minX: -400, maxX: 400, minZ: -400, maxZ: 400 } });
    expect(frame.screen).toBe('play'); expect(frame.camera.active).toBe(true); expect(frame.camera.ready).toBe(true);
    expect(frame.completed.forest).toBe(false);
    s = snap(s, forest());
    expect(toPresentationView(s).screen).toBe('play');
    expect(toPresentationView(s).film).toHaveLength(1);
    expect(actionFromPresentation(s, 'close-panel')).toEqual({ type: 'close-camera' });
    expect(actionFromPresentation(s, 'select-ending-photo')).toEqual({ type: 'select-ending-photo', photoId: s.durable.film.at(-1)!.id });
    expect(actionFromPresentation(s, 'shutter')).toBeNull();
    expect(frame.playerMap!.x).toBeGreaterThan(0);
  });
});
