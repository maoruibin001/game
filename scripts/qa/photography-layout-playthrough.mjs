// Narrow normal-input layout check. Root owns the official runtime/browser.
// No shutter, DOM/eval, state writes, storage reads, or virtual-time advancement.
import assert from 'node:assert/strict';

export const PHOTOGRAPHY_LAYOUT_PLAN = Object.freeze({
  revision: 'photography-layout-20261116-01', scriptBudgetMs: 30000,
  firstViewport: [1920,1080], additionalSdkViewports: ['1280x720','1280x600'],
  scope: 'photo/portrait/timer3; camera-mode layout, save badge and tool overlap inspected from real screenshots; forecast expansion stays out of camera mode',
  reusedEvidence: 'OWNER03 photography chain and OWNER04 byte-identical original reload/natural weather cycle',
});
const READ='shan.journey';
const photo=s=>s.state.runtime.screen==='photo'&&s.controller.mode==='photo'
  &&!s.controller.paused&&!s.pendingCapture&&!s.state.durable.pendingPhoto
  &&s.state.runtime.pauseReasons.length===0&&s.frontend?.focus?.target==='canvas';

/** @param {import('@forgeax/engine/devkit').PlayContext} play */
export default async function photographyLayout(play) {
  const began=Date.now();
  const budget=()=>{assert.ok(!play.signal.aborted,'owner aborted');assert.ok(Date.now()-began<30000,'layout-only 30-second script budget exceeded');};
  const read=async()=>{budget();return play.state(READ);};
  const wait=async(predicate,ms=5000)=>{budget();return play.waitFor(predicate,{read:READ,timeoutMs:Math.max(1,Math.min(ms,30000-(Date.now()-began)))});};
  const key=async(code)=>{budget();await play.keyboard.press(code);await play.wait(80);};
  // Bind to the real controls instead of hard-coded pixels: the camera toolbar
  // moved after this script was written, so coordinate clicks silently missed.
  const click=async selector=>{budget();const control=play.page.locator(selector);
    assert.equal(await control.count(),1,`one ${selector} control required`);
    await control.click({timeout:2500});await play.wait(80);};

  await play.step('layout-normal-start',async()=>{
    const s=await wait(s=>s.restored&&s.state.runtime.screen==='menu');
    assert.equal(s.state.durable.started,false,'fresh owner context required; never overwrite an existing journey');
    await key('Tab');await key('Enter');
    await wait(s=>s.state.runtime.screen==='play'&&s.controller.mode==='walk'&&!s.controller.paused);
  });
  await play.step('layout-portrait-three-second-controls',async()=>{
    await key('KeyC');await wait(photo);
    await click('[data-action="toggle-photo-tools"]');
    await click('[data-action="photo-option"][data-photo-key="mode"][data-value="portrait"]');
    await wait(s=>photo(s)&&s.state.durable.photography.mode==='portrait'&&s.controller.photography.settings.mode==='portrait');
    await click('.sy-photo-quick-timer');
    await wait(s=>photo(s)&&s.state.durable.photography.timerSeconds===3&&s.controller.photography.settings.timerSeconds===3);
    // Forecast expansion is a walking-mode control; camera mode must keep the
    // view uncluttered. Assert the real UI contract instead of clicking a hidden node.
    assert.equal(await play.page.locator('.sy-forecast-details').count(),0);
    await wait(photo);
  });
  await play.step('layout-save-badge-normal-frame-and-final-capture',async()=>{
    const start=await read();
    // Ordinary active frames cover the normal save-badge update. This is layout
    // evidence only, not another persistence/readback claim; OWNER04 owns that.
    const final=await wait(s=>photo(s)&&s.state.durable.playSeconds>=start.state.durable.playSeconds+1.5,6000);
    assert.equal(final.state.durable.photography.mode,'portrait');
    assert.equal(final.state.durable.photography.timerSeconds,3);
    assert.equal(final.state.runtime.countdownSeconds,null,'timer configured only; no shutter requested');
    assert.equal(final.state.durable.totalPhotos,0,'layout check must not consume a photograph');
    assert.equal(final.state.durable.film.length,0);assert.equal(final.state.durable.album.length,0);
    await play.screenshot('portrait-timer3-forecast-layout-final');
    console.log(JSON.stringify({name:'photography-layout-final',elapsedMs:Date.now()-began,
      plan:PHOTOGRAPHY_LAYOUT_PLAN,screen:final.state.runtime.screen,
      photography:final.controller.photography.settings,forecast:final.forecast,
      totalPhotos:final.state.durable.totalPhotos,saveBadgeEvidence:'normal active frames + screenshot; no new storage-readback claim',
      followup:'SDK final-frame layout scans at 1280x720 and 1280x600; reviewer must inspect resulting PNGs'}));
  });
  return {scope:PHOTOGRAPHY_LAYOUT_PLAN.scope,elapsedMs:Date.now()-began,photographsTaken:0,
    status:'ordinary final-state inputs completed; SDK layout result and visual review remain authoritative'};
}
