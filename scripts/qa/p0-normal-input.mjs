// P0 owner-only normal-input harness. Never imports gameplay modules or changes game state.
// Page is used ONLY for real download events; observations come from shan.journey.
import assert from 'node:assert/strict';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const VIEWPORT = [1920, 1080];
export const walking = s => s.state.runtime.screen === 'play' && s.controller.mode === 'walk'
  && !s.controller.paused && s.state.runtime.pauseReasons.length === 0 && s.frontend?.focus?.target === 'canvas';
export const cameraActive = s => s.state.runtime.screen === 'photo' && s.controller.mode === 'photo'
  && !s.controller.paused && !s.pendingCapture && !s.state.durable.pendingPhoto
  && s.state.runtime.pauseReasons.length === 0 && s.frontend?.focus?.target === 'canvas';
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const wrap = n => ((n + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
const distance = (position, point) => Math.hypot(position[0] - point[0], position[2] - point[1]);
export const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export const photoFacts = p => ({ id:p.id, sequence:p.sequence, matchedCards:p.matchedCards,
  original:p.original, scene:p.scene, thumbnailSha256:sha(p.thumbnail ?? '') });
export function progressFacts(s) {
  const d=s.state.durable;
  return structuredClone({version:d.version,started:d.started,stamps:d.stamps,gateOpened:d.gateOpened,
    discoveries:d.discoveries,album:d.album.map(photoFacts),film:d.film.map(photoFacts),
    cardPhotos:Object.fromEntries(Object.entries(d.cardPhotos).map(([id,p])=>[id,p?photoFacts(p):null])),
    memories:d.memories,endingPhoto:d.endingPhoto?photoFacts(d.endingPhoto):null,
    mailed:d.mailed,endingSeen:d.endingSeen,mailedFrom:d.mailedFrom,totalPhotos:d.totalPhotos,
    ziplineRides:d.ziplineRides,settings:d.settings,photography:d.photography});
}
export function jpegSize(bytes) {
  assert.equal(bytes.readUInt16BE(0),0xffd8,'download must be an actual JPEG');
  let at=2;
  while(at<bytes.length-9){
    while(bytes[at]===0xff)at++;
    const marker=bytes[at++];
    if(marker===0xd9||marker===0xda)break;
    if(marker===0x01||marker>=0xd0&&marker<=0xd7)continue;
    const length=bytes.readUInt16BE(at);
    assert.ok(length>=2&&at+length<=bytes.length,'valid JPEG segment');
    if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker))
      return {width:bytes.readUInt16BE(at+5),height:bytes.readUInt16BE(at+3)};
    at+=length;
  }
  assert.fail('JPEG has no SOF dimensions');
}

