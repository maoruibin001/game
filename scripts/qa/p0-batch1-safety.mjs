import assert from 'node:assert/strict';
import { createP0Harness, progressFacts, walking } from './p0-normal-input.mjs';
import { P0_RECOVERY_UI, P0_ROUTE as route } from './p0-route-plan.mjs';

export const PLAN={id:'batch1-safety',revision:'p0-20261116-normal-input-03-off-path-recovery',budgetMs:360000,
  viewport:[1920,1080],coverage:'normal old-town east-back route, orbit surface checks, HUD/pause path recovery, reload progress',
  limitation:'expert exact fall coordinates unknown; this covers the described house-back risk area, not an asserted identical reproduction'};

/** @param {import('@forgeax/engine/devkit').PlayContext} play */
export default async function safety(play){
  assert.ok(P0_RECOVERY_UI.confirmed&&Array.isArray(P0_RECOVERY_UI.hud)&&Number.isInteger(P0_RECOVERY_UI.pauseTabs),
    'P0 UI author must confirm ordinary recovery control coordinates before owner run');
  const h=await createP0Harness(play,PLAN);let error;
  try{
    await h.step('fresh-entry-aligned-spawn',async()=>{await h.startFresh();await h.shot('fresh-spawn-guidance');});
    await h.step('normal-main-road-and-town-gate',async()=>{
      await h.route(route.town,'town-main-road');await h.cameraAt(route.townPhoto,'town-closed');
      await h.photograph('town-actual-closed-screen-photo');await h.lowerCamera();
      assert.equal((await h.read()).state.durable.stamps.town,false,'closed screen cannot complete town card');
      await h.route(route.lever,'town-winch');
      await h.wait(s=>s.state.runtime.nearby==='town-gate');await h.shot('winch-E-before');await h.key('KeyE');
      await h.wait(s=>s.state.durable.gateOpened&&s.world.gateOpen);await h.shot('winch-open');
      await h.route([[148,5],[155,5],[155,20]],'town-open-gate-exterior');
      assert.equal((await h.read()).world.bridgeWalkable,false,'safety route must remain usable before bridge unlock');
    });
    await h.step('east-house-repaired-alley-and-camera',async()=>{
      await h.route(route.eastBack,'east-house-rear');
      const baseline=await h.read();assert.ok(baseline.controller.grounded);
      for(const [i,yaw] of [0,Math.PI/2,Math.PI,-Math.PI/2].entries()){
        await h.turnTo(yaw,.13);const s=await h.shot(`east-house-rear-orbit-${i}`);
        assert.ok(s.controller.camera.position.every(Number.isFinite));
        assert.ok(Math.hypot(...s.controller.camera.forward)>.99,'finite normalized real camera view');
      }
      // Actual round trip, rather than declaring safety only because rescue exists.
      await h.route([...route.eastBackReturn].slice(0,3),'east-house-alley-return');
      await h.route([[168,29],[172,27],[176,26]],'east-house-alley-revisit');
      await h.route(route.eastBackRiskLoop,'east-house-repaired-ledge-boundaries',.35);
    });
    await h.step('normal-HUD-recovery-preserves-journey',async()=>{
      // Ordinary, bidirectionally walkable east-side detour; not a recreation of
      // the expert's unknown fall position and not a test-only teleport.
      await h.walkTo([181,26],.15);
      const before=await h.wait(s=>walking(s)&&s.controller.grounded),facts=progressFacts(before);
      await h.shot('HUD-recovery-off-path-before');
      await h.click(...P0_RECOVERY_UI.hud);
      const after=await h.wait(s=>walking(s)&&s.lastRecovery?.sequence>(before.lastRecovery?.sequence??0)&&s.controller.grounded);
      const receiptDistance=Math.hypot(after.lastRecovery.to[0]-after.lastRecovery.from[0],
        after.lastRecovery.to[2]-after.lastRecovery.from[2]);
      const observedDistance=Math.hypot(after.controller.position[0]-before.controller.position[0],
        after.controller.position[2]-before.controller.position[2]);
      assert.ok(receiptDistance>=2,'off-path recovery receipt must move at least 2m horizontally');
      assert.ok(observedDistance>=2,'actual observed controller must move at least 2m horizontally after recovery');
      assert.deepEqual(progressFacts(after),facts,'path recovery may not reset photos/stamps/world progress');
      assert.equal(after.state.runtime.ride,null);assert.equal(after.state.runtime.countdownSeconds,null);assert.equal(after.pendingCapture,null);
      assert.ok(after.lastRecovery.routeId);assert.match(after.state.runtime.notice,/已回到最近可走的小路/);
      h.report.recoveryHUD={...after.lastRecovery,notice:after.state.runtime.notice,
        receiptDistance,observedDistance,observedFrom:before.controller.position,observedTo:after.controller.position,
        scope:'ordinary off-path self-recovery; original expert fall coordinates remain unknown'};
      await h.shot('HUD-recovery-after');
      await play.keyboard.hold('KeyW',180);const moved=await h.wait(walking);
      assert.ok(Math.hypot(moved.controller.position[0]-after.controller.position[0],
        moved.controller.position[2]-after.controller.position[2])>.1,'normal W must visibly move after recovery');
      await h.shot('HUD-recovery-normal-walk');
    });
    await h.step('normal-pause-recovery-and-checkpoint',async()=>{
      await h.key('Escape');const paused=await h.wait(s=>s.state.runtime.screen==='paused'&&s.controller.paused);
      const facts=progressFacts(paused);await h.shot('pause-recovery-control');
      await h.tabs(P0_RECOVERY_UI.pauseTabs);await h.key('Enter');
      const after=await h.wait(s=>walking(s)&&s.lastRecovery?.sequence>(paused.lastRecovery?.sequence??0)&&s.controller.grounded);
      assert.deepEqual(progressFacts(after),facts);assert.equal(after.state.runtime.ride,null);
      assert.ok(after.lastRecovery.routeId);h.report.recoveryPause={...after.lastRecovery,notice:after.state.runtime.notice};
      await h.shot('pause-recovery-after');
      // Freeze through the ordinary pause screen so naturally changing weather is not confused with lost state.
      await h.key('Escape');const saved=await h.wait(s=>s.state.runtime.screen==='paused');
      const persisted=progressFacts(saved),weather=saved.state.durable.weather,cycle=saved.state.durable.weatherCycle;
      await play.reload();const menu=await h.wait(s=>s.restored&&s.state.runtime.screen==='menu');
      assert.deepEqual(progressFacts(menu),persisted);assert.equal(menu.state.durable.weather,weather);
      assert.equal(menu.state.durable.weatherCycle.seed,cycle.seed);assert.equal(menu.state.durable.weatherCycle.cycle,cycle.cycle);
      await h.shot('recovery-reload-menu');await h.tabs(1);await h.key('Enter');await h.wait(walking);
      await h.shot('recovery-reload-continued');
    });
  }catch(e){error=e;throw e;}finally{await h.finish(error);}
}
