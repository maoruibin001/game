// Read-only, root-configured source binding for the current ordinary visual probes.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {photoFacts,sha} from './jury-p0-input.mjs';
const GAME=fileURLToPath(new URL('../../',import.meta.url));
const QA=fileURLToPath(new URL('../../../production/iteration-jury-remediation-20261116/qa/',import.meta.url));
export async function loadVisualCandidate(probe,bindingFile='VISUAL-CANDIDATE-BINDING.json'){
  assert.match(bindingFile,/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.json$/);
  const b=JSON.parse(await readFile(join(QA,bindingFile),'utf8'));
  assert.equal(b.runnable,true,'Visual probes disabled until root confirms a fixed candidate');
  assert.ok(b.enabledProbes?.includes(probe));assert.match(b.productCommit??'',/^[a-f0-9]{40}$/);
  assert.match(b.candidateManifest,/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.json$/);
  const bytes=await readFile(join(QA,b.candidateManifest)),manifest=JSON.parse(bytes);
  assert.equal(manifest.productCommit??manifest.commit,b.productCommit,'configured product SHA does not match the frozen manifest');
  assert.match(manifest.commit??'',/^[a-f0-9]{40}$/);assert.equal(manifest.engine,'0.5.0');assert.equal(manifest.sdk,'0.2.0');
  const required=['assets/shanye-world/world.pack.ts','assets/shanye-world/world-layout.ts','assets/shanye-world/courtyard.ts',
    'assets/shanye-world/scene-details.ts','assets/shanye-world/forest-composition.ts','assets/environment/weather.ts',
    'assets/controller/travel-controller.ts','assets/controller/forgeax-controller.ts','assets/journey/photography.ts',
    'assets/entry/engine.pack.ts','assets/entry/frontend.pack.ts','assets/entry/photo-capture.ts','assets/environment/runtime.ts',
    'scripts/qa/visual-candidate.mjs',`scripts/qa/${probe}.mjs`,'scripts/qa/jury-p0-input.mjs','scripts/qa/p0-route-plan.mjs',
    'package.json','pnpm-lock.yaml','forge.json'];
  for(const file of required)assert.match(manifest.files?.[file]??'',/^[a-f0-9]{64}$/,`candidate must bind ${file}`);
  for(const [file,hash]of Object.entries(manifest.files)){
    assert.ok((file.startsWith('assets/')||file.startsWith('scripts/')||['package.json','pnpm-lock.yaml','forge.json'].includes(file))&&!file.split('/').includes('..'));
    assert.equal(sha(await readFile(join(GAME,file))),hash,`frozen visual candidate changed: ${file}`);
  }
  for(const [file,version]of [['node_modules/@forgeax/engine/package.json','0.5.0'],['node_modules/zaohua-platform-sdk/package.json','0.2.0']])
    assert.equal(JSON.parse(await readFile(join(GAME,file))).version,version);
  const budgetMs=b.budgetsMs?.[probe];assert.ok(budgetMs>0&&budgetMs<=(probe==='visual-post-forest'?180000:240000));
  return{probe,budgetMs,candidate:manifest.commit,productCommit:b.productCommit,manifestSha256:sha(bytes),segmentBudgetsMs:{}};
}
export async function retainVisualFailure(play,h,cause){
  h.report.failureEvidence={cause:String(cause),at:new Date().toISOString(),disposition:'original failure retained; no count correction, retry or recovery'};
  try{
  const [journey,capture]=await Promise.allSettled([play.state('shan.journey'),play.state('shan.capture')]);
  if(journey.status==='fulfilled'){
    const s=journey.value;h.report.failureEvidence.journey={totalPhotos:s.state.durable.totalPhotos,film:s.state.durable.film.map(photoFacts),
      pendingCapture:s.pendingCapture,controller:s.controller,inputDiagnostics:s.inputDiagnostics,focus:s.frontend?.focus};
  }else h.report.failureEvidence.journeyReadError=String(journey.reason);
  if(capture.status==='fulfilled')h.report.failureEvidence.capture=capture.value;
  else h.report.failureEvidence.captureReadError=String(capture.reason);
  }catch(e){h.report.failureEvidence.evidenceReadError=String(e);}
}
