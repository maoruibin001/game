import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { cameraActive, createLetterHarness, walking } from './letter-normal-input.mjs';
import { P0_ROUTE } from './p0-route-plan.mjs';
import { ordinaryRoadNavigation } from './ordinary-road-navigation.mjs';

const evidence = fileURLToPath(new URL('../../.forgeax/diag/opening-forest-journey/', import.meta.url));
const viewport = [1920, 1080];


export default async function openingForestJourney(play) {
  return playOpeningForestJourney(play);
}

export async function playOpeningForestJourney(play, options = {}) {
  const h = await createLetterHarness(play, { id: options.id ?? 'fresh-main-journey', viewport }, {
    budgetMs: 570000,
  }, options.evidence ?? evidence);
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

  const { walkTo, route, cameraAt } = ordinaryRoadNavigation(play, h);

  let failure;
  try {
    let first, forest, town, original;
    await h.step('Start from a fresh title menu and take a first photo', async () => {
      await h.startFresh();
      assert.equal(await play.page.getByText('举起相机', { exact: false }).count() > 0, true);
      await h.shot('01-opening');
      await observeMusic('first-play', 'normal');
      await play.page.keyboard.press('c');
      const { controller } = await h.wait(s => cameraActive(s) && s.view.opening?.step === 'frame');
      await h.turnTo(controller.yaw + 0.22, controller.pitch);
      await h.wait(s => s.view.opening?.step === 'shutter');
      first = await h.photograph('02-first-photo');
      await play.page.getByRole('button', {name: /第一张已保存.*查看照片/}).click();
      await play.page.getByRole('button', {name: /读阿禾的来信/}).waitFor();
      await play.page.keyboard.press('j');
      const ahe = play.page.locator('[data-reply-letter="forest"]');
      await play.page.getByRole('button', { name: '先上路' }).click();
      await ahe.getByText('林间近路 · 一张', {exact:true}).waitFor();
      assert.equal(await ahe.locator('[data-action="send-route-pair"]').count(), 0);
      await h.shot('02-b-first-letter');
      await click('button.sy-close:visible');
      await h.wait(cameraActive);
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
      if (options.townView) {
        await options.townView({ play, h, walkTo, cameraAt, click, action });
      } else {
        await cameraAt({ feet: [155, -3], target: [155, 29, 10] }, '05-old-town');
      }
      town = await h.photograph('06-open-bridge', { matchedCard: 'town' });
      await options.afterTownPhoto?.({ play, h, town, click, action });
      await h.wait(s => s.state.runtime.bridgeProgress >= 1);
      await h.lowerCamera();
      await route([[155, 7], [155, 20], [155, 32]], 0.7);
      await h.shot('07-crossed-bridge');
    });

    await h.step('Answer both letters, send a postcard and download the images', async () => {
      await h.key('KeyJ');
      await h.wait(s => s.state.runtime.screen === 'journal');
      await play.page.getByRole('tab', { name: '来信' }).click();
      await reply('forest', forest);
      assert.equal(await play.page.locator('[data-reply-letter="forest"][data-reply-status="answered"]').count(), 1);
      assert.equal(await play.page.locator('[data-reply-letter="forest"] [data-action="send-route-pair"]').count(), 0);
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
      await h.key('KeyE');
      const reread = await h.wait(s => s.state.runtime.screen === 'ending');
      assert.equal(reread.state.durable.mailedFrom, 'mailbox:town');
      assert.equal(await play.page.locator(action('send-letter')).count(), 0);
      await h.shot('11-mailbox-reread');
      await click(action('keep-exploring'));
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
      await options.afterRestore?.({ play, h, town, click, action });
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
