// Ordinary owner inputs + read-only projection. Root is the only runtime runner.
// No DOM/eval, game imports, state injection, teleport, or virtual-time advance.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';

export const WEATHER_PHOTO_PLAN = Object.freeze({
  revision: 'weather-photo-20261116-normal-input-02', budgetMs: 180000,
  viewport: [1920, 1080], output: '../../artifacts/qa/weather-photo-02/',
  coordinateEvidence: 'production/evidence/presentation/weather-photo/control-coordinates-component-only.json',
  coverage: 'same-camera weather originals; hand-held tools; real portrait; timer/cancel/pause; film/album; original download/reload; free-photo gate negative regression',
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
function closeVector(a,b,tolerance=1e-4) {
  assert.equal(a.length,b.length);
  a.forEach((value,index)=>assert.ok(Math.abs(value-b[index])<=tolerance, 'same-view comparison moved camera or subject'));
}

/** @param {import('@forgeax/engine/devkit').PlayContext} play */
export default async function weatherPhoto(play) {
  const began=Date.now(), out=fileURLToPath(new URL(WEATHER_PHOTO_PLAN.output,import.meta.url));
  await mkdir(dirname(out),{recursive:true});
  await mkdir(out,{recursive:false}); // Refuse silently overwriting an earlier run.
  const report={plan:WEATHER_PHOTO_PLAN,startedAt:new Date().toISOString(),status:'running',
    timeline:[],photos:[],downloads:[],qaSettlingMs:0,notCovered:[
      'three distant hero compositions and full old route', 'window/background cancellation',
      'weather shelter audio listening', 'new portrait quality/occlusion verdict pending image review',
      'postcard-layout export and unshipped aspect modes', '15-minute natural play/performance',
      'capacity/migration/independent references reuse corresponding unit tests, not new owner coverage']};
  const budget=()=>{assert.ok(!play.signal.aborted,'owner aborted');assert.ok(Date.now()-began<WEATHER_PHOTO_PLAN.budgetMs,'weather-photo 180-second budget exceeded');};
  const read=async()=>{budget();return play.state(READ);};
  const wait=async(fn,ms=7000)=>{budget();return play.waitFor(fn,{read:READ,timeoutMs:Math.max(1,Math.min(ms,WEATHER_PHOTO_PLAN.budgetMs-(Date.now()-began)))});};
  const settle=async(ms=80)=>{budget();await play.wait(ms);report.qaSettlingMs+=ms;};
  const key=async(code)=>{budget();await play.keyboard.press(code);await settle();};
  const tabs=async(n)=>{for(let i=0;i<n;i++)await key('Tab');};
  const click=async(x,y)=>{budget();await play.mouse.click([x/1920,y/1080]);await settle();};
  const step=(name,fn)=>play.step(name,async()=>{budget();return fn();});
  const shot=async(name)=>{
    const s=await read();await play.screenshot(name);
    const event={name,elapsedMs:Date.now()-began,screen:s.state.runtime.screen,
      position:s.controller.position,camera:s.controller.camera,avatarVisible:s.controller.avatarVisible,
      photography:s.controller.photography,environment:s.environment,
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
    await click(1736,114);await click(1700,[164,207,249][index]);
    return wait(s=>s.state.durable.weather===id && s.environment.weather===id
      && s.environment.settled && s.environment.blend>=.999 && cameraActive(s),10000);
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
  let sameView, retained, exported;
  try {
    await step('weather-normal-start',async()=>{
      const s=await wait(s=>s.restored && s.state.runtime.screen==='menu');
      assert.equal(s.state.durable.started,false,'requires fresh ordinary owner context; never overwrite an existing journey');
      await shot('weather-menu');await tabs(1);await key('Enter');await wait(walking);
      await play.keyboard.hold('KeyW',900);await settle();await key('KeyC');await wait(cameraActive);
      await choose('mode','portrait',1827,221);
      const p=await wait(s=>cameraActive(s)&&s.controller.photography.candidateAvailable&&s.controller.photography.subjectVisible);
      assert.ok(p.controller.avatarVisible);await shot('portrait-default-before-weather');
    });
    await step('same-view-three-weather-real-originals',async()=>{
      for(const [index,id] of ['morning','rain','afterglow'].entries()) {
        await weather(id,index);await shot(`weather-${id}-preview`);
        const p=await photograph(`weather-${id}-film`);
        assert.equal(p.scene.mode,'portrait');assert.ok(p.scene.subject.visible);
        if(sameView){closeVector(p.scene.camera.position,sameView.camera.position);closeVector(p.scene.camera.forward,sameView.camera.forward);
          closeVector(p.scene.subject.position,sameView.subject.position);assert.equal(p.scene.lens,sameView.lens);
          assert.equal(p.scene.pose,sameView.pose);assert.equal(p.scene.exposure,sameView.exposure);}
        else sameView=structuredClone(p.scene);
        await openLatest();await shot(`weather-${id}-detail`);await exportDetail(p,`same-view-${id}`);await closeDetails();
      }
      const s=await read();assert.equal(s.environment.rain,0);assert.ok(s.environment.wetness>0);
    });
    await step('hand-held-slow-move-lens-and-exposure',async()=>{
      await choose('mode','landscape',1717,221);const before=await read();
      await play.keyboard.hold('KeyW',350);await settle();const after=await wait(cameraActive);
      const moved=Math.hypot(...after.controller.position.map((v,i)=>v-before.controller.position[i]));
      assert.ok(moved>.1&&moved<2,'photo walk must be visible slow ground movement');assert.equal(after.controller.avatarVisible,false);
      const fovs=[];
      for(const [index,lens] of ['wide','standard','detail'].entries()){
        const s=await choose('lens',lens,[1699,1772,1845][index],280);fovs.push(s.controller.camera.verticalFovRadians);await shot(`lens-${lens}`);
      }
      assert.ok(fovs[0]>fovs[1]&&fovs[1]>fovs[2]);
      await choose('lens','wide',1699,280);
      await click(1823,333);await wait(s=>cameraActive(s)&&s.state.durable.photography.exposure===.5&&s.environment.exposure===.5);
      await photograph('landscape-ev-plus-half');
      await click(1772,333);await wait(s=>cameraActive(s)&&s.state.durable.photography.exposure===0);
    });
    await step('portrait-viewpoints-and-three-poses',async()=>{
      await choose('mode','portrait',1827,221);let s=await wait(s=>cameraActive(s)&&s.controller.photography.candidateAvailable);
      const candidates=[...s.controller.photography.availableViewpoints];assert.ok(candidates.length>=2,'default open site should provide two usable ordinary candidates');
      const positions=[];
      for(const index of candidates){s=await choose('viewpoint',index,[1699,1772,1845][index],445);
        assert.ok(s.controller.photography.subjectVisible&&s.controller.avatarVisible);positions.push(s.controller.camera.position);await shot(`portrait-viewpoint-${index}`);}
      assert.ok(Math.hypot(...positions[0].map((v,i)=>v-positions[1][i]))>.3,'different viewpoints require actual distinct camera positions');
      await choose('viewpoint',candidates[0],[1699,1772,1845][candidates[0]],445);
      await choose('pose','look',1699,386);await shot('portrait-look');
      await choose('pose','wave',1772,386);await photograph('portrait-wave');
      await choose('pose','letter',1845,386);await photograph('portrait-letter');
    });
    await step('timer-cancel-pause-and-real-three-seconds',async()=>{
      await choose('timerSeconds',3,1827,547);let before=await read();
      await key('Space');await wait(s=>s.state.runtime.countdownSeconds!==null,1500);await shot('timer-before-cancel');
      await click(960,476);await wait(s=>cameraActive(s)&&s.state.runtime.countdownSeconds===null);
      await settle(3300);assert.equal((await read()).state.durable.totalPhotos,before.state.durable.totalPhotos,'cancel must not expose later');
      before=await read();await key('Space');await wait(s=>s.state.runtime.countdownSeconds!==null,1500);
      // Esc normally lowers this game's camera; J opens the ordinary journal
      // modal and genuinely pauses the countdown through the UI pause reason.
      await key('KeyJ');await wait(s=>s.state.runtime.screen==='journal'&&s.state.runtime.pauseReasons.includes('ui')&&s.state.runtime.countdownSeconds===null);await shot('timer-journal-paused-cancelled');
      await settle(3300);assert.equal((await read()).state.durable.totalPhotos,before.state.durable.totalPhotos,'pause must not expose in background');
      await key('Escape');await wait(cameraActive);
      retained=await photograph('portrait-real-timer',{timer:true});
      await choose('timerSeconds',0,1717,547);
    });
    await step('choose-film-album-and-export-original',async()=>{
      await openLatest();await shot('film-detail-before-keep');
      await tabs(2);await key('Enter');await wait(s=>s.state.durable.album.some(p=>p.id===retained.id));
      await shot('film-kept-in-album');exported=await exportDetail(retained,'retained-before-reload',true);
      await closeDetails();const s=await read();
      assert.equal(s.state.durable.pendingPhoto,null);assert.equal(s.state.durable.film.length,7);
      assert.deepEqual(s.state.durable.stamps,{forest:false,town:false});assert.equal(s.state.durable.mailed,false);
      assert.equal(s.state.durable.memories['valley-letter'],null,'unmatched free photos cannot bypass old memory clues');
      report.persisted={film:s.state.durable.film.map(photoFacts),album:s.state.durable.album.map(photoFacts),weather:s.state.durable.weather,photography:s.state.durable.photography};
    });
    await step('normal-reload-and-identical-original-download',async()=>{
      await play.reload();await wait(s=>s.restored && s.state.runtime.screen==='menu');await shot('restored-normal-menu');
      await tabs(1);await key('Enter');await wait(walking);
      const s=await read();assert.deepEqual(s.state.durable.film.map(photoFacts),report.persisted.film);
      assert.deepEqual(s.state.durable.album.map(photoFacts),report.persisted.album);
      assert.equal(s.state.durable.weather,report.persisted.weather);assert.deepEqual(s.state.durable.photography,report.persisted.photography);
      await key('KeyC');await wait(cameraActive);await openLatest();await shot('restored-photo-original-detail');
      const second=await exportDetail(retained,'retained-after-reload',true);assert.equal(second.sha256,exported.sha256,'same persisted Blob must download byte-identically');
      await closeDetails();await shot('weather-photo-final');report.status='functional-checks-passed-visual-review-pending';
    });
  } catch(error) {report.status='failed';report.error=String(error);throw error;}
  finally {report.realElapsedMs=Date.now()-began;report.finishedAt=new Date().toISOString();
    await writeFile(join(out,'acceptance.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    console.log(JSON.stringify({name:'weather-photo-result',status:report.status,elapsedMs:report.realElapsedMs,
      qaSettlingMs:report.qaSettlingMs,photos:report.photos.length,downloads:report.downloads.length,output:out,error:report.error}));}
  return report;
}
