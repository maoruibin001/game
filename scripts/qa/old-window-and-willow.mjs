import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cameraActive, createLetterHarness, walking } from './letter-normal-input.mjs';
import { ordinaryRoadNavigation } from './ordinary-road-navigation.mjs';
import { tapAudio, startVideo, stopVideo } from './night-post.mjs';
import { P0_ROUTE } from './p0-route-plan.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const evidence = process.env.VALLEY_STORY_EVIDENCE ?? fileURLToPath(new URL('../../../production/旧窗与金柳-20261120/', import.meta.url));
const action = name => `[data-action="${name}"]`;
const porch = [[-26,-240],[-16.4,-233.1],[-13.8,-222.5],[-10.95,-216.65],[0,-220]];
const ridge = [[194,59],[216,109],[171,135],[126,178],[64,204]];
const courtyard = [[155,28],[155,37],[155.6,45],[155.95,50],[155.95,54.8],[156.45,56.2],[156.45,58.6],[158,61],[158,65.3]];
const priorRoom = 'artifacts/retake-20261120/owner/ten-flowers-and-sixth-2026-11-20T07-06-55-949Z/普通路线最后存档.browser-save.json';
const priorPair = 'artifacts/final-delivery-20261120/owner/ten-flowers-and-sixth-2026-11-20T04-40-35-711Z/普通领取十盒.browser-save.json';
const upper = [[158,76.5],[158,81],[158,91.5],[158,93.75],[159.17,94.6]];

