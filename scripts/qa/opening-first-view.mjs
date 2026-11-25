import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cameraActive, createLetterHarness, walking } from './letter-normal-input.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = fileURLToPath(new URL('../../../production/山口出生首眸-20261120/', import.meta.url));
const action = name => '[data-action="' + name + '"]';

export default async function openingFirstView(play) {
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const h = await createLetterHarness(play, { id: 'opening-first-view', viewport: [1920, 1080] }, { budgetMs: 85000, commit }, output);
  const page = play.page;
  const close = page.locator('button.sy-close:visible');
  const letter = page.locator('.sy-opening-letter:visible');
  let failure;

  async function closeLetter() {
    await close.click();
    return h.wait(state => walking(state) || cameraActive(state));
  }

  async function exportOpening(photo, name) {
    await letter.locator(action('choose-opening-photo') + '[data-id="' + photo.id + '"]').click();
    return h.download(name, () => letter.locator(action('export-photo') + '[data-id="' + photo.id + '"]').click(), [1920, 1080],
      { photoId: photo.id, bytes: photo.original.bytes });
  }

  try {
    await h.step('从标题正常出发，记录未操作第一帧', async () => {
      const menu = await h.wait(state => state.restored && state.state.runtime.screen === 'menu');
      assert.equal(menu.state.durable.started, false);
      await h.shot('00-标题');
      await h.startFresh();
      const frame = await h.shot('01-新档未触控第一帧');
      assert.equal(Math.floor(frame.state.durable.clock.minute), 780);
      assert.equal(frame.state.durable.weather, 'morning');
      assert.equal(frame.controller.distanceWalked, 0);
      assert.equal(await page.locator('.sy-opening-guide').isVisible(), true);
      assert.equal(await page.getByText('东岭回邮格', { exact: true }).isVisible(), false);
    });

    let initialPhoto, alignedPhoto, shotReceipt;
    await h.step('E 原地举机试拍，只用 A 横移后再拍双峰', async () => {
      await h.key('KeyE');
      const stationary = await h.wait(state => cameraActive(state) && state.state.runtime.observation?.openingMountains === 0);
      await h.shot('02-E原地举机');
      initialPhoto = await h.photograph('03-原地拍摄并收片');
      assert.equal(initialPhoto.openingMountains, 0);
      for (let n = 0; n < 9 && (await h.read()).state.runtime.observation?.openingMountains !== 2; n++) {
        await play.keyboard.hold('KeyA', 65);
        await h.settle();
      }
      const aligned = await h.wait(state => cameraActive(state) && state.state.runtime.observation?.openingMountains === 2);
      assert.equal(aligned.controller.yaw, stationary.controller.yaw);
      const move = Math.hypot(aligned.controller.position[0] - stationary.controller.position[0], aligned.controller.position[2] - stationary.controller.position[2]);
      assert.ok(move > .25 && move < 1.5);
      h.report.lateralMetres = move;
      await h.shot('04-横移后双峰落进封口');
      alignedPhoto = await h.photograph('05-亲手拍下双峰');
      assert.equal(alignedPhoto.openingMountains, 2);
      await h.key('KeyJ');
      await h.wait(state => state.state.runtime.screen === 'journal');
      await exportOpening(initialPhoto, '晴天-原地举机-游戏原片');
      shotReceipt = await exportOpening(alignedPhoto, '晴天-横移装进双峰-游戏原片');
      await letter.locator(action('send-opening-photo')).click();
      await h.wait(state => state.state.durable.openingReply?.id === alignedPhoto.id);
      await h.shot('06-阿禾收到了玩家的照片');
      await closeLetter();
    });

    await h.step('从现有游戏选项切细雨，C 举机实拍原片', async () => {
      if (cameraActive(await h.read())) await h.lowerCamera();
      await page.getByRole('button', { name: '打开摄影日程' }).click();
      await page.getByRole('button', { name: '开启自由创作', exact: true }).click();
      await h.wait(state => state.state.durable.creativeMode);
      const time = page.locator('[data-creative-time]');
      await time.fill('13:00');
      await time.press('Tab');
      await page.locator(action('set-weather') + '[data-weather="rain"]:visible').click();
      await close.click();
      await h.wait(state => walking(state) && state.environment.settled && state.environment.weather === 'rain');
      await h.shot('07-细雨同一取景点-第三人称');
      await h.key('KeyC');
      await h.wait(cameraActive);
      const rain = await h.photograph('08-细雨实拍');
      assert.equal(rain.scene.weather, 'rain');
      assert.equal(rain.openingMountains, 2);
      await h.key('KeyJ');
      await h.wait(state => state.state.runtime.screen === 'journal');
      await page.getByRole('tab', { name: /留住的风景/ }).click();
      await page.locator(action('photo-collection') + '[data-collection="film"]').click();
      await page.locator('.sy-album [data-id="' + rain.id + '"]').click();
      await h.download('细雨-横移构图-游戏原片',
        () => page.locator(action('export-photo') + ':visible').click(), [1920, 1080], { photoId: rain.id, bytes: rain.original.bytes });
    });

    await h.step('刷新续玩后首拍原片保持同一哈希', async () => {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: '接着上一次的路' }).click({ timeout: 40000 });
      await h.wait(walking);
      await h.key('KeyJ');
      await h.wait(state => state.state.runtime.screen === 'journal' && state.state.durable.openingReply?.id === alignedPhoto.id);
      await page.getByRole('tab', { name: '来信' }).click();
      const resumed = await h.download('续档-双峰-游戏原片',
        () => letter.locator(action('export-photo') + '[data-id="' + alignedPhoto.id + '"]').click(), [1920, 1080],
        { photoId: alignedPhoto.id, bytes: alignedPhoto.original.bytes });
      assert.equal(resumed.sha256, shotReceipt.sha256);
    });
  } catch (error) {
    failure = error;
    await h.shot('中断现场').catch(() => {});
    throw error;
  } finally {
    await h.finish(failure);
  }
}
