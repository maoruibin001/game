import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createLetterHarness, walking, cameraActive } from './letter-normal-input.mjs';

const evidence = fileURLToPath(new URL('../../.forgeax/diag/terrain-audit/', import.meta.url));
const distance = (p, [x,z]) => Math.hypot(p[0]-x,p[2]-z);
const edgeNotice = /到山谷边界了/;
const ridgeFollowUp = process.env.SHANYE_TERRAIN_FOLLOW_UP === '1';

export default async function terrainAudit(play) {
  const h = await createLetterHarness(play, { id: ridgeFollowUp ? 'terrain-ridge' : 'terrain-full', viewport:[1920,1080] },
    { budgetMs:480000 }, evidence);
  const { page } = play;

  async function run(target, tolerance=.9) {
    let s = await h.wait(walking);
    let stalled=0;
    while(distance(s.controller.position,target)>tolerance) {
      const last=s.controller.position;
      const gap = distance(last,target);
      await h.turnTo(Math.atan2(target[0]-last[0],last[2]-target[1]));
      if(gap>12){
        const goal=Math.max(2.5,gap-38), end=Date.now()+7500;
        await page.keyboard.down('ShiftLeft');
        await page.keyboard.down('KeyW');
        try{await h.wait(v=>walking(v)&&(distance(v.controller.position,target)<=goal||Date.now()>=end),8500);}
        finally{await page.keyboard.up('KeyW');await page.keyboard.up('ShiftLeft');}
      }else{
        await play.keyboard.hold('KeyW',Math.max(45,(gap-tolerance*.5)/6.8*1000));
      }
      s=await h.wait(walking);
      stalled=gap-distance(s.controller.position,target)<.045 ? stalled+1 : 0;
      if(stalled===3){
        await h.shot('blocked-movement');
        assert.fail(`stalled from ${s.controller.position} toward ${target}`);
      }
    }
    return s;
  }

  async function route(points) {
    for(const p of points) await run(p);
  }

  async function jumpForward(hold) {
    await play.keyboard.hold(['KeyW','Space'],hold);
    return h.wait(s=>walking(s)&&s.controller.grounded);
  }

  async function checkEdge(label,[axis,sign],yaw,start,outside,retreat) {
    await run(start,.22);
    const border = await h.wait(walking);
    assert.ok(sign*border.controller.position[axis]<389.4, label+' warning must precede the wall');
    await page.getByText(edgeNotice).waitFor({timeout:2500});
    await h.turnTo(yaw);
    await play.keyboard.hold('KeyW',700);
    const at = await h.wait(s=>walking(s)&&sign*s.controller.position[axis]>389.68);
    assert.ok(sign*at.controller.position[axis]<=389.721);
    await h.shot(label+'-edge');
    if(outside){
      await h.key('KeyC');
      await h.wait(cameraActive);
      await page.getByText(edgeNotice).waitFor({timeout:2500});
      await h.shot(label+'-edge-camera');
      await play.keyboard.hold('KeyS',1900);
      await page.getByText(edgeNotice).waitFor({state:'hidden',timeout:2500});
      await h.key('KeyC');
      await h.wait(walking);
    }
    await run(retreat);
    await page.getByText(edgeNotice).waitFor({state:'hidden',timeout:2500});
  }

  let failure;
  try {
    await h.step('Start a fresh journey from the normal title menu', () => h.startFresh());
    if (!ridgeFollowUp) {
      await h.step('Jump onto the south-meadow boulder',async()=>{
        await route([[9.75,-221],[20,-220],[35,-243],[12,-316],[6,-320]]);
        await run([5.1,-325.4],.22);
        await h.turnTo(-Math.PI/2);
        await play.keyboard.hold('KeyW',400);
        const before=await h.shot('01-south-meadow-rock-base');
        assert.ok(before.controller.position[0]>4.40);
        const top=await jumpForward(350);
        assert.ok(top.controller.position[1]>before.controller.position[1]+.5,JSON.stringify(top.controller.position));
        await h.shot('02-south-meadow-rock-tread');
      });
      await h.step('Approach the south edge and test the warning with the camera raised',async()=>{
        await route([[5.1,-325.4],[8,-330],[4,-380]]);
        await checkEdge('03-south',[2,-1],0,[8,-388.75],true,[8,-380]);
      });
      await h.step('Cross the southern hills to check the west edge',async()=>{
        await route([[-200,-368],[-224,-348],[-316,-308]]);
        await checkEdge('04-west',[0,-1],-Math.PI/2,[-388.85,-270],false,[-380,-270]);
      });
      await h.step('Check solid rock contact to the west of the windmill',async()=>{
        await page.getByRole('button',{name:'回到最近小路'}).click();
        await h.wait(s=>walking(s)&&distance(s.controller.position,[-183.06,-141.87])<3);
        await h.shot('04-west-return-to-trail');
        await route([[-224,-76]]);
        await run([-238,-45.9],.22);
        await h.turnTo(Math.PI/2);
        await play.keyboard.hold('KeyW',500);
        const before=await h.shot('05-west-forest-rock-base');
        assert.ok(before.controller.position[0]<-236.60);
        const top=await jumpForward(350);
        assert.ok(top.controller.position[1]>before.controller.position[1]+.55,JSON.stringify(top.controller.position));
        await h.shot('06-west-forest-rock-tread');
        await route([[-238,-45.9],[-236,-52],[-223,-55]]);
      });
    } else {
      await h.step('Walk from the post office along the forest route', () =>
        route([[9.75,-221],[0,-220],[-35,-192],[-96,-136],[-102,-120],[-170,-70],[-195.6,-16.1]]));
    }
    await h.step('Walk up and down the repaired grass shoulder west of the windmill', async () => {
      if (ridgeFollowUp) {
        const start = await run([-195.7,-16.8],.18);
        const crossed = await run([-197.5,-17.6],.24);
        assert.ok(crossed.controller.position[1]>start.controller.position[1]+.5);
        await h.shot('06a-windmill-near-shoulder-crossed');
      }
      await run([-210.5,-44.5],.19);
      const base=await h.shot('06b-forest-grass-bank');
      const up=await run([-205,-44.5],.32);
      assert.ok(up.controller.position[0]>-205.35&&up.controller.position[1]>base.controller.position[1]+.45);
      await h.shot('06c-forest-grass-bank-crossed');
      await run([-210.5,-44.5],.28);
      await run([-205,-44.5],.32);
    });
    await h.step('Climb the open slope and inspect both rocks below the East Ridge trail',async()=>{
      await route([[-104,56],[-96,56],[52,180],[69,185.3]]);
      await h.turnTo(Math.PI,.04);
      await h.shot('07-east-ridge-steep-boulder');
      await run([65.75,192.98],.22);
      await h.turnTo(Math.PI/2,.08);
      await play.keyboard.hold('KeyW',450);
      const top=await jumpForward(360);
      assert.ok(top.controller.position[0]>67.12&&top.controller.position[1]>76.26,JSON.stringify(top.controller.position));
      await h.shot('07b-east-ridge-boulder-tread');
      await route([[65.8,196],[40,204],[40.75,205.17]]);
      await h.turnTo(Math.PI/2,.06);
      await play.keyboard.hold('KeyW',330);
      const ledge=await jumpForward(280);
      assert.ok(ledge.controller.position[0]>41.73&&ledge.controller.position[1]>84.55,JSON.stringify(ledge.controller.position));
      await h.shot('08-east-ridge-trail-boulder-tread');
      await route([[40.75,205.17],[39,208],[42,273]]);
    });
    await h.step('Check the north edge, then the northeast meadow and east edge',async()=>{
      await checkEdge('09-north',[2,1],Math.PI,[39,388.8],false,[40,381]);
      await route([[228,316]]);
      await checkEdge('10-east',[0,1],Math.PI/2,[388.85,240],false,[380,240]);
      const before=(await h.wait(s=>walking(s)&&s.view.saveStatus==='saved')).controller.position;
      await play.reload();
      await h.wait(s=>s.restored&&s.state.runtime.screen==='menu',30000);
      await page.getByRole('button',{name:'接着上一次的路'}).click();
      const resumed=await h.wait(walking);
      assert.ok(distance(resumed.controller.position,[before[0],before[2]])<2);
      await h.shot('11-continued-after-edge-audit');
    });
  } catch(error) {
    failure=error;
    await h.shot('failed').catch(()=>{});
    throw error;
  } finally {
    await h.finish(failure);
  }
}
