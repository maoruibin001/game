// Ordinary owner inputs + read-only projection. Root is the only runtime runner.
// No DOM/eval, game imports, state injection, teleport, or virtual-time advance.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';

export const FORECAST_PERSISTENCE_PLAN = Object.freeze({
  revision: 'forecast-persistence-20261116-focused-04', budgetMs: 420000,
  viewport: [1920, 1080], output: '../../artifacts/qa/weather-photo-04/',
  coordinateEvidence: 'production/evidence/presentation/weather-photo/control-coordinates-component-only.json',
  coverage: 'focused normal portrait/timed original; film/album; original download/reload; one manual forecast reset; precise forecast persistence with <=1s checkpoint delta; one real natural cycle',
});
const READ = 'shan.journey';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const cameraActive = s => s.state.runtime.screen === 'photo' && s.controller.mode === 'photo'
  && !s.controller.paused && !s.pendingCapture && !s.state.durable.pendingPhoto
  && s.state.runtime.pauseReasons.length === 0 && s.frontend?.focus?.target === 'canvas';
const walking = s => s.state.runtime.screen === 'play' && s.controller.mode === 'walk'
  && !s.controller.paused && s.state.runtime.pauseReasons.length === 0;
const latest = s => s.state.durable.film.at(-1);
const photoFacts = p => ({ id:p.id, sequence:p.sequence, matchedCards:p.matchedCards,
  original:p.original, scene:p.scene, thumbnailSha256:sha(p.thumbnail ?? '') });
