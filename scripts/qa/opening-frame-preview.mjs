import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { jpegSize } from './letter-normal-input.mjs';

export default async function openingFramePreview(play) {
  const page = play.page;
  const state = predicate => play.waitFor(predicate, { read: 'shan.journey', timeoutMs: 15000 });
  const button = name => page.getByRole('button', { name, exact: true });
  await play.step('Inspect the full frame and use zoom, timer, and shutter in the short window', async () => {
    const start = await state(s => s.restored && s.state.runtime.screen === 'menu');
    assert.equal(start.state.durable.started, false);
    await button('背上行囊，出发').click();
    await state(s => s.state.runtime.screen === 'play' && s.frontend?.focus?.target === 'canvas');
    await page.keyboard.press('c');
    await state(s => s.state.runtime.screen === 'photo');
    await button('镜头与人物').click();
    await play.screenshot('1280-tools');
    await button('看全幅').click();
    assert.equal(await page.getByRole('complementary', { name: '旅行摄影工具' }).isVisible(), false);
    await button('返回工具').waitFor();
    await button('拍照').waitFor();
    const zoom = page.getByRole('slider', { name: '相机变焦倍率' });
    await zoom.press('ArrowRight');
    await state(s => s.state.durable.photography.zoom > 1);
    await button('3 秒定时：关').click();
    await state(s => s.state.durable.photography.timerSeconds === 3);
    await play.screenshot('1280-full-frame-tools-hidden');
    await button('开始 3 秒倒计时拍照').click();
    await state(s => s.state.durable.totalPhotos === 1);
    await button('返回工具').click();
    await page.getByRole('complementary', { name: '旅行摄影工具' }).waitFor();
    await page.getByRole('button', { name: /第一张已保存.*查看照片/ }).click();
    const original = page.waitForEvent('download', { timeout: 12000 });
    await page.locator('[data-action="export-photo"]').click();
    const download = await original;
    assert.equal(await download.failure(), null);
    const screenshot = await play.screenshot('1280-original-inspected');
    const file = join(dirname(screenshot.path), '1280-original.jpg');
    await download.saveAs(file);
    assert.deepEqual(jpegSize(await readFile(file)), { width: 1280, height: 600 });
    await page.locator('button.sy-close:visible').click();
    await page.locator('.sy-album').waitFor();
    await page.locator('button.sy-close:visible').click();
    await state(s => s.state.runtime.screen === 'photo');
  });
}
