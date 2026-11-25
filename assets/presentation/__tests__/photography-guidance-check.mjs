// Standalone DOM + actual controller DTO check; no game owner, renderer or GPU.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build} from '../../../node_modules/.pnpm/node_modules/esbuild/lib/main.js';
import {chromium} from '../../../node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs';
const game=fileURLToPath(new URL('../../../',import.meta.url));
const out=new URL('../../../../production/iteration-photo-guidance-20261117/component/',import.meta.url);await mkdir(out,{recursive:true});
const built=await build({stdin:{resolveDir:game,loader:'ts',contents:`
import {createPresentation} from './assets/presentation/presentation.ts';
import {initialPresentationView} from './assets/presentation/types.ts';
import {DEFAULT_PHOTOGRAPHY} from './assets/shared/photography-contract.ts';
import {createTravelController} from './assets/controller/travel-controller.ts';
import {EMPTY_INPUT} from './assets/controller/types.ts';
const root=document.querySelector('#ui'),canvas=document.querySelector('canvas'),events=[];
const c=createTravelController({spawn:[0,0,0],terrainHeight:()=>0});c.toggleCamera();
let view={...initialPresentationView(),screen:'play',camera:{active:true,alignment:0,ready:false,feedback:'喜欢的风景都可以拍。',captureState:'idle',countdownSeconds:null}};
const ui=createPresentation(root,{onAction(action,payload){events.push({action,payload});if(action==='set-photography'){c.configurePhotography({...c.snapshot().photography.settings,...payload});sync();}if(action==='cancel-countdown')patch({camera:{countdownSeconds:null}});},onReturnToGame:()=>canvas.focus(),onRequestGameFocus:()=>canvas.focus()});
function patch(p){view={...view,...p,camera:{...view.camera,...p.camera}};ui.render(view)}
function sync(){const p=c.snapshot().photography;patch({camera:{photography:p.settings,candidateStatus:p.candidateStatus,viewpoints:p.candidates.map(x=>({...x,label:['人与路','人在风景里','靠近一点'][x.index]}))}});
}
sync();canvas.focus();
window.fixture={events,patch,sync,get view(){return view},setPhotography(p){c.configurePhotography({...c.snapshot().photography.settings,...p});sync()},leaveFrame(){c.submitInput({...EMPTY_INPUT,horizontal:1});for(let i=0;i<600;i++){c.step(1/60);c.updateCamera(1/60)}c.submitInput({...EMPTY_INPUT});sync()},snapshot:()=>c.snapshot(),destroy:()=>ui.destroy()};
`},bundle:true,format:'iife',platform:'browser',write:false,logLevel:'silent'});
const browser=await chromium.launch({headless:true,args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1280,height:720}}),checks=[],errors=[],layouts=[];
page.on('pageerror',error=>errors.push(error.message));
const patch=p=>page.evaluate(p=>window.fixture.patch(p),p);
const set=p=>page.evaluate(p=>window.fixture.setPhotography(p),p);
const events=()=>page.evaluate(()=>window.fixture.events);
const overlap=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
try{
 await page.setContent('<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#668477}canvas,#ui{position:absolute;inset:0;width:100%;height:100%}#ui{pointer-events:none}</style><canvas id="game-canvas" tabindex="0"></canvas><div id="ui"></div>');
 await page.addScriptTag({content:built.outputFiles[0].text});
 assert.equal(await page.locator('#sy-photo-tools').count(),0);
 const help=page.locator('.sy-photo-guidance');assert(await help.isVisible());
 for(const text of ['拖动鼠标 / ← →','看方向','W A S D','慢走取景','快门按钮 / 空格','3 秒定时'])assert((await help.textContent()).includes(text));
 assert.equal(await page.locator('.sy-shutter').isDisabled(),false);
 await page.locator('.sy-shutter').click();assert.equal((await events()).at(-1).action,'shutter');
 checks.push('Collapsed tools retain all ordinary camera instructions; unmatched free landscape shutter remains enabled.');
 await page.locator('.sy-photo-quick-timer').click();
 assert.deepEqual((await events()).at(-1),{action:'set-photography',payload:{timerSeconds:3}});
 assert.equal(await page.locator('.sy-photo-quick-timer').getAttribute('aria-pressed'),'true');
 assert.equal(await page.evaluate(()=>document.activeElement.id),'game-canvas');
 assert.match(await page.locator('.sy-shutter').getAttribute('aria-label'),/开始 3 秒/);
 await page.locator('.sy-photo-quick-timer').click();assert.equal((await events()).at(-1).payload.timerSeconds,0);
 checks.push('Visible timer uses the existing typed setting, toggles both ways, and pointer activation restores canvas focus.');
 await set({mode:'portrait'});assert.equal(await page.locator('.sy-shutter').isDisabled(),false);
 assert.match(await page.locator('.sy-camera-feedback').textContent(),/代拍机位就绪.*完整入镜/);
 assert.match(await help.textContent(),/慢走调整人物/);
 await page.evaluate(()=>window.fixture.leaveFrame());
 const s=await page.evaluate(()=>window.fixture.snapshot());assert.equal(s.photography.candidateAvailable&&s.photography.subjectVisible,false);
 assert.equal(await page.locator('.sy-shutter').isDisabled(),true);
 assert((await page.locator('.sy-camera-feedback').textContent()).includes(s.photography.candidateStatus));
 const before=(await events()).length;await page.locator('.sy-shutter').evaluate(el=>el.click());assert.equal((await events()).length,before);
 await patch({camera:{ready:true,alignment:1,feedback:'旧卡构图100%'}});assert.equal(await page.locator('.sy-shutter').isDisabled(),true);
 assert(!(await page.locator('.sy-camera-feedback').textContent()).includes('100%'));
 checks.push('Current real controller failure stays visible outside the panel and disables immediate portrait regardless of quest score.');
 await page.locator('.sy-photo-quick-timer').click();assert.equal(await page.locator('.sy-shutter').isDisabled(),false);
 assert.match(await page.locator('.sy-camera-feedback').textContent(),/结束时须完整入镜/);
 await page.locator('.sy-shutter').click();assert.equal((await events()).at(-1).action,'shutter');
 await patch({camera:{countdownSeconds:3}});const shutter=await page.locator('.sy-shutter').elementHandle();
 assert(await page.locator('.sy-shutter').isDisabled());assert(await page.locator('.sy-photo-quick-timer').isDisabled());
 await patch({camera:{countdownSeconds:2}});assert(await shutter.evaluate(el=>el===document.querySelector('.sy-shutter')));
 await page.locator('[data-action=cancel-countdown]').click();assert.equal((await events()).at(-1).action,'cancel-countdown');
 assert.equal(await page.locator('.sy-shutter').isDisabled(),false);
 await set({viewpoint:1,timerSeconds:0});assert.equal(await page.locator('.sy-shutter').isDisabled(),false);
 for(const pose of ['wave','letter','look']){await set({pose});assert.equal(await page.locator('.sy-shutter').isDisabled(),false);}
 for(const state of ['capturing','saving']){await patch({camera:{captureState:state}});assert(await page.locator('.sy-shutter').isDisabled());assert(await page.locator('.sy-photo-quick-timer').isDisabled());}
 await patch({camera:{captureState:'idle'}});assert.equal(await page.locator('.sy-shutter').isDisabled(),false);
 checks.push('Invalid current portrait can start three-second positioning; countdown/capture/save block duplicate exposure; cancellation, new placement and all poses refresh without stale disabled state.');
 for(const viewport of [{width:1280,height:600},{width:1280,height:720},{width:1920,height:1080}]){
  await page.setViewportSize(viewport);
  for(const mode of ['landscape','portrait']){
   await set({mode});await patch({camera:{target:'forest',referenceVisible:true,ready:false,alignment:0,feedback:'慢慢看，喜欢的风景都值得留下。'}});
   const selectors=['.sy-photo-guidance','.sy-shutter','.sy-camera-feedback','.sy-field-tools','.sy-reference'];
   const boxes={};for(const selector of selectors){const b=await page.locator(selector).boundingBox();assert(b);assert(b.x>=0&&b.y>=0&&b.x+b.width<=viewport.width+1&&b.y+b.height<=viewport.height+1,selector+' outside viewport');boxes[selector]=b;}
   for(const a of ['.sy-photo-guidance','.sy-camera-feedback'])for(const b of selectors.filter(x=>x!==a))assert(!overlap(boxes[a],boxes[b]),a+' overlaps '+b);
   // Guidance is restricted to the lower border, outside the central subject area.
   assert(boxes['.sy-photo-guidance'].y>viewport.height*.88);
   layouts.push({viewport,mode,boxes});
   await page.screenshot({animations:'disabled',path:fileURLToPath(new URL(`${mode}-${viewport.width}x${viewport.height}-component.png`,out))});
  }
 }
 checks.push('1280x600, 1280x720 and 1920x1080: help, shutter and status do not overlap each other, tools or reference; help stays below 88% height.');
 assert.deepEqual(errors,[]);
 await writeFile(new URL('RESULT.json',out),JSON.stringify({scope:'Standalone UI CSS and pure real controller DTO only. No Engine renderer, GPU or game acceptance.',passed:true,checks,layouts,errors},null,2));
 console.log(JSON.stringify({passed:true,checks:checks.length,out:fileURLToPath(out)}));
}finally{await page.evaluate(()=>window.fixture?.destroy()).catch(()=>{});await browser.close();}
