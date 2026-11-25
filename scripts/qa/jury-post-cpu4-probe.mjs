// One bounded follow-up only. Ordinary spawn/camera/shutter/journal controls.
// CPU emulation is a runtime condition, never proof that real presentation slowed.
import assert from 'node:assert/strict';
import {cameraActive,walking,createJuryHarness,loadJuryBinding,photoFacts} from './jury-p0-input.mjs';

const BINDING=await loadJuryBinding('post-cpu4');
export const PLAN={id:'jury-post-cpu4-probe',revision:'post-same-view-cpu4-01',viewport:[1920,1080],
  coverage:'same postal camera: 8 ordinary-rate and 8 CPU=4 real shutters; actual ready-frame timings; 16 original JPEG downloads; one run, no retry/escalation'};

function completedFrameSummary(samples){
  const baseline=Math.max(-Infinity,...(samples[0]?.completedFrames??[]).map(e=>e.completedAtMs));
  const frames=[...new Map(samples.flatMap(s=>s.completedFrames??[])
    .filter(e=>e.completedAtMs>baseline&&e.frame?.presentation==='ready')
    .map(e=>[`${e.frame.deviceGeneration}/${e.frame.worldIdentity}/${e.frame.frameId}`,e])).values()]
    .sort((a,b)=>a.completedAtMs-b.completedAtMs);
  const gaps=frames.slice(1).map((f,i)=>f.completedAtMs-frames[i].completedAtMs).filter(n=>n>0).sort((a,b)=>a-b);
  const duration=frames.length>1?frames.at(-1).completedAtMs-frames[0].completedAtMs:0;
  return {source:'actual FORGEAX_FRAME_COMPLETED_EVENT ready frames; performance.now timestamps',
    count:frames.length,first:frames[0]??null,last:frames.at(-1)??null,durationMs:duration,
    meanFps:duration>0?(frames.length-1)*1000/duration:null,
    medianFrameMs:gaps.length?gaps[Math.floor(gaps.length*.5)]:null,
    p95FrameMs:gaps.length?gaps[Math.min(gaps.length-1,Math.floor(gaps.length*.95))]:null};
}

export default async function postCpu4Probe(play){
  const h=await createJuryHarness(play,PLAN,BINDING);let error,cdp,sameCamera;
  h.report.captureGroups=[];h.report.cpuConditions=[];
  assert.ok(BINDING.budgetMs<=240000,'postal follow-up is bounded to four minutes, one owner run');
  async function exportFilm(photos,label){
    await h.wait(cameraActive);await h.key('KeyJ');await h.wait(s=>s.state.runtime.screen==='journal'&&s.controller.paused);
    await h.tabs(4);await h.key('Enter');await h.tabs(5);await h.key('Enter');
    const reversed=[...photos].reverse();
    for(let index=0;index<reversed.length;index++){
      await h.tabs(index===0?2:7+index);await h.key('Enter');const photo=reversed[index];
      await h.download(`${label}-${photo.sequence}-original`,async()=>{await h.tabs(5);await h.key('Enter');},[1920,1080],
        {photoId:photo.id,bytes:photo.original.bytes});
      await h.key('Escape');
    }
    await h.key('Escape');await h.wait(cameraActive);
  }
  async function burst(label,rate){
    const before=await h.wait(cameraActive);assert.deepEqual(before.controller.camera,sameCamera,'both conditions must use the same actual camera');
    await cdp.send('Emulation.setCPUThrottlingRate',{rate});
    h.report.cpuConditions.push({at:new Date().toISOString(),label,rate,acknowledged:true});
    const startIndex=h.report.frameSamples.length,photos=[];
    try{
      await h.uiRead();
      for(let n=0;n<8;n++)photos.push(await h.photograph(`${label}-${n+1}`,{screenshot:false}));
      await h.uiRead();
      const frames=completedFrameSummary(h.report.frameSamples.slice(startIndex));
      assert.ok(frames.count>=8&&frames.durationMs>0,'actual completed ready-frame telemetry is mandatory');
      assert.equal(new Set(photos.map(p=>p.id)).size,8);assert.equal(new Set(photos.map(p=>p.original.key)).size,8);
      h.report.captureGroups.push({label,requestedCpuRate:rate,camera:before.controller.camera,
        photos:photos.map(photoFacts),frames,ordinaryShutters:8,actualSavedPhotos:8,complete:true});
    }finally{await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});}
    await h.shot(`${label}-eight-real-saved-photos`);await exportFilm(photos,label);
  }
  try{
    await h.step('ordinary-post-office-camera-and-readonly-preflight',async()=>{
      await h.startFresh();const ui=await h.uiRead();
      assert.equal(ui.ready,true);assert.ok(ui.completedFrames?.length>0);
      await h.key('KeyC');const s=await h.wait(cameraActive);sameCamera=structuredClone(s.controller.camera);
      cdp=await play.page.context().newCDPSession(play.page);
      h.report.browser=await cdp.send('Browser.getVersion');
      await h.shot('postal-fixed-camera-before-both-conditions');
    });
    await h.step('same-camera-normal-eight-and-eight-original-downloads',async()=>{await burst('normal',1);});
    await h.step('same-camera-cpu4-eight-and-eight-original-downloads',async()=>{await burst('cpu4',4);});
    await h.step('completed-frame-condition-and-stop',async()=>{
      assert.equal(h.report.photos.length,16);assert.equal(h.report.downloads.length,16);
      assert.equal((await h.read()).state.durable.totalPhotos,16);
      await h.lowerCamera();await h.wait(walking);await h.shot('postal-controls-restored-after-sixteen-real-photos');
      const [normal,slow]=h.report.captureGroups,ratio=slow.frames.meanFps/normal.frames.meanFps;
      h.report.frameRateCondition={normalMeanFps:normal.frames.meanFps,throttledMeanFps:slow.frames.meanFps,
        observedRateRatio:ratio,minimumReductionFraction:.05,reducedRateObserved:ratio<.95,
        disposition:ratio<.95?'reduced-completed-frame-rate-demonstrated':'condition-not-met-stop-without-another-run',
        limitation:'CPU=4 acknowledgement is not reduced render FPS; only measured ready-frame timings establish this gate.'};
      assert.ok(h.report.frameRateCondition.reducedRateObserved,
        'CPU=4 did not lower actual completed-render FPS by at least 5%; reduced-frame-rate gate NOT PASSED. Stop, no retry/escalation.');
    });
  }catch(e){error=e;throw e;}finally{
    if(cdp){await cdp.send('Emulation.setCPUThrottlingRate',{rate:1}).catch(()=>{});await cdp.detach().catch(()=>{});}
    await h.finish(error);
  }
}
