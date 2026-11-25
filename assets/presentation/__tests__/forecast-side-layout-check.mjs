// CSS geometry only. Archived original as background; this is not a new game capture.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { build } from '../../../node_modules/.pnpm/node_modules/esbuild/lib/main.js';
import { chromium } from '../../../node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs';
const game = fileURLToPath(new URL('../../../', import.meta.url));
const out = new URL('../../../../production/evidence/presentation/forecast-side-layout/', import.meta.url);
await mkdir(out, { recursive: true });
const original = await readFile(new URL('../../../artifacts/qa/weather-photo-04/retained-after-reload.jpg', import.meta.url));
const imageData = 'data:image/jpeg;base64,'+original.toString('base64');
const built=await build({stdin:{resolveDir:game,loader:'ts',contents:`
import {createPresentation} from './assets/presentation/presentation.ts';
import {initialPresentationView} from './assets/presentation/types.ts';
import {DEFAULT_PHOTOGRAPHY,WEATHER_LABELS} from './assets/shared/photography-contract.ts';
let view={...initialPresentationView(),screen:'play',saveStatus:'saved',film:[{id:'photo-1',title:'山口邮局 · 第1张',location:'山口邮局'}],weather:{id:'morning',label:WEATHER_LABELS.morning,options:Object.entries(WEATHER_LABELS).map(([id,label])=>({id,label})),forecast:{observedAtSeconds:200,changeInSeconds:250,probabilities:{morning:20,rain:45,afterglow:35}}},camera:{active:true,alignment:0,ready:false,photography:{...DEFAULT_PHOTOGRAPHY,mode:'portrait',timerSeconds:3},candidateStatus:'机位已放稳。用方向键慢慢站位，按住右键微调画面。',viewpoints:[{index:0,label:'人与路',available:true},{index:1,label:'人在风景里',available:true},{index:2,label:'靠近一点',available:true}]}};
const ui=createPresentation(document.querySelector('#ui'),{onAction(){}});ui.render(view);
window.fixture={render(patch){view={...view,...patch,camera:{...view.camera,...patch.camera}};ui.render(view)},destroy(){ui.destroy()}};
`},bundle:true,format:'iife',platform:'browser',write:false,logLevel:'silent'});
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1280,height:600}});
const geometry=[],errors=[];page.on('pageerror',error=>errors.push(error.message));
const overlap=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
try{
  await page.setContent('<!doctype html><meta charset="utf-8"><style>body{margin:0}#background,#ui{position:absolute;inset:0;width:100%;height:100%}#background{object-fit:cover}#ui{pointer-events:none}</style><img id="background" alt="Archived real photograph, component fixture"><div id="ui"></div>');
  await page.locator('#background').evaluate((el,src)=>el.src=src,imageData);
  await page.locator('#background').evaluate(el=>el.decode());
  assert.deepEqual(await page.locator('#background').evaluate(el=>[el.naturalWidth,el.naturalHeight]),[1920,1080]);
  await page.addScriptTag({content:built.outputFiles[0].text});
  await page.locator('[data-action=toggle-forecast]').click();
  for(const viewport of [{width:1280,height:600},{width:1920,height:1080}]){
    await page.setViewportSize(viewport);
    const toggle=await page.locator('[data-action=toggle-forecast]').boundingBox();
    assert(Math.abs(toggle.x+toggle.width/2-viewport.width/2)<1);
    assert.equal(toggle.y,viewport.height===600?82:80);
    const controls=await page.locator('.sy-field-tools').boundingBox();
    const timer=await page.locator('[data-photo-key=timerSeconds][data-value="3"]').boundingBox();
    for(const variant of [
      {name:'saved',patch:{saveStatus:'saved',saveMessage:undefined,camera:{target:undefined,memory:undefined}}},
      {name:'failed',patch:{saveStatus:'failed',saveMessage:'这一程暂时未能保存，请保留页面，稍后再试。'}},
      {name:'failed-old-card',patch:{camera:{target:'forest',referenceVisible:true}}},
      {name:'failed-memory-guide',patch:{camera:{target:undefined,memory:{id:'valley-letter',title:'把山谷放进同一张照片',alignment:0,ready:false,feedback:'让风车与红屋顶同框。'}}}},
    ]){
      await page.evaluate(patch=>window.fixture.render(patch),variant.patch);
      const panel=await page.locator('.sy-forecast-details').boundingBox();assert(panel);
      assert.equal(panel.width,220);assert(Math.abs(panel.x+panel.width-(viewport.width/2-120))<1);
      assert(panel.x>=0&&panel.y>=0&&panel.x+panel.width<=viewport.width&&panel.y+panel.height<=viewport.height);
      assert.deepEqual(await page.locator('.sy-field-tools').boundingBox(),controls);
      assert.deepEqual(await page.locator('[data-photo-key=timerSeconds][data-value="3"]').boundingBox(),timer);
      // Conservative subject bounds observed in OWNER05 and the archived original.
      const ownerSubject={x:viewport.width/2-100,y:viewport.height*.21,width:200,height:viewport.height*.56};
      const scale=Math.max(viewport.width/1920,viewport.height/1080);
      const photoSubject={x:850*scale+(viewport.width-1920*scale)/2,y:350*scale+(viewport.height-1080*scale)/2,width:220*scale,height:430*scale};
      assert(!overlap(panel,ownerSubject));assert(!overlap(panel,photoSubject));
      const compared=[];
      for(const selector of ['#sy-photo-tools','.sy-shutter','.sy-latest-photo','.sy-save','.sy-reference','.sy-reference-toggle']){
        const el=page.locator(selector);if(await el.count()){const box=await el.boundingBox();assert(box&&!overlap(panel,box),variant.name+' overlaps '+selector);compared.push({selector,box})}
      }
      const visible=await page.locator('.sy-forecast-details').evaluate(el=>({height:el.clientHeight,scrollHeight:el.scrollHeight,visibility:getComputedStyle(el).visibility,display:getComputedStyle(el).display}));
      assert.equal(visible.visibility,'visible');assert.notEqual(visible.display,'none');assert(visible.scrollHeight<=visible.height);
      geometry.push({name:variant.name,viewport,panel,toggle,ownerSubject,photoSubject,timer,compared,visible});
      if(variant.name==='saved'||variant.name==='failed-memory-guide')await page.screenshot({path:fileURLToPath(new URL(variant.name+'-'+viewport.width+'x'+viewport.height+'-component-only.png',out)),animations:'disabled'});
    }
  }
  await page.evaluate(()=>window.fixture.destroy());assert.deepEqual(errors,[]);
  const report={scope:'CSS component geometry with an archived 1920x1080 real original; not new game owner evidence',passed:8,checks:['1280x600 and 1920x1080 saved/failed/old-card/memory-guide layouts stay separate from known portrait bounds and left-column UI','top summary center and all photography/timer control geometry unchanged','220px forecast distribution remains readable without clipping'],originalSha256:createHash('sha256').update(original).digest('hex'),geometry,errors};
  await writeFile(new URL('component-check.json',out),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,checks:report.checks,errors}));
}finally{await browser.close()}
