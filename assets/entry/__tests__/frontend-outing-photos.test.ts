import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PresentationCallbacks, PhotoOutingView, PresentationViewModel } from '../../presentation/types.ts';
import { initialPresentationView } from '../../presentation/types.ts';
import { createJourney } from '../../journey/journey.ts';
import { toPresentationView } from '../../journey/presentation-adapter.ts';
import type { Photo } from '../../journey/types.ts';
import { JOURNEY_CHANNEL } from '../protocol.ts';

const mocks = vi.hoisted(() => ({
  render: vi.fn(), callbacks: undefined as unknown, resolve: vi.fn(), download: vi.fn(),
  releaseUnused: vi.fn(), destroy: vi.fn(),
}));
vi.mock('@forgeax/engine/pack/source', () => ({ definePack: (v: unknown) => v, definePackageId: (v: string) => v }));
vi.mock('@forgeax/engine/app', () => ({ FORGEAX_FRAME_COMPLETED_EVENT: 'frame-completed' }));
vi.mock('@forgeax/engine/types', () => ({ ok: (v: unknown) => v }));
vi.mock('../../presentation/presentation.ts', () => ({ createPresentation: (_root: unknown, callbacks: unknown) => {
  mocks.callbacks = callbacks; return { render: mocks.render, flash: vi.fn(), destroy: vi.fn() };
} }));
vi.mock('../../presentation/audio.ts', () => ({ createJourneyAudio: () => ({
  unlock: vi.fn(), setMusicEnabled: vi.fn(), setMix: vi.fn(), setRegion: vi.fn(), setEnvironment: vi.fn(),
  pause: vi.fn(), resume: vi.fn(), update: vi.fn(), play: vi.fn(), destroy: vi.fn(),
}) }));
vi.mock('../../presentation/native-music.ts', () => ({ createNativeJourneyMusic: () => ({
  unlock: vi.fn(), update: vi.fn(), state: () => ({ phase: 'ready' }), destroy: vi.fn(),
}) }));
vi.mock('../../runtime/platform-bridge.ts', () => ({
  attachPlatformPause: () => vi.fn(), markJourneyReady: vi.fn(), platformBridge: { paused: false },
}));
vi.mock('../photo-repository.ts', () => ({ createPhotoRepository: () => ({
  resolve: mocks.resolve, download: mocks.download, releaseUnused: mocks.releaseUnused, destroy: mocks.destroy,
}) }));
import { presentation } from '../frontend.pack.ts';

const originalKey = 'photo-original:11111111-1111-4111-8111-111111111111';
let dispose: (() => void) | undefined;
beforeEach(() => { vi.clearAllMocks(); mocks.download.mockResolvedValue(undefined); });
afterEach(() => { dispose?.(); dispose = undefined; });

/** Exercise the real frontend message/action wiring with isolated host and storage doubles. */
async function mount() {
  const receivers = new Set<(event: { data: unknown }) => void>();
  const canvas = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
  const win = {
    localStorage: { getItem: vi.fn(() => null), setItem: vi.fn() },
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
  };
  const document = {
    defaultView: win, activeElement: canvas, head: { append: vi.fn() },
    createElement: () => ({ textContent: '', remove: vi.fn() }),
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
  };
  const port = { postMessage: vi.fn(), start: vi.fn(), removeEventListener: (_kind: string, callback: (event: { data: unknown }) => void) => receivers.delete(callback),
    addEventListener: (_kind: string, callback: (event: { data: unknown }) => void) => { receivers.add(callback); } };
  const host = { uiRoot: { ownerDocument: document }, canvas, port, app: { input: { clear: vi.fn() } } };
  await presentation.apply!({ gameHost: host, effect: async (factory: () => AsyncGenerator<() => void>) => {
    const generator = factory(), first = await generator.next();
    if (first.done) throw new Error('Frontend cleanup was not registered');
    dispose = first.value;
  } } as never, {});
  return {
    receive: (data: unknown) => { for (const receive of receivers) receive({ data }); },
    sent: port.postMessage,
    perform: (action: 'export-photo', payload: { photoId: string }) => (mocks.callbacks as PresentationCallbacks).onAction(action, payload),
    pagehide: () => {
      const listener = win.addEventListener.mock.calls.find(call => call[0] === 'pagehide')?.[1];
      if (typeof listener !== 'function') throw new Error('No ordinary pagehide listener');
      listener();
    },
  };
}

function message() {
  const state = createJourney(); state.durable.started = true;
  const photo: Photo = { id: 'outing-only', sequence: 3, title: '邮局廊下', area: 'post', pose: state.durable.player,
    capturedAt: 1, playSeconds: 2, thumbnail: 'data:image/jpeg;base64,preview', matchedCards: [], memoryCandidates: [],
    tutorialMatch: false, caption: '今日午后', original: { key: originalKey, width: 1920, height: 1080, mime: 'image/jpeg', bytes: 1200 } };
  state.durable.checkIns = [{ day: 1, slot: 'afternoon', spotId: 'post-porch', photo }];
  const outing: PhotoOutingView = {
    spotId: 'post-porch', spotTitle: '邮局廊下', regionLabel: '山谷邮局', slot: 'afternoon', slotTitle: '午后',
    status: 'completed', windowLabel: '13:00–17:40', weatherProbability: 76, weatherLabel: '晴朗',
    distanceMeters: 12, etaSeconds: 3, arrivalLabel: '15:31', canArriveInWindow: true,
    preparation: '沿邮路到廊下', facingHint: '朝向门廊', compositionHint: '把邮局收入画面',
    routePoints: [{ x: .3, y: .4 }, { x: .32, y: .4 }],
    photo: { id: photo.id, title: photo.title, location: '山谷邮局', imageUrl: photo.thumbnail!, originalKey },
  };
  const view: PresentationViewModel = { ...initialPresentationView(), outings: { day: 1, slots: [outing], tracked: outing } };
  return { channel: JOURNEY_CHANNEL, kind: 'state', state, view,
    controller: { speed: 0, mode: 'travel' }, environment: { weather: 'morning', rain: 0, wind: 0, sheltered: false },
    events: [], saveRevision: 1, restored: false };
}
const lastView = () => mocks.render.mock.calls.at(-1)![0] as PresentationViewModel;

