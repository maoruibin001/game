// Normal-input acceptance for 山野来信, ForgeAX SDK 0.5.0.
// Root owns running: pnpm exec forgeax project play scripts/journey-playthrough.mjs --require-ui --json
// The author-frozen Engine read is authoritative; optional frontend reads are unused.
// Start coordinates were inspected in artifacts/capture/first-world-ui.png (1280x720).
// No DOM/eval, teleport, state writes, developer actions, or simulated-time credit.

import assert from 'node:assert/strict';

const READS = Object.freeze({ journey: 'shan.journey', ui: 'shan.ui' });
const ACTION_NAMES = [
  'start', 'cameraOpen', 'shutter', 'keepPhoto', 'cameraClose',
  'journalOpen', 'journalClose', 'resume',
];
const GUARD_NAMES = ['start', 'playing', 'camera', 'photoReview', 'journal', 'afterReload', 'focusCanvas', 'musicPlaying'];

/**
 * Contract supplied from the implemented normal UI, never from test-only game hooks.
 *
 * {
 *   revision: 'documented UI/projection contract revision',
 *   selectors: {
 *     phase: (journey) => string,
 *     position: (journey) => [x, y, z],
 *     persistence: ({journey, ui}) => meaningful JSON containing saved photo/progress,
 *   },
 *   guards: {
 *     // Each guard reads exactly one public, read-only projection.
 *     start: { read: 'ui', test: (ui) => boolean },
 *     playing: { read: 'journey', test: (journey) => boolean },
 *     camera: { read: 'ui', test: (ui) => boolean },
 *     photoReview: { read: 'ui', test: (ui) => boolean },
 *     journal: { read: 'ui', test: (ui) => boolean },
 *     afterReload: { read: 'ui', test: (ui) => boolean },
 *     focusCanvas: { read: 'journey', test: (journey) => boolean },
 *     musicPlaying: { read: 'journey', test: (journey) => boolean },
 *   },
 *   actions: {
 *     // All eight action names are required. An empty start/resume list means
 *     // the normal game auto-starts/auto-continues; guards still have to pass.
 *     // Types: {type:'press', key:string}, {type:'click', point:[x,y]},
 *     // {type:'drag', from:[x,y], to:[x,y], button:'right'|'left'|'middle'}.
 *     // Coordinates are canvas-normalized and must come from a visible frame.
 *   },
 *   walk: { keys: ['KeyW'], minDistance: number, maxMs: number, sliceMs: number },
 *   photoSaved: { read: 'journey'|'ui', test: (current, beforeShot) => boolean },
 *   timeoutMs: number,
 * }
 *
 * persistence must exclude transient phase, clocks, UI animation and other values
 * that correctly differ on reload. It must include the newly retained photograph
 * in the album; comparing two empty saves fails. photoSaved
 * must confirm that retention, not only an increased shutter counter or draft.
 */
