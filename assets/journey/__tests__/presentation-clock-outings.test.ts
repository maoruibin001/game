import { describe, expect, it } from 'vitest';
import { actionFromPresentation, toPresentationView } from '../presentation-adapter.ts';
import { createJourney, reduceJourney } from '../journey.ts';
import { PHOTO_SPOTS } from '../photo-outings.ts';
import { restoreJourney, serializeJourney } from '../save.ts';
import { REST_POINTS } from '../rest-points.ts';
import type { Photo, Pose } from '../types.ts';

const spawn: Pose = { position: REST_POINTS[0].position, yaw: 0, pitch: 0, area: 'post' };
const begin = () => reduceJourney(createJourney(spawn), { type: 'start' }).state;
const bounds = { minX: -400, maxX: 400, minZ: -400, maxZ: 400 };
function photo(clock = true): Photo {
  return { id: 'photo-adapter', sequence: 1, title: '廊前', area: 'post', pose: spawn, capturedAt: 1, playSeconds: 17,
    thumbnail: null, matchedCards: [], memoryCandidates: [], tutorialMatch: false, caption: '',
    original: { key: 'original-adapter', bytes: 12000, width: 1920, height: 1080, mime: 'image/jpeg' },
    scene: { ...(clock ? { clock: { day: 2, minute: 1013 } } : {}), weather: 'afterglow', weatherBlend: 1, mode: 'landscape', lens: 'wide', exposure: 0, pose: 'look',
      camera: { position: [9.75, 15.72, -230.25], forward: [0, 0, 1], verticalFovRadians: 1, aspect: 16 / 9 }, subject: { position: spawn.position, yaw: 0, visible: false } } };
}

describe('clock and photography day presentation adapter', () => {
  it('projects the actual clock and three slots without advancing state or manufacturing movement', () => {
    const state = begin(), before = structuredClone(state), view = toPresentationView(state);
    expect(view.dayClock).toMatchObject({ day: 1, minute: 780, timeLabel: '13:00' });
    expect(view.dayClock!.sunsetLabel).toContain('17:40–18:20');
    expect(view.outings!.slots.map(s => s.slot)).toEqual(['morning', 'afternoon', 'sunset']);
    expect(view.outings!.slots.find(s => s.slot === 'afternoon')!.status).toBe('active');
    expect(view.outings!.slots.every(s => Number.isInteger(s.weatherProbability))).toBe(true);
    expect(view.movement).toBeUndefined(); expect(state).toEqual(before);
    const movement = { running: true, grounded: false }, moving = toPresentationView(state, { movement });
    expect(moving.movement).toEqual(movement); expect(moving.movement).not.toBe(movement);
  });
  it('normalizes route targets with the same real X/Z map bounds, retaining the followed destination', () => {
    const state = begin(); state.durable.trackedPhotoSpot = 'ridge-mail-road';
    const view = toPresentationView(state, { mapBounds: bounds }), tracked = view.outings!.tracked!;
    expect(tracked.mapTarget).toEqual({ x: (64 + 400) / 800, y: 1 - (204 + 400) / 800 });
    expect(tracked.routePoints!.at(-1)).toEqual(tracked.mapTarget);
    expect(tracked.routePoints![0]).toEqual({ x: (spawn.position[0] + 400) / 800, y: 1 - (spawn.position[2] + 400) / 800 });
    state.durable.weather = 'rain';
    expect(toPresentationView(state, { mapBounds: bounds }).outings!.tracked!.spotId).toBe('ridge-mail-road');
    expect(toPresentationView(state).outings!.tracked!.mapTarget).toBeUndefined();
  });
  it('follows the morning card at 13:00, including after save/refresh and the next day', () => {
    const state = begin();
    const action = actionFromPresentation(state, 'track-photo-spot', {spotId:'post-porch',slot:'morning'});
    expect(action).toEqual({type:'track-photo-spot',spotId:'post-porch',slot:'morning'});
    const chosen = reduceJourney(state, action!).state;
    chosen.durable.clock.minute = 1010;
    const restored = restoreJourney(serializeJourney(chosen), spawn).state;
    expect(toPresentationView(restored).outings?.tracked).toMatchObject(
      {spotId:'post-porch',slot:'morning',windowLabel:'06:00–09:00',nextWindowLabel:'次日 06:00–09:00'});
    restored.durable.clock = {day:2,minute:380};
    expect(toPresentationView(restored).outings?.tracked).toMatchObject(
      {spotId:'post-porch',slot:'morning',status:'active',windowLabel:'06:00–09:00' });
    expect(toPresentationView(restored).outings?.tracked?.nextWindowLabel).toBeUndefined();
    expect(actionFromPresentation(state, 'track-photo-spot', {spotId:'post-porch',slot:'imagined'})).toBeNull();
  });
  it('projects rest options only at the real accessible rest point and passes through the E pulse', () => {
    const state = begin(); state.durable.clock.minute = 1070; state.runtime.restRequest = 3;
    const point = toPresentationView(state).restPoint!;
    expect(point).toMatchObject({ id: 'post', available: true, requestOpen: 3 });
    expect(point.targets.find(t => t.target === 'sunset')!.arrivalLabel).toBe('次日 17:40');
    expect(point.targets.find(t => t.target === 'morning')!.arrivalLabel).toBe('次日 06:20');
    for (const t of point.targets) {
      const percentages = [...t.weatherSummary!.matchAll(/(\d+)%/g)].map(match => Number(match[1]));
      expect(percentages).toHaveLength(3); expect(percentages.reduce((sum, n) => sum + n, 0)).toBe(100);
    }
    state.durable.player = { ...spawn, position: [0, 14.08, -180] };
    expect(toPresentationView(state).restPoint).toBeUndefined();
    state.durable.player = { ...spawn, area: 'town', position: REST_POINTS[2].position };
    expect(toPresentationView(state).restPoint).toBeUndefined();
    state.durable.stamps.town = true; expect(toPresentationView(state).restPoint!.id).toBe('town');
    state.runtime.pauseReasons = ['hidden']; expect(toPresentationView(state).restPoint!.available).toBe(false);
  });
  it('does not advertise rest while creative mode disables it in the journey rules', () => {
    const state = begin(); state.durable.creativeMode = true;
    expect(toPresentationView(state).restPoint).toMatchObject({ id: 'post', available: false, reason: '退出自由创作后，再到歇脚点候时。' });
    state.durable.creativeMode = false;
    expect(toPresentationView(state).restPoint!.available).toBe(true);
  });
  it('keeps the completed daily original independently of film and preserves historic weather labels', () => {
    const state = begin(), actual = photo(); state.durable.clock = { day: 2, minute: 1013 };
    state.durable.checkIns = [{ day: 2, slot: 'afternoon', spotId: 'post-porch', photo: actual }];
    state.durable.film = [photo(false)];
    const view = toPresentationView(state), completed = view.outings!.slots.find(s => s.slot === 'afternoon')!;
    expect(completed).toMatchObject({ status: 'completed', spotId: 'post-porch' });
    expect(completed.photo).toMatchObject({ originalKey: 'original-adapter', width: 1920, height: 1080, dateLabel: '第 2 天 · 16:53' });
    expect(completed.photo!.sceneDescription).toContain('多云');
    expect(view.film![0]!.sceneDescription).toContain('雨后夕照');
    expect(view.film![0]!.dateLabel).toBe('旅途第 1 分钟');
  });
  it('gives honest overcast sunset advice and tomorrow labels after the window', () => {
    const state = begin(); state.durable.clock.minute = 1070; state.durable.weather = 'afterglow'; state.durable.trackedPhotoSpot = 'ridge-mail-road';
    const view = toPresentationView(state);
    expect(view.dayClock!.sunsetLabel).toContain('多云遮日');
    expect(view.outings!.tracked).toMatchObject({ weatherLabel: '晴朗', weatherProbability: 0 });
    state.durable.clock.minute = 1100;
    const later = toPresentationView(state);
    expect(later.dayClock!.sunsetLabel).toContain('次日 17:40');
    expect(later.outings!.slots.find(s => s.slot === 'sunset')!.nextWindowLabel).toBe('次日 17:40–18:20');
  });
});

