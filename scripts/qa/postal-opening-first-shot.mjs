import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cameraActive, createLetterHarness, walking } from './letter-normal-input.mjs';
import { startVideo, stopVideo, tapAudio } from './night-post.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = resolve(root, process.env.POSTAL_OPENING_EVIDENCE ?? 'artifacts/postal-opening');
const action = name => '[data-action="' + name + '"]';
const planarDistance = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);

export default async function postalFirstShot(play) {
  const {page} = play;
  await tapAudio(page);
  const h = await createLetterHarness(play, {id:'postal-first-shot', viewport:[1920,1080]}, {
    budgetMs:125000, url:page.url(), manifest:process.env.POSTAL_OPENING_MANIFEST,
    commit:process.env.POSTAL_OPENING_COMMIT ?? execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
  }, output);
  const button = text => page.getByRole('button', {name:text, exact:true});
  const letter = page.locator('.sy-opening-letter');
  const observations = [];
  const captured = [];
  let initial, raised, takeStart, failure, recording = false;
  async function take(name, expectCount, key, duration) {
    const before = await h.read();
    if (key) {
      // Each press is a preselected ordinary tap. The game result never controls
      // the duration, distance or choice of the next input.
      await play.keyboard.hold(key,duration);
      await h.settle();
    }
    const at = await h.wait(s => cameraActive(s) && s.controller.speed < .03);
    const actual = at.controller.position;
    assert.equal(at.controller.yaw,raised.controller.yaw);
    assert.equal(at.controller.pitch,raised.controller.pitch);
    assert.equal(at.controller.camera.verticalFovRadians,raised.controller.camera.verticalFovRadians);
    const motion = planarDistance(before.controller.position,actual);
    if (key) assert.ok(motion >= .19 && motion <= .85, `ordinary ${key} tap moved ${motion}m`);
    const photo = await h.photograph(name);
    captured.push(photo);
    observations.push({name,key,duration,delta:motion,fromBirth:planarDistance(initial.controller.position,actual),feet:actual,
      camera:at.controller.camera,weather:photo.scene.weather,clock:photo.scene.clock,count:photo.openingMountains,id:photo.id,
      elapsedMs:Date.now()-takeStart});
    assert.equal(photo.scene.lens,'wide');
    assert.equal(photo.scene.exposure,0);
    assert.equal(photo.scene.weather,'morning');
    if (expectCount !== undefined) assert.equal(photo.openingMountains,expectCount,
      `actual JPEG ${name} at ${actual}, cumulative ${observations.at(-1).fromBirth}m`);
  }
  try {
    await h.step('Start a plain new game, raise the wide lens and walk sideways without looking', async() => {
      const menu = await h.wait(s => s.restored && s.state.runtime.screen === 'menu');
      assert.equal(menu.state.durable.started,false);
      await button('背上行囊，出发').click();
      initial = await h.wait(walking);
      assert.equal(initial.state.durable.clock.day,1);
      assert.ok(initial.state.durable.clock.minute >= 780 && initial.state.durable.clock.minute < 781);
      h.report.birth = {clock:initial.state.durable.clock,weather:initial.state.durable.weather,
        feet:initial.controller.position,camera:initial.controller.camera,quality:initial.state.durable.settings.quality};
      h.report.opening = observations;
      await h.shot('00-出生步行');
      const audioTracks = await startVideo(page);
      h.report.audioTracks = audioTracks;
      recording = true;
      takeStart = Date.now();
      // Record continuous real play rather than the headless simulation clock.
      await play.wait(2000);
      await h.key('KeyC'); raised = await h.wait(cameraActive);
      await h.shot('01-出生举机未移动');
      await take('02-出生快门',0);
      await play.wait(2000);
      await take('03-A一步一峰',1,'KeyA',195);
      await play.wait(2000);
      await take('04-A两步双峰',2,'KeyA',218);
      await play.wait(2000);
      await take('05-A再一步',undefined,'KeyA',225);
      await play.wait(2000);
      await take('06-D回一步',2,'KeyD',205);
      const remaining = 30500 - (Date.now() - takeStart);
      if (remaining > 0) await play.wait(remaining);
      h.report.recording = await stopVideo(page,join(h.out,'邮局首镜-普通键鼠.webm'));
      recording = false;
    });
    await h.step('Export the untouched shutter JPEGs and mail the zero, one and two-crest results',async() => {
      await h.key('KeyJ');
      await letter.waitFor();
      for(const [index, photo] of captured.entries()) {
        await letter.locator(action('choose-opening-photo')+'[data-id="'+photo.id+'"]').click();
        await h.download(observations[index].name+'-原片',
          () => letter.locator(action('export-photo')+'[data-id="'+photo.id+'"]').click(),[1920,1080],
          {photoId:photo.id,bytes:photo.original.bytes});
      }
      for(const [index,reaction] of [/山倒在旁边/,/山尖露出来了/,/两座都寄来了/].entries()) {
        const photo=captured[index];
        await letter.locator(action('choose-opening-photo')+'[data-id="'+photo.id+'"]').click();
        await letter.locator(action('send-opening-photo')).click();
        await h.wait(s => s.state.durable.openingReply?.id === photo.id);
        await letter.getByText(reaction).waitFor();
        await h.shot('07-回信-'+index+'峰');
      }
      await page.reload({waitUntil:'domcontentloaded'});
      await button('接着上一次的路').waitFor();
      await h.wait(s => s.restored && s.state.runtime.screen === 'menu' && s.state.durable.openingReply?.id === captured[2].id,18000);
      await button('接着上一次的路').click();
      await h.wait(walking);
      await h.key('KeyJ');
      await letter.getByText(/两座都寄来了/).waitFor();
      const photo=captured[2];
      const after = await h.download('08-续档双峰原片',
        () => letter.locator(action('export-photo')+'[data-id="'+photo.id+'"]').click(),[1920,1080],
        {photoId:photo.id,bytes:photo.original.bytes});
      assert.equal(after.sha256,h.report.downloads[2].sha256);
      await h.shot('08-续档回信与底片');
    });
  } catch (error) {
    failure = error;
    await h.shot('失败现场').catch(() => {});
    throw error;
  } finally {
    if(recording) h.report.recording = await stopVideo(page,join(h.out,'邮局首镜-失败段.webm')).catch(()=>null);
    await h.finish(failure);
  }
}
