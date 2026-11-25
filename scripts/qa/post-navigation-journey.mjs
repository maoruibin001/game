import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { cameraActive, createLetterHarness, walking } from './letter-normal-input.mjs';
import { ordinaryRoadNavigation } from './ordinary-road-navigation.mjs';
import { P0_ROUTE } from './p0-route-plan.mjs';

const evidence = fileURLToPath(new URL('../../.forgeax/diag/post-navigation/', import.meta.url));
const fork = [0, -220];
const angleGap = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

export default async function postNavigationJourney(play) {
  const h = await createLetterHarness(play, { id: 'postal-map', viewport: [1920, 1080] }, { budgetMs: 195000 }, evidence);
  const { walkTo, route } = ordinaryRoadNavigation(play, h);
  const page = play.page;
  const pocket = page.locator('.sy-pocket-map');
  const body = pocket.locator('.sy-pocket-body');
  const mapPlayer = page.locator('[data-map-position]');
  const action = name => `[data-action="${name}"]`;
  const selectRoad = name => page.getByRole('button', { name, exact: true }).click();
  const close = () => page.locator('button.sy-close:visible').click();
  async function openMap() {
    await h.key('KeyM');
    await page.getByRole('dialog', { name: '山谷地图' }).waitFor();
    await mapPlayer.waitFor();
  }
  async function readMapPointer() {
    const transform = await mapPlayer.getAttribute('transform');
    const parts = /^translate\((\S+) (\S+)\) rotate\((\S+)\)$/.exec(transform);
    assert.ok(parts, transform);
    return parts.slice(1).map(Number);
  }
  async function letters() {
    await h.key('KeyJ');
    await page.getByRole('tab', { name: '来信' }).click();
    const skip = page.getByRole('button', { name: '先上路' });
    if (await skip.isVisible()) await skip.click();
  }
  let failure;
  try {
    await h.step('Read Ah He from a fresh postal save and use both navigation choices', async () => {
      await h.startFresh();
      await pocket.waitFor();
      assert.equal(await body.isVisible(), true);
      assert.ok(await page.evaluate(() => {
        const navigation = document.querySelector('.sy-pocket-map').getBoundingClientRect();
        const tools = document.querySelector('.sy-field-tools').getBoundingClientRect();
        return navigation.top > tools.bottom && navigation.bottom < innerHeight;
      }), 'pocket map must fit below the weather and film tools');
      await h.shot('01-post-office');
      await letters();
      await h.wait(s => s.state.durable.storyRoute === 'forest');
      assert.equal(await page.getByRole('button', { name: '沿林间近路走' }).getAttribute('aria-pressed'), 'true');
      await h.shot('02-letter-fork-instructions');
      await selectRoad('改走东岭古道');
      await h.wait(s => s.view.navigation?.destination?.title.includes('东岭'));
      await close();
      await h.wait(walking);
      await openMap();
      await page.getByRole('dialog', { name: '山谷地图' }).getByText('东岭古道 · 山脊', { exact: true }).waitFor();
      await h.shot('03-ridge-route-from-public-roads');
      await selectRoad('自由走');
      await h.wait(s => s.state.durable.storyRoute === 'free' && !s.view.navigation?.destination);
      await h.key('KeyM');
      await h.wait(walking);
      await page.getByRole('button', { name: '打开摄影日程' }).click();
      const proposed = await page.locator('.sy-outing-card ' + action('track-photo-spot')).first().getAttribute('data-spot');
      await page.locator('.sy-outing-card ' + action('track-photo-spot') + `[data-spot="${proposed}"]`).first().click();
      await h.wait(s => s.state.durable.trackedPhotoSpot === proposed && s.view.navigation?.destination?.title === s.view.outings?.tracked?.spotTitle);
      await close();
      await h.wait(walking);
      await letters();
      await h.wait(s => s.state.durable.storyRoute === 'free');
      await selectRoad('沿林间近路走');
      await h.wait(s => s.state.durable.storyRoute === 'forest' && s.state.durable.trackedPhotoSpot === null);
      await close();
      await h.wait(walking);
    });

    await h.step('Compare the big-map arrow to ordinary forward steps in five directions', async () => {
      h.report.forwardChecks = [];
      for (const [name, yaw] of [['south', 0], ['north', Math.PI], ['east', Math.PI / 2], ['west', -Math.PI / 2], ['forest-road', Math.atan2(-35, -28)]]) {
        await walkTo(fork, .2);
        await h.turnTo(yaw, .13);
        await openMap();
        const before = await readMapPointer();
        if (name === 'forest-road') await h.shot('04-map-diagonal-arrow');
        await h.key('KeyM');
        await h.wait(walking);
        await play.keyboard.hold('KeyW', 340);
        await h.settle();
        await openMap();
        const after = await readMapPointer();
        const dx = after[0] - before[0], dy = after[1] - before[1];
        assert.ok(Math.hypot(dx, dy) > .5, name + ' forward step did not move the map marker');
        const observed = Math.atan2(dx, -dy);
        assert.ok(angleGap(before[2] * Math.PI / 180, observed) < .07, name + ' map arrow diverges from W');
        h.report.forwardChecks.push({ name, arrowDegrees: before[2], actualDegrees: observed * 180 / Math.PI, delta: [dx, dy] });
        await h.key('KeyM');
        await h.wait(walking);
      }
    });

    await h.step('Return from the wrong branch, then follow the forest road', async () => {
      await walkTo(fork, .26);
      await pocket.getByText(/走到邮局前岔口/).waitFor();
      await h.shot('05-post-fork');
      await walkTo([18, -203], .4);
      await pocket.getByText(/沿石路回岔口/).waitFor();
      await h.shot('06-return-from-wrong-branch');
      await walkTo(fork, .3);
      await route(P0_ROUTE.forest.slice(1, 3), .6);
      await pocket.getByText(/沿林间邮路走到底/).waitFor();
      await h.shot('07-forest-road');
    });

    await h.step('Hide the map while photographing and restore the chosen preference on reload', async () => {
      await h.key('KeyC');
      await h.wait(cameraActive);
      assert.equal(await pocket.isVisible(), false);
      await openMap();
      await h.key('KeyM');
      await h.wait(cameraActive);
      await h.photograph('08-camera-without-map');
      await h.lowerCamera();
      await pocket.waitFor();
      assert.equal(await body.isVisible(), true);
      await h.shot('09-lowered-camera');
      await selectRoad('收起随身地图');
      await h.wait(s => s.state.durable.pocketMapCollapsed && walking(s));
      await h.key('KeyC');
      await h.wait(cameraActive);
      assert.equal(await pocket.isVisible(), false);
      await h.lowerCamera();
      await page.getByRole('button', { name: '展开随身地图' }).waitFor();
      assert.equal(await body.isVisible(), false);
      await h.shot('10-collapsed-after-camera');
      await openMap();
      await h.key('KeyM');
      await h.wait(walking);
      await h.key('Escape');
      await h.wait(s => s.state.runtime.screen === 'paused' && s.view.saveStatus === 'saved');
      await play.reload();
      const restored = await h.wait(s => s.restored && s.state.runtime.screen === 'menu', 30000);
      assert.equal(restored.state.durable.storyRoute, 'forest');
      assert.equal(restored.state.durable.pocketMapCollapsed, true);
      assert.equal(restored.state.durable.totalPhotos, 1);
      await selectRoad('接着上一次的路');
      await h.wait(walking);
      assert.equal(await body.isVisible(), false);
      await selectRoad('展开随身地图');
      await h.wait(s => !s.state.durable.pocketMapCollapsed && walking(s));
      await pocket.getByText(/沿林间邮路走到底/).waitFor();
      await h.shot('11-reloaded-expanded-map');
    });
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    await h.finish(failure);
  }
}
