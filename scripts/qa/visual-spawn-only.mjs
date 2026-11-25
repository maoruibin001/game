// A single ordinary-entry screenshot. No mouse, movement, shutter or state writes.
import assert from 'node:assert/strict';
import {copyFile,mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sha,walking} from './jury-p0-input.mjs';
import {loadVisualCandidate} from './visual-candidate.mjs';

const QA=fileURLToPath(new URL('../../../production/iteration-jury-remediation-20261116/qa/',import.meta.url));
const BASELINE='visual-post-forest-2026-11-17T06-19-17-544Z';
export async function spawnBinding(){const b=await loadVisualCandidate('visual-spawn-only');assert.ok(b.budgetMs<=30000);return b;}
const facts=s=>({restored:s.restored,screen:s.state.runtime.screen,controller:s.controller,
  clock:s.state.durable.clock,weather:s.state.durable.weather,weatherCycle:s.state.durable.weatherCycle,
  environment:s.environment,totalPhotos:s.state.durable.totalPhotos,pendingCapture:s.pendingCapture,
  inputDiagnostics:s.inputDiagnostics,focus:s.frontend?.focus});
function sameSpawn(s,baseline){
  assert.ok(walking(s));assert.equal(s.state.durable.totalPhotos,0);assert.equal(s.pendingCapture,null);
  assert.equal(s.controller.distanceWalked,0);assert.equal(s.controller.speed,0);
  assert.equal(s.inputDiagnostics.shutters.length,0,'no shutter is expected in a visual-only probe');
  for(const key of ['position','forward','up'])s.controller.camera[key].forEach((n,i)=>
    assert.ok(Math.abs(n-baseline.controller.camera[key][i])<1e-6,`baseline camera ${key}[${i}] changed`));
  s.controller.position.forEach((n,i)=>assert.ok(Math.abs(n-baseline.controller.position[i])<1e-6));
  for(const key of ['yaw','pitch','facingYaw'])assert.ok(Math.abs(s.controller[key]-baseline.controller[key])<1e-6,`baseline ${key} changed`);
  for(const key of ['verticalFovRadians','aspect'])assert.equal(s.controller.camera[key],baseline.controller.camera[key]);
  assert.equal(s.state.durable.clock.day,baseline.progress.clock.day);
  assert.equal(Math.floor(s.state.durable.clock.minute),Math.floor(baseline.progress.clock.minute),'default displayed minute must remain 15:30');
  assert.equal(s.state.durable.weather,baseline.progress.weather);assert.equal(s.state.durable.weatherCycle.cycle,0);
  assert.equal(s.environment.weather,baseline.environment.weather);assert.equal(s.environment.settled,true);
}
export async function runSpawnOnly(play,binding){
  const began=Date.now(),baselinePath=join(QA,'owner',BASELINE,'acceptance.json');
  const baselineBytes=await readFile(baselinePath),baselineReport=JSON.parse(baselineBytes);
  const baseline=baselineReport.observations.find(o=>o.name==='01-post-initial-spawn');assert.ok(baseline);
  const baselineImage=join(QA,'owner',BASELINE,'01-post-initial-spawn.png');
  const out=join(QA,'owner',`visual-spawn-only-${new Date().toISOString().replace(/[:.]/g,'-')}`);await mkdir(out,{recursive:true});
  const report={scope:'single spawn visual comparison only; no walking, interaction, photography or whole-world acceptance',
    binding,startedAt:new Date().toISOString(),baseline:{acceptance:baselinePath,acceptanceSha256:sha(baselineBytes),
      image:baselineImage,imageSha256:sha(await readFile(baselineImage)),binding:baselineReport.binding,
      camera:baseline.controller.camera,clock:baseline.progress.clock,weather:baseline.progress.weather},
    inputs:[],runtimeErrors:{console:[],page:[]},status:'running'};
  const consoleError=m=>{if(m.type()==='error')report.runtimeErrors.console.push({atMs:Date.now(),message:m.text()});};
  const pageError=e=>report.runtimeErrors.page.push({atMs:Date.now(),message:String(e)});
  const budget=()=>{assert.ok(!play.signal.aborted);assert.ok(Date.now()-began<binding.budgetMs,'spawn visual budget exhausted');};
  play.page.on('console',consoleError);play.page.on('pageerror',pageError);
  let error;
  try{
    const menu=await play.waitFor(s=>s.restored&&s.state.runtime.screen==='menu',{read:'shan.journey',timeoutMs:10000});
    assert.equal(menu.state.durable.started,false,'existing save must not be erased');
    for(const key of ['Tab','Enter']){budget();report.inputs.push({key,atMs:Date.now()});await play.keyboard.press(key);await play.wait(80);}
    const before=await play.waitFor(walking,{read:'shan.journey',timeoutMs:7000});report.before=facts(before);sameSpawn(before,baseline);
    report.frameBefore=await play.state('shan.capture');budget();
    const shot=await play.screenshot('01-post-initial-spawn');assert.equal(shot.rendered,true);
    const file=join(out,'01-post-initial-spawn.png');await copyFile(shot.path,file);report.screenshot={...shot,file,sha256:sha(await readFile(file))};
    const captureReport=JSON.parse(await readFile(join(dirname(shot.path),'capture.json')));
    const record=captureReport.captures.find(c=>c.output===shot.path);assert.ok(record);
    report.capturedFrame=record.runtime?.engineFrameId;assert.ok(Number.isSafeInteger(report.capturedFrame));
    report.frameAfter=await play.state('shan.capture');const after=await play.state('shan.journey');report.after=facts(after);sameSpawn(after,baseline);
    report.clockDifferenceMinutes={before:before.state.durable.clock.minute-baseline.progress.clock.minute,after:after.state.durable.clock.minute-baseline.progress.clock.minute};
    report.comparisonLimits='Default displayed time and weather, camera and position match; natural fractional-minute progression and random seed are recorded without changing them.';
    assert.deepEqual(report.runtimeErrors,{console:[],page:[]});budget();report.status='spawn-frame-recorded-visual-review-pending';
  }catch(e){error=e;report.status='failed';report.error=String(e);throw e;}finally{
    play.page.off('console',consoleError);play.page.off('pageerror',pageError);
    report.finishedAt=new Date().toISOString();report.realElapsedMs=Date.now()-began;
    await writeFile(join(out,'acceptance.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    console.log(JSON.stringify({name:'spawn-visual-result',candidate:binding.candidate,status:report.status,elapsedMs:report.realElapsedMs,output:out,error:error&&String(error)}));
  }
}
export default async function spawnOnly(play){return runSpawnOnly(play,await spawnBinding());}
