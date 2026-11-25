import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cameraActive, createLetterHarness, walking } from './letter-normal-input.mjs';
import { P0_ROUTE } from './p0-route-plan.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const output=join(root,process.env.NIGHT_QA_ARTIFACTS??'artifacts/night-post');
const read='shan.journey';
const action=name=>'[data-action="'+name+'"]';
const courtyard=[[155,28],[155,37],[155.6,45],[155.95,50],[155.95,54.8],[156.45,56.2],[156.45,58.6],[158,61],[158,65.3]];
const upper=[[158,76.5],[158,81],[158,91.5],[158,93.75],[159.17,94.6]];
const reverseUpper=[[158,93.75],[158,91.5],[158,81],[158,76.5],[158,65.3]];
const position=s=>s.controller.position;

export async function tapAudio(page){
  // Capture the real procedural audio at the destination, including footsteps
  // and ignition. The recording tap never alters the live output connection.
  const install=()=>{
    if(window.nightEvidenceTaps)return;
    const taps=new Map(), connect=AudioNode.prototype.connect;
    window.nightEvidenceTaps=taps;
    AudioNode.prototype.connect=function(target,...options){
      const result=connect.call(this,target,...options);
      if(target instanceof AudioDestinationNode && this.context instanceof AudioContext){
        if(!taps.has(this.context)) taps.set(this.context,this.context.createMediaStreamDestination());
        connect.call(this,taps.get(this.context));
      }
      return result;
    };
  };
  await page.addInitScript(install);
  await page.evaluate(install);
}
export async function startVideo(page){
  return page.locator('canvas').first().evaluate(canvas=>{
    const stream=canvas.captureStream(30);
    const tap=Array.from(window.nightEvidenceTaps?.values()??[]).find(node=>node.context.state==='running');
    if(tap)for(const track of tap.stream.getAudioTracks())stream.addTrack(track);
    const mimeType=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));
    const recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:4_500_000,audioBitsPerSecond:128000});
    const chunks=[];
    const done=new Promise(resolve=>{
      recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      recorder.onstop=()=>resolve(new Blob(chunks,{type:recorder.mimeType}));
    });
    window.nightEvidenceRecording={recorder,stream,done};
    recorder.start(500);
    return stream.getAudioTracks().length;
  });
}
export async function stopVideo(page,file){
  const capture=await page.evaluate(async()=>{
    const session=window.nightEvidenceRecording;
    if(!session)return null;
    session.recorder.stop();
    const bytes=new Uint8Array(await (await session.done).arrayBuffer());
    let raw='';
    for(let i=0;i<bytes.length;i+=0x4000)raw+=String.fromCharCode(...bytes.subarray(i,i+0x4000));
    const audioTracks=session.stream.getAudioTracks().length;
    for(const track of session.stream.getVideoTracks())track.stop();
    delete window.nightEvidenceRecording;
    return {raw:btoa(raw),audioTracks,bytes:bytes.length};
  });
  if(!capture)return;
  await writeFile(file,Buffer.from(capture.raw,'base64'));
  return {file,audioTracks:capture.audioTracks,bytes:capture.bytes};
}