const JOURNEY_CONTRACT = {
  revision: 'entry-engine-0.5.0-journey-read-2026-11-16',
  useUiProjection: false,
  selectors: {
    phase: (read) => read.state.runtime.screen,
    position: (read) => read.controller.position,
    persistence: ({ journey }) => {
      const d = journey.state.durable;
      return {
        started: d.started, stamps: d.stamps, cardPhotos: d.cardPhotos,
        album: d.album, totalPhotos: d.totalPhotos, endingPhoto: d.endingPhoto,
        gateOpened: d.gateOpened, discoveries: d.discoveries,
        mailed: d.mailed, endingSeen: d.endingSeen, mailedFrom: d.mailedFrom,
        settings: d.settings,
      };
    },
  },
  guards: {
    start: { read: 'journey', test: (s) => s.restored && s.state.runtime.screen === 'menu' },
    playing: { read: 'journey', test: (s) => s.state.durable.started
      && s.state.runtime.screen === 'play' && s.state.runtime.pauseReasons.length === 0
      && !s.controller.paused && s.pendingCapture === null },
    camera: { read: 'journey', test: (s) => s.state.runtime.screen === 'photo'
      && s.controller.mode === 'photo' && !s.controller.paused
      && s.state.runtime.pauseReasons.length === 0 && s.pendingCapture === null },
    photoReview: { read: 'journey', test: (s) => s.state.runtime.screen === 'photo'
      && s.state.runtime.pauseReasons.includes('ui') && s.pendingCapture === null
      && /^data:image\/(?:png|jpeg|webp);base64,/.test(s.state.durable.pendingPhoto?.thumbnail ?? '') },
    journal: { read: 'journey', test: (s) => s.state.runtime.screen === 'journal'
      && s.state.runtime.pauseReasons.includes('ui') },
    afterReload: { read: 'journey', test: (s) => s.restored
      && s.state.runtime.screen === 'menu' && s.state.durable.started },
    focusCanvas: { read: 'journey', test: (s) => s.frontend?.focus?.target === 'canvas' },
    musicPlaying: { read: 'journey', test: (s) => s.frontend?.music?.phase === 'playing' },
  },
  actions: {
    start: [{ type: 'click', point: [205 / 1280, 493 / 720] }],
    cameraOpen: [{ type: 'press', key: 'KeyC' }],
    shutter: [{ type: 'press', key: 'Space' }],
    // Normal modal navigation: dialog -> close -> "收进相册" -> activate.
    // A real journey-photo-review screenshot is captured before these inputs.
    // No DOM locator, hidden state change, or unverified coordinate is used.
    keepPhoto: [{ type: 'press', key: 'Tab' }, { type: 'press', key: 'Tab' }, { type: 'press', key: 'Enter' }],
    // Regression of the first real run: C failed after the photo modal closed.
    // The author has repaired normal focus return; fail rather than click a fallback.
    cameraClose: [{ type: 'press', key: 'KeyC' }],
    journalOpen: [{ type: 'press', key: 'KeyJ' }],
    journalClose: [{ type: 'press', key: 'Escape' }],
    // Continue is the first control in the ordinary restored menu.
    resume: [{ type: 'press', key: 'Tab' }, { type: 'press', key: 'Enter' }],
  },
  walk: { keys: ['KeyW'], minDistance: 1.5, maxMs: 4000, sliceMs: 250 },
  photoSaved: { read: 'journey', test: (current, beforeShot) => {
    const now = current.state.durable, before = beforeShot.state.durable;
    const expected = `photo-${before.totalPhotos + 1}`;
    return now.totalPhotos === before.totalPhotos + 1 && now.pendingPhoto === null
      && now.album.length === before.album.length + 1
      && now.album.some((photo) => photo.id === expected
        && /^data:image\/(?:png|jpeg|webp);base64,/.test(photo.thumbnail ?? ''));
  } },
  timeoutMs: 15_000,
};

function point(value, label) {
  assert.ok(Array.isArray(value) && value.length === 2,
    `${label}: expected canvas-normalized [x, y]`);
  assert.ok(value.every((n) => Number.isFinite(n) && n >= 0 && n <= 1),
    `${label}: coordinates must be finite and in [0, 1]`);
}

function guard(value, label) {
  assert.ok(value && Object.hasOwn(READS, value.read), `${label}: unknown read projection`);
  assert.equal(typeof value.test, 'function', `${label}: missing predicate`);
}

