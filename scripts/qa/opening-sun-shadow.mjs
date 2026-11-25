import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createLetterHarness, walking } from './letter-normal-input.mjs';

const evidence = fileURLToPath(new URL('../../.forgeax/diag/opening-sun-shadow/', import.meta.url));
const baseline = process.env.SHANYE_OPENING_SHADOW_BASELINE === '1';

export async function captureOpeningShadow(h, play, {checkResume=true}={}) {
  const samples = [];
  const measure = async name => {
    const { controller, environment, state } = await h.shot('shadow-' + name);
    assert.equal(state.durable.creativeMode, false);
    const sample = {
      name, camera: controller.camera, yaw: controller.yaw, pitch: controller.pitch,
      feet: controller.position, sunDirection: environment.sunDirection, clock: environment.clock,
      weather: environment.weather,
    };
    samples.push(sample);
    return sample;
  };
  const waitForMinute = minute => h.wait(s => walking(s) && s.environment.clock.minute >= minute, 20000);
  const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
  try {
    let opening;
    await h.step('Start a new journey and hold the camera and traveller still as the opening clock advances', async () => {
      await h.walkTo([9.75,-226.4], .27);
      await h.turnTo(-2.73, .48);
      // Start measuring after the ordinary third-person camera has settled.
      const turned = await h.read();
      await waitForMinute(turned.environment.clock.minute + .30);
      opening = await measure('live-a');
      await waitForMinute(opening.clock.minute + 1.5);
      await measure('live-b');
      await waitForMinute(opening.clock.minute + 3);
      await measure('live-c');
      for (const sample of samples) {
        assert.deepEqual(sample.feet, opening.feet);
        assert.ok(distance(sample.camera.position, opening.camera.position) < .001);
        assert.ok(distance(sample.camera.forward, opening.camera.forward) < .001);
        assert.equal(sample.weather, opening.weather);
      }
      const last = samples.at(-1);
      assert.ok(last.clock.minute >= opening.clock.minute + 3, 'the active journey clock must advance');
      if (baseline) assert.notDeepEqual(last.sunDirection, opening.sunDirection);
      else assert.deepEqual(last.sunDirection, opening.sunDirection);
    });
    await h.step('Turn the camera with the live clock still running', async () => {
      for (const [name, yaw] of [['turn-a',-2.67],['turn-b',-2.61],['turn-c',-2.55],['return',-2.73]]) {
        await h.turnTo(yaw, .48);
        const sample = await measure(name);
        assert.deepEqual(sample.feet, opening.feet);
        assert.equal(sample.weather, opening.weather);
        if (!baseline) assert.deepEqual(sample.sunDirection, opening.sunDirection);
      }
      assert.ok(Math.abs(samples.find(s=>s.name==='turn-c').yaw - opening.yaw) > .15);
      assert.ok(samples.at(-1).clock.minute > samples[2].clock.minute);
    });
    if (!baseline&&checkResume) await h.step('Verify that ordinary solar movement gradually resumes', async () => {
      // Advance ordinary game time for this additional check, after the two live comparisons.
      await play.advance(55, { read: 'shan.journey' });
      const later = await measure('later');
      assert.ok(later.clock.minute > samples[0].clock.minute + 10);
      assert.ok(distance(later.sunDirection, opening.sunDirection) > .01);
    });
  } finally {
    h.report.shadowSamples = samples;
  }
}

export default async function openingSunShadow(play) {
  const id = baseline ? 'opening-shadow-before' : 'opening-shadow-after';
  const h = await createLetterHarness(play, { id, viewport: [1920, 1080] }, { budgetMs: 90000 }, evidence);
  let failure;
  try {
    await h.startFresh();
    await captureOpeningShadow(h, play);
  } catch (error) {
    failure=error;
    await h.shot('failed').catch(() => {});
    throw error;
  } finally {
    await h.finish(failure);
  }
}