export default async function nightPost(play){
  const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  const options=['torch-and-fireworks','market-and-inn','willow-and-scarlet','willow-and-scarlet-audio','willow-and-scarlet-reprise'];
  const requested=process.env.NIGHT_QA_ROUTE;
  assert.ok(!requested||options.includes(requested));
  const page=play.page, click=selector=>page.locator(selector).click({timeout:10000});
  await tapAudio(page);
  const failures=[];
  for(const [index,mode] of (requested?[requested]:options.slice(0,2)).entries()){
    const h=await createLetterHarness(play,{id:mode,viewport:[1920,1080]},{budgetMs:500000,commit},output);
    const spentGold=mode===options[2],reprise=mode===options[4];
    const pair=spentGold||mode===options[3]||reprise,winner=mode===options[0]||pair;
    let recording=false, failure;
    h.report.nightRoute={};
    async function mark(name){
      const s=await h.read();
      h.report.nightRoute[name]={clock:s.state.durable.clock,position:position(s),activeSeconds:s.state.durable.playSeconds};
    }
    async function walk(point,tolerance=.58){
      const remaining=s=>Math.hypot(position(s)[0]-point[0],position(s)[2]-point[1]);
      let s=await h.read(),stalled=0;
      for(let i=0;remaining(s)>tolerance;i++){
        assert.ok(i<35&&stalled<4,`blocked toward ${point}; feet ${position(s)}`);
        const [x,,z]=position(s),yaw=Math.atan2(point[0]-x,z-point[1]);
        const angle=actual=>Math.atan2(Math.sin(yaw-actual),Math.cos(yaw-actual));
        if(Math.abs(angle(s.controller.yaw))>.071){
          await turn(yaw,.13);
          s=await h.read();
        }
        const before=remaining(s);
        const seconds=Math.min(recording?1.20:3.00,Math.max((45+stalled*17)/1000,(before-tolerance*.54)/6.8));
        if(recording)await play.keyboard.hold('KeyW',seconds*1000);
        else{
          await page.keyboard.down('KeyW');
          try{await play.advance(seconds,{stepSeconds:.045,read});}
          finally{await page.keyboard.up('KeyW');}
        }
        await h.settle();s=await h.read();
        assert.ok(walking(s));
        stalled=before-remaining(s)<.04?stalled+1:0;
      }
    }
    async function route(points,t){for(const point of points)await walk(point,t);}
    async function use(id){
      await h.wait(s=>walking(s)&&s.state.runtime.nearby===id,5000);
      await h.key('KeyE');return h.read();
    }
    async function lens(value){
      await click(action('toggle-photo-tools'));
      await click(action('photo-option')+'[data-photo-key="lens"][data-value="'+value+'"]');
      await click(action('toggle-photo-tools'));
      await h.wait(s=>cameraActive(s)&&s.state.durable.photography.lens===value);
    }
    async function turn(yaw,pitch=.13){
      const wrap=angle=>Math.atan2(Math.sin(angle),Math.cos(angle));
      for(let attempt=0;attempt<4;attempt++){
        try{await h.turnTo(yaw,pitch);return;}
        catch(error){
          const s=await h.read(), delta=wrap(yaw-s.controller.yaw);
          if(Math.abs(delta)<.066 && Math.abs(s.controller.pitch-pitch)<.037)return;
          if(attempt===3)throw error;
          if(Math.abs(delta)>.028){
            const rate=(cameraActive(s)?1.35:2.15)*Math.min(2.5,Math.max(.4,s.state.durable.settings.sensitivity));
            const key=delta>0?'ArrowRight':'ArrowLeft';
            if(recording)await play.keyboard.hold(key,Math.max(50,Math.abs(delta)*1000/rate));
            else{
              await page.keyboard.down(key);
              try{await play.advance(Math.abs(delta)/rate,{stepSeconds:.025,read});}
              finally{await page.keyboard.up(key);}
            }
          }
        }
      }
    }
    async function aim([x,y,z]){
      const p=(await h.read()).controller.camera.position;
      await turn(Math.atan2(x-p[0],p[2]-z),-Math.atan2(y-p[1],Math.hypot(x-p[0],z-p[2])));
    }
    async function photo(name,feet,target,expected,lensName){
      await walk(feet,expected?.matchedCard==='forest'?.63:.25);await h.key('KeyC');await h.wait(cameraActive);
      if(lensName)await lens(lensName);
      await aim(target);await h.shot(name+'-view');
      const shot=await h.photograph(name,expected);await h.lowerCamera();return shot;
    }
    async function gear(op,kind){
      await click(action('open-gear'));await h.wait(s=>s.state.runtime.screen==='journal');
      if(op==='take'&&recording)await h.shot('inventory-take-fireworks');
      await click(action('night-gear')+'[data-operation="'+op+'"]'+(kind?'[data-firework="'+kind+'"]':''));
      await h.wait(walking);
    }
    async function waitForBell(){
      const before=await h.read(), seconds=(1120.25-before.state.durable.clock.minute)*1.5;
      // Official timer advance steps the normal clock and weather with no input.
      if(seconds>0)await play.advance(seconds,{stepSeconds:.10,read});
      const after=await h.wait(s=>walking(s)&&s.state.durable.clock.minute>=1120,8000);
      assert.ok(Math.hypot(...position(after).map((n,i)=>n-position(before)[i]))<.24);
      assert.ok(Math.abs(after.controller.yaw-before.controller.yaw)<.023);
      await mark('last-bell');
    }
    const reachUpper=async()=>{await route(courtyard,.35);await route(upper,.32);};
    async function day(){
      if(index>0){
        if(!(await page.locator(action('restart')).isVisible())){
          if(cameraActive(await play.state(read)))await play.keyboard.press('KeyC');
          const close=page.locator('button.sy-close:visible');
          if(await close.first().isVisible())await close.first().click();
          await h.key('Escape');
          if(await page.locator(action('back-to-menu')).isVisible())await click(action('back-to-menu'));
          else await play.reload();
        }
        await click(action('restart'));await click(action('confirm-restart'));
        await h.wait(s=>walking(s)&&s.state.durable.totalPhotos===0);
      }else await h.startFresh();
      assert.equal(Math.floor((await h.read()).state.durable.clock.minute),780);await mark('start-13-00');
      await h.key('KeyJ');await page.getByRole('button',{name:'先上路',exact:true}).click();
      await click('button.sy-close:visible');await h.wait(walking);
      await route([[9.5,-226.2],[0,-220]]);
      await route(P0_ROUTE.forest.slice(1));
      await photo('forest-directions',P0_ROUTE.forestPhoto.feet,P0_ROUTE.forestPhoto.target,{matchedCard:'forest'});
      await route(P0_ROUTE.forestReturn);
      await route(P0_ROUTE.town.slice(1,-1));
      if(!winner){
        await route([[155,-16.5],[147.15,-16.5]],.4);
        await turn(-Math.PI/2,.13);await play.keyboard.hold('KeyW',850);
        const atGate=await h.read();assert.ok(position(atGate)[0]>=145.99);assert.match(atGate.view.hint??'',/白天休市/);
        await h.shot('market-day-closed');await route([[153,-16.5],[155,-6]],.45);
      }
      await route(P0_ROUTE.lever,.35);await use('town-gate');
      await walk([148,-2],.42);
      await photo('stone-arch',[155,-3],[155,29,10],{matchedCard:'town'});
      await h.wait(s=>s.world.bridgeWalkable);
      await route([[155,7],[155,20]],.65);await reachUpper();
      const window=await photo('hall-window',[159.17,94.6],[159.42,35.91,92.12],undefined,'standard');
      assert.equal(window.afternoonSubject,'hall-window');return window;
    }
    try {
      const window=await h.step(mode+' · title to daylight delivery photograph',day);
      if(pair){
        const fieldRoute=[[155,-19],[150,-27],[145,-35],[140,-42],[136,-42.2]];
        const townEntry=[[155,-16.5],[146.8,-16.5],[143,-16.5]];
        await h.step('first reward and ordinary descent before collecting scarlet',async()=>{
          await use('afternoon-window');await h.wait(s=>s.state.durable.fireworks?.photo.id===window.id);
          await mark('gold-earned');
          await route(reverseUpper,.36);await route([[158.1,61],[159.9,60.55]],.44);await waitForBell();
          await use('night-torch-foot');await h.wait(s=>s.state.runtime.torchLit);
          await route(courtyard.slice(0,-2).reverse(),.43);
          await route([[155,20],[155,7]],.48);
          if(!spentGold)return;
          await route(fieldRoute,.48);
          await turn(0,.25);await gear('take','gold');await use('night-place');
          await h.wait(s=>s.state.durable.night.placed);
          await use('night-ignite');await h.wait(s=>s.state.durable.night.spent);
          await mark('original-gold-spent');
          await play.advance(42.2,{stepSeconds:.10,read});
          await h.wait(s=>!s.state.runtime.fireworkShow);
        });
        await h.step('recognize the crescent, deliver the fish letter, and continue the spent-gold save',async()=>{
          if(spentGold)await route(fieldRoute.slice(0,-1).reverse(),.48);
          await route(townEntry,.46);
          await route([[140,-16.5],[139.8,-13.1]],.41);
          await use('night-letter');await h.wait(s=>s.state.durable.night.fishLetter==='carrying');
          await route([[139.7,-16.1],[135,-16.4],[132.3,-18.2],[130.0,-20.22]],.40);
          await use('night-repair');await h.wait(s=>s.state.durable.night.scarletClaimed);
          await h.shot('scarlet-earned-at-repair-stall');await mark('scarlet-earned');
          await use('night-repair');
          const after=await h.read();assert.equal(after.state.durable.night.scarletSpent,false);
          if(!spentGold)return;
          await play.wait(1000);
          await play.reload();
          await h.wait(s=>s.restored&&s.state.runtime.screen==='menu'&&s.state.durable.night.spent&&s.state.durable.night.scarletClaimed,35000);
          await click(action('continue'));await h.wait(walking);await h.shot('continue-old-spent-gold');
        });
        await h.step('prepare both physical boxes and replace the gold box',async()=>{
          await route([[131.9,-18.2],[135,-16.4],[140,-16.5],[147,-16.5],[155,-16.5],...fieldRoute],.48);
          if(!(await h.read()).state.runtime.torchLit)await gear('torch');
          await h.wait(s=>s.state.runtime.torchLit);
          if(spentGold){
            await gear('invite-gold');await h.wait(s=>s.state.durable.night.goldEncore&&!s.state.durable.night.goldEncore.spent);
            await h.shot('borrowed-gold-at-the-field');
          }
          async function place(kind,point){
            await walk(point,.23);await turn(0,.34);await gear('take',kind);await use('night-place');
            return h.wait(s=>kind==='scarlet'?s.state.durable.night.scarletPlaced:s.state.durable.night.placed);
          }
          let scarlet;
          if(spentGold)scarlet=await place('scarlet',[137.1,-42.2]);
          await place('gold',[131.5,-41.46]);
          if(!spentGold){
            scarlet=await place('scarlet',[137.1,-42.2]);
            await walk([131.5,-41.46],.25);await turn(0,.34);
          }
          const first=await h.read();
          await gear('retrieve','gold');await h.wait(s=>!s.state.durable.night.placed&&s.state.runtime.placingFirework);
          await walk([129.1,-41.47],.22);await turn(0,.34);await use('night-place');
          let pairPlaced=await h.wait(s=>s.state.durable.night.placed && s.state.durable.night.scarletPlaced);
          assert.notDeepEqual(pairPlaced.state.durable.night.placed,first.state.durable.night.placed);
          assert.deepEqual(pairPlaced.state.durable.night.scarletPlaced,scarlet.state.durable.night.scarletPlaced);
          await h.shot('both-real-ground-placements');
          if(reprise){
            await use('night-ignite');await h.wait(s=>s.state.runtime.fireworkShow&&s.state.durable.night.scarletSpent);
            await mark('both-original-boxes-spent-without-taking-a-photo');
            await play.advance(42.3,{stepSeconds:.10,read});
            await h.wait(s=>!s.state.runtime.fireworkShow);
            await gear('reprise');await h.wait(s=>s.state.durable.night.repriseNight===s.state.durable.clock.day);
            await h.shot('obtained-two-reprise-boxes-in-the-same-night');
            await place('scarlet',[136.8,-42.05]);await place('gold',[129.6,-41.46]);
            pairPlaced=await h.wait(s=>s.state.durable.night.placed&&s.state.durable.night.scarletPlaced);
            await h.shot('new-ground-positions-for-reprise');
          }
          h.report.launches={gold:pairPlaced.state.durable.night.placed,scarlet:pairPlaced.state.durable.night.scarletPlaced};
        });
        await h.step('light the two world positions once, compose normally and export two original photographs',async()=>{
          const audioTracks=await startVideo(page);recording=true;
          assert.ok(audioTracks>0,'the recorder must capture the running game audio before ignition');
          await use('night-ignite');
          const lit=await h.wait(s=>s.state.runtime.fireworkShow&&s.state.durable.night.scarletSpent);
          assert.deepEqual(lit.state.runtime.fireworkShow.launches,h.report.launches);
          assert.equal(lit.state.durable.night.repriseNight??null,null);
          const started=lit.state.runtime.fireworkShow.startedAt;
          await mark('one-ignition-two-launches');
          await route([[131,-47],[135,-54],[135,-62],reprise?[130.5,-70]:[135,-70]],.5);
          await gear('torch');
          await h.key('KeyC');await h.wait(cameraActive);await lens('wide');
          const origin=(await h.read()).controller.camera.position;
          await aim([133.8,origin[1]+9.1,-46.8]);
          await h.wait(s=>cameraActive(s)&&s.state.durable.playSeconds-started>=31,38000);
          const before=await h.read();
          assert.ok(before.state.durable.playSeconds-started<34.8,'the main shutter missed both flowers');
          const main=await h.photograph('willow-and-scarlet-wide');
          h.report.shutter={main:before.state.durable.playSeconds-started,weather:main.scene?.weather};
          await h.wait(s=>cameraActive(s)&&s.state.durable.playSeconds-started>=34.6,5500);
          const tail=await h.photograph('willow-and-scarlet-fading');
          h.report.video=await stopVideo(page,join(h.out,'金柳与朱红-现场录屏.webm'));recording=false;
          assert.ok(h.report.video?.bytes>10000);
          await h.lowerCamera();await click(action('open-film'));
          for (const [file,shot] of [['金柳与朱红-同框原片',main],['金柳与朱红-余花原片',tail]]) {
            await page.locator(action('view-photo')+'[data-id="'+shot.id+'"]').click();
            await h.download(file,()=>click(action('export-photo')),[1920,1080],{photoId:shot.id,bytes:shot.original.bytes});
            if(shot===main)await click(action('close-photo-detail'));
          }
          await play.reload();
          await h.wait(s=>s.restored&&s.state.runtime.screen==='menu'&&s.state.durable.night.scarletSpent,35000);
          await click(action('continue'));
          await h.wait(s=>walking(s)&&s.state.durable.night.scarletClaimed&&
            s.state.durable.film.some(p=>p.id===main.id)&&s.state.durable.film.some(p=>p.id===tail.id));
          await h.shot('continued-with-both-originals');
        });
      }else if(winner){
        await h.step('collect the box and take a torch after the hall closes',async()=>{
          await use('afternoon-window');await h.wait(s=>s.state.durable.fireworks?.photo.id===window.id);
          await mark('received-fireworks');
          await route(reverseUpper,.36);await route([[158.1,61],[159.9,60.55]],.44);
          await waitForBell();
          await startVideo(page);recording=true;
          await use('night-torch-foot');await h.wait(s=>s.state.runtime.torchLit);
          await h.shot('holding-torch');await mark('lit-torch');
          await gear('take');await use('night-place');
          assert.equal((await h.read()).state.durable.night.placed,null);
          await h.shot('town-rejects-placement');
          await click(action('night-gear')+'[data-operation="cancel"]');await h.wait(s=>!s.state.runtime.placingFirework);
        });
        await h.step('torch uphill, place twice, ignite and export the real firework photograph',async()=>{
          await route([[158,62],[158,65.3],[158,76.5],[158,81],[160.34,81.19]],.31);
          await mark('uphill-with-torch');
          await turn(0,.29);await gear('take');await h.shot('ground-preview');
          await use('night-place');
          const placed=await h.wait(s=>Boolean(s.state.durable.night.placed));
          await h.shot('physically-placed');await gear('retrieve');
          await h.wait(s=>s.state.runtime.placingFirework&&!s.state.durable.night.placed);
          await walk([160.18,81.55],.20);await turn(0,.29);await use('night-place');
          const second=await h.wait(s=>Boolean(s.state.durable.night.placed));
          assert.notDeepEqual(second.state.durable.night.placed,placed.state.durable.night.placed);await mark('placed-again');
          await use('night-ignite');
          await h.wait(s=>s.state.runtime.fireworkShow&&s.state.durable.night.spent);await mark('ignited-by-hand');
          await route([[158,83.3],[158,89],[157.9,91.55]],.35);
          await gear('torch');
          await h.key('KeyC');await h.wait(cameraActive);await lens('wide');
          await aim([159.8,39.8,71.2]);
          await h.wait(s=>s.state.runtime.fireworkShow&&s.state.durable.playSeconds-s.state.runtime.fireworkShow.startedAt>=30.3,33000);
          await h.shot('main-burst-finder');
          const firework=await h.photograph('main-burst');
          assert.ok(firework.original&&firework.scene?.clock.minute>=1120);
          await h.lowerCamera();
          await click(action('open-film'));
          await page.locator(action('view-photo')+'[data-id="'+firework.id+'"]').click();
          await h.download('山口烟花-实拍原片',()=>click(action('export-photo')),[1920,1080],{photoId:firework.id,bytes:firework.original.bytes});
          await h.shot('exported-original-from-journal');
          h.report.video=await stopVideo(page,join(h.out,'山口烟花-现场录屏.webm'));recording=false;
          assert.ok(h.report.video?.bytes>10000);
          await play.reload();
          await h.wait(s=>s.restored&&s.state.runtime.screen==='menu'&&s.state.durable.night.spent,35000);
          await click(action('continue'));
          await h.wait(s=>walking(s)&&s.state.durable.film.some(p=>p.id===firework.id));await h.shot('reloaded-after-show');
        });
      }else{
        await h.step('already upstairs at the bell, descend and confirm ordinary uphill is blocked',async()=>{
          await waitForBell();await use('afternoon-window');
          const closed=await h.read();assert.equal(closed.state.durable.fireworks,null);assert.match(closed.state.runtime.notice,/06:20/);
          await h.shot('closed-hall-player-remains-upstairs');
          await route(reverseUpper,.36);assert.equal((await h.read()).state.runtime.torchLit,false);
          await turn(Math.PI,.18);await play.keyboard.hold('KeyW',900);
          const denied=await h.read();assert.ok(position(denied)[2]<65.71);assert.match(denied.view.hint??'',/禅院已闭院/);
          await h.shot('ordinary-uphill-blocked');
          await route(courtyard.slice(0,-1).reverse(),.38);
          await route([[155,20],[155,7],[155,-16.5],[146.8,-16.5],[143,-16.5]],.48);
          await mark('night-market-entered');await h.shot('market-open-without-fireworks');
        });
        await h.step('shake the fish lantern, lodge to 06:20 and deliver the same photograph',async()=>{
          await route([[139,-16.5],[131.2,-17.2]],.40);await use('night-fish');
          await h.wait(s=>s.state.runtime.fishMotionUntil>s.state.durable.playSeconds);await h.shot('fish-lantern-moving');
          await route([[136,-16.5],[140.5,-20.2]],.40);await use('night-inn');
          const dawn=await h.wait(s=>s.state.durable.clock.day===2&&Math.floor(s.state.durable.clock.minute)===380);
          assert.equal(dawn.state.durable.fireworks,null);
          assert.equal(dawn.state.durable.film.find(p=>p.id===window.id).original.key,window.original.key);
          await mark('lodged-until-06-20');await h.shot('inn-next-morning');
          await route([[140.5,-16.5],[147,-16.5],[155,-16.5],[155,20]],.50);
          await reachUpper();await use('afternoon-window');
          const reward=await h.wait(s=>s.state.durable.fireworks?.photo.id===window.id);
          assert.equal(reward.state.durable.fireworks.day,2);
          await mark('same-photo-delivered-next-morning');await h.shot('next-day-reward');
        });
      }
    }catch(error){
      failure=error;failures.push({mode,error:String(error)});await h.shot('failed').catch(()=>{});
    }finally{
      if(recording)h.report.failureVideo=await stopVideo(page,join(h.out,'诊断录屏.webm')).catch(()=>undefined);
      await h.finish(failure);
    }
  }
  assert.deepEqual(failures,[]);
}
