import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { copyFile } from 'node:fs/promises';
import { cameraActive, createLetterHarness, walking } from './letter-normal-input.mjs';

const evidence = fileURLToPath(new URL('../../.forgeax/diag/post-shadow-camera/', import.meta.url));
const oldCamera = process.env.SHANYE_CAMERA_BEFORE === '1';

export default async function postShadowAndCamera(play) {
  const h = await createLetterHarness(play, { id: oldCamera ? 'before' : 'after', viewport: [1920, 1080] }, { budgetMs: 95000 }, evidence);
  const page = play.page;
  const state = () => play.state('shan.journey');
  const wait = (condition, timeoutMs = 10000) => play.waitFor(condition, { read: 'shan.journey', timeoutMs });
  const close = () => page.locator('button.sy-close:visible').click();
  const pocket = page.getByRole('complementary', { name: '随身地图' });
  const guide = pocket.getByText('沿小地图上的亮线走', { exact: true });
  const getButton = name => page.getByRole('button', { name, exact: true });
  let selectedSpot;
  async function selectOuting() {
    await getButton('打开摄影日程').click();
    const option = page.getByRole('dialog', { name: '摄影日程' }).getByRole('button', { name: '导航到这里', exact: true }).last();
    const spot = await option.getAttribute('data-spot');
    await option.click();
    await wait(s => s.state.durable.trackedPhotoSpot === spot);
    await page.locator('.sy-outing-tracked strong').waitFor({ timeout: 5000 });
    assert.equal(await pocket.isVisible(), false);
    await close();
    await wait(walking);
    return spot;
  }
  let failure;
  try {
    await h.step('Start at the postal gate and hold the time and weather constant', async () => {
      await h.startFresh();
      await h.walkTo([9.75, -226.4], .28);
      await page.getByRole('button', { name: '打开摄影日程' }).click();
      await page.locator('[data-action="set-creative-mode"][data-enabled="true"]').click();
      await close();
      await h.wait(s => walking(s) && s.state.durable.creativeMode && s.environment.settled);
    });
    if (oldCamera || process.env.SHANYE_REUSE_SHADOW_SERIES !== '1') await h.step('Observe the postal gate’s shadow at a fixed time and during small camera turns', async () => {
      const samples = [];
      for (const [name, yaw] of [['fixed-a', -2.73], ['fixed-b', -2.73], ['turn-a', -2.67], ['turn-b', -2.61], ['turn-c', -2.55], ['return', -2.73]]) {
        await h.turnTo(yaw, .48);
        await play.advance(.35, { read: 'shan.journey' });
        const s = await h.shot('shadow-' + name);
        samples.push({ name, camera: s.controller.camera, feet: s.controller.position, sunDirection: s.environment.sunDirection, clock: s.environment.clock });
      }
      assert.deepEqual(samples.map(s => s.sunDirection), samples.map(() => samples[0].sunDirection));
      assert.deepEqual(samples.map(s => s.feet), samples.map(() => samples[0].feet));
      h.report.shadowSamples = samples;
    });

    if (!oldCamera) await h.step('Show the pocket map on the first chosen outing without saving the introduction', async () => {
      await getButton('收起随身地图').click();
      await h.wait(s => s.state.durable.pocketMapCollapsed);
      const first = await selectOuting();
      await guide.waitFor({ timeout: 3000 });
      assert.equal(await getButton('收起随身地图').getAttribute('aria-expanded'), 'true');
      assert.equal((await state()).state.durable.pocketMapCollapsed, true);
      assert.ok(await pocket.locator('[data-navigation-route]').count() > 0);
      await h.shot('outing-first-map-cue');
      await getButton('收起随身地图').click();
      selectedSpot = await selectOuting();
      assert.notEqual(selectedSpot, first);
      assert.equal(await guide.isVisible(), false);
      assert.equal(await getButton('展开随身地图').getAttribute('aria-expanded'), 'false');
    });

    await h.step('Exercise the pointer, the dedicated shutter and the captured frame through the real camera UI', async () => {
      await h.key('KeyC');
      await h.wait(cameraActive);
      await h.shot('camera-before-input');
      const originalPose = (await state()).controller;
      await play.mouse.click([.42, .47]);
      if (oldCamera) {
        const s = await wait(value => value.state.durable.totalPhotos === 1);
        assert.equal(s.inputDiagnostics.shutters.at(-1)?.source, 'native:shutter');
        h.report.accidentalCapture = s.inputDiagnostics.shutters.at(-1);
        await play.screenshot('unexpected-photo-from-canvas-click');
        return;
      }
      await play.advance(.45, { read: 'shan.journey' });
      const afterClick = await state();
      assert.equal(afterClick.state.durable.totalPhotos, 0);
      assert.equal(afterClick.inputDiagnostics.shutters.length, 0);
      assert.equal(afterClick.controller.yaw, originalPose.yaw);
      assert.equal(afterClick.controller.pitch, originalPose.pitch);
      const before = afterClick.controller.yaw;
      await play.mouse.drag([.56, .5], [.64, .52], { button: 'left' });
      const dragged = await wait(s => Math.abs(s.controller.yaw - before) > .05);
      assert.equal(dragged.inputDiagnostics.shutters.length, 0);
      assert.ok(Math.abs(dragged.controller.pitch - originalPose.pitch) < .20);

      await page.setViewportSize({ width: 1280, height: 600 });
      await page.getByRole('button', { name: '横幅 16:9', exact: true }).click();
      await h.wait(s => s.view.camera.photography?.framing === 'wide');
      // The Engine accepts the setting before the resized canvas and finder
      // have both been presented. Observe the final geometry before shooting.
      await page.waitForFunction(() => {
        const frame = document.querySelector('.sy-viewfinder')?.getBoundingClientRect();
        return frame && Math.abs(frame.width / frame.height - 16 / 9) < .01 && frame.width < 1280;
      }, undefined, { timeout: 6000 });
      const frame = await page.locator('.sy-viewfinder').boundingBox();
      const canvas = await page.locator('canvas:visible').first().boundingBox();
      assert.ok(frame && canvas);
      assert.ok(Math.abs(frame.width / frame.height - 16 / 9) < .01);
      assert.ok(frame.width < canvas.width && Math.abs(frame.height - canvas.height) <= 9);
      const framingCapture = await play.screenshot('camera-wide-framing');
      assert.equal(framingCapture.rendered, true);
      await copyFile(framingCapture.path, h.out + '/camera-wide-framing.png');
      h.report.wideFraming = { frame, canvas };
      await getButton('拍照').click();
      const saved = await wait(s => cameraActive(s) && s.state.durable.totalPhotos === 1);
      const photo = saved.state.durable.film.at(-1);
      assert.ok(photo?.original);
      assert.equal(saved.inputDiagnostics.shutters.at(-1)?.source, 'presentation:shutter');
      assert.equal(photo.original.width / photo.original.height, 16 / 9);
      assert.equal(photo.scene.camera.aspect, 16 / 9);
      await h.key('KeyJ');
      await page.getByRole('tab').last().click();
      await page.locator('[data-action="photo-collection"][data-collection="film"]').click();
      await page.locator('.sy-album [data-id="' + photo.id + '"]').click();
      await h.download('wide-original', () => page.locator('[data-action="export-photo"]').click(),
        [photo.original.width, photo.original.height], { photoId: photo.id, bytes: photo.original.bytes });
      h.report.widePhoto = { original: photo.original, scene: photo.scene };
      await play.reload();
      const restored = await wait(s => s.restored && s.state.runtime.screen === 'menu', 30000);
      assert.equal(restored.state.durable.photography.framing, 'wide');
      assert.deepEqual(restored.state.durable.film.at(-1)?.original, photo.original);
      assert.equal(restored.state.durable.pocketMapCollapsed, true);
      await getButton('接着上一次的路').click();
      await wait(walking);
      assert.equal(await guide.isVisible(), false);
      assert.notEqual(await selectOuting(), selectedSpot);
      await guide.waitFor({ timeout: 3000 });
    });
  } catch (error) {
    failure = error;
    await play.screenshot('failed').catch(() => {});
    throw error;
  } finally {
    await h.finish(failure);
  }
}
