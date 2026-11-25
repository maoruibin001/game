// Ordinary-entry UI smoke. Only this new file is added; no game/state/save mutation.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {cameraActive,createJuryHarness} from './jury-p0-input.mjs';
import {loadVisualCandidate,retainVisualFailure} from './visual-candidate.mjs';
import {exportLatestOriginal} from './visual-diagnostic-input.mjs';
import {withPassivePointerAudit} from './passive-pointer-audit.mjs';

const ID='photography-ui-smoke';
const QA=fileURLToPath(new URL('../../../production/iteration-jury-remediation-20261116/qa/',import.meta.url));
export async function photographyUiBinding(){
  // The new id is not enabled by existing bindings. Root must explicitly bind it.
  const b=await loadVisualCandidate(ID,'VISUAL-DIAGNOSTIC-BINDING.json');assert.ok(b.budgetMs<=90000);
  const config=JSON.parse(await readFile(join(QA,'VISUAL-DIAGNOSTIC-BINDING.json')));
  const manifest=JSON.parse(await readFile(join(QA,config.candidateManifest)));
  for(const path of ['scripts/qa/passive-pointer-audit.mjs','scripts/qa/visual-diagnostic-input.mjs',
    'assets/presentation/photography-tools.ts','assets/presentation/presentation.ts','assets/controller/portrait-camera.ts'])
    assert.match(manifest.files?.[path]??'',/^[a-f0-9]{64}$/,`UI smoke must bind ${path}`);
  return b;
}
export async function runPhotographyUi(play,binding){
  let h,error,timerStart;
  const samples=[];
  const inspectCountdown=async s=>{
    if(!s?.state?.runtime)return s;
    const remaining=s.state.runtime.countdownSeconds;
    if(remaining!==null&&remaining!==undefined){
      const sample={atMs:Date.now(),remaining,totalPhotos:s.state.durable.totalPhotos,pendingCapture:s.pendingCapture};
      try{const counter=play.page.locator('.sy-countdown strong');if(await counter.count())sample.visibleText=await counter.innerText({timeout:300});}
      catch(e){sample.readError=String(e);}
      samples.push(sample);
    }
    return s;
  };
  const observed={...play,keyboard:{...play.keyboard,
    press:async key=>{if(key==='Space')timerStart=Date.now();return play.keyboard.press(key);}},
    state:async(...args)=>inspectCountdown(await play.state(...args)),
    waitFor:async(...args)=>inspectCountdown(await play.waitFor(...args))};
  h=await createJuryHarness(observed,{id:ID,revision:'ordinary-photo-ui-01',viewport:[1920,1080],
    coverage:'normal title/camera UI; visible portrait availability; visible three-second timer; actual original only if a real portrait viewpoint is available'},binding);
  h.report.uiActions=[];h.report.countdownSamples=samples;h.report.runtimeErrors={console:[],page:[]};
  h.report.notCovered.push('all portrait locations/poses; complete journey; prior unexplained extra LMB shutter; platform acceptance');
  const consoleError=m=>{if(m.type()==='error')h.report.runtimeErrors.console.push({atMs:Date.now(),message:m.text()});};
  const pageError=e=>h.report.runtimeErrors.page.push({atMs:Date.now(),message:String(e)});
  play.page.on('console',consoleError);play.page.on('pageerror',pageError);
  async function click(selector,label){
    const element=play.page.locator(selector);assert.equal(await element.count(),1,`${label}: one ordinary control required`);
    const entry={label,selector,startedAtMs:Date.now()};h.report.uiActions.push(entry);
    await element.click({timeout:2500});entry.finishedAtMs=Date.now();await h.settle();return h.read();
  }
  async function visiblePortrait(s,label){
    const root=play.page.locator('.sy-camera'),feedback=play.page.locator('.sy-camera-feedback');
    const selected=s.view.camera.viewpoints?.find(v=>v.index===s.state.durable.photography.viewpoint);
    assert.ok(selected,'actual selected portrait candidate must exist');
    const message=await feedback.innerText({timeout:1500});assert.ok(message.trim());
    assert.equal(await root.getAttribute('data-portrait-ready'),String(selected.available));
    assert.equal(await root.getAttribute('data-photo-mode'),'portrait');
    const disabled=await play.page.locator('.sy-shutter').isDisabled();
    if(s.state.durable.photography.timerSeconds===0)assert.equal(disabled,!selected.available);
    if(selected.available)assert.match(message,/代拍机位就绪.*人物已完整入镜/);
    else assert.ok(!message.includes('代拍机位就绪'),'unavailable portrait must not claim ready');
    const choices=[];
    for(const candidate of s.view.camera.viewpoints??[]){
      const node=play.page.locator(`[data-action="photo-option"][data-photo-key="viewpoint"][data-value="${candidate.index}"]`);
      assert.equal(await node.count(),1);assert.equal(await node.isDisabled(),!candidate.available);
      choices.push({...candidate,text:await node.innerText({timeout:1500}),disabled:await node.isDisabled(),title:await node.getAttribute('title')});
    }
    const evidence={label,atMs:Date.now(),message,selected,choices,shutterDisabled:disabled,controller:s.controller.photography};
    (h.report.portraitUi??=[]).push(evidence);return selected;
  }
  try{
    await h.step('ordinary-menu-and-visible-portrait-status',async()=>{
      await h.startFresh();await h.key('KeyC');await h.wait(cameraActive);await h.shot('01-camera-guidance');
      await click('[data-action="toggle-photo-tools"]','镜头与人物');
      await click('[data-action="photo-option"][data-photo-key="mode"][data-value="portrait"]','帮我拍');
      let s=await h.wait(v=>cameraActive(v)&&v.state.durable.photography.mode==='portrait'&&v.controller.photography.settings.mode==='portrait');
      let selected=await visiblePortrait(s,'initial-portrait');await h.shot('02-portrait-availability');
      if(!selected.available){
        const candidate=s.view.camera.viewpoints?.find(v=>v.available);
        if(candidate){
          await click(`[data-action="photo-option"][data-photo-key="viewpoint"][data-value="${candidate.index}"]`,'选择实际可用机位');
          s=await h.wait(v=>cameraActive(v)&&v.state.durable.photography.viewpoint===candidate.index);
          selected=await visiblePortrait(s,'ordinary-alternative-viewpoint');
        }
      }
      h.report.realPortraitAvailable=selected.available;
      if(selected.available){assert.equal(s.controller.photography.subjectVisible,true);assert.equal(s.controller.avatarVisible,true);assert.deepEqual(s.cameraPropScale,[0,0,0]);}
      await click('[data-action="toggle-photo-tools"]','收起镜头与人物');
      const timer=play.page.locator('.sy-photo-quick-timer');assert.equal(await timer.isVisible(),true);assert.equal(await timer.getAttribute('aria-pressed'),'false');
      await click('.sy-photo-quick-timer','开启常驻 3 秒定时');
      await h.wait(v=>cameraActive(v)&&v.state.durable.photography.timerSeconds===3&&v.controller.photography.settings.timerSeconds===3);
      assert.equal(await timer.getAttribute('aria-pressed'),'true');assert.match(await timer.innerText({timeout:1500}),/3 秒定时：开/);
      assert.equal(await play.page.locator('.sy-shutter').isDisabled(),false,'timed shutter must permit a normal positioning countdown');
      assert.equal(await play.page.locator('.sy-shutter').getAttribute('aria-label'),'开始 3 秒倒计时拍照');
      await h.shot('03-three-second-timer-visible');
    });
    await h.step('one-real-timed-shutter',async()=>{
      if(h.report.realPortraitAvailable){
        const photo=await h.photograph('04-real-timed-portrait');
        h.report.timerWallMs=Date.now()-timerStart;assert.ok(h.report.timerWallMs>=3000,'timed result must not return before three real seconds');
        assert.equal(photo.scene.mode,'portrait');assert.equal(photo.scene.subject.visible,true);
        assert.deepEqual((await h.read()).cameraPropScale,[0,0,0]);
        await exportLatestOriginal(h,photo,'05-timed-portrait-original');
        assert.equal(h.report.photos.length,1);assert.equal(h.report.downloads.length,1);assert.equal((await h.read()).state.durable.totalPhotos,1);
        h.report.uiOutcome='portrait-availability-and-real-timed-original-recorded; human visual review pending';
      }else{
        // No walk/teleport/settings fallback can manufacture a usable portrait.
        // Exercise the normal timer at the actual unavailable station and retain its rejection.
        await h.key('Space');await h.wait(s=>s.state.runtime.countdownSeconds!==null,1500);
        let ended;const deadline=Date.now()+8000;
        while(Date.now()<deadline){const s=await h.read();
          if(s.state.runtime.countdownSeconds===null&&cameraActive(s)){ended=s;break;}
          await play.wait(80);
        }
        assert.ok(ended,'unavailable portrait countdown did not finish within its bounded observation');
        h.report.timerWallMs=Date.now()-timerStart;assert.ok(h.report.timerWallMs>=3000);
        assert.equal(ended.state.durable.totalPhotos,0);assert.equal(ended.pendingCapture,null);
        h.record('unavailable-portrait-after-timer',ended);await h.shot('04-unavailable-portrait-timer-result');
        h.report.uiOutcome='availability-and-timer-observed; portrait saving NOT VERIFIED because no real viewpoint was available';
        h.report.notCovered.push('portrait original save/export: no actual available viewpoint at this ordinary station');
      }
      const digits=[...new Set(samples.map(s=>s.visibleText?.trim()).filter(Boolean))];h.report.visibleCountdownDigits=digits;
      assert.ok(['3','2','1'].every(n=>digits.includes(n)),'actual visible UI must show 3, 2 and 1; partial observation is not a pass');
      assert.deepEqual(h.report.runtimeErrors,{console:[],page:[]});
    });
  }catch(e){error=e;await retainVisualFailure(play,h,e);throw e;}finally{
    play.page.off('console',consoleError);play.page.off('pageerror',pageError);await h.finish(error);
  }
}
export default async function photographyUi(play){const b=await photographyUiBinding();
  return withPassivePointerAudit(p=>runPhotographyUi(p,b),b,{id:ID,scope:'ordinary photography UI, actual pointer events and all native shutters; no state injection'})(play);}
