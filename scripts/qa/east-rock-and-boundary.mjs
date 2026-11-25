import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createLetterHarness, walking } from './letter-normal-input.mjs';

const evidence = fileURLToPath(new URL('../../.forgeax/diag/east-rock/', import.meta.url));
const approach = [[9.75,-221],[20,-220],[208,-172],[260,-172],[384,-164],[383.65,-161.1]];
const gap = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[1]);

export default async function eastRockAndBoundary(play) {
  const h = await createLetterHarness(play, { id: 'east-cliff', viewport: [1920,1080] }, { budgetMs: 190000 }, evidence);
  const { page } = play;
  async function face([x,z]) {
    const { controller } = await h.read();
    await h.turnTo(Math.atan2(x - controller.position[0], controller.position[2] - z));
  }
  async function runTo(target) {
    let current = (await h.read()).controller.position;
    let stall = 0;
    while (gap(current,target) > .75) {
      const before = gap(current,target);
      await face(target);
      await play.keyboard.hold(['KeyW','ShiftLeft'], Math.min(1750, Math.max(70, (before - .4) * 1000 / 11)));
      current = (await h.wait(walking)).controller.position;
      stall = before - gap(current,target) < .025 ? stall + 1 : 0;
      assert.ok(stall < 4, 'ordinary running was blocked on the way to ' + target.join(', '));
    }
  }
  async function jumpNorthThrough(z, height) {
    await h.turnTo(Math.PI, .23);
    await page.keyboard.down('KeyW');
    await page.keyboard.down('Space');
    try { await h.wait(s => walking(s) && s.controller.position[2] >= z, 3000); }
    finally { await page.keyboard.up('Space'); await page.keyboard.up('KeyW'); }
    return h.wait(s => walking(s) && s.controller.grounded && Math.abs(s.controller.position[1] - height) < .06, 4000);
  }

  let failure;
  try {
    await h.step('Reach the reported east-slope boulder from the ordinary new-game entrance', async () => {
      await h.startFresh();
      for (const point of approach.slice(0,-1)) await runTo(point);
      await h.walkTo(approach.at(-1), .16);
      await h.turnTo(Math.PI, .23);
      await h.shot('01-boulder-foot');
    });
    await h.step('Jump onto the stone foot, grass shelf, main slab and summit', async () => {
      await jumpNorthThrough(-160.5, 101.13);
      await jumpNorthThrough(-159.78, 101.86);
      await jumpNorthThrough(-158.90, 102.65);
      await h.walkTo([384.15,-158.73], .14);
      const top = await jumpNorthThrough(-157.62, 103.39);
      assert.ok(top.controller.position[0] > 383.8 && top.controller.position[0] < 385);
      await h.turnTo(-1.30,.2);
      await h.shot('02-boulder-summit');
    });
    await h.step('See the edge warning, confirm the movement limit and turn back', async () => {
      await runTo([388.8,-157]);
      await page.getByText(/到山谷边界了/).waitFor({ timeout: 4000 });
      await h.turnTo(Math.PI/2, .18);
      await play.keyboard.hold('KeyW', 700);
      const limited = await h.wait(s => walking(s) && s.controller.position[0] >= 389.68);
      assert.ok(limited.controller.position[0] <= 389.721);
      await h.shot('03-valley-boundary-notice');
      await runTo([386,-152]);
      await page.getByText(/到山谷边界了/).waitFor({ state: 'hidden', timeout: 4000 });
    });
  } catch (error) {
    failure = error;
    await h.shot('failed').catch(() => {});
    throw error;
  } finally {
    await h.finish(failure);
  }
}
