import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLetterHarness, walking } from './letter-normal-input.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const output=join(root,'artifacts/retake-20261120');
const baseline=process.env.POCKET_QA_BASELINE==='1';

export default async function pocketMapHandedness(play){
  const h=await createLetterHarness(play,{id:baseline?'pocket-map-old':'pocket-map-heading-up',viewport:[1920,1080]},
    {budgetMs:95000,commit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim()},output);
  const page=play.page;
  const svg=page.locator('.sy-pocket-map svg');
  let failure;
  async function roadPoint(){
    return svg.evaluate(element=>{
      const point=element.querySelector('polyline').points.getItem(0);
      const canvas=element.viewBox.baseVal;
      return {x:point.x-canvas.x-canvas.width/2,y:point.y-canvas.y-canvas.height/2};
    });
  }
  try{
    await h.startFresh();
    await h.key('KeyJ');
    await page.getByRole('button',{name:'先上路',exact:true}).click();
    await page.locator('button.sy-close:visible').click();
    await h.wait(walking);
    const toolbar=page.locator('.sy-pocket-map button[data-action="pocket-map-toggle"]');
    if(await toolbar.getAttribute('aria-expanded')==='false')await toolbar.click();
    await svg.waitFor();
    h.report.strafes=[];
    for(const [name,heading] of [['沿北看',Math.PI],['沿南看',0]]){
      await h.step(name+'并用 D 向画面右侧走',async()=>{
        await h.turnTo(heading,.12);
        await h.wait(s=>walking(s)&&Math.cos(s.controller.yaw-heading)>.999);
        await play.wait(450);
        const before=await h.shot(name+'-走前'),roadBefore=await roadPoint();
        await play.keyboard.hold('KeyD',520);
        const after=await h.wait(s=>walking(s)&&Math.hypot(s.controller.position[0]-before.controller.position[0],s.controller.position[2]-before.controller.position[2])>.55);
        await play.wait(450);
        const roadAfter=await roadPoint();
        const delta=roadAfter.x-roadBefore.x;
        const east=after.controller.position[0]-before.controller.position[0],z=after.controller.position[2]-before.controller.position[2];
        const viewRight=east*Math.cos(before.controller.yaw)+z*Math.sin(before.controller.yaw);
        assert.ok(viewRight>.55,`D should move toward the camera right: ${viewRight}`);
        if(baseline) assert.ok(delta*(heading===Math.PI?1:-1)>.25,`expected the original north-up map sign: ${delta}`);
        else assert.ok(delta<-.25,`a fixed road must pass to the left as the traveller walks right: ${delta}`);
        h.report.strafes.push({name,viewRight,worldX:east,worldZ:z,roadBefore,roadAfter,mapDeltaX:delta});
        await h.shot(name+'-向右走后');
      });
    }
    if(!baseline){
      await h.step('向前走并确认道路下移，大小地图同时显示同一个导航目标',async()=>{
        const before=await h.read(),point=await roadPoint();
        await play.keyboard.hold('KeyW',370);
        const after=await h.wait(s=>walking(s)&&Math.hypot(s.controller.position[0]-before.controller.position[0],s.controller.position[2]-before.controller.position[2])>.35);
        await play.wait(450);
        const ahead=await roadPoint();
        assert.ok(ahead.y>point.y+.2);
        h.report.forward={from:before.controller.position,to:after.controller.position,mapDeltaY:ahead.y-point.y};
        assert.match(await page.locator('.sy-pocket-map').innerText(),/前方/);
        await h.key('KeyM');
        const dialog=page.getByRole('dialog',{name:'山谷地图'});
        await dialog.waitFor();
        await dialog.getByRole('button',{name:'景点导航',exact:true}).click();
        await page.getByRole('dialog',{name:'景点导航'}).getByRole('button',{name:'导航到禅院',exact:true}).click();
        await h.wait(s=>s.view.navigation?.destination?.title==='禅院');
        await h.shot('大地图-禅院目的地');
        const close=page.locator('button.sy-close:visible');
        if(await close.isVisible())await close.click();
        await h.wait(walking);
        await svg.waitFor();
        assert.ok(await svg.locator('[data-navigation-route]').isVisible());
        assert.match(await page.locator('.sy-pocket-map').innerText(),/禅院/);
        await h.shot('随身地图-禅院目的地');
      });
    }
    await writeFile(join(h.out,'方向实测.json'),JSON.stringify({baseline,strafes:h.report.strafes,forward:h.report.forward},null,2)+'\n');
  }catch(error){failure=error;await h.shot('中断现场').catch(()=>{});throw error;}
  finally{await h.finish(failure);}
}
