// Isolated presentation fixture. Does not load the game, GPU, state storage, or engine owner.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from '../../../node_modules/.pnpm/node_modules/esbuild/lib/main.js';
import { chromium } from '../../../node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs';

const game = fileURLToPath(new URL('../../../', import.meta.url));
const toastLayoutOnly = process.argv.includes('--toast-layout');
const outputOverride = process.argv.find(value => value.startsWith('--out-directory='))?.slice('--out-directory='.length);
const out = outputOverride ? new URL(outputOverride.endsWith('/') ? outputOverride : outputOverride + '/', import.meta.url) : new URL(`../../../../production/iteration-clock-outings-20261116/${toastLayoutOnly ? 'toast-layout-component' : 'ui-component'}/`, import.meta.url);
await mkdir(out, { recursive: true });
const built = await build({stdin:{resolveDir:game,loader:'ts',contents:`
import {createPresentation} from './assets/presentation/presentation.ts';
import {initialPresentationView} from './assets/presentation/types.ts';
import {DEFAULT_PHOTOGRAPHY} from './assets/shared/photography-contract.ts';
const make=(slot,spotId,spotTitle,status)=>({slot,slotTitle:{morning:'晨光',afternoon:'午后',sunset:'日落'}[slot],spotId,spotTitle,status,regionLabel:'山谷邮路',windowLabel:{morning:'06:00–09:00',afternoon:'13:00–17:40',sunset:'17:40–18:20'}[slot],nextWindowLabel:{morning:'次日 06:00–09:00',afternoon:'次日 13:00–17:40',sunset:'今日 17:40–18:20'}[slot],weatherProbability:68,weatherLabel:'晴朗 / 多云',distanceMeters:124,etaSeconds:38,arrivalLabel:'第 1 天 17:09',canArriveInWindow:true,preparation:'先看一眼光从哪边来。',facingHint:'面向西南',compositionHint:'让风车与远山一起留在画面里。',mapTarget:{x:.58,y:.245},routePoints:[{x:.5,y:.75},{x:.6,y:.5},{x:.58,y:.245}]});
const slots=[make('morning','post-light','邮局廊下','missed'),make('afternoon','forest-frame','林间风铃','active'),make('sunset','ridge-mail-road','山脊西南邮路','upcoming')];
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC9sAAAAASUVORK5CYII=';
let view={...initialPresentationView(),screen:'play',areaName:'山口邮局',objective:'去看看旧卡里的风来林地',objectiveDetail:'沿西侧林间邮路寻找风铃与风车。',saveStatus:'saved',
dayClock:{day:1,minute:1020,timeLabel:'17:00',sunsetLabel:'日落观赏 17:40–18:20 · 还有 40 山谷分钟'},creativeMode:false,movement:{running:false,grounded:true},
outings:{day:1,slots,currentSpotId:'forest-frame',nextSpotId:'ridge-mail-road'},
restPoint:{id:'post',title:'邮局廊下',available:true,requestOpen:0,targets:[{target:'morning',label:'等晨光',arrivalLabel:'次日 06:20',weatherSummary:'晴朗约 45%，细雨约 30%'},{target:'golden',label:'等金色光线',arrivalLabel:'次日 16:40'},{target:'sunset',label:'等日落',arrivalLabel:'今日 17:40'}]},
weather:{id:'morning',label:'晴朗',options:[{id:'morning',label:'晴朗'},{id:'rain',label:'细雨'},{id:'afterglow',label:'多云'}],forecast:{observedAtSeconds:200,changeInSeconds:250,probabilities:{morning:45,rain:30,afterglow:25}}},
camera:{active:false,alignment:0,ready:false,photography:{...DEFAULT_PHOTOGRAPHY,mode:'portrait'},viewpoints:[{index:0,label:'人与路',available:true},{index:1,label:'人在风景里',available:true},{index:2,label:'靠近一点',available:true}]}};
const actions=[],modals=[];let focusRequests=0;
const render=patch=>{view={...view,...patch,camera:{...view.camera,...patch.camera}};ui.render(view)};
const ui=createPresentation(document.querySelector('#ui'),{onAction(action,payload){actions.push({action,payload});
 if(action==='set-creative-mode')render({creativeMode:payload.enabled});
 if(action==='track-photo-spot')render({outings:{...view.outings,tracked:slots.find(s=>s.spotId===payload.spotId)}});
 if(action==='open-map')render({screen:'map'});if(action==='close-panel')render({screen:'play'});
 if(action==='open-journal')render({screen:'journal'});
 if(action==='set-time')render({dayClock:{...view.dayClock,minute:payload.minute}});
},onModalChange(open){modals.push(open)},onReturnToGame(){focusRequests++},onRequestGameFocus(){focusRequests++}});
render({});
window.fixture={actions,modals,render,get view(){return view},get focusRequests(){return focusRequests},complete(){const photo={id:'daily-1',title:'今日林间风铃',location:'风来林地',imageUrl:image,originalKey:'fixture:daily-photo',width:1920,height:1080};slots[1]={...slots[1],status:'completed',photo};render({outings:{...view.outings,slots}})},destroy(){ui.destroy()}};
`},bundle:true,format:'iife',platform:'browser',write:false,logLevel:'silent'});
const browser = await chromium.launch({headless:true});
const page = await browser.newPage();
const results=[],errors=[];
page.on('pageerror',error=>errors.push(error.message));
const box=async(selector)=>{const r=await page.locator(selector).boundingBox();assert(r,selector);return r};
const overlap=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
try {
 for (const viewport of [{width:1280,height:600},{width:1280,height:720},{width:1920,height:1080}]) {
  await page.setViewportSize(viewport);
  await page.setContent('<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#829581}#ui{position:absolute;inset:0;pointer-events:none}</style><div id="ui"></div>');
  await page.addScriptTag({content:built.outputFiles[0].text});
  assert.match(await page.locator('.sy-field-clock').textContent(),/山谷第 1 天.*17:00/);
  assert.match(await page.locator('.sy-field-clock').textContent(),/17:40–18:20/);
  assert.equal(await page.locator('[data-action=toggle-weather]').count(),0);
  assert.equal(await page.locator('[data-action=set-weather]').count(),0);
  assert.match(await page.locator('.sy-controls').textContent(),/Shift.*跑.*Space.*跳/);
  const clock=await box('.sy-field-clock');
  const interactionGeometry={clockButton:await box('[data-action=open-outings]'),restEntry:await box('[data-action=open-rest]')};
  for(const selector of ['.sy-place','.sy-top-actions','.sy-forecast','.sy-field-tools']){const other=await box(selector);assert(!overlap(clock,other),'clock overlaps '+selector+JSON.stringify({clock,other}))};
  if(toastLayoutOnly){
   const checkToast=async(selectors)=>{
    const toast=await box('.sy-toast');assert(toast.x>=0&&toast.y>=0&&toast.x+toast.width<=viewport.width&&toast.y+toast.height<=viewport.height,'toast leaves viewport');
    for(const selector of selectors){const other=await box(selector);assert(!overlap(toast,other),'toast overlaps '+selector+JSON.stringify({toast,other}));}
    return toast;
   };
   await page.evaluate(()=>window.fixture.render({weather:{...window.fixture.view.weather,id:'afterglow',label:'多云',transitioning:true},
    outings:{...window.fixture.view.outings,tracked:window.fixture.view.outings.slots[2]},
    interaction:{label:'坐一会儿，等下一阵光',detail:'小憩推进山谷时间，天气仍按概率变化。'},
    hint:'小憩后，山谷来到第 2 天 · 06:20，多云。天色依然有它自己的变化。',
    film:[{id:'daily-1',title:'今日廊下的风景',location:'山口邮局'}],
    toast:{id:'rest-toast',kind:'success',title:'歇一会儿，继续出发',message:'小憩后，山谷来到第 2 天 · 06:20，多云。天色依然有它自己的变化。'}}));
   await page.locator('[data-action=toggle-forecast]').click();
   await page.screenshot({path:fileURLToPath(new URL(`rest-toast-${viewport.width}x${viewport.height}-component-only.png`,out)),animations:'disabled'});
   const walkingToast=await checkToast(['.sy-field-tools','.sy-weather-observed','.sy-film-open','.sy-weather-transition','.sy-outing-follow','.sy-forecast-details','.sy-field-clock','.sy-place','.sy-rest-entry','.sy-hint','.sy-objective','.sy-controls','.sy-interaction','.sy-save']);
   await page.locator('[data-action=open-outings]').click();
   assert.equal(await page.locator('.sy-toast').isVisible(),false,'modal must not be covered by a preceding toast');
   assert.match(await page.locator('[data-outing-slot=morning] .sy-outing-next-window').textContent(),/下次适拍：次日 06:00–09:00/);
   await page.evaluate(()=>window.fixture.complete());
   assert.match(await page.locator('[data-outing-status=completed] .sy-outing-next-window').textContent(),/下次适拍：次日 13:00–17:40/);
   await page.screenshot({path:fileURLToPath(new URL(`next-window-${viewport.width}x${viewport.height}-component-only.png`,out)),animations:'disabled'});
   await page.keyboard.press('Escape');
   await page.evaluate(()=>window.fixture.render({screen:'play',camera:{active:true,target:'forest'},toast:{id:'camera-toast',kind:'success',title:'歇一会儿，继续出发',message:'小憩后，山谷来到第 2 天 · 06:20，多云。天色依然有它自己的变化。'}}));
   await page.locator('[data-action=toggle-photo-tools]').click();
   await page.screenshot({path:fileURLToPath(new URL(`camera-toast-${viewport.width}x${viewport.height}-component-only.png`,out)),animations:'disabled'});
   const cameraToast=await checkToast(['.sy-camera-header','.sy-field-tools','#sy-photo-tools','.sy-field-clock','.sy-frame-note','.sy-shutter','.sy-latest-photo','.sy-save','.sy-focus','.sy-camera-feedback']);
   if(await page.locator('.sy-reference').count())assert(!overlap(cameraToast,await box('.sy-reference')),'toast overlaps reference');
   results.push({viewport,walkingToast,cameraToast,passed:['weather/film/forecast/tracking/rest toast occupy distinct bounds','camera toast avoids latest photo, save status, expanded tools, center focus and reference card','modal hides preceding toast','missed and completed slots expose supplied next window']});
   await page.evaluate(()=>window.fixture.destroy());continue;
  }
  await page.locator('[data-action=open-outings]').focus();
  await page.evaluate(()=>window.fixture.render({dayClock:{...window.fixture.view.dayClock,minute:1020.25}}));
  assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('data-action')),'open-outings');
  await page.evaluate(()=>window.fixture.render({movement:{running:true,grounded:false}}));
  assert.match(await page.locator('.sy-controls').textContent(),/正在跑.*腾空中/);
  await page.screenshot({path:fileURLToPath(new URL(`walking-${viewport.width}x${viewport.height}-component-only.png`,out)),animations:'disabled'});
  await page.locator('[data-action=open-outings]').click();
  assert.equal(await page.locator('.sy-outing-card').count(),3);
  interactionGeometry.initialFollowButtons=await Promise.all((await page.locator('.sy-outing-card [data-action=track-photo-spot]').all()).map(el=>el.boundingBox()));
  assert.match(await page.locator('.sy-outing-intro').textContent(),/此刻适合：林间风铃/);
  assert.match(await page.locator('.sy-outing-card').nth(1).textContent(),/68%.*38 秒.*17:09.*面向西南/s);
  assert.match(await page.locator('.sy-outing-footer').textContent(),/山体可能提前遮挡/);
  await page.screenshot({path:fileURLToPath(new URL(`schedule-${viewport.width}x${viewport.height}-component-only.png`,out)),animations:'disabled'});
  await page.locator('[data-action=track-photo-spot][data-spot=ridge-mail-road]').click();
  assert.equal((await page.evaluate(()=>window.fixture.actions)).at(-1).payload.spotId,'ridge-mail-road');
  await page.locator('.sy-outing-tracked [data-action=open-map]').click();
  assert.equal(await page.locator('[aria-label="山谷地图"]').count(),1);
  assert.equal(await page.locator('.sy-map-outing polyline').getAttribute('points'),'360,375 432,250 417.59999999999997,122.5');
  const target=await page.locator('.sy-map-outing circle').first().evaluate(el=>({x:Number(el.getAttribute('cx')),y:Number(el.getAttribute('cy'))}));
  assert(Math.abs(target.x-417.6)<.001);assert.equal(target.y,122.5);
  await page.screenshot({path:fileURLToPath(new URL(`route-${viewport.width}x${viewport.height}-component-only.png`,out)),animations:'disabled'});
  await page.keyboard.press('m');assert.equal(await page.locator('[aria-label="山谷地图"]').count(),0);
  await page.locator('[data-action=open-rest]').click();
  assert.match(await page.locator('[aria-label="歇脚候时"]').textContent(),/不保证等来晴天/);
  assert.match(await page.locator('[data-target=morning]').textContent(),/次日 06:20/);
  interactionGeometry.restTargets=await Promise.all((await page.locator('[data-action=rest-until]').all()).map(el=>el.boundingBox()));
  await page.screenshot({path:fileURLToPath(new URL(`rest-${viewport.width}x${viewport.height}-component-only.png`,out)),animations:'disabled'});
  await page.locator('[data-target=sunset]').click();
  assert.deepEqual((await page.evaluate(()=>window.fixture.actions)).at(-1),{action:'rest-until',payload:{target:'sunset'}});
  assert.equal(await page.locator('[role=dialog]').count(),0);
  await page.evaluate(()=>window.fixture.render({restPoint:{...window.fixture.view.restPoint,requestOpen:1}}));
  assert.equal(await page.locator('[aria-label="歇脚候时"]').count(),1);
  await page.keyboard.press('Escape');
  await page.evaluate(()=>window.fixture.render({restPoint:{...window.fixture.view.restPoint,requestOpen:1}}));
  assert.equal(await page.locator('[role=dialog]').count(),0);
  await page.locator('[data-action=open-outings]').click();
  await page.locator('[data-action=set-creative-mode]').click();
  assert.match(await page.locator('.sy-outing-intro').textContent(),/日程打卡暂停/);
  await page.locator('[data-creative-time]').fill('18:10');
  await page.locator('[data-creative-time]').press('Tab');
  assert((await page.evaluate(()=>window.fixture.actions)).some(a=>a.action==='set-time'&&a.payload.minute===1090));
  await page.locator('.sy-creative-controls [data-weather=rain]').click();
  assert.deepEqual((await page.evaluate(()=>window.fixture.actions)).at(-1),{action:'set-weather',payload:{id:'rain'}});
  await page.locator('[data-action=set-creative-mode]').click();
  assert.equal(await page.locator('[data-creative-time]').count(),0);
  await page.evaluate(()=>window.fixture.complete());
  await page.locator('[data-action=view-outing-photo]').click();
  assert.equal(await page.locator('.sy-large-photo-image img').count(),1);
  assert.equal(await page.locator('[data-action=export-photo]').getAttribute('data-id'),'daily-1');
  await page.keyboard.press('Escape');await page.keyboard.press('Escape');await page.keyboard.press('Escape');
  await page.evaluate(()=>window.fixture.render({screen:'play',camera:{active:true}}));
  assert.equal(await page.locator('#sy-photo-tools').count(),0);
  assert.match(await page.locator('.sy-shutter-hint').textContent(),/SPACE/);
  assert.equal(await page.locator('.sy-forecast').isVisible(),false);
  const cameraClock=await box('.sy-field-clock');
  for(const selector of ['.sy-camera-header','.sy-frame-note','.sy-field-tools','.sy-shutter'])assert(!overlap(cameraClock,await box(selector)),'camera clock overlaps '+selector);
  await page.locator('[data-action=toggle-photo-tools]').click();assert.equal(await page.locator('#sy-photo-tools').count(),1);
  const save=await box('.sy-save');assert(!overlap(save,await box('#sy-photo-tools')));
  await page.screenshot({path:fileURLToPath(new URL(`camera-${viewport.width}x${viewport.height}-component-only.png`,out)),animations:'disabled'});
  results.push({viewport,clock,cameraClock,interactionGeometry,mapTarget:target,passed:['clock/sunset and main weather read-only','run/jump DTO labels','three slots/current recommendation/probability/ETA','tracking semantic action and actual normalized map route','M closes map','rest target and no-clear-weather-promise','rest E pulse opens once','explicit creative time/weather and no-check-in notice','retained daily photo can be viewed/exported','photography controls collapsed by default and Space still shutter']});
  await page.evaluate(()=>window.fixture.destroy());
 }
 assert.deepEqual(errors,[]);
 const result={scope:'Isolated DOM/CSS and semantic action component fixture; not native gameplay or check-in acceptance',passed:true,results,errors};
 await writeFile(new URL('RESULT.json',out),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close()}
