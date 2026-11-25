// Latest-product visual smoke via ordinary inputs only. No state/save injection.
import assert from 'node:assert/strict';
import {cameraActive,walking,createJuryHarness,photoFacts} from './jury-p0-input.mjs';
import {P0_ROUTE} from './p0-route-plan.mjs';
import {loadVisualCandidate,retainVisualFailure} from './visual-candidate.mjs';

export const visualBinding=()=>loadVisualCandidate('visual-post-forest');

export async function runVisualPostForest(play,binding){
  const plan={id:'visual-post-forest',revision:'visual-post-forest-02',viewport:[1920,1080],
    coverage:'normal title entry; initial postal view and porch view; ordinary road to forest; real windmill composition; one 1920x1080 original from normal journal UI'};
  const h=await createJuryHarness(play,plan,binding);let error;
  h.report.runtimeErrors={console:[],page:[]};
  h.report.visualScope='new TAA/grain/lighting appearance is only recorded, not aesthetically accepted by this script';
  h.report.notCovered.push('reload/CPU-throttle matrices are not repeated by this short visual smoke');
  const consoleError=message=>{if(message.type()==='error')h.report.runtimeErrors.console.push({at:new Date().toISOString(),message:message.text()});};
  const pageError=value=>h.report.runtimeErrors.page.push({at:new Date().toISOString(),message:String(value)});
  play.page.on('console',consoleError);play.page.on('pageerror',pageError);
  try{
    await h.step('ordinary-entry-and-postal-visuals',async()=>{
      await h.startFresh();const ui=await h.uiRead();assert.equal(ui.ready,true);assert.equal(ui.capturesPending,0);
      await h.shot('01-post-initial-spawn');
      // LMB is ordinary looking only in walking mode. In photo mode it remains
      // the shutter, so all existing photographic framing continues to use RMB.
      const before=await h.wait(walking);
      await play.mouse.drag([.5,.5],[.54,.5],{button:'left'});await h.settle();const after=await h.read();
      assert.ok(walking(after));assert.equal(after.state.durable.totalPhotos,0);assert.equal(after.pendingCapture,null);
      assert.ok(Math.abs(Math.atan2(Math.sin(after.controller.yaw-before.controller.yaw),Math.cos(after.controller.yaw-before.controller.yaw)))>.05,
        'ordinary walking LMB must visibly turn without taking a photograph');
      h.record('walking-left-drag-no-exposure',after);await h.turnTo(before.controller.yaw,before.controller.pitch);
      await h.route([[9.75,-226],[0,-220]],.3);
      await h.cameraAt({feet:[2,-214],target:[-3,16.4,-231]},'02-post-porch');
      await h.lowerCamera();
    });
    let photo;
    await h.step('ordinary-road-and-real-windmill-photograph',async()=>{
      await h.route(P0_ROUTE.forest,1.1,true);await h.shot('03-forest-arrival');
      await h.cameraAt(P0_ROUTE.forestPhoto,'04-windmill-framing');
      await h.wait(s=>cameraActive(s)&&s.view.camera.target==='forest'&&s.view.camera.ready&&s.view.camera.alignment===1,3500);
      photo=await h.photograph('05-windmill-real-photograph',{matchedCard:'forest'});
      assert.deepEqual(photoFacts((await h.read()).state.durable.film.at(-1)),photoFacts(photo));
    });
    await h.step('normal-journal-exports-one-real-original',async()=>{
      await h.key('KeyJ');await h.wait(s=>s.state.runtime.screen==='journal'&&s.controller.paused);
      // Ordinary journal → album → film → its only photograph → original export.
      // No screenshot is inserted into this established relative focus traversal.
      await h.tabs(4);await h.key('Enter');await h.tabs(5);await h.key('Enter');await h.tabs(2);await h.key('Enter');
      await h.download('06-windmill-original',async()=>{await h.tabs(5);await h.key('Enter');},[1920,1080],
        {photoId:photo.id,bytes:photo.original.bytes});
      await h.key('Escape');await h.key('Escape');await h.wait(cameraActive);
      await h.lowerCamera();await h.wait(walking);await h.shot('07-forest-controls-restored');
      assert.equal(h.report.photos.length,1);assert.equal(h.report.downloads.length,1);
      assert.equal((await h.read()).state.durable.totalPhotos,1);
      assert.deepEqual(h.report.runtimeErrors,{console:[],page:[]});
    });
  }catch(e){error=e;await retainVisualFailure(play,h,e);throw e;}finally{
    play.page.off('console',consoleError);play.page.off('pageerror',pageError);await h.finish(error);
  }
}
export default async function visualPostForest(play){return runVisualPostForest(play,await visualBinding());}
