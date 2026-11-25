// Full normal-input acceptance. Root owns the one official project-play runtime.
// READ ONLY: shan.journey. INPUT ONLY: actual keyboard / RMB drag / visible UI.
// No game module imports, state commands, teleport, DOM/eval, or play.advance.
// Route data is authored public-world geometry, not a test-only game control seam.
import assert from 'node:assert/strict';

const READ = 'shan.journey';
const VIEWPORT = [1280, 720];
const TAU = Math.PI * 2;
const wrap = (value) => ((value + Math.PI) % TAU + TAU) % TAU - Math.PI;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const horizontalDistance = (position, point) => Math.hypot(position[0] - point[0], position[2] - point[1]);

export const FULL_ROUTE_PLAN = {
  revision: 'full-route-2026-11-17-forest-oblique-opening',
  budgetMs: 18 * 60 * 1000,
  forest: [[0, -220], [-35, -192], [-65, -154], [-102, -120], [-142, -95], [-170, -70], [-170, -49.5]],
  forestPhoto: { feet: [-171, -52], target: [-175.5, 45, -25] },
  forestToZipline: [[-170, -35], [-185, -17]],
  // The World author added this visible ordinary connector after the slope defect.
  // Player controller validation confirmed all three legs; browser proof is pending.
  ziplineReturn: [[-42, -187], [-35, -192], [0, -220]],
  town: [[0, -220], [38, -185], [75, -143], [92, -100], [128, -60], [155, -19], [155, -6]],
  townLever: [[148, -2], [148, 11]],
  townReturnToPhoto: [[148, -2], [155, -6]],
  townPhoto: { feet: [155, -6], target: [155, 29, 10] },
  courtyard: [[155, 5], [155, 16], [155, 23], [155, 32], [158.5, 40], [158.5, 51]],
  courtyardReturn: [[158.5, 32], [155, 23], [155, 20]],
  // Visit the pavilion through its actual eastern opening, then leave through
  // the same opening. The former diagonal/northern paths crossed real meshes;
  // the new world collision boxes now correctly block those old shortcuts.
  ridge: [[194, 59], [216, 109], [171, 135], [126, 178], [64, 204],
    [20, 226], [15, 226], [15, 235], [0, 235], [15, 235], [15, 226], [0, 200]],
  ridgePhoto: { feet: [0, 200], target: [0, 30, -80] },
  // South side, within the ordinary E radius and outside the mailbox mesh.
  ridgeMailbox: [[11.75, 230.4]],
};

export function validateFullRoute(plan = FULL_ROUTE_PLAN) {
  assert.ok(Array.isArray(plan.ziplineReturn) && plan.ziplineReturn.length > 0,
    'route-not-frozen: waiting for the repaired ordinary zipline exit connector; no input may run yet');
  for (const key of ['forest', 'forestToZipline', 'ziplineReturn', 'town', 'townLever',
    'townReturnToPhoto', 'courtyard', 'courtyardReturn', 'ridge', 'ridgeMailbox']) {
    assert.ok(plan[key].every((p) => p.length === 2 && p.every(Number.isFinite)), `invalid route: ${key}`);
  }
  if (plan.scenic) {
    const coverage = plan.scenic.coverage ?? 'full-six';
    assert.ok(coverage === 'full-six' || coverage === 'visual-three', 'unknown optional coverage');
    if (coverage === 'full-six') {
      assert.equal(new Set(plan.scenic.expectedDiscoveries).size, 6, 'scenic requires all six distinct discovery IDs');
    } else {
      assert.deepEqual([...plan.scenic.expectedDiscoveries].sort(), ['last-letter', 'lost-postcard', 'sunset-seat'],
        'visual recheck covers exactly the three named discoveries, never the full six');
    }
    for (const site of plan.scenic.sites) {
      assert.ok(plan.scenic.expectedDiscoveries.includes(site.id), `unknown scenic discovery: ${site.id}`);
      assert.ok(site.point.length === 2 && site.point.every(Number.isFinite), `invalid scenic stop: ${site.id}`);
      if (site.viewPoint) {
        assert.ok(site.viewPoint.feet.length === 2 && site.viewPoint.feet.every(Number.isFinite));
        assert.ok(site.viewPoint.target.length === 3 && site.viewPoint.target.every(Number.isFinite));
      }
      for (const path of [site.viewApproach, site.returnPath]) {
        if (path) assert.ok(path.every((p) => p.length === 2 && p.every(Number.isFinite)));
      }
    }
    assert.ok(plan.scenic.postgameReturn.every((p) => p.length === 2 && p.every(Number.isFinite)));
    if (plan.scenic.memory) {
      const memory = plan.scenic.memory;
      assert.equal(memory.id, 'valley-letter');
      assert.ok(plan.scenic.sites.some((site) => site.id === memory.clueSite));
      assert.ok(plan.scenic.sites.some((site) => site.id === memory.completionSite && (site.view || site.viewPoint)));
      assert.ok(memory.photo.feet.length === 2 && memory.photo.feet.every(Number.isFinite));
      assert.ok(memory.photo.target.length === 3 && memory.photo.target.every(Number.isFinite));
      for (const path of [memory.photoApproach, memory.paperApproach]) {
        if (path) assert.ok(path.every((p) => p.length === 2 && p.every(Number.isFinite)));
      }
    }
  }
  return plan;
}

