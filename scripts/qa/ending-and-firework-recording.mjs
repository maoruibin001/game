import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cameraActive, createLetterHarness, walking } from './letter-normal-input.mjs';
import { P0_ROUTE } from './p0-route-plan.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const output=join(root,'artifacts/retake-20261120');
const action=(name)=>`[data-action="${name}"]`;
const courtyard=[[155,28],[155,37],[155.6,45],[155.95,50],[155.95,54.8],[156.45,56.2],[156.45,58.6],[158,61],[158,65.3]];
const upper=[[158,76.5],[158,81],[158,91.5],[158,93.75],[159.17,94.6]];
const wrap=x=>Math.atan2(Math.sin(x),Math.cos(x));

async function recordBrowser(page,out) {
  const frameDir=join(out,'screen-frames');
  await mkdir(frameDir);
  const session=await page.context().newCDPSession(page);
  const frames=[],pending=new Set();
  let failure,startUnix=Date.now()/1000;
  session.on('Page.screencastFrame',event=>{
    session.send('Page.screencastFrameAck',{sessionId:event.sessionId}).catch(error=>{failure??=error;});
    const file=join(frameDir,`${String(frames.length).padStart(6,'0')}.jpg`);
    frames.push({file,seconds:(event.metadata.timestamp??Date.now()/1000)-startUnix});
    const saved=writeFile(file,Buffer.from(event.data,'base64')).catch(error=>{failure??=error;}).finally(()=>pending.delete(saved));
    pending.add(saved);
  });
  await session.send('Page.enable');
  startUnix=Date.now()/1000;
  await session.send('Page.startScreencast',{format:'jpeg',quality:76,maxWidth:1600,maxHeight:900,everyNthFrame:1});
  await page.evaluate(()=>{
    const connect=AudioNode.prototype.connect;
    AudioNode.prototype.connect=function(target,...options){
      const result=connect.call(this,target,...options);
      if(target instanceof AudioDestinationNode&&this.context instanceof AudioContext){
        if(!window.routeAudio){
          const tap=this.context.createMediaStreamDestination();
          const chunks=[],recorder=new MediaRecorder(tap.stream,{mimeType:'audio/webm;codecs=opus'});
          const done=new Promise(resolve=>{
            recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
            recorder.onstop=()=>resolve(new Blob(chunks,{type:recorder.mimeType}));
          });
          connect.call(this,tap);
          window.routeAudio={recorder,done,context:this.context,tap,start:null};
        }else if(window.routeAudio.context===this.context){
          connect.call(this,window.routeAudio.tap);
        }
      }
      return result;
    };
  });
  return {
    now:()=>Date.now()/1000-startUnix,
    async startAudio(){
      return page.evaluate(()=>{
        const audio=window.routeAudio;
        if(!audio)return false;
        if(audio.recorder.state==='inactive'){audio.start=Date.now()/1000;audio.recorder.start(1000);}
        return true;
      });
    },
    async stop(){
      await session.send('Page.stopScreencast');
      await Promise.all(pending);
      const endSeconds=Date.now()/1000-startUnix;
      const audio=await page.evaluate(async()=>{
        const audio=window.routeAudio;
        if(!audio?.start||audio.recorder.state==='inactive')return null;
        audio.recorder.stop();
        const blob=await audio.done,bytes=new Uint8Array(await blob.arrayBuffer());
        let raw='';
        for(let offset=0;offset<bytes.length;offset+=0x4000)raw+=String.fromCharCode(...bytes.subarray(offset,offset+0x4000));
        return {started:audio.start,base64:btoa(raw)};
      });
      if(audio)await writeFile(join(out,'screen-audio.webm'),Buffer.from(audio.base64,'base64'));
      await writeFile(join(out,'screen-frames.json'),JSON.stringify({endSeconds,audioDelay:audio?audio.started-startUnix:null,frames},null,2)+'\n');
      await session.detach();
      if(failure)throw failure;
      assert.ok(frames.length>10,'browser produced too few screencast frames');
    },
  };
}

