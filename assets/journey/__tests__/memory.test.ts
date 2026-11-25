import { describe, expect, it } from 'vitest';
import { actionFromPresentation, canSendLetter, cleanThumbnail, createJourney, evaluateMemoryFrame, reduceJourney, restoreJourney, serializeJourney, toPresentationView, worldState } from '../index.ts';
import type { AreaId, JourneyAction, JourneyEvent, JourneyState, PhotoObservation, Pose } from '../types.ts';

const spawn: Pose = { position: [0,14,-220], yaw: 0, pitch: 0, area: 'post' };
// Fixture proves the captured-image value is retained; browser capture owns actual rendered-image verification.
const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC9sAAAAASUVORK5CYII=';
const original = {key:'shanye:original:memory-test',width:1920,height:1080,bytes:12000,mime:'image/jpeg' as const};
const observation = (): PhotoObservation => ({ area: 'ridge', vantageTags: ['valley-letter-view'], anchors: {
  'memory-windmill': { x: .25, y: .4, width: .08, height: .12, depth: 250, visibleFraction: 1, occluded: false },
  'memory-town': { x: .75, y: .45, width: .07, height: .08, depth: 280, visibleFraction: 1, occluded: false },
} });
const step = (s: JourneyState, action: JourneyAction) => reduceJourney(s, action).state;
const begin = () => step(createJourney(spawn), { type: 'start' });
function move(s: JourneyState, area: AreaId): JourneyState {
  s = step(s, { type: 'close-camera' });
  return step(s, { type: 'set-pose', pose: { ...spawn, area } });
}
function discover(s: JourneyState, id: 'lost-postcard' | 'sunset-seat') {
  s = move(s, id === 'lost-postcard' ? 'town' : 'ridge');
  s = step(s, { type: 'set-context', nearby: `discover:${id}` });
  return reduceJourney(s, { type: 'interact', id: `discover:${id}` });
}
function capture(s: JourneyState, thumbnail: string | null = image, obs = observation()) {
  s = move(s, 'ridge'); s = step(s, { type: 'open-camera' });
  return reduceJourney(s, { type: 'take-photo', observation: obs, thumbnail, original, capturedAt: 12345 });
}
function clues(s = begin()) { return discover(discover(s, 'lost-postcard').state, 'sunset-seat').state; }
function completed() { return capture(clues()).state; }

