import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cameraActive, createLetterHarness, walking } from './letter-normal-input.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = join(root, 'artifacts/intranet-startup-20261120');
const visualOnly = process.env.SKY_QA_VISUAL_ONLY === '1';

async function recordFrames(page, milliseconds) {
  return page.evaluate(async duration => {
    const canvas = [...document.querySelectorAll('canvas')].find(node => node.forgeaxFrameProgress?.completed);
    if (!canvas) throw new Error('Cannot find the presented game canvas.');
    const frameTime = () => performance.now();
    const complete = [];
    const submitted = [];
    const onCompleted = ({ detail }) => complete.push({
      at: frameTime(), id: detail.frameId, presentation: detail.presentation, reason: detail.presentationPendingReason,
    });
    const onSubmitted = ({ detail }) => submitted.push({
      at: frameTime(), id: detail.frameId, bytes: detail.publicationBytes, commands: detail.rhiCommands,
    });
    canvas.addEventListener('forgeax:frame-completed', onCompleted);
    canvas.addEventListener('forgeax:frame-submitted', onSubmitted);
    try {
      const start = frameTime();
      await new Promise(resolve => setTimeout(resolve, duration));
      return { elapsedMs: frameTime() - start, complete, submitted, size: [canvas.width, canvas.height], dpr: devicePixelRatio };
    } finally {
      canvas.removeEventListener('forgeax:frame-completed', onCompleted);
      canvas.removeEventListener('forgeax:frame-submitted', onSubmitted);
    }
  }, milliseconds);
}

function summarize({ elapsedMs, complete, submitted, size, dpr }) {
  const ready = complete.filter(frame => frame.presentation === 'ready');
  const gaps = ready.slice(1).map((frame, index) => frame.at - ready[index].at).sort((a, b) => a - b);
  const pendingIds = new Set(complete.filter(frame => frame.presentation === 'pending').map(frame => frame.id));
  return {
    elapsedMs, size, dpr, frames: ready.length, readyFPS: ready.length * 1000 / elapsedMs,
    p95Ms: gaps[Math.ceil(gaps.length * .95) - 1], maxMs: gaps.at(-1),
    gapsOver65Ms: gaps.filter(gap => gap > 65),
    pending: pendingIds.size, pendingWithSkyUpload: submitted.filter(frame => pendingIds.has(frame.id) && frame.bytes?.assets === 32768).length,
    exactSkyUploads: submitted.filter(frame => frame.bytes?.assets === 32768).length,
  };
}