export default async function endingAndFirework(play) {
  const h=await createLetterHarness(play,{id:'ordinary-ending-and-firework',viewport:[1920,1080]},
    {budgetMs:840000,commit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim()},output);
  const page=play.page, click=selector=>page.locator(selector).click({timeout:8000});
  const film=await recordBrowser(page,h.out);
  let run=false,failure;
  h.report.chapters=[];
  async function mark(name){
    const s=await h.read();
    const chapter={name,seconds:Number(film.now().toFixed(2)),playSeconds:s.state.durable.playSeconds,clock:s.state.durable.clock,position:s.controller.position};
    h.report.chapters.push(chapter);
    console.log(JSON.stringify(chapter));
    await writeFile(join(h.out,'chapters.json'),JSON.stringify(h.report.chapters,null,2)+'\n');
    return s;
  }
  async function turn(yaw,pitch=.13) {
    for(let attempt=0;attempt<4;attempt++){
      try{await h.turnTo(yaw,pitch);return;}
      catch(error){
        const s=await h.read(),delta=wrap(yaw-s.controller.yaw);
        if(Math.abs(delta)<.065&&Math.abs(pitch-s.controller.pitch)<.045)return;
        if(attempt===3)throw error;
        if(Math.abs(delta)>.04)await play.keyboard.hold(delta>0?'ArrowRight':'ArrowLeft',
          Math.max(50,Math.abs(delta)*1000/(cameraActive(s)?1.35:2.15)));
      }
    }
  }
  async function walk([x,z],tolerance=.65){
    let s=await h.wait(walking);
    const dist=state=>Math.hypot(state.controller.position[0]-x,state.controller.position[2]-z);
    let stalled=0;
    for(let n=0;dist(s)>tolerance;n++){
      assert.ok(n<33&&stalled<5,`normal road blocked at ${s.controller.position} toward ${[x,z]}`);
      const [px,,pz]=s.controller.position,yaw=Math.atan2(x-px,pz-z);
      if(Math.abs(wrap(yaw-s.controller.yaw))>.045)await turn(yaw);
      const before=dist(await h.read()),sprint=run&&before>5.5;
      if(sprint)await page.keyboard.down('Shift');
      try{await play.keyboard.hold('KeyW',Math.min(4200,Math.max(90,(before-tolerance*.52)*1000/(sprint?11:6.8))));}
      finally{if(sprint)await page.keyboard.up('Shift');}
      await h.settle();s=await h.read();
      stalled=before-dist(s)<.04?stalled+1:0;
    }
    return s;
  }
  async function route(points,tolerance){for(const point of points)await walk(point,tolerance);}
  async function use(id){
    await h.wait(s=>walking(s)&&s.state.runtime.nearby===id,6500);
    await h.key('KeyE');
  }
  async function aim([x,y,z]){
    const p=(await h.read()).controller.camera.position;
    await turn(Math.atan2(x-p[0],p[2]-z),-Math.atan2(y-p[1],Math.hypot(x-p[0],z-p[2])));
  }
  async function lens(name){
    await click(action('toggle-photo-tools'));
    await click(action('photo-option')+`[data-photo-key="lens"][data-value="${name}"]`);
    await click(action('toggle-photo-tools'));
    await h.wait(s=>cameraActive(s)&&s.state.durable.photography.lens===name);
  }
  async function photo(name,feet,target,expected,lensName){
    await walk(feet,expected?.matchedCard==='forest'?.56:.25);
    await h.key('KeyC');await h.wait(cameraActive);
    if(lensName)await lens(lensName);
    await aim(target);
    const saved=await h.photograph(name,expected);await h.lowerCamera();
    return saved;
  }
  async function close(){await click('button.sy-close:visible');await h.wait(walking);}
  async function gear(operation,kind){
    await click(action('open-gear'));await h.wait(s=>s.state.runtime.screen==='journal');
    await click(action('night-gear')+`[data-operation="${operation}"]`+(kind?`[data-firework="${kind}"]`:''));
    await h.wait(walking);
  }
  try {
    await h.step('标题页开空白新档并学会跑步',async()=>{
      await mark('标题页 · 新档');
      await h.startFresh();await film.startAudio();
      assert.equal(Math.floor((await h.read()).state.durable.clock.minute),780);
      await mark('山口邮局 · 13:00');
      await h.key('KeyJ');await page.getByRole('button',{name:'先上路',exact:true}).click();await close();
      await route([[9.5,-226.2],[0,-220],[-8,-214.1]],.43);
      await use('afternoon-pine-bag');await h.wait(s=>s.state.durable.skills.run);run=true;
      await mark('松针袋交接 · 解锁跑步');
    });
    let forest,town;
    await h.step('沿邮路拍风车，进镇开木屏并拍石拱',async()=>{
      await route(P0_ROUTE.forest.slice(1));
      forest=await photo('林地来信-风铃与风车',P0_ROUTE.forestPhoto.feet,P0_ROUTE.forestPhoto.target,{matchedCard:'forest'});
      await mark('风来林地 · 第一张回信照片');
      await route(P0_ROUTE.forestReturn);await route(P0_ROUTE.town.slice(1,-1));
      await route(P0_ROUTE.lever,.35);await use('town-gate');
      await h.wait(s=>s.state.durable.gateOpened);
      await walk([148,-2],.42);
      town=await photo('旧镇来信-石拱与双峰',[155,-3],[155,29,10],{matchedCard:'town'});
      await h.wait(s=>s.world.bridgeWalkable);
      await mark('石巷旧镇 · 第二张回信照片与落桥');
    });
    await h.step('选好两封回信和明信片，按邮筒寄出并看到结局',async()=>{
      await h.key('KeyJ');await h.wait(s=>s.state.runtime.screen==='journal');await click('[role="tab"][data-tab="letters"]');
      for(const [id,photo] of [['forest',forest],['town',town]]){
        const letter=page.locator(`[data-reply-letter="${id}"]`);
        await letter.locator(action('pick-reply-photo')+`[data-id="${photo.id}"]`).click({timeout:8000});
        await letter.locator(action('select-reply-photo')).click({timeout:8000});
        await h.wait(s=>s.state.durable.replyPhotos[id]?.photo.id===photo.id);
      }
      await click(action('edit-reply')+'[data-letter="final"]');
      await click(action('pick-reply-photo')+`[data-letter="final"][data-id="${town.id}"]`);
      await click(action('confirm-final-photo'));await h.wait(s=>s.view.canSendLetter);await close();
      await route(P0_ROUTE.mailbox,.45);await use('mailbox:town');await click(action('send-letter'));
      await h.wait(s=>s.state.durable.mailed&&s.state.runtime.screen==='ending');
      await mark('主线通关 · 寄给远方的信');await h.shot('主线结局');
      await play.wait(6000);await click(action('keep-exploring'));await h.wait(walking);
    });
    await h.step('走上禅院交照片，取得花盒，再到茶亭候时',async()=>{
      run=false;
      await route([[155,7],[155,20],...courtyard,...upper],.37);
      const window=await photo('禅院老窗',[159.17,94.6],[159.42,35.91,92.12],undefined,'standard');
      assert.equal(window.afternoonSubject,'hall-window');
      await use('afternoon-window');await h.wait(s=>s.state.durable.fireworks?.photo.id===window.id);
      await mark('上院交照 · 领到金柳');
      await route(upper.slice(0,-1).reverse(),.38);
      await route(courtyard.slice(3).reverse(),.39);
      await h.wait(s=>s.view.restPoint?.available);
      const before=await h.read();
      if(before.state.durable.clock.minute<1060){
        await click(action('open-rest'));
        await click(action('rest-until')+'[data-target="sunset"]');
        await h.wait(s=>walking(s)&&s.state.durable.clock.minute>=1060);
        await mark('旧镇茶亭 · 小憩到日落');
      }
      await route([...courtyard.slice(4,-1),[159.9,60.55]],.40);
      await turn(0,-.02);
      const waiting=await h.read();
      if(waiting.state.durable.clock.minute<1120){
        await mark('山门前 · 等最后一声钟');
        await h.wait(s=>walking(s)&&s.state.durable.clock.minute>=1120,108000);
      }
    });
    await h.step('取火把上山、摆花盒、点火并等待整场结束',async()=>{
      await use('night-torch-foot');await h.wait(s=>s.state.runtime.torchLit);
      await mark('闭院后 · 领火把上山');
      await route([[158,62],[158,65.3],[158,76.5],[158,81],[160.34,81.19]],.31);
      await turn(0,.29);await gear('take','gold');await use('night-place');
      await h.wait(s=>s.state.durable.night.placed);await mark('半山松台 · 放下金柳');
      await use('night-ignite');
      await h.wait(s=>s.state.runtime.fireworkShow&&s.state.durable.night.spent);
      await mark('按 E 亲手点燃');
      await route([[158,83.3],[158,89],[157.9,91.55]],.38);await gear('torch');
      await h.key('KeyC');await h.wait(cameraActive);await lens('wide');
      await aim([159.8,39.8,71.2]);
      await h.wait(s=>s.state.runtime.fireworkShow&&s.state.durable.playSeconds-s.state.runtime.fireworkShow.startedAt>=30.3,33000);
      const original=await h.photograph('金柳主花-玩家相机');
      await mark('金柳主花 · 实拍');
      await h.wait(s=>cameraActive(s)&&!s.state.runtime.fireworkShow,20000);
      await h.lowerCamera();await click(action('open-film'));
      await click(action('view-photo')+`[data-id="${original.id}"]`);
      await h.download('半山松台-金柳实拍原片',()=>click(action('export-photo')),[1920,1080],{photoId:original.id,bytes:original.original.bytes});
      await mark('从底片导出现场原片');await play.wait(3000);
    });
  }catch(error){
    failure=error;await h.shot('最后现场').catch(()=>{});throw error;
  }finally{
    try{await film.stop();}finally{await h.finish(failure);}
  }
}