function validate(contract) {
  assert.ok(contract,
    'journey-contract-unbound: waiting for documented shan.journey / shan.ui and visible UI bindings; no input sent');
  assert.ok(typeof contract.revision === 'string' && contract.revision.length > 0,
    'contract.revision must identify the reviewed UI/projection contract');
  for (const name of ['phase', 'position', 'persistence']) {
    assert.equal(typeof contract.selectors?.[name], 'function', `missing selector: ${name}`);
  }
  for (const name of GUARD_NAMES) guard(contract.guards?.[name], `guards.${name}`);
  guard(contract.photoSaved, 'photoSaved');
  if (!contract.useUiProjection) {
    assert.ok([...Object.values(contract.guards), contract.photoSaved].every((spec) => spec.read !== 'ui'),
      'UI guards require an explicitly available optional frontend projection');
  }
  for (const name of ACTION_NAMES) {
    const actions = contract.actions?.[name];
    assert.ok(Array.isArray(actions), `missing normal input sequence: ${name}`);
    if (!['start', 'resume'].includes(name)) assert.ok(actions.length > 0, `${name}: empty input sequence`);
    for (const action of actions) {
      assert.ok(action && typeof action === 'object', `${name}: invalid action`);
      if (action.type === 'press') {
        assert.ok(typeof action.key === 'string' && action.key.length > 0, `${name}: missing key`);
      } else if (action.type === 'click') {
        point(action.point, `${name}.point`);
      } else if (action.type === 'drag') {
        point(action.from, `${name}.from`);
        point(action.to, `${name}.to`);
        assert.ok(['left', 'right', 'middle'].includes(action.button), `${name}: invalid button`);
      } else {
        assert.fail(`${name}: unsupported action ${String(action.type)}; normal input only`);
      }
    }
  }
  const walk = contract.walk;
  assert.ok(walk && Array.isArray(walk.keys) && walk.keys.length > 0,
    'walk.keys must contain documented movement keys');
  assert.ok(walk.keys.every((key) => typeof key === 'string' && key.length > 0), 'invalid movement key');
  assert.ok(Number.isFinite(walk.minDistance) && walk.minDistance > 0, 'walk.minDistance must be positive');
  assert.ok(Number.isFinite(walk.maxMs) && walk.maxMs > 0 && walk.maxMs <= 15_000,
    'basic movement check must be bounded to 15 seconds');
  assert.ok(Number.isFinite(walk.sliceMs) && walk.sliceMs >= 50 && walk.sliceMs <= 500,
    'movement slice must be between 50 and 500 ms');
  assert.ok(walk.sliceMs <= walk.maxMs, 'movement slice exceeds its budget');
  assert.ok(Number.isFinite(contract.timeoutMs) && contract.timeoutMs > 0 && contract.timeoutMs <= 20_000,
    'each ordinary state transition must have a timeout <= 20 seconds');
}

function positionOf(contract, journey) {
  const value = contract.selectors.position(journey);
  assert.ok(Array.isArray(value) && value.length === 3 && value.every(Number.isFinite),
    'position selector must return a finite [x, y, z] from the read-only projection');
  return [...value];
}

function savedState(contract, snapshot) {
  const value = contract.selectors.persistence(snapshot);
  assert.ok(value && typeof value === 'object' && Object.keys(value).length > 0,
    'persistence selector must return a nonempty durable state');
  // Clone to prevent reference reuse or later projection mutation hiding a mismatch.
  const clone = structuredClone(value);
  assert.doesNotThrow(() => JSON.stringify(clone), 'durable snapshot must be JSON serializable');
  return clone;
}

