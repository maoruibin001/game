import { describe, expect, it } from 'vitest';
import { actionFromPresentation, toPresentationView, canMove, createJourney, currentObjective, nearbyInteraction, reduceJourney, restoreJourney, serializeJourney, worldState } from '../index.ts';
import type { AreaId, JourneyAction, JourneyState, Pose } from '../types.ts';

const start: Pose = { position: [0, 14, -235], yaw: 0, pitch: .13, area: 'post' };
const road: Pose = { position: [146, 24, 11], yaw: 1, pitch: .13, area: 'town' };
const thumbnail = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC9sAAAAASUVORK5CYII=';
const step = (state: JourneyState, action: JourneyAction) => reduceJourney(state, action).state;
const begin = () => step(createJourney(start, { weatherSeed: 4271 }), { type: 'start' });
function at(area: AreaId) { return step(begin(), { type: 'set-pose', pose: { ...start, area } }); }
function photographed() {
  let state = step(begin(), { type: 'open-camera' });
  state = step(state, { type: 'take-photo', observation: { area: 'post', vantageTags: [], anchors: {} }, thumbnail, original:{key:'shanye:original:recovery-test',width:1920,height:1080,bytes:12000,mime:'image/jpeg'} });
  state = step(state, { type: 'keep-photo' });
  return step(state, { type: 'select-ending-photo', photoId: state.durable.film[0]!.id });
}

describe('engine-validated road recovery', () => {
  it('cancels a timed photo and legacy draft while retaining every saved photograph, weather, and story value', () => {
    let state = photographed();
    state = step(state, { type: 'set-weather', weather: 'rain' });
    state = step(state, { type: 'set-photography', settings: { mode: 'portrait', timerSeconds: 3 } });
    state = step(state, { type: 'begin-countdown' });
    state = step(state, { type: 'set-context', nearby: 'post-mailbox', observation: { area: 'post', vantageTags: [], anchors: {} } });
    state.durable.pendingPhoto = state.durable.film[0]!;
    state.runtime.bridgeProgress = .35;
    const before = structuredClone(state);
    const transition = reduceJourney(state, { type: 'recover-path', pose: road });
    const recovered = transition.state;
    expect(recovered.durable).toEqual({ ...before.durable, player: road, pendingPhoto: null });
    expect(recovered.runtime).toMatchObject({ screen: 'play', returnScreen: 'play', ride: null, countdownSeconds: null, nearby: null, observation: null, lastComposition: null, bridgeProgress: .35, inputEpoch: before.runtime.inputEpoch + 1 });
    expect(transition.events.map(event => event.type)).toEqual(['photo:timer-cancelled', 'input:reset', 'screen:changed', 'journey:recovered']);
    expect(canMove(recovered)).toBe(true);
    expect(state).toEqual(before);
    const restored = restoreJourney(serializeJourney(recovered), start);
    expect(restored.status).toBe('loaded');
    expect(restored.state.durable.player).toEqual(road);
    expect(restored.state.durable.album).toEqual(recovered.durable.album);
    expect(restored.state.durable.endingPhoto).toEqual(recovered.durable.endingPhoto);
    expect(restored.state.durable.weatherCycle).toEqual(recovered.durable.weatherCycle);
  });

  it('recovers from a paused ride without finishing it, removing lifecycle pauses, or granting a quest reward', () => {
    let state = at('forest');
    state.durable.stamps.forest = true;
    state = step(state, { type: 'set-context', nearby: 'zipline' });
    state = step(state, { type: 'start-ride', destination: start });
    state = step(state, { type: 'set-screen', screen: 'paused' });
    for (const reason of ['ui', 'hidden', 'blur', 'platform'] as const) state = step(state, { type: 'pause', reason });
    expect(state.runtime.ride).not.toBeNull();
    const before = structuredClone(state.durable);
    const transition = reduceJourney(state, { type: 'recover-path', pose: road });
    expect(transition.state.durable).toEqual({ ...before, player: road });
    expect(transition.state.runtime.ride).toBeNull();
    expect(transition.state.runtime.pauseReasons).toEqual(['hidden', 'blur', 'platform']);
    expect(canMove(transition.state)).toBe(false);
    expect(worldState(transition.state)).toMatchObject({ gateOpen: false, bridgeWalkable: false, townLights: false, courtyardOpen: false });
    expect(transition.events.some(event => event.type === 'ride:arrived' || event.type.startsWith('world:') || event.type === 'photo:matched')).toBe(false);
    let resumed = transition.state;
    for (const reason of ['hidden', 'blur', 'platform'] as const) resumed = step(resumed, { type: 'resume', reason });
    expect(canMove(resumed)).toBe(true);
  });

  it('cannot make a frontend payload choose a destination or start an unstarted/ending journey', () => {
    expect(actionFromPresentation(begin(), 'recover-path', { pose: road })).toBeNull();
    expect(reduceJourney(createJourney(start), { type: 'recover-path', pose: road }).events).toEqual([]);
    const ending = begin(); ending.runtime.screen = 'ending';
    expect(reduceJourney(ending, { type: 'recover-path', pose: road }).state.durable.player).toEqual(start);
    expect(reduceJourney(begin(), { type: 'recover-path', pose: { ...road, position: [NaN, 0, 0] } }).events).toEqual([]);
  });

  it('retains a legacy draft when it is the only saved copy of a photograph', () => {
    const state = photographed(), photo = state.durable.film[0]!;
    state.durable.film = []; state.durable.album = []; state.durable.endingPhoto = null;
    state.durable.pendingPhoto = photo;
    const recovered = step(state, { type: 'recover-path', pose: road });
    expect(recovered.runtime.screen).toBe('play');
    expect(recovered.durable.pendingPhoto).toEqual(photo);
    expect(step(recovered, { type: 'keep-photo' }).durable.album).toEqual([photo]);
    const restored = restoreJourney(serializeJourney(recovered), start).state;
    expect(restored.durable.film).toContainEqual(photo);
  });
});

