// Gate-1 supplementary normal-input acceptance. No product mutations or state injection.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {cameraActive,walking,createJuryHarness,jpegSize,photoFacts,sha} from './jury-p0-input.mjs';
import {P0_ROUTE} from './p0-route-plan.mjs';

const GAME=fileURLToPath(new URL('../../',import.meta.url));
const QA=fileURLToPath(new URL('../../../production/iteration-jury-remediation-20261116/qa/',import.meta.url));
const json=async file=>JSON.parse(await readFile(file,'utf8'));
export async function gateBinding(id){
  const b=await json(join(QA,'GATE1-OWNER-BINDING.json'));
  assert.equal(b.runnable,true,'Gate-1 is disabled until root freezes candidate, budget and source hashes');
  assert.equal(b.postalContractConfirmed,true,'new genuine postal two-subject composition must be delivered and bound first');
  assert.ok(b.enabledProbes?.includes(id));assert.match(b.candidateManifest,/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.json$/);
  const bytes=await readFile(join(QA,b.candidateManifest)),manifest=JSON.parse(bytes);
  assert.equal(manifest.engine,'0.5.0');assert.equal(manifest.sdk,'0.2.0');assert.ok(Object.keys(manifest.files??{}).length);
  for(const [file,hash]of Object.entries(manifest.files)){
    assert.ok((file.startsWith('assets/')||file.startsWith('scripts/')||['package.json','pnpm-lock.yaml','forge.json'].includes(file))&&!file.split('/').includes('..'));
    assert.equal(sha(await readFile(join(GAME,file))),hash,`frozen Gate-1 candidate changed: ${file}`);
  }
  assert.equal((await json(join(GAME,'node_modules/@forgeax/engine/package.json'))).version,'0.5.0');
  assert.equal((await json(join(GAME,'node_modules/zaohua-platform-sdk/package.json'))).version,'0.2.0');
  const budgetMs=b.budgetsMs?.[id];assert.ok(Number.isFinite(budgetMs)&&budgetMs>0&&budgetMs<=(id==='gate1-west'?480000:600000));
  return {probe:id,budgetMs,candidate:manifest.commit,manifestSha256:sha(bytes),segmentBudgetsMs:{}};
}
// Postal author froze this actual timber-frame/eave view; root still must bind a source candidate.
export const GATE1_VIEWS={post:{feet:[2,-214],target:[-3,16.4,-231]},forest:P0_ROUTE.forestPhoto,
  town:{feet:[155,-3],target:[155,29,10]},ridge:{feet:[64,204],target:[48.568,61.842,108.132]}};
