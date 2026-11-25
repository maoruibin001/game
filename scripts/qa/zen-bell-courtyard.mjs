import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createLetterHarness,walking,cameraActive} from './letter-normal-input.mjs';
import {P0_ROUTE} from './p0-route-plan.mjs';

export default async function courtyardStudy(play) {return recordCourtyard(play,false);}

export async function recordCourtyard(play,portfolio) {
  const root=fileURLToPath(new URL('../../../production/zen-bell-art/',import.meta.url));
  const h=await createLetterHarness(play,{id:portfolio?'bell-portraits':'bell-garden',viewport:[1920,1080]},{budgetMs:340000},root);
  const page=play.page, errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const action=(id)=>page.locator('[data-action="'+id+'"]').first().click({timeout:5000});
  async function light(time,weather){
    if(cameraActive(await h.read()))await h.lowerCamera();
    await action('open-outings');
    if(!(await h.read()).state.durable.creativeMode)await action('set-creative-mode');
    await page.locator('[data-creative-time]').fill(time);
    await page.locator('[data-action="set-weather"][data-weather="'+weather+'"]').click();
    await page.locator('button.sy-close:visible').click();
    await h.wait(s=>walking(s)&&s.environment.weather===weather&&s.environment.settled);
  }
  async function recordRain(){
    // Read the real WebGPU canvas at the composed player view while the world continues to run.
    const take=await page.locator('canvas').first().evaluate(async canvas=>{
      const mime=['video/mp4;codecs=avc1.42001E','video/webm;codecs=vp9'].find(t=>MediaRecorder.isTypeSupported(t));
      if(!mime)return null;
      const stream=canvas.captureStream(24),parts=[],recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:7500000});
      try{
        const end=new Promise((resolve,reject)=>{recorder.onstop=resolve;recorder.onerror=reject;});
        recorder.ondataavailable=e=>{if(e.data.size)parts.push(e.data);};
        recorder.start();await new Promise(resolve=>setTimeout(resolve,7000));recorder.stop();await end;
        const bytes=new Uint8Array(await new Blob(parts).arrayBuffer());let raw='';
        for(let i=0;i<bytes.length;i+=16384)raw+=String.fromCharCode(...bytes.subarray(i,i+16384));
        return {mime,encoded:btoa(raw)};
      }finally{for(const track of stream.getTracks())track.stop();}
    });
    if(take){
      const file=join(h.out,'rain-in-the-courtyard.'+(take.mime.includes('mp4')?'mp4':'webm'));
      const bytes=Buffer.from(take.encoded,'base64');await writeFile(file,bytes);
      h.report.recording={file,bytes:bytes.length,mime:take.mime,source:'game canvas, silent'};
    }
  }
  async function photo(name,feet,target,lens,checkBell=false){
    await h.cameraAt({feet,target},name);
    await action('toggle-photo-tools');
    await page.locator('[data-action="photo-option"][data-photo-key="lens"][data-value="'+lens+'"]').click();
    await action('toggle-photo-tools');await h.wait(s=>cameraActive(s)&&s.state.durable.photography.lens===lens);
    if(name==='bell-rain')await recordRain();
    const result=await h.photograph(name,{courtyard:checkBell});
    await h.key('KeyJ');await h.wait(s=>s.state.runtime.screen==='journal');await page.locator('[role="tab"]').nth(2).click();
    await page.locator('[data-action="photo-collection"][data-collection="film"]').click();
    await page.locator('.sy-album [data-id="'+result.id+'"]').click();
    await h.download(name+'-original',()=>action('export-photo'),[1920,1080],{photoId:result.id,bytes:result.original.bytes});
    while((await h.read()).state.runtime.screen==='journal'){await page.locator('button.sy-close:visible').first().click();await h.settle();}
    if(cameraActive(await h.read()))await h.lowerCamera();
    await h.wait(walking);
  }
  async function eveningPortraits(){
    // Keep the skyline above the raised eaves and frame the approach stones at the bottom edge.
    await light('17:12','afterglow');
    await photo('golden-hour',[155.10,36.15],[162.1,28.7,52.1],'standard');
    await photo('bronze-in-sunset',[155.5,43.5],[161.125,26.5,51.125],'detail');
    await light('18:38','afterglow');
    await photo('paper-lantern',[155.45,40.0],[161.3,27.7,51.5],'standard');
  }
  let failure;
  try{
    await h.startFresh();await h.route(P0_ROUTE.town.slice(0,-1));await h.route(P0_ROUTE.lever,.35);
    await h.key('KeyE');await h.wait(s=>s.state.durable.gateOpened);
    await h.route([[148,-2],[155,-3]],.35);await h.cameraAt({feet:[155,-3],target:[155,29,10]},'town');
    await h.photograph('bridge',{matchedCard:'town'});await h.lowerCamera();
    await h.route([[155,7],[155,20],[155,28],[155,37]],.65);
    if(portfolio){
      await eveningPortraits();
      assert.equal((await h.read()).state.durable.totalPhotos,4);
      assert.deepEqual(errors,[]);
      return;
    }
    await light('07:40','morning');
    await photo('approach',[155.4,38],[159.8,27,51.4],'standard');
    await photo('bell-morning',[155.5,43.5],[160.75,27.03,51.35],'wide',true);
    await photo('garden-standard',[155.5,43.5],[160.75,27.03,51.35],'standard');
    await light('15:30','rain');
    await photo('bell-rain',[155.5,43.5],[160.75,27.03,51.35],'wide',true);
    await photo('bronze-detail',[155.5,43.5],[161.125,26.45,51.125],'detail');
    await light('17:38','morning');
    await photo('bell-evening',[155.5,43.5],[160.75,27.03,51.35],'wide',true);
    await h.walkTo([155.25,46.1],.32);
    await photo('side-gallery',[155.25,46.1],[161.8,26.7,52.3],'wide');
    await h.walkTo([155,42],.5);await h.walkTo([155,37],.5);
    assert.equal((await h.read()).state.durable.totalPhotos,8);
    await eveningPortraits();
    await h.key('Escape');await h.wait(s=>s.state.runtime.screen==='paused'&&s.view.saveStatus==='saved');
    await play.reload();const restored=await h.wait(s=>s.restored&&s.state.runtime.screen==='menu');
    assert.equal(restored.state.durable.totalPhotos,11);
    assert.deepEqual(restored.state.durable.film.map(p=>p.id),h.report.photos.slice(-8).map(p=>p.id));
    await action('continue');await h.wait(walking);
    await h.key('KeyJ');await h.wait(s=>s.state.runtime.screen==='journal');await page.locator('[role="tab"]').nth(2).click();
    await page.locator('[data-action="photo-collection"][data-collection="film"]').click();
    const detail=h.report.photos.find(p=>p.name==='bronze-detail');
    await page.locator('.sy-album [data-id="'+detail.id+'"]').click();
    const reopened=await h.download('detail-after-reload',()=>action('export-photo'),[1920,1080],{photoId:detail.id,bytes:detail.original.bytes});
    assert.equal(reopened.sha256,h.report.downloads.find(d=>d.name==='bronze-detail-original').sha256);
    assert.deepEqual(errors,[]);
  }catch(e){failure=e;await h.shot('FAIL-observed').catch(()=>{});throw e;}
  finally{h.report.browserErrors=errors;await h.finish(failure);}
}