/** Build only; creating this function performs no browser input or runtime startup. */
export function createJourneyPlaythrough(contract) {
  validate(contract);

  /** @param {import('@forgeax/engine/devkit').PlayContext} play */
  return async function journeyAcceptance(play) {
    const startedAt = Date.now();
    const timeline = [];
    const snapshot = async () => ({
      journey: await play.state(READS.journey),
      ui: contract.useUiProjection ? await play.state(READS.ui) : null,
    });
    const wait = (spec, before) => play.waitFor(
      (value) => spec.test(value, before) === true,
      { read: READS[spec.read], timeoutMs: contract.timeoutMs },
    );
    const input = async (name) => {
      for (const action of contract.actions[name]) {
        if (action.type === 'press') await play.keyboard.press(action.key);
        else if (action.type === 'click') await play.mouse.click(action.point);
        else await play.mouse.drag(action.from, action.to, { button: action.button });
      }
    };
    const checkpoint = async (name) => {
      const current = await snapshot();
      const phase = contract.selectors.phase(current.journey);
      assert.ok(typeof phase === 'string' && phase.length > 0, 'phase selector must return actual phase');
      const position = positionOf(contract, current.journey);
      await play.screenshot(name);
      timeline.push({ name, elapsedMs: Date.now() - startedAt, phase, position });
      return current;
    };

    const initial = await play.step('normal-start', async () => {
      await wait(contract.guards.start);
      await checkpoint('journey-entry');
      await input('start');
      await wait(contract.guards.playing);
      return checkpoint('journey-started');
    });

    const music = await play.step('normal-native-music-signal', async () => {
      const current = await wait(contract.guards.musicPlaying);
      await checkpoint('journey-native-music-playing');
      return current.frontend.music;
    });

    const from = positionOf(contract, initial.journey);
    const distance = (journey) => {
      const next = positionOf(contract, journey);
      return Math.hypot(next[0] - from[0], next[2] - from[2]);
    };
    const walked = await play.step('normal-walk', async () => {
      let current = initial;
      let heldMs = 0;
      while (distance(current.journey) < contract.walk.minDistance && heldMs < contract.walk.maxMs) {
        assert.equal(contract.guards.playing.test(current[contract.guards.playing.read]), true,
          'normal walking left the playable phase');
        const slice = Math.min(contract.walk.sliceMs, contract.walk.maxMs - heldMs);
        await play.keyboard.hold(contract.walk.keys, slice);
        heldMs += slice;
        current = await snapshot();
      }
      assert.ok(distance(current.journey) >= contract.walk.minDistance,
        `normal movement failed after ${heldMs} ms of real key input; no teleport fallback`);
      assert.equal(contract.guards.playing.test(current[contract.guards.playing.read]), true,
        'movement finished outside the playable phase');
      await checkpoint('journey-walked');
      return { distance: distance(current.journey), heldMs };
    });

    const beforeShot = await play.step('normal-camera-open', async () => {
      await input('cameraOpen');
      await wait(contract.guards.camera);
      return checkpoint('journey-camera');
    });
    const beforeSave = savedState(contract, beforeShot);
    const photoRetained = await play.step('normal-shutter-and-save', async () => {
      await input('shutter');
      await wait(contract.guards.photoReview);
      await checkpoint('journey-photo-review');
      await input('keepPhoto');
      await wait(contract.photoSaved, beforeShot[contract.photoSaved.read]);
      const current = await checkpoint('journey-free-photo-saved');
      const retained = savedState(contract, current);
      assert.notDeepEqual(retained, beforeSave,
        'shutter must create an observable durable change before persistence can be tested');
      return retained;
    });

    await play.step('normal-camera-close-keyboard', async () => {
      // Album insertion can precede the frontend's ui-pause release acknowledgement.
      // Observe the actual unpaused camera state before issuing another normal input.
      await wait(contract.guards.camera);
      await wait(contract.guards.focusCanvas);
      await input('cameraClose');
      await wait(contract.guards.playing);
      await wait(contract.guards.focusCanvas);
      await checkpoint('journey-camera-closed');
    });

    await play.step('normal-journal-open-close', async () => {
      await input('journalOpen');
      await wait(contract.guards.journal);
      await checkpoint('journey-journal');
      await input('journalClose');
      await wait(contract.guards.playing);
      await checkpoint('journey-journal-closed');
    });

    await play.step('normal-reload-and-continue', async () => {
      const before = savedState(contract, await checkpoint('journey-before-reload'));
      assert.deepEqual(before, photoRetained,
        'the retained photograph changed or disappeared when camera/journal closed');
      await play.reload();
      await wait(contract.guards.afterReload);
      await checkpoint('journey-reloaded-menu');
      await input('resume');
      await wait(contract.guards.playing);
      const after = savedState(contract, await checkpoint('journey-after-continue'));
      assert.deepEqual(after, before, 'durable photo/progress changed after normal reload and continue');
    });

    // Log the complete timeline to the official report, avoiding its bounded result.
    console.log(JSON.stringify({ contract: contract.revision, timeline }));
    return {
      scope: 'basic normal-input acceptance only; full journey not yet covered',
      contract: contract.revision,
      walkedMeters: Number(walked.distance.toFixed(3)),
      realElapsedSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(2)),
      usedAdvance: false,
      screenshots: timeline.length,
      persistenceScope: 'same private browser profile across reload; not close/reopen',
      cameraCloseScope: 'KeyC after real photo retention; no alternate-input fallback',
      music: { phase: music.phase, cue: music.cue, scope: 'native playback signal; not human listening acceptance' },
    };
  };
}

/** @param {import('@forgeax/engine/devkit').PlayContext} play */
export default async function journeyPlaythrough(play) {
  // An unbound contract fails before any input. It is never a template pass.
  return createJourneyPlaythrough(JOURNEY_CONTRACT)(play);
}
