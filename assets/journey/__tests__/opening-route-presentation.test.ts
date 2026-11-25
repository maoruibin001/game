import { describe, expect, it } from 'vitest';
import { createJourney, reduceJourney } from '../journey.ts';
import { toPresentationView } from '../presentation-adapter.ts';
import { restoreJourney, serializeJourney } from '../save.ts';
import type { ProjectedAnchor } from '../types.ts';
import { WORLD } from '../../shanye-world/world-layout.ts';

const anchor = (x: number, depth: number, width: number, height: number): ProjectedAnchor =>
  ({ x, y: 0.5, width, height, depth, visibleFraction: 1, occluded: false });

describe('ordinary opening and reply guidance', () => {
  it('guides the first free photo without restarting a completed introduction', () => {
    let state = reduceJourney(createJourney({ position: WORLD.spawn, yaw: WORLD.spawnYaw, pitch: .13, area: 'post' }), { type: 'start' }).state;
    expect(toPresentationView(state).opening?.step).toBe('camera');
    state = reduceJourney(state, { type: 'open-camera' }).state;
    expect(toPresentationView(state).opening?.step).toBe('frame');
    state.durable.tutorial.looked = true;
    expect(toPresentationView(state).opening?.step).toBe('shutter');
    state.durable.tutorial.photoTaken = true;
    expect(toPresentationView(state).opening).toBeUndefined();
  });

  it('keeps the old doorstep position and completed introduction when restoring a save', () => {
    const legacyPose = { position: [9.75, 14.08, -230.25], yaw: Math.PI, pitch: .13, area: 'post' } as const;
    const previous = reduceJourney(createJourney(legacyPose), { type: 'start' }).state;
    previous.durable.tutorial.photoTaken = true;
    const restored = restoreJourney(serializeJourney(previous),
      { position: WORLD.spawn, yaw: WORLD.spawnYaw, pitch: .13, area: 'post' }).state;
    expect(restored.durable.player).toEqual(legacyPose);
    expect(restored.durable.tutorial.photoTaken).toBe(true);
    expect(toPresentationView(restored).opening).toBeUndefined();
  });

  it('sends only a chosen real postal original and preserves it independently of the film', () => {
    const step = (state: ReturnType<typeof createJourney>, action: Parameters<typeof reduceJourney>[1]) => reduceJourney(state, action).state;
    let state = step(step(createJourney(), {type:'start'}), {type:'open-camera'});
    const thumbnail = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC9sAAAAASUVORK5CYII=';
    for (const count of [0, 1, 2] as const) {
      state = step(state, {
        type: 'take-photo', thumbnail,
        original: {key: `shanye:original:test-opening-${count}`, mime:'image/jpeg', width:1920, height:1080, bytes:14000},
        observation: {area:'post', vantageTags:[], anchors:{}, openingMountains:count},
      });
    }
    expect(state.durable.openingReply).toBe(null);
    state = step(state, {type:'send-opening-photo',photoId:'photo-3'});
    expect(state.durable.openingReply).toBe(null);
    state = step(state, {type:'set-screen',screen:'journal'});
    state = step(state, {type:'send-opening-photo',photoId:'photo-1'});
    expect(toPresentationView(state).mountainLetter).toMatchObject({
      photo: { id:'photo-1' }, response: expect.stringContaining('山倒在旁边'),
      request: expect.stringContaining('当年按快门'), oldPhotoBack: ['红瓦旁有风车。', '那扇窗把远处一道檐框在里面。'],
      canChooseRidge: true,
    });
    state = step(state, {type:'send-opening-photo',photoId:'photo-3'});
    state = step(state, {type:'delete-film-photo',photoId:'photo-3'});
    const reloaded = restoreJourney(serializeJourney(state)).state;
    expect(reloaded.durable.film.map(photo => photo.id)).toEqual(['photo-1','photo-2']);
    expect(reloaded.durable.openingReply).toMatchObject({id:'photo-3', openingMountains:2, original:{key:'shanye:original:test-opening-2'}});
    expect(toPresentationView(reloaded).mountainLetter?.response).toContain('两座都寄来了');
    expect(reloaded.durable.stamps).toEqual({forest:false, town:false});
  });

  it('keeps the card and feedback on the same goal when either or both forest compositions qualify', () => {
    let state = reduceJourney(createJourney({ position: [-170, 38, -52], yaw: 0, pitch: 0, area: 'forest' }), { type: 'start' }).state;
    state = reduceJourney(state, { type: 'open-camera' }).state;
    const mill = anchor(0.42, 30, 0.20, 0.30);
    const chime = anchor(0.72, 12, 0.07, 0.08);
    const arrow = anchor(0.7, 12, 0.08, 0.04);
    state.runtime.observation = { area: 'forest', vantageTags: ['forest-view'], anchors: { windmill: mill, 'forest-chime': chime } };
    expect(toPresentationView(state).camera).toMatchObject({ target: 'forest', ready: true });
    state.runtime.observation = { ...state.runtime.observation, anchors: { windmill: mill, 'postal-arrow': arrow } };
    expect(toPresentationView(state).camera).toMatchObject({ target: undefined, replyGuide: 'forest-sign', ready: true });
    expect(toPresentationView(state).camera.feedback).not.toContain('风铃也符合');
    state.runtime.observation.anchors = { ...state.runtime.observation.anchors, 'forest-chime': chime };
    const both = toPresentationView(state).camera;
    expect(both.replyGuide).toBe('forest-sign');
    expect(both.feedback).toContain('风铃也符合旧卡');
  });

  it('expands east ridge slots only for a route actually being explored, and keeps a posted postcard intact', () => {
    const state = reduceJourney(createJourney(), { type: 'start' }).state;
    expect(toPresentationView(state).replies?.items[0]?.route?.expanded).toBe(false);
    state.durable.player.area = 'ridge';
    expect(toPresentationView(state).replies?.items[0]?.route?.expanded).toBe(true);
    state.runtime.nearby = 'mailbox:ridge';
    state.durable.mailed = true;
    state.durable.endingSeen = true;
    state.durable.mailedFrom = 'mailbox:post';

    const reopened = reduceJourney(state, { type: 'interact', id: 'mailbox:ridge' });
    expect(reopened.state.runtime.screen).toBe('ending');
    expect(reopened.state.durable.mailedFrom).toBe('mailbox:post');
    expect(reopened.events.some(event => event.type === 'ending:mailed')).toBe(false);
  });
});