/** All actions use actual keys, RMB drags, clicks and the normal reload command. */
export async function createP0Harness(play, plan) {
  const began=Date.now();
  // Unique output every invocation; failed evidence is never overwritten by a retry.
  const runId=new Date().toISOString().replace(/[:.]/g,'-');
  const out=fileURLToPath(new URL(`../../../production/sprint-p0-20261116/owner/${plan.id}-${runId}/`,import.meta.url));
  await mkdir(dirname(out),{recursive:true});await mkdir(out,{recursive:false});
  const report={plan,startedAt:new Date().toISOString(),status:'running',timeline:[],photos:[],downloads:[],
    qaSettlingMs:0,dragReleaseFrames:0,readProjection:'shan.journey',
    notCovered:['independent blindplay, human discoverability and 15-minute content value',
      'human audio approval and public Zaohua publication',
      'image aesthetics and geometry require opening the captured PNG/JPEG; state assertions do not accept visuals']};
  const budget=()=>{assert.ok(!play.signal.aborted,'owner aborted');assert.ok(Date.now()-began<plan.budgetMs,`${plan.id} real-time budget exceeded; retain failure and stop`);};
  const read=async()=>{budget();return play.state('shan.journey');};
  const wait=async(fn,ms=7000)=>{budget();return play.waitFor(fn,{read:'shan.journey',timeoutMs:Math.max(1,Math.min(ms,plan.budgetMs-(Date.now()-began)))});};
  const settle=async()=>{budget();await play.wait(80);report.qaSettlingMs+=80;};
  const key=async(code)=>{budget();await play.keyboard.press(code);await settle();};
  const tabs=async(n)=>{for(let i=0;i<n;i++)await key('Tab');};
  const click=async(x,y)=>{budget();await play.mouse.click([x/VIEWPORT[0],y/VIEWPORT[1]]);await settle();};
  const step=(name,fn)=>play.step(name,async()=>{budget();return fn();});
  const shot=async(name)=>{
    const s=await read(),capture=await play.screenshot(name);
    // The official CLI clears its previous same-script captures on the next run.
    // Preserve this exact, unedited owner image in the per-run evidence folder.
    const preserved=join(out,`${name}.png`);await copyFile(capture.path,preserved);
    const event={name,elapsedMs:Date.now()-began,playSeconds:s.state.durable.playSeconds,
      distanceWalked:s.state.durable.distanceWalked,screen:s.state.runtime.screen,position:s.controller.position,
      camera:s.controller.camera,yaw:s.controller.yaw,pitch:s.controller.pitch,grounded:s.controller.grounded,
      nearby:s.state.runtime.nearby,notice:s.state.runtime.notice,stamps:s.state.durable.stamps,
      weather:s.state.durable.weather,environment:s.environment,world:s.world,
      recovery:s.lastRecovery??null,leverHighlighted:s.leverHighlighted??null,focus:s.frontend?.focus,
      screenshot:{file:preserved,ownerFile:capture.path,rendered:capture.rendered,digest:capture.digest}};
    report.timeline.push(event);console.log(JSON.stringify(event));
    assert.equal(capture.rendered,true,`${name}: owner detected a uniform canvas or rendering error; inspect retained image`);
    return s;
  };
  async function turnTo(yaw,pitch=.13){
    for(let attempt=0;attempt<16;attempt++){
      const s=await read();assert.ok(walking(s)||cameraActive(s),'look requires ordinary active canvas');
      const dx=wrap(yaw-s.controller.yaw),dy=pitch-s.controller.pitch;
      if(Math.abs(dx)<.012&&Math.abs(dy)<.012)return;
      const sensitivity=s.state.durable.settings.sensitivity,invert=s.state.durable.settings.invertY?-1:1;
      const px=clamp(dx/(.0022*sensitivity),-230,230),py=clamp(dy/(.0022*sensitivity*invert),-170,170);
      await play.mouse.move([.5,.5]);const positioned=await read();
      const before=await wait(v=>!v.controller.paused&&v.frontend?.focus?.target==='canvas'
        &&v.state.durable.playSeconds>positioned.state.durable.playSeconds,2000);
      report.dragReleaseFrames++;
      await play.mouse.drag([.5,.5],[.5+px/VIEWPORT[0],.5+py/VIEWPORT[1]],{button:'right'});await settle();
      const after=await read();
      assert.ok(Math.abs(wrap(after.controller.yaw-before.controller.yaw))+Math.abs(after.controller.pitch-before.controller.pitch)>.001,
        'ordinary RMB made no progress; no synthetic input fallback');
    }
    assert.fail('look did not converge in 16 normal RMB drags');
  }
  async function walkTo(point,tolerance=1.1){
    let s=await read();assert.ok(walking(s),'route requires normal walk mode');
    const at=Date.now(),limit=16000+distance(s.controller.position,point)/3*1000;let blocked=0;
    while(distance(s.controller.position,point)>tolerance){
      assert.ok(Date.now()-at<limit,`route timed out at ${point}; no teleport fallback`);
      const p=s.controller.position;await turnTo(Math.atan2(point[0]-p[0],-(point[1]-p[2])));
      const before=await read(),d=distance(before.controller.position,point);
      await play.keyboard.hold('KeyW',clamp((d-tolerance*.55)/6.8*1000,40,700));await settle();s=await read();
      assert.ok(walking(s),'ordinary route unexpectedly left walking');
      const moved=Math.hypot(s.controller.position[0]-before.controller.position[0],s.controller.position[2]-before.controller.position[2]);
      blocked=moved<.045?blocked+1:0;
      if(blocked>=3){await shot('FAIL-movement-blocked');assert.fail(`movement blocked near ${JSON.stringify(s.controller.position)} toward ${point}`);}
    }
    return s;
  }
  async function route(points,label,tolerance=1.1){for(const p of points)await walkTo(p,tolerance);return shot(`${label}-arrived`);}
  async function cameraAt(view,label){
    if(cameraActive(await read())){await key('KeyC');await wait(walking);}
    await walkTo(view.feet,.35);await key('KeyC');await wait(cameraActive);
    const s=await read(),p=s.controller.camera.position,t=view.target;
    await turnTo(Math.atan2(t[0]-p[0],-(t[2]-p[2])),-Math.atan2(t[1]-p[1],Math.hypot(t[0]-p[0],t[2]-p[2])));
    return shot(`${label}-composition`);
  }
  async function lowerCamera(){await wait(cameraActive);await key('KeyC');return wait(walking);}
  async function weather(id){
    const index=['morning','rain','afterglow'].indexOf(id);assert.ok(index>=0);
    await click(1736,114);await click(1700,[164,207,249][index]);
    return wait(s=>cameraActive(s)&&s.state.durable.weather===id&&s.environment.weather===id&&s.environment.settled&&s.environment.blend>=.999,10000);
  }
  async function photograph(name,{matchedCard=null}={}){
    const before=await wait(cameraActive);await key('Space');
    const after=await wait(s=>cameraActive(s)&&s.state.durable.totalPhotos===before.state.durable.totalPhotos+1,12000);
    const photo=after.state.durable.film.at(-1);assert.ok(photo?.original&&photo.thumbnail?.startsWith('data:image/jpeg;'));
    assert.equal(photo.original.mime,'image/jpeg');assert.deepEqual([photo.original.width,photo.original.height],VIEWPORT);
    assert.ok(photo.original.bytes>10000);assert.equal(photo.scene.weather,after.environment.weather);
    if(matchedCard)assert.ok(photo.matchedCards.includes(matchedCard),`normal photograph did not complete ${matchedCard}`);
    report.photos.push({name,...photoFacts(photo)});await shot(name);return structuredClone(photo);
  }
  async function exportLatest(photo,name){
    await click(80,120);await wait(s=>s.state.runtime.screen==='journal'&&s.state.runtime.pauseReasons.includes('ui'));
    const pending=play.page.waitForEvent('download',{timeout:10000});
    // Ordinary modal focus order: close, keep, ending, large, export.
    const outcome=Promise.all([pending,tabs(5).then(()=>key('Enter'))]);
    const [download]=await outcome;const target=join(out,`${name}.jpg`);await download.saveAs(target);
    assert.equal(await download.failure(),null);const bytes=await readFile(target),size=jpegSize(bytes);
    assert.deepEqual([size.width,size.height],VIEWPORT);assert.equal(bytes.length,photo.original.bytes);
    const evidence={name,photoId:photo.id,file:target,bytes:bytes.length,sha256:sha(bytes),...size};report.downloads.push(evidence);
    console.log(JSON.stringify({name:'original-downloaded',...evidence}));
    await key('Escape');await key('Escape');await wait(cameraActive);return evidence;
  }
  async function startFresh(){
    const s=await wait(s=>s.restored&&s.state.runtime.screen==='menu');
    assert.equal(s.state.durable.started,false,'requires fresh owner context; existing journey must not be erased');
    await shot('start-menu');await tabs(1);await key('Enter');return wait(walking);
  }
  async function finish(error){
    report.status=error?'failed':'functional-checks-passed-visual-review-pending';if(error)report.error=String(error);
    report.realElapsedMs=Date.now()-began;report.finishedAt=new Date().toISOString();
    await writeFile(join(out,'acceptance.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    console.log(JSON.stringify({name:'p0-result',status:report.status,elapsedMs:report.realElapsedMs,
      qaSettlingMs:report.qaSettlingMs,photos:report.photos.length,downloads:report.downloads.length,output:out,error:report.error}));
    return report;
  }
  return {read,wait,key,tabs,click,step,shot,turnTo,walkTo,route,cameraAt,lowerCamera,weather,photograph,
    exportLatest,startFresh,finish,report,out,elapsed:()=>Date.now()-began};
}
