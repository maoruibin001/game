import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { cameraActive, createLetterHarness, walking } from './letter-normal-input.mjs';
import { ordinaryRoadNavigation } from './ordinary-road-navigation.mjs';

const evidence = fileURLToPath(new URL('../../.forgeax/diag/post-meadow-risers/', import.meta.url));
const outlook = [-36, -191];

export default async function postMeadowRisers(play) {
  const h = await createLetterHarness(play, { id: 'post-meadow', viewport: [1920, 1080] }, { budgetMs: 140000 }, evidence);
  const { walkTo } = ordinaryRoadNavigation(play, h);
  let failure;
  try {
    await h.step('Start, walk and make a real first photograph', async () => {
      const spawn = await h.startFresh();
      await walkTo([0, -220], 0.4);
      const stepped = await h.wait(s => walking(s) && s.controller.distanceWalked > spawn.controller.distanceWalked + 5);
      await h.key('KeyC');
      await h.wait(cameraActive);
      const first = await h.photograph('01-first-photo');
      assert.equal(first.area, 'post');
      h.report.firstWalk = stepped.controller.distanceWalked;
      await h.lowerCamera();
    });

    await h.step('Inspect the grass beside the postal road on both sides of the gate', async () => {
      for (const [name, x, z] of [['02-before-gate', -15.8, -207.5], ['03-just-through-gate', -22.2, -202.3], ['04-down-the-road', -26.5, -198.8]]) {
        await walkTo([x, z], 0.17);
        const s = await h.read();
        const yaw = Math.atan2(outlook[0] - s.controller.position[0], s.controller.position[2] - outlook[1]);
        await h.turnTo(yaw, 0.13);
        await h.shot(name);
      }
    });

    await h.step('Continue the saved journey and confirm the first photograph persists', async () => {
      await h.key('Escape');
      await h.wait(s => s.state.runtime.screen === 'paused' && s.view.saveStatus === 'saved');
      await play.reload();
      const restored = await h.wait(s => s.restored && s.state.runtime.screen === 'menu', 30000);
      assert.equal(restored.state.durable.totalPhotos, 1);
      assert.equal(restored.state.durable.film[0]?.original?.key, h.report.photos[0].original.key);
      await play.page.getByRole('button', { name: '接着上一次的路' }).click();
      await h.wait(walking);
      await h.key('KeyC');
      await h.wait(cameraActive);
      await h.shot('05-resumed-camera');
    });
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    await h.finish(failure);
  }
}
