// Visual diagnostics only. Every move, camera change and shutter uses normal input.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {cameraActive,walking,createJuryHarness} from './jury-p0-input.mjs';
import {loadVisualCandidate,retainVisualFailure} from './visual-candidate.mjs';
const QA=fileURLToPath(new URL('../../../production/iteration-jury-remediation-20261116/qa/',import.meta.url));
const distance=(s,p)=>Math.hypot(s.controller.position[0]-p[0],s.controller.position[2]-p[1]);
export async function visualDiagnosticBinding(id){
  const name='VISUAL-DIAGNOSTIC-BINDING.json';
  const binding=await loadVisualCandidate(id,name);
  const config=JSON.parse(await readFile(join(QA,name))),manifest=JSON.parse(await readFile(join(QA,config.candidateManifest)));
  for(const path of ['scripts/qa/visual-diagnostic-input.mjs','scripts/qa/passive-pointer-audit.mjs'])
    assert.match(manifest.files?.[path]??'',/^[a-f0-9]{64}$/,'visual input and passive logger must be bound');
  assert.ok(binding.budgetMs<=(id==='visual-forest-direct'?180000:240000));return binding;
}
export function precisionKeys(position,target,facingYaw){
  const angle=Math.atan2(target[0]-position[0],-(target[1]-position[2]))-facingYaw;
  const index=((Math.round(angle/(Math.PI/4))%8)+8)%8;
  return [['KeyW'],['KeyW','KeyD'],['KeyD'],['KeyS','KeyD'],['KeyS'],['KeyS','KeyA'],['KeyA'],['KeyW','KeyA']][index];
}
export async function preciseVisualPosition(play,h,target,tolerance=.15){
  let s=await h.read();assert.ok(walking(s)||cameraActive(s));
  if(cameraActive(s))await h.lowerCamera();
  s=await h.read();if(distance(s,target)>.65)await h.walkTo(target,.65);
  // The existing hand-held camera permits normal, slower 2.2 m/s movement.
  // Keep the destination tolerance and collision. No point/state setter exists here.
  await h.key('KeyC');s=await h.wait(cameraActive);const began=Date.now();
  h.report.precisionMoves??=[];
  for(let attempt=0;distance(s,target)>tolerance;attempt++){
    assert.ok(attempt<8&&Date.now()-began<8000,'visual precision movement budget exhausted');
    const start=s.controller.position,keys=precisionKeys(start,target,s.controller.facingYaw),beforeDistance=distance(s,target);
    const entry={target,tolerance,attempt,keys,before:start,beforeDistance,startedAtMs:Date.now()};h.report.precisionMoves.push(entry);
    // The official helper holds real keys until a real position sample changes;
    // it releases them in finally even when this bounded predicate fails.
    await play.keyboard.hold(keys,v=>{
      assert.equal(v.state.durable.totalPhotos,s.state.durable.totalPhotos,'unexpected photograph during normal precision movement');
      assert.equal(v.pendingCapture,null,'unexpected capture during normal precision movement');
      assert.ok(cameraActive(v));
      return distance(v,target)<=tolerance||Math.hypot(v.controller.position[0]-start[0],v.controller.position[2]-start[2])>=.045;
    },{read:'shan.journey',timeoutMs:700});
    await h.settle();s=await h.read();assert.ok(cameraActive(s));
    Object.assign(entry,{after:s.controller.position,afterDistance:distance(s,target),finishedAtMs:Date.now()});
    assert.ok(Math.hypot(s.controller.position[0]-start[0],s.controller.position[2]-start[2])>=.001,'ordinary precision keys made no actual progress');
  }
  h.record('actual-precision-photo-position',s);return s;
}
export async function visualCameraAt(play,h,view,name){
  const s=await preciseVisualPosition(play,h,view.feet),p=s.controller.camera.position,t=view.target;
  await h.turnTo(Math.atan2(t[0]-p[0],-(t[2]-p[2])),-Math.atan2(t[1]-p[1],Math.hypot(t[0]-p[0],t[2]-p[2])));
  return h.shot(`${name}-actual-composition`);
}
export async function exportLatestOriginal(h,photo,name){
  await h.key('KeyJ');await h.wait(s=>s.state.runtime.screen==='journal'&&s.controller.paused);
  await h.tabs(4);await h.key('Enter');await h.tabs(5);await h.key('Enter');await h.tabs(2);await h.key('Enter');
  await h.download(name,async()=>{await h.tabs(5);await h.key('Enter');},[1920,1080],{photoId:photo.id,bytes:photo.original.bytes});
  await h.key('Escape');await h.key('Escape');await h.wait(cameraActive);await h.lowerCamera();
}
export async function runVisualDiagnostic(play,binding,plan,body){
  const h=await createJuryHarness(play,{...plan,revision:'visual-diagnostic-01',viewport:[1920,1080]},binding);let error;
  h.report.visualDiagnostic=true;h.report.claimedScope=plan.coverage;
  h.report.notCovered.push('original postal photography branch; complete journey acceptance; unexplained prior native LMB shutter remains unresolved');
  h.report.runtimeErrors={console:[],page:[]};
  const consoleError=m=>{if(m.type()==='error')h.report.runtimeErrors.console.push({atMs:Date.now(),message:m.text()});};
  const pageError=e=>h.report.runtimeErrors.page.push({atMs:Date.now(),message:String(e)});
  play.page.on('console',consoleError);play.page.on('pageerror',pageError);
  try{await body(h);assert.deepEqual(h.report.runtimeErrors,{console:[],page:[]});h.report.visualDisposition='actual images recorded; visual review pending';}
  catch(e){error=e;await retainVisualFailure(play,h,e);throw e;}
  finally{play.page.off('console',consoleError);play.page.off('pageerror',pageError);await h.finish(error);}
}