export const GATE1_LOOK_OFFSETS=[0,-.022,-.044,-.066];
function sameCamera(actual,expected){
  for(const vector of ['position','forward'])for(let i=0;i<3;i++)
    assert.ok(Math.abs(actual[vector][i]-expected[vector][i])<1e-5,`saved camera ${vector}[${i}] must match the last ordinary composition`);
  for(const field of ['verticalFovRadians','aspect'])assert.ok(Math.abs(actual[field]-expected[field])<1e-8);
}
function frameSummary(samples){
  const baseline=Math.max(-Infinity,...(samples[0]?.completedFrames??[]).map(e=>e.completedAtMs));
  const frames=[...new Map(samples.flatMap(s=>s.completedFrames??[])
    .filter(e=>e.completedAtMs>baseline&&e.frame?.presentation==='ready')
    .map(e=>[`${e.frame.deviceGeneration}/${e.frame.worldIdentity}/${e.frame.frameId}`,e])).values()].sort((a,b)=>a.completedAtMs-b.completedAtMs);
  const gaps=frames.slice(1).map((f,i)=>f.completedAtMs-frames[i].completedAtMs).filter(v=>v>0).sort((a,b)=>a-b);
  const durationMs=frames.length>1?frames.at(-1).completedAtMs-frames[0].completedAtMs:0;
  const historyOverruns=samples.slice(1).flatMap((sample,index)=>{
    const previous=samples[index].completedFrames??[],current=sample.completedFrames??[];
    return previous.length&&current.length>=120&&current[0].completedAtMs>previous.at(-1).completedAtMs
      ?[{previousEnd:previous.at(-1).completedAtMs,nextStart:current[0].completedAtMs}]:[];
  });
  return {source:'actual completed ready frames',count:frames.length,durationMs,meanFps:durationMs>0?(frames.length-1)*1000/durationMs:null,
    medianFrameMs:gaps.length?gaps[Math.floor(gaps.length*.5)]:null,p95FrameMs:gaps.length?gaps[Math.min(gaps.length-1,Math.floor(gaps.length*.95))]:null,historyOverruns};
}
export function createGate1Run(side,binding){
  return async play=>{
    const plan={id:`gate1-${side}`,revision:'gate1-normal-mixed-reload-01',viewport:[1920,1080],
      coverage:'two regions each normal eight plus CPU4 eight; four true-subject/matched and four free photographs per group; reload each film before exporting all eight originals'};
    const h=await createJuryHarness(play,plan,binding);let cdp,error;
    h.report.groups=[];h.report.subjectEvidence=[];h.report.reloadedFilms=[];h.report.cpuConditions=[];
    h.report.postalContract={required:'genuine optional two-subject geometry, not daily check-in as a substitute',
      actualEvidence:'pre-shutter read-only observation and camera.ready/alignment; saved original scene matches the real camera',
      persistedGoalFlag:false,limitation:'postal composition has no independent persisted match flag; no tutorialMatch fabrication'};
    h.report.dailyCheckInGate='not covered: natural clock/weather remain unchanged; geometric 100% is distinct from daily weather/time check-in';
    const ordinal=()=>h.report.photos.length;
    const matched=(s,id)=>{
      if(id==='post')return s.state.runtime.observation?.vantageTags.includes('post-porch-view')
        &&['post-door-frame','post-eave'].every(id=>{
          const anchor=s.state.runtime.observation.anchors[id];
          return anchor&&anchor.depth>0&&anchor.visibleFraction>=.95&&anchor.occluded===false;
        })&&s.view.camera.ready===true&&s.view.camera.alignment===1;
      if(id==='ridge')return s.view.camera.memory?.ready===true&&s.view.camera.memory?.alignment===1;
      return s.view.camera.ready===true&&s.view.camera.alignment===1&&s.view.camera.target===id;
    };
    const retainedPhoto=p=>({...photoFacts(p),memoryCandidates:p.memoryCandidates,tutorialMatch:p.tutorialMatch,
      caption:p.caption,capturedAt:p.capturedAt,playSeconds:p.playSeconds});
    async function downloadOriginal(photo,label){
      const pending=play.page.waitForEvent('download',{timeout:12000});
      const [,download]=await Promise.all([(async()=>{await h.tabs(5);await h.key('Enter');})(),pending]);
      const suggestedFilename=download.suggestedFilename();
      assert.equal(suggestedFilename,`拍一卷山色-${photo.sequence}-${photo.scene.weather}.jpg`,'normal UI must export the requested different photo, not a repeated selection');
      const file=join(h.out,`${label}-${photo.sequence}-after-reload.jpg`);await download.saveAs(file);assert.equal(await download.failure(),null);
      const bytes=await readFile(file),size=jpegSize(bytes);assert.deepEqual(size,{width:1920,height:1080});assert.equal(bytes.length,photo.original.bytes);
      h.report.downloads.push({name:`${label}-${photo.sequence}-after-reload`,photoId:photo.id,originalKey:photo.original.key,
        file,suggestedFilename,...size,bytes:bytes.length,sha256:sha(bytes)});
    }
    async function exportReloadedFilm(photos,label){
      await h.lowerCamera();await h.key('Escape');await h.wait(s=>s.state.runtime.screen==='paused'&&s.view?.saveStatus==='saved');
      const before=await h.read(),film=before.state.durable.film.map(retainedPhoto);assert.deepEqual(film,photos.map(retainedPhoto));
      await play.reload();const loaded=await h.wait(s=>s.restored&&s.state.runtime.screen==='menu');
      assert.equal(loaded.state.durable.totalPhotos,before.state.durable.totalPhotos);assert.deepEqual(loaded.state.durable.film.map(retainedPhoto),film);
      for(const key of ['stamps','gateOpened','discoveries','clock','weather','weatherCycle','checkIns'])
        assert.deepEqual(loaded.state.durable[key],before.state.durable[key],`normal reload must retain ${key}`);
      h.report.reloadedFilms.push({label,totalPhotos:loaded.state.durable.totalPhotos,film});
      await h.key('Tab');await h.key('Enter');await h.wait(walking);await h.key('KeyC');await h.wait(cameraActive);
      await h.key('KeyJ');await h.wait(s=>s.state.runtime.screen==='journal'&&s.controller.paused);
      await h.tabs(4);await h.key('Enter');await h.tabs(5);await h.key('Enter');
      for(const [index,photo]of [...photos].reverse().entries()){
        await h.tabs(index===0?2:7+index);await h.key('Enter');
        await downloadOriginal(photo,label);await h.key('Escape');
      }
      const exported=h.report.downloads.slice(-8);assert.equal(new Set(exported.map(p=>p.sha256)).size,8,'ordinary camera micro-adjustments must produce eight different original JPEGs');
      await h.key('Escape');await h.wait(cameraActive);await h.lowerCamera();
    }
    async function group(id,label,rate){
      await h.cameraAt(GATE1_VIEWS[id],`${id}-${label}-subject-view`);
      const aligned=await h.wait(s=>cameraActive(s)&&matched(s,id),3500),alignedYaw=aligned.controller.yaw,alignedPitch=aligned.controller.pitch;
      cdp=await play.page.context().newCDPSession(play.page);await cdp.send('Emulation.setCPUThrottlingRate',{rate});
      h.report.cpuConditions.push({id,label,rate,acknowledgedAt:new Date().toISOString()});
      const photos=[],frameWindows=[];
      try{
        await h.uiRead();
        for(const kind of ['subject','free']){
          for(let n=0;n<4;n++){
            await h.turnTo(alignedYaw+(kind==='free'?Math.PI/2:0)+GATE1_LOOK_OFFSETS[n],alignedPitch);
            const s=await h.wait(cameraActive);
            if(kind==='subject')assert.ok(matched(s,id),`${id}: actual composition/subject stopped matching`);
            else assert.equal(matched(s,id),false,`${id}: free view must differ from the matched view`);
            const frameStart=h.report.frameSamples.length;
            const p=await h.photograph(`${id}-${label}-${kind}-${n+1}`,{screenshot:false,
              ...(kind==='subject'&&(id==='forest'||id==='town')?{matchedCard:id}:{})});
            const window=frameSummary(h.report.frameSamples.slice(frameStart));
            assert.ok(window.count>=2&&window.durationMs>0,'each real shutter must have a measured completed-frame interval');
            assert.deepEqual(window.historyOverruns,[],'completed-frame history was truncated within a shutter; FPS condition cannot be claimed');
            frameWindows.push({photoId:p.id,...window});
            sameCamera(p.scene.camera,s.controller.camera);
            if(kind==='subject'&&id==='ridge')assert.ok(p.memoryCandidates.includes('valley-letter'));
            if(kind==='free'){assert.deepEqual(p.matchedCards,[]);assert.deepEqual(p.memoryCandidates,[]);assert.equal(p.tutorialMatch,false);}
            h.report.subjectEvidence.push({area:id,label,kind,photoId:p.id,view:s.view.camera,anchors:s.state.runtime.observation?.anchors,
              preShutterCamera:s.controller.camera,savedCamera:p.scene.camera,requestedYawOffset:GATE1_LOOK_OFFSETS[n],
              actualClock:p.scene.clock,actualWeather:p.scene.weather,actualWeatherBlend:p.scene.weatherBlend,
              matchedCards:p.matchedCards,memoryCandidates:p.memoryCandidates,tutorialMatch:p.tutorialMatch,
              criterion:id==='post'?'postal optional two-subject real 100-percent geometry':id==='ridge'?'valley-letter real 100-percent geometry':'main postcard real 100-percent geometry'});
            photos.push(p);
          }
        }
        const durationMs=frameWindows.reduce((sum,w)=>sum+w.durationMs,0),intervals=frameWindows.reduce((sum,w)=>sum+w.count-1,0);
        const frames={source:'actual completed ready-frame intervals during eight ordinary shutters; camera-turn and modal gaps excluded',
          count:frameWindows.reduce((sum,w)=>sum+w.count,0),durationMs,meanFps:intervals*1000/durationMs,windows:frameWindows};
        assert.equal(new Set(photos.map(p=>p.id)).size,8);assert.equal(new Set(photos.map(p=>p.original.key)).size,8);
        assert.equal(new Set(photos.map(p=>JSON.stringify(p.scene.camera.forward))).size,8,'each ordinary micro-adjustment must reach a different camera orientation');
        h.report.groups.push({area:id,label,cpuRate:rate,frames,photos:photos.map(photoFacts),completedShutters:8,alignedPhotos:4,
          freePhotos:4,actualSubjectCamera:aligned.controller.camera});
      }finally{await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});await cdp.detach();cdp=undefined;}
      await h.shot(`${id}-${label}-eight-saved-before-reload`);await exportReloadedFilm(photos,`${id}-${label}`);
    }
    async function area(id){
      const start=ordinal();await group(id,'normal',1);await group(id,'cpu4',4);
      assert.equal(ordinal()-start,16);const normal=h.report.groups.find(g=>g.area===id&&g.label==='normal'),slow=h.report.groups.find(g=>g.area===id&&g.label==='cpu4');
      const ratio=slow.frames.meanFps/normal.frames.meanFps;
      const condition={area:id,normalMeanFps:normal.frames.meanFps,throttledMeanFps:slow.frames.meanFps,ratio,reducedRateObserved:ratio<.95};
      (h.report.perAreaFrameRateConditions??=[]).push(condition);
      assert.ok(condition.reducedRateObserved,`${id}: CPU4 did not reduce actual ready-frame FPS >=5%; retain observations and stop, no escalation`);
    }
    try{
      await h.startFresh();assert.equal((await h.uiRead()).ready,true);
      if(side==='west'){
        await h.step('postal-real-subject-free-and-reloaded-films',async()=>{await h.route([[9.75,-226],[0,-220]],.3);await area('post');});
        await h.step('forest-real-100-percent-free-and-reloaded-films',async()=>{await h.route([[0,-220],...P0_ROUTE.forest.slice(1)],1.1,true);await area('forest');});
      }else{
        await h.step('town-normal-crank-and-real-100-percent-free',async()=>{
          await h.route(P0_ROUTE.town.slice(0,-1),1.1,true);await h.route(P0_ROUTE.lever,.25);
          await h.wait(s=>walking(s)&&s.state.runtime.nearby==='town-gate');await h.key('KeyE');await h.wait(s=>s.state.durable.gateOpened);
          await h.route([[148,-2],[155,-3]],.25);await area('town');
        });
        await h.step('ridge-bench-discovery-real-memory-alignment-and-free',async()=>{
          await h.route([[155,5],[155,20],[194,59],[216,109],[171,135],[126,178],[64,204]],1.1,true);
          await h.wait(s=>walking(s)&&s.state.runtime.nearby==='discover:sunset-seat');await h.key('KeyE');
          await h.wait(s=>s.state.durable.discoveries.some(d=>d.id==='sunset-seat'));await area('ridge');
        });
      }
      assert.equal(h.report.photos.length,32);assert.equal(h.report.downloads.length,32);assert.equal(h.report.reloadedFilms.length,4);
      assert.equal(new Set(h.report.downloads.map(p=>p.photoId)).size,32);
      assert.equal(new Set(h.report.downloads.map(p=>p.originalKey)).size,32);
      assert.equal(new Set(h.report.downloads.map(p=>p.suggestedFilename)).size,32);
      await h.shot(`gate1-${side}-ordinary-final-state`);
    }catch(e){error=e;throw e;}finally{
      if(cdp){await cdp.send('Emulation.setCPUThrottlingRate',{rate:1}).catch(()=>{});await cdp.detach().catch(()=>{});}
      await h.finish(error);
    }
  };
}