describe('frontend daily outing original photographs', () => {
  it('answers an on-demand photography read even when the Worker frontend has no projection registrar', async () => {
    const host = await mount();
    host.receive({ channel: JOURNEY_CHANNEL, kind: 'photo-inspection-request', requestId: 'photo-inspect-1' });
    expect(host.sent).toHaveBeenCalledWith(expect.objectContaining({ kind: 'photo-inspection-result', requestId: 'photo-inspect-1',
      snapshot: expect.objectContaining({ capturesPending: 0, completedFrames: [], ready: false }) }));
    expect(host.sent.mock.calls.some(([message]) => message.kind === 'command' || message.kind === 'capture-request')).toBe(false);
  });

  it('hydrates once across slot and tracked views, then exports and retains a check-in-only original', async () => {
    let finish!: (value: unknown) => void;
    mocks.resolve.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const host = await mount(), stateMessage = message();
    expect(stateMessage.state.durable.album).toEqual([]);
    expect(stateMessage.state.durable.film).toEqual([]);
    host.receive(stateMessage);
    expect(lastView().outings!.slots[0]!.photo!.originalState).toBe('loading');
    expect(lastView().outings!.tracked!.photo!.originalState).toBe('loading');
    expect(mocks.resolve).toHaveBeenCalledExactlyOnceWith(originalKey);
    finish({ url: 'blob:real-original', photo: { width: 1920, height: 1080 } });
    await vi.waitFor(() => expect(lastView().outings!.slots[0]!.photo).toMatchObject({
      imageUrl: 'blob:real-original', width: 1920, height: 1080, originalState: 'ready',
    }));
    expect(lastView().outings!.tracked!.photo).toEqual(lastView().outings!.slots[0]!.photo);
    expect(lastView().outings!.tracked!.routePoints).toEqual(stateMessage.view.outings!.tracked!.routePoints);
    expect(stateMessage.view.outings!.slots[0]!.photo!.originalState).toBeUndefined();
    host.perform('export-photo', { photoId: 'outing-only' });
    expect(mocks.download).toHaveBeenCalledExactlyOnceWith(originalKey, '拍一卷山色-3-photo.jpg');
    host.pagehide();
    expect(mocks.releaseUnused).toHaveBeenCalledExactlyOnceWith(new Set([originalKey]));
  });

  it('hydrates and protects a photograph retained only by an answered letter', async () => {
    const host = await mount(), m = message(), photo = m.state.durable.checkIns[0]!.photo;
    m.state.durable.checkIns = []; photo.id = 'photo-3'; photo.area = 'forest'; photo.pose.area = 'forest'; photo.matchedCards = ['forest'];
    m.state.durable.stamps.forest = true;
    m.state.durable.replyPhotos.forest = { photo, variant: 'landmark', note: '' };
    m.view = toPresentationView(m.state);
    mocks.resolve.mockResolvedValue({ url: 'blob:letter-original', photo: { width: 1920, height: 1080 } });
    host.receive(m);
    await vi.waitFor(() => expect(lastView().replies!.items[0]!.photo).toMatchObject({ originalState: 'ready', imageUrl: 'blob:letter-original', width: 1920, height: 1080 }));
    expect(lastView().replies!.items[0]!.candidates[0]!.imageUrl).toBe('blob:letter-original');
    expect(mocks.resolve).toHaveBeenCalledExactlyOnceWith(originalKey);
    host.perform('export-photo', { photoId: 'photo-3' });
    expect(mocks.download).toHaveBeenCalledExactlyOnceWith(originalKey, '拍一卷山色-3-photo.jpg');
    host.pagehide(); expect(mocks.releaseUnused).toHaveBeenCalledExactlyOnceWith(new Set([originalKey]));
  });

  it('marks a missing original in both views and reports repository export failure without substituting the thumbnail', async () => {
    mocks.resolve.mockResolvedValue(null);
    const host = await mount(); host.receive(message());
    await vi.waitFor(() => expect(lastView().outings!.slots[0]!.photo!.originalState).toBe('missing'));
    expect(lastView().outings!.tracked!.photo).toMatchObject({ originalState: 'missing', imageUrl: 'data:image/jpeg;base64,preview' });
    expect(mocks.resolve).toHaveBeenCalledExactlyOnceWith(originalKey);
    mocks.download.mockRejectedValue(new Error('这张原照未保存在此设备。'));
    host.perform('export-photo', { photoId: 'outing-only' });
    await vi.waitFor(() => expect(lastView().toast).toMatchObject({ kind: 'error', title: '原照没有导出', message: '这张原照未保存在此设备。' }));
    expect(mocks.download).toHaveBeenCalledExactlyOnceWith(originalKey, '拍一卷山色-3-photo.jpg');
  });
});
