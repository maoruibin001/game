import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createLetterHarness, walking, cameraActive} from './letter-normal-input.mjs';
import {P0_ROUTE} from './p0-route-plan.mjs';

export default async function uphillShoulder(play) {
  const root=fileURLToPath(new URL('../../../production/ridge-road-shoulder/',import.meta.url));
  const h=await createLetterHarness(play,{id:'uphill',viewport:[1920,1080]},{budgetMs:360000},root);
  const click=id=>play.page.locator('[data-action="'+id+'"]').first().click({timeout:5000});
  const errors=[];
  play.page.on('pageerror',e=>errors.push(String(e)));
  play.page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const yaw=Math.atan2(-62,-26);
  async function fixLight(time) {
    await click('open-outings');
    if(!(await h.read()).state.durable.creativeMode)await click('set-creative-mode');
    await play.page.locator('[data-creative-time]').fill(time);
    await play.page.locator('[data-action="set-weather"][data-weather="morning"]').click();
    await play.page.locator('button.sy-close:visible').click();
    await h.wait(s=>walking(s)&&s.state.durable.creativeMode&&s.environment.settled);
  }
  async function exportFrame(photo,name){
    await h.key('KeyJ');await h.wait(s=>s.state.runtime.screen==='journal');
    await play.page.locator('[role="tab"]').nth(2).click();
    await play.page.locator('[data-action="photo-collection"][data-collection="film"]').click();
    await play.page.locator('.sy-album [data-id="'+photo.id+'"]').click();
    await h.download(name,()=>click('export-photo'),[1920,1080],{photoId:photo.id,bytes:photo.original.bytes});
    while((await h.read()).state.runtime.screen==='journal'){
      await play.page.locator('button.sy-close:visible').first().click();await h.settle();
    }
  }
  async function setLens(lens){
    await click('toggle-photo-tools');
    await play.page.locator('[data-action="photo-option"][data-photo-key="lens"][data-value="'+lens+'"]').click();
    await click('toggle-photo-tools');
    await h.wait(s=>cameraActive(s)&&s.state.durable.photography.lens===lens);
  }
  let failure;
  try {
    await h.startFresh();
    await h.route(P0_ROUTE.town.slice(0,-1));await h.route(P0_ROUTE.lever,.35);
    await h.key('KeyE'); await h.wait(s=>s.state.durable.gateOpened);
    await h.route([[148,-2],[155,-3]],.35);
    await h.cameraAt({feet:[155,-3],target:[155,29,10]},'town');
    await h.photograph('bridge-unlocked',{matchedCard:'town'});await h.lowerCamera();
    await h.route([[155,7],[155,20],[194,59],[216,109],[171,135],[126,178]]);
    await h.walkTo([87.25,194.25],.16);await fixLight('15:30');
    await h.turnTo(yaw,-.085);await play.wait(800);await h.shot('afternoon-road');
    await fixLight('08:00');await h.turnTo(yaw,-.085);await play.wait(800);await h.shot('morning-road');
    // Use the actual shoulder and come back across the pavement before ascending to the post.
    await h.walkTo([84,190.9],.5);await h.turnTo(yaw,-.05);await h.shot('grass-verge');
    await h.walkTo([82.5,196.25],.5);await h.walkTo([73,203.5],.55);
    await h.walkTo([64,204],.3);await h.turnTo(yaw,-.04);await h.shot('reached-turn');
    await fixLight('17:55');
    await h.cameraAt({feet:[64,204],target:[6,87,136]},'evening-lookout');
    const photo=await h.photograph('evening-shutter');
    await exportFrame(photo,'evening-original');
    if(walking(await h.read()))await h.key('KeyC');
    await h.wait(cameraActive);
    await setLens('standard');
    const detail=await h.photograph('evening-standard');
    await exportFrame(detail,'evening-standard-original');
    if(walking(await h.read()))await h.key('KeyC');
    await h.wait(cameraActive);
    await setLens('tele');
    await h.turnTo(Math.atan2(-.76,.65),-.018);
    const closeup=await h.photograph('pine-and-sun');
    await exportFrame(closeup,'pine-and-sun-original');
    assert.deepEqual(errors,[]);
  }catch(e){failure=e;await h.shot('FAIL-actual').catch(()=>{});throw e;}
  finally{h.report.browserErrors=errors;await h.finish(failure);}
}
