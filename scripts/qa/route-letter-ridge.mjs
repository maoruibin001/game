import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createLetterHarness, walking, cameraActive} from './letter-normal-input.mjs';
import {P0_ROUTE} from './p0-route-plan.mjs';

// Ordinary mouse, keyboard and download UI throughout. Diagnostics only read the rendered journey.
export default async function ridgeLetter(play) {
  const root=fileURLToPath(new URL('../../../production/ridge-pair-20261118/',import.meta.url));
  const h=await createLetterHarness(play,{id:'ridge-pair',viewport:[1920,1080]},{budgetMs:420000},root);
  const errors=[];
  play.page.on('pageerror',e=>errors.push(String(e)));
  play.page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const click=sel=>play.page.locator(sel).first().click({timeout:8000});
  const button=id=>'[data-action="'+id+'"]';
  const letter='[data-reply-letter="forest"] ';
  const journal=async()=>{await h.key('KeyJ');await h.wait(s=>s.state.runtime.screen==='journal');await click('[role="tab"]');};
  async function closeJournal(){
    for(let i=0;i<5&&(await h.read()).state.runtime.screen==='journal';i++){await click('button.sy-close:visible');await h.settle();}
  }
  async function downloadOriginal(photo,name){
    await h.key('KeyJ');await h.wait(s=>s.state.runtime.screen==='journal');
    await play.page.locator('[role="tab"]').nth(2).click();
    await click(button('photo-collection')+'[data-collection="film"]');
    await click('.sy-album [data-id="'+photo.id+'"]');
    await h.download(name,()=>click(button('export-photo')),[1920,1080],{photoId:photo.id,bytes:photo.original.bytes});
    await closeJournal();await h.lowerCamera();
  }
  async function lens(value){
    await click(button('toggle-photo-tools'));await click(button('photo-option')+'[data-photo-key="lens"][data-value="'+value+'"]');
    await click(button('toggle-photo-tools'));await h.wait(s=>cameraActive(s)&&s.state.durable.photography.lens===value);
  }
  async function resume(){await h.key('Tab');await h.key('Enter');await h.wait(walking);}
  let failure;
  try{
    await h.startFresh();await h.shot('01-departure');
    await h.route(P0_ROUTE.town.slice(0,-1));await h.route(P0_ROUTE.lever,.35);
    await h.key('KeyE');await h.wait(s=>s.state.durable.gateOpened);
    await h.route([[148,-2],[155,-3]],.35);
    await h.cameraAt({feet:[155,-3],target:[155,29,10]},'02-town');
    const town=await h.photograph('03-town-card',{matchedCard:'town'});await h.lowerCamera();
    await h.route([[155,7],[155,20],[194,59],[216,109],[171,135],[126,178],[64,204]]);
    // Reproduce the previous native photograph's actual station, orientation, lens and light.
    await click(button('open-outings'));await click(button('set-creative-mode'));
    await play.page.locator('[data-creative-time]').fill('17:55');
    await click(button('set-weather')+'[data-weather="morning"]');await click('button.sy-close:visible');
    await h.wait(s=>walking(s)&&s.state.durable.creativeMode&&s.state.durable.clock.minute===1075);
    const beforePosition=[64.1194794557,204.0879566911], forward=[-.64964908145,.01439950234,-.76009783929];
    await h.cameraAt({feet:beforePosition,target:[6,87,136]},'04-sunset');
    await lens('standard');await h.turnTo(Math.atan2(forward[0],-forward[2]),-Math.asin(forward[1]));
    await h.wait(s=>cameraActive(s)&&s.environment.settled&&s.environment.sunDisc.visible);
    h.report.shutterCanvas=await play.page.locator('canvas').first().evaluate(c=>({
      width:c.width,height:c.height,cssWidth:c.clientWidth,cssHeight:c.clientHeight,devicePixelRatio:window.devicePixelRatio
    }));
    assert.deepEqual([h.report.shutterCanvas.width,h.report.shutterCanvas.height],[1920,1080]);
    const sunset=await h.photograph('05-after-sunset');await downloadOriginal(sunset,'06-after-original');
    await click(button('open-outings'));await click(button('set-creative-mode'));await click('button.sy-close:visible');await h.wait(walking);
    await h.cameraAt({feet:[64,204],target:[68.4,84.88,199]},'07-turn');
    const turn=await h.photograph('08-turn-photo');assert.equal(turn.routeSlot,'turn');
    await downloadOriginal(turn,'09-turn-original');
    await journal();await h.shot('10-unanswered');
    await click(letter+button('attach-route-photo')+'[data-slot="turn"][data-id="'+turn.id+'"]');
    await h.wait(s=>s.state.durable.routeDraft.turn?.id===turn.id);assert.equal(await play.page.locator(letter+button('send-route-pair')).isDisabled(),true);
    await h.shot('11-one-attached');await closeJournal();await h.wait(walking);
    await h.key('Escape');await h.wait(s=>s.state.runtime.screen==='paused'&&s.view.saveStatus==='saved');
    await play.reload();const draft=await h.wait(s=>s.restored&&s.state.runtime.screen==='menu');
    assert.equal(draft.state.durable.routeDraft.turn.original.key,turn.original.key);assert.equal(draft.state.durable.replyPhotos.forest,null);
    await resume();
    await h.cameraAt({feet:[72,200],target:[-170,44.5,-20.25]},'12-west-slope');await lens('tele');
    const end=await h.photograph('13-windmill-photo');assert.equal(end.routeSlot,'destination');
    await downloadOriginal(end,'14-windmill-original');
    await journal();await click(letter+button('attach-route-photo')+'[data-slot="destination"][data-id="'+end.id+'"]');
    await h.wait(s=>s.state.durable.routeDraft.destination?.id===end.id);
    await h.shot('15-two-attached');
    await click(letter+button('send-route-pair'));const answer=await h.wait(s=>s.state.durable.replyPhotos.forest?.variant==='route-pair');
    assert.equal(answer.state.durable.replyPhotos.forest.photo.id,turn.id);assert.equal(answer.state.durable.replyPhotos.forest.destination.id,end.id);
    await play.page.locator(letter+'.sy-reply-response').scrollIntoViewIfNeeded();await h.shot('16-reply');
    await h.download('17-printed-letter',()=>click(letter+button('export-route-letter')),[2400,1360],{photoId:[turn.id,end.id]});
    const oldTown='[data-reply-letter="town"] ';
    await click(oldTown+button('pick-reply-photo')+'[data-id="'+town.id+'"]');await click(oldTown+button('select-reply-photo'));
    await h.wait(s=>s.state.durable.replyPhotos.town?.photo.id===town.id);
    await click(button('edit-reply')+'[data-letter="final"]');await click(button('pick-reply-photo')+'[data-letter="final"][data-id="'+sunset.id+'"]');
    await click(button('confirm-final-photo'));await h.wait(s=>s.view.canSendLetter);
    await closeJournal();await h.wait(walking);
    await h.route([[20,226],[15,226],[15,233],[13.5,233.5]],.65);await h.wait(s=>s.state.runtime.nearby==='mailbox:ridge');
    await h.key('KeyE');await click(button('send-letter'));
    const mailed=await h.wait(s=>s.state.durable.mailed&&s.state.runtime.screen==='ending');assert.equal(mailed.state.durable.mailedFrom,'mailbox:ridge');
    await h.shot('18-postmarked');await click(button('keep-exploring'));await h.wait(walking);
    await h.key('Escape');await h.wait(s=>s.state.runtime.screen==='paused'&&s.view.saveStatus==='saved');await play.reload();
    const saved=await h.wait(s=>s.restored&&s.state.runtime.screen==='menu');
    assert.equal(saved.state.durable.mailed,true);const retained=saved.state.durable.replyPhotos.forest;
    assert.deepEqual([retained.photo.original.key,retained.destination.original.key],[turn.original.key,end.original.key]);
    await resume();await journal();await play.page.locator(letter+'.sy-reply-response').scrollIntoViewIfNeeded();await h.shot('19-reread');
    assert.deepEqual(errors,[]);
  }catch(e){failure=e;await h.shot('FAIL-observed').catch(()=>{});throw e;}
  finally{h.report.browserErrors=errors;await h.finish(failure);}
}