const isWalking = (s) => s.state.runtime.screen === 'play' && s.state.runtime.pauseReasons.length === 0
  && s.controller.mode === 'walk' && !s.controller.paused && s.frontend?.focus?.target === 'canvas';
const isCamera = (s) => s.state.runtime.screen === 'photo' && !s.state.durable.pendingPhoto
  && !s.pendingCapture && !s.controller.paused && s.state.runtime.pauseReasons.length === 0
  && s.controller.mode === 'photo' && s.frontend?.focus?.target === 'canvas';
const isReview = (s) => Boolean(s.state.durable.pendingPhoto?.thumbnail?.startsWith('data:image/'))
  && s.state.runtime.pauseReasons.includes('ui') && !s.pendingCapture;

function durableSnapshot(s) {
  const d = s.state.durable;
  return structuredClone({ version: d.version, started: d.started, stamps: d.stamps, cardPhotos: d.cardPhotos,
    gateOpened: d.gateOpened, discoveries: d.discoveries, album: d.album,
    memories: d.memories,
    totalPhotos: d.totalPhotos, endingPhoto: d.endingPhoto, mailed: d.mailed,
    endingSeen: d.endingSeen, mailedFrom: d.mailedFrom, ziplineRides: d.ziplineRides, settings: d.settings });
}

