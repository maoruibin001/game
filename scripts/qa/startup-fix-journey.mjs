import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { cameraActive, createLetterHarness, walking } from './letter-normal-input.mjs';
import { P0_ROUTE } from './p0-route-plan.mjs';

const evidence = fileURLToPath(new URL('../../.forgeax/diag/startup-fix-journey/', import.meta.url));
const viewport = [1920, 1080];
const yawError = (target, current) => Math.atan2(Math.sin(target - current), Math.cos(target - current));

export default async function startupFixJourney(play) {
  const h = await createLetterHarness(play, { id: 'fresh-main-journey', viewport }, {
    budgetMs: 570000,
  }, evidence);
  const errors = [];
  play.page.on('pageerror', error => errors.push(String(error)));
  play.page.on('console', entry => {
    if (entry.type() === 'error') errors.push(entry.text());
  });
  const action = name => '[data-action="' + name + '"]';
  const click = selector => play.page.locator(selector).click({ timeout: 8000 });
  h.report.music = {};

  async function observeMusic(label, cue) {
    try {
      const observation = await h.wait(s => {
        const music = s.frontend?.music;
        return music && (music.phase === 'failed' || music.phase === 'unavailable'
          || (music.phase === 'playing' && music.cue === cue));
      }, 10000);
      h.report.music[label] = observation.frontend.music;
    } catch (error) {
      h.report.music[label] = { error: String(error) };
    }
  }

  async function reply(letter, photo) {
    const card = '[data-reply-letter="' + letter + '"] ';
    await click(card + action('pick-reply-photo') + '[data-id="' + photo.id + '"]');
    await click(card + action('select-reply-photo'));
    await h.wait(s => s.state.durable.replyPhotos[letter]?.photo.id === photo.id);
  }

  async function facePath(point) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const { controller, state } = await h.read();
      const [x, , z] = controller.position;
      const error = yawError(Math.atan2(point[0] - x, z - point[1]), controller.yaw);
      if (Math.abs(error) < 0.075) return;
      const rate = 2.15 * state.durable.settings.sensitivity;
      const duration = Math.min(1100, Math.max(30, 1000 * Math.abs(error) / rate));
      await play.keyboard.hold(error > 0 ? 'ArrowRight' : 'ArrowLeft', duration);
      await h.settle();
    }
    assert.fail('walking view did not respond to the direction keys');
  }

  async function walkTo(point, tolerance = 1.1) {
    const remaining = ({ controller }) => Math.hypot(controller.position[0] - point[0], controller.position[2] - point[1]);
    let state = await h.read();
    let stuck = 0;
    while (remaining(state) > tolerance) {
      await facePath(point);
      const before = remaining(state);
      const duration = Math.max(40, Math.min(1000, 1000 * (before - tolerance * 0.55) / 6.8));
      await play.keyboard.hold('KeyW', duration);
      await h.settle();
      state = await h.read();
      assert.ok(walking(state));
      stuck = before - remaining(state) < 0.025 ? stuck + 1 : 0;
      assert.ok(stuck < 4, 'walking stopped making progress toward ' + point.join(', '));
    }
  }

  async function route(points, tolerance) {
    for (const point of points) await walkTo(point, tolerance);
  }

  async function cameraAt(view, name) {
    await walkTo(view.feet, 0.22);
    await h.key('KeyC');
    const { controller } = await h.wait(cameraActive);
    const delta = view.target.map((value, axis) => value - controller.camera.position[axis]);
    await h.turnTo(Math.atan2(delta[0], -delta[2]), -Math.atan2(delta[1], Math.hypot(delta[0], delta[2])));
    await h.shot(name + '-actual-composition');
  }

  let failure;
  try {
    let first, forest, town, original;
    await h.step('Start from a fresh title menu and take a first photo', async () => {
      await h.startFresh();
      await h.shot('01-opening');
      await observeMusic('first-play', 'normal');
      await play.page.keyboard.press('c');
      first = await h.photograph('02-first-photo');
      await h.lowerCamera();
    });

    await h.step('Walk to the forest, match the postcard and see the windmill awaken', async () => {
      await route(P0_ROUTE.forest);
      await cameraAt(P0_ROUTE.forestPhoto, '03-forest');
      forest = await h.photograph('04-windmill', { matchedCard: 'forest' });
      await h.wait(s => s.state.durable.stamps.forest && s.world.windmillTurning === true);
      await h.lowerCamera();
      await route(P0_ROUTE.forestReturn);
    });

    await h.step('Open the old town gate and use the bridge unlocked by the photograph', async () => {
      await route(P0_ROUTE.town.slice(1, -1));
      await route(P0_ROUTE.lever, 0.3);
      await h.wait(s => walking(s) && s.state.runtime.nearby === 'town-gate');
      await h.key('KeyE');
      await h.wait(s => s.state.durable.gateOpened);
      await walkTo([148, -2], 0.3);
      await cameraAt({ feet: [155, -3], target: [155, 29, 10] }, '05-old-town');
      town = await h.photograph('06-open-bridge', { matchedCard: 'town' });
      await h.wait(s => s.state.runtime.bridgeProgress >= 1);
      await h.lowerCamera();
      await route([[155, 7], [155, 20], [155, 32]], 0.7);
      await h.shot('07-crossed-bridge');
    });

    await h.step('Answer both letters, send a postcard and download the images', async () => {
      await h.key('KeyJ');
      await h.wait(s => s.state.runtime.screen === 'journal');
      await reply('forest', forest);
      await reply('town', town);
      await click(action('edit-reply') + '[data-letter="final"]');
      await click(action('pick-reply-photo') + '[data-letter="final"][data-id="' + first.id + '"]');
      await click(action('confirm-final-photo'));
      await h.wait(s => s.view.canSendLetter);
      await click('button.sy-close:visible');
      await h.wait(walking);
      await route([[155, 20], [155, 7], [157.75, 5]], 0.65);
      await h.wait(s => s.state.runtime.nearby === 'mailbox:town');
      await h.key('KeyE');
      await click(action('send-letter'));
      await h.wait(s => s.state.durable.mailed && s.state.runtime.screen === 'ending');
      await h.shot('08-postmarked');
      await observeMusic('postmarked', 'outro');
      await h.download('09-postcard', () => click(action('export-postcard')), [2160, 1500], { photoId: first.id });
      original = await h.download('10-original', () => click(action('export-photo')), viewport, {
        photoId: first.id, bytes: first.original.bytes,
      });
    });

    await h.step('Reload and use the restored postcard and original', async () => {
      await click(action('keep-exploring'));
      await h.wait(walking);
      await h.key('Escape');
      await h.wait(s => s.state.runtime.screen === 'paused' && s.view.saveStatus === 'saved');
      await play.reload();
      const restored = await h.wait(s => s.restored && s.state.runtime.screen === 'menu', 22000);
      assert.equal(restored.state.durable.mailed, true);
      assert.equal(restored.state.durable.replyPhotos.forest?.photo.id, forest.id);
      assert.equal(restored.state.durable.replyPhotos.town?.photo.id, town.id);
      await click(action('continue'));
      await h.wait(walking);
      await h.key('KeyJ');
      await h.wait(s => s.state.runtime.screen === 'journal');
      await play.page.getByRole('tab', { name: /留住的风景/ }).click();
      await click(action('photo-collection') + '[data-collection="film"]');
      await click('.sy-album ' + action('view-photo') + '[data-id="' + first.id + '"]');
      const after = await h.download('11-restored-original', () => click(action('export-photo')), viewport, {
        photoId: first.id, bytes: first.original.bytes,
      });
      assert.equal(after.sha256, original.sha256);
      await h.shot('12-restored-photo');
    });
    assert.deepEqual(errors, []);
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    h.report.browserErrors = errors;
    await h.finish(failure);
  }
}