describe('valley letter recognition across player-selected order', () => {
  for (const order of [
    ['photo','clue','seat'], ['photo','seat','clue'], ['clue','photo','seat'],
    ['seat','photo','clue'], ['clue','seat','photo'], ['seat','clue','photo'],
  ] as const) {
    it(`recognizes ${order.join(' → ')} once and does not require main cards or a time gate`, () => {
      let s = begin(); const events: JourneyEvent[] = [];
      for (const item of order) {
        const result = item === 'photo' ? capture(s) : discover(s, item === 'clue' ? 'lost-postcard' : 'sunset-seat');
        s = result.state; events.push(...result.events);
        if (item === 'photo') { const kept = reduceJourney(s, { type: 'keep-photo' }); s = kept.state; events.push(...kept.events); }
      }
      expect(events.filter(e => e.type === 'memory:unlocked')).toHaveLength(1);
      expect(s.durable.memories['valley-letter']!.photo.thumbnail).toBe(image);
      expect(s.durable.memories['valley-letter']!.photo.memoryCandidates).toEqual(['valley-letter']);
      expect(s.durable.stamps).toEqual({ forest: false, town: false });
      expect(s.durable.playSeconds).toBe(0);
      expect(s.durable.discoveries).toHaveLength(2);
      expect(worldState(s).valleyLetterOpened).toBe(true);
      expect(canSendLetter(s)).toBe(false);
    });
  }
  it('does not rediscover a discarded early photo, but recognizes one retained as the personal postcard', () => {
    let s = capture(begin()).state;
    expect(s.durable.film.at(-1)!.memoryCandidates).toEqual(['valley-letter']);
    s = step(s, { type: 'delete-film-photo', photoId: s.durable.film.at(-1)!.id });
    s = clues(s);
    expect(s.durable.memories['valley-letter']).toBeNull();
    let kept = capture(begin()).state;
    kept = step(kept, { type: 'select-ending-photo', photoId: kept.durable.film.at(-1)!.id });
    kept = step(kept, { type: 'delete-film-photo', photoId: kept.durable.film.at(-1)!.id });
    kept = clues(kept);
    expect(kept.durable.album).toHaveLength(0);
    expect(kept.durable.memories['valley-letter']!.photo.id).toBe(kept.durable.endingPhoto!.id);
  });
  it('requires the real-image payload even when geometry and both clues match', () => {
    for (const missing of [null, '', 'https://example.com/not-a-captured-image.png', 'javascript:alert(1)', 'data:image/png;base64,AA==', 'data:image/jpeg;base64,AA==', 'data:image/webp;base64,AA==']) {
      const s = capture(clues(), missing).state;
      expect(s.durable.film).toHaveLength(0);
      expect(s.durable.totalPhotos).toBe(0);
      expect(s.durable.memories['valley-letter']).toBeNull();
      expect(worldState(s).valleyLetterOpened).toBe(false);
    }
  });
  it('never rewards a lone clue or a paper-read action without an eligible retained image', () => {
    expect(capture(discover(begin(), 'lost-postcard').state).state.durable.memories['valley-letter']).toBeNull();
    expect(capture(discover(begin(), 'sunset-seat').state).state.durable.memories['valley-letter']).toBeNull();
    expect(clues().durable.memories['valley-letter']).toBeNull();
  });
  it('retains the embedded photo after album deletion and does not replace it on later automatic captures', () => {
    let s = completed(); const first = s.durable.memories['valley-letter']!;
    s = step(s, { type: 'keep-photo' });
    s = step(s, { type: 'delete-photo', photoId: first.photo.id });
    expect(s.durable.album).toHaveLength(0);
    expect(toPresentationView(s).memories![0]!.photo!.imageUrl).toBe(image);
    const next = capture(s); s = next.state;
    expect(next.events.some(e => e.type === 'memory:unlocked')).toBe(false);
    expect(s.durable.memories['valley-letter']!.photo.id).toBe(first.photo.id);
    const replacementId = s.durable.film.at(-1)!.id;
    const replacement = reduceJourney(s, { type: 'replace-memory-photo', memoryId: 'valley-letter', photoId: replacementId });
    expect(replacement.events.filter(e => e.type === 'memory:photo-replaced')).toHaveLength(1);
    expect(replacement.events.some(e => e.type === 'memory:unlocked')).toBe(false);
    expect(replacement.state.durable.memories['valley-letter']!.unlockedAtPlaySeconds).toBe(first.unlockedAtPlaySeconds);
    expect(replacement.state.durable.memories['valley-letter']!.photo.id).toBe(replacementId);
    expect(reduceJourney(replacement.state, { type: 'replace-memory-photo', memoryId: 'valley-letter', photoId: replacementId }).events).toHaveLength(0);
    expect(s.durable.memories['valley-letter']!.photo.id).toBe(first.photo.id); // Input state and its photograph were not mutated.
  });
  it('rejects an ordinary photograph as a replacement and keeps the first letter intact', () => {
    let s = completed(); const id = s.durable.memories['valley-letter']!.photo.id;
    s = capture(s, image, { area: 'ridge', anchors: {}, vantageTags: [] }).state;
    s = step(s, { type: 'replace-memory-photo', memoryId: 'valley-letter', photoId: s.durable.film.at(-1)!.id });
    expect(s.durable.memories['valley-letter']!.photo.id).toBe(id);
  });
  it('unfolds the letter even with a full album and keeps its photograph after the film candidate is deleted', () => {
    let s = begin();
    for (let i = 0; i < 12; i++) {
      s = capture(s, image, { area: 'ridge', anchors: {}, vantageTags: [] }).state;
      s = step(s, { type: 'keep-photo' });
    }
    s = capture(clues(s)).state;
    const photoId = s.durable.film.at(-1)!.id;
    expect(s.durable.album).toHaveLength(12);
    expect(s.durable.memories['valley-letter']!.photo.id).toBe(photoId);
    s = step(s, { type: 'keep-photo' });
    expect(s.durable.film.at(-1)!.id).toBe(photoId);
    s = step(s, { type: 'delete-film-photo', photoId: s.durable.film.at(-1)!.id });
    expect(s.durable.pendingPhoto).toBeNull();
    expect(s.durable.album.some(photo => photo.id === photoId)).toBe(false);
    expect(restoreJourney(serializeJourney(s), spawn).state.durable.memories['valley-letter']!.photo.thumbnail).toBe(image);
  });
});

