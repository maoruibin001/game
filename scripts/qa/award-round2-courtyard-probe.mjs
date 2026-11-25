// Focused Town -> Courtyard -> Rain/Afterglow -> Ridge FPS & Reload probe on 90d7e15.
import assert from 'node:assert/strict';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { P0_ROUTE } from './p0-route-plan.mjs';
import { COURTYARD_PHOTO } from '../../assets/shanye-world/courtyard.ts';

const OUT = fileURLToPath(new URL('../../../production/award-handoff-20261117/qa-run/', import.meta.url));
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

export default async function awardRound2CourtyardProbe(play) {
  await mkdir(OUT, { recursive: true });
  const report = { startedAt: new Date().toISOString(), status: 'running', shots: [], downloads: [], fpsSamples: [], checks: {}, unexpectedShutters: [] };
  let expectedPhotos = 0;

  const read = async () => play.state('shan.journey');
  const wait = async (pred, timeoutMs = 12000) => play.waitFor(pred, { read: 'shan.journey', timeoutMs });
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

  async function sampleFps(label, durationMs = 5000) {
    const data = await play.page.evaluate(async ms => {
      const rafDeltas = [], hudSamples = [];
      let last = performance.now();
      const start = last;
      const pollHud = () => {
        const m = (document.getElementById('forgeax-status')?.innerText ?? '').match(/FPS\s+([\d.]+)/);
        if (m) hudSamples.push(Number(m[1]));
      };
      const timer = setInterval(pollHud, 500);
      pollHud();
      await new Promise(resolve => {
        function tick(now) {
          rafDeltas.push(now - last);
          last = now;
          if (now - start >= ms) { resolve(); return; }
          requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      });
      clearInterval(timer);
      const valid = rafDeltas.slice(1).filter(d => d > 0 && d < 500);
      const meanMs = valid.reduce((a, b) => a + b, 0) / Math.max(1, valid.length);
      return { frames: valid.length, meanFps: Number((1000 / meanMs).toFixed(1)), hudFpsSamples: hudSamples };
    }, durationMs);
    report.fpsSamples.push({ label, ...data });
    return data;
  }

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
      const after = await read();
      if (after.state.durable.totalPhotos !== expectedPhotos) {
        report.unexpectedShutters.push({ during: 'turnTo', inputDiagnostics: after.inputDiagnostics });
      }
    }
    assert.fail('turnTo failed to converge');
  }

  async function walkTo(point, tolerance = 1.1) {
    let s = await read(), blocked = 0;
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
    await walkTo(view.feet, 0.25);
    await key('KeyC');
    await wait(cameraActive);
    const p = (await read()).controller.camera.position, t = view.target;
    await turnTo(Math.atan2(t[0] - p[0], -(t[2] - p[2])), -Math.atan2(t[1] - p[1], Math.hypot(t[0] - p[0], t[2] - p[2])));
    if (name) await shot(name);
  }

  let error;
  try {
    await play.step('01-town-crank-arch-and-courtyard', async () => {
      await wait(s => s.restored && s.state.runtime.screen === 'menu');
      await key('Tab'); await key('Enter');
      await wait(walking);
      await sampleFps('spawn-post-office-1530', 5000);
      await route(P0_ROUTE.town.slice(0, -1));
      await route(P0_ROUTE.lever, 0.25);
      await wait(s => walking(s) && s.state.runtime.nearby === 'town-gate');
      await key('KeyE');
      await wait(s => walking(s) && s.state.durable.gateOpened);
      await route([[148, -2], [155, -3]], 0.25);
      await cameraAt({ feet: [155, -3], target: [155, 29, 10] }, '06-town-arch-view');
      await key('Space');
      await wait(s => cameraActive(s) && s.state.durable.totalPhotos === ++expectedPhotos, 12000);
      await lowerCamera();
      await wait(s => walking(s) && s.state.runtime.bridgeProgress === 1, 5000);

      await route([[155, 7], [155, 20], [155, 28], [155, 37], [155, 42], [COURTYARD_PHOTO.view.feet[0], COURTYARD_PHOTO.view.feet[2]]], 0.35);
      await shot('07-courtyard-arrival');
      await cameraAt({ feet: [COURTYARD_PHOTO.view.feet[0], COURTYARD_PHOTO.view.feet[2]], target: COURTYARD_PHOTO.view.target }, '08-courtyard-view');
      await sampleFps('courtyard-bell-view', 5000);
      await key('Space');
      const saved = await wait(s => cameraActive(s) && s.state.durable.totalPhotos === ++expectedPhotos, 12000);
      const courtPhoto = saved.state.durable.film.at(-1);
      assert.ok(courtPhoto.replyCandidates?.some(c => c.variant === 'courtyard'), 'courtyard photo must qualify for town reply');
      report.checks.courtyardId = courtPhoto.id;
      await shot('09-courtyard-captured');

      // Export 1920x1080 courtyard original
      await key('KeyJ');
      await wait(s => s.state.runtime.screen === 'journal' && s.controller.paused);
      await play.page.locator('[role="tab"]').nth(2).click();
      await play.page.locator('[data-action="photo-collection"][data-collection="film"]').click();
      await play.page.locator(`.sy-album [data-id="${courtPhoto.id}"]`).first().click();
      const dlPromise = play.page.waitForEvent('download', { timeout: 12000 });
      await play.page.locator('[data-action="export-photo"]').first().click();
      const dl = await dlPromise;
      const file = join(OUT, '09-courtyard-original.jpg');
      await dl.saveAs(file);
      const bytes = await readFile(file);
      const size = jpegSize(bytes);
      assert.deepEqual([size.width, size.height], [1920, 1080]);
      report.downloads.push({ label: '09-courtyard-original', file, ...size, bytes: bytes.length, sha256: sha(bytes) });
      await key('Escape'); await key('Escape');
      await lowerCamera();
    });

    await play.step('02-courtyard-rain-and-afterglow', async () => {
      await play.page.locator('[data-action="open-outings"]').click();
      await wait(s => s.state.runtime.screen === 'journal' || s.controller.paused);
      await play.page.locator('[data-action="set-creative-mode"]').click();
      await play.page.locator('[data-action="set-weather"][data-weather="rain"]').click();
      await play.page.locator('[data-action="close"]').click();
      await wait(walking);
      await play.wait(2800);
      await shot('10-courtyard-rain');

      await play.page.locator('[data-action="open-outings"]').click();
      await play.page.locator('[data-creative-time]').fill('17:55');
      await play.page.locator('[data-action="set-weather"][data-weather="afterglow"]').click();
      await play.page.locator('[data-action="close"]').click();
      await wait(walking);
      await play.wait(2800);
      await shot('11-courtyard-afterglow-1755');

      await play.page.locator('[data-action="open-outings"]').click();
      await play.page.locator('[data-action="set-creative-mode"]').click();
      await play.page.locator('[data-action="close"]').click();
      await wait(walking);
    });

    await play.step('03-town-reply-and-reload', async () => {
      await play.page.locator('[data-action="open-journal"]').click();
      await wait(s => s.state.runtime.screen === 'journal');
      await play.page.locator('[role="tab"]').nth(0).click();
      await play.page.locator(`[data-action="pick-reply-photo"][data-letter="town"][data-id="${report.checks.courtyardId}"]`).click();
      await play.page.locator('[data-action="select-reply-photo"][data-letter="town"]').click();
      await wait(s => s.state.durable.replyPhotos.town?.photo.id === report.checks.courtyardId);
      await key('Escape');
      await wait(walking);
      await play.wait(1200);
      await play.reload();
      await wait(s => s.restored && s.state.runtime.screen === 'menu');
      await key('Tab'); await key('Enter');
      await wait(walking);
      const reloaded = await read();
      assert.equal(reloaded.state.durable.stamps.town, true);
      assert.equal(reloaded.state.durable.replyPhotos.town?.photo.id, report.checks.courtyardId);
      report.checks.reloadPersisted = true;
    });

    report.status = 'passed';
  } catch (e) {
    error = e;
    report.status = 'failed';
    report.error = String(e);
    throw e;
  } finally {
    report.finishedAt = new Date().toISOString();
    await writeFile(join(OUT, 'courtyard-report.json'), JSON.stringify(report, null, 2) + '\n');
  }
}
