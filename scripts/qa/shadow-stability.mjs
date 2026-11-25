import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createLetterHarness, walking } from './letter-normal-input.mjs';

const evidence = fileURLToPath(new URL('../../.forgeax/diag/shadow-stability/', import.meta.url));
const baseline = process.env.SHANYE_SHADOW_BASELINE === '1';

export default async function shadowStability(play) {
  const h = await createLetterHarness(play, { id: baseline ? 'shadow-base' : 'shadow-fixed', viewport: [1920, 1080] }, { budgetMs: 90000 }, evidence);
  const { page } = play;
  const samples = [];
  async function capture(name, seconds) {
    await play.advance(seconds, { read: 'shan.journey' });
    const { controller, environment } = await h.shot('shadow-' + name);
    samples.push({ name, camera: controller.camera, feet: controller.position, sunDirection: environment.sunDirection, clock: environment.clock });
  }
  let failure;
  try {
    await h.step('Reach the postal gate in ordinary play and observe its fixed shadow', async () => {
      await h.startFresh();
      await h.walkTo([9.75,-226.4], .27);
      await h.turnTo(-2.73, .48);
      await capture('live-a', .5);
      await capture('live-b', 4);
      await capture('live-c', 4);
      assert.ok(samples[2].clock.minute>samples[0].clock.minute);
      assert.deepEqual(samples.slice(0,3).map(s=>s.feet), samples.slice(0,3).map(()=>samples[0].feet));
    });
    await h.step('Hold light and terrain fixed while turning the normal camera', async () => {
      await page.getByRole('button', { name: '打开摄影日程' }).click();
      await page.locator('[data-action="set-creative-mode"][data-enabled="true"]').click();
      await page.locator('button.sy-close:visible').click();
      await h.wait(s => walking(s) && s.state.durable.creativeMode && s.environment.settled);
      for (const [name,yaw] of [['fixed-a',-2.73],['fixed-b',-2.73],['turn-a',-2.67],['turn-b',-2.61],['turn-c',-2.55],['return',-2.73]]) {
        await h.turnTo(yaw,.48);
        await capture(name,.35);
      }
      assert.deepEqual(samples.slice(3).map(s=>s.sunDirection),samples.slice(3).map(()=>samples[3].sunDirection));
      assert.deepEqual(samples.slice(3).map(s=>s.feet),samples.slice(3).map(()=>samples[3].feet));
    });
    if (!baseline) await h.step('Check that overcast light and drizzle replace the hard clear-sky shadow', async () => {
      for (const [weather,name] of [['afterglow','overcast'],['rain','drizzle']]) {
        await page.getByRole('button', { name: '打开摄影日程' }).click();
        await page.locator(`[data-action="set-weather"][data-weather="${weather}"]`).click();
        await page.locator('button.sy-close:visible').click();
        await h.wait(s => walking(s) && s.environment.weather === weather);
        await play.advance(3, {read:'shan.journey'});
        await h.wait(s => walking(s) && s.environment.settled);
        await h.shot('shadow-'+name);
      }
    });
  } catch(error) {
    failure=error;
    await h.shot('failed').catch(()=>{});
    throw error;
  } finally {
    h.report.shadowSamples=samples;
    await h.finish(failure);
  }
}
