// Isolated DOM/CSS component verification. This does not run or accept the game.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from '../../../node_modules/.pnpm/node_modules/esbuild/lib/main.js';
import { chromium } from '../../../node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs';

const game = fileURLToPath(new URL('../../../', import.meta.url));
const out = new URL('../../../../production/sprint-p0-20261116/ui-component/', import.meta.url);
await mkdir(out, { recursive: true });
const built = await build({ stdin: { resolveDir: game, loader: 'ts', contents: `
import { createPresentation } from './assets/presentation/presentation.ts';
import { initialPresentationView } from './assets/presentation/types.ts';
import { DEFAULT_PHOTOGRAPHY, WEATHER_LABELS } from './assets/shared/photography-contract.ts';
const calls = [];
let view = { ...initialPresentationView(), screen: 'play', area:'town', areaName:'石巷旧镇',
  objective:'门里的山', objectiveDetail:'石拱旁的木屏挡住了远山。找到系红绳的绞盘，走近后按 E 转动摇柄。', saveStatus:'saved',
  weather:{ id:'morning', label:WEATHER_LABELS.morning, options:Object.entries(WEATHER_LABELS).map(([id,label])=>({id,label})),
    forecast:{observedAtSeconds:200,changeInSeconds:250,probabilities:{morning:20,rain:45,afterglow:35}} },
  camera:{active:false,alignment:0,ready:false,photography:{...DEFAULT_PHOTOGRAPHY,mode:'portrait',timerSeconds:3},viewpoints:[]},
};
const ui = createPresentation(document.querySelector('#ui'),{onAction(action,payload){ calls.push({action,payload}); }});
ui.render(view);
window.fixture = { calls, render(patch){ view={...view,...patch,camera:{...view.camera,...patch.camera}};ui.render(view); }, destroy(){ui.destroy();} };
` }, bundle: true, format: 'iife', platform: 'browser', write: false, logLevel: 'silent' });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
const overlaps = (a,b) => a.x < b.x+b.width && a.x+a.width > b.x && a.y < b.y+b.height && a.y+a.height > b.y;
const box = async selector => { const result = await page.locator(selector).boundingBox(); assert(result, selector+' missing'); return result; };
try {
  for (const viewport of [{width:1280,height:600},{width:1280,height:720},{width:1920,height:1080}]) {
    await page.setViewportSize(viewport);
    await page.setContent('<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#839982}#ui{position:absolute;inset:0;pointer-events:none}</style><div id="ui"></div>');
    await page.addScriptTag({content:built.outputFiles[0].text});
    const recovery = await box('.sy-recover-path');
    const walkingComparisons = [];
    for (const selector of ['.sy-place','.sy-field-tools','.sy-forecast-toggle','.sy-save']) {
      if (await page.locator(selector).count()) { const other = await box(selector); assert(!overlaps(recovery,other), selector); walkingComparisons.push({selector,box:other}); }
    }
    await page.locator('.sy-recover-path').click();
    assert.deepEqual(await page.evaluate(()=>window.fixture.calls), [{action:'recover-path',payload:undefined}]);
    await page.screenshot({path:fileURLToPath(new URL(`walking-${viewport.width}x${viewport.height}-component-only.png`,out)),animations:'disabled'});
    await page.locator('[data-action="pause"]').click();
    await page.evaluate(()=>window.fixture.render({screen:'paused'}));
    for (let i=0;i<5;i++) await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('data-action')),'recover-path');
    const pausedRecovery = await box('.sy-pause [data-action="recover-path"]');
    assert(pausedRecovery.y>=0 && pausedRecovery.y+pausedRecovery.height<=viewport.height);
    const pauseVisible = await page.locator('.sy-pause').evaluate(el=>el.scrollHeight<=el.clientHeight);
    assert(pauseVisible,'pause content scrolls at '+viewport.height);
    await page.screenshot({path:fileURLToPath(new URL(`paused-${viewport.width}x${viewport.height}-component-only.png`,out)),animations:'disabled'});
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(()=>window.fixture.calls.length),3);
    await page.evaluate(()=>window.fixture.render({screen:'play',camera:{active:true}}));
    const cameraSave = await box('.sy-save');
    const photographComparisons = [];
    for (const selector of ['.sy-field-tools','.sy-shutter','.sy-camera-feedback']) {
      const other=await box(selector);assert(!overlaps(cameraSave,other),selector+' overlaps save');photographComparisons.push({selector,box:other});
    }
    assert.equal(await page.locator('[data-layer="hud"]').evaluate(el=>el.inert),true);
    checks.push({viewport,recovery,walkingComparisons,pausedRecovery,pauseVisible,cameraSave,photographComparisons,semanticCallbacks:2,pauseRecoveryTab:5});
    await page.evaluate(()=>window.fixture.destroy());
  }
  assert.deepEqual(errors,[]);
  const result={scope:'Isolated DOM/CSS component geometry only; not native game acceptance',passed:true,checks,errors};
  await writeFile(new URL('RESULT.json',out),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
} finally { await browser.close(); }
