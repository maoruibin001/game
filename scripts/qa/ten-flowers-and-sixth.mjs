import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cameraActive, createLetterHarness, walking, sha } from './letter-normal-input.mjs';
import { P0_ROUTE } from './p0-route-plan.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const output=join(root,process.env.FINAL_QA_EVIDENCE??'artifacts/final-delivery-20261120');
const read='shan.journey', action=name=>`[data-action="${name}"]`;
const courtyard=[[155,28],[155,37],[155.6,45],[155.95,50],[155.95,54.8],[156.45,56.2],[156.45,58.6],[158,61],[158,65.3]];
const upper=[[158,76.5],[158,81],[158,91.5],[158,93.75],[159.17,94.6]];
const market=[[155,-16.5],[147,-16.5],[141,-16.5]];
const field=[[155,-19],[150,-27],[145,-35],[140.7,-42],[137.2,-41.25]];
const townRear=[[155,20],[166,31],[168,29],[172,27]];
const ridge=[[194,59],[216,109],[171,135],[126,178],[64,204]];
const backFromPostcard=[[172,27],[168,29],[166,31],[155,20]];
const staging=[
  [128.2,-41.25,0],[130.2,-41.25,0],[131.104,-41.704,Math.PI/4],
  [135.296,-41.704,-Math.PI/4],[135.104,-41.704,Math.PI/4],[129.2,-44.25,0],
  [132.296,-44.704,-Math.PI/4],[132.104,-44.704,Math.PI/4],[135.38,-44.25,0],[137.2,-44.25,0],
];
const kinds=['gold','scarlet','silver','twins','rain','wheat','swallow','pine','moon','stars'];
const feet=s=>s.controller.position;

function tap(){
  if(window.finalAudioTaps)return;
  const taps=new Map(), connect=AudioNode.prototype.connect;
  window.finalAudioTaps=taps;
  AudioNode.prototype.connect=function(target,...options){
    const result=connect.call(this,target,...options);
    if(target instanceof AudioDestinationNode&&this.context instanceof AudioContext&&!taps.has(this.context)){
      const node=this.context.createMediaStreamDestination();
      taps.set(this.context,node);connect.call(this,node);
    }
    return result;
  };
}

