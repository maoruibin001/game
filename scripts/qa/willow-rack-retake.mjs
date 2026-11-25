import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cameraActive, createLetterHarness, sha, walking } from './letter-normal-input.mjs';
import { tapAudio, startVideo, stopVideo } from './night-post.mjs';

export default async function willowRackRetake(play) {
  const root=fileURLToPath(new URL('../../',import.meta.url));
  const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  const source=process.env.VALLEY_WILLOW_SAVE;
  const bytes=await readFile(source);
  const hash=sha(bytes);
  assert.equal(hash,'ab98da6a9410bce7cb6da383bd40801122e27de762e1c0801ef79ba1a4ea94d6');
  const archived=JSON.parse(bytes).origins.find(origin=>origin.localStorage.some(item=>item.name==='shanye-laixin.journey.v2'));
  const original=JSON.parse(archived.localStorage.find(item=>item.name==='shanye-laixin.journey.v2').value).journey;
  assert.ok(original.night.torch&&original.night.placed&&!original.night.spent);
  const {page}=play;
  await tapAudio(page);
  await page.context().setStorageState({cookies:[],origins:[{...archived,origin:new URL(page.url()).origin}]});
  await play.reload();
  const h=await createLetterHarness(play,{id:'松台火把架定向复测',viewport:[1920,1080]},
    {budgetMs:100000,commit,initialPhotoCount:original.totalPhotos},process.env.VALLEY_STORY_EVIDENCE??dirname(source));
  const action=name=>'[data-action="'+name+'"]';
  const click=selector=>page.locator(selector).click({timeout:8000});
  h.report.source={file:source,sha256:hash,originalBox:original.night.placed};
  const oldCamera=[159.24747940794813,35.075,91.00506271432756];
  let error, recording=false, photo;
  try {
    await h.step('从标题继续原有点火前存档，按正常操作拿起火把',async()=>{
      await h.wait(s=>s.restored&&s.state.runtime.screen==='menu'&&s.state.durable.night.placed,35000);
      await click(action('continue'));
      await h.wait(s=>walking(s)&&s.nightProps.phase==='ready',25000);
      await click(action('open-gear'));
      await click(action('night-gear')+'[data-operation="torch"]');
      await h.wait(s=>walking(s)&&s.state.runtime.torchLit&&s.nightProps.phase==='ready');
      await h.turnTo(0,-.10);
      await h.wait(s=>s.state.runtime.nearby==='night-ignite');
    });
    await h.step('松台亲手点火，向后退到原机位举机，重新导出原片',async()=>{
      assert.ok(await startVideo(page)>0);
      recording=true;
      await h.key('KeyE');
      const lit=await h.wait(s=>s.state.runtime.fireworkShow?.firstWillow);
      const start=lit.state.runtime.fireworkShow.startedAt;
      assert.deepEqual(lit.state.runtime.fireworkShow.launches.gold,original.night.placed);
      await play.keyboard.hold('KeyS',1370);
      await h.key('KeyC');await h.wait(cameraActive);
      await h.turnTo(0,-.24);
      const shutter=await h.wait(s=>cameraActive(s)&&s.state.durable.playSeconds-start>=11.94,14000);
      assert.equal(shutter.state.durable.photography.lens,'wide');
      assert.equal(shutter.state.durable.weather,'rain');
      const distance=Math.hypot(...shutter.controller.camera.position.map((n,i)=>n-oldCamera[i]));
      photo=await h.photograph('E01-原机位金柳');
      h.report.retake={camera:photo.scene.camera,oldCamera,distance,shutterSeconds:photo.playSeconds-start,weather:photo.scene.weather};
      await h.wait(s=>!s.state.runtime.fireworkShow,10000);
      h.report.video=await stopVideo(page,join(h.out,'金柳-火把架移位后-有声现场.webm'));recording=false;
      assert.ok(h.report.video?.bytes>10000&&h.report.video.audioTracks>0);
      await h.lowerCamera();
      await click(action('open-film'));await click(action('view-photo')+'[data-id="'+photo.id+'"]');
      await h.download('金柳-火把架移位后-玩家原片',()=>click(action('export-photo')),[1920,1080],
        {photoId:photo.id,bytes:photo.original.bytes});
      assert.ok(distance<=.40,'the player camera must match the original to within 40 cm');
      assert.ok(h.report.retake.shutterSeconds<14.35);
    });
    await h.step('正常续档仍保留首盒已用与刚拍的原片',async()=>{
      await play.reload();
      await h.wait(s=>s.restored&&s.state.runtime.screen==='menu'&&s.state.durable.night.spent,35000);
      await click(action('continue'));
      const resumed=await h.wait(walking);
      assert.equal(resumed.state.durable.film.at(-1)?.id,photo.id);
      await h.shot('E02-重拍原片和首盒消耗已存');
    });
  } catch(cause) {
    error=cause;
    if(recording)h.report.video=await stopVideo(page,join(h.out,'未完成-有声现场.webm')).catch(()=>null);
    await h.shot('中断现场').catch(()=>{});
    throw cause;
  } finally { await h.finish(error); }
}
