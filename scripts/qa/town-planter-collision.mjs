import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createLetterHarness, walking } from './letter-normal-input.mjs';
import { ordinaryRoadNavigation } from './ordinary-road-navigation.mjs';
import { P0_ROUTE } from './p0-route-plan.mjs';

const evidence = fileURLToPath(new URL('../../.forgeax/diag/town-planter/', import.meta.url));
const baseline = process.env.SHANYE_TOWN_PLANTER_BASELINE === '1';

export default async function townPlanterCollision(play) {
  const h = await createLetterHarness(play, {
    id: baseline ? 'town-planter-before' : 'town-planter-after', viewport: [1920, 1080],
  }, { budgetMs: 180000 }, evidence);
  const { walkTo, route } = ordinaryRoadNavigation(play, h);
  let failure;
  try {
    await h.step('Walk from the normal new-game entrance to the town arch and open its gate', async () => {
      await h.startFresh();
      await route(P0_ROUTE.town.slice(0, -1), .7);
      await route(P0_ROUTE.lever, .35);
      await h.key('KeyE');
      await h.wait(s => walking(s) && s.state.durable.gateOpened);
      await route([[148,6],[152,6],[155,7]], .42);
    });

    await h.step('Walk along the main street from the arch to the old planter position', async () => {
      await walkTo([155,18.5], .25);
      await h.turnTo(0, .16);
      const s = await h.shot(baseline ? '01-inside-the-old-planter' : '01-main-street-clear');
      assert.ok(Math.hypot(s.controller.position[0]-155,s.controller.position[2]-18.5)<.25);
      if (!baseline) {
        await walkTo([155,21.5], .35);
        await h.wait(v => walking(v) && v.controller.position[2] > 21.1);
        await h.shot('02-main-street-past-planter');
      }
    });

    if (!baseline) await h.step('Try to walk into the planter from the street and around the south rim', async () => {
      await walkTo([154,18.5], .22);
      await h.turnTo(-Math.PI/2, .30);
      await play.keyboard.hold('KeyW', 950);
      const stopped = await h.wait(s => walking(s) && s.controller.position[0] < 152.65);
      assert.ok(stopped.controller.position[0] >= 152.525);
      await h.shot('03-stopped-at-planter-from-street');

      await route([[154,18.5],[154,15.9],[150.25,15.9]], .22);
      await h.turnTo(Math.PI,.30);
      await play.keyboard.hold('KeyW', 850);
      const rim = await h.wait(s => walking(s) && s.controller.position[2] > 16.6);
      assert.ok(rim.controller.position[2] <= 16.725);
      await h.shot('04-stopped-at-south-rim');
    });
  } catch(error) {
    failure = error;
    await h.shot('failed').catch(()=>{});
    throw error;
  } finally {
    await h.finish(failure);
  }
}
