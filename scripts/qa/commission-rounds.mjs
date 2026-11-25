import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';
import { cameraActive, createLetterHarness, walking } from './letter-normal-input.mjs';
import { ordinaryRoadNavigation } from './ordinary-road-navigation.mjs';
import { P0_ROUTE } from './p0-route-plan.mjs';
const output = new URL('../../../production/commission-rounds-20261121/', import.meta.url);
const action = name => `[data-action="${name}"]:visible`;
const porch = [[-26,-240],[-16.4,-233.1],[-13.8,-222.5],[-10.95,-216.65],[0,-220]];
const courtyard = [[155,28],[155,37],[155.6,45],[155.95,50],[155.95,54.8],[156.45,56.2],[156.45,58.6],[158,61],[158,65.3]];
const upper = [[158,76.5],[158,81],[158,91.5],[158,93.75],[159.17,94.6]];

export default async function commissions(play) {
  const {page} = play;
  const h = await createLetterHarness(play,{id:'摄影委托普通全流程',viewport:[1920,1080]},{budgetMs:845000,candidate:process.env.SHANYE_CANDIDATE},fileURLToPath(output));
  const {walkTo,route,cameraAt} = ordinaryRoadNavigation(play,h);
  const click = name=>page.locator(action(name)).first().click({timeout:8000});
  const journal=async ()=>{
    await h.key('KeyJ');
    await h.wait(s=>s.state.runtime.screen==='journal');
    await page.getByRole('tab',{name:'来信',exact:true}).click();
  };
  const close=async()=>{await click('close'); await h.wait(s=>walking(s)||cameraActive(s));};
  const replies=page.locator('[data-reply-letter="forest"]:visible');
  const opening=page.locator('.sy-opening-letter:visible');
  const showRoute = async (title) => {
    const s = await h.wait(s=>walking(s)&&s.view.navigation?.destination?.title.includes(title));
    const pocket=page.locator('.sy-pocket-body:visible');
    await pocket.getByText(title,{exact:false}).first().waitFor({timeout:3500});
    assert.ok(s.view.navigation.destination.points.length>1);
    assert.equal(await page.getByRole('dialog').count(),0);
    const before=s.controller.position;
    await play.keyboard.hold('KeyW',230);
    await h.wait(s=>walking(s)&&Math.hypot(...s.controller.position.map((v,i)=>v-before[i]))>.15);
  };
  const use=async id=>{await h.wait(s=>walking(s)&&s.state.runtime.nearby===id);await h.key('KeyE');};
  const comm=()=>page.locator('.sy-commission-round:visible');
  const snapshots = [];
  try {
    await h.step('新档，三个固定题目与失败首封仍可寄',async()=>{
      await page.getByRole('button',{name:'背上行囊，出发',exact:true}).click();
      await h.wait(walking);
      await h.shot('01-正常入口');
      await h.key('KeyE');await h.wait(cameraActive);
      const missed=await h.photograph('02-原地未装入双峰');
      assert.equal(missed.openingMountains,0);
      for(let i=0;i<10&&(await h.read()).state.runtime.observation?.openingMountains!==2;i++){
        await play.keyboard.hold('KeyA',55);await h.settle();
      }
      const first=await h.photograph('03-横移装入双峰');
      assert.equal(first.openingMountains,2);
      await journal();
      assert.match(await comm().textContent(),/给阿禾寄一座山.*帮阿禾认路.*替阿公补拍老窗/s);
      await h.shot('04-固定首轮三题');
      await opening.locator(action('choose-opening-photo')+`[data-id="${missed.id}"]`).click();
      assert.match(await opening.locator(action('send-opening-photo')).innerText(),/就寄这张/);
      await opening.locator(action('send-opening-photo')).click();
      await h.wait(s=>s.state.durable.openingReply?.id===missed.id);
      await h.shot('05-零峰原片也收到回话');
      await opening.getByRole('button',{name:'在地图上看东岭',exact:true}).click();
      await h.wait(s=>s.state.runtime.screen==='map'&&s.view.navigation?.destination?.title.includes('红箭头'));
      await h.shot('06-临时地图');
      await h.key('KeyM');
      await h.wait(cameraActive);
      await journal();
      await opening.getByRole('button',{name:'沿东岭古道找旧窗',exact:true}).click();
      await showRoute('东岭古道 · 红箭头');
      await h.shot('07-从相机读信选择东岭即步行');
      await journal();
      await replies.getByRole('button',{name:'沿林间近路走'}).click();
      await showRoute('林间近路 · 风车');
      await h.shot('08-从步行读信选择林间即步行');
    });

    await h.step('林间回信、打开石拱、落桥、正常交件',async()=>{
      await route(porch,.6);
      await route(P0_ROUTE.forest,.8);
      await cameraAt(P0_ROUTE.forestPhoto,'09-林间');
      const forest=await h.photograph('09-风铃与风车',{matchedCard:'forest'});
      await h.lowerCamera();await journal();
      await replies.locator(action('pick-reply-photo')+`[data-id="${forest.id}"]`).click();
      await replies.locator(action('select-reply-photo')).click();
      await h.wait(s=>s.state.durable.replyPhotos.forest?.photo.id===forest.id);
      await h.shot('10-认路回信');await close();
      await route(P0_ROUTE.forestReturn,.8);
      await route(P0_ROUTE.town.slice(1,-1),.75);
      await route(P0_ROUTE.lever,.33);await use('town-gate');
      await walkTo([148,-2],.4);
      await cameraAt({feet:[155,-3],target:[155,29,10]},'11-石拱');
      await h.photograph('11-石拱与双峰',{matchedCard:'town'});
      await h.wait(s=>s.state.runtime.bridgeProgress>=1);await h.lowerCamera();
      await route([[155,7],[155,20],...courtyard,...upper],.39);
      await cameraAt({feet:[159.17,94.6],target:[159.42,35.91,92.12]},'12-老窗');
      const hall=await h.photograph('12-老窗框住山门');
      assert.equal(hall.afternoonSubject,'hall-window');
      await h.lowerCamera();await use('afternoon-window');
      const state=await h.wait(s=>s.state.durable.photoCommissions.number===2);
      snapshots.push({type:'draw',round:state.state.durable.photoCommissions});
      await journal();await comm().getByRole('heading',{name:/第 2 轮/}).waitFor();
      await h.shot('13-金柳已领并开启第二轮');
      console.log('实际抽题', JSON.stringify(state.state.durable.photoCommissions));
      await writeFile(new URL('第二轮实际抽签.json',output),JSON.stringify(state.state.durable.photoCommissions,null,2));
      await page.context().storageState({path:`${h.out}/正常首轮完成.browser-save.json`});
      await close();
    });

    const raw=await readFile(new URL('world-math-candidates.jsonl',output),'utf8');
    const premises=Object.fromEntries(raw.trim().split('\n').map(line=>{const d=JSON.parse(line);return [d.id,d.viable];}));
    const targetOrder = (await h.read()).state.durable.photoCommissions.orders;
    const exit = [...upper].reverse().slice(1).concat([...courtyard].reverse(),[[155,20],[155,7],[155,-3]]);
    const toBase = async x => {
      const [, , z]=(await h.read()).controller.position;
      if(z>85&&x<4)await route(exit,.46);
      else if(z>56&&z<=85)await route(exit.filter(([ ,ez])=>ez<z-.3),.54);
      else if(z>7&&z<56)await route([[155,20],[155,7],[155,-3]].filter(([ ,ez])=>ez<z-.3),.72);
    };
    const lowerRoute = {
      'old-town':[[155,-19]],'town-arch':[[155,-3]],'field-firework':[[155,-19],[148,-29],[141,-37]],
      'flower-market':[[155,-19],[149,-19]],'old-post':P0_ROUTE.town.slice(0,-1).reverse().concat(porch.slice(0,-1).reverse()),
      'post-porch':P0_ROUTE.town.slice(0,-1).reverse(),
      'forest-clearing':P0_ROUTE.town.slice(0,-1).reverse().concat(P0_ROUTE.forest.slice(1)),
      'forest-windmill':P0_ROUTE.town.slice(0,-1).reverse().concat(P0_ROUTE.forest.slice(1)),
      'ridge-arrow':P0_ROUTE.ridge.slice(0,5),'ridge-mail-road':P0_ROUTE.ridge.slice(0,5),'ridge-station':P0_ROUTE.ridge,
      'night-torch-foot':courtyard.slice(0,-2),'courtyard-bell':courtyard.slice(0,3),
      'pine-firework':[...courtyard,...upper.slice(0,2)],'monastery':[...courtyard,...upper],
      'night-torch-upper':[...courtyard,...upper.slice(0,3)],
    };
    let previous, firstNegative = true;
    const priority=['monastery','night-torch-upper','pine-firework','night-torch-foot','courtyard-bell','old-town','town-arch','field-firework','ridge-arrow','ridge-mail-road','ridge-station','old-post','post-porch','forest-clearing','forest-windmill','flower-market'];
    for(const order of [...targetOrder].sort((a,b)=>priority.indexOf(a.site)-priority.indexOf(b.site))){
      await h.step(`第二轮实际取景 ${order.site}`,async()=>{
        const site=order.site;
        await journal();
        await comm().locator(action('navigate-commission')+`[data-site="${site}"]`).click();
        await h.wait(s=>walking(s)&&s.state.durable.trackedScenicSpot===site);
        if(previous!==site){
          const [, , z]=(await h.read()).controller.position;
          if(z>55 && (await h.read()).controller.position[0]<177)await toBase(0);
          else if(z>=110)await route(P0_ROUTE.ridge.slice(0,5).reverse().concat([[155,20],[155,-3]]),.8);
          await route(lowerRoute[site]??[],.66);
        }
        if(site==='flower-market'){
          // Wait across closing in ordinary game time, with no clock mutation.
          await h.wait(s=>s.view.night.open,180000);
        }
        let successful;
        const samples=premises[site]??[];
        for(const camera of [samples[1],samples[0],...samples.slice(2)].filter(Boolean).slice(0,3)){
          const [x,y,z]=camera.position;
          await cameraAt({feet:[x,z],tolerance:.36,target:camera.forward.map((v,i)=>camera.position[i]+v*25)},`14-${site}`);
          if(camera.verticalFovRadians<.9){
            const lens=page.locator(action('toggle-photo-tools')).first();
            await lens.click();
            await page.locator(action('photo-option')+'[data-photo-key="lens"][data-value="standard"]').click();
            await lens.click();
            await h.settle();
          }
          if(!(await h.read()).state.runtime.observation?.commissionSites?.includes(site)){await h.lowerCamera();continue;}
          if(firstNegative){
            firstNegative=false;
            const initial=(await h.read()).controller;
            await h.turnTo(initial.yaw+Math.PI,initial.pitch);
            const wrong=await h.photograph(`15-${site}-原地背对主体`);
            assert.ok(!wrong.commissionSites?.includes(site));
            await h.turnTo(initial.yaw,initial.pitch);
            await h.wait(s=>s.state.runtime.observation?.commissionSites?.includes(site));
          }
          successful=await h.photograph(`16-${site}-合格照片`);
          assert.ok(successful.commissionSites?.includes(site));
          break;
        }
        assert.ok(successful,`没有从真实机位验证 ${site}`);
        await journal();
        await comm().locator(action('submit-commission')+`[data-id="${successful.id}"]`).click();
        await h.wait(s=>s.state.durable.photoCommissions.orders.some(item=>item.site===site&&item.photoId===successful.id));
        await h.shot(`17-${site}-签收`);
        await close();
        if(cameraActive(await h.read()))await h.lowerCamera();
        previous=site;
      });
    }
    await h.step('领取花盒并刷新保留第三轮',async()=>{
      await journal();
      await comm().locator(action('claim-commission-round')).click();
      const state=await h.wait(s=>s.state.durable.photoCommissions.number===3);
      snapshots.push({type:'third',round:state.state.durable.photoCommissions,stock:state.state.durable.flowerStock});
      await h.shot('18-领取花盒并进入第三轮');
      await page.reload();
      await h.wait(s=>s.restored&&s.state.runtime.screen==='menu',45000);
      await click('continue');await h.wait(walking);
      await journal();
      const reloaded=(await h.read()).state.durable;
      assert.deepEqual(reloaded.photoCommissions,state.state.durable.photoCommissions);
      assert.deepEqual(reloaded.flowerStock,state.state.durable.flowerStock);
      await h.shot('19-第三轮及花盒刷新不变');
    });
  } catch(error){
    await h.finish(error);throw error;
  }
  h.report.rounds=snapshots;
  await h.finish();
}
