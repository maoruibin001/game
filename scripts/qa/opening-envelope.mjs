import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cameraActive, createLetterHarness, walking } from './letter-normal-input.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const out = fileURLToPath(new URL('../../artifacts/opening-envelope/', import.meta.url));
const action = name => '[data-action="' + name + '"]';

export default async function openingEnvelope(play) {
  const h = await createLetterHarness(play, { id: 'mountain-letter', viewport: [1920, 1080] }, {
    budgetMs: 120000, commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  }, out);
  const { page } = play;
  const letter = page.locator('.sy-opening-letter');
  const button = name => page.getByRole('button', { name, exact: true });
  const observations = [];
  const mark = async (name, count) => {
    const pose = await h.wait(s => cameraActive(s) && s.state.runtime.observation?.openingMountains === count, 3500);
    await h.shot(name);
    observations.push({ name, count, pose: pose.controller.camera, feet: pose.controller.position });
  };
  async function slideTo(count, key, maxMoves = 8) {
    for (let i = 0; i < maxMoves; i++) {
      if ((await h.read()).state.runtime.observation?.openingMountains === count) return;
      await play.keyboard.hold(key, 40);
      await h.settle();
    }
    assert.equal((await h.read()).state.runtime.observation?.openingMountains, count, 'normal pose did not reach the expected composition');
  }
  let failure;
  try {
    await h.step('Open the ordinary first letter and raise the camera in front of the post office', async () => {
      await h.startFresh();
      await h.key('KeyJ');
      await letter.getByRole('heading', { name: '能不能寄我一座山？' }).waitFor();
      await h.shot('01-letter-before-photos');
      await button('回去拍山').click();
      await h.wait(walking);
      await h.key('KeyC');
      await h.wait(cameraActive);
      await button('镜头与人物').click();
      await page.locator(action('photo-option') + '[data-photo-key="lens"][data-value="standard"]').click();
      await button('镜头与人物').click();
      await h.wait(s => cameraActive(s) && s.state.durable.photography.lens === 'standard' && s.environment.settled);
      await h.turnTo(Math.PI - .27, -.16);
    });

    const captured = [];
    await h.step('Make three different compositions with the same physical envelope and ordinary lens', async () => {
      await mark('02-both-subjects-outside-the-mouth', 0);
      captured.push(await h.photograph('03-outside-captured'));
      await slideTo(1, 'KeyA');
      await mark('04-one-summit-in-the-mouth', 1);
      captured.push(await h.photograph('05-one-captured'));
      await play.keyboard.hold('KeyW', 180);
      await h.settle();
      await slideTo(2, 'KeyA');
      await play.keyboard.hold('KeyA', 115);
      await h.settle();
      await mark('06-two-summits-in-the-mouth', 2);
      captured.push(await h.photograph('07-two-captured'));
      assert.deepEqual(captured.map(p => p.openingMountains), [0, 1, 2]);
      assert.ok(captured.every(p => p.scene.lens === 'standard' && p.scene.weather === captured[0].scene.weather));
      h.report.openingPhotos = captured.map(({id, openingMountains, scene}) => ({id, openingMountains, scene}));
      h.report.envelopeObservations = observations;
    });

    await h.step('Choose each real photograph, read the corresponding reply, and preserve the original on reload', async () => {
      await h.key('KeyJ');
      await h.wait(s => s.state.runtime.screen === 'journal');
      for (const [index, photo] of captured.entries()) {
        await letter.locator(action('choose-opening-photo') + '[data-id="' + photo.id + '"]').click();
        await h.download(['outside-original','one-summit-original','two-summits-original'][index],
          () => letter.locator(action('export-photo') + '[data-id="' + photo.id + '"]').click(), [1920, 1080], {photoId: photo.id, bytes: photo.original.bytes});
        await letter.locator(action('send-opening-photo')).click();
        await h.wait(s => s.state.durable.openingReply?.id === photo.id);
        await letter.getByText([/山倒在旁边/, /山尖露出来了/, /两座都寄来了/][index]).waitFor();
        await h.shot(['08-reply-outside','09-reply-one','10-reply-two'][index]);
      }
      await page.reload({ waitUntil: 'domcontentloaded' });
      await button('接着上一次的路').waitFor({ timeout: 45000 });
      await h.wait(s => s.restored && s.state.runtime.screen === 'menu' && s.state.durable.openingReply?.id === captured[2].id, 18000);
      await button('接着上一次的路').click();
      await h.wait(walking);
      await h.key('KeyJ');
      await letter.getByText(/两座都寄来了/).waitFor();
      await h.shot('11-reloaded-reply');
      const original = await h.download('two-summits-after-reload', () =>
        letter.locator(action('export-photo') + '[data-id="' + captured[2].id + '"]').click(), [1920, 1080],
        {photoId: captured[2].id, bytes: captured[2].original.bytes});
      assert.equal(original.sha256, h.report.downloads.find(d => d.name === 'two-summits-original').sha256);
    });
  } catch (error) {
    failure = error;
    await h.shot('FAIL-last-visible-frame').catch(() => {});
    throw error;
  } finally {
    await h.finish(failure);
  }
}
