// One frozen official owner. Ordinary keys/pointer/reload only.
// CDP changes CPU simulation only; it never evaluates JS or touches game/storage state.
import assert from 'node:assert/strict';
import {cameraActive,walking,createJuryHarness,loadJuryBinding,photoFacts} from './jury-p0-input.mjs';
import {P0_ROUTE} from './p0-route-plan.mjs';

const BINDING=await loadJuryBinding('p0');
export const PLAN={id:'jury-p0-probe',revision:'jury-p0-normal-input-01',viewport:[1920,1080],
  coverage:'days 1–3 unique outings; ordinary postal/town/forest/ridge route; visible crank; shoulder/grass steps; wall camera; one matched forest photo; 8 normal and 8 CPU-throttled ridge photos at the same camera; 16 original downloads; reload retention'};
const westRidge=[[-170,-35],[-204,6],[-229,61],[-204,106],[-143,129],[-93,183],
  [-76.65,196.22],[-58.35,206.78],[-59.76,208.72],[-42,220],[-20,228],[-15,228],[-15,235],[0,235]];
const bodyDistance=s=>Math.hypot(s.controller.camera.position[0]-s.controller.position[0],
  s.controller.camera.position[1]-s.controller.position[1]-1.38,s.controller.camera.position[2]-s.controller.position[2]);

