import assert from 'node:assert/strict';
import {cameraActive,walking} from './jury-p0-input.mjs';
import {P0_ROUTE} from './p0-route-plan.mjs';
import {COURTYARD_PHOTO} from '../../assets/shanye-world/courtyard.ts';
import {withPassivePointerAudit} from './passive-pointer-audit.mjs';
import {visualDiagnosticBinding,preciseVisualPosition,visualCameraAt,exportLatestOriginal,runVisualDiagnostic} from './visual-diagnostic-input.mjs';
const id='visual-courtyard-direct';
export async function runCourtyardDirect(play,binding){
  return runVisualDiagnostic(play,binding,{id,coverage:'ordinary road and E crank; actual arch photo opens bridge; normal bridge walk and real courtyard original; visual diagnosis only'},async h=>{
    await h.step('normal-town-road-and-crank',async()=>{
      await h.startFresh();assert.equal((await h.uiRead()).ready,true);
      await h.route(P0_ROUTE.town.slice(0,-1),1.1,true);await h.route([[148,-2]],1.1);
      await preciseVisualPosition(play,h,[148,8.8],.25);await h.lowerCamera();
      await h.wait(s=>walking(s)&&s.state.runtime.nearby==='town-gate');await h.shot('01-town-crank');
      await h.key('KeyE');await h.wait(s=>walking(s)&&s.state.durable.gateOpened);
    });
    await h.step('normal-precision-arch-and-real-bridge-unlock',async()=>{
      await h.route([[148,-2]],1.1);await visualCameraAt(play,h,{feet:[155,-3],target:[155,29,10]},'02-town-arch');
      await h.wait(s=>cameraActive(s)&&s.view.camera.target==='town'&&s.view.camera.ready&&s.view.camera.alignment===1,3500);
      await h.photograph('03-real-arch-unlocks-bridge',{matchedCard:'town'});await h.lowerCamera();
      await h.wait(s=>walking(s)&&s.state.durable.stamps.town&&s.state.runtime.bridgeProgress===1,4500);
      await h.shot('04-bridge-open');
    });
    await h.step('normal-bridge-walk-and-real-courtyard-original',async()=>{
      await h.route([[155,7],[155,20],[155,28],[155,37],[155,42]],.65);
      await h.shot('05-courtyard-entrance');const {feet,target}=COURTYARD_PHOTO.view;
      await visualCameraAt(play,h,{feet:[feet[0],feet[2]],target},'06-courtyard');
      await h.wait(s=>cameraActive(s)&&s.state.runtime.observation?.vantageTags.includes('courtyard-view')&&s.view.camera.ready&&s.view.camera.alignment===1,3500);
      const photo=await h.photograph('07-real-courtyard-photo',{courtyard:true});
      await exportLatestOriginal(h,photo,'08-courtyard-original');await h.shot('09-courtyard-controls-restored');
      assert.equal(h.report.photos.length,2);assert.equal(h.report.downloads.length,1);assert.equal((await h.read()).state.durable.totalPhotos,2);
    });
  });
}
export default async function courtyardDirect(play){const b=await visualDiagnosticBinding(id);
  return withPassivePointerAudit(p=>runCourtyardDirect(p,b),b,{id,scope:'passive pointer and all native shutters for courtyard visual diagnostic'})(play);}
