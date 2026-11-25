// Component diagnostic with real rules DTO and public input backend, not a game owner.
import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from '../../../node_modules/.pnpm/node_modules/esbuild/lib/main.js';
import { chromium } from '../../../node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs';
const game = fileURLToPath(new URL('../../../', import.meta.url));
const out = new URL('../../../../production/evidence/presentation/forecast/', import.meta.url);
await mkdir(out, { recursive: true });
const built = await build({ stdin: { resolveDir: game, loader: 'ts', contents: `
import {createPresentation} from './assets/presentation/presentation.ts';
import {createJourney,reduceJourney} from './assets/journey/journey.ts';
import {toPresentationView} from './assets/journey/presentation-adapter.ts';
import {attachBrowserInputBackend} from '@forgeax/engine/input';
const canvas=document.querySelector('canvas'),root=document.querySelector('#ui');
const backend=attachBrowserInputBackend(canvas,{uiRoot:root,pointerLockAllowed:()=>false}).backend;
let state=reduceJourney(createJourney(undefined,{weatherSeed:123}),{type:'start'}).state;
let vm=toPresentationView(state); const actualForecast=vm.weather.forecast;
const actions=[],modals=[];let focusRequests=0;
const focus=()=>{backend.clear();canvas.focus()};
const ui=createPresentation(root,{onAction(action,payload){actions.push({action,payload})},onModalChange(open){modals.push(open);backend.clear()},onRequestGameFocus(){focusRequests++;focus()},onReturnToGame:focus});
function render(patch){vm={...vm,...patch,camera:{...vm.camera,...patch.camera}};ui.render(vm)}
render({});focus();
window.fixture={render,actions,modals,actualForecast,get vm(){return vm},get focusRequests(){return focusRequests},setForecast(forecast){render({weather:{...vm.weather,forecast}})},manualWeather(weather){state=reduceJourney(state,{type:'set-weather',weather}).state;render(toPresentationView(state))},sample:()=>[...backend.sample().pressedCodes??[]],destroy(){ui.destroy();backend.detach()}};
` }, bundle: true, format: 'iife', platform: 'browser', write: false, logLevel: 'silent' });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const checks = [], errors = [];
page.on('pageerror', error => errors.push(error.message));
const setForecast = value => page.evaluate(value => window.fixture.setForecast(value), value);
try {
  await page.setContent('<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#7e9380}canvas,#ui{position:absolute;inset:0;width:100%;height:100%}#ui{pointer-events:none}</style><canvas tabindex="0" id="game-canvas"></canvas><div id="ui"></div>');
  await page.addScriptTag({ content: built.outputFiles[0].text });
  const actual = await page.evaluate(() => window.fixture.actualForecast);
  const initialModalCount = await page.evaluate(() => window.fixture.modals.length);
  assert.equal(Object.values(actual.probabilities).reduce((a,b)=>a+b),100);
  assert.equal(await page.locator('#sy-forecast-details').count(),0);
  await page.locator('[data-action=toggle-forecast]').click();
  const actualValues=await page.locator('[data-weather-probability] strong').allTextContents();
  assert.deepEqual(actualValues,['morning','rain','afterglow'].map(id=>actual.probabilities[id]+'%'));
  assert.match(await page.locator('.sy-forecast-toggle').textContent(),new RegExp('约 '+Math.ceil(actual.changeInSeconds/60)+' 分后'));
  assert.match(await page.locator('#sy-forecast-details').textContent(),/手动切换天气会重新观测/);
  assert.equal(await page.locator('[role=dialog]').count(),0);
  assert.equal(await page.evaluate(()=>window.fixture.modals.length),initialModalCount);
  assert.equal(await page.evaluate(()=>window.fixture.actions.length),0);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'game-canvas');
  for(const [key,code] of [['w','KeyW'],['c','KeyC']]){await page.keyboard.down(key);assert((await page.evaluate(()=>window.fixture.sample())).includes(code));await page.keyboard.up(key)}
  checks.push('real createJourney -> adapter forecast percentages are displayed unchanged and total 100; expansion is nonmodal and returns C/W input to canvas');

  const tied={observedAtSeconds:0,changeInSeconds:60.1,probabilities:{morning:50,rain:50,afterglow:0}};
  await setForecast(tied);
  assert.equal(await page.locator('.sy-forecast-details li.likely').count(),2);
  assert.match(await page.locator('.sy-forecast-toggle').textContent(),/可能清晨 \/ 细雨/);
  assert.match(await page.locator('.sy-forecast-toggle').textContent(),/约 2 分后/);
  await setForecast({...tied,changeInSeconds:59.9});
  assert.match(await page.locator('.sy-forecast-toggle').textContent(),/约 1 分后/);
  await setForecast({...tied,changeInSeconds:0});
  assert.match(await page.locator('.sy-forecast-toggle').textContent(),/即将到来/);
  for (const invalid of [undefined,{...tied,probabilities:{morning:49,rain:50,afterglow:0}},{...tied,probabilities:{morning:50,rain:50}},{...tied,probabilities:{morning:50.5,rain:49.5,afterglow:0}},{...tied,probabilities:{morning:-1,rain:51,afterglow:50}},{...tied,changeInSeconds:NaN},{...tied,observedAtSeconds:-1}]) {
    await setForecast(invalid);assert.equal(await page.locator('.sy-forecast').count(),0);
  }
  checks.push('ties highlight both possible outcomes; time rounds upward; absent, non-finite, negative, incomplete, fractional and non-100 distributions hide without invented normalization');

  await setForecast(actual);
  await page.evaluate(()=>window.fixture.render({camera:{active:true,photography:{...window.fixture.vm.camera.photography,mode:'portrait'},viewpoints:[{index:0,label:'人与路',available:true},{index:1,label:'人在风景里',available:true},{index:2,label:'靠近一点',available:true}],candidateStatus:'选一处喜欢的机位。'}}));
  const slider=await page.locator('#sy-photo-exposure').elementHandle();
  const shutter=await page.locator('.sy-shutter').elementHandle();
  const tools=await page.locator('.sy-field-tools').boundingBox();
  await page.locator('#sy-photo-exposure').focus();
  await page.evaluate(()=>{for(let frame=0;frame<90;frame++)window.fixture.setForecast({...window.fixture.actualForecast,changeInSeconds:120-frame/60})});
  assert(await slider.evaluate(el=>el===document.querySelector('#sy-photo-exposure')));
  assert(await shutter.evaluate(el=>el===document.querySelector('.sy-shutter')));
  assert.equal(await page.evaluate(()=>document.activeElement.id),'sy-photo-exposure');
  assert.deepEqual(await page.locator('.sy-field-tools').boundingBox(),tools);
  await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>document.activeElement.id),'game-canvas');
  await page.locator('[data-action=toggle-forecast]').focus();
  await page.keyboard.press('Enter');assert.equal(await page.locator('[data-action=toggle-forecast]').getAttribute('aria-expanded'),'true');
  await page.keyboard.press('Escape');assert.equal(await page.locator('#sy-forecast-details').count(),0);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'game-canvas');
  checks.push('90 time updates across a minute boundary preserve exposure input and shutter DOM/focus; keyboard forecast Enter/Escape returns gameplay');

  await page.evaluate(()=>window.fixture.manualWeather('rain'));
  const refreshed=await page.evaluate(()=>window.fixture.vm.weather.forecast);
  assert.notDeepEqual(refreshed.probabilities,actual.probabilities);
  await page.locator('[data-action=toggle-forecast]').click();
  assert.deepEqual(await page.locator('[data-weather-probability] strong').allTextContents(),['morning','rain','afterglow'].map(id=>refreshed.probabilities[id]+'%'));
  await page.evaluate(()=>window.fixture.render({camera:{active:true,photography:{...window.fixture.vm.camera.photography,mode:'portrait'},viewpoints:[{index:0,label:'人与路',available:true},{index:1,label:'人在风景里',available:true},{index:2,label:'靠近一点',available:true}],candidateStatus:'选一处喜欢的机位。'}}));
  const geometry=[];
  for(const viewport of [{width:1280,height:600},{width:1920,height:1080}]){
    await page.setViewportSize(viewport);
    const forecast=await page.locator('.sy-forecast').boundingBox(),details=await page.locator('.sy-forecast-details').boundingBox(),tools=await page.locator('.sy-field-tools').boundingBox();
    assert(details.x>=0&&details.y>=0&&details.x+details.width<=viewport.width&&details.y+details.height<=viewport.height);
    assert(details.x+details.width<tools.x);
    assert.equal(tools.x,viewport.width-(viewport.height===600?245:266));
    assert.equal(tools.y,viewport.height===600?80:96);
    geometry.push({viewport,forecast,details,tools});
    await page.screenshot({path:fileURLToPath(new URL(`${viewport.width}x${viewport.height}-component-only.png`,out)),animations:'disabled'});
  }
  await page.evaluate(()=>window.fixture.render({screen:'journal'}));assert(await page.locator('.sy-forecast').isHidden());
  await page.evaluate(()=>window.fixture.destroy());assert.equal(await page.locator('[data-sy-presentation]').count(),0);
  assert.deepEqual(errors,[]);
  checks.push('real manual weather reducer supplies a fresh distribution; 1280x600 and 1920x1080 retain existing tool anchors, hide forecast under journal, and cleanly unmount');
  const result={scope:'Standalone component + actual rules DTO + public input backend; no game/GPU owner acceptance',passed:checks.length,checks,actualForecast:actual,manualForecast:refreshed,geometry,errors};
  await writeFile(new URL('component-check.json',out),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await browser.close()}
