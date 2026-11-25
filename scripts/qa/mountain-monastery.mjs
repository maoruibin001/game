import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createLetterHarness,cameraActive,walking} from './letter-normal-input.mjs';
import {P0_ROUTE} from './p0-route-plan.mjs';
export default async function run(play){return recordMountainWalk(play,false);}
export async function recordMountainWalk(play,evening){
 const root=fileURLToPath(new URL('../../../production/mountain-arrival/',import.meta.url));
 const h=await createLetterHarness(play,{id:evening?'evening':'monastery',viewport:[1920,1080]},{budgetMs:250000},root);
 const page=play.page,errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const click=a=>page.locator('[data-action="'+a+'"]').first().click();
 async function plate(name,feet,target,lens='wide'){
  await h.cameraAt({feet,target},name);
  await click('toggle-photo-tools');await page.locator('[data-photo-key="lens"][data-value="'+lens+'"]').click();await click('toggle-photo-tools');
  const p=await h.photograph(name);
  await h.key('KeyJ');await h.wait(s=>s.state.runtime.screen==='journal');await page.locator('[role="tab"]').nth(2).click();
  await page.locator('[data-action="photo-collection"][data-collection="film"]').click();
  await page.locator('.sy-album [data-id="'+p.id+'"]').click();
  await h.download(name+'-original',()=>click('export-photo'),[1920,1080],{photoId:p.id,bytes:p.original.bytes});
  while((await h.read()).state.runtime.screen==='journal'){await page.locator('button.sy-close:visible').first().click();await h.settle();}
  if(cameraActive(await h.read()))await h.lowerCamera();await h.wait(walking);
 }
 let failure;
 try{
  await h.startFresh();await h.route(P0_ROUTE.town.slice(0,-1));await h.route(P0_ROUTE.lever,.35);await h.key('KeyE');await h.wait(s=>s.state.durable.gateOpened);
  await h.route([[148,-2],[155,-3]],.35);await h.cameraAt({feet:[155,-3],target:[155,29,10]},'town');
  await h.photograph('bridge',{matchedCard:'town'});await h.lowerCamera();
  await h.route([[155,7],[155,20],[155,28],[155,37]],.65);
  if(evening){
   await click('open-outings');
   if(!(await h.read()).state.durable.creativeMode)await click('set-creative-mode');
   await page.locator('[data-creative-time]').fill('17:08');
   await page.locator('[data-action="set-weather"][data-weather="afterglow"]').click();
   await page.locator('button.sy-close:visible').click();
   await h.wait(s=>walking(s)&&s.environment.weather==='afterglow'&&s.environment.settled);
   await plate('golden-bell-gate',[155.1,36.15],[162.1,28.7,52.1],'standard');
  }else await plate('01-bell-and-hillside',[155.4,38],[160.8,30.0,54]);
  await h.route([[155.6,45],[155.95,50.0],[155.95,54.8],[156.45,56.2],[156.45,58.6],[158,61],[158,65.5]],.22);
  if(evening)await plate('tower-and-eaves',[158,66],[175.8,44.2,93],'standard');
  else await plate('02-up-the-mountain',[158,66],[165,40.8,97]);
  await h.route([[158,76.5],[158,81],[158,91.5],[158,93.25]],.28);
  if(evening)await plate('valley-from-the-porch',[158,93.25],[152,26.5,55],'standard');
  else await plate('03-return-view',[158,93.25],[157,25.8,58.2]);
  // Walk down the straight flight continuously. Sample normal input progress rather than issuing
  // short, repeatedly re-aimed pulses that can overshoot an intermediate stair landing.
  await h.turnTo(0,.13);await page.keyboard.down('KeyW');
  try{await h.wait(s=>walking(s)&&s.controller.position[2]<66.4,16000);}finally{await page.keyboard.up('KeyW');}
  const bottom=await h.wait(walking);h.record('both-flights-descended',bottom);
  assert.ok(Math.abs(bottom.controller.position[0]-158)<1.30&&bottom.controller.position[1]<25);
  await h.route([[157,60],[156.45,58.6],[156.45,56.2]],.32);
  await h.key('Escape');await h.wait(s=>s.state.runtime.screen==='paused'&&s.view.saveStatus==='saved');await play.reload();
  const s=await h.wait(s=>s.restored&&s.state.runtime.screen==='menu');assert.equal(s.state.durable.totalPhotos,4);assert.deepEqual(errors,[]);
 }catch(e){failure=e;await h.shot('FAILED').catch(()=>{});throw e;}finally{h.report.browserErrors=errors;await h.finish(failure);}
}
