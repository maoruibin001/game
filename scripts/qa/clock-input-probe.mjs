import assert from 'node:assert/strict';
import {cameraActive,walking,createProbe,loadProbeBinding,photoFacts} from './clock-probe-support.mjs';

const BINDING=await loadProbeBinding('input');
export const PLAN={id:'clock-input-probe',revision:'clock-input-normal-02',viewport:[1920,1080],
  coverage:'ordinary Space takeoff/landing; actual Shift movement; turn then character-relative W/S/A/D; C/Space photo boundary; one small photo RMB drag without accidental exposure'};

/** @param {import('@forgeax/engine/devkit').PlayContext} play */
export default async function inputProbe(play){
  const h=await createProbe(play,PLAN,BINDING);let error;
  async function jump(name,total){
    const before=await h.wait(s=>walking(s)&&s.controller.grounded&&s.controller.speed<.01);h.noExposure(before,total);
    let airborne;
    await play.keyboard.hold('Space',s=>{
      h.noExposure(s,total);
      if(!s.controller.grounded&&s.controller.position[1]>before.controller.position[1]+.2){airborne=s;return true;}return false;
    },{read:'shan.journey',timeoutMs:1800});
    assert.ok(airborne,'Space must actually lift the ordinary player');h.record(`${name}-actual-airborne`,airborne);
    const landed=await h.wait(s=>walking(s)&&s.controller.grounded,2200);h.noExposure(landed,total);
    assert.ok(Math.abs(landed.controller.position[1]-before.controller.position[1])<.12,'stationary jump must land back on the same ground');
    await h.shot(`${name}-landed`);
  }
  async function measuredForward(keys,label,total){
    const before=await h.wait(s=>walking(s)&&s.controller.grounded&&s.controller.speed<.01),began=Date.now(),samples=[];
    await play.keyboard.hold(keys,s=>{h.noExposure(s,total);assert.ok(walking(s));
      samples.push({ms:Date.now()-began,position:s.controller.position,speed:s.controller.speed,running:s.controller.running});
      return Date.now()-began>=800;
    },{read:'shan.journey',timeoutMs:2300});
    await h.settle();const after=await h.wait(s=>walking(s)&&s.controller.speed<.01);h.noExposure(after,total);
    const moved=Math.hypot(after.controller.position[0]-before.controller.position[0],after.controller.position[2]-before.controller.position[2]);
    assert.ok(moved>2,'movement comparison needs real unobstructed displacement');
    const result={label,heldKeys:keys,elapsedMs:Date.now()-began,moved,samples};h.report.observations.push(result);return result;
  }
  const angleDifference=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
  async function directionalStep(key,expected,total){
    const before=await h.wait(s=>walking(s)&&s.controller.grounded&&s.controller.speed<.01);h.noExposure(before,total);
    const began=Date.now();
    await play.keyboard.hold(key,s=>{h.noExposure(s,total);assert.ok(walking(s));return Date.now()-began>=350;},
      {read:'shan.journey',timeoutMs:1800});
    await h.settle();const after=await h.wait(s=>walking(s)&&s.controller.grounded&&s.controller.speed<.01);h.noExposure(after,total);
    const delta=[after.controller.position[0]-before.controller.position[0],after.controller.position[2]-before.controller.position[2]],distance=Math.hypot(...delta);
    assert.ok(distance>.6,`${key} needs actual movement, not a blocked animation`);
    assert.ok((delta[0]*expected[0]+delta[1]*expected[1])/distance>.94,`${key} must follow the traveller's turned heading`);
    assert.ok(Math.abs(angleDifference(after.controller.facingYaw,before.controller.facingYaw))<.03,`${key} must not rotate the traveller away from the movement basis`);
    h.report.observations.push({name:`turned-${key}`,before:before.controller,after:after.controller,delta,distance,expected});return delta;
  }
  try{
    await h.step('normal-start-and-space-jump',async()=>{
      const menu=await h.wait(s=>s.restored&&s.state.runtime.screen==='menu');assert.equal(menu.state.durable.started,false,'do not erase an existing journey');
      await h.key('Tab');await h.key('Enter');await h.wait(walking);await jump('first-space-jump',0);
    });
    await h.step('ordinary-walk-and-shift-speed',async()=>{
      const walk=await measuredForward(['KeyW'],'walk',0),run=await measuredForward(['KeyW','ShiftLeft'],'shift-run',0);
      assert.ok(run.samples.some(s=>s.running&&s.speed>8),'Shift must apply actual running speed');
      assert.ok(walk.samples.every(s=>!s.running),'plain W must not claim running');
      assert.ok(run.moved/walk.moved>1.25,'same bounded hold should make running visibly faster');
      await h.shot('actual-run-displacement');
    });
    await h.step('turn-then-character-relative-wasd',async()=>{
      const start=await h.wait(walking);h.noExposure(start,0);
      await play.mouse.move([.4,.5]);await h.wait(s=>{h.noExposure(s,0);return walking(s)&&s.state.durable.playSeconds>start.state.durable.playSeconds;},2000);
      const before=await h.read();await play.mouse.drag([.4,.5],[.62,.5],{button:'right'});await h.settle();
      const turned=await h.wait(walking);h.noExposure(turned,0);
      assert.ok(Number.isFinite(turned.controller.facingYaw),'readonly facingYaw is required');
      assert.ok(Math.abs(angleDifference(turned.controller.facingYaw,before.controller.facingYaw))>.45,'ordinary RMB must meaningfully turn the traveller before movement');
      const yaw=turned.controller.facingYaw,forward=[Math.sin(yaw),-Math.cos(yaw)],right=[Math.cos(yaw),Math.sin(yaw)];
      const w=await directionalStep('KeyW',forward,0),s=await directionalStep('KeyS',forward.map(n=>-n),0);
      const a=await directionalStep('KeyA',right.map(n=>-n),0),d=await directionalStep('KeyD',right,0);
      const opposite=(x,y)=>(x[0]*y[0]+x[1]*y[1])/(Math.hypot(...x)*Math.hypot(...y));
      assert.ok(opposite(w,s)<-.94&&opposite(a,d)<-.94,'W/S and A/D must be opposite world directions');
      await h.shot('turned-character-relative-wasd');
    });
    await h.step('camera-space-photo-without-jump',async()=>{
      const before=await h.read();await h.key('KeyC');const ready=await h.wait(cameraActive);h.noExposure(ready,0);
      await h.key('Space');const during=await h.read();h.record('photo-space-immediate-controller',during);
      assert.ok(during.controller.grounded&&Math.abs(during.controller.position[1]-before.controller.position[1])<.12,'photo Space must not start an airborne jump');
      const saved=await h.wait(s=>cameraActive(s)&&s.state.durable.totalPhotos===1,12000);
      const p=saved.state.durable.film.at(-1);assert.ok(p?.original&&p.thumbnail?.startsWith('data:image/jpeg;'));
      assert.equal(p.original.mime,'image/jpeg');assert.deepEqual([p.original.width,p.original.height],[1920,1080]);assert.ok(p.original.bytes>10000);
      assert.ok(saved.controller.grounded&&Math.abs(saved.controller.position[1]-before.controller.position[1])<.12,'photo Space must not jump');
      assert.equal(p.scene.mode,'landscape');assert.equal(p.scene.clock?.day,before.state.durable.clock.day,'real capture must retain the applied valley day');
      assert.ok(Number.isFinite(p.scene.clock?.minute)&&p.scene.clock.minute>=before.state.durable.clock.minute-.1&&p.scene.clock.minute<=saved.state.durable.clock.minute+.1,
        'real capture must retain an applied clock within the ordinary exposure interval');
      h.report.photos.push(photoFacts(p));await h.shot('one-real-camera-space-photo');
      await h.key('KeyC');await h.wait(walking);await jump('after-photo-space-jump',1);
    });
    await h.step('small-normal-rmb-with-zero-extra-exposure',async()=>{
      await h.key('KeyC');const start=await h.wait(cameraActive);h.noExposure(start,1);
      await play.mouse.move([.5,.5]);await h.wait(s=>{h.noExposure(s,1);return cameraActive(s)&&s.state.durable.playSeconds>start.state.durable.playSeconds;},2000);
      const before=await h.read();await play.mouse.drag([.5,.5],[.53,.5],{button:'right'});await h.settle();
      const after=await h.read();h.noExposure(after,1);assert.ok(cameraActive(after));
      assert.ok(Math.abs(after.controller.yaw-before.controller.yaw)>.03,'RMB must visibly turn the camera');
      const quiet=await h.wait(s=>{h.noExposure(s,1);return cameraActive(s)&&s.state.durable.playSeconds>after.state.durable.playSeconds+.3;},2000);
      h.noExposure(quiet,1);await h.shot('rmb-no-extra-photo');
    });
  }catch(e){error=e;throw e;}finally{await h.finish(error);}
}