describe('a genuinely shared camera frame', () => {
  it('accepts broad framing and either left/right order without relying on quest flags', () => {
    expect(evaluateMemoryFrame(observation()).matched).toBe(true);
    const other = observation();
    other.area = 'forest'; // The world-defined broad region is authoritative; a region-label boundary is not a second gate.
    other.anchors['memory-windmill']!.x = .85;
    other.anchors['memory-town']!.x = .15;
    expect(evaluateMemoryFrame(other).matched).toBe(true);
  });
  it('rejects wrong regions, occlusion, clipped subjects, tiny shapes, and one-location framing', () => {
    const changes: Array<(o: PhotoObservation) => void> = [
      o => { o.vantageTags = []; },
      o => { delete o.anchors['memory-town']; },
      o => { o.anchors['memory-town']!.occluded = true; },
      o => { o.anchors['memory-windmill']!.visibleFraction = .64; },
      o => { o.anchors['memory-windmill']!.depth = -1; },
      o => { o.anchors['memory-town']!.x = .99; },
      o => { o.anchors['memory-town']!.width = .003; },
      o => { o.anchors['memory-town']!.x = .25; o.anchors['memory-town']!.y = .4; },
      o => { o.anchors['memory-town']!.depth = NaN; },
    ];
    for (const change of changes) {
      const o = observation(); change(o);
      expect(evaluateMemoryFrame(o).matched).toBe(false);
      const result = capture(clues(), image, o);
      expect(result.state.durable.film.at(-1)!.memoryCandidates).toEqual([]);
      expect(result.state.durable.memories['valley-letter']).toBeNull();
    }
  });
});

describe('v3 letter persistence preserves the existing journey', () => {
  it('rejects truncated containers and mismatched image MIME types before awarding a letter', () => {
    const png = atob(image.split(',')[1]!);
    const bad = [
      image.replace('image/png', 'image/jpeg'),
      `data:image/png;base64,${btoa(png.slice(0, 8))}`,
      `data:image/png;base64,${btoa(png.slice(0, -12))}`,
      `data:image/jpeg;base64,${btoa('\xff\xd8\xff\xd9')}`,
      `data:image/webp;base64,${btoa('RIFF\x04\0\0\0WEBP')}`,
    ];
    expect(cleanThumbnail(image)).toBe(image);
    for (const thumbnail of bad) {
      expect(cleanThumbnail(thumbnail)).toBeNull();
      expect(capture(clues(), thumbnail).state.durable.memories['valley-letter']).toBeNull();
    }
  });
  it('round-trips an independent embedded image and restores the paper open without replaying rewards', () => {
    let s = completed(); s = step(s, { type: 'delete-film-photo', photoId: s.durable.film.at(-1)!.id });
    const text = serializeJourney(s), restored = restoreJourney(text, spawn);
    expect(JSON.parse(text).version).toBe(6);
    expect(restored.status).toBe('loaded');
    expect(restored.state.durable).toEqual(s.durable);
    expect(worldState(restored.state).valleyLetterOpened).toBe(true);
    const replay = discover(step(restored.state, { type: 'start' }), 'sunset-seat');
    expect(replay.events.some(e => e.type === 'memory:unlocked')).toBe(false);
    expect(toPresentationView(replay.state).memories![0]!.photo!.imageUrl).toBe(image);
  });
  it('retains an early eligible photograph through reload and recognizes it after the later clues', () => {
    let s = step(capture(begin()).state, { type: 'keep-photo' });
    s = step(restoreJourney(serializeJourney(s), spawn).state, { type: 'start' });
    expect(s.durable.memories['valley-letter']).toBeNull();
    s = clues(s);
    expect(s.durable.memories['valley-letter']!.photo.thumbnail).toBe(image);
  });
  it('migrates old v2 cards, ending, settings, and photos without inventing memory eligibility', () => {
    let s = step(completed(), { type: 'keep-photo' });
    s = step(s, { type: 'select-ending-photo', photoId: s.durable.album[0]!.id });
    s.durable.stamps = { forest: true, town: true }; s.durable.gateOpened = true;
    s.durable.mailed = true; s.durable.endingSeen = true; s.durable.mailedFrom = 'mailbox:ridge';
    const old = JSON.parse(JSON.stringify({game:'shanye-laixin', version:2, journey:{...s.durable, version:2}}));
    for (const key of ['clock','checkIns','trackedPhotoSpot','creativeMode','creativeReturn','replyPhotos','legacyReplyUnlock','endingNote']) delete old.journey[key];
    const restored = restoreJourney(JSON.stringify(old), spawn);
    expect(restored.status).toBe('migrated'); expect(restored.state.durable.version).toBe(6);
    expect(restored.state.durable.stamps).toEqual(s.durable.stamps);
    expect(restored.state.durable.mailed).toBe(true); expect(restored.state.durable.endingSeen).toBe(true);
    expect(restored.state.durable.settings).toEqual(s.durable.settings);
    expect(restored.state.durable.endingPhoto!.thumbnail).toBe(image);
    expect(restored.state.durable.album[0]!.thumbnail).toBe(image);
    expect(restored.state.durable.album[0]!.memoryCandidates).toEqual([]);
    expect(restored.state.durable.memories['valley-letter']).toBeNull();
    expect(restored.state.durable.discoveries).toEqual(s.durable.discoveries);
  });
  it('drops a corrupt memory locally and keeps the main stamps, album and future-version protection', () => {
    let s = step(completed(), { type: 'keep-photo' }); s.durable.stamps.forest = true;
    const encoded = JSON.parse(JSON.stringify({game:'shanye-laixin', version:3, journey:{...s.durable, version:3}})); encoded.journey.memories['valley-letter'].photo.thumbnail = 'data:image/png;base64,AA==';
    for (const key of ['clock','checkIns','trackedPhotoSpot','creativeMode','creativeReturn','replyPhotos','legacyReplyUnlock','endingNote']) delete encoded.journey[key];
    const restored = restoreJourney(JSON.stringify(encoded), spawn);
    expect(restored.state.durable.memories['valley-letter']).toBeNull();
    expect(restored.state.durable.stamps.forest).toBe(true);
    expect(restored.state.durable.album[0]!.thumbnail).toBe(image);
    expect(restored.warnings.join('')).toContain('完整来信');
    encoded.version = 7;
    expect(restoreJourney(JSON.stringify(encoded), spawn).status).toBe('future-version');
  });
  it('migrates v2 progress with corrupt image bytes without turning them into a new letter', () => {
    const s = step(completed(), { type: 'keep-photo' });
    s.durable.stamps.forest = true;
    const old = JSON.parse(JSON.stringify({game:'shanye-laixin', version:2, journey:{...s.durable, version:2}}));
    for (const key of ['clock','checkIns','trackedPhotoSpot','creativeMode','creativeReturn','replyPhotos','legacyReplyUnlock','endingNote']) delete old.journey[key];
    old.journey.album[0].thumbnail = 'data:image/png;base64,AA==';
    const restored = restoreJourney(JSON.stringify(old), spawn);
    expect(restored.status).toBe('migrated');
    expect(restored.state.durable.stamps.forest).toBe(true);
    expect(restored.state.durable.discoveries).toEqual(s.durable.discoveries);
    expect(restored.state.durable.album[0]!.id).toBe(s.durable.album[0]!.id);
    expect(restored.state.durable.album[0]!.thumbnail).toBeNull();
    expect(restored.state.durable.memories['valley-letter']).toBeNull();
  });
});