const nameForKind={gold:'金柳',scarlet:'朱红',silver:'银羽',twins:'并蒂',rain:'听雨珠',wheat:'麦浪',swallow:'折燕',pine:'松针',moon:'月渡',stars:'千星归谷'};
export default async function tenFlowersAndSixth(play){
  const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  const invitationOnly=process.env.FINAL_QA_INVITE==='1';
  const savedFile=process.env.FINAL_QA_RESUME;
  const savedBytes=savedFile?await readFile(savedFile):null;
  const expectedSave=invitationOnly
    ?'4616c9c619a57c05553baa34c05a1d1a6975fbc20a82a8bb250ba6481c66e1eb'
    :'d33a27e1960c53fdfb26d8a763010cf05ceca064d27117afd896e32f49450d57';
  assert.ok(!invitationOnly||savedBytes);
  if(savedBytes)assert.equal(sha(savedBytes),expectedSave);
  const h=await createLetterHarness(play,{id:invitationOnly?'ten-flowers-invitation':savedBytes?'ten-flowers-resumed':'ten-flowers-and-sixth',viewport:[1920,1080]},
    {budgetMs:720000,commit,initialPhotoCount:invitationOnly?12:savedBytes?10:0},output);
  const page=play.page,click=selector=>page.locator(selector).first().click({timeout:9000});
  const errors=[];
  page.on('pageerror',error=>errors.push(String(error)));
  page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});
  await page.addInitScript(tap);await page.evaluate(tap);
  h.report.milestones=[];
  const exercised=async label=>h.record(label,await h.read());
  async function mark(label){
    const state=await h.read();
    h.report.milestones.push({label,clock:state.state.durable.clock,elapsed:state.state.durable.playSeconds,feet:feet(state)});
  }
  async function shot(name){return h.shot(name);}
  async function startClip(){
    const result=await page.locator('canvas').first().evaluate(canvas=>{
      const stream=canvas.captureStream(30);
      const taps=Array.from(window.finalAudioTaps?.values()??[]).filter(t=>t.context.state==='running');
      const mix=taps[0]?.context.createMediaStreamDestination();
      const sources=mix?taps.map(tap=>mix.context.createMediaStreamSource(tap.stream)):[];
      if(mix){
        for(const source of sources)source.connect(mix);
        for(const track of mix.stream.getAudioTracks())stream.addTrack(track);
      }
      const mimeType=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(type=>MediaRecorder.isTypeSupported(type));
      const recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:5_000_000,audioBitsPerSecond:128000}),parts=[];
      const finished=new Promise(resolve=>{
        recorder.ondataavailable=e=>{if(e.data.size)parts.push(e.data);};
        recorder.onstop=()=>resolve(new Blob(parts,{type:recorder.mimeType}));
      });
      recorder.start(400);window.finalClip={recorder,finished,stream,sources};
      return stream.getAudioTracks().length;
    });
    assert.ok(result>0,'game audio exits through the same browser output');
  }
  async function clip(name){
    const raw=await page.evaluate(async()=>{
      const current=window.finalClip;
      current.recorder.stop();
      const bytes=new Uint8Array(await (await current.finished).arrayBuffer());
      let out='';
      for(let i=0;i<bytes.length;i+=0x4000)out+=String.fromCharCode(...bytes.subarray(i,i+0x4000));
      for(const source of current.sources)source.disconnect();
      for(const track of current.stream.getTracks())track.stop();
      delete window.finalClip;
      return btoa(out);
    });
    const bytes=Buffer.from(raw,'base64');
    await writeFile(join(h.out,name+'.webm'),bytes);
    assert.ok(bytes.length>10000);
  }
  const close=async()=>{
    await click('button.sy-close:visible');await h.settle();
  };
  async function ready(){
    for(let n=0;n<6&&(await h.read()).state.runtime.screen==='journal';n++)await close();
    return h.wait(walking);
  }
  async function advance(seconds){
    await play.advance(seconds,{stepSeconds:.08,read});
  }
  async function night(){
    const now=(await h.read()).state.durable.clock.minute;
    if(now>=380&&now<1120.15)await advance((1120.15-now)*1.5);
    return h.wait(s=>walking(s)&&s.view.night.open);
  }
  async function turn(yaw,pitch=.13){
    const wrap=angle=>Math.atan2(Math.sin(angle),Math.cos(angle));
    if(cameraActive(await h.read())){
      for(let attempt=0;attempt<4;attempt++){
        try{await h.turnTo(yaw,pitch);return;}
        catch(error){
          const s=await h.read();
          if(Math.abs(wrap(yaw-s.controller.yaw))<.073&&Math.abs(s.controller.pitch-pitch)<.047)return;
          if(attempt===3)throw error;
        }
      }
      return;
    }
    for(let attempt=0;attempt<9;attempt++){
      const s=await h.read(),delta=wrap(yaw-s.controller.yaw);
      if(Math.abs(delta)<.077)return;
      const key=delta>0?'ArrowRight':'ArrowLeft';
      await page.keyboard.down(key);
      try{await play.advance(Math.abs(delta)/(2.15*s.state.durable.settings.sensitivity),{stepSeconds:.018,read});}
      finally{await page.keyboard.up(key);}
      await h.settle();
    }
    const s=await h.read();
    assert.ok(Math.abs(wrap(yaw-s.controller.yaw))<.133,`walking yaw failed from ${feet(s)}`);
  }
  async function walk(point,tolerance=.54){
    const narrow=point[0]>=145&&point[0]<=175&&point[1]>=5&&point[1]<=45;
    const remaining=s=>Math.hypot(feet(s)[0]-point[0],feet(s)[2]-point[1]);
    let current=await h.read(),stuck=0;
    for(let i=0;remaining(current)>tolerance;i++){
      assert.ok(i<28&&stuck<4,`blocked toward ${point}; feet ${feet(current)}`);
      const [x,,z]=feet(current),yaw=Math.atan2(point[0]-x,z-point[1]);
      if(Math.abs(Math.atan2(Math.sin(yaw-current.controller.yaw),Math.cos(yaw-current.controller.yaw)))>.072){
        await turn(yaw);current=await h.read();
      }
      const before=remaining(current);
      await page.keyboard.down('KeyW');
      try{await play.advance(Math.min(narrow?1.05:6.0,Math.max(.048+stuck*.018,(before-tolerance*.53)/6.8)),{stepSeconds:.047,read});}
      finally{await page.keyboard.up('KeyW');}
      await h.settle();current=await h.read();assert.ok(walking(current));
      stuck=before-remaining(current)<.04?stuck+1:0;
    }
    return current;
  }
  async function route(points,tolerance=.54){for(const point of points)await walk(point,tolerance);}
  async function use(id){
    try{await h.wait(s=>walking(s)&&s.state.runtime.nearby===id,3600);}
    catch(error){
      const state=await h.read();
      throw new Error(`Trying ${id} at ${feet(state)}, current prompt ${state.state.runtime.nearby}`,{cause:error});
    }
    await h.key('KeyE');
    return h.read();
  }
  async function aim(target){
    const p=(await h.read()).controller.camera.position;
    await turn(Math.atan2(target[0]-p[0],p[2]-target[2]),-Math.atan2(target[1]-p[1],Math.hypot(target[0]-p[0],target[2]-p[2])));
  }
  async function option(key,value){
    const open=page.locator(action('photo-option')+`[data-photo-key="${key}"][data-value="${value}"]`);
    if(!await open.isVisible())await click(action('toggle-photo-tools'));
    await open.click();
    if(await open.isVisible())await click(action('toggle-photo-tools'));
    await h.wait(s=>cameraActive(s)&&s.state.durable.photography[key]===value);
  }
  async function photo(label,point,target,{lens='wide',...expected}={}){
    await walk(point,.23);await h.key('KeyC');await h.wait(cameraActive);
    if((await h.read()).state.durable.photography.lens!==lens)await option('lens',lens);
    await aim(target);
    const result=await h.photograph(label,expected);
    await h.lowerCamera();
    return result;
  }
  async function claim(kind,id){
    await use(id);
    await h.wait(s=>s.state.durable.flowerStock?.earned.includes(kind),3500);
    await mark(`领到${nameForKind[kind]}`);
    await exercised(`领到${nameForKind[kind]}`);
  }
  async function openGear(){
    if((await h.read()).state.runtime.screen!=='journal'){
      await click(action('open-gear'));await h.wait(s=>s.state.runtime.screen==='journal');
    }
  }
  async function journalLetters(){
    await h.key('KeyJ');await h.wait(s=>s.state.runtime.screen==='journal');
    await click('[role="tab"][data-tab="letters"]');
  }
  async function continueSave(predicate){
    await h.key('Escape');await h.wait(s=>s.state.runtime.screen==='paused'&&s.view.saveStatus==='saved');
    await play.reload();
    await h.wait(s=>s.restored&&s.state.runtime.screen==='menu'&&predicate(s.state.durable),35000);
    await click(action('continue'));await h.wait(walking);
  }
  async function saveEvidence(name){
    await h.wait(s=>s.view.saveStatus==='saved');
    await page.context().storageState({path:join(h.out,name+'.browser-save.json'),indexedDB:true});
  }
  async function placeOne(index,kind,station,source='stock'){
    const [x,z,yaw]=station;
    const alreadyPlaced=(await h.read()).state.durable.flowerStock.boxes.length;
    if(alreadyPlaced===index+1)return;
    assert.equal(alreadyPlaced,index);
    await walk([x,z],.26);await turn(yaw,.32);
    if(!(await h.read()).state.runtime.placingFirework){
      await openGear();
      await click(action('flower-gear')+`[data-operation="take"][data-firework="${kind}"][data-source="${source}"]`);
    }
    await h.wait(s=>walking(s)&&s.state.runtime.nearby==='night-place'&&s.view.interaction?.disabled!==undefined,6000);
    for(const correction of [0,.14,-.14,.25,-.25]){
      if(correction)await turn(yaw+correction,.32);
      const state=await h.read();
      if(state.state.runtime.nearby==='night-place'&&!state.view.interaction?.disabled)break;
    }
    const state=await h.read();
    assert.equal(state.view.interaction?.disabled,false,state.view.interaction?.detail);
    await use('night-place');
    await h.wait(s=>s.state.durable.flowerStock.boxes.length===index+1,3500);
  }
  async function recoverPlacement(index,kind,error){
    const state=await h.read();
    await h.shot(`摆盒待继续-${kind}`).catch(()=>{});
    await saveEvidence(`摆盒中断-${kind}`).catch(()=>{});
    await writeFile(join(h.out,'当前摆放卡点.json'),JSON.stringify({kind,index,error:String(error),
      position:feet(state),yaw:state.controller.yaw,interaction:state.view.interaction,
      placed:state.state.durable.flowerStock.boxes},null,2));
    // Keep the same runtime for an operator to choose another ordinary station.
    const instructions=join(h.out,'继续同档.json');
    for(let attempt=0;attempt<20;attempt++){
      const available=await readFile(instructions,'utf8').then(JSON.parse).catch(()=>null);
      const station=available?.[kind];
      if(Array.isArray(station)&&station.length===3&&station.every(Number.isFinite)
        &&station[0]>=127&&station[0]<=140&&station[1]>=-48&&station[1]<=-39){
        await ready();await placeOne(index,kind,station);return;
      }
      await play.wait(5200);
    }
    throw error;
  }
  let failure,moon;
  try {
    if(savedBytes){
      await h.step('从原浏览器档继续旅程并看见十种实物',async()=>{
        h.report.resume={sameBrowserGeneratedStateSha256:expectedSave,source:invitationOnly?'6abceba ordinary finale plus eleventh reward':'00a577c ordinary inputs, day 2, ten real boxes'};
        await page.context().setStorageState(savedFile);
        await play.reload();
        const menu=await h.wait(s=>s.restored&&s.state.runtime.screen==='menu'&&s.state.durable.flowerStock?.earned.length===10,35000);
        assert.deepEqual(menu.state.durable.flowerStock.earned,kinds);
        assert.equal(menu.state.durable.flowerStock.boxes.length,0);
        moon=menu.state.durable.flowerQuests.proofs.moon;
        await click(action('continue'));await h.wait(walking);
        await mark('真实十盒存档从继续旅程打开');
      });
    }else{
    const initial=await h.startFresh();
    assert.equal(Math.floor(initial.state.durable.clock.minute),780);
    await mark('正常入口新档');
    await h.step('从标题进入 13:00 开场并录下自然天光',async()=>{
      await startClip();await play.wait(2400);await play.keyboard.hold('KeyW',720);await play.wait(8150);
      await clip('01-下午启程');
    });
    await h.key('KeyJ');await page.getByRole('button',{name:'先上路',exact:true}).click();
    await ready();await walk([5.7,-228.1],.42);await use('flower:forest-request');
    await walk([0,-220]);await route(P0_ROUTE.forest.slice(1));
    const vane=await photo('02-风向标与风车',[-171,-52],[-174,45,-28],{matchedCard:'forest'});
    assert.ok(vane.flowerSubjects?.includes('silver'));
    await route(P0_ROUTE.forestReturn);
    await route(P0_ROUTE.town.slice(1,-1));await route(P0_ROUTE.lever,.35);await use('town-gate');
    await walk([148,-2],.42);
    const town=await photo('03-石拱', [155,-3],[155,29,10],{matchedCard:'town'});
    await h.wait(s=>s.world.bridgeWalkable);
    if(process.env.FINAL_QA_ROUTE!=='flowers')await h.step('从拓印摊学跳并用正常踏石起跳找回底片',async()=>{
      await route([[155,7],[155,15.5]],.38);
      const roof=await photo('03b-燕尾屋脊',[154.7,16],[165.74,31.81,21],{lens:'standard'});
      assert.equal(roof.afternoonSubject,'swallow-roof');
      await walk([157.9,20.1],.30);await use('afternoon-shoes');
      await h.wait(s=>s.state.durable.skills.jump);
      await route([[155,20],...townRear.slice(1),[176,26],[176.5,31],[178.7,34.78]],.46);
      await walk([181.82,34.78],.15);await turn(Math.PI/2,.26);
      await startClip();
      await page.keyboard.down('KeyW');await page.keyboard.down('Space');
      try{await play.wait(340);}finally{
        await page.keyboard.up('KeyW');await page.keyboard.up('Space');
      }
      await h.wait(s=>s.controller.grounded&&s.state.runtime.nearby==='sixth:tin',3800);
      await use('sixth:tin');await h.wait(s=>s.state.durable.sixth.tin&&!s.state.durable.sixth.seen);
      await shot('03c-跳上晒台拿到铁匣');await clip('03-跳过断口取底片');
      await route([[184.2,33],[179.1,32.1],[176.1,28.2],[174.8,26.6]],.44);
      await use('sixth:enlarger');await page.getByRole('button',{name:'拉开右边遮幅'}).click();
      await h.wait(s=>s.state.durable.sixth.revealed);
      await shot('03d-底片完整的第六个人');await ready();
      await route([[173.4,25.8],[173.1,24.2]],.35);await use('sixth:window');
      await page.getByRole('button',{name:'把全幅换进橱窗'}).click();
      await h.wait(s=>s.state.durable.sixth.displayed);
      await shot('03e-换入完整合影与空相夹');await ready();
      await h.key('KeyC');await h.wait(cameraActive);await option('mode','portrait');
      const keepsake=await h.photograph('03f-帮我拍');
      if(process.env.FINAL_QA_PART==='sixth'){
        assert.equal(keepsake.scene?.subject?.visible,true);
        await option('mode','landscape');await h.lowerCamera();
        await click(action('open-film'));await click(action('view-photo')+`[data-id="${keepsake.id}"]`);
        await h.download('橱窗前-代拍原片',()=>click(action('export-photo')),[1920,1080],{photoId:keepsake.id,bytes:keepsake.original.bytes});
        await ready();
      }else{
        await option('mode','landscape');await h.lowerCamera();
      }
      await use('sixth:window');await page.locator('[data-sixth-portrait]').selectOption(keepsake.id);
      await h.wait(s=>s.state.durable.sixth.portrait?.id===keepsake.id);
      await shot('03g-挂入玩家原片');await ready();
      await route([[172,27],[168,29],[166,31],[155,20]],.54);
    });
    else await route([[155,7],[155,20]],.36);
    if(process.env.FINAL_QA_PART==='sixth')return;
    await route([...courtyard,...upper],.36);
    await startClip();
    const window=await photo('04-禅院老窗',[159.17,94.6],[159.42,35.91,92.12],{lens:'standard'});
    assert.equal(window.afternoonSubject,'hall-window');
    await use('afternoon-window');await h.wait(s=>s.state.durable.fireworks?.photo.id===window.id);await mark('领到金柳');
    await play.wait(4200);await clip('04-山门入窗');
    await click(action('open-film'));await click(action('view-photo')+`[data-id="${window.id}"]`);
    await h.download('禅院交件-玩家原片',()=>click(action('export-photo')),[1920,1080],{photoId:window.id,bytes:window.original.bytes});
    await ready();
    await route(upper.slice(0,-1).reverse(),.36);
    await route([[158,65.3],[158.1,61],[159.9,60.55]],.44);
    await night();await use('night-torch-foot');await h.wait(s=>s.state.runtime.torchLit);
    await route(courtyard.slice(0,-2).reverse(),.43);await route([[155,20],[155,7],...market],.48);
    await route([[140,-16.5],[139.8,-13.1]],.41);await use('night-letter');
    await route([[139.7,-16.1],[135,-16.4],[132.3,-18.2],[130.0,-20.22]],.40);
    await use('night-repair');await h.wait(s=>s.state.durable.night.scarletClaimed);await mark('领到朱红');
    await startClip();
    moon=await photo('05-缺月灯与墙影',[134,-17],[135.1,26.02,-21.7]);
    assert.ok(moon.flowerSubjects?.includes('moon'));
    await walk([132.4,-19.5],.42);await use('flower:moon-riddle');
    await play.wait(4600);await clip('05-夜市与缺月灯');
    if(process.env.FINAL_QA_PART==='night')return;

    await route([[135,-16.4],[141,-16.5],[140.5,-20.2]],.42);await use('night-inn');
    await h.wait(s=>s.state.durable.clock.minute>=380&&!s.view.night.open&&(process.env.FINAL_QA_ROUTE==='flowers'||s.state.durable.sixth.displayed));
    await route([[141,-16.5],[147,-16.5],[155,-16.5],...P0_ROUTE.town.slice(0,-2).reverse()],.65);
    await route(P0_ROUTE.forest.slice(1));await walk([-174,-48.4],.35);
    await claim('silver','flower:forest-inbox');
    await walk([-170,-49.5]);await route(P0_ROUTE.forestReturn);
    await route(P0_ROUTE.town.slice(1,-1));await route([[155,7],[155,20]],.46);
    await route(townRear.slice(1),.46);await walk([176.95,27.23],.40);await use('discover:lost-postcard');
    await route([...backFromPostcard,...ridge],.61);
    const turnPhoto=await photo('06-东岭转弯',[64,204],[68.4,84.88,199]);
    assert.equal(turnPhoto.routeSlot,'turn');
    const endPhoto=await photo('07-东岭抵达',[72,200],[-170,44.5,-20.25],{lens:'tele'});
    assert.equal(endPhoto.routeSlot,'destination');
    const memory=await photo('08-东岭回望',[64,204],[48.568,61.842,108.132]);
    assert.ok(memory.memoryCandidates.includes('valley-letter'));
    await use('flower:ridge-fold');
    await journalLetters();
    for(const [slot,image] of [['turn',turnPhoto],['destination',endPhoto]])
      await click(`[data-reply-letter="forest"] ${action('attach-route-photo')}[data-slot="${slot}"][data-id="${image.id}"]`);
    await click(`[data-reply-letter="forest"] ${action('send-route-pair')}`);
    await h.wait(s=>s.state.durable.replyPhotos.forest?.variant==='route-pair');
    await click(`[data-reply-letter="town"] ${action('pick-reply-photo')}[data-id="${town.id}"]`);
    await click(`[data-reply-letter="town"] ${action('select-reply-photo')}`);
    await h.wait(s=>s.state.durable.replyPhotos.town?.photo.id===town.id);
    await click(action('edit-reply')+'[data-letter="final"]');
    await click(action('pick-reply-photo')+`[data-letter="final"][data-id="${memory.id}"]`);
    await click(action('confirm-final-photo'));await h.wait(s=>s.view.canSendLetter);
    await ready();await route([[20,226],[15,226],[15,233],[13.5,233.5]],.55);
    await use('mailbox:ridge');await click(action('send-letter'));
    await h.wait(s=>s.state.durable.mailed&&s.state.runtime.screen==='ending');
    await click(action('keep-exploring'));await h.wait(walking);
    await route([[15,226],[20,226],[64,204],...ridge.slice(0,-1).reverse(),[166,31],[160.7,25.7],[155,20]],.54);
    await route([[155,7],...P0_ROUTE.town.slice(0,-1).reverse(),[8.9,-229.8]],.61);
    await claim('twins','flower:ridge-request');

    await route([[0,-220],...P0_ROUTE.town.slice(1,-1),[155,7],[155,20],[155,28],[155,37]],.53);
    const bell=await photo('09-铜钟与檐口',[155.5,43.5],[161.125,26.4,51.125],{courtyard:true});
    assert.ok(bell.replyCandidates?.some(candidate=>candidate.variant==='courtyard'));
    await walk([155.5,39.7],.46);await claim('rain','flower:bell-inbox');
    await route([[155,28],[155,20],[155,7],[153.3,-28]],.57);await use('flower:town-milepost');
    const wheat=await photo('10-晒谷场的里程牌',[138,-43],[143,23.5,-40]);
    assert.ok(wheat.flowerSubjects?.includes('wheat'));
    await walk([140.7,-42],.43);await claim('wheat','flower:field-inbox');
    await route(field.slice(0,-1).reverse(),.59);await route([[155,7],[155,20],...ridge],.63);
    await claim('swallow','flower:ridge-fold');
    await route([...ridge.slice(0,-1).reverse(),[166,31],[160.7,25.7],[155,20],...courtyard,[158,76.5],[158,81]],.53);
    const pine=await photo('11-松台回望',[156,83],[155,31.6,26]);
    assert.ok(pine.flowerSubjects?.includes('pine'));
    await route([[158,79],[159.6,76.5]],.48);await claim('pine','flower:pine-inbox');
    await route([[158,65.3],[158,61],...courtyard.slice(0,-2).reverse(),[155,20],[155,7]],.50);
    await night();await route([...market,[140,-16.5],[135,-16.4],[132.4,-19.5]],.44);
    await claim('moon','flower:moon-riddle');

    await route([[135,-16.4],...market.slice().reverse(),...P0_ROUTE.town.slice(0,-2).reverse(),[1.8,-228.6]],.62);
    await use('flower:day-night-post');await openGear();
    await page.locator('[data-flower-photo="day"]').selectOption(vane.id);
    await page.locator('[data-flower-photo="night"]').selectOption(moon.id);
    await ready();await claim('stars','flower:day-night-post');
    assert.deepEqual((await h.read()).state.durable.flowerStock.earned,kinds);
    await openGear();await shot('12-十盒花谱和阿禾邀请');await ready();
    await saveEvidence('普通领取十盒');

    await route([[0,-220],...P0_ROUTE.town.slice(1,-1),...field],.53);
    }
    if(invitationOnly){
      const expected={silver:1};
      assert.deepEqual((await h.read()).state.durable.flowerStock.counts,expected);
      await route([[135,-16.4],[140,-16.5],[147,-16.5],[155,-16.5],...field],.51);
      await walk([128.08,-41.34],.26);
      await h.step('正式行囊入口再次赴约，借样与实物库存分开',async()=>{
        await openGear();await click(action('night-gear')+'[data-operation="torch"]');await h.wait(walking);
        await h.wait(s=>s.view.flowers?.party?.litSite&&s.view.flowers.party.here,4500);
        await openGear();
        await page.getByRole('button',{name:'再次赴约',exact:true}).click({timeout:6000});
        const opened=await h.wait(s=>s.state.durable.flowerStock.samples?.invitation===true);
        assert.equal(opened.state.durable.flowerStock.samples.kinds.length,10);
        assert.deepEqual(opened.state.durable.flowerStock.counts,expected);
        await shot('邀请行囊十种留样');
        await ready();
      });
      await h.step('摆三处留样，亲手点燃十花且实物保持原数量',async()=>{
        for(const [index,kind] of ['gold','scarlet','silver'].entries())
          await placeOne(index,kind,staging[[0,3,9][index]],'sample');
        const planted=await h.read();
        assert.equal(planted.state.durable.flowerStock.boxes.length,3);
        assert.ok(planted.state.durable.flowerStock.boxes.every(b=>b.source==='sample'));
        assert.deepEqual(planted.state.durable.flowerStock.counts,expected);
        await shot('三处留样实际落点');
        await startClip();await use('night-ignite');
        const show=await h.wait(s=>s.state.runtime.fireworkShow?.party?.invitation===true);
        const cues=show.state.runtime.fireworkShow.party.cues;
        assert.deepEqual([...new Set(cues.map(cue=>cue.kind))].sort(),kinds.slice().sort());
        assert.equal(new Set(cues.map(cue=>JSON.stringify(cue.launch))).size,3);
        assert.deepEqual(show.state.durable.flowerStock.counts,expected);
        h.report.borrowed={placements:planted.state.durable.flowerStock.boxes,cues:cues.map(({kind,launch})=>({kind,launch})),
          before:expected,afterIgnition:show.state.durable.flowerStock.counts};
        await route([[137.2,-49],[136,-56],[134,-63],[134,-69]],.40);
        await h.key('KeyC');await h.wait(cameraActive);
        const camera=(await h.read()).controller.camera.position;
        await aim([134,camera[1]+10,-48]);
        const start=show.state.runtime.fireworkShow.startedAt;
        await h.wait(s=>cameraActive(s)&&s.state.durable.playSeconds-start>=9.6,16500);
        await shot('留样终演朱红麦浪');
        await clip('三处留样再赴约-实机短录');
        await play.advance(42,{stepSeconds:.10,read});
        await h.wait(s=>!s.state.runtime.fireworkShow&&s.state.durable.flowerStock.invitation.witnessed);
        await h.lowerCamera();await continueSave(d=>d.flowerStock.invitation.witnessed&&d.flowerStock.counts.silver===1&&d.flowerStock.boxes.length===0);
        await openGear();await shot('再赴约后重载仍有银羽实物');await ready();
        h.report.borrowed.afterReload=(await h.read()).state.durable.flowerStock.counts;
      });
      assert.deepEqual(errors,[]);
      return;
    }
    await night();
    await openGear();await click(action('night-gear')+'[data-operation="torch"]');await h.wait(walking);
    assert.ok((await h.read()).state.runtime.torchLit);
    if(savedBytes){await startClip();await play.keyboard.hold('ArrowRight',600);await play.wait(2600);}
    for(const [i,kind] of kinds.entries()){
      try{await placeOne(i,kind,staging[i]);}
      catch(error){await recoverPlacement(i,kind,error);}
      if(savedBytes&&i===2)await clip('13-提灯布置花盒-现场');
    }
    await shot('13-十个实物落点');await saveEvidence('摆好十个实物');
    await continueSave(d=>d.flowerStock?.boxes.length===10);
    await openGear();await click(action('night-gear')+'[data-operation="torch"]');await h.wait(walking);
    await startClip();await use('night-ignite');
    const lit=await h.wait(s=>s.state.runtime.fireworkShow?.party?.invitation===true);
    const started=lit.state.runtime.fireworkShow.startedAt;
    await mark('普通点燃十盒');
    await route([[137.2,-49],[136,-56],[134,-63],[134,-69]],.39);
    await h.key('KeyC');await h.wait(cameraActive);
    if((await h.read()).state.durable.photography.lens!=='wide')await option('lens','wide');
    const cam=(await h.read()).controller.camera.position;
    await aim([134.0,cam[1]+10,-48.0]);
    await h.wait(s=>cameraActive(s)&&s.state.durable.playSeconds-started>=40.2,53000);
    const original=await h.photograph('14-满山赴约压轴原片');
    await h.wait(s=>s.state.durable.flowerStock.invitation.witnessed,15000);
    await play.wait(3600);await clip('14-满山赴约现场');
    await h.lowerCamera();await click(action('open-film'));
    await click(action('view-photo')+`[data-id="${original.id}"]`);
    await h.download('满山赴约-玩家相机原片',()=>click(action('export-photo')),[1920,1080],{photoId:original.id,bytes:original.original.bytes});
    await ready();await continueSave(d=>d.flowerStock?.invitation.witnessed&&d.film.some(p=>p.id===original.id&&p.original?.key===original.original.key));
    await openGear();await shot('15-满山赴约邮戳重载后');await ready();
    await mark('重载看见邮戳和原片');
    if(savedBytes)await startClip();
    await route([[134,-62],[135,-54],[137,-46],[141,-42],...field.slice(0,-2).reverse(),...market],.55);
    await night();await route([[135,-16.4],[132.4,-19.5]],.45);await use('flower:moon-riddle');
    const accepted=await h.wait(s=>s.state.durable.flowerQuests.revisit);
    assert.ok(accepted.state.durable.flowerQuests.revisit.acceptedAfter>=moon.sequence);
    const repeated=await photo('16-重访拍摄新底片',[134,-17],[135.1,26.02,-21.7]);
    assert.ok(repeated.flowerSubjects?.includes('moon'));
    await walk([132.4,-19.5],.42);await openGear();
    await page.locator('[data-flower-photo="repeat"]').selectOption(repeated.id);
    await click(action('flower-photo')+'[data-operation="redeem"][data-firework="silver"]');
    await h.wait(s=>s.state.durable.flowerStock.counts.silver===1&&s.state.durable.flowerQuests.revisit===null);
    await shot('16-第十一轮重复盒到手');await ready();
    await mark('缺月灯重访签收');
    if(savedBytes){await play.wait(8400);await clip('16-花街重访-现场');}
    await saveEvidence('烟花与重访原始存档');
    assert.deepEqual(errors,[]);
  }catch(e){
    failure=e;
    await shot('FAIL-普通入口观测').catch(()=>{});
    await saveEvidence('普通路线最后存档').catch(()=>{});
    throw e;
  }
  finally{h.report.browserErrors=errors;await h.finish(failure);}
}
