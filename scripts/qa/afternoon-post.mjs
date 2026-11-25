import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cameraActive, createLetterHarness, walking } from './letter-normal-input.mjs';
import { P0_ROUTE } from './p0-route-plan.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = fileURLToPath(new URL('../../artifacts/afternoon-post/', import.meta.url));
const candidate = () => execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const action = name => '[data-action="' + name + '"]';
const upperApproach = [[155,28],[155,37],[155.6,45],[155.95,50],[155.95,54.8],[156.45,56.2],
  [156.45,58.6],[158,61],[158,65.5],[158,76.5],[158,81],[158,91.5],[158,93.75],[159.17,94.6]];
const eastRidge = [[194,59],[216,109],[171,135],[126,178],[64,204]];

export default async function afternoonPost(play) {
  const failures = [];
  const commit = candidate();
  const routes = ['run-first','jump-first','walk-only'];
  const requested = process.env.AFTERNOON_QA_ROUTE;
  assert.ok(!requested || routes.includes(requested));
  for (const [index, mode] of (requested ? [requested] : routes).entries()) {
    const page = play.page;
    const click = selector => page.locator(selector).click({timeout:12000});
    if (index > 0) {
      await page.keyboard.press('Escape');
      const back = page.locator(action('back-to-menu'));
      if (await back.waitFor({timeout:1800}).then(()=>true,()=>false)) await back.click();
      else {
        await play.reload();
        await page.getByRole('button', {name:'重新出发', exact:true}).waitFor({timeout:30000});
      }
      await click(action('restart'));
      await click(action('confirm-restart'));
      await play.waitFor(s=>walking(s)&&s.state.durable.totalPhotos===0,{read:'shan.journey',timeoutMs:16000});
    }

    const h = await createLetterHarness(play,{id:mode, viewport:[1920,1080]}, {budgetMs:420000,commit},output);
    let began, run = false, phase = 'opening', failure;
    const marks = [];
    function mark(name,s) {
      marks.push({name,wallSeconds:(Date.now()-began)/1000,
        activeSeconds:s.state.durable.playSeconds,clock:s.state.durable.clock,
        ground:s.controller.position,skills:s.state.durable.skills});
      h.report.route = marks;
    }
    async function walkTo(point, tolerance = .75) {
      const remaining = s => Math.hypot(s.controller.position[0]-point[0], s.controller.position[2]-point[1]);
      let s=await h.read(), stalled=0;
      for(let attempt=0; remaining(s)>tolerance; attempt++){
        assert.ok(attempt<26,`ordinary route failed to reach ${point}`);
        const [x,,z]=s.controller.position;
        const yaw=Math.atan2(point[0]-x,z-point[1]);
        const angle = current => Math.atan2(Math.sin(yaw-current),Math.cos(yaw-current));
        if(Math.abs(angle(s.controller.yaw))>.015) {
          try{await h.turnTo(yaw,.13);}catch(error){
            // Standard camera-turn keys also work when a synthetic mouse drag
            // is interrupted. This body still has to traverse the real road.
            const current=await h.read();
            assert.ok(walking(current),String(error));
            const pending=angle(current.controller.yaw);
            if(Math.abs(pending)>.045) {
              await play.keyboard.hold(pending>0?'ArrowRight':'ArrowLeft',Math.abs(pending)/2.15*1000);
              await h.settle();
              const turned=await h.read();
              assert.ok(Math.abs(angle(turned.controller.yaw))<.105,String(error));
              (h.report.keyboardTurnRecoveries??=[]).push({point,phase,position:current.controller.position});
            }
          }
        }
        const before=remaining(s), speed=run?11:6.8;
        // A short tap can fall between sampled input frames. Hold longer only
        // after a tap produced no progress and still require the feet to move.
        const minimumHold = 40 + stalled * 30;
        const duration=Math.min(4100,Math.max(minimumHold,1000*(before-tolerance*.42)/speed));
        if(run) await page.keyboard.down('Shift');
        try{await play.keyboard.hold('KeyW',duration);} finally{
          if(run) await page.keyboard.up('Shift');
        }
        await h.settle();
        s=await h.read();
        assert.ok(walking(s),'walking focus or mode was lost');
        stalled=before-remaining(s) < .045 ? stalled+1 : 0;
        assert.ok(stalled<3,`blocked toward ${point}; feet ${s.controller.position}`);
      }
      return s;
    }
    async function route(waypoints,tolerance) { for(const point of waypoints) await walkTo(point,tolerance); }
    async function lens(value) {
      const toggle=action('toggle-photo-tools');
      await click(toggle);
      await click(action('photo-option')+'[data-photo-key="lens"][data-value="'+value+'"]');
      await click(toggle);
      await h.wait(s=>cameraActive(s)&&s.state.durable.photography.lens===value);
    }
    async function photograph(name,feet,target,expected,lensName,feetTolerance = .20) {
      await walkTo(feet,feetTolerance);
      await h.key('KeyC');
      await h.wait(cameraActive);
      if(lensName) await lens(lensName);
      const p=(await h.read()).controller.camera.position;
      const dx=target[0]-p[0],dy=target[1]-p[1],dz=target[2]-p[2];
      await h.turnTo(Math.atan2(dx,-dz),-Math.atan2(dy,Math.hypot(dx,dz)));
      await h.shot(name+'-view');
      const frame=await h.photograph(name,expected);
      await h.lowerCamera();
      return frame;
    }
    async function interaction(id) {
      await h.wait(s=>walking(s)&&s.state.runtime.nearby===id,3500);
      await h.key('KeyE');
      return h.read();
    }
    async function forestDirections() {
      phase='forest directions';
      await route(P0_ROUTE.forest.slice(1));
      const photo=await photograph('forest-directions',P0_ROUTE.forestPhoto.feet,P0_ROUTE.forestPhoto.target,{matchedCard:'forest'});
      assert.ok(photo.original);
      mark(phase,await h.read());
      await route(P0_ROUTE.forestReturn);
    }
    async function townBridge() {
      phase='town lever and arch';
      await route(P0_ROUTE.town.slice(1,-1));
      await route(P0_ROUTE.lever,.35);
      await interaction('town-gate');
      await h.wait(s=>s.state.durable.gateOpened);
      await walkTo([148,-2],.4);
      await photograph('stone-arch',[155,-3],[155,29,10],{matchedCard:'town'});
      await h.wait(s=>s.world.bridgeWalkable);
      mark('bridge lowered',await h.read());
      await route([[155,7],[155,20]]);
    }
    async function learnJump() {
      phase='bridge rubbing and jump';
      await walkTo([157.9,20.1],.3);
      await interaction('afternoon-shoes');
      assert.equal((await h.read()).state.durable.skills.jump,false);
      const photo=await photograph('swallow-roof',[154.7,16],[165.74,31.81,21],undefined,'standard');
      assert.equal(photo.afternoonSubject,'swallow-roof');
      await walkTo([157.9,20.1],.30);
      await interaction('afternoon-shoes');
      const learned=await h.wait(s=>s.state.durable.skills.jump&&!s.state.durable.skills.run);
      mark('jump unlocked',learned);
      await walkTo([157.8,16.06],.27);
      await walkTo([159.38,15.95],.17);
      await h.turnTo(0,.13);
      await page.keyboard.down('Space');
      await page.keyboard.down('KeyW');
      try{
        await h.wait(s=>walking(s)&&!s.controller.grounded,2300);
        await h.wait(s=>s.controller.position[2]<13.78,2400);
      }finally{await page.keyboard.up('KeyW');await page.keyboard.up('Space');}
      const landed=await h.wait(s=>walking(s)&&s.controller.grounded&&s.controller.position[1]>25.69,3500);
      mark('jump onto second stone',landed);
      await h.shot('jump-landing');
      await walkTo([157.7,13.5],.42);
      await walkTo([155,20],.45);
    }
    async function ridgeDirections() {
      phase='east ridge directions';
      await route(eastRidge);
      // Shoot from the path beside the bench instead of pressing against its collision.
      const turn=await photograph('ridge-turn',[64,204],[68.4,84.88,199],undefined,'wide',.75);
      assert.equal(turn.routeSlot,'turn');
      const end=await photograph('ridge-windmill',[72,200],[-170,44.5,-20.25],undefined,'tele');
      assert.equal(end.routeSlot,'destination');
      await h.key('KeyJ'); await h.wait(s=>s.state.runtime.screen==='journal');
      await page.getByRole('tab',{name:'来信',exact:true}).click();
      const letter=page.locator('[data-reply-letter="forest"]');
      for(const photo of [turn,end]) await letter.locator(action('attach-route-photo')+'[data-id="'+photo.id+'"]').click();
      await letter.locator(action('send-route-pair')).click();
      await h.wait(s=>s.state.durable.replyPhotos.forest?.variant==='route-pair');
      await click('button.sy-close:visible'); await h.wait(walking);
      mark('east ridge pair sent',await h.read());
      await route([[64,204],...eastRidge.slice(0,-1).reverse()]);
      await walkTo([155,20],1.10);
    }
    try {
      await h.step(mode + ' · start at 13:00 and follow the route', async()=>{
        began=Date.now();
        const start=index===0?await h.startFresh():await h.wait(walking);
        assert.equal(start.state.durable.clock.day,1);
        assert.equal(Math.floor(start.state.durable.clock.minute),780);
        assert.deepEqual(start.state.durable.skills,{run:false,jump:false});
        mark('started',start);
        await h.key('KeyJ');
        await h.wait(s=>s.state.runtime.screen==='journal');
        await page.getByRole('button',{name:'先上路',exact:true}).click();
        await click('button.sy-close:visible');
        await h.wait(walking);
        await route([[9.5,-226.2],[0,-220]]);
        if(mode==='run-first'){
          phase='pine-bag exchange';
          await walkTo([-8,-214.1],.4);
          await interaction('afternoon-pine-bag');
          const learned=await h.wait(s=>s.state.durable.skills.run&&!s.state.durable.skills.jump);
          mark('run unlocked',learned);
          await h.turnTo(Math.atan2(-27,-22.1),.13);
          await page.keyboard.down('Shift');await page.keyboard.down('KeyW');
          try{const running=await h.wait(s=>s.controller.running&&s.controller.speed>9,3500);mark('actual Shift run',running);}
          finally{await page.keyboard.up('KeyW');await page.keyboard.up('Shift');}
          run=true;
          // The same route geometry and stop tolerance as the walking control.
          await forestDirections();
        }
        if(mode==='walk-only') await forestDirections();
        await townBridge();
        if(mode==='jump-first'){await learnJump();await ridgeDirections();}
      });
      await h.step(mode + ' · climb, take the actual window photograph and collect the reward',async()=>{
        phase='monastery steps';
        run=false;
        await route(upperApproach.slice(0,-1),.29);
        phase='old window shutter';
        const photo=await photograph('hall-window',upperApproach.at(-1),[159.42,35.91,92.12],undefined,'standard');
        assert.equal(photo.afternoonSubject,'hall-window');
        mark('window photo',await h.read());
        phase='deliver at the hall';
        await interaction('afternoon-window');
        const earned=await h.wait(s=>s.state.durable.fireworks?.photo.id===photo.id);
        mark('reward received',earned);
        assert.equal(earned.state.durable.fireworks.day,1);
        assert.deepEqual(earned.state.durable.skills,{run:mode==='run-first',jump:mode==='jump-first'});
        await h.shot('reward-on-foot');
        await h.key('KeyJ');
        await h.wait(s=>s.state.runtime.screen==='journal');
        await page.getByRole('heading',{name:'背包里的一盒烟花',exact:true}).waitFor();
        await h.shot('fireworks-and-delivery-original');
        const open=page.getByRole('button',{name:'查看交件原照',exact:true});
        await open.click();
        await h.download('delivered-original',()=>click(action('export-photo')),[1920,1080],{photoId:photo.id,bytes:photo.original.bytes});
        if(mode==='walk-only'){
          await play.reload();
          const resumed=await h.wait(s=>s.restored&&s.state.runtime.screen==='menu'&&s.state.durable.fireworks?.photo.id===photo.id,35000);
          assert.deepEqual(resumed.state.durable.skills,{run:false,jump:false});
          await click(action('continue'));
          await h.wait(walking);
          await h.key('KeyJ');
          await h.wait(s=>s.state.runtime.screen==='journal');
          await page.getByRole('heading',{name:'背包里的一盒烟花',exact:true}).waitFor();
          await open.click();
          const again=await h.download('delivered-after-reload',()=>click(action('export-photo')),[1920,1080],{photoId:photo.id,bytes:photo.original.bytes});
          assert.equal(again.sha256,h.report.downloads[0].sha256);
          await h.shot('reloaded-reward');
        }
        // Leave normal walking focus for the next independent new save.
        while((await h.read()).state.runtime.screen==='journal'){await click('button.sy-close:visible');await h.settle();}
        await h.wait(walking);
      });
    } catch(error){
      failure=error;
      h.report.failedPhase=phase;
      failures.push({mode,phase,error:String(error)});
      await h.shot('failed-'+phase.replaceAll(' ','-')).catch(()=>{});
      if(index<2) {
        try{const s=await h.read();if(s.state.runtime.screen==='photo')await h.lowerCamera();}catch{}
      }
    } finally {
      await h.finish(failure);
    }
  }
  assert.deepEqual(failures,[]);
}
