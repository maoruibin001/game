import assert from 'node:assert/strict';
import { createP0Harness, walking } from './p0-normal-input.mjs';
import { P0_ROUTE as route } from './p0-route-plan.mjs';

export const PLAN={id:'batch2-guidance',revision:'p0-20261116-normal-input-01',budgetMs:300000,
  viewport:[1920,1080],coverage:'fresh spawn, town gate actual E, region-correct mailbox before/after opening',
  limitation:'authored-route deterministic regression, not blindplay or proof a human naturally discovers winch in one minute'};

/** @param {import('@forgeax/engine/devkit').PlayContext} play */
export default async function guidance(play){
  const h=await createP0Harness(play,PLAN);let error;
  async function mailbox(label){
    await h.route(route.mailbox,`${label}-mailbox`);await h.wait(s=>s.state.runtime.nearby==='mailbox:town');
    const before=await h.read();await h.key('KeyE');
    const after=await h.wait(s=>walking(s)&&Boolean(s.state.runtime.notice)&&s.state.runtime.notice!==before.state.runtime.notice);
    assert.equal(after.state.durable.player.area,'town');
    assert.doesNotMatch(after.state.runtime.notice,/(?:先去|前往|去看看)[^。]*石巷旧镇/,'town mailbox must not suggest travelling to the area already occupied');
    assert.match(after.state.runtime.notice,/(绞盘|手柄|红绳|木屏|石拱|门里)/,'town mailbox should give current local puzzle guidance');
    h.report[`${label}Notice`]=after.state.runtime.notice;await h.shot(`${label}-town-mailbox-hint`);
  }
  try{
    await h.step('fresh-spawn-and-normal-first-photo',async()=>{
      await h.startFresh();await h.shot('spawn-direction-and-objective');
      await h.key('KeyC');await h.photograph('first-travel-photo');await h.lowerCamera();
    });
    await h.step('town-gate-guidance-readable-and-operative',async()=>{
      await h.route(route.town,'town-front');await h.shot('town-front-before-prompt');
      await mailbox('closed');
      // Timing starts at the named near-gate point, excluding post-to-town travel.
      const started=Date.now();await h.route([[155,5],[148,5],[148,8.8]],'winch-normal-approach');
      await h.wait(s=>s.state.runtime.nearby==='town-gate');await h.shot('winch-visible-E-prompt');
      await h.key('KeyE');const after=await h.wait(s=>walking(s)&&s.state.durable.gateOpened&&s.world.gateOpen);
      const elapsedMs=Date.now()-started;assert.ok(elapsedMs<=60000,'ordinary scripted near-gate approach and E exceeded one minute');
      h.report.scriptedWinch={elapsedMs,position:after.controller.position,ordinaryInput:true,independentDiscoveryEvidence:false};
      await h.shot('winch-open-visible');
    });
    await h.step('opened-town-mailbox-hint-local-state',async()=>{
      await h.route([[148,5],[155,5]],'opened-town-front');await mailbox('opened');
      assert.notEqual(h.report.closedNotice,h.report.openedNotice,'local hint should advance after opening the screen');
      const s=await h.read();assert.equal(s.state.durable.stamps.town,false,'interacting alone must not fake a main-card photograph');
      assert.equal(s.state.durable.mailed,false);
    });
  }catch(e){error=e;throw e;}finally{await h.finish(error);}
}