describe('guidance follows the place and its actual progress', () => {
  it('allows town first and gives the mailbox the same local lever clue before the first photo', () => {
    let state = at('town');
    state = step(state, { type: 'set-context', nearby: 'town-mailbox' });
    const clue = currentObjective(state).detail;
    expect(clue).toContain('系红绳的绞盘');
    expect(clue).toContain('按 E');
    expect(clue).not.toContain('先去石巷旧镇');
    expect(clue).not.toContain('再按旧卡去风来林地');
    expect(nearbyInteraction(state)?.detail).toBe(clue);
    expect(step(state, { type: 'interact', id: 'town-mailbox' }).runtime.notice).toBe(clue);
    state = step(state, { type: 'set-context', nearby: 'town-lever' });
    expect(nearbyInteraction(state)).toMatchObject({ key: 'E', label: '转动红绳绞盘', disabled: false });
    state = step(state, { type: 'interact', id: 'town-lever' });
    expect(currentObjective(state).detail).toContain('木屏已打开');
    expect(currentObjective(state).detail).toContain('红邮筒');
    expect(currentObjective(state).detail).not.toContain('找到系红绳');
    expect(nearbyInteraction(state)?.disabled).toBe(true);
  });

  it('keeps the forest recommendation at the post office while local/finished regions update naturally', () => {
    const postal = step(step(photographed(), { type: 'set-screen', screen: 'journal' }), { type: 'skip-opening-photo' });
    expect(currentObjective(postal).detail).toContain('西侧林间邮路');
    expect(currentObjective(postal).detail).toContain('也可以先去石巷旧镇');
    const forest = at('forest');
    expect(currentObjective(forest).detail).toContain('你已到风来林地');
    const town = at('town'); town.durable.tutorial.photoTaken = true; town.durable.stamps.town = true;
    expect(currentObjective(town).detail).toContain('东岭长椅');
    expect(currentObjective(town).detail).not.toContain('先去石巷旧镇');
    town.durable.stamps.forest = true;
    expect(currentObjective(town).title).toContain('阿公在风车下等我');
    const original = postal.durable.endingPhoto!;
    const findWindow = { title: '给阿公补拍老窗', detail: expect.stringContaining('让窗格框住山门的屋脊再拍') };
    town.durable.replyPhotos.forest = { photo: { ...original, area: 'forest', matchedCards: ['forest'] }, variant: 'landmark', note: '' };
    expect(currentObjective(town)).toEqual(findWindow);
    town.durable.replyPhotos.town = { photo: { ...original, area: 'town', matchedCards: ['town'] }, variant: 'landmark', note: '' };
    expect(currentObjective(town)).toEqual(findWindow);
    town.durable.film.push({ ...original, id: 'hall-window-fixture', area: 'town', afternoonSubject: 'hall-window' });
    expect(currentObjective(town)).toEqual({
      title: '给阿公补拍老窗', detail: '在上院老窗旁按 E 交给客堂，对照新旧照片。',
    });
    town.durable.endingPhoto = postal.durable.endingPhoto;
    expect(currentObjective(town).title).toBe('给阿公补拍老窗');
    town.durable.mailed = true;
    expect(currentObjective(town).detail).toContain('交给客堂');
    expect(toPresentationView(town).replies?.final.response).toContain('去上院客堂');
    town.runtime.screen = 'ending';
    expect(step(town, {type:'finish-ending'}).runtime.notice).toBe(currentObjective(town).detail);
    town.durable.fireworks = {photo:town.durable.film.at(-1)!,day:1,minute:800};
    expect(currentObjective(town).detail).toContain('领火把');
    expect(toPresentationView(town).replies?.final.response).not.toContain('去上院客堂');
    expect(step(town, {type:'finish-ending'}).runtime.notice).toBe(currentObjective(town).detail);
  });
});