export default async function skyFrameCadence(play) {
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const h = await createLetterHarness(play, { id: visualOnly ? 'sky-visual-capture' : 'sky-frame-cadence' }, { budgetMs: 125000, commit }, output);
  const page = play.page;
  const diary = page.getByRole('button', { name: '打开摄影日程' });
  const close = page.locator('button.sy-close:visible');
  const report = { commit, samples: [] };
  let problem;

  async function sample(label, duration = 12000, input) {
    const before = await h.read();
    const [frames] = await Promise.all([recordFrames(page, duration), input?.()]);
    const after = await h.read();
    const result = { label, before: before.state.durable.clock, after: after.state.durable.clock, ...summarize(frames) };
    report.samples.push(result);
    await writeFile(join(h.out, label + '.json'), JSON.stringify(frames));
    assert.ok(result.frames >= duration / 100, 'Missing presentable game frames');
    return { before, after, result };
  }

  async function setCreative(enabled) {
    await diary.click();
    await page.getByRole('button', { name: enabled ? '开启自由创作' : '回到旅途模式', exact: true }).click();
    await h.wait(state => state.state.durable.creativeMode === enabled);
    await close.click();
    await h.wait(walking);
  }

  async function setWeather(weather, time) {
    await diary.click();
    if (time) {
      const field = page.locator('[data-creative-time]');
      await field.fill(time);
      await field.press('Tab');
    }
    await page.locator(`[data-action=set-weather][data-weather=${weather}]:visible`).click();
    await close.click();
    await h.wait(walking);
  }

  try {
    await h.startFresh();
    if (!visualOnly) await h.step('标题出发，同机位观察旅途、创作暂停、恢复旅途', async () => {
      await h.shot('01-山口开场同机位');
      const a = await sample('A-自然时钟');
      await setCreative(true);
      const b = await sample('B-创作时钟暂停');
      await setCreative(false);
      const a2 = await sample('A2-回到旅途');
      assert.ok(a.after.state.durable.clock.minute - a.before.state.durable.clock.minute >= 6);
      assert.deepEqual(b.after.state.durable.clock, b.before.state.durable.clock);
      assert.ok(a2.after.state.durable.clock.minute - a2.before.state.durable.clock.minute >= 6);
      for (const phase of [a, b, a2]) {
        assert.deepEqual(phase.before.controller.position, phase.after.controller.position);
        assert.equal(phase.before.controller.yaw, phase.after.controller.yaw);
        assert.deepEqual(phase.before.controller.position, a.before.controller.position);
        assert.equal(phase.before.controller.yaw, a.before.controller.yaw);
      }
    });

    if (!visualOnly) await h.step('普通行走和转镜', async () => {
      const motion = await sample('山口行走转镜', 5000, async () => {
        await play.keyboard.hold('KeyW', 950);
        const facing = await h.read();
        await h.turnTo(facing.controller.yaw + .55, facing.controller.pitch);
        await play.keyboard.hold('KeyW', 700);
      });
      assert.ok(Math.abs(motion.after.controller.yaw - motion.before.controller.yaw) > .2);
      assert.ok(Math.hypot(...motion.after.controller.position.map((axis, index) => axis - motion.before.controller.position[index])) > 1);
      await h.shot('02-正常行走转镜');
    });

    await h.step('通过游戏选项实测晴到雨、快门、夜色和原片', async () => {
      await setCreative(true);
      await sample('晴转雨', 6500, () => setWeather('rain'));
      await h.wait(state => walking(state) && state.environment.weather === 'rain' && state.environment.settled);
      await h.shot('03-天气转细雨');
      await h.key('KeyC');
      await h.wait(cameraActive);
      const rain = await h.photograph('04-细雨实拍');
      assert.equal(rain.scene.weather, 'rain');
      await page.getByRole('button', { name: /第一张已保存.*查看照片/ }).click({ timeout: 6000 });
      const exportButton = page.locator('button[data-action=export-photo]:visible');
      await h.download('细雨-导出原片', () => exportButton.click({ timeout: 6000 }), [1920, 1080], { photoId: rain.id, bytes: rain.original.bytes });
      await close.click();
      await page.getByRole('heading', { name: '摄影底片', exact: true }).waitFor({ timeout: 6000 });
      await close.click();
      const returned = await h.wait(state => walking(state) || cameraActive(state));
      if (cameraActive(returned)) await h.lowerCamera();
      await setWeather('morning', '18:00');
      await h.wait(state => walking(state) && state.environment.clock?.minute === 1080 && state.environment.settled);
      await h.shot('05-同机位日落');
      await setWeather('morning', '20:30');
      await h.wait(state => walking(state) && state.environment.clock?.minute === 1230 && state.environment.settled);
      await h.shot('06-同机位入夜');
      await h.key('KeyC');
      const night = await h.photograph('07-夜色实拍', { shutterButton: page.locator('.sy-shutter:visible') });
      assert.equal(night.scene.clock.minute, 1230);
    });

    for (const phase of report.samples) {
      assert.equal(phase.exactSkyUploads, 0, phase.label + ' republished the HDR sky');
      assert.equal(phase.pendingWithSkyUpload, 0, phase.label + ' interrupted a presentable frame with that upload');
    }
    for (const phase of report.samples.filter(phase => phase.label === 'A-自然时钟' || phase.label === 'A2-回到旅途')) {
      assert.ok(phase.gapsOver65Ms.length < 3, phase.label + ' still has repeated visible pauses');
    }
  } catch (error) {
    problem = error;
    await h.shot('复测中断').catch(() => {});
    throw error;
  } finally {
    await writeFile(join(h.out, '帧时汇总.json'), JSON.stringify({ ...report, error: problem?.message }, null, 2) + '\n');
    await h.finish(problem);
  }
}
