import assert from 'node:assert/strict';
import {cameraActive} from './jury-p0-input.mjs';
import {P0_ROUTE} from './p0-route-plan.mjs';
import {withPassivePointerAudit} from './passive-pointer-audit.mjs';
import {visualDiagnosticBinding,visualCameraAt,exportLatestOriginal,runVisualDiagnostic} from './visual-diagnostic-input.mjs';
const id='visual-forest-direct';
export async function runForestDirect(play,binding){
  return runVisualDiagnostic(play,binding,{id,coverage:'ordinary start and direct forest road; real windmill view and one original; postal camera branch not exercised'},async h=>{
    await h.step('normal-direct-road-to-forest',async()=>{
      await h.startFresh();assert.equal((await h.uiRead()).ready,true);
      await h.route([[9.75,-226],[0,-220]],1.1,true);await h.route(P0_ROUTE.forest.slice(1),1.1,true);
      await h.shot('01-forest-arrival');
    });
    await h.step('real-windmill-framing-and-original',async()=>{
      await visualCameraAt(play,h,P0_ROUTE.forestPhoto,'02-windmill');
      await h.wait(s=>cameraActive(s)&&s.view.camera.target==='forest'&&s.view.camera.ready&&s.view.camera.alignment===1,3500);
      const photo=await h.photograph('03-windmill-real-photo',{matchedCard:'forest'});
      await exportLatestOriginal(h,photo,'04-windmill-original');await h.shot('05-forest-controls-restored');
      assert.equal(h.report.photos.length,1);assert.equal(h.report.downloads.length,1);assert.equal((await h.read()).state.durable.totalPhotos,1);
    });
  });
}
export default async function forestDirect(play){const b=await visualDiagnosticBinding(id);
  return withPassivePointerAudit(p=>runForestDirect(p,b),b,{id,scope:'passive pointer and all native shutters for direct forest visual diagnostic'})(play);}
