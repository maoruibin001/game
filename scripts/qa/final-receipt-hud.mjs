import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile,writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLetterHarness, sha, walking } from './letter-normal-input.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const output=join(root,'artifacts/retake-20261120');
const saved=join(root,'artifacts/final-delivery-20261120/owner/ten-flowers-resumed-2026-11-20T04-49-40-737Z/烟花与重访原始存档.browser-save.json');
const saveDigest='4616c9c619a57c05553baa34c05a1d1a6975fbc20a82a8bb250ba6481c66e1eb';
const read='shan.journey';

export default async function retakeHud(play){
  const h=await createLetterHarness(play,{id:'weather-and-finale-hud',viewport:[1920,1080]},
    {budgetMs:200000,initialPhotoCount:12,commit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim()},output);
  const page=play.page;
  let failure;
  try{
    await h.step('标题页继续同一份完整终演与重访档',async()=>{
      assert.equal(sha(await readFile(saved)),saveDigest);
      await page.context().setStorageState(saved);
      await play.reload();
      await h.wait(s=>s.restored&&s.state.runtime.screen==='menu'&&s.state.durable.flowerStock?.invitation.witnessed,45000);
      await page.locator('[data-action="continue"]').click();
      const night=await h.wait(walking);
      assert.equal(night.state.durable.flowerStock.earned.length,10);
      assert.ok(night.state.durable.flowerStock.invitation.witnessed);
      assert.equal(night.state.durable.flowerStock.counts.silver,1);
      const objective=await page.locator('.sy-objective:visible').innerText();
      assert.match(objective,/满山赴约 · 已盖戳/);
      assert.match(objective,/再次赴约/);
      assert.match(objective,/花街谜摊重访/);
      assert.doesNotMatch(objective,/两盒都能再放/);
      h.report.finalObjective={text:objective,saveDigest,position:night.controller.position,clock:night.state.durable.clock};
      await h.shot('花街重访后-终演目标提示');
    });
    await h.step('正常天气转换时检视三个窗口规格的小地图',async()=>{
      const screens=[[1920,1080],[1280,720],[1280,600]],measurements=[];
      const transition=page.locator('.sy-weather-transition:visible');
      const map=page.locator('.sy-pocket-map:visible');
      if(await map.getAttribute('data-collapsed')==='true')await map.locator('button').click();
      for(const [width,height] of screens){
        await page.setViewportSize({width,height});
        for(let attempt=0;attempt<4&&!(await transition.isVisible());attempt++){
          const state=await h.read(),seconds=state.forecast.changeInSeconds;
          if(seconds>1)await play.advance(seconds-.30,{stepSeconds:.10,read});
          for(let i=0;i<4&&!(await transition.isVisible());i++) await play.wait(400);
        }
        assert.ok(await transition.isVisible(),`no naturally changing weather at ${width}x${height}`);
        assert.ok(await map.isVisible());
        const items=await page.evaluate(()=>{
          const readRect=selector=>{
            const {x,y,width,height}=document.querySelector(selector).getBoundingClientRect();
            return {x,y,width,height};
          };
          return {transition:readRect('.sy-weather-transition'),map:readRect('.sy-pocket-map')};
        });
        const clearance=items.map.y-items.transition.y-items.transition.height;
        assert.ok(clearance>=4,`weather transition overlaps map: ${JSON.stringify(items)}`);
        const state=await h.read();
        measurements.push({width,height,clearance,...items,weather:state.state.durable.weather,clock:state.state.durable.clock});
        await page.screenshot({path:join(h.out,`天气转换-小地图-${width}x${height}.png`)});
      }
      h.report.weatherMap=measurements;
      await writeFile(join(h.out,'地图与终演复测.json'),JSON.stringify({measurements,objective:h.report.finalObjective},null,2)+'\n');
    });
  }catch(error){failure=error;await h.shot('复测中断现场').catch(()=>{});throw error;}
  finally{await h.finish(failure);}
}
