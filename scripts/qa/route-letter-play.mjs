import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createLetterHarness, walking, cameraActive} from './letter-normal-input.mjs';
import {P0_ROUTE} from './p0-route-plan.mjs';

export async function playLetter(play, side) {
  const root = fileURLToPath(new URL('../../../production/route-letter-20261118/', import.meta.url));
  const h = await createLetterHarness(play, {id:side,viewport:[1920,1080]}, {budgetMs:360000}, root);
  const errors = [];
  play.page.on('pageerror', err => errors.push(String(err)));
  play.page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  const click = selector => play.page.locator(selector).first().click();
  const forest = side === 'sign-route';
  async function exportFromFilm(photo,name) {
    await h.key('KeyJ');
    await h.wait(s=>s.state.runtime.screen==='journal');
    await play.page.locator('[role="tab"]').nth(2).click();
    await click('[data-action="photo-collection"][data-collection="film"]');
    await click('.sy-album [data-id="'+photo.id+'"]');
    await h.download(name,()=>click('[data-action="export-photo"]'),[1920,1080],{photoId:photo.id,bytes:photo.original.bytes});
    for (let n=0;n<4 && (await h.read()).state.runtime.screen==='journal';n++) {
      await click('button.sy-close:visible'); await h.settle();
    }
    await h.lowerCamera();
  }
  let error;
  try {
    await h.startFresh();
    await h.shot('01-departure');
    if (forest) {
      await h.route(P0_ROUTE.forest);
      await h.cameraAt(P0_ROUTE.forestPhoto,'02-sign-and-windmill');
    } else {
      await h.route(P0_ROUTE.town.slice(0,-1));
      await h.route(P0_ROUTE.lever,.35);
      await h.key('KeyE');
      await h.wait(s=>s.state.durable.gateOpened);
      await h.route([[148,-2],[155,-3]],.35);
      await h.cameraAt({feet:[155,-3],target:[155,29,10]},'02-town');
      await h.photograph('03-town-card',{matchedCard:'town'});
      await h.lowerCamera();
      await h.route([[155,7],[155,20],[194,59],[216,109],[171,135],[126,178],[64,204]]);
      await h.cameraAt({feet:[64,204],target:[48.568,61.842,108.132]},'04-roof-and-windmill');
    }
    const photo = await h.photograph('05-player-photo');
    if (forest) assert.ok(photo.replyCandidates?.some(c=>c.variant==='sign-route'));
    else assert.ok(photo.memoryCandidates.includes('valley-letter'));
    await h.key('KeyJ');
    await h.wait(s=>s.state.runtime.screen==='journal');
    const letter = '[data-reply-letter="forest"]';
    await click('[role="tab"]');
    await h.shot('06-unanswered-letter');
    await click(letter+' [data-action="pick-reply-photo"][data-id="'+photo.id+'"]');
    await click(letter+' [data-action="select-reply-photo"]');
    const answered=await h.wait(s=>s.state.durable.replyPhotos.forest?.variant===side);
    assert.equal(answered.state.durable.replyPhotos.forest.photo.id,photo.id);
    if (!forest) assert.equal(answered.state.durable.stamps.forest,false);
    await play.page.locator(letter+' .sy-reply-response').scrollIntoViewIfNeeded();
    await h.shot('07-ahe-reply');
    await h.download('08-postcard',()=>click(letter+' [data-action="export-postcard"]'),[2160,1500],{photoId:photo.id});
    await click(letter+' [data-action="view-reply-photo"]');
    await h.download('09-original',()=>click('[data-action="export-photo"]'),[1920,1080],{photoId:photo.id,bytes:photo.original.bytes});
    for (let layers=0;layers<4 && (await h.read()).state.runtime.screen==='journal';layers++) {
      await click('button.sy-close:visible');
      await h.settle();
    }
    await h.wait(cameraActive);
    await h.lowerCamera();
    if (forest) {
      const view={feet:[-173.55,-42.78],target:[-174.85,38.98,-41.5]};
      await h.walkTo([-171,-42.78],.4);
      await h.cameraAt(view,'10-lunch-on-stone');
      await h.lowerCamera();
      await h.wait(s=>s.state.runtime.nearby==='forest-lunch');
      await h.key('KeyE');
      await h.wait(s=>s.state.runtime.notice.includes('多放了葱'));
      await h.shot('11-note-from-grandfather');
    }
    if (!forest) {
      await h.walkTo([66.5,205.8],.35);
      await h.wait(s=>s.state.runtime.nearby==='rest:cliff');
      await h.key('KeyE');
      await click('[data-action="rest-until"][data-target="sunset"]');
      await h.wait(s=>walking(s) && s.state.durable.clock.minute>=1060 && s.state.durable.clock.minute<1062);
      await h.cameraAt({feet:[64,204],target:[6,87,136]},'10-dusk-cliff-pine');
      const dusk=await h.photograph('11-dusk-photo');
      assert.ok(dusk.caption.includes('晚照崖')||dusk.caption.includes('横松'));
      await exportFromFilm(dusk,'12-dusk-original');
      await click('[data-action="open-outings"]');
      await click('[data-action="set-creative-mode"]');
      await play.page.locator('[data-creative-time]').fill('17:55');
      await click('[data-action="set-weather"][data-weather="morning"]');
      await click('button.sy-close:visible');
      await h.wait(s=>walking(s) && s.state.durable.creativeMode && s.state.durable.weather==='morning');
      await h.cameraAt({feet:[64,204],target:[6,87,136]},'13-clear-look');
      await click('[data-action="toggle-photo-tools"]');
      await click('[data-action="photo-option"][data-photo-key="lens"][data-value="standard"]');
      await click('[data-action="toggle-photo-tools"]');
      const clear=await h.wait(s=>cameraActive(s) && s.environment.settled && s.environment.sunDisc.visible && s.state.durable.photography.lens==='standard');
      assert.equal(Math.floor(clear.state.durable.clock.minute),1075);
      const sunset=await h.photograph('14-clear-sunset');
      assert.ok(sunset.caption.includes('太阳'));
      await exportFromFilm(sunset,'15-clear-sunset-original');
      await click('[data-action="open-outings"]');
      await click('[data-action="set-creative-mode"]');
      await click('button.sy-close:visible');
      await h.wait(walking);
    }
    await h.key('Escape');
    await h.wait(s=>s.state.runtime.screen==='paused' && s.view.saveStatus==='saved');
    await play.reload();
    const restored=await h.wait(s=>s.restored && s.state.runtime.screen==='menu');
    assert.equal(restored.state.durable.replyPhotos.forest?.variant,side);
    assert.equal(restored.state.durable.replyPhotos.forest?.photo.original.key, photo.original.key);
    assert.deepEqual(errors,[]);
  } catch(e) { error=e; throw e; }
  finally { h.report.browserErrors=errors; await h.finish(error); }
}
export default play => playLetter(play,'sign-route');