describe('presentation action ownership', () => {
  it('keeps rest host-owned even with a nearby rest point or a forged position payload', () => {
    const state = begin();
    expect(actionFromPresentation(state, 'rest-until', { target: 'sunset' })).toBeNull();
    expect(actionFromPresentation(state, 'rest-until', { target: 'morning', position: REST_POINTS[0].position })).toBeNull();
  });
  it('maps only valid tracked IDs and explicit creative controls', () => {
    const state = begin();
    for (const spot of PHOTO_SPOTS) expect(actionFromPresentation(state, 'track-photo-spot', { spotId: spot.id })).toEqual({ type: 'track-photo-spot', spotId: spot.id });
    expect(actionFromPresentation(state, 'track-photo-spot', { spotId: null })).toEqual({ type: 'track-photo-spot', spotId: null });
    expect(actionFromPresentation(state, 'track-photo-spot', { spotId: 'imagined-temple' })).toBeNull();
    expect(actionFromPresentation(state, 'track-photo-spot')).toBeNull();
    expect(actionFromPresentation(state, 'set-creative-mode', { enabled: true })).toEqual({ type: 'set-creative-mode', enabled: true });
    expect(actionFromPresentation(state, 'set-creative-mode', { enabled: 'true' })).toBeNull();
    expect(actionFromPresentation(state, 'set-time', { minute: 1070 })).toBeNull();
    expect(actionFromPresentation(state, 'set-weather', { id: 'morning' })).toBeNull();
    state.durable.creativeMode = true;
    expect(actionFromPresentation(state, 'set-time', { minute: 1070 })).toEqual({ type: 'set-time', minute: 1070 });
    expect(actionFromPresentation(state, 'set-weather', { id: 'rain' })).toEqual({ type: 'set-weather', weather: 'rain' });
    for (const minute of [-1, 1440, NaN, Infinity, '17:50']) expect(actionFromPresentation(state, 'set-time', { minute })).toBeNull();
  });
});
