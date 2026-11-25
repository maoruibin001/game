// Reach the courtyard through real play: crank, actual arch photo, lowering bridge.
import assert from 'node:assert/strict';
import {cameraActive,walking,createJuryHarness} from './jury-p0-input.mjs';
import {P0_ROUTE} from './p0-route-plan.mjs';
import {COURTYARD_PHOTO} from '../../assets/shanye-world/courtyard.ts';
import {loadVisualCandidate,retainVisualFailure} from './visual-candidate.mjs';

export const courtyardBinding=()=>loadVisualCandidate('visual-courtyard');
export async function runVisualCourtyard(play,binding){
  const plan={id:'visual-courtyard',revision:'visual-courtyard-normal-01',viewport:[1920,1080],
    coverage:'normal title and road; E crank; actual arch photograph lowers bridge; ordinary courtyard entry; real bell/eave original export'};
  const h=await createJuryHarness(play,plan,binding);let error,photo;
  h.report.visualScope='courtyard appearance and real framing recorded; aesthetic approval remains separate';
  h.report.runtimeErrors={console:[],page:[]};
  h.report.courtyardViewFromFrozenSource=COURTYARD_PHOTO.view;
  const consoleError=message=>{if(message.type()==='error')h.report.runtimeErrors.console.push({at:new Date().toISOString(),message:message.text()});};
  const pageError=value=>h.report.runtimeErrors.page.push({at:new Date().toISOString(),message:String(value)});
  play.page.on('console',consoleError);play.page.on('pageerror',pageError);
  try{
    await h.step('normal-road-and-physical-town-crank',async()=>{
      await h.startFresh();assert.equal((await h.uiRead()).ready,true);
      await h.route(P0_ROUTE.town.slice(0,-1),1.1,true);await h.route(P0_ROUTE.lever,.25);
      await h.wait(s=>walking(s)&&s.state.runtime.nearby==='town-gate');await h.shot('01-town-crank-before-opening');
      await h.key('KeyE');await h.wait(s=>walking(s)&&s.state.durable.gateOpened);
    });
    await h.step('real-arch-photograph-and-normal-bridge-unlock',async()=>{
      await h.route([[148,-2],[155,-3]],.25);
      await h.cameraAt({feet:[155,-3],target:[155,29,10]},'02-town-arch');
      await h.wait(s=>cameraActive(s)&&s.view.camera.target==='town'&&s.view.camera.ready&&s.view.camera.alignment===1,3500);
      await h.photograph('03-real-arch-unlocks-bridge',{matchedCard:'town'});await h.lowerCamera();
      await h.wait(s=>walking(s)&&s.state.durable.stamps.town&&s.state.runtime.bridgeProgress===1,4500);
      await h.shot('04-bridge-open-after-real-photo');
    });
    await h.step('walk-bridge-and-frame-real-courtyard',async()=>{
      await h.route([[155,7],[155,20],[155,28],[155,37],[155,42]],.35);
      await h.shot('05-courtyard-normal-entrance');
      const {feet,target}=COURTYARD_PHOTO.view;
      await h.cameraAt({feet:[feet[0],feet[2]],target},'06-courtyard-bell-eave');
      await h.wait(s=>cameraActive(s)&&s.state.runtime.observation?.vantageTags.includes('courtyard-view')
        &&s.view.camera.ready&&s.view.camera.alignment===1,3500);
      photo=await h.photograph('07-courtyard-real-photo',{courtyard:true});
      assert.equal((await h.read()).state.durable.totalPhotos,2);
    });
    await h.step('ordinary-courtyard-original-export',async()=>{
      await h.key('KeyJ');await h.wait(s=>s.state.runtime.screen==='journal'&&s.controller.paused);
      await h.tabs(4);await h.key('Enter');await h.tabs(5);await h.key('Enter');await h.tabs(2);await h.key('Enter');
      await h.download('08-courtyard-original',async()=>{await h.tabs(5);await h.key('Enter');},[1920,1080],
        {photoId:photo.id,bytes:photo.original.bytes});
      await h.key('Escape');await h.key('Escape');await h.wait(cameraActive);await h.lowerCamera();
      await h.shot('09-courtyard-controls-restored');
      assert.equal(h.report.photos.length,2);assert.equal(h.report.downloads.length,1);
      assert.equal((await h.read()).state.durable.totalPhotos,2);
      assert.deepEqual(h.report.runtimeErrors,{console:[],page:[]});
    });
  }catch(e){error=e;await retainVisualFailure(play,h,e);throw e;}finally{
    play.page.off('console',consoleError);play.page.off('pageerror',pageError);await h.finish(error);
  }
}
export default async function visualCourtyard(play){return runVisualCourtyard(play,await courtyardBinding());}
