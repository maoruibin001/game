import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLetterHarness, walking } from './letter-normal-input.mjs';
import { startVideo, stopVideo } from './night-post.mjs';
import { ordinaryRoadNavigation } from './ordinary-road-navigation.mjs';
import { P0_ROUTE } from './p0-route-plan.mjs';

const project = fileURLToPath(new URL('../../', import.meta.url));
const evidence = process.env.SHANYE_GLOBAL_SHADOW_EVIDENCE ??
  fileURLToPath(new URL('../../../production/global-shadow-p1/', import.meta.url));
const descent = [[-26, -240], [-16.4, -233.1], [-13.8, -222.5], [-10.95, -216.65]];
const locations = [
  { id: '01-邮局门楼', route: [...descent, [0, -220], [9.60, -226.39]], yaw: -2.73, pitch: .45 },
  { id: '02-邮局墙脚和岔口', route: [[0, -220], [-8.5, -216.8]], yaw: -.43 + Math.PI, pitch: .23 },
  { id: '03-风来林地', route: [[0, -220], ...P0_ROUTE.forest.slice(1)], yaw: .72, pitch: .19 },
];
const read = 'shan.journey';

export default async function globalShadowRegression(play) {
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: project, encoding: 'utf8' }).trim();
  const h = await createLetterHarness(play, {
    id: process.env.SHANYE_GLOBAL_SHADOW_LABEL ?? 'global-shadow', viewport: [1920, 1080],
  }, { budgetMs: 310000, commit }, evidence);
  const { page } = play;
  const navigation = ordinaryRoadNavigation(play, h);
  const click = selector => page.locator(selector).first().click({ timeout: 5000 });
  const distance = (a, b) => Math.hypot(...a.map((axis, index) => axis - b[index]));
  const angleError = (yaw, actual) => Math.abs(Math.atan2(Math.sin(yaw - actual), Math.cos(yaw - actual)));
  h.report.shadow = [];
  let failure;

  async function turn(yaw, pitch) {
    try {
      await h.turnTo(yaw, pitch);
    } catch (error) {
      const { controller } = await h.read();
      if (angleError(yaw, controller.yaw) > .03 || Math.abs(pitch - controller.pitch) > .025) throw error;
    }
  }

  async function creative(enabled, minute, weather = 'morning') {
    await click('[data-action="open-outings"]');
    if ((await h.read()).state.durable.creativeMode !== enabled) await click('[data-action="set-creative-mode"]');
    if (enabled) {
      await page.locator('[data-creative-time]').fill(minute);
      await click('[data-action="set-weather"][data-weather="' + weather + '"]');
    }
    await click('button.sy-close:visible');
    const target = minute ? Number(minute.slice(0, 2)) * 60 + Number(minute.slice(3)) : undefined;
    await h.wait(s => walking(s) && s.state.durable.creativeMode === enabled && s.environment.settled
      && (!enabled || (s.environment.clock?.minute === target && s.environment.weather === weather)));
    await play.advance(.45, { read });
  }

  async function sample(name) {
    const { controller, environment, state } = await h.read();
    await page.locator('canvas').first().screenshot({ path: join(h.out, name + '.png') });
    return {
      name, feet: controller.position, camera: controller.camera, yaw: controller.yaw,
      clock: state.durable.clock, playSeconds: state.durable.playSeconds,
      sun: environment.sunDirection, weather: environment.weather, quality: state.durable.settings.quality,
    };
  }

  async function capture(name, perform) {
    const entry = { name, frames: [] };
    h.report.shadow.push(entry);
    await startVideo(page);
    try {
      await perform(async suffix => {
        const frame = await sample(name + '-' + suffix);
        entry.frames.push(frame);
        return frame;
      });
    } finally {
      entry.video = await stopVideo(page, join(h.out, name + '.webm'));
      console.log(JSON.stringify({ clip: name, frames: entry.frames.length, start: entry.frames[0]?.clock, end: entry.frames.at(-1)?.clock }));
    }
  }

  try {
    const menu = await h.wait(s => s.restored && s.state.runtime.screen === 'menu', 25000);
    assert.equal(menu.state.durable.started, false);
    await page.getByRole('button', { name: '背上行囊，出发', exact: true }).click();
    await h.wait(walking, 15000);
    await h.shot('00-正常新档');
    for (const loc of locations) await h.step(loc.id, async () => {
      await navigation.route(loc.route.slice(0, -1), .66);
      const destination = loc.route.at(-1);
      let atDestination;
      for (let attempt = 0; attempt < 4; attempt++) {
        await navigation.walkTo(destination, .19);
        await play.advance(.55, { read });
        const [x, , z] = (await h.read()).controller.position;
        atDestination = Math.hypot(x - destination[0], z - destination[1]) < .28;
        if (atDestination) break;
      }
      assert.ok(atDestination, 'feet drifted from the ordinary walking checkpoint');
      await turn(loc.yaw, loc.pitch);
      await play.advance(1.25, { read }); // The chase camera eases after keys are released.
      await h.wait(s => walking(s) && s.state.durable.clock.minute >= 806 && s.environment.settled, 72000);
      await h.shot(loc.id + '-正常到达');

      await capture(loc.id + '-定镜实际日照', async frame => {
        const initial = await frame('00');
        let last = initial;
        for (let i = 1; i <= 18; i++) {
          for (;;) {
            const s = await h.read();
            if (s.state.durable.playSeconds - initial.playSeconds >= i * .48) break;
            await play.advance(.16, { read });
          }
          last = await frame(String(i).padStart(2, '0'));
          assert.ok(distance(last.camera.position, initial.camera.position) < .01);
          assert.ok(distance(last.camera.forward, initial.camera.forward) < .001);
          assert.equal(last.weather, initial.weather);
        }
        assert.ok(last.clock.minute - initial.clock.minute > 4);
        assert.ok(distance(last.sun, initial.sun) > .005, 'the live sunlight did not move');
      });

      // The public creative controls lock the real solar direction and weather.
      // This segment isolates camera motion from solar motion.
      await creative(true, '14:20');
      await capture(loc.id + '-固定光向转镜走动', async frame => {
        const initial = await frame('00');
        for (const [i, yawOffset] of [.08, .16, .24, .16, .08, 0].entries()) {
          await turn(loc.yaw + yawOffset, loc.pitch);
          const turned = await frame('转镜-' + i);
          assert.deepEqual(turned.sun, initial.sun);
          assert.ok(distance(turned.feet, initial.feet) < .02);
        }
        await play.keyboard.hold('KeyD', 220);
        await h.settle();
        const right = await frame('右移');
        assert.deepEqual(right.sun, initial.sun);
        assert.ok(distance(right.feet, initial.feet) > .3);
        await play.keyboard.hold('KeyA', 220);
        await h.settle();
        assert.deepEqual((await frame('返回')).sun, initial.sun);
      });
      await creative(false);
    });
    await creative(true, '17:48');
    const dusk = await h.shot('04-自然轨迹黄昏');
    await creative(true, '21:00');
    const night = await h.shot('05-夜间');
    assert.ok(distance(dusk.environment.sunDirection, night.environment.sunDirection) > .1);
    await creative(false);
    await h.shot('06-恢复旅途');
  } catch (error) {
    failure = error;
    await h.shot('失败现场').catch(() => {});
    throw error;
  } finally {
    await h.finish(failure);
  }
}
