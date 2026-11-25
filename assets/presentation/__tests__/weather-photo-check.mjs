// Standalone UI and public SDK input diagnostic. Does not launch a game owner.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from '../../../node_modules/.pnpm/node_modules/esbuild/lib/main.js';
import { chromium } from '../../../node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs';
const game = fileURLToPath(new URL('../../../', import.meta.url));
const out = new URL('../../../../production/evidence/presentation/weather-photo/', import.meta.url);
await mkdir(out, { recursive: true });
const built = await build({ stdin: { resolveDir: game, loader: 'ts', contents: `
import {createPresentation} from './assets/presentation/presentation.ts';
import {initialPresentationView} from './assets/presentation/types.ts';
import {DEFAULT_PHOTOGRAPHY,WEATHER_LABELS} from './assets/shared/photography-contract.ts';
import {attachBrowserInputBackend} from '@forgeax/engine/input';
const canvas=document.querySelector('canvas'), root=document.querySelector('#ui');
const backend=attachBrowserInputBackend(canvas,{uiRoot:root,pointerLockAllowed:()=>false}).backend;
let vm={...initialPresentationView(),screen:'play',camera:{active:true,alignment:0,ready:false,photography:{...DEFAULT_PHOTOGRAPHY},countdownSeconds:null,viewpoints:[{index:0,label:'人与路',available:true},{index:1,label:'人在风景里',available:false,reason:'石墙挡住了相机'},{index:2,label:'靠近一点',available:true}]},weather:{id:'morning',label:WEATHER_LABELS.morning,options:Object.entries(WEATHER_LABELS).map(([id,label])=>({id,label}))}};
let focusRequests=0;const events=[],modals=[];
const focus=()=>{backend.clear();canvas.focus();};
const ui=createPresentation(root,{onAction(action,payload){events.push({action,payload});
// This small host stub only supplies returned DTOs. It is not rule/game acceptance.
if(action==='set-weather')render({weather:{...vm.weather,id:payload.id,label:WEATHER_LABELS[payload.id]}});
if(action==='set-photography')render({camera:{photography:{...vm.camera.photography,...payload}}});
if(action==='cancel-countdown')render({camera:{countdownSeconds:null}});
if(action==='open-film')render({screen:'journal'});
if(action==='close-panel')queueMicrotask(()=>render({screen:'play'}));
},onModalChange(open){modals.push(open);backend.clear()},onReturnToGame:focus,onRequestGameFocus(){focusRequests++;focus()}});
function render(patch){vm={...vm,...patch,camera:{...vm.camera,...patch.camera}};ui.render(vm)}
render({});focus();
window.fixture={render,events,modals,get vm(){return vm},get focusRequests(){return focusRequests},sample:()=>[...backend.sample().pressedCodes??[]],destroy(){ui.destroy();backend.detach()}};
` }, bundle: true, format: 'iife', platform: 'browser', write: false, logLevel: 'silent' });
const archived = JSON.parse(await readFile(new URL('../../../../production/qa/full-02/play.json', import.meta.url), 'utf8'));
let realImage;
const scan = value => { if (realImage || !value || typeof value !== 'object') return; if (typeof value.thumbnail === 'string' && value.thumbnail.startsWith('data:image/')) realImage = value.thumbnail; for (const child of Object.values(value)) scan(child); };
scan(archived); assert(realImage);
const photo = { id: 'photo-10', title: '来时的山谷', location: '山脊观景站', imageUrl: realImage, originalKey: 'component-original-10', width: 960, height: 540, sceneDescription: '晴朗清晨 · 广角 · 远望' };
const old = { id: 'photo-11', title: '一张旧照片', location: '林地', imageUrl: realImage };
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const checks = [], errors = [];
page.on('pageerror', error => errors.push(error.message));
const render = patch => page.evaluate(patch => window.fixture.render(patch), patch);
const latestAction = () => page.evaluate(() => window.fixture.events.at(-1));
try {
  await page.setContent('<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#7e9380}canvas,#ui{position:absolute;inset:0;width:100%;height:100%}#ui{pointer-events:none}</style><canvas tabindex="0" id="game-canvas"></canvas><div id="ui"></div>');
  await page.addScriptTag({ content: built.outputFiles[0].text });
  const frame = await page.locator('.sy-viewfinder').boundingBox();
  assert.deepEqual(frame, { x: 0, y: 0, width: 1280, height: 720 });
  const modalCount = await page.evaluate(() => window.fixture.modals.length);
  await render({ film: [photo, old] });
  assert.equal(await page.locator('[role=dialog]').count(), 0);
  assert.equal(await page.evaluate(() => window.fixture.modals.length), modalCount);
  assert.equal(await page.locator('.sy-film-open').textContent(), '底片 2/8');
  checks.push('full viewport is the framing boundary; returned film photos update without opening a modal or pausing input');

  await page.locator('[data-action=toggle-weather]').click();
  await page.locator('[data-weather=rain]').click();
  assert.deepEqual(await latestAction(), { action: 'set-weather', payload: { id: 'rain' } });
  assert.equal(await page.evaluate(() => document.activeElement.id), 'game-canvas');
  await page.keyboard.down('w'); assert((await page.evaluate(() => window.fixture.sample())).includes('KeyW')); await page.keyboard.up('w');
  await page.keyboard.down('c'); assert((await page.evaluate(() => window.fixture.sample())).includes('KeyC')); await page.keyboard.up('c');
  assert.equal(await page.locator('[role=dialog]').count(), 0);
  checks.push('weather selection emits the exact request and ordinary pointer activation returns real SDK movement input to the canvas');

  await page.locator('[data-photo-key=mode][data-value=portrait]').click();
  assert.deepEqual(await latestAction(), { action: 'set-photography', payload: { mode: 'portrait' } });
  const coordinates = {};
  for (const width of [1280, 1920]) {
    await page.setViewportSize({ width, height: width === 1280 ? 720 : 1080 });
    await page.locator('[data-action=toggle-weather]').click();
    coordinates[width] = await page.locator('.sy-field-tools button,.sy-field-tools input,.sy-shutter,.sy-latest-photo').evaluateAll(elements => elements.map(el => {
      const r = el.getBoundingClientRect(); return { action: el.dataset.action, key: el.dataset.photoKey, value: el.dataset.value ?? el.dataset.weather, label: el.textContent.trim(), disabled: el.disabled, x: Math.round(r.x+r.width/2), y: Math.round(r.y+r.height/2) };
    }));
    await page.locator('[data-action=toggle-weather]').click();
  }
  await writeFile(new URL('control-coordinates-component-only.json', out), JSON.stringify({ scope: 'Standalone real CSS geometry only; native game placement still needs observation', coordinates }, null, 2));
  await page.setViewportSize({ width: 1280, height: 720 });
  assert(await page.locator('[data-photo-key=viewpoint][data-value="1"]').isDisabled());
  assert.equal(await page.locator('[data-photo-key=viewpoint][data-value="1"]').getAttribute('title'), '石墙挡住了相机');
  await page.locator('[data-photo-key=viewpoint][data-value="2"]').click();
  await page.locator('[data-photo-key=pose][data-value=letter]').click();
  await page.locator('[data-photo-key=lens][data-value=detail]').click();
  assert.deepEqual(await latestAction(), { action: 'set-photography', payload: { lens: 'detail' } });
  for (let n = 0; n < 35 && await page.evaluate(() => document.activeElement.id) !== 'sy-photo-exposure'; n++) await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'sy-photo-exposure');
  await page.keyboard.press('ArrowRight');
  assert.deepEqual(await latestAction(), { action: 'set-photography', payload: { exposure: .5 } });
  assert.equal(await page.evaluate(() => document.activeElement.id), 'sy-photo-exposure');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'game-canvas');
  checks.push('portrait mode, true candidate availability, pose and lens emit typed choices; keyboard EV retains focus and Escape returns gameplay');

  await page.locator('[data-photo-key=timerSeconds][data-value="3"]').click();
  const shutter = await page.locator('.sy-shutter').elementHandle();
  await render({ camera: { countdownSeconds: 3 } });
  const cancel = await page.locator('[data-action=cancel-countdown]').elementHandle();
  await render({ camera: { countdownSeconds: 2, alignment: .5 } });
  assert(await shutter.evaluate(el => el === document.querySelector('.sy-shutter')));
  assert(await cancel.evaluate(el => el === document.querySelector('[data-action=cancel-countdown]')));
  assert(await page.locator('.sy-shutter').isDisabled());
  await page.locator('[data-action=cancel-countdown]').click();
  assert.equal((await latestAction()).action, 'cancel-countdown');
  assert.equal(await page.locator('.sy-countdown').count(), 0);
  await render({ camera: { captureState: 'saving' } });
  assert(await page.locator('.sy-shutter').isDisabled());
  assert(await page.locator('[data-photo-key=mode][data-value=landscape]').isDisabled());
  await render({ camera: { captureState: 'idle' } });
  await page.screenshot({ animations: 'disabled', path: fileURLToPath(new URL('01-camera-tools-component-only.png', out)) });
  checks.push('countdown is cancellable without modal, preserves shutter/cancel DOM across ticks, and real capture/save states prevent another exposure');

  await page.locator('.sy-film-open').click();
  assert.equal(await page.locator('[role=tab]').count(), 3);
  assert.equal(await page.locator('[data-collection=film][aria-pressed=true]').count(), 1);
  await page.locator('[data-action=view-photo][data-id=photo-10]').click();
  await page.locator('[data-action=save-photo]').click();
  assert.deepEqual(await latestAction(), { action: 'save-photo', payload: { photoId: 'photo-10' } });
  assert.equal(await page.locator('[data-action=save-photo]').count(), 1);
  await render({ album: [photo] });
  assert.equal(await page.locator('[data-action=save-photo]').count(), 0);
  await page.locator('[data-action=view-large-photo]').click();
  assert.equal(await page.locator('.sy-large-photo-image img').evaluate(el => getComputedStyle(el).objectFit), 'contain');
  assert.match(await page.locator('.sy-photo-metadata').textContent(), /当前显示预览图/);
  const hydrated = await page.evaluate(data => {
    const bytes = Uint8Array.from(atob(data.split(',')[1]), char => char.charCodeAt(0));
    return URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }));
  }, realImage);
  await render({ album: [{ ...photo, imageUrl: hydrated, originalState: 'ready' }] });
  assert.equal(await page.locator('.sy-large-photo-image img').getAttribute('src'), hydrated);
  assert.match(await page.locator('.sy-photo-metadata').textContent(), /正在查看原图/);
  await page.locator('[data-action=export-photo]').click();
  assert.deepEqual(await latestAction(), { action: 'export-photo', payload: { photoId: 'photo-10' } });
  assert(!await page.locator('.sy-large-photo').textContent().then(text => text.includes('导出成功')));
  await render({ album: [{ ...photo, originalState: 'missing' }] });
  assert(await page.locator('[data-action=export-photo]').isDisabled());
  checks.push('film detail explicitly saves by photoId and waits for returned DTO; big image contains all pixels; Blob hydration and missing-original states are honest; export emits intent only');

  await page.keyboard.press('Escape');
  await page.locator('[data-action=ask-delete-film]').click();
  await page.locator('[data-action=delete-film-photo]').click();
  assert.deepEqual(await latestAction(), { action: 'delete-film-photo', payload: { photoId: 'photo-10' } });
  await render({ film: [old] });
  assert.equal(await page.locator('.sy-review').count(), 1); // The independent album DTO remains.
  assert.equal(await page.locator('[data-action=ask-delete-film]').count(), 0);
  await page.keyboard.press('Escape');
  await page.locator('[data-action=view-photo][data-id=photo-11]').click();
  assert.equal(await page.locator('[data-action=export-photo]').count(), 0);
  assert.match(await page.locator('.sy-photo-metadata').textContent(), /旧照片只有预览图/);
  checks.push('explicit film deletion does not remove the retained album display; legacy thumbnails never expose a fabricated original export');

  const fullAlbum = Array.from({ length: 12 }, (_, index) => ({ ...old, id: `kept-${index}`, title: `精选 ${index + 1}` }));
  await render({ album: fullAlbum });
  assert.equal(await page.locator('[data-action=replace-photo]').count(), 12);
  await page.locator('[data-action=replace-photo][data-id=kept-3]').click();
  assert.deepEqual(await latestAction(), { action: 'replace-photo', payload: { photoId: 'photo-11', replaceId: 'kept-3' } });
  await page.setViewportSize({ width: 1280, height: 600 });
  const box = await page.locator('.sy-review').boundingBox();
  assert(box.y >= 0 && box.y + box.height <= 600);
  assert(await page.locator('.sy-review').evaluate(el => el.scrollWidth <= el.clientWidth + 1));
  await page.screenshot({ animations: 'disabled', path: fileURLToPath(new URL('02-film-selection-component-only.png', out)) });
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'game-canvas');
  await page.screenshot({ animations: 'disabled', path: fileURLToPath(new URL('03-camera-600-component-only.png', out)) });
  checks.push('full 12-photo selection offers explicit replacement with both IDs; 600px modal stays inside viewport and layered Escape restores canvas focus');
  await page.evaluate(() => window.fixture.destroy());
  assert.equal(await page.locator('[data-sy-presentation]').count(), 0);
  assert.deepEqual(errors, []);
  const result = { scope: 'Standalone presentation + public SDK input only; no game owner, real weather rendering, storage or download acceptance', passed: checks.length, checks, errors, photoFixture: 'Archived real photograph reused for component layout, not new photography evidence' };
  await writeFile(new URL('component-check.json', out), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); }
