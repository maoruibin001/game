import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createLetterHarness,walking,cameraActive} from './letter-normal-input.mjs';
import {walkStairFlight} from './courtyard-stair-walk.mjs';
import {P0_ROUTE} from './p0-route-plan.mjs';

export default async function upperValley(play){return photographValley(play,true);}
export async function photographValley(play,withZoom,sunbreak=false){
 const root=fileURLToPath(new URL('../../../production/upper-valley/',import.meta.url));
 const h=await createLetterHarness(play,{id:sunbreak?'clear-evening':withZoom?'after':'before',viewport:[1920,1080]},{budgetMs:270000},root);
 const page=play.page,errors=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const click=a=>page.locator('[data-action="'+a+'"]').first().click();
 async function light(time,weather){
  if(cameraActive(await h.read()))await h.lowerCamera();
  await click('open-outings');if(!(await h.read()).state.durable.creativeMode)await click('set-creative-mode');
  await page.locator('[data-creative-time]').fill(time);
  await page.locator('[data-action="set-weather"][data-weather="'+weather+'"]').click();
  await page.locator('button.sy-close:visible').click();
  await h.wait(s=>walking(s)&&s.environment.weather===weather&&s.environment.settled);
 }
 const feet=[158,93.25];
 async function frame(target,name){
  await h.cameraAt({feet,target},name);
  await click('toggle-photo-tools');await page.locator('[data-photo-key="lens"][data-value="standard"]').click();await click('toggle-photo-tools');
 }
 async function exportFrame(name,options){
  const p=await h.photograph(name,options);
  await h.key('KeyJ');await h.wait(s=>s.state.runtime.screen==='journal');await page.locator('[role="tab"]').nth(2).click();
  await page.locator('[data-action="photo-collection"][data-collection="film"]').click();
  await page.locator('.sy-album [data-id="'+p.id+'"]').click();
  await h.download(name+'-original',()=>click('export-photo'),[1920,1080],{photoId:p.id,bytes:p.original.bytes});
  while((await h.read()).state.runtime.screen==='journal'){await page.locator('button.sy-close:visible').first().click();await h.settle();}
  return p;
 }
 let failure;
 try{
  await h.startFresh();await h.route(P0_ROUTE.town.slice(0,-1));await h.route(P0_ROUTE.lever,.35);
  await h.key('KeyE');await h.wait(s=>s.state.durable.gateOpened);
  await h.route([[148,-2],[155,-3]],.35);await h.cameraAt({feet:[155,-3],target:[155,29,10]},'town');
  await h.photograph('bridge',{matchedCard:'town'});await h.lowerCamera();
  await h.wait(s=>walking(s)&&s.state.runtime.bridgeProgress===1&&s.world.bridgeWalkable,12000);
  await h.route([[155,7],[155,20],[155,28],[155,37],[155.6,45],[155.95,50],[155.95,54.8],[156.45,56.2],[156.45,58.6],[158,61],[158,65.5]],.27);
  if(withZoom)await walkStairFlight(h,play,'ascending',Math.PI,z=>z>=92.8);
  else await h.route([[158,76.5],[158,81],[158,91.5],[158,93.25]],.22);
  if(sunbreak){
   // The south-western sun grazes the saddle before the civil sunset; use the public clock.
   for(const [time,name] of [['17:35','sunlit-ridges'],['17:46','last-light']]){
    await light(time,'morning');await frame([119,31.5,-34],name+'-composition');await exportFrame(name);
   }
  }else{
   await light('15:40','morning');await frame([152,26.5,55],'return-composition');
   await exportFrame('same-view');
  }
  if(withZoom){
   await light('17:50','afterglow');await frame([139,30,-32],'evening-composition');
   await exportFrame('sunset');
   const zoom=page.locator('[data-photo-zoom]');
   for(let i=0;i<40&&!(await zoom.evaluate(el=>el===document.activeElement));i++)await page.keyboard.press('Tab');
   assert.equal(await zoom.evaluate(el=>el===document.activeElement),true,'tab reaches the viewfinder zoom');
   await zoom.press('Home');await zoom.press('ArrowRight');await zoom.press('End');
   await h.wait(s=>Math.abs(s.controller.camera.verticalFovRadians-2*Math.atan(Math.tan(Math.PI/6)/10))<.001);
   await h.shot('zoom-ten');
   await zoom.press('Home');for(let i=0;i<10;i++)await zoom.press('ArrowRight');
   await h.wait(s=>Math.abs(s.controller.camera.verticalFovRadians-2*Math.atan(Math.tan(Math.PI/6)/2))<.001);
   await h.shot('zoom-two');const detail=await exportFrame('zoom-two',{shutterButton:page.locator('.sy-shutter')});
   assert.ok(Math.abs(detail.scene.camera.verticalFovRadians-2*Math.atan(Math.tan(Math.PI/6)/2))<.001);
  }
  if(cameraActive(await h.read()))await h.lowerCamera();
  if(withZoom)await walkStairFlight(h,play,'descending',0,z=>z<66.4);
  await h.key('Escape');await h.wait(s=>s.state.runtime.screen==='paused'&&s.view.saveStatus==='saved');await play.reload();
  const restored=await h.wait(s=>s.restored&&s.state.runtime.screen==='menu');
  assert.equal(restored.state.durable.totalPhotos,sunbreak?3:withZoom?4:2);
  if(withZoom)assert.equal(restored.state.durable.photography.zoom,2);
  assert.deepEqual(errors,[]);
 }catch(e){failure=e;await h.shot('FAILED').catch(()=>{});throw e;}
 finally{h.report.browserErrors=errors;await h.finish(failure);}
}