export default async function oldWindowAndWillow(play) {
  const commit = execFileSync('git',['rev-parse','HEAD'],{ cwd:root,encoding:'utf8' }).trim();
  const retake = process.env.VALLEY_STORY_PART === 'retake';
  const { page } = play;
  await tapAudio(page);
  let h;
  async function freshHarness(label,initialPhotoCount=0) {
    h = await createLetterHarness(play,{id:label,viewport:[1920,1080]},{budgetMs:550000,commit,initialPhotoCount},evidence);
  }
  await freshHarness(retake?'来信路线预览':'旧窗与第一盒金柳');
  async function restorePlayerSave(source, label) {
    const file=join(root,source), saved=JSON.parse(await readFile(file,'utf8'));
    const origin=new URL(page.url()).origin;
    const snapshot=saved.origins.find(item=>item.localStorage.some(key=>key.name==='shanye-laixin.journey.v2'));
    assert.ok(snapshot,'browser-generated game save is present');
    const record=snapshot.localStorage.find(key=>key.name==='shanye-laixin.journey.v2');
    const total=JSON.parse(record.value).journey.totalPhotos;
    // Only the local server port changes. The captured save and originals remain byte-for-byte.
    await page.context().setStorageState({cookies:[],origins:[{...snapshot, origin}]});
    await play.reload();
    await freshHarness(label,total);
    h.report.sourceBrowserSave=file;
    await h.wait(s=>s.restored&&s.state.runtime.screen==='menu'&&s.state.durable.totalPhotos===total,35000);
    await page.locator('[data-action="continue"]').click();
    await h.wait(walking);
  }
  const navigation = () => ordinaryRoadNavigation(play,h);
  const walkTo = (...args)=>navigation().walkTo(...args);
  const route = (...args)=>navigation().route(...args);
  const cameraAt = (...args)=>navigation().cameraAt(...args);
  const opening = page.locator('.sy-opening-letter:visible');
  const reply = page.locator('[data-reply-letter="forest"]:visible');
  const click = selector => page.locator(selector).click({timeout:9000});
  const journal = async () => {
    await h.key('KeyJ');
    await h.wait(s=>s.state.runtime.screen==='journal');
    await page.getByRole('tab',{name:'来信',exact:true}).click();
  };
  const close = async () => {
    for(let depth=0;depth<6;depth++){
      const current=await h.read();
      if(walking(current)||cameraActive(current))return;
      await click('button.sy-close:visible');
      await h.settle();
    }
    await h.wait(s=>walking(s)||cameraActive(s));
  };
  const use = async id => {
    await h.wait(s=>walking(s)&&s.state.runtime.nearby===id);
    await h.key('KeyE');
  };
  const option = async (key,value) => {
    await click(action('toggle-photo-tools'));
    await click(action('photo-option')+`[data-photo-key="${key}"][data-value="${value}"]`);
    await click(action('toggle-photo-tools'));
    await h.wait(s=>s.state.durable.photography[key]===value);
  };
  const exportPhoto = async (photo,name) => {
    await click(action('open-film'));
    await click(action('view-photo')+`[data-id="${photo.id}"]`);
    const result = await h.download(name,()=>click(action('export-photo')),[1920,1080],
      {photoId:photo.id,bytes:photo.original.bytes});
    await close();
    return result;
  };
  const photo = async (name,feet,target,checks) => {
    await cameraAt({feet,target},name);
    const frame=await h.photograph(name,checks);
    await h.lowerCamera();
    return frame;
  };
  let failure, recording=false, hall, portrait, burn;
  try {
    await h.step('甲 · 13 点新档，横移、快门、寄照和旧照背注', async () => {
      await page.getByRole('button',{name:'背上行囊，出发',exact:true}).click();
      await h.wait(walking);
      await h.shot('A01-正常入口');
      await h.key('KeyE');
      await h.wait(s=>cameraActive(s)&&s.state.runtime.observation?.openingMountains===0);
      for(let i=0;i<10&&(await h.read()).state.runtime.observation?.openingMountains!==2;i++){
        await play.keyboard.hold('KeyA',55);
        await h.settle();
      }
      const first=await h.photograph('A02-双峰进信封');
      assert.equal(first.openingMountains,2);
      await journal();
      await opening.locator(action('choose-opening-photo')+`[data-id="${first.id}"]`).click();
      await h.download('A-山色原片',()=>opening.locator(action('export-photo')+`[data-id="${first.id}"]`).click(),
        [1920,1080],{photoId:first.id,bytes:first.original.bytes});
      await opening.locator(action('send-opening-photo')).click();
      await h.wait(s=>s.state.durable.openingReply?.id===first.id);
      await page.getByText('旧照背面',{exact:true}).waitFor();
      assert.match(await opening.textContent(),/阿公那张旧合影/);
      await opening.locator('.sy-opening-request').scrollIntoViewIfNeeded();
      await h.shot('A03-自己的照片与旧照背注');
      const trackedBefore=(await h.read()).state.durable.storyRoute;
      await opening.getByRole('button',{name:'在地图上看东岭',exact:true}).click();
      await h.wait(s=>s.state.runtime.screen==='map'&&s.view.navigation?.destination?.title==='东岭古道 · 红箭头');
      await h.shot('D01-首信明确打开东岭红箭头');
      await close();
      assert.equal((await h.read()).state.durable.storyRoute,trackedBefore);
      if(cameraActive(await h.read()))await h.lowerCamera();
      if(retake)return;
      await journal();
      await page.getByRole('button',{name:'沿东岭古道找旧窗',exact:true}).click();
      await h.wait(s=>s.state.durable.storyRoute==='ridge');
      await close();
      if(cameraActive(await h.read()))await h.lowerCamera();
    });

    if(retake){
      await h.finish();
      await restorePlayerSave(priorPair,'双照回信路线预览');
      await h.step('普通续档从双照回信单独打开石拱和钟院',async()=>{
        await journal();
        assert.equal((await h.read()).state.durable.replyPhotos.forest?.variant,'route-pair');
        await page.getByRole('button',{name:'看石拱与钟院的路线',exact:true}).click();
        await h.wait(s=>s.state.runtime.screen==='map'&&s.view.navigation?.destination?.title==='旧镇钟院');
        await h.shot('D02-双照明确打开旧镇钟院');
        await close();
      });
      await h.finish();
      await restorePlayerSave(priorRoom,'内室重拍到首盒金柳');
    }else await h.step('甲 · 按邮路过石拱，上东岭拍两照并寄回', async () => {
      await route(porch,.55);
      await route(P0_ROUTE.town.slice(1,-1),.65);
      await route(P0_ROUTE.lever,.35);
      await use('town-gate');
      await walkTo([148,-2],.38);
      await photo('A04-石拱与红邮筒',[155,-3],[155,29,10],{matchedCard:'town'});
      await h.wait(s=>s.world.bridgeWalkable);
      await route([[155,7],[155,20],...ridge],.65);
      const arrow=await photo('A05-红箭头',[64,204],[68.4,84.88,199]);
      assert.equal(arrow.routeSlot,'turn');
      await cameraAt({feet:[72,200],target:[-170,44.5,-20.25]},'A06-西南望远');
      await option('lens','tele');
      const mill=await h.photograph('A06-风车');
      assert.equal(mill.routeSlot,'destination');
      await h.lowerCamera();
      await journal();
      for(const shot of [arrow,mill])await reply.locator(action('attach-route-photo')+`[data-id="${shot.id}"]`).click();
      await reply.locator(action('send-route-pair')).click();
      await h.wait(s=>s.state.durable.replyPhotos.forest?.destination?.id===mill.id);
      await reply.locator('.sy-route-sheet').scrollIntoViewIfNeeded();
      assert.match(await reply.locator('.sy-route-sheet').textContent(),/认哪里/);
      assert.match(await reply.locator('.sy-route-sheet').textContent(),/石拱.*钟院/);
      await h.shot('A07-双照与石拱钟院回音');
      await h.download('A-东岭双照回信',()=>reply.locator(action('export-route-letter')).click(),[2400,1360]);
      await page.getByRole('button',{name:'看石拱与钟院的路线',exact:true}).click();
      await h.wait(s=>s.state.runtime.screen==='map'&&s.view.navigation?.destination?.title==='旧镇钟院');
      await h.shot('A08-地图继续指向钟院和禅院');
      await close();
      await exportPhoto(arrow,'A-红箭头原片');
      await exportPhoto(mill,'A-望远风车原片');
    });

    await h.step('乙 · 真实取底片，进照相铺内室揭晓并站进空位', async () => {
      if(retake)await walkTo([174.8,26.6],.38);
      else {
      await route([[64,204],...ridge.slice(0,-1).reverse(),[155,20]],.62);
      await cameraAt({feet:[154.7,16],target:[165.74,31.81,21]},'B01-燕尾');
      await option('lens','standard');
      const crest=await h.photograph('B01-燕尾原片');
      assert.equal(crest.afternoonSubject,'swallow-roof');
      await h.lowerCamera();
      await walkTo([157.9,20.1],.32);
      await use('afternoon-shoes');
      await h.wait(s=>s.state.durable.skills.jump);
      await route(P0_ROUTE.eastBack,.48);
      await route([[176.5,31],[178.7,34.78],[181.82,34.78]],.28);
      await h.turnTo(Math.PI/2,.26);
      await page.keyboard.down('KeyW');await page.keyboard.down('Space');
      try{await play.wait(340);}finally{await page.keyboard.up('KeyW');await page.keyboard.up('Space');}
      await h.wait(s=>s.controller.grounded&&s.state.runtime.nearby==='sixth:tin',6000);
      await use('sixth:tin');
      await h.wait(s=>s.state.durable.sixth.tin);
      await h.shot('B02-晒台铁匣');
      await route([[184.2,33],[179.1,32.1],[176.1,28.2],[174.8,26.6]],.46);
      await use('sixth:enlarger');
      await page.getByRole('button',{name:'拉开右边遮幅'}).click();
      await h.wait(s=>s.state.durable.sixth.revealed);
      await h.shot('B03-放大台只露袖口');
      await close();
      }
      assert.ok((await h.read()).state.durable.sixth.revealed);
      await route([[176.4,26.75],[182.8,26.75],[183.05,24.64],[181.7,24.64],[180.17,24.64]],.27);
      await use('sixth:room');
      await page.getByRole('button',{name:'把印样对上椅背'}).click();
      await h.wait(s=>s.state.durable.sixth.displayed);
      await h.shot('B04-在内室知道第六人是谁');
      await close();
      await h.turnTo(-Math.PI/2,.13);
      await h.key('KeyC');await h.wait(cameraActive);
      await option('lens','wide');await option('mode','portrait');
      const tableau=await h.wait(s=>s.controller.photography.subjectVisible);
      assert.ok(tableau.controller.camera.position[0]<182.40,'the real portrait camera must sit inside the east door');
      portrait=await h.photograph('B05-玩家站进空位');
      assert.equal(portrait.scene?.subject?.visible,true);
      await option('mode','landscape');await h.lowerCamera();
      await exportPhoto(portrait,'B-内室代拍原片');
      await use('sixth:room');
      await page.locator('[data-sixth-portrait]').selectOption(portrait.id);
      await h.wait(s=>s.state.durable.sixth.portrait?.id===portrait.id);
      await h.shot('B06-内室把自己的照片留下');
      await close();
      await route([[183.04,24.64],[183.03,26.72],[176.28,26.64],...P0_ROUTE.eastBackReturn],.50);
    });

    await h.step('乙 · 老窗里拍山门屋脊，客堂交件并拿第一盒', async () => {
      await route([...courtyard,...upper],.37);
      await cameraAt({feet:[159.17,94.6],target:[159.42,35.91,92.12]},'B07-老窗屋脊');
      await option('lens','standard');
      hall=await h.photograph('B07-山门入窗');
      assert.equal(hall.afternoonSubject,'hall-window');
      await h.lowerCamera();
      await use('afternoon-window');
      await h.wait(s=>s.state.durable.fireworks?.photo.id===hall.id);
      await journal();
      const receipt=page.locator('.sy-old-window-receipt:visible');
      await receipt.getByText('同一扇窗，今天的山门').waitFor();
      await receipt.scrollIntoViewIfNeeded();
      await h.shot('B08-同址揭晓和约定窗');
      await h.download('B-禅院交件原片',()=>receipt.locator(action('export-photo')).click(),[1920,1080],
        {photoId:hall.id,bytes:hall.original.bytes});
      await close();
    });

    await h.step('丙 · 按原规则借火、提火把上松台和亲手点燃金柳', async () => {
      await route(upper.slice(0,-1).reverse(),.37);
      await route([[158,65.3],[158.1,61],[159.9,60.55]],.42);
      const down=await h.read();
      const seconds=(1120.23-down.state.durable.clock.minute)*1.5;
      if(seconds>0)await play.advance(seconds,{stepSeconds:.10,read:'shan.journey'});
      await h.wait(s=>walking(s)&&s.view.night.open);
      await use('night-torch-foot');
      await h.wait(s=>s.state.runtime.torchLit);
      await route([[158,62],[158,65.3],[158,76.5],[158,81],[160.34,81.18]],.31);
      await h.turnTo(0,.23);
      await h.key('KeyC');await h.wait(cameraActive);
      await option('lens','wide');await h.lowerCamera();
      await click(action('open-gear'));
      await click(action('night-gear')+'[data-operation="take"][data-firework="gold"]');
      await h.wait(walking);
      await use('night-place');
      const placed=await h.wait(s=>s.state.durable.night.placed);
      await h.shot('C01-松台合法落点与火把');
      await walkTo([159.1,81.8],.23);
      await h.turnTo(0,-.10);
      await h.wait(s=>s.state.runtime.nearby==='night-ignite'&&s.view.saveStatus==='saved');
      await page.context().storageState({path:join(h.out,'首盒点火前.browser-save.json'),indexedDB:true});
      assert.ok(await startVideo(page)>0,'the recording must include real game audio');
      recording=true;
      await use('night-ignite');
      const lit=await h.wait(s=>s.state.runtime.fireworkShow?.firstWillow);
      const start=lit.state.runtime.fireworkShow.startedAt;
      assert.deepEqual(lit.state.runtime.fireworkShow.launches.gold,placed.state.durable.night.placed);
      await play.keyboard.hold('KeyS',1370);
      await h.key('KeyC');await h.wait(cameraActive);
      await h.turnTo(0,-.24);
      const elapsed=s=>s.state.durable.playSeconds-start;
      const framed=await h.wait(s=>cameraActive(s)&&elapsed(s)>=11.94,14000);
      assert.ok(elapsed(framed)<14.1,'player missed the live window response');
      burn=await h.photograph('C02-宽金柳与约定窗');
      h.report.ignition={placement:lit.state.runtime.fireworkShow.position,clock:lit.state.durable.clock,
        shutterSeconds:burn.playSeconds-start,camera:burn.scene?.camera};
      assert.ok(h.report.ignition.shutterSeconds>=11.65&&h.report.ignition.shutterSeconds<14.35);
      await h.wait(s=>!s.state.runtime.fireworkShow,10000);
      h.report.video=await stopVideo(page,join(h.out,'首盒金柳-有声现场.webm'));recording=false;
      assert.ok(h.report.video?.bytes>10000&&h.report.video.audioTracks>0);
      await h.lowerCamera();
      await exportPhoto(burn,'C-首盒金柳原片');
    });

    await h.step('从标题续档，回看首信、双照、内室、交件和已消耗首盒', async () => {
      await play.reload();
      await h.wait(s=>s.restored&&s.state.runtime.screen==='menu'&&s.state.durable.night.spent,35000);
      await click(action('continue'));
      const resumed=await h.wait(walking);
      assert.equal(resumed.state.durable.sixth.portrait?.id,portrait.id);
      assert.equal(resumed.state.durable.fireworks?.photo.id,hall.id);
      if(!retake)assert.ok(resumed.state.durable.openingReply&&resumed.state.durable.replyPhotos.forest?.destination);
      assert.ok(resumed.state.durable.film.some(shot=>shot.id===burn.id));
      await h.shot('C03-同档继续后进度完整');
    });
  } catch (error) {
    failure=error;
    if(recording)h.report.video=await stopVideo(page,join(h.out,'未完成-有声现场.webm')).catch(()=>null);
    await h.shot('中断现场').catch(()=>{});
    throw error;
  } finally {
    await h.finish(failure);
  }
}
