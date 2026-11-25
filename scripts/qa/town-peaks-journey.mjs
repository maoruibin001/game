import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { cameraActive, walking } from './letter-normal-input.mjs';
import { playOpeningForestJourney } from './opening-forest-journey.mjs';

const center = { feet: [155.0958, -3.0083], target: [155, 29, 10] };
const evidence = fileURLToPath(new URL('../../.forgeax/diag/town-peaks-journey/', import.meta.url));

async function townView({ play, h, cameraAt, click, action }) {
  async function chooseLens(lens) {
    await click(action('toggle-photo-tools'));
    await click(action('photo-option') + '[data-photo-key="lens"][data-value="' + lens + '"]');
    await click(action('toggle-photo-tools'));
    await h.wait(s => cameraActive(s) && s.state.durable.photography.lens === lens);
  }

  await click(action('open-outings'));
  await click(action('set-creative-mode'));
  await play.page.locator('[data-creative-time]').fill('16:11');
  await click(action('set-weather') + '[data-weather="morning"]');
  await click('button.sy-close:visible');
  await h.wait(s => walking(s) && s.state.durable.creativeMode && Math.floor(s.state.durable.clock.minute) === 971);

  // Fixed light and ordinary in-game movement for the visual comparison only.
  await cameraAt(center, '05-a-comparable-wide');
  await h.wait(s => cameraActive(s) && s.environment.settled && s.environment.weather === 'morning'
    && Math.floor(s.environment.clock.minute) === 971 && s.state.runtime.bridgeProgress === 0);
  await h.shot('05-b-comparable-wide-clear');
  await chooseLens('standard');
  await h.wait(s => cameraActive(s) && s.view.camera.ready);
  await h.shot('05-c-center-standard');
  for (const [side, x] of [['west', 154.65], ['east', 155.35]]) {
    await h.lowerCamera();
    await cameraAt({ feet: [x, -2.85], target: [155, 29, 10], tolerance: 0.12 }, '05-d-' + side);
    const offset = await h.wait(s => cameraActive(s) && s.view.camera.ready);
    assert.equal(offset.state.runtime.bridgeProgress, 0);
    await h.shot('05-e-' + side + '-standard-ready');
  }

  await h.lowerCamera();
  await click(action('open-outings'));
  await click(action('set-creative-mode'));
  await click('button.sy-close:visible');
  await h.wait(s => walking(s) && !s.state.durable.creativeMode);
  await cameraAt(center, '05-f-normal-mode-standard');
  await h.wait(s => cameraActive(s) && s.view.camera.ready && s.state.runtime.bridgeProgress === 0);
}

async function afterTownPhoto({ play, h, town, click, action }) {
  await h.key('KeyJ');
  await h.wait(s => s.state.runtime.screen === 'journal');
  await play.page.getByRole('tab', { name: /留住的风景/ }).click();
  await click(action('photo-collection') + '[data-collection="film"]');
  await click('.sy-album ' + action('view-photo') + '[data-id="' + town.id + '"]');
  await h.download('06-b-town-original', () => click(action('export-photo')), [1920, 1080], {
    photoId: town.id, bytes: town.original.bytes,
  });
  await click('button.sy-close:visible');
  await play.page.locator('.sy-album').waitFor();
  await click('button.sy-close:visible');
  await h.wait(cameraActive);
}

async function afterRestore({ play, h, town, click, action }) {
  await click('button.sy-close:visible');
  await play.page.locator('.sy-album').waitFor();
  await click('.sy-album ' + action('view-photo') + '[data-id="' + town.id + '"]');
  const restored = await h.download('13-restored-town-original', () => click(action('export-photo')), [1920, 1080], {
    photoId: town.id, bytes: town.original.bytes,
  });
  assert.equal(restored.sha256, h.report.downloads.find(entry => entry.name === '06-b-town-original').sha256);
}

export default play => playOpeningForestJourney(play, { id: 'town-peaks', evidence, townView, afterTownPhoto, afterRestore });
