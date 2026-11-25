import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createLetterHarness, walking } from './letter-normal-input.mjs';
import { ordinaryRoadNavigation } from './ordinary-road-navigation.mjs';
import { P0_ROUTE } from './p0-route-plan.mjs';

const evidence = fileURLToPath(new URL('../../.forgeax/diag/scenic-navigation/', import.meta.url));
const destinations = [
  '山口旧邮局', '邮局廊前', '风来林地', '风铃前的风车', '石巷旧镇',
  '石拱里的双峰', '旧镇钟院', '禅院', '山脊观景站', '东岭 · 晚照崖',
];
const worldXZ = ({ x, y }) => [800 * x - 400, 400 - 800 * y];
const near = (a, b, tolerance = .025) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= tolerance;

export default async function scenicMonasteryJourney(play) {
  const h = await createLetterHarness(play, { id: 'scenic-monastery', viewport: [1920, 1080] }, { budgetMs: 232000 }, evidence);
  const { walkTo, route } = ordinaryRoadNavigation(play, h);
  const page = play.page;
  const pocket = page.getByRole('complementary', { name: '随身地图' });
  const map = page.getByRole('dialog', { name: '山谷地图' });
  const directory = page.getByRole('dialog', { name: '景点导航' });
  const button = name => page.getByRole('button', { name, exact: true });
  const browserErrors = [];
  page.on('pageerror', error => browserErrors.push(String(error)));
  const activeRoute = state => state.view.navigation?.destination?.points.map(worldXZ) ?? [];
  const clickDirectory = async () => {
    await h.key('KeyM');
    await map.waitFor();
    await button('景点导航').click();
    await directory.waitFor();
  };

  let failure;
  try {
    await h.step('Select any public destination from a fresh game regardless of the photo schedule', async () => {
      const started = await h.startFresh();
      assert.ok(started.view.outings.slots.every(spot => spot.spotId !== 'monastery'));
      await clickDirectory();
      assert.deepEqual(await directory.locator('li button').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label'))),
        destinations.map(title => `导航到${title}`));
      await h.shot('01-scenic-directory');
      await button('导航到旧镇钟院').click();
      await map.getByText('旧镇钟院', { exact: true }).last().waitFor();
      await button('景点导航').click();
      await button('导航到禅院').click();
      await h.wait(s => s.view.navigation?.scenicSpotId === 'monastery');
      await map.getByText(/西侧的摇柄/).waitFor();
      await map.locator('[data-navigation-stop]').waitFor();
      assert.ok(near(activeRoute(await h.read()).at(-1), [148, 8.8]));
      await h.shot('02-route-to-lever');
      await h.key('KeyM');
      await h.wait(walking);
    });

    await h.step('Walk to the lever and use the photography hint to lower the bridge', async () => {
      await route(P0_ROUTE.town.slice(0, -1), .7);
      await route(P0_ROUTE.lever, .35);
      await pocket.getByText(/摇柄旁按 E/).waitFor();
      await h.key('KeyE');
      const opened = await h.wait(s => s.state.durable.gateOpened);
      assert.equal(opened.world.bridgeWalkable, false);
      assert.ok(near(activeRoute(opened).at(-1), [155, -3]));
      assert.ok(activeRoute(opened).every(([ , z]) => z < 24));
      await route([[148, -2], [155, -3]], .35);
      await pocket.getByText(/石拱、双峰和红邮筒/).waitFor();
      await h.cameraAt({ feet: [155, -3], target: [155, 29, 10] }, '03-arch');
      await h.photograph('04-bridge-photo', { matchedCard: 'town' });
      await h.lowerCamera();
      const ready = await h.wait(s => s.world.bridgeWalkable && s.state.runtime.bridgeProgress === 1, 9000);
      assert.ok(activeRoute(ready).some(point => near(point, [155, 28])));
      assert.ok(near(activeRoute(ready).at(-1), [158, 93.25]));
      await h.shot('05-bridge-route-unlocked');
    });

    await h.step('Follow the marked bridge, bends and stairs and restore the route from the normal save menu', async () => {
      const points = activeRoute(await h.read());
      await walkTo([155, 7], .5);
      await route(points.filter(([ , z]) => z >= 20 && z < 37), .45);
      const courtyard = points.find(point => near(point, [155, 37]));
      assert.ok(courtyard, 'the route must pass the bell courtyard');
      await walkTo(courtyard, .35);
      await pocket.getByText(/从钟院后方穿过山门/).waitFor({ timeout: 5000 });
      await route(points.filter(([ , z]) => z >= 37 && z <= 65.5), .25);
      await h.turnTo(Math.PI, .13);
      await page.keyboard.down('KeyW');
      try { await h.wait(s => walking(s) && s.controller.position[2] >= 92.8, 12000); }
      finally { await page.keyboard.up('KeyW'); }
      await pocket.getByText('已到禅院。', { exact: true }).waitFor();
      const arrived = await h.shot('06-monastery-arrival');
      assert.ok(near([arrived.controller.position[0], arrived.controller.position[2]], [158, 93.25], 2.5));
      await h.key('Escape');
      await h.wait(s => s.state.runtime.screen === 'paused' && s.view.saveStatus === 'saved');
      await play.reload();
      const saved = await h.wait(s => s.restored && s.state.runtime.screen === 'menu', 30000);
      assert.equal(saved.state.durable.trackedScenicSpot, 'monastery');
      assert.equal(saved.state.durable.totalPhotos, 1);
      assert.equal(saved.world.bridgeWalkable, true);
      await button('接着上一次的路').click();
      await h.wait(walking);
      await pocket.getByText('已到禅院。', { exact: true }).waitFor();
      await h.key('KeyM');
      await button('停止景点导航').click();
      await h.wait(s => !s.view.navigation?.scenicSpotId);
      assert.deepEqual(browserErrors, []);
    });
  } catch (error) {
    failure = error;
    await h.shot('FAILED').catch(() => {});
    throw error;
  } finally {
    h.report.browserErrors = browserErrors;
    await h.finish(failure);
  }
}
