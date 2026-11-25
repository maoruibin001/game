import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cameraActive, createLetterHarness, walking } from './letter-normal-input.mjs';

const evidence = process.env.POSTAL_LOOKOUT_EVIDENCE ?? fileURLToPath(new URL('../../../production/山口高廊-20261120/', import.meta.url));
const root = fileURLToPath(new URL('../../', import.meta.url));
const comparison = process.env.POSTAL_LOOKOUT_COMPARISON === 'B';
const shadows = process.env.POSTAL_LOOKOUT_SHADOWS === '1';

export default async function postalLookout(play) {
  const name = process.env.POSTAL_LOOKOUT_RUN ?? (comparison ? 'B-高廊原光' : 'E-晒相台镜圈');
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const h = await createLetterHarness(play, { id: name, viewport: [1920, 1080] }, { budgetMs: 145000, commit }, evidence);
  const { page } = play;
  let failure, openingPhoto, original;
  try {
    await h.step('从标题新开档，保留未操作的开场画面', async () => {
      const title = await h.wait(s => s.restored && s.state.runtime.screen === 'menu');
      assert.equal(title.state.durable.started, false);
      assert.equal(title.state.durable.clock.minute, 780);
      await page.getByRole('button', { name: '背上行囊，出发', exact: true }).click();
      await h.wait(walking);
      const frame = await h.shot('01-新档首帧');
      assert.equal(frame.state.durable.clock.day, 1);
      assert.ok(frame.state.durable.clock.minute >= 780 && frame.state.durable.clock.minute < 790);
      assert.equal(frame.state.durable.weather, 'morning');
      assert.equal(frame.controller.distanceWalked, 0);
      assert.ok(frame.controller.position[1] > 23);
    });
    if (comparison) return;
    if (shadows) await h.step('开场人不动，先站定再向左右转镜，保存连续阴影样本', async () => {
      const opening = await h.read();
      const { yaw, pitch, position } = opening.controller;
      for (const name of ['定点-A', '定点-B', '定点-C']) {
        await play.wait(380);
        const frame = await h.shot('shadow-' + name);
        assert.deepEqual(frame.controller.position, position);
        assert.deepEqual(frame.controller.camera, opening.controller.camera);
      }
      for (const [name, heading] of [['右-A', yaw + .12], ['右-B', yaw + .24], ['左-A', yaw - .13], ['回正', yaw]]) {
        await h.turnTo(heading, pitch);
        const frame = await h.shot('shadow-' + name);
        assert.deepEqual(frame.controller.position, position);
        assert.ok(Math.abs(frame.controller.yaw - heading) < .012);
        assert.equal(frame.state.durable.creativeMode, false);
        assert.equal(frame.environment.weather, 'morning');
      }
    });
    const pocket = page.getByRole('button', { name: '展开随身地图', exact: true });
    assert.equal(await pocket.isVisible(), true);

    await h.step('原地举机，再用 A 挪到双峰完整可见并按快门', async () => {
      await h.key('KeyE');
      const before = await h.wait(s => cameraActive(s) && s.state.runtime.observation?.openingMountains === 0);
      await h.shot('02-原地举机');
      for (let step = 0; step < 10 && (await h.read()).state.runtime.observation?.openingMountains !== 2; step++) {
        await play.keyboard.hold('KeyA', 55);
        await h.settle();
      }
      const aligned = await h.wait(s => cameraActive(s) && s.state.runtime.observation?.openingMountains === 2);
      if (aligned.controller.position[0] - before.controller.position[0] < .66) {
        await play.keyboard.hold('KeyA', 35);
        await h.settle();
      }
      const after = await h.wait(s => cameraActive(s) && s.state.runtime.observation?.openingMountains === 2);
      assert.equal(after.controller.yaw, before.controller.yaw);
      const metres = Math.hypot(after.controller.position[0] - before.controller.position[0],
        after.controller.position[2] - before.controller.position[2]);
      assert.ok(metres > .3 && metres < 1.5);
      h.report.lateralMetres = metres;
      await h.shot('03-双峰进入信封');
      const photo = openingPhoto = await h.photograph('04-快门实拍');
      assert.equal(photo.openingMountains, 2);
      await h.key('KeyJ');
      await h.wait(s => s.state.runtime.screen === 'journal');
      const letter = page.locator('.sy-opening-letter:visible');
      await letter.locator(`[data-action="choose-opening-photo"][data-id="${photo.id}"]`).click();
      original = await h.download(`${name}-双峰实拍原片`, () => letter.locator(`[data-action="export-photo"][data-id="${photo.id}"]`).click(),
        [1920, 1080], { photoId: photo.id, bytes: photo.original.bytes });
      await letter.locator('[data-action="send-opening-photo"]').click();
      await h.wait(s => s.state.durable.openingReply?.id === photo.id);
      await page.locator('button.sy-close:visible').click();
      await h.wait(s => walking(s) || cameraActive(s));
      if (cameraActive(await h.read())) await h.lowerCamera();
    });

    await h.step('前移后举机近看旧合影和黄铜镜圈', async () => {
      await h.cameraAt({
        feet: [-25.81, -246.09],
        target: [-23.40, 26.02, -244.35],
      }, '05-晒相台近景');
      await h.lowerCamera();
    });

    await h.step('普通步行沿折向邮路下坡并接到原岔口', async () => {
      await h.route([[-26, -240], [-16.4, -233.1], [-13.8, -222.5], [-10.95, -216.65], [0, -220]], .60);
      const foot = await h.shot('06-走到旧邮路岔口');
      assert.ok(foot.controller.grounded);
      assert.ok(foot.controller.position[1] < 14.8);
      await pocket.click();
      await page.getByRole('button', { name: '收起随身地图', exact: true }).waitFor();
      await h.shot('07-随身地图可展开');
    });

    await h.step('刷新续玩，核对寄信回执与原片', async () => {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: '接着上一次的路' }).click({ timeout: 40000 });
      const resumed = await h.wait(walking);
      assert.equal(resumed.state.durable.openingReply?.id, openingPhoto.id);
      assert.ok(Math.hypot(resumed.controller.position[0], resumed.controller.position[2] + 220) < 2);
      await h.shot('08-续档留在旧邮路');
      await h.key('KeyJ');
      await h.wait(s => s.state.runtime.screen === 'journal');
      await page.getByRole('tab', { name: '来信' }).click();
      const restored = await h.download('续档-双峰实拍原片',
        () => page.locator(`.sy-opening-letter:visible [data-action="export-photo"][data-id="${openingPhoto.id}"]`).click(),
        [1920, 1080], { photoId: openingPhoto.id, bytes: openingPhoto.original.bytes });
      assert.equal(restored.sha256, original.sha256);
      await page.locator('button.sy-close:visible').click();
      await h.wait(walking);
    });
  } catch (error) {
    failure = error;
    await h.shot('中断现场').catch(() => {});
    throw error;
  } finally {
    await h.finish(failure);
  }
}