/** @param {import('@forgeax/engine/devkit').PlayContext} play */
export async function runFullJourney(play, plan = FULL_ROUTE_PLAN) {
  validateFullRoute(plan);
  const visualRecheck = plan.scenic?.coverage === 'visual-three';
  const began = Date.now();
  const timeline = [];
  let settlingMs = 0;
  let dragReleaseFrames = 0;
  let independentMemory = null;
  const budget = () => assert.ok(Date.now() - began < plan.budgetMs, 'full-journey-budget-exceeded; retain failure and stop');
  const read = async () => { budget(); return play.state(READ); };
  const wait = async (predicate, timeoutMs = 15_000) => {
    budget(); return play.waitFor(predicate, { read: READ, timeoutMs });
  };
  // Only a short release acknowledgement between normal inputs. Not game-time
  // advancement or experience padding; record these milliseconds separately.
  const released = async () => { await play.wait(80); settlingMs += 80; };
  const key = async (code) => { budget(); await play.keyboard.press(code); await released(); };
  const tabs = async (count) => { for (let i = 0; i < count; i++) await key('Tab'); };
  const shot = async (name) => {
    const s = await read();
    await play.screenshot(name);
    const event = { name, elapsedMs: Date.now() - began, phase: s.state.runtime.screen,
      position: s.controller.position, stamps: s.state.durable.stamps,
      album: s.state.durable.album.map((p) => p.id), mailed: s.state.durable.mailed,
      ...(plan.scenic ? { discoveries: discoveryIds(s) } : {}),
      ...(plan.scenic?.memory ? { memory: {
        id: plan.scenic.memory.id,
        photoId: s.state.durable.memories?.[plan.scenic.memory.id]?.photo.id ?? null,
        opened: s.world.valleyLetterOpened,
      } } : {}),
      music: s.frontend?.music ?? null, focus: s.frontend?.focus ?? null };
    timeline.push(event); console.log(JSON.stringify(event));
    return s;
  };
  const step = (name, run) => play.step(name, async () => { budget(); return run(); });

  async function dragLook(from, to) {
    // SDK drag repositions then presses RMB without an input-frame boundary.
    // Drain the ordinary released movement before pressing: otherwise the return
    // delta can be consumed with RMB down and cancel the following drag.
    await play.mouse.move(from);
    const repositioned = await read();
    assert.ok(!repositioned.controller.paused && repositioned.frontend?.focus?.target === 'canvas',
      'look reposition requires normal active canvas input');
    // Existing Journey tick runs after the real input system. Observe a subsequent
    // completed game-input frame; no invented delay, clock write, or play.advance.
    const before = await wait((s) => !s.controller.paused
      && s.frontend?.focus?.target === 'canvas'
      && s.state.durable.playSeconds > repositioned.state.durable.playSeconds, 2_000);
    dragReleaseFrames++;
    await play.mouse.drag(from, to, { button: 'right' });
    await released();
    return { before, after: await read() };
  }

  async function turnTo(yaw, pitch) {
    for (let attempt = 0; attempt < 16; attempt++) {
      const s = await read();
      assert.ok(isWalking(s) || isCamera(s), 'turn requires ordinary active gameplay');
      const dx = wrap(yaw - s.controller.yaw), dy = pitch - s.controller.pitch;
      if (Math.abs(dx) < .012 && Math.abs(dy) < .012) return;
      const sensitivity = s.state.durable.settings.sensitivity;
      const invert = s.state.durable.settings.invertY ? -1 : 1;
      const pixelsX = clamp(dx / (.0022 * sensitivity), -230, 230);
      const pixelsY = clamp(dy / (.0022 * sensitivity * invert), -170, 170);
      const { before, after } = await dragLook([.5, .5], [.5 + pixelsX / VIEWPORT[0], .5 + pixelsY / VIEWPORT[1]]);
      if (Math.abs(wrap(after.controller.yaw - before.controller.yaw)) + Math.abs(after.controller.pitch - before.controller.pitch) < .001) {
        console.log(JSON.stringify({ name: 'look-no-progress', attempt, target: { yaw, pitch }, pixels: [pixelsX, pixelsY],
          before: { mode: before.controller.mode, yaw: before.controller.yaw, pitch: before.controller.pitch,
            playSeconds: before.state.durable.playSeconds, focus: before.frontend?.focus },
          after: { mode: after.controller.mode, yaw: after.controller.yaw, pitch: after.controller.pitch,
            playSeconds: after.state.durable.playSeconds, focus: after.frontend?.focus } }));
        assert.fail('RMB look made no progress; stop at the real input defect');
      }
    }
    assert.fail('RMB look did not converge within 16 normal drags');
  }

  async function walkTo(point, tolerance = 1.1) {
    let s = await read();
    assert.ok(isWalking(s), 'route travel requires unpaused ordinary walking');
    const start = Date.now();
    const limit = 16_000 + horizontalDistance(s.controller.position, point) / 3 * 1000;
    let stuck = 0;
    while (horizontalDistance(s.controller.position, point) > tolerance) {
      assert.ok(Date.now() - start < limit, `route segment timed out at ${point}; no teleport fallback`);
      const p = s.controller.position;
      const yaw = Math.atan2(point[0] - p[0], -(point[1] - p[2]));
      await turnTo(yaw, .13);
      const before = await read();
      const distance = horizontalDistance(before.controller.position, point);
      const heldMs = clamp((distance - tolerance * .55) / 6.8 * 1000, 40, 700);
      await play.keyboard.hold('KeyW', heldMs);
      await released();
      s = await read();
      assert.ok(isWalking(s), 'route unexpectedly left normal walking');
      const moved = Math.hypot(s.controller.position[0] - before.controller.position[0],
        s.controller.position[2] - before.controller.position[2]);
      stuck = moved < .045 ? stuck + 1 : 0;
      assert.ok(stuck < 3, `movement blocked near ${JSON.stringify(s.controller.position)} toward ${point}`);
    }
    return s;
  }

  async function route(points, label, tolerance = 1.1) {
    for (const point of points) {
      await walkTo(point, tolerance);
      const site = plan.scenic?.sites.find((s) => s.point[0] === point[0] && s.point[1] === point[1]);
      if (site && !(await read()).state.durable.discoveries.some((d) => d.id === site.id)) {
        await step(`scenic-discovery-${site.id}`, () => discoverScenicSite(site));
      }
    }
    await shot(`${label}-arrived`);
  }
  async function cameraAt(view, label) {
    await walkTo(view.feet, .35);
    await key('KeyC');
    const s = await wait(isCamera);
    const p = s.controller.camera.position, t = view.target;
    await turnTo(Math.atan2(t[0] - p[0], -(t[2] - p[2])),
      -Math.atan2(t[1] - p[1], Math.hypot(t[0] - p[0], t[2] - p[2])));
    await shot(`${label}-composition`);
  }
  async function lowerCamera(label) {
    await wait(isCamera); await key('KeyC'); await wait(isWalking);
    await shot(`${label}-camera-lowered`);
  }

  async function photograph(label, { card = null, shouldMatch = false, keep = true, memory = null } = {}) {
    const before = await read();
    assert.ok(isCamera(before));
    await key('Space');
    const review = await wait(isReview);
    const photo = review.state.durable.pendingPhoto;
    assert.equal(photo.sequence, before.state.durable.totalPhotos + 1);
    assert.ok(photo.thumbnail?.startsWith('data:image/'), 'actual capture must supply an image');
    if (card) assert.equal(photo.matchedCards.includes(card), shouldMatch,
      `${label}: actual photo classification disagrees; inspect visible composition and observation`);
    if (memory) assert.ok(photo.memoryCandidates?.includes(memory),
      `${label}: actual captured view did not match both real memory landmarks`);
    await shot(`${label}-review`);
    // Proven ordinary modal keyboard order: close, keep, discard.
    await tabs(keep ? 2 : 3); await key('Enter');
    const after = await wait((s) => isCamera(s) && s.state.durable.pendingPhoto === null);
    if (keep) assert.ok(after.state.durable.album.some((p) => p.id === photo.id && p.thumbnail === photo.thumbnail));
    else assert.ok(!after.state.durable.album.some((p) => p.id === photo.id));
    await shot(`${label}-${keep ? 'retained' : 'discarded'}`);
    return { id: photo.id, photo: structuredClone(photo), before, after };
  }

  function discoveryIds(s) {
    return s.state.durable.discoveries.map((d) => d.id).sort();
  }
  const siteView = (site) => site.viewPoint ?? (site.view ? { feet: site.point, target: site.view } : null);
  async function discoverScenicSite(site) {
    const before = await wait((s) => isWalking(s) && s.state.runtime.nearby === `discover:${site.id}`);
    await shot(`scenic-${site.id}-before`);
    await key('KeyE');
    const found = await wait((s) => isWalking(s) && s.state.durable.discoveries.some((d) => d.id === site.id));
    assert.equal(found.state.durable.discoveries.length, before.state.durable.discoveries.length + 1,
      `ordinary E must unlock exactly one discovery: ${site.id}`);
    await shot(`scenic-${site.id}-found`);
    if (site.id === plan.scenic?.memory?.clueSite) {
      assert.equal(found.state.durable.memories[plan.scenic.memory.id], null,
        'the first clue alone must not complete the optional letter');
      await showMemoryLetter('valley-letter-first-clue');
    }
    if (siteView(site)) {
      if (site.viewApproach) await route(site.viewApproach, `${site.id}-view-approach`);
      await cameraAt(siteView(site), `scenic-${site.id}`);
      if (site.keepPhoto) await photograph(`scenic-${site.id}-free`);
      await lowerCamera(`scenic-${site.id}`);
    }
    if (site.id === plan.scenic?.memory?.completionSite) {
      await step('scenic-valley-letter-real-photo-and-independent-save', () => completeValleyLetter(site));
    }
    if (site.returnPath) await route(site.returnPath, `${site.id}-normal-return`);
    if (site.replay) {
      // A real photograph separates the first phrase from rereading the letter;
      // no timer is added to stretch content. Audibility belongs to media review.
      const ready = await wait((s) => isWalking(s) && s.state.runtime.nearby === `discover:${site.id}`);
      await key('KeyE');
      const repeated = await wait((s) => isWalking(s) && s.state.runtime.nearby === `discover:${site.id}`);
      assert.deepEqual(discoveryIds(repeated), discoveryIds(ready), 'rereading must not duplicate discoveries');
      await shot(`scenic-${site.id}-replay-input`);
    }
  }

  async function showMemoryLetter(label) {
    await wait(isWalking);
    await key('KeyJ');
    await wait((s) => s.state.runtime.screen === 'journal' && s.state.runtime.pauseReasons.includes('ui'));
    // Public component keyboard contract: dialog -> close / cards / discoveries.
    // Tab changes reset focus to the dialog; the fifth control opens this letter.
    await tabs(3); await key('Enter'); await shot(`${label}-discoveries`);
    await tabs(5); await key('Enter'); await shot(`${label}-detail`);
    // Local detail -> discoveries -> ordinary gameplay. No forced focus/DOM read.
    await key('Escape');
    await wait((s) => s.state.runtime.screen === 'journal' && s.state.runtime.pauseReasons.includes('ui'));
    await shot(`${label}-back-to-discoveries`);
    await key('Escape'); await wait(isWalking);
  }

  function assertIndependentMemory(s, expected) {
    const memory = s.state.durable.memories?.[plan.scenic.memory.id];
    assert.ok(memory && s.world.valleyLetterOpened, 'the completed letter and unfolded world state must persist');
    assert.equal(memory.photo.id, expected.photo.id);
    assert.equal(memory.unlockedAtPlaySeconds, expected.unlockedAtPlaySeconds,
      'ordinary new photos/reload must not award the letter again');
    assert.ok(memory.photo.thumbnail === expected.photo.thumbnail,
      'the independent real photograph must survive without its album slot');
    assert.deepEqual({ ...memory.photo, thumbnail: null }, { ...expected.photo, thumbnail: null });
    assert.ok(!s.state.durable.album.some((p) => p.id === expected.photo.id),
      'this acceptance photo was discarded normally; the letter must own its separate copy');
  }

  async function completeValleyLetter(site) {
    const definition = plan.scenic.memory, before = await read();
    assert.ok(discoveryIds(before).includes(definition.clueSite) && discoveryIds(before).includes(definition.completionSite));
    assert.equal(before.state.durable.memories[definition.id], null,
      'both written clues without a matching real photo must not complete the letter');
    assert.equal(before.world.valleyLetterOpened, false);
    const stamps = structuredClone(before.state.durable.stamps);
    if (definition.photoApproach) await route(definition.photoApproach, 'valley-letter-photo-approach');
    await cameraAt(definition.photo, 'valley-letter-two-landmarks');
    const framed = await wait((s) => {
      const observation = s.state.runtime.observation;
      return isCamera(s) && observation?.vantageTags?.includes('valley-letter-view')
        && ['memory-windmill', 'memory-town'].every((id) => {
          const anchor = observation.anchors[id];
          return anchor && !anchor.occluded && anchor.depth > 0 && anchor.visibleFraction >= .65;
        });
    });
    console.log(JSON.stringify({ name: 'valley-letter-observed-landmarks',
      position: framed.controller.position, anchors: framed.state.runtime.observation.anchors }));
    // The normal capture completes the letter with an independent real JPEG.
    // Discard this draft through its ordinary review button to prove the letter
    // does not depend on subsequently retaining that image in the album.
    const captured = await photograph('valley-letter-independent-photo', { memory: definition.id, keep: false });
    independentMemory = structuredClone(captured.after.state.durable.memories[definition.id]);
    assert.ok(independentMemory, 'matching real shutter with both clues must unlock the letter');
    assert.equal(independentMemory.photo.id, captured.id);
    assert.ok(independentMemory.photo.thumbnail === captured.photo.thumbnail);
    assertIndependentMemory(captured.after, independentMemory);
    assert.deepEqual(captured.after.state.durable.stamps, stamps, 'optional memory must not change the two main cards');
    await lowerCamera('valley-letter');
    if (definition.paperApproach) await route(definition.paperApproach, 'valley-letter-paper-approach');
    await cameraAt(siteView(site), 'valley-letter-unfolded-bench');
    await lowerCamera('valley-letter-unfolded-bench');
    await showMemoryLetter('valley-letter-complete');
    const restored = await reloadAndContinue('valley-letter-independent-save');
    assertIndependentMemory(restored, independentMemory);
    await showMemoryLetter('valley-letter-restored');
  }

  async function reloadAndContinue(label) {
    const before = durableSnapshot(await shot(`${label}-before-reload`));
    await play.reload();
    await wait((s) => s.restored && s.state.runtime.screen === 'menu');
    await shot(`${label}-restored-menu`);
    await tabs(1); await key('Enter'); await wait(isWalking);
    const after = await shot(`${label}-continued`);
    assert.deepEqual(durableSnapshot(after), before, `${label}: normal reload lost durable progress`);
    return after;
  }

  await step('full-normal-start', async () => {
    await wait((s) => s.restored && s.state.runtime.screen === 'menu');
    await shot('full-start-menu');
    await play.mouse.click([205 / 1280, 493 / 720]); await released();
    const s = await wait(isWalking);
    assert.equal(s.state.durable.totalPhotos, 0, 'full run requires its normal fresh profile');
    await wait((state) => state.frontend?.music?.phase === 'playing' && state.frontend.music.cue === 'normal');
    await shot('full-post-office-departure');
  });

  await step('full-journal-escape-preflight', async () => {
    // Reuse the original failed smoke inputs before spending time on the route.
    // No click/focus fallback or added settling wait around the regression.
    await play.keyboard.press('KeyJ');
    await wait((s) => s.state.runtime.screen === 'journal' && s.state.runtime.pauseReasons.includes('ui'));
    await shot('full-preflight-journal');
    const beforeEscape = await read();
    console.log(JSON.stringify({ name: 'full-preflight-before-escape',
      phase: beforeEscape.state.runtime.screen, focus: beforeEscape.frontend?.focus ?? null }));
    await play.keyboard.press('Escape');
    await wait(isWalking); // Includes the normal canvas focus return.
    await shot('full-preflight-journal-closed');
  });

  await step('full-walk-to-forest', () => route(plan.forest, 'forest'));
  await step('full-forest-negative-and-main-card', async () => {
    await cameraAt(plan.forestPhoto, 'forest');
    const aligned = (await read()).controller;
    await turnTo(aligned.yaw + .75, aligned.pitch);
    await photograph('forest-negative', { card: 'forest', shouldMatch: false, keep: false });
    assert.equal((await read()).state.durable.stamps.forest, false);
    await turnTo(aligned.yaw, aligned.pitch);
    await shot('forest-world-before');
    await photograph('forest-main', { card: 'forest', shouldMatch: true });
    const changed = await wait((s) => s.world.windmillTurning && s.world.curtainOpen && s.world.ziplineAvailable);
    assert.equal(changed.state.durable.stamps.town, false);
    await shot('forest-world-after');
    const before = structuredClone(changed.state.durable.stamps);
    await photograph('forest-repeat', { card: 'forest', shouldMatch: true, keep: false });
    assert.deepEqual((await read()).state.durable.stamps, before, 'repeat photo must not grant another stamp');
    await lowerCamera('forest');
  });

  await step('full-normal-zipline-and-free-look', async () => {
    await route(plan.forestToZipline, 'zipline-board');
    const before = await wait((s) => isWalking(s) && s.state.runtime.nearby === 'zipline');
    await key('KeyE');
    await wait((s) => s.controller.mode === 'zipline' && s.state.runtime.ride !== null);
    await shot('zipline-started');
    const view = await wait((s) => s.controller.mode === 'zipline' && s.controller.ziplineProgress >= .18
      && s.controller.ziplineProgress < .7, 20_000);
    const offset = wrap(view.controller.yaw - view.controller.facingYaw);
    const { after: looking } = await dragLook([.5, .5], [.64, .46]);
    assert.equal(looking.controller.mode, 'zipline', 'free look must not terminate the ride');
    assert.ok(Math.abs(wrap(looking.controller.yaw - looking.controller.facingYaw) - offset) > .12,
      'RMB must visibly change ride look independently of route facing');
    await shot('zipline-free-look');
    const landed = await wait((s) => isWalking(s) && s.controller.grounded && !s.state.runtime.ride
      && s.state.durable.ziplineRides === before.state.durable.ziplineRides + 1, 30_000);
    assert.ok(landed.controller.position.every(Number.isFinite));
    await shot('zipline-actual-landing');
    await route(plan.ziplineReturn, 'zipline-normal-exit');
  });

  await step('full-walk-to-town-and-open-grille', async () => {
    await route(plan.town, 'town');
    await route(plan.townLever, 'town-grille');
    await wait((s) => s.state.runtime.nearby === 'town-gate');
    await shot('town-grille-before'); await key('KeyE');
    await wait((s) => s.state.durable.gateOpened && s.world.gateOpen);
    await shot('town-grille-after');
    await route(plan.townReturnToPhoto, 'town-photo-position');
  });
  await step('full-town-main-card-and-new-route', async () => {
    await cameraAt(plan.townPhoto, 'town'); await shot('town-world-before');
    await photograph('town-main', { card: 'town', shouldMatch: true });
    await shot('town-change-unfolding');
    await wait((s) => s.world.bridgeWalkable && s.world.townLights && s.world.courtyardOpen, 10_000);
    await shot('town-world-after'); await lowerCamera('town');
    await route(plan.courtyard, 'courtyard-bridge-crossed');
    await wait((s) => s.state.runtime.nearby === 'discover:last-letter'); await key('KeyE');
    await wait((s) => s.state.durable.discoveries.some((d) => d.id === 'last-letter'));
    await shot('courtyard-letter'); await route(plan.courtyardReturn, 'town-return');
    await reloadAndContinue('two-cards-save');
  });

  let endingPhotoId;
  await step('full-ridge-personal-postcard', async () => {
    await route(plan.ridge, 'ridge');
    await wait((s) => s.frontend?.music?.phase === 'playing' && s.frontend.music.cue === 'vista');
    await cameraAt(plan.ridgePhoto, 'ridge');
    const photo = await photograph('ridge-personal'); endingPhotoId = photo.id;
    if (independentMemory) assertIndependentMemory(await read(), independentMemory);
    await lowerCamera('ridge');
  });
  await step('full-select-personal-postcard-through-journal', async () => {
    await key('KeyJ'); await wait((s) => s.state.runtime.screen === 'journal' && s.state.runtime.pauseReasons.includes('ui'));
    await shot('ending-journal-current-page');
    // Dialog -> close -> letters -> discoveries -> album. No DOM inspection.
    await tabs(4); await key('Enter'); await shot('ending-journal-album');
    const s = await read(), index = s.state.durable.album.findIndex((p) => p.id === endingPhotoId);
    assert.ok(index >= 0 && index < 8, 'the selected personal card must be on normal first album page');
    // A tab change returns focus to the ordinary dialog, then photo tiles follow the tabs.
    await tabs(5 + index); await key('Enter'); await shot('ending-personal-card-detail');
    await tabs(2); await key('Enter');
    await wait((state) => state.state.durable.endingPhoto?.id === endingPhotoId);
    await shot('ending-personal-card-selected');
    await key('Escape'); await wait(isWalking);
  });
  await step('full-mail-at-normal-mailbox-and-ending', async () => {
    await route(plan.ridgeMailbox, 'ridge-mailbox', .35);
    const s = await wait((state) => isWalking(state) && state.state.runtime.nearby === 'mailbox:ridge');
    assert.ok(s.state.durable.stamps.forest && s.state.durable.stamps.town);
    if (plan.scenic) assert.deepEqual(discoveryIds(s), [...plan.scenic.expectedDiscoveries].sort());
    else assert.ok(s.state.durable.discoveries.length < 6, 'ending must not depend on full optional collection');
    await key('KeyE');
    await wait((state) => state.state.durable.mailed && state.state.runtime.screen === 'ending'
      && state.state.durable.endingPhoto?.id === endingPhotoId && state.world.sunset);
    await wait((state) => state.frontend?.music?.phase === 'playing' && state.frontend.music.cue === 'outro');
    await shot('ending-actual-personal-postcard');
    // Ending has one ordinary "再走一会儿" control once the card is mailed.
    await tabs(1); await key('Enter');
    await wait((state) => isWalking(state) && state.state.durable.endingSeen);
    await shot('ending-return-to-valley');
  });
  await step('full-postgame-exploration-and-persistence', async () => {
    if (plan.scenic) await route(plan.scenic.postgameReturn, 'scenic-postgame-return');
    else await walkTo(plan.ridgePhoto.feet);
    await shot('postgame-sunset-valley');
    await cameraAt(plan.ridgePhoto, 'postgame'); await photograph('postgame-free-photo');
    await lowerCamera('postgame');
    const after = await reloadAndContinue('completed-journey-save');
    assert.ok(after.world.windmillTurning && after.world.bridgeWalkable && after.world.sunset);
    assert.ok(after.state.durable.mailed && after.state.durable.endingSeen);
    if (independentMemory) assertIndependentMemory(after, independentMemory);
  });

  if (plan.scenic) await step(visualRecheck ? 'visual-three-discoveries-journal-and-refresh'
    : 'scenic-six-discoveries-journal-and-refresh', async () => {
    const expected = [...plan.scenic.expectedDiscoveries].sort();
    assert.deepEqual(discoveryIds(await read()), expected);
    await key('KeyJ');
    await wait((s) => s.state.runtime.screen === 'journal' && s.state.runtime.pauseReasons.includes('ui'));
    // This is after a normal reload: close -> old cards -> discoveries.
    await tabs(3); await key('Enter');
    await shot(visualRecheck ? 'visual-journal-three-discoveries' : 'scenic-journal-six-discoveries');
    if (!visualRecheck) {
      await key('PageDown'); await shot('scenic-journal-six-discoveries-lower');
    }
    await key('Escape'); await wait(isWalking);
    const after = await reloadAndContinue(visualRecheck ? 'visual-three-discoveries-save' : 'scenic-six-discoveries-save');
    assert.deepEqual(discoveryIds(after), expected);
    assert.ok(after.state.durable.mailed && after.state.durable.endingSeen && after.world.sunset);
    if (independentMemory) assertIndependentMemory(after, independentMemory);
  });

  console.log(JSON.stringify({ route: plan.revision, timeline }));
  return { scope: visualRecheck ? 'visual recheck: normal two-card main route, exactly last-letter/lost-postcard/sunset-seat, real-photo letter, ending and persistence; full-six proof remains scenic-02'
    : plan.scenic ? 'full primary route plus six ordinary discoveries, visible town alley, wind reread, bench, optional real-photo letter and valley postcard; order/early-ridge/12-photo cases remain'
    : 'full primary route; separate order/early-ridge/12-photo cases remain',
    route: plan.revision, realElapsedSeconds: (Date.now() - began) / 1000,
    inputReleaseSettlingSeconds: settlingMs / 1000, usedAdvance: false,
    observedReleasedDragFrames: dragReleaseFrames,
    durationCaveat: 'automation time is not proof of 15+ minutes of player content',
    audioScope: 'native normal/vista/outro playback signals; listening acceptance remains separate',
    ...(visualRecheck ? { visualAcceptance: 'pending independent review of actual landmarks, physical paper before/after, retained images and letter page' } : {}),
    screenshots: timeline.length, endingPhotoId, independentMemoryPhotoId: independentMemory?.photo.id ?? null };
}

export default async function fullJourneyPlaythrough(play) { return runFullJourney(play); }
