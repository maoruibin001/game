// Short ordinary post-office route. Root alone enables/runs the final candidate.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {cameraActive,walking,createProbe,loadProbeBinding,photoFacts} from './clock-probe-support.mjs';

const BINDING=await loadProbeBinding('outings');
export const PLAN={id:'clock-outings-probe',revision:'clock-outings-normal-01',viewport:[1920,1080],
  coverage:'normal schedule/map; rest golden/sunset/next morning; wrong/right real composition check-in; same-slot uniqueness; paused clock; retained JPEG reload'};
const wrap=n=>((n+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const post={feet:[2,-214],target:[-3,17.5,-235]},home=[9.75,-230.25];
const xz=(p,q)=>Math.hypot(p[0]-q[0],p[2]-q[1]);
const clockTotal=c=>(c.day-1)*1440+c.minute;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

export default async function outingsProbe(play){
  const h=await createProbe(play,PLAN,BINDING);h.report.downloads=[];let error,tracked,kept,originalDownload,expectedPhotos=0;
  const safeWalking=s=>{h.noExposure(s,expectedPhotos);return walking(s);};
  const safeCamera=s=>{h.noExposure(s,expectedPhotos);return cameraActive(s);};
  const view=s=>{assert.ok(s.view?.outings&&s.view?.dayClock,'requires actual published presentation view in readonly projection');return s.view;};
  async function turnTo(yaw,pitch=.13){
    const total=expectedPhotos;
    for(let tries=0;tries<16;tries++){
      const s=await h.read();h.noExposure(s,total);assert.ok(walking(s)||cameraActive(s));
      const dx=wrap(yaw-s.controller.yaw),dy=pitch-s.controller.pitch;if(Math.abs(dx)<.012&&Math.abs(dy)<.012)return;
      const factor=.0022*s.state.durable.settings.sensitivity,invert=s.state.durable.settings.invertY?-1:1;
      await play.mouse.move([.5,.5]);const moved=await h.read();
      await h.wait(v=>{h.noExposure(v,total);return (walking(v)||cameraActive(v))&&v.state.durable.playSeconds>moved.state.durable.playSeconds;},2000);
      await play.mouse.drag([.5,.5],[.5+clamp(dx/factor,-230,230)/1920,.5+clamp(dy/(factor*invert),-170,170)/1080],{button:'right'});
      await h.settle();const after=await h.read();h.noExposure(after,total);
      assert.ok(Math.abs(wrap(after.controller.yaw-s.controller.yaw))+Math.abs(after.controller.pitch-s.controller.pitch)>.001,'ordinary RMB made no progress');
    }assert.fail('ordinary look did not converge');
  }
  async function walkTo(point,tolerance=.35){
    let s=await h.read();assert.ok(walking(s));const start=Date.now(),limit=16000+xz(s.controller.position,point)/3*1000;
    const total=expectedPhotos;h.noExposure(s,total);let blocked=0;
    while(xz(s.controller.position,point)>tolerance){
      assert.ok(Date.now()-start<limit,'normal walking timed out; no injected fallback');
      const p=s.controller.position;await turnTo(Math.atan2(point[0]-p[0],-(point[1]-p[2])));
      const before=await h.read();await play.keyboard.hold('KeyW',clamp((xz(before.controller.position,point)-tolerance*.55)/6.8*1000,40,700));
      await h.settle();s=await h.read();h.noExposure(s,total);assert.ok(walking(s));
      blocked=xz(s.controller.position,[before.controller.position[0],before.controller.position[2]])<.045?blocked+1:0;
      assert.ok(blocked<3,'ordinary movement blocked');
    }
  }
  const route=async points=>{for(const point of points)await walkTo(point);};
  async function aim(target){
    const s=await h.read(),p=s.controller.camera.position;
    await turnTo(Math.atan2(target[0]-p[0],-(target[2]-p[2])),-Math.atan2(target[1]-p[1],Math.hypot(target[0]-p[0],target[2]-p[2])));
  }
  async function photograph(name){
    const before=await h.wait(safeCamera),total=expectedPhotos;await h.key('Space');
    const after=await h.wait(s=>{assert.ok(s.state.durable.totalPhotos<=total+1,'one Space produced multiple photographs');return cameraActive(s)&&s.state.durable.totalPhotos===total+1;},12000);
    const photo=after.state.durable.film.at(-1);assert.ok(photo?.original&&photo.scene?.clock&&photo.thumbnail?.startsWith('data:image/jpeg;'));
    assert.equal(photo.original.mime,'image/jpeg');assert.deepEqual([photo.original.width,photo.original.height],[1920,1080]);assert.ok(photo.original.bytes>10000);
    assert.equal(photo.scene.weather,after.environment.weather);expectedPhotos++;h.report.photos.push({name,...photoFacts(photo)});await h.shot(name);return structuredClone(photo);
  }
  async function frozenPanel(key,label){
    await h.key(key);let paused=await h.wait(s=>s.controller.paused&&s.state.runtime.pauseReasons.length>0);
    await h.shot(`${label}-opened`);paused=await h.read();await play.wait(600);const later=await h.read();
    assert.deepEqual(later.state.durable.clock,paused.state.durable.clock,`${label}: clock advanced while paused`);
    assert.deepEqual(later.state.durable.weatherCycle,paused.state.durable.weatherCycle,`${label}: weather advanced while paused`);
    await h.key(key==='KeyM'?'KeyM':'Escape');await h.wait(safeWalking);
  }
  async function rest(target,tabIndex,minute){
    const before=await h.wait(safeWalking);assert.ok(view(before).restPoint?.available,'ordinary rest requires nearby rest point');
    const day=before.state.durable.clock.day+Number(before.state.durable.clock.minute>=minute);
    await h.key('KeyE');await h.wait(s=>s.controller.paused&&s.state.runtime.pauseReasons.includes('ui'));await h.shot(`rest-${target}-normal-options`);
    await h.tabs(tabIndex);await h.key('Enter');const after=await h.wait(s=>safeWalking(s)&&s.state.durable.clock.day===day&&s.state.durable.clock.minute>=minute,10000);
    assert.ok(after.state.durable.clock.minute<minute+2,'rest must land at the next selected valley window');
    assert.ok(after.state.durable.playSeconds-before.state.durable.playSeconds<15,'rest cannot count skipped valley time as active play');
    assert.equal(after.state.durable.weatherCycle.seed,before.state.durable.weatherCycle.seed,'rest preserves weather sequence seed');
    assert.ok(clockTotal(after.state.durable.clock)>clockTotal(before.state.durable.clock));
    assert.equal(after.state.durable.trackedPhotoSpot,tracked,'weather/time change must not silently change tracked spot');
    assert.equal(after.state.durable.creativeMode,false);await h.shot(`rest-${target}-applied-clock-and-weather`);return after;
  }
  async function exportCheckIn(name){
    const before=await h.wait(safeWalking),v=view(before);assert.equal(before.state.durable.checkIns.length,1);
    const slot=v.outings.slots.find(s=>s.slot==='afternoon');assert.equal(slot?.photo?.id,kept.id,'actual diary must retain the check-in photograph');
    await h.click(960,43);await h.wait(s=>s.controller.paused&&s.state.runtime.pauseReasons.includes('ui'));await h.shot(`${name}-diary-source`);
    // Ordinary diary focus: close, optional tracked map/cancel, morning track,
    // then the only completed afternoon photo (fresh journey, no morning card).
    await h.tabs(v.outings.tracked?5:3);await h.key('Enter');await h.wait(s=>s.state.runtime.screen==='journal');await h.shot(`${name}-real-checkin-large-photo`);
    const pending=play.page.waitForEvent('download',{timeout:10000});
    // UI author froze large-photo order: close, export original, return to photo.
    const [,download]=await Promise.all([h.tabs(2).then(()=>h.key('Enter')),pending]);
    const file=join(h.out,`${name}.jpg`);await download.saveAs(file);assert.equal(await download.failure(),null);
    const bytes=await readFile(file);assert.equal(bytes.readUInt16BE(0),0xffd8);assert.equal(bytes.length,kept.original.bytes);
    const receipt={name,file,photoId:kept.id,sha256:sha(bytes),bytes:bytes.length};h.report.downloads.push(receipt);
    await h.key('Escape');await h.key('Escape');await h.key('Escape');await h.wait(safeWalking);return receipt;
  }
  try{
    await h.step('normal-schedule-tracking-and-paused-map',async()=>{
      const menu=await h.wait(s=>s.restored&&s.state.runtime.screen==='menu');assert.equal(menu.state.durable.started,false);
      await h.key('Tab');await h.key('Enter');const start=await h.wait(safeWalking);view(start);
      assert.equal(start.state.durable.clock.day,1);assert.ok(start.state.durable.clock.minute>=930&&start.state.durable.clock.minute<932);
      assert.equal(start.state.durable.checkIns.length,0);await h.shot('initial-clock-and-sunset-guide');
      tracked=view(start).outings.slots.find(s=>s.slot==='afternoon').spotId;
      await h.click(960,43);await h.wait(s=>s.controller.paused&&s.state.runtime.pauseReasons.includes('ui'));await h.shot('initial-daily-probabilities');
      await h.tabs(3);await h.key('Enter');await h.wait(s=>s.state.durable.trackedPhotoSpot===tracked);await h.key('Escape');await h.wait(safeWalking);
      await frozenPanel('KeyM','tracked-real-route-map');await frozenPanel('KeyJ','journal');await frozenPanel('Escape','pause');
      await rest('golden',3,1000);
    });
    await h.step('actual-post-composition-and-one-daily-checkin',async()=>{
      await route([[9.75,-226],[0,-220],post.feet]);assert.equal((await h.read()).state.durable.checkIns.length,0);
      await h.key('KeyC');await h.wait(safeCamera);assert.equal((await h.read()).state.durable.checkIns.length,0);
      await aim([2,17.5,-180]);await photograph('wrong-facing-real-photo-no-checkin');assert.equal((await h.read()).state.durable.checkIns.length,0);
      await aim(post.target);await h.wait(s=>safeCamera(s)&&s.environment.settled&&s.environment.blend>=.98,10000);
      kept=await photograph('correct-post-real-daily-photo');const checked=await h.read();
      assert.equal(checked.state.durable.checkIns.length,1);const entry=checked.state.durable.checkIns[0];
      assert.equal(entry.day,kept.scene.clock.day);assert.equal(entry.slot,'afternoon');assert.equal(entry.spotId,'post-porch');assert.deepEqual(entry.photo.original,kept.original);assert.equal(entry.photo.id,kept.id);
      await photograph('same-slot-second-real-photo-no-second-award');assert.equal((await h.read()).state.durable.checkIns.length,1);
      await h.key('KeyC');await h.wait(safeWalking);originalDownload=await exportCheckIn('checkin-before-reload');
    });
    await h.step('normal-sunset-rest-and-retained-original-reload',async()=>{
      await route([[0,-220],[9.75,-226],home]);await rest('sunset',4,1060);
      await h.key('Escape');await h.wait(s=>s.state.runtime.screen==='paused');const checkpoint=await h.shot('paused-sunset-checkpoint');
      await h.wait(s=>view(s).saveStatus==='saved',7000);await play.reload();const menu=await h.wait(s=>s.restored&&s.state.runtime.screen==='menu');
      assert.equal(menu.state.durable.started,true);assert.deepEqual(menu.state.durable.clock,checkpoint.state.durable.clock);
      assert.deepEqual(menu.state.durable.weatherCycle,checkpoint.state.durable.weatherCycle);assert.equal(menu.state.durable.trackedPhotoSpot,tracked);
      assert.equal(menu.state.durable.checkIns.length,1);assert.deepEqual(menu.state.durable.checkIns[0].photo.original,kept.original);
      await h.key('Tab');await h.key('Enter');await h.wait(safeWalking);const reloaded=await exportCheckIn('checkin-after-reload');
      assert.equal(reloaded.sha256,originalDownload.sha256,'same retained check-in must download identical real JPEG after reload');
      const morning=await rest('morning',2,380);assert.equal(morning.state.durable.clock.day,2);
      assert.equal(morning.state.durable.checkIns.length,1);assert.equal(morning.state.durable.checkIns[0].day,1);
      await h.shot('next-day-clock-guide-with-prior-checkin-retained');
    });
  }catch(e){error=e;throw e;}finally{await h.finish(error);}
}
