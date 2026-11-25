import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { cameraActive, createLetterHarness, walking } from './letter-normal-input.mjs';
import { P0_ROUTE } from './p0-route-plan.mjs';
import { captureOpeningShadow } from './opening-sun-shadow.mjs';
import { walkStairFlight } from './courtyard-stair-walk.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const output=join(root,process.env.SHANYE_RENDER_EVIDENCE??'artifacts/render-regression');
const read='shan.journey';
const shadowOnly=process.env.SHANYE_SHADOW_ONLY==='1';
const upper=[[155,28],[155,37],[155.6,45],[155.95,50],[155.95,54.8],[156.45,56.2],[156.45,58.6],[158,61],[158,65.5],[158,76.5],[158,81],[158,91.5]];
const wrap=x=>Math.atan2(Math.sin(x),Math.cos(x));

async function record(page,file,perform){
  await page.locator('canvas').first().evaluate(canvas=>{
    const stream=canvas.captureStream(30);
    const recorder=new MediaRecorder(stream,{mimeType:'video/webm',videoBitsPerSecond:4_100_000});
    const chunks=[];
    const done=new Promise(resolve=>{
      recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
      recorder.onstop=()=>resolve(new Blob(chunks,{type:recorder.mimeType}));
    });
    canvas.regressionRecording={stream,recorder,done};
    recorder.start(300);
  });
  try{await perform();}
  finally{
    const data=await page.locator('canvas').first().evaluate(async canvas=>{
      const r=canvas.regressionRecording;r.recorder.stop();
      const bytes=new Uint8Array(await (await r.done).arrayBuffer());
      let result='';for(let i=0;i<bytes.length;i+=0x4000)result+=String.fromCharCode(...bytes.subarray(i,i+0x4000));
      for(const track of r.stream.getTracks())track.stop();
      delete canvas.regressionRecording;return btoa(result);
    });
    await writeFile(file,Buffer.from(data,'base64'));
  }
}

