import assert from 'node:assert/strict';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { P0_ROUTE } from './p0-route-plan.mjs';
import { COURTYARD_PHOTO } from '../../assets/shanye-world/courtyard.ts';

const OUT = fileURLToPath(new URL('../../../production/iteration-final-polish-20261117/qa-run/', import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const wrap = n => ((n + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
const distance = (p, t) => Math.hypot(p[0] - t[0], p[2] - t[1]);
const walking = s => s.state.runtime.screen === 'play' && s.controller.mode === 'walk' && !s.controller.paused
  && s.state.runtime.pauseReasons.length === 0 && s.frontend?.focus?.target === 'canvas';
const cameraActive = s => s.state.runtime.screen === 'photo' && s.controller.mode === 'photo' && !s.controller.paused
  && s.state.runtime.pauseReasons.length === 0 && s.frontend?.focus?.target === 'canvas' && !s.pendingCapture && !s.state.durable.pendingPhoto;

function jpegSize(bytes) {
  assert.equal(bytes.readUInt16BE(0), 0xffd8);
  let at = 2;
  while (at < bytes.length - 9) {
    while (bytes[at] === 0xff) at++;
    const marker = bytes[at++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const length = bytes.readUInt16BE(at);
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { width: bytes.readUInt16BE(at + 5), height: bytes.readUInt16BE(at + 3) };
    }
    at += length;
  }
  assert.fail('JPEG missing SOF dimensions');
}

export default async function finalContestProbe(play) {
  await mkdir(OUT, { recursive: true });
  const report = { startedAt: new Date().toISOString(), status: 'running', shots: [], photos: [], downloads: [], checks: {} };
  let expectedPhotos = 0;

  const read = async () => play.state('shan.journey');
  const wait = async (pred, timeoutMs = 10000) => play.waitFor(pred, { read: 'shan.journey', timeoutMs });
  const settle = async () => play.wait(80);
  const key = async code => { await play.keyboard.press(code); await settle(); };
  const shot = async name => {
    const s = await read();
    const cap = await play.screenshot(name);
    const file = join(OUT, `${name}.png`);
    await copyFile(cap.path, file);
    assert.equal(cap.rendered, true);
    report.shots.push({ name, file, digest: cap.digest, area: s.state.durable.player.area, weather: s.state.durable.weather, clock: s.state.durable.clock });
    return s;
  };
  async function turnTo(yaw, pitch = 0.13) {
    for (let attempt = 0; attempt < 28; attempt++) {
      const s = await read();
      const dx = wrap(yaw - s.controller.yaw), dy = pitch - s.controller.pitch;
      if (Math.abs(dx) < 0.012 && Math.abs(dy) < 0.012) return;
      const sens = 0.0022 * s.state.durable.settings.sensitivity, inv = s.state.durable.settings.invertY ? -1 : 1;
      await play.mouse.move([0.5, 0.5]);
      const before = await read();
      await wait(v => (walking(v) || cameraActive(v)) && v.state.durable.playSeconds > before.state.durable.playSeconds, 2500);
      await play.mouse.drag([0.5, 0.5], [0.5 + clamp(dx / sens, -230, 230) / 1920, 0.5 + clamp(dy / (sens * inv), -170, 170) / 1080], { button: 'right' });
      await settle();
    }
    assert.fail('turnTo failed to converge');
  }
  async function walkTo(point, tolerance = 1.1) {
    let s = await read();
    let blocked = 0;
    const began = Date.now(), limit = 20000 + distance(s.controller.position, point) / 3 * 1000;
    while (distance(s.controller.position, point) > tolerance) {
      assert.ok(Date.now() - began < limit, `walkTo timed out at ${point}`);
      const p = s.controller.position;
      await turnTo(Math.atan2(point[0] - p[0], -(point[1] - p[2])));
      const before = await read();
      await play.keyboard.hold('KeyW', clamp((distance(before.controller.position, point) - tolerance * 0.55) / 6.8 * 1000, 40, 700));
      await settle();
      s = await read();
      blocked = distance(s.controller.position, [before.controller.position[0], before.controller.position[2]]) < 0.045 ? blocked + 1 : 0;
      assert.ok(blocked < 4, `movement blocked toward ${point}`);
    }
    return s;
  }
  const route = async (pts, tol = 1.1) => { for (const pt of pts) await walkTo(pt, tol); };
  const lowerCamera = async () => { await wait(cameraActive); await key('KeyC'); return wait(walking); };
  async function cameraAt(view, name) {
    if (cameraActive(await read())) await lowerCamera();
    await walkTo(view.feet, 0.2);
    await key('KeyC');
    await wait(cameraActive);
    const p = (await read()).controller.camera.position, t = view.target;
    await turnTo(Math.atan2(t[0] - p[0], -(t[2] - p[2])), -Math.atan2(t[1] - p[1], Math.hypot(t[0] - p[0], t[2] - p[2])));
    if (name) await shot(name);
  }
  async function photograph(name, { matchedCard, courtyard = false } = {}) {
    await wait(cameraActive);
    await key('Space');
    const saved = await wait(s => cameraActive(s) && s.state.durable.totalPhotos === expectedPhotos + 1, 12000);
    expectedPhotos++;
    const photo = saved.state.durable.film.at(-1);
    const photoView = saved.view.film.find(v => v.id === photo.id);
    assert.ok(photo?.original && photo.scene?.clock && photo.thumbnail?.startsWith('data:image/jpeg;'));
    assert.ok(photoView?.caption && photoView.caption.length >= 10, `expected grounded auto-caption, got: ${photoView?.caption}`);
    if (matchedCard) assert.ok(photo.matchedCards.includes(matchedCard), `missing matched card ${matchedCard}`);
    if (courtyard) assert.ok(photo.replyCandidates?.some(c => c.variant === 'courtyard'), 'missing courtyard candidate');
    report.photos.push({ name, id: photo.id, area: photo.area, caption: photoView.caption, bytes: photo.original.bytes });
    await shot(name);
    return photo;
  }

  let error;
  try {
    await play.step('start-and-post-porch-caption', async () => {
      await wait(s => s.restored && s.state.runtime.screen === 'menu');
      await key('Tab'); await key('Enter');
      await wait(walking);
      await shot('01-spawn-post-morning');
      await cameraAt({ feet: [2, -214], target: [-3, 16.4, -231] }, '02-post-porch-composition');
      await photograph('03-post-porch-captured');
      await lowerCamera();
    });

    await play.step('forest-windmill-and-zipline-return', async () => {
      await route(P0_ROUTE.forest);
      await cameraAt(P0_ROUTE.forestPhoto, '04-forest-windmill-view');
      const forestPhoto = await photograph('05-forest-matched', { matchedCard: 'forest' });
      report.checks.forestId = forestPhoto.id;
      await lowerCamera();
      await route(P0_ROUTE.forestReturn);
    });

    await play.step('town-gate-arch-bridge-and-courtyard', async () => {
      await route(P0_ROUTE.town.slice(1, -1));
      await cameraAt({ feet: [155, -8], target: [155, 27.5, 18] }, '06-town-approach-raised-bridge');
      await lowerCamera();
      await route(P0_ROUTE.lever, 0.25);
      await wait(s => walking(s) && s.state.runtime.nearby === 'town-gate');
      await key('KeyE');
      await wait(s => walking(s) && s.state.durable.gateOpened);
      await route([[148, -2], [155, -3]], 0.25);
      await cameraAt({ feet: [155, -3], target: [155, 29, 10] }, '07-town-arch-open');
      await photograph('08-town-arch-matched', { matchedCard: 'town' });
      await lowerCamera();
      await wait(s => walking(s) && s.state.runtime.bridgeProgress === 1, 5000);
      await shot('09-town-lowered-bridge');
      await route([[155, 7], [155, 20], [155, 28], [155, 37], [155, 42], [COURTYARD_PHOTO.view.feet[0], COURTYARD_PHOTO.view.feet[2]]], 0.35);
      await cameraAt({ feet: [COURTYARD_PHOTO.view.feet[0], COURTYARD_PHOTO.view.feet[2]], target: COURTYARD_PHOTO.view.target }, '10-courtyard-composition');
      const courtPhoto = await photograph('11-courtyard-captured', { courtyard: true });
      report.checks.courtyardId = courtPhoto.id;
      await lowerCamera();
    });

    await play.step('night-and-rain-preview-at-old-town', async () => {
      // Use official UI creative mode briefly only to render rain and 20:10 night screenshots at Old Town
      await route([[155, 42], [155, 37], [155, 28], [155, 20], [155, 2]], 0.35);
      await turnTo(0, 0.12);
      await play.page.locator('[data-action="open-outings"]').click();
      await wait(s => s.state.runtime.screen === 'journal' || s.controller.paused);
      await play.page.locator('[data-action="set-creative-mode"]').click();
      await play.page.locator('[data-action="set-weather"][data-weather="rain"]').click();
      await play.page.locator('[data-action="close"]').click();
      await wait(walking);
      await play.wait(2800);
      await shot('12-town-rain');

      await play.page.locator('[data-action="open-outings"]').click();
      await play.page.locator('[data-creative-time]').fill('20:10');
      await play.page.locator('[data-action="set-weather"][data-weather="morning"]').click();
      await play.page.locator('[data-action="close"]').click();
      await wait(walking);
      await play.wait(2800);
      await shot('13-town-night-2010');

      // Return cleanly to normal journey mode before climbing to ridge & mailing
      await play.page.locator('[data-action="open-outings"]').click();
      await play.page.locator('[data-action="set-creative-mode"]').click();
      await play.page.locator('[data-action="close"]').click();
      await wait(walking);
    });

    await play.step('ridge-overlook-and-three-letter-mail', async () => {
      await route([[155, 20], [166, 31], [176, 26], [166, 31], ...P0_ROUTE.ridge], 1.1);
      await cameraAt({ feet: [64, 204], target: [48.568, 61.842, 108.132] }, '14-ridge-valley-panorama');
      await lowerCamera();
      await walkTo([0, 235], 0.5);
      await turnTo(Math.PI, 0.12);
      await shot('15-ridge-pavilion-overlook');

      // Open journal via J, select Forest reply, Courtyard Town reply, and Final photo, then mail at Ridge mailbox
      await key('KeyJ');
      await wait(s => s.state.runtime.screen === 'journal');
      await play.page.locator(`[data-action="pick-reply-photo"][data-letter="forest"][data-id="${report.checks.forestId}"]`).click();
      await play.page.locator('[data-action="select-reply-photo"][data-letter="forest"]').click();
      await wait(s => s.state.durable.replyPhotos.forest?.photo.id === report.checks.forestId);

      await play.page.locator(`[data-action="pick-reply-photo"][data-letter="town"][data-id="${report.checks.courtyardId}"]`).click();
      await play.page.locator('[data-action="select-reply-photo"][data-letter="town"]').click();
      await wait(s => s.state.durable.replyPhotos.town?.photo.id === report.checks.courtyardId);

      await play.page.locator('[data-action="edit-reply"][data-letter="final"]').click();
      await play.page.locator(`[data-action="pick-reply-photo"][data-letter="final"][data-id="${report.checks.forestId}"]`).click();
      await play.page.locator('[data-action="pick-reply-note"][data-letter="final"]').nth(1).click();
      await play.page.locator('[data-action="confirm-final-photo"]').click();
      await wait(s => s.state.durable.endingPhoto?.id === report.checks.forestId);
      await key('Escape');
      await wait(walking);

      await walkTo([11.75, 230.4], 0.4);
      await wait(s => walking(s) && s.state.runtime.nearby === 'mailbox:ridge');
      await key('KeyE');
      await wait(s => (s.view?.mailRequest ?? 0) > 0);
      await play.page.locator('[data-action="send-letter"]').click();
      const mailed = await wait(s => s.state.durable.mailed && s.state.runtime.screen === 'ending');
      assert.equal(mailed.state.durable.mailedFrom, 'mailbox:ridge');
      await shot('16-ending-mailed');

      for (const [label, actionSel, expectedDim] of [
        ['final-ending-postcard', '[data-action="export-postcard"]', [2160, 1500]],
        ['final-ending-original', '[data-action="export-photo"]', [1920, 1080]],
      ]) {
        const dlPromise = play.page.waitForEvent('download', { timeout: 12000 });
        await play.page.locator(actionSel).first().click();
        const dl = await dlPromise;
        const file = join(OUT, `${label}.jpg`);
        await dl.saveAs(file);
        const bytes = await readFile(file);
        const size = jpegSize(bytes);
        assert.deepEqual([size.width, size.height], expectedDim);
        report.downloads.push({ label, file, ...size, bytes: bytes.length, sha256: sha(bytes) });
      }
    });

    report.status = 'passed';
  } catch (e) {
    error = e;
    report.status = 'failed';
    report.error = String(e);
    throw e;
  } finally {
    report.finishedAt = new Date().toISOString();
    await writeFile(join(OUT, 'probe-report.json'), JSON.stringify(report, null, 2) + '\n');
  }
}
