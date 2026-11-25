import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createLetterHarness, cameraActive, walking } from './letter-normal-input.mjs';
import { ordinaryRoadNavigation } from './ordinary-road-navigation.mjs';
import { P0_ROUTE } from './p0-route-plan.mjs';

const out = fileURLToPath(new URL('../../.forgeax/diag/opening-east-ridge/', import.meta.url));
const action = name => '[data-action="' + name + '"]';

export default async function openingEastRidge(play) {
  const h = await createLetterHarness(play, { id: 'east-ridge', viewport: [1920, 1080] }, { budgetMs: 440000 }, out);
  const { walkTo, route, cameraAt } = ordinaryRoadNavigation(play, h);
  const ahe = play.page.locator('[data-reply-letter="forest"]');
  const click = selector => play.page.locator(selector).click({ timeout: 8000 });
  const close = async () => {
    await click('button.sy-close:visible');
    return h.wait(walking);
  };
  async function journal() {
    await h.key('KeyJ');
    await h.wait(s => s.state.runtime.screen === 'journal');
    await play.page.getByRole('tab', { name: '来信' }).click();
  }
  let error;
  try {
    let turn, destination, print;
    await h.step('A new player sees both routes without an empty east-ridge attachment form', async () => {
      await h.startFresh();
      await journal();
      await play.page.getByRole('button', { name: '先上路' }).click();
      await ahe.getByText('林间近路 · 一张', { exact: true }).waitFor();
      await ahe.getByText('东岭古道 · 两张', { exact: true }).waitFor();
      assert.equal(await ahe.locator(action('send-route-pair')).count(), 0);
      await h.shot('01-two-routes');
      await close();
    });

    await h.step('Walk through town and up the ridge with normal movement, interactions and camera', async () => {
      await route(P0_ROUTE.town.slice(0, -1));
      await route(P0_ROUTE.lever, 0.35);
      await h.wait(s => s.state.runtime.nearby === 'town-gate');
      await h.key('KeyE');
      await h.wait(s => s.state.durable.gateOpened);
      await walkTo([148, -2], 0.35);
      await cameraAt({ feet: [155, -3], target: [155, 29, 10] }, '02-town');
      await h.photograph('03-town-card', { matchedCard: 'town' });
      await h.lowerCamera();
      await route([[155, 7], [155, 20], [194, 59], [216, 109], [171, 135], [126, 178], [64, 204]]);
    });

    await h.step('Take and attach both real ridge photos, then send one reply to Ah He', async () => {
      await journal();
      await ahe.getByRole('button', { name: /0\/2/ }).waitFor();
      await h.shot('04-ridge-form-unopened');
      await close();
      await cameraAt({ feet: [64, 204], target: [68.4, 84.88, 199] }, '05-turn');
      turn = await h.photograph('06-turn-photo');
      assert.equal(turn.routeSlot, 'turn');
      await h.lowerCamera();
      await cameraAt({ feet: [72, 200], target: [-170, 44.5, -20.25] }, '07-west-slope');
      await click(action('toggle-photo-tools'));
      await click(action('photo-option') + '[data-photo-key="lens"][data-value="tele"]');
      await click(action('toggle-photo-tools'));
      await h.wait(s => cameraActive(s) && s.state.durable.photography.lens === 'tele');
      destination = await h.photograph('08-destination-photo');
      assert.equal(destination.routeSlot, 'destination');
      await h.lowerCamera();
      await journal();
      await ahe.locator(action('attach-route-photo') + '[data-id="' + turn.id + '"]').click();
      await h.wait(s => s.state.durable.routeDraft.turn?.id === turn.id);
      await ahe.locator(action('attach-route-photo') + '[data-id="' + destination.id + '"]').click();
      await h.wait(s => s.state.durable.routeDraft.destination?.id === destination.id);
      await ahe.locator(action('send-route-pair')).click();
      const replied = await h.wait(s => s.state.durable.replyPhotos.forest?.variant === 'route-pair');
      assert.equal(replied.state.durable.replyPhotos.forest.photo.id, turn.id);
      assert.equal(replied.state.durable.replyPhotos.forest.destination.id, destination.id);
      assert.equal(replied.state.durable.stamps.forest, false);
      assert.equal(await ahe.count(), 1);
      assert.equal(await ahe.locator(action('send-route-pair')).count(), 0);
      await ahe.locator('.sy-reply-response').scrollIntoViewIfNeeded();
      await h.shot('09-one-reply');
      print = await h.download('10-printed-reply', () => ahe.locator(action('export-route-letter')).click(), [2400, 1360]);
      await close();
    });

    await h.step('Resume the ordinary saved journey with the two images still in the one reply', async () => {
      await h.key('Escape');
      await h.wait(s => s.state.runtime.screen === 'paused' && s.view.saveStatus === 'saved');
      await play.reload();
      await h.wait(s => s.restored && s.state.runtime.screen === 'menu', 30000);
      await click(action('continue'));
      await h.wait(walking);
      await journal();
      assert.equal(await ahe.count(), 1);
      const after = await h.download('11-restored-reply', () => ahe.locator(action('export-route-letter')).click(), [2400, 1360]);
      assert.equal(after.sha256, print.sha256);
      await ahe.locator('.sy-reply-response').scrollIntoViewIfNeeded();
      await h.shot('12-restored-originals');
    });
  } catch (cause) {
    error = cause;
    throw cause;
  } finally {
    await h.finish(error);
  }
}
