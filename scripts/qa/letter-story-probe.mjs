// One ordinary owner session, two bounded story segments; no saved-state import.
import assert from 'node:assert/strict';
import {cameraActive,walking,createLetterHarness,loadLetterBinding,progressFacts} from './letter-normal-input.mjs';
import {createLetterUi} from './letter-ui-input.mjs';
import {P0_ROUTE} from './p0-route-plan.mjs'; // Authored road data only; no old harness.

const BINDING=await loadLetterBinding('story');
export const PLAN={id:'letter-story-probe',revision:'letter-story-normal-draft-01',viewport:[1920,1080],
  coverage:'two explicitly chosen replies; true arch unlock then courtyard replacement; chosen final and note; physical mailbox confirmation; postcard/original downloads; normal reload retention'};
const forestView=P0_ROUTE.forestPhoto;
const townView={feet:[155,-3],target:[155,29,10]};
const courtyardView={feet:[157,48.8],target:[161.875,26.875,51.25]};
const courtyardRoad=[[155,7],[155,20],[155,28],[155,37],[155,42],[157,48.8]];
const courtyardReturn=[[155,42],[155,37],[155,28],[155,20],[155,5],[157.75,5]];
const replies=s=>structuredClone(s.state.durable.replyPhotos);

/** @param {import('@forgeax/engine/devkit').PlayContext} play */
export default async function storyProbe(play){
  const h=await createLetterHarness(play,PLAN,BINDING),ui=createLetterUi(h);let error,forestPhoto,townPhoto,courtyardPhoto,forestReply,townReply,finalReply;
  assert.ok(BINDING.budgetMs<=720000,'root must bound the complete story probe to twelve minutes');
  async function reloadNormally(label){
    await h.wait(walking);await h.key('Escape');await h.wait(s=>s.state.runtime.screen==='paused');
    await h.wait(s=>s.view?.saveStatus==='saved');const before=await h.shot(`${label}-normal-save-checkpoint`),facts=progressFacts(before);
    await play.reload();const loaded=await h.wait(s=>s.restored&&s.state.runtime.screen==='menu');
    assert.equal(loaded.state.durable.started,true);assert.deepEqual(loaded.state.durable.clock,before.state.durable.clock);
    assert.deepEqual(loaded.state.durable.weatherCycle,before.state.durable.weatherCycle);
    const after=progressFacts(loaded);
    for(const key of ['stamps','gateOpened','replyPhotos','endingPhoto','endingNote','mailed','endingSeen','mailedFrom','totalPhotos'])assert.deepEqual(after[key],facts[key],`${label}: reload must retain ${key}`);
    h.record(`${label}-loaded-normal-save`,loaded);await h.key('Tab');await h.key('Enter');await h.wait(walking);
  }
  try{
    await h.runSegment('A',async()=>{
      await h.step('new-journey-to-real-forest-photo',async()=>{
        await h.startFresh();await h.route(P0_ROUTE.forest);await h.cameraAt(forestView,'forest');
        forestPhoto=await h.photograph('forest-real-matched-photo',{matchedCard:'forest'});
        const after=await h.read();assert.equal(after.state.durable.stamps.forest,true);assert.equal(after.state.durable.replyPhotos.forest,null,'shutter may unlock scenery but must not choose a reply');
        await h.lowerCamera();forestReply=await ui.selectReply('forest',forestPhoto.id);
      });
      await h.step('ordinary-return-road-town-crank-and-arch-reply',async()=>{
        await h.route(P0_ROUTE.forestReturn);await h.route(P0_ROUTE.town.slice(1,-1));await h.route(P0_ROUTE.lever,.25);
        const lever=await h.wait(s=>walking(s)&&s.state.runtime.nearby==='town-gate');assert.equal(lever.state.durable.gateOpened,false);
        await h.shot('actual-town-lever-prompt');await h.key('KeyE');await h.wait(s=>walking(s)&&s.state.durable.gateOpened);
        await h.route([[148,-2],[155,-3]],.25);await h.cameraAt(townView,'town-arch');townPhoto=await h.photograph('town-real-matched-arch-photo',{matchedCard:'town'});
        assert.equal((await h.read()).state.durable.replyPhotos.town,null,'arch shutter must leave the player in control of reply selection');
        await h.lowerCamera();townReply=await ui.selectReply('town',townPhoto.id);
        const answered=await h.read();assert.equal(answered.state.durable.replyPhotos.forest.photo.id,forestPhoto.id);assert.ok(answered.view.replies.final.ready);
        await h.wait(s=>walking(s)&&s.state.runtime.bridgeProgress===1,4500);await h.shot('two-explicit-replies-and-actual-lowered-bridge');
      });
      await h.step('first-segment-normal-save-reload',async()=>reloadNormally('two-replies'));
    });
    await h.runSegment('B',async()=>{
      await h.step('walk-real-bridge-and-photograph-bell-with-eave',async()=>{
        await h.wait(s=>walking(s)&&s.state.runtime.bridgeProgress===1);await h.route(courtyardRoad,.35);
        const composed=await h.cameraAt(courtyardView,'courtyard');
        for(const id of ['courtyard-bell','courtyard-eave'])assert.ok(composed.state.runtime.observation?.anchors?.[id],`real ${id} projection is required`);
        courtyardPhoto=await h.photograph('courtyard-real-bell-eave-photo',{courtyard:true});await h.lowerCamera();
        assert.equal((await h.read()).state.durable.replyPhotos.town.photo.id,townPhoto.id,'new courtyard capture must not silently replace the reply');
        const firstBefore=replies(await h.read()).forest;townReply=await ui.selectReply('town',courtyardPhoto.id);
        const changed=await h.read();assert.equal(changed.state.durable.replyPhotos.town.variant,'courtyard');
        assert.deepEqual(changed.state.durable.replyPhotos.forest,firstBefore);assert.equal(changed.state.runtime.bridgeProgress,1);
        assert.deepEqual(changed.state.durable.stamps,{forest:true,town:true});
      });
      await h.step('choose-own-final-photo-and-reach-a-real-mailbox',async()=>{
        finalReply=await ui.selectFinal(forestPhoto.id);const selected=await h.read();
        assert.equal(selected.state.durable.endingPhoto.id,forestPhoto.id);assert.notEqual(selected.state.durable.endingPhoto.id,courtyardPhoto.id);
        assert.equal(selected.state.durable.mailed,false);await h.route(courtyardReturn,.35);
        await h.wait(s=>walking(s)&&s.state.runtime.nearby==='mailbox:town');await h.shot('physical-town-mailbox-before-confirmation');
      });
      await h.step('explicit-mail-confirmation-and-real-image-downloads',async()=>{
        const before=await h.read(),pulse=before.view.mailRequest??0;await h.key('KeyE');
        const preview=await h.wait(s=>s.controller.paused&&(s.view?.mailRequest??0)>pulse);
        assert.equal(preview.state.durable.mailed,false,'opening the physical mailbox must only preview, not send');
        await h.shot('normal-mailbox-preview-not-sent');
        await h.key('Escape');const cancelled=await h.wait(walking);assert.equal(cancelled.state.durable.mailed,false,'cancelling preview must not send');
        await h.shot('mailbox-preview-cancelled-without-sending');
        const nextPulse=(await h.read()).view.mailRequest;await h.key('KeyE');
        await h.wait(s=>s.controller.paused&&(s.view?.mailRequest??0)>nextPulse&&!s.state.durable.mailed);
        // Normal preview: postcard, original, confirm, change selection, keep.
        await h.tabs(3);await h.key('Enter');const mailed=await h.wait(s=>s.state.durable.mailed&&s.state.runtime.screen==='ending');
        assert.equal(mailed.state.durable.mailedFrom,'mailbox:town');assert.equal(mailed.state.durable.endingPhoto.id,forestPhoto.id);
        await h.shot('explicitly-mailed-three-letter-ending');
        // The send control disappears, returning normal focus to the dialog.
        await h.download('chosen-ending-postcard',async()=>{await h.tabs(1);await h.key('Enter');},[2160,1500],{photoId:forestPhoto.id});
        await h.download('chosen-ending-original',async()=>{await h.tabs(1);await h.key('Enter');},[1920,1080],{photoId:forestPhoto.id,bytes:forestPhoto.original.bytes});
        await h.tabs(1);await h.key('Enter');const walkingAgain=await h.wait(walking);assert.equal(walkingAgain.state.durable.endingSeen,true);
      });
      await h.step('mailed-replies-originals-and-notes-survive-normal-reload',async()=>{
        await reloadNormally('mailed-three-letters');const loaded=await h.read();
        for(const [id,expected]of [['forest',forestReply],['town',townReply]]){
          const actual=loaded.state.durable.replyPhotos[id];assert.equal(actual.photo.id,expected.photoId);assert.equal(actual.note,expected.note);assert.deepEqual(actual.photo.original,expected.original);
        }
        assert.equal(loaded.state.durable.endingPhoto.id,finalReply.photoId);assert.equal(loaded.state.durable.endingNote,finalReply.note);assert.deepEqual(loaded.state.durable.endingPhoto.original,finalReply.original);
        assert.equal(loaded.state.durable.mailed,true);await ui.open();await h.shot('reloaded-real-three-letter-replies');await ui.close();
        assert.equal((await h.read()).state.durable.totalPhotos,3);assert.equal(h.report.downloads.length,2);
      });
    });
  }catch(e){error=e;throw e;}finally{await h.finish(error);}
}