export default async function validate(play){
  const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  const h=await createLetterHarness(play,{id:'bridge-pillar-normal',viewport:[1920,1080]},{budgetMs:365000,commit},output);
  const page=play.page;
  async function turn(yaw,pitch=.13){
    for(let attempt=0;attempt<4;attempt++){
      try{await h.turnTo(yaw,pitch);return;}
      catch(error){
        const s=await h.read(),delta=wrap(yaw-s.controller.yaw);
        if(Math.abs(delta)<.064&&Math.abs(pitch-s.controller.pitch)<.04)return;
        if(attempt===3)throw error;
        if(Math.abs(delta)>.04){
          const key=delta>0?'ArrowRight':'ArrowLeft';
          await page.keyboard.down(key);
          try{await play.advance(Math.abs(delta)/(cameraActive(s)?1.35:2.15),{stepSeconds:.027,read});}
          finally{await page.keyboard.up(key);}
        }
      }
    }
  }
  async function walk([x,z],tolerance=.55){
    const dist=s=>Math.hypot(s.controller.position[0]-x,s.controller.position[2]-z);
    let s=await h.read();
    for(let n=0;dist(s)>tolerance;n++){
      assert.ok(n<19,`could not reach ${x},${z} on the real road from ${s.controller.position}`);
      const [px,,pz]=s.controller.position,yaw=Math.atan2(x-px,pz-z);
      if(Math.abs(wrap(yaw-s.controller.yaw))>.068)await turn(yaw);
      await page.keyboard.down('KeyW');
      try{await play.advance(Math.min(3.35,Math.max(.045,(dist(s)-tolerance*.49)/6.8)),{stepSeconds:.045,read});}
      finally{await page.keyboard.up('KeyW');}
      await h.settle();s=await h.read();assert.ok(walking(s));
    }
  }
  const route=async(points,tolerance)=>{for(const point of points)await walk(point,tolerance);};
  async function moveNorth(z){
    await page.keyboard.down('KeyW');
    try{return await h.wait(s=>walking(s)&&s.controller.position[2]>=z,8000);}
    finally{await page.keyboard.up('KeyW');}
  }
  let failure;
  try{
    await h.startFresh();
    if(!shadowOnly)await captureOpeningShadow(h,play,{checkResume:false});
    await h.step('open wooden screen, confirm the raised bridge still blocks',async()=>{
      await h.key('KeyJ');await page.getByRole('button',{name:'先上路',exact:true}).click();
      await page.locator('button.sy-close:visible').click();await h.wait(walking);
      await route([[9.5,-226.2],...P0_ROUTE.town.slice(0,-1)]);
      await route(P0_ROUTE.lever,.38);
      await h.wait(s=>walking(s)&&s.state.runtime.nearby==='town-gate');
      await h.key('KeyE');await h.wait(s=>s.state.durable.gateOpened);
      if(shadowOnly)return;
      await route([[148,-2],[155,7],[155,20]],.48);await turn(Math.PI,.28);
      await page.keyboard.down('KeyW');
      try{await play.advance(1.7,{stepSeconds:.045,read});}
      finally{await page.keyboard.up('KeyW');}
      const raised=await h.read();
      assert.ok(raised.controller.position[2]>22&&raised.controller.position[2]<24.2&&!raised.world.bridgeWalkable);
      await h.shot('raised-bridge-blocks');
    });
    await h.step('take the stone arch photo and cross the real deck both ways',async()=>{
      await route([[155,7],[155,-3]],.26);
      await h.key('KeyC');await h.wait(cameraActive);
      const p=(await h.read()).controller.camera.position;
      await turn(Math.atan2(155-p[0],p[2]-10),-Math.atan2(29-p[1],Math.hypot(155-p[0],p[2]-10)));
      await h.photograph('lower-bridge-by-ordinary-photo',{matchedCard:'town'});await h.lowerCamera();
      await h.wait(s=>s.world.bridgeWalkable);
      if(shadowOnly){await route([[155,7],[155,20]],.38);return;}
      await route([[155,7],[155,20],[155,23]],.3);
      await turn(Math.PI,.41);
      await h.shot('lowered-wood-deck');
      await record(page,join(h.out,'木桥落平后往返.webm'),async()=>{
        await moveNorth(31.7);await h.settle();
        await turn(0,.42);
        await page.keyboard.down('KeyW');
        try{await h.wait(s=>walking(s)&&s.controller.position[2]<23.5,8000);}
        finally{await page.keyboard.up('KeyW');}
        await h.settle();
      });
      await h.shot('back-at-south-bridgehead');
    });
    if(!shadowOnly)await h.step('walk the central monastery stair flight in both directions',async()=>{
      await route(upper.slice(0,9),.32);
      await walkStairFlight(h,play,'禅院石阶上行',Math.PI,z=>z>=92.8);
      await walkStairFlight(h,play,'禅院石阶下行',0,z=>z<66.4);
      const bottom=await h.wait(walking);
      assert.ok(bottom.controller.position[1]<25&&Math.abs(bottom.controller.position[0]-158)<1.7);
    });
    await h.step('arrive at the upper hall normally, hold the camera and strafe',async()=>{
      await route(shadowOnly?upper:upper.slice(9),.38);
      await walk([155.0,92.1],.35);
      await h.key('KeyC');await h.wait(cameraActive);
      const p=(await h.read()).controller.camera.position;
      const target=[155.785714,36.25,94.7529];
      await turn(Math.atan2(target[0]-p[0],p[2]-target[2]),-Math.atan2(target[1]-p[1],Math.hypot(target[0]-p[0],p[2]-target[2])));
      const minute=(await h.read()).state.durable.clock.minute;
      if(minute<900.4)await play.advance((900.4-minute)*1.5,{stepSeconds:.1,read});
      const porch=await h.shot('pillar-before-pan');
      const opening=h.report.shadowSamples?.[0];
      if(opening)assert.notDeepEqual(porch.environment.sunDirection,opening.sunDirection);
      assert.ok(porch.state.durable.clock.minute>=899.8&&porch.state.durable.clock.minute<908,
        `pillar fixture reached after the intended 15:00 window: ${porch.state.durable.clock.minute}`);
      await record(page,join(h.out,'上院红柱停镜与横移.webm'),async()=>{
        const start=(await h.read()).state.durable.playSeconds;
        h.report.pillarStill=[];
        for(let i=0;i<21;i++){
          const frame=await h.wait(s=>cameraActive(s)&&s.state.durable.playSeconds-start>i*.55,10000);
          const name='pillar-still-'+i+'.png';
          await page.locator('canvas').first().screenshot({path:join(h.out,name)});
          h.report.pillarStill.push({name,minute:frame.state.durable.clock.minute,
            direction:frame.environment.sunDirection,camera:frame.controller.camera});
        }
        await play.keyboard.hold('KeyD',340);await h.settle();
        await h.shot('pillar-pan-right');
        await play.wait(450);
        await play.keyboard.hold('KeyA',340);await h.settle();
        await h.shot('pillar-return');
        const stationary=(await h.read()).controller.position;
        await turn((await h.read()).controller.yaw+.20,-.16);
        await h.shot('pillar-camera-only-turn');
        assert.ok(Math.hypot(...(await h.read()).controller.position.map((axis,i)=>axis-stationary[i]))<.08);
      });
    });
  }catch(error){failure=error;await h.shot('failed').catch(()=>{});throw error;}
  finally{await h.finish(failure);}
}