export function completedFrameSummary(samples){
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

/** @param {import('@forgeax/engine/devkit').PlayContext} play */
export default async function juryP0Probe(play){
  const h=await createJuryHarness(play,PLAN,BINDING);let error,cdp;
  h.report.captureGroups=[];h.report.outings=[];
  assert.ok(BINDING.budgetMs<=720000,'one P0 probe is bounded to twelve minutes, excluding CLI startup');
  async function schedule(day){
    const s=await h.read(),slots=s.view?.outings?.slots;
    assert.equal(s.state.durable.clock.day,day);assert.equal(slots?.length,3);
    assert.equal(new Set(slots.map(e=>e.spotId)).size,3,`day ${day} repeats a photograph across time slots`);
    h.report.outings.push({day,clock:s.state.durable.clock,slots});
    await h.click(960,43);await h.wait(s=>s.controller.paused);await h.shot(`day-${day}-three-distinct-recommendations`);
    await h.key('Escape');await h.wait(walking);
  }
  async function nextMorning(day){
    const before=await h.wait(walking);assert.ok(before.view?.restPoint?.available);
    await h.key('KeyE');await h.wait(s=>s.controller.paused&&s.state.runtime.pauseReasons.includes('ui'));
    await h.tabs(2);await h.key('Enter');
    const s=await h.wait(s=>walking(s)&&s.state.durable.clock.day===day,10000);
    assert.ok(s.state.durable.clock.minute>=380&&s.state.durable.clock.minute<384);
    assert.equal(s.state.durable.creativeMode,false);await schedule(day);
  }
  async function exportFilm(photos,label){
    await h.wait(cameraActive);await h.key('KeyJ');await h.wait(s=>s.state.runtime.screen==='journal'&&s.controller.paused);
    // Dialog close + three journal tabs. Tab has no data-action, so normal
    // redraw returns focus to the dialog; choose film (fifth focusable control).
    await h.tabs(4);await h.key('Enter');await h.tabs(5);await h.key('Enter');
    const reversed=[...photos].reverse();
    for(let index=0;index<reversed.length;index++){
      // The first selection starts on film; subsequent Escape redraws start
      // from the dialog. Keep keyboard chains free of screenshot focus changes.
      await h.tabs(index===0?2:7+index);await h.key('Enter');
      const photo=reversed[index];
      await h.download(`${label}-${photo.sequence}-original`,async()=>{await h.tabs(5);await h.key('Enter');},[1920,1080],
        {photoId:photo.id,bytes:photo.original.bytes});
      await h.key('Escape');
    }
    await h.key('Escape');await h.wait(cameraActive);
  }
  async function burst(label,rate){
    if(rate!==1){
      cdp=await play.page.context().newCDPSession(play.page);
      await cdp.send('Emulation.setCPUThrottlingRate',{rate});
    }
    const startIndex=h.report.frameSamples.length,photos=[];
    try{
      await h.uiRead();
      for(let n=0;n<8;n++)photos.push(await h.photograph(`${label}-${n+1}`,{screenshot:false}));
      await h.uiRead();
      const frames=completedFrameSummary(h.report.frameSamples.slice(startIndex));
      assert.ok(frames.count>=8&&frames.durationMs>0,'actual completed ready-frame telemetry is required; controller ticks are not FPS');
      assert.equal(new Set(photos.map(p=>p.id)).size,8);assert.equal(new Set(photos.map(p=>p.original.key)).size,8);
      h.report.captureGroups.push({label,requestedCpuRate:rate,photos:photos.map(photoFacts),frames,
        ordinaryShutters:8,actualSavedPhotos:8,complete:true});
    }finally{if(cdp){await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});await cdp.detach();cdp=undefined;}}
    await h.shot(`${label}-eight-real-saved-photos`);await exportFilm(photos,label);return photos;
  }
  async function reloadRetained(photos){
    await h.lowerCamera();await h.key('Escape');await h.wait(s=>s.state.runtime.screen==='paused'&&s.view?.saveStatus==='saved');
    const before=await h.read(),film=before.state.durable.film.map(photoFacts);await play.reload();
    const restored=await h.wait(s=>s.restored&&s.state.runtime.screen==='menu');
    assert.equal(restored.state.durable.totalPhotos,17);assert.deepEqual(restored.state.durable.film.map(photoFacts),film);
    assert.deepEqual(restored.state.durable.clock,before.state.durable.clock);assert.equal(restored.state.durable.gateOpened,true);
    await h.key('Tab');await h.key('Enter');await h.wait(walking);await h.key('KeyC');await h.wait(cameraActive);
    // Prove IndexedDB originals, not only durable metadata, survive reload.
    await exportFilm(photos,'reloaded-throttled');
    const downloads=h.report.downloads;
    for(const p of photos){const a=downloads.find(d=>d.name===`throttled-${p.sequence}-original`),b=downloads.find(d=>d.name===`reloaded-throttled-${p.sequence}-original`);assert.equal(a.sha256,b.sha256);}
    await h.lowerCamera();await h.shot('reloaded-eight-originals-and-progress-retained');
  }
  try{
    await h.runSegment('approach',async()=>{
      await h.startFresh();await schedule(1);await nextMorning(2);await nextMorning(3);
      await h.route([[9.75,-237],[4.05,-237]],.2);await h.turnTo(Math.PI/2,0);
      const near=await h.read();assert.ok(bodyDistance(near)<1.8);assert.equal(near.controller.avatarVisible,false);
      await h.shot('post-wall-close-camera-clears-backpack');
      await h.route([[9.75,-237],[9.75,-226]],.2);await h.wait(s=>walking(s)&&s.controller.avatarVisible&&bodyDistance(s)>2.2);
      await h.shot('post-wall-third-person-restored');
      await h.route(P0_ROUTE.town.slice(0,-1),1.1,true);await h.route(P0_ROUTE.lever,.25);
      const lever=await h.wait(s=>walking(s)&&s.state.runtime.nearby==='town-gate');
      assert.ok(lever.view.outings.slots.concat(lever.view.outings.tracked??[]).every(s=>!String(s.preparation??'').includes('石拱左侧')));
      await h.shot('town-right-hand-red-rope-prompt');await h.key('KeyE');await h.wait(s=>s.state.durable.gateOpened);
      await h.route([[148,-2],[155,-19],[128,-60],[92,-100],[75,-143],[38,-185],[0,-220]],1.1,true);
      await h.route(P0_ROUTE.forest,1.1,true);await h.cameraAt(P0_ROUTE.forestPhoto,'normal-forest');
      await h.photograph('forest-real-matched-photo',{matchedCard:'forest'});
    });
    await h.runSegment('ridge',async()=>{
      await h.lowerCamera();await h.route(westRidge,.35,true);await h.shot('ridge-after-shoulder-grass-running');
      await h.route([[15,235],[15,226],[20,226],[46.184,214.850],[46.184,215.05]],.08);
      await h.shot('ridge-three-quarter-metre-grass-step');
      await h.route([[46.184,214.850],[20,226],[15,226],[15,235],[0,235]],.35);
      await h.cameraAt(P0_ROUTE.ridgePhoto,'throttled-ridge');
    });
    await h.runSegment('normal',async()=>{await burst('normal',1);});
    let slowPhotos;
    await h.runSegment('throttled',async()=>{slowPhotos=await burst('throttled',2);});
    await h.runSegment('reload',async()=>{await reloadRetained(slowPhotos);});
    const [normal,slow]=h.report.captureGroups;
    h.report.frameRateCondition={normalMeanFps:normal.frames.meanFps,throttledMeanFps:slow.frames.meanFps,
      reducedRateObserved:slow.frames.meanFps<normal.frames.meanFps*.95,
      limitation:'CPU emulation does not guarantee slower GPU presentation; if the observed FPS is not lower, the reduced-frame-rate gate remains unverified.'};
    assert.equal(h.report.photos.length,17);assert.equal(h.report.downloads.length,24);
  }catch(e){error=e;throw e;}finally{
    if(cdp){await cdp.send('Emulation.setCPUThrottlingRate',{rate:1}).catch(()=>{});await cdp.detach().catch(()=>{});}
    await h.finish(error);
  }
}