function forecastFacts(s) {
  const f=s.forecast,c=s.state.durable.weatherCycle;
  assert.ok(f&&c,'existing read-only shan.journey.forecast and weatherCycle are required');
  assert.deepEqual(Object.keys(f.probabilities).sort(),['afterglow','morning','rain']);
  const values=Object.values(f.probabilities);
  assert.ok(values.every(p=>Number.isInteger(p)&&p>=0&&p<=100));
  assert.equal(values.reduce((a,b)=>a+b,0),100);
  assert.ok(Number.isFinite(f.observedAtSeconds)&&f.observedAtSeconds>=0);
  assert.ok(Number.isFinite(f.changeInSeconds)&&f.changeInSeconds>=0);
  assert.ok(Number.isInteger(c.cycle)&&c.cycle>=0);
  assert.ok(c.durationSeconds>=210&&c.durationSeconds<=300,'ordinary natural cycle must not be shortened for QA');
  return structuredClone({forecast:f,cycle:c,weather:s.state.durable.weather,playSeconds:s.state.durable.playSeconds});
}
function jpegSize(bytes) {
  assert.equal(bytes.readUInt16BE(0), 0xffd8, 'export must be a real JPEG');
  let at = 2;
  while (at < bytes.length - 9) {
    while (bytes[at] === 0xff) at++;
    const marker = bytes[at++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) continue;
    const length = bytes.readUInt16BE(at);
    assert.ok(length >= 2 && at + length <= bytes.length, 'valid JPEG segment');
    if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
      return { width:bytes.readUInt16BE(at+5), height:bytes.readUInt16BE(at+3) };
    }
    at += length;
  }
  assert.fail('JPEG has no decodable SOF dimensions');
}
/** @param {import('@forgeax/engine/devkit').PlayContext} play */
export default async function forecastPersistence(play) {
  const began=Date.now(), out=fileURLToPath(new URL(FORECAST_PERSISTENCE_PLAN.output,import.meta.url));
  await mkdir(dirname(out),{recursive:true});
  await mkdir(out,{recursive:false}); // Refuse silently overwriting an earlier run.
  const report={plan:FORECAST_PERSISTENCE_PLAN,startedAt:new Date().toISOString(),status:'running',
    timeline:[],photos:[],downloads:[],qaSettlingMs:0,qaNaturalWaitMs:0,forecastObservations:[],notCovered:[
      'OWNER03 first six passed steps reused; no repeated three-weather/lens/pose/cancellation suite',
      'three distant hero compositions and full old route', 'window/background cancellation',
      'weather shelter audio listening', 'new portrait quality/occlusion verdict pending image review',
      'postcard-layout export and unshipped aspect modes', '15-minute natural play/performance',
      'capacity/migration/independent references reuse corresponding unit tests, not new owner coverage']};
  const budget=()=>{assert.ok(!play.signal.aborted,'owner aborted');assert.ok(Date.now()-began<FORECAST_PERSISTENCE_PLAN.budgetMs,'forecast-photo 420-second budget exceeded');};
  const read=async()=>{budget();return play.state(READ);};
  const wait=async(fn,ms=7000)=>{budget();return play.waitFor(fn,{read:READ,timeoutMs:Math.max(1,Math.min(ms,FORECAST_PERSISTENCE_PLAN.budgetMs-(Date.now()-began)))});};
  const settle=async(ms=80)=>{budget();await play.wait(ms);report.qaSettlingMs+=ms;};
  const key=async(code)=>{budget();await play.keyboard.press(code);await settle();};
  const tabs=async(n)=>{for(let i=0;i<n;i++)await key('Tab');};
  const click=async(x,y)=>{budget();await play.mouse.click([x/1920,y/1080]);await settle();};
  const step=(name,fn)=>play.step(name,async()=>{budget();return fn();});
  const shot=async(name)=>{
    const s=await read();await play.screenshot(name);
    const event={name,elapsedMs:Date.now()-began,screen:s.state.runtime.screen,
      position:s.controller.position,camera:s.controller.camera,avatarVisible:s.controller.avatarVisible,
      photography:s.controller.photography,environment:s.environment,forecast:s.forecast,weatherCycle:s.state.durable.weatherCycle,
      countdown:s.state.runtime.countdownSeconds,pendingCapture:s.pendingCapture,
      film:s.state.durable.film.map(p=>p.id),album:s.state.durable.album.map(p=>p.id),
      total:s.state.durable.totalPhotos,stamps:s.state.durable.stamps,world:s.world,focus:s.frontend?.focus};
    report.timeline.push(event);console.log(JSON.stringify(event));return s;
  };
  const choose=async(field,value,x,y)=>{
    await click(x,y);
    return wait(s=>s.state.durable.photography[field]===value
      && s.controller.photography.settings[field]===value && cameraActive(s));
  };
  const weather=async(id,index)=>{
    const before=forecastFacts(await read());
    await click(1736,114);await click(1700,[164,207,249][index]);
    const s=await wait(s=>s.state.durable.weather===id && s.environment.weather===id
      && s.environment.settled && s.environment.blend>=.999 && cameraActive(s),10000);
    const after=forecastFacts(s);
    assert.equal(after.cycle.cycle,before.cycle.cycle+1,'manual weather must genuinely re-observe');
    assert.equal(after.cycle.seed,before.cycle.seed,'manual observation must retain the persistent sequence seed');
    assert.ok(after.cycle.elapsedSeconds<5,'manual observation must restart a full-length cycle');
    assert.ok(after.forecast.observedAtSeconds>=before.forecast.observedAtSeconds);
    report.forecastObservations.push({kind:'manual-reobservation',requested:id,before,after});
    report.finalManualCycle=after;
    return s;
  };
  async function photograph(name,{timer=false}={}) {
    const before=await wait(cameraActive);
    assert.equal(before.state.runtime.countdownSeconds,null);
    await key('Space');
    if(timer) await wait(s=>s.state.runtime.countdownSeconds!==null,1500);
    const after=await wait(s=>cameraActive(s) && s.state.durable.totalPhotos===before.state.durable.totalPhotos+1,12000);
    const p=latest(after);assert.ok(p?.original && p.thumbnail?.startsWith('data:image/jpeg;'));
    assert.equal(after.state.durable.pendingPhoto,null,'new capture must not force the legacy review modal');
    assert.equal(after.state.durable.film.length,Math.min(8,before.state.durable.film.length+1));
    assert.equal(p.original.mime,'image/jpeg');assert.ok(p.original.width>=1920,'actual original must be at least 1920 pixels wide');
    assert.ok(p.original.bytes>10000);assert.ok(p.scene);
    assert.equal(p.scene.weather,after.environment.weather);
    assert.equal(p.scene.mode,after.state.durable.photography.mode);
    assert.equal(p.scene.pose,after.state.durable.photography.pose);
    assert.equal(p.scene.lens,after.state.durable.photography.lens);
    assert.equal(p.scene.exposure,after.state.durable.photography.exposure);
    report.photos.push({name,...photoFacts(p)});await shot(name);return structuredClone(p);
  }
  async function openLatest() {
    await click(80,120);await wait(s=>s.state.runtime.screen==='journal' && s.state.runtime.pauseReasons.includes('ui'));
  }
  async function closeDetails() { await key('Escape');await key('Escape');await wait(cameraActive); }
  async function exportDetail(photo,name,kept=false) {
    const pending=play.page.waitForEvent('download',{timeout:10000});
    // Native Page download event only. No DOM, evaluation, Blob fetch, or repository call.
    let failure;
    try { await tabs(kept?4:5);await key('Enter'); }
    catch(error){failure=error;}
    const download=await pending;
    if(failure)throw failure;
    const target=join(out,`${name}.jpg`);await download.saveAs(target);
    const error=await download.failure();assert.equal(error,null);
    const bytes=await readFile(target),size=jpegSize(bytes);
    assert.equal(size.width,photo.original.width);assert.equal(size.height,photo.original.height);
    assert.equal(bytes.length,photo.original.bytes);assert.ok(size.width>=1920);
    const evidence={name,photoId:photo.id,file:target,suggestedFilename:download.suggestedFilename(),
      bytes:bytes.length,sha256:sha(bytes),...size};report.downloads.push(evidence);
    console.log(JSON.stringify({name:'original-downloaded',...evidence}));return evidence;
  }
  let retained, exported;
  try {
    await step('weather-normal-start',async()=>{
      const s=await wait(s=>s.restored && s.state.runtime.screen==='menu');
      assert.equal(s.state.durable.started,false,'requires fresh ordinary owner context; never overwrite an existing journey');
      await shot('weather-menu');await tabs(1);await key('Enter');await wait(walking);
      await play.keyboard.hold('KeyW',900);await settle();await key('KeyC');await wait(cameraActive);
      await choose('mode','portrait',1827,221);
      const p=await wait(s=>cameraActive(s)&&s.controller.photography.candidateAvailable&&s.controller.photography.subjectVisible);
      assert.ok(p.controller.avatarVisible);await shot('portrait-default-before-weather');
      report.forecastObservations.push({kind:'initial',...forecastFacts(p)});
      await click(960,95);await shot('forecast-initial-expanded');
    });
    await step('manual-afterglow-and-one-real-timer-photo',async()=>{
      await weather('afterglow',2);await shot('forecast-manually-reobserved');
      await click(960,95);
      await choose('timerSeconds',3,1827,547);
      retained=await photograph('portrait-real-timer',{timer:true});
      assert.equal(retained.scene.mode,'portrait');assert.ok(retained.scene.subject.visible);
    });
    await step('choose-film-album-and-export-original',async()=>{
      await openLatest();await shot('film-detail-before-keep');
      await tabs(2);await key('Enter');await wait(s=>s.state.durable.album.some(p=>p.id===retained.id));
      await shot('film-kept-in-album');exported=await exportDetail(retained,'retained-before-reload',true);
      await closeDetails();const s=await read();
      assert.equal(s.state.durable.pendingPhoto,null);assert.equal(s.state.durable.film.length,1);
      assert.deepEqual(s.state.durable.stamps,{forest:false,town:false});assert.equal(s.state.durable.mailed,false);
      assert.equal(s.state.durable.memories['valley-letter'],null,'unmatched free photos cannot bypass old memory clues');
      report.persisted={film:s.state.durable.film.map(photoFacts),album:s.state.durable.album.map(photoFacts),weather:s.state.durable.weather,photography:s.state.durable.photography};
      report.persistedForecast=forecastFacts(s);
    });
    await step('normal-reload-and-identical-original-download',async()=>{
      await play.reload();const restored=await wait(s=>s.restored && s.state.runtime.screen==='menu');await shot('restored-normal-menu');
      const restoredForecast=forecastFacts(restored),previous=report.persistedForecast;
      assert.equal(restoredForecast.cycle.seed,previous.cycle.seed);
      assert.equal(restoredForecast.cycle.cycle,previous.cycle.cycle);
      assert.equal(restoredForecast.cycle.durationSeconds,previous.cycle.durationSeconds);
      const elapsedDelta=restoredForecast.cycle.elapsedSeconds-previous.cycle.elapsedSeconds;
      report.forecastRestoreDelta={elapsedSeconds:elapsedDelta,playSeconds:restoredForecast.playSeconds-previous.playSeconds,
        observedAtSeconds:restoredForecast.forecast.observedAtSeconds-previous.forecast.observedAtSeconds,
        allowedAbsoluteCheckpointDeltaSeconds:1,basis:'<=0.4s published checkpoint plus frame; pagehide persists lastMessage'};
      console.log(JSON.stringify({name:'forecast-checkpoint-restore-delta',...report.forecastRestoreDelta}));
      assert.ok(Math.abs(elapsedDelta)<=1,'reload checkpoint delta exceeds the documented 1-second bound');
      assert.deepEqual(restoredForecast.forecast.probabilities,previous.forecast.probabilities);
      // Same observation epoch; only floating subtraction noise is permitted.
      assert.ok(Math.abs(restoredForecast.forecast.observedAtSeconds-previous.forecast.observedAtSeconds)<=1e-6,
        'reload must retain the observation epoch within floating-point precision');
      report.forecastObservations.push({kind:'restored',...restoredForecast});
      await tabs(1);await key('Enter');await wait(walking);
      const s=await read();assert.deepEqual(s.state.durable.film.map(photoFacts),report.persisted.film);
      assert.deepEqual(s.state.durable.album.map(photoFacts),report.persisted.album);
      assert.equal(s.state.durable.weather,report.persisted.weather);assert.deepEqual(s.state.durable.photography,report.persisted.photography);
      await key('KeyC');await wait(cameraActive);await openLatest();await shot('restored-photo-original-detail');
      const second=await exportDetail(retained,'retained-after-reload',true);assert.equal(second.sha256,exported.sha256,'same persisted Blob must download byte-identically');
      await closeDetails();await click(960,95);await shot('forecast-restored-expanded');
    });
    await step('one-real-natural-weather-cycle',async()=>{
      // No clicks, key input, virtual advance, cycle change, or probability-based
      // retry inside this wait. The outcome may legitimately keep the same sky.
      const baseline=report.finalManualCycle,target=baseline.cycle.cycle+1;
      const starting=await read(),photosBefore=starting.state.durable.film.map(photoFacts);
      const worldBefore=structuredClone(starting.world),waitingAt=Date.now();
      await shot('forecast-before-natural-cycle');
      let s=await read();
      while(s.state.durable.weatherCycle.cycle<target) {
        budget();assert.ok(cameraActive(s),'natural observation requires active normal game time');
        assert.equal(s.state.durable.weatherCycle.cycle,baseline.cycle.cycle);
        const delay=Math.min(5000,Math.max(250,(s.forecast.changeInSeconds+.15)*1000));
        await play.wait(delay);report.qaNaturalWaitMs=Date.now()-waitingAt;s=await read();
        const f=forecastFacts(s);
        console.log(JSON.stringify({name:'natural-cycle-observation',elapsedMs:Date.now()-began,
          cycle:f.cycle.cycle,remaining:f.forecast.changeInSeconds,weather:f.weather}));
      }
      report.qaNaturalWaitMs=Date.now()-waitingAt;
      assert.equal(s.state.durable.weatherCycle.cycle,target,'observe exactly one naturally completed cycle');
      assert.ok(baseline.forecast.probabilities[s.state.durable.weather]>0,'natural outcome must have had positive forecast probability');
      assert.equal(s.state.durable.weatherCycle.seed,baseline.cycle.seed);
      s=await wait(x=>x.state.durable.weatherCycle.cycle===target&&x.environment.weather===x.state.durable.weather
        &&x.environment.settled&&!x.pendingCapture,10000);
      assert.deepEqual(s.state.durable.film.map(photoFacts),photosBefore,'weather change must not repaint old photographs');
      assert.deepEqual(s.world,worldBefore,'weather must not reset the original world gates');
      report.naturalCycle={before:baseline,after:forecastFacts(s),sameWeather:s.state.durable.weather===baseline.weather,
        realObservedWaitMs:report.qaNaturalWaitMs,scope:'QA real-clock waiting only, never player-content duration'};
      await shot('forecast-natural-cycle-settled');report.status='functional-checks-passed-visual-review-pending';
    });
  } catch(error) {report.status='failed';report.error=String(error);throw error;}
  finally {report.realElapsedMs=Date.now()-began;report.finishedAt=new Date().toISOString();
    await writeFile(join(out,'acceptance.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    console.log(JSON.stringify({name:'forecast-persistence-result',status:report.status,elapsedMs:report.realElapsedMs,
      qaSettlingMs:report.qaSettlingMs,qaNaturalWaitMs:report.qaNaturalWaitMs,photos:report.photos.length,downloads:report.downloads.length,output:out,error:report.error}));}
  return report;
}
