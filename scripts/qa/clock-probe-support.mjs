// Additive ordinary-input QA. No product imports, DOM/eval or game commands.
import assert from 'node:assert/strict';
import {copyFile,mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';

const ROOT=fileURLToPath(new URL('../../../',import.meta.url));
const GAME=fileURLToPath(new URL('../../',import.meta.url));
const EVIDENCE=join(ROOT,'production/iteration-clock-outings-20261116');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=async path=>JSON.parse(await readFile(path,'utf8'));
export const walking=s=>s.state.runtime.screen==='play'&&s.controller.mode==='walk'&&!s.controller.paused
  &&s.state.runtime.pauseReasons.length===0&&s.frontend?.focus?.target==='canvas';
export const cameraActive=s=>s.state.runtime.screen==='photo'&&s.controller.mode==='photo'&&!s.controller.paused
  &&!s.pendingCapture&&!s.state.durable.pendingPhoto&&s.state.runtime.pauseReasons.length===0&&s.frontend?.focus?.target==='canvas';

export async function loadProbeBinding(probe){
  const binding=await json(join(EVIDENCE,'QA-OWNER-BINDING.json'));
  assert.equal(binding.runnable,true,'Clock probes are disabled until root binds the frozen candidate and budget');
  assert.ok(binding.enabledProbes?.includes(probe),`Probe ${probe} is not enabled`);
  assert.match(binding.candidateManifest,/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.json$/);
  const manifestPath=join(EVIDENCE,binding.candidateManifest),manifest=await json(manifestPath);
  assert.equal(manifest.engine,'0.5.0');assert.equal(manifest.sdk,'0.2.0');
  assert.ok(manifest.files&&Object.keys(manifest.files).length>0);
  for(const [path,expected] of Object.entries(manifest.files)){
    assert.ok((path.startsWith('assets/')||path.startsWith('scripts/')||['package.json','pnpm-lock.yaml','forge.json'].includes(path))&&!path.split('/').includes('..'));
    assert.equal(hash(await readFile(join(GAME,path))),expected,`Frozen candidate changed: ${path}`);
  }
  assert.equal((await json(join(GAME,'node_modules/@forgeax/engine/package.json'))).version,'0.5.0');
  assert.equal((await json(join(GAME,'node_modules/zaohua-platform-sdk/package.json'))).version,'0.2.0');
  assert.ok(Number.isFinite(binding.budgetsMs?.[probe])&&binding.budgetsMs[probe]>0,'root must explicitly bind a positive probe budget');
  return {probe,budgetMs:binding.budgetsMs[probe],candidateCommit:manifest.commit??null,
    candidateManifest:binding.candidateManifest,candidateManifestSha256:hash(await readFile(manifestPath))};
}

export const photoFacts=p=>({id:p.id,sequence:p.sequence,area:p.area,original:p.original,scene:p.scene,matchedCards:p.matchedCards,
  thumbnailSha256:hash(p.thumbnail??'')});
const facts=s=>({screen:s.state.runtime.screen,controller:s.controller,clock:s.state.durable.clock,
  playSeconds:s.state.durable.playSeconds,weather:s.state.durable.weather,weatherCycle:s.state.durable.weatherCycle,
  environment:s.environment,world:s.world,photos:s.state.durable.totalPhotos,film:s.state.durable.film.map(photoFacts),
  checkIns:s.state.durable.checkIns?.map(entry=>({...entry,photo:photoFacts(entry.photo)})),trackedPhotoSpot:s.state.durable.trackedPhotoSpot,
  pendingCapture:s.pendingCapture,pauseReasons:s.state.runtime.pauseReasons,focus:s.frontend?.focus,
  inputDiagnostics:s.inputDiagnostics??null});

export async function createProbe(play,plan,binding){
  const started=Date.now(),runId=new Date().toISOString().replace(/[:.]/g,'-');
  const out=join(EVIDENCE,'owner',`${plan.id}-${runId}`);await mkdir(out,{recursive:true});
  const report={plan,binding,startedAt:new Date().toISOString(),status:'running',observations:[],photos:[],
    notCovered:['independent blind play, visual beauty approval, audio listening and public release',
      'old A-01 RMB unintended exposure root cause; a later success alone does not close the old failure']};
  let last;
  const budget=()=>{assert.ok(!play.signal.aborted,'owner aborted');assert.ok(Date.now()-started<binding.budgetMs,'probe real-time budget exceeded');};
  const read=async()=>{budget();last=await play.state('shan.journey');return last;};
  const wait=async(predicate,timeoutMs=7000)=>{budget();last=await play.waitFor(s=>{last=s;return predicate(s);},{read:'shan.journey',timeoutMs:Math.max(1,Math.min(timeoutMs,binding.budgetMs-(Date.now()-started)))});return last;};
  const settle=async()=>{budget();await play.wait(80);};
  const key=async code=>{budget();await play.keyboard.press(code);await settle();};
  const tabs=async count=>{for(let i=0;i<count;i++)await key('Tab');};
  const click=async(x,y)=>{budget();await play.mouse.click([x/1920,y/1080]);await settle();};
  const step=(name,fn)=>play.step(name,async()=>{budget();return fn();});
  const record=(name,s)=>{const observation={name,elapsedMs:Date.now()-started,...facts(s)};report.observations.push(observation);return observation;};
  const shot=async name=>{const s=await read(),capture=await play.screenshot(name),file=join(out,`${name}.png`);await copyFile(capture.path,file);
    record(name,s).screenshot={file,ownerFile:capture.path,rendered:capture.rendered,digest:capture.digest};
    assert.equal(capture.rendered,true,'owner detected a uniform or erroneous image');return s;};
  const noExposure=(s,total)=>{last=s;assert.equal(s.state.durable.totalPhotos,total,'unexpected photograph: stop without discarding or waiting it away');
    assert.equal(s.pendingCapture,null,'unexpected pending capture: preserve and stop');};
  const finish=async error=>{report.status=error?'failed':'functional-checks-passed-visual-review-pending';
    if(error){report.error=String(error);if(last)record('last-observed-before-failure',last);}
    report.realElapsedMs=Date.now()-started;report.finishedAt=new Date().toISOString();
    await writeFile(join(out,'acceptance.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    console.log(JSON.stringify({name:'clock-probe-result',status:report.status,elapsedMs:report.realElapsedMs,output:out,error:report.error}));};
  return {read,wait,key,tabs,click,settle,step,record,shot,noExposure,finish,report,out};
}