describe('letter presentation is derived from actual progress', () => {
  it('shows clues and genuine camera eligibility, then a self-contained letter and explicit replacement candidates', () => {
    let s = move(begin(), 'ridge'); s = step(s, { type: 'open-camera' });
    s = step(s, { type: 'set-context', nearby: null, observation: observation() });
    expect(toPresentationView(s).camera.memory).toBeUndefined();
    expect(toPresentationView(s).memories![0]!.status).toBe('unseen');
    s = discover(s, 'sunset-seat').state; s = step(s, { type: 'open-camera' });
    s = step(s, { type: 'set-context', nearby: null, observation: observation() });
    expect(toPresentationView(s).camera.memory!.ready).toBe(true);
    expect(toPresentationView(s).memories![0]!.status).toBe('tracing');
    s = capture(clues(s)).state;
    const done = toPresentationView(s).memories![0]!;
    expect(done.status).toBe('completed'); expect(done.letter).toContain('阿禾');
    expect(done.photo!.imageUrl).toBe(image);
    s = capture(s).state;
    expect(toPresentationView(s).memories![0]!.replacementPhotos.map(p => p.id)).toEqual([s.durable.film.at(-1)!.id]);
    expect(actionFromPresentation(s, 'replace-memory-photo', { memoryId: 'valley-letter', photoId: s.durable.film.at(-1)!.id })).toEqual({ type: 'replace-memory-photo', memoryId: 'valley-letter', photoId: s.durable.film.at(-1)!.id });
    expect(actionFromPresentation(s, 'replace-memory-photo', { memoryId: 'unknown', photoId: 'photo-1' })).toBeNull();
  });
});
