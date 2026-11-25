// Additive layout-only normal-input probe. No image/state/DOM injection.
import assert from 'node:assert/strict';
import {cameraActive,walking,createProbe,loadProbeBinding} from './clock-probe-support.mjs';

const BINDING=await loadProbeBinding('layout');
export const PLAN={id:'clock-layout-probe',revision:'clock-layout-normal-01',viewport:[1920,1080],
  coverage:'real rest toast with walking/camera weather HUD; normal map toggle; missed morning next-window diary; final renewed real rest toast in camera mode'};

/** @param {import('@forgeax/engine/devkit').PlayContext} play */
export default async function layoutProbe(play){
  const h=await createProbe(play,PLAN,BINDING);let error,lastToastId,restedAt;
  const safeWalking=s=>{h.noExposure(s,0);return walking(s);};
  const safeCamera=s=>{h.noExposure(s,0);return cameraActive(s);};
  const view=s=>{assert.ok(s.view?.dayClock&&s.view?.outings&&s.view?.weather,'requires the actual published UI view');return s.view;};
  const layoutFacts=s=>({dayClock:s.view.dayClock,weather:s.view.weather,toast:s.view.toast,
    restPoint:s.view.restPoint,outings:s.view.outings,camera:s.view.camera});
  async function layoutShot(name,{freshToast=false}={}){
    const before=await h.read();h.noExposure(before,0);view(before);
    if(freshToast){
      assert.equal(before.view.toast?.id,lastToastId,'expected the actual rest event toast');
      assert.ok(Date.now()-restedAt<5000,'do not claim a toast layout after its normal display window');
    }
    const captured=await h.shot(name);
    if(freshToast)assert.ok(Date.now()-restedAt<5000,'toast screenshot completed outside its normal display window');
    h.report.observations.push({name:`${name}-published-layout-facts`,...layoutFacts(captured),
      ...(freshToast?{msSinceObservedRest:Date.now()-restedAt,requiresActualToastInPng:true}:{})});
  }
  async function rest(tabIndex,minute){
    const before=await h.wait(safeWalking);assert.ok(view(before).restPoint?.available,'must use the nearby ordinary post-office rest point');
    const day=before.state.durable.clock.day+Number(before.state.durable.clock.minute>=minute);
    await h.key('KeyE');await h.wait(s=>{h.noExposure(s,0);return s.controller.paused&&s.state.runtime.pauseReasons.includes('ui');});
    await h.tabs(tabIndex);await h.key('Enter');
    const rested=await h.wait(s=>safeWalking(s)&&s.state.durable.clock.day===day&&s.state.durable.clock.minute>=minute&&s.view?.toast?.title==='歇一会儿，继续出发');
    assert.ok(rested.state.durable.clock.minute<minute+2);assert.notEqual(rested.view.toast.id,lastToastId);
    assert.match(rested.view.toast.message,/小憩后/);assert.equal(rested.state.durable.creativeMode,false);
    restedAt=Date.now();lastToastId=rested.view.toast.id;return rested;
  }
  try{
    await h.step('normal-start-rest-and-real-toast-layout',async()=>{
      const menu=await h.wait(s=>s.restored&&s.state.runtime.screen==='menu');assert.equal(menu.state.durable.started,false,'do not erase an existing journey');
      await h.key('Tab');await h.key('Enter');await h.wait(safeWalking);
      await rest(3,1000);
      await layoutShot('golden-real-toast-walking-weather',{freshToast:true});
      await h.key('KeyC');await h.wait(safeCamera);
      await layoutShot('golden-real-toast-camera-weather',{freshToast:true});
      await h.key('KeyC');await h.wait(safeWalking);
    });
    await h.step('normal-map-and-next-window-diary',async()=>{
      await h.key('KeyM');const map=await h.wait(s=>{h.noExposure(s,0);return s.state.runtime.screen==='map'&&s.controller.paused;});
      assert.ok(map.view);await layoutShot('ordinary-map-open');
      await h.key('KeyM');await h.wait(safeWalking);
      await h.click(960,43);const diary=await h.wait(s=>{h.noExposure(s,0);return s.controller.paused&&s.state.runtime.pauseReasons.includes('ui');});
      const v=view(diary),morning=v.outings.slots.find(s=>s.slot==='morning'),afternoon=v.outings.slots.find(s=>s.slot==='afternoon');
      assert.equal(morning?.status,'missed');assert.equal(morning.nextWindowLabel,'次日 06:00–09:00');
      assert.equal(afternoon?.status,'active');assert.equal(v.dayClock.day,1);
      assert.ok(v.dayClock.minute>=1000&&v.dayClock.minute<1060,'ordinary time may advance after rest but must remain in the afternoon window');
      await layoutShot('diary-missed-morning-explicit-next-window');
      await h.key('Escape');await h.wait(safeWalking);
    });
    await h.step('fresh-normal-toast-for-final-camera-layout',async()=>{
      // Renew through a second ordinary rest so official final capture can
      // inspect the toast with the camera HUD before its natural expiry.
      await rest(4,1060);await h.key('KeyC');await h.wait(safeCamera);
      await layoutShot('sunset-real-toast-final-camera-weather',{freshToast:true});
      const final=await h.read();h.noExposure(final,0);assert.equal(final.state.durable.checkIns.length,0);
      h.report.observations.push({name:'official-final-layout-handoff',toastId:lastToastId,msSinceObservedRest:Date.now()-restedAt,
        note:'Review actual PNG and official capture layout warnings. Published toast metadata alone does not prove visible placement.'});
    });
  }catch(e){error=e;throw e;}finally{await h.finish(error);}
}
