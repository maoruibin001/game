import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createLetterHarness,cameraActive,walking} from './letter-normal-input.mjs';

export default async function run(play){
 const root=fileURLToPath(new URL('../../../production/mountain-arrival/',import.meta.url));
 const h=await createLetterHarness(play,{id:'arrival',viewport:[1920,1080]},{budgetMs:115000},root);
 const page=play.page,errors=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const action=a=>page.locator('[data-action="'+a+'"]').first().click();
 async function select(key,value){
  await action('toggle-photo-tools');
  await page.locator('[data-action="photo-option"][data-photo-key="'+key+'"][data-value="'+value+'"]').click();
  await action('toggle-photo-tools');
 }
 async function original(name){
  const p=await h.photograph(name);
  await h.key('KeyJ');await h.wait(s=>s.state.runtime.screen==='journal');await page.locator('[role="tab"]').nth(2).click();
  await page.locator('[data-action="photo-collection"][data-collection="film"]').click();
  await page.locator('.sy-album [data-id="'+p.id+'"]').click();
  await h.download(name+'-original',()=>action('export-photo'),[1920,1080],{photoId:p.id,bytes:p.original.bytes});
  while((await h.read()).state.runtime.screen==='journal'){await page.locator('button.sy-close:visible').first().click();await h.settle();}
  return p;
 }
 let failure;
 try{
  await h.wait(s=>s.restored&&s.state.runtime.screen==='menu');await h.shot('01-title');
  const spawn=await h.startFresh();assert.equal(spawn.controller.distanceWalked,0);await h.shot('02-first-step');
  await h.key('KeyC');await h.wait(cameraActive);await select('lens','wide');await original('03-first-landscape');
  await select('mode','portrait');await select('pose','letter');
  const portrait=await h.wait(s=>cameraActive(s)&&s.controller.photography.subjectVisible);
  assert.deepEqual(portrait.cameraPropScale,[0,0,0]);const p=await original('04-letter-portrait');assert.equal(p.scene.pose,'letter');
  await select('mode','landscape');await h.lowerCamera();await h.wait(walking);
  await h.cameraAt({feet:[0,-220],target:[-28,20,-195]},'print-yard');
  await select('mode','portrait');await select('lens','detail');await select('pose','wave');
  await h.wait(s=>cameraActive(s)&&s.controller.photography.subjectVisible);
  const profile=await original('05-courier-at-the-market');assert.equal(profile.scene.mode,'portrait');
  await select('mode','landscape');await h.lowerCamera();
  await h.route([[-17.5,-206],[-35,-192]],.55);await h.shot('05-west-road');
  await h.key('Escape');await h.wait(s=>s.state.runtime.screen==='paused'&&s.view.saveStatus==='saved');
  await play.reload();const s=await h.wait(s=>s.restored&&s.state.runtime.screen==='menu');assert.equal(s.state.durable.totalPhotos,3);
  assert.deepEqual(errors,[]);
 }catch(error){failure=error;await h.shot('FAILED').catch(()=>{});throw error;}finally{h.report.browserErrors=errors;await h.finish(failure);}
}
