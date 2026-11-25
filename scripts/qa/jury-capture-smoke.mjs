// Short ordinary-input preflight. Exercise the observation bridge before travelling.
import assert from 'node:assert/strict';
import {cameraActive,walking,createJuryHarness,loadJuryBinding,photoFacts} from './jury-p0-input.mjs';

const BINDING=await loadJuryBinding('capture-smoke');
export const PLAN={id:'jury-capture-smoke',revision:'jury-capture-smoke-01',viewport:[1920,1080],
  coverage:'normal title entry; cross-realm readonly capture observation; one ordinary camera shutter; one actual 1920×1080 original JPEG download'};

export default async function captureSmoke(play){
  const h=await createJuryHarness(play,PLAN,BINDING);let error;
  assert.ok(BINDING.budgetMs<=90000,'capture smoke is bounded to ninety seconds');
  try{
    await h.step('normal-entry-and-readonly-bridge-preflight',async()=>{
      await h.startFresh();
      const ui=await h.uiRead();
      assert.equal(ui.mounted,true);assert.equal(ui.ready,true);assert.equal(ui.capturesPending,0);
      assert.ok(Array.isArray(ui.completedFrames)&&ui.completedFrames.length>0,'actual frontend completed-frame history must be readable before any route');
      assert.ok(ui.frameProgress?.completed?.frameId>=0);
      await h.shot('smoke-post-office-ready');
    });
    let photo;
    await h.step('one-normal-shutter-crosses-current-frame-fence-and-saves',async()=>{
      await h.key('KeyC');await h.wait(cameraActive);
      photo=await h.photograph('smoke-post-photo-saved');
      const s=await h.read(),ui=await h.uiRead();
      assert.equal(s.state.durable.totalPhotos,1);assert.deepEqual(photoFacts(s.state.durable.film.at(-1)),photoFacts(photo));
      assert.equal(ui.lastCapture.phase,'captured');assert.equal(ui.capturesPending,0);
    });
    await h.step('ordinary-photo-detail-downloads-actual-original',async()=>{
      const s=await h.read();
      assert.ok(!s.view.replies.items.some(letter=>letter.candidates.some(p=>p.id===photo.id)),
        'spawn photo must open ordinary recent detail, not a reply-picker shortcut');
      await h.click(80,120);await h.wait(s=>s.state.runtime.screen==='journal'&&s.controller.paused);
      // Normal detail focus order: close, keep, final, large, original export.
      // No screenshot interrupts this relative keyboard traversal.
      await h.download('smoke-post-original',async()=>{await h.tabs(5);await h.key('Enter');},[1920,1080],
        {photoId:photo.id,bytes:photo.original.bytes});
      await h.key('Escape');await h.key('Escape');await h.wait(cameraActive);
      await h.lowerCamera();await h.wait(walking);await h.shot('smoke-normal-controls-restored');
      assert.equal(h.report.photos.length,1);assert.equal(h.report.downloads.length,1);
    });
  }catch(e){error=e;throw e;}finally{await h.finish(error);}
}
