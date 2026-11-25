// P0-C additive QA only. Source preflight is filesystem read-only; runtime
// observations and input delegate exclusively to the ordinary owner harness.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {createP0Harness,cameraActive} from './p0-normal-input.mjs';
import {P0_C_LANDMARKS} from './p0-c-route-plan.mjs';

const ROOT=fileURLToPath(new URL('../../../',import.meta.url));
const GAME=fileURLToPath(new URL('../../',import.meta.url));
const EVIDENCE=join(ROOT,'production/sprint-p0-20261116');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=async path=>JSON.parse(await readFile(path,'utf8'));
const receiptFile=name=>{assert.match(name,/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.json$/);return join(EVIDENCE,name);};
const dir=id=>id.replace(/-(front|back)$/,'');

/** Called at module import by A/B: an unbound run fails before CLI opens GPU. */
export async function loadP0CPreflight(segment){
  const binding=await json(join(EVIDENCE,'P0-C-OWNER-BINDING.json'));
  assert.equal(binding.runnable,true,'P0-C is not runnable: waiting for final forest ring/source freeze receipt and root candidate binding');
  assert.ok(binding.approvedSegments?.includes(segment),`P0-C segment ${segment} is not enabled`);
  const manifest=await json(receiptFile(binding.candidateManifest));
  assert.equal(manifest.engine,'0.5.0');assert.equal(manifest.sdk,'0.2.0');
  assert.ok(manifest.files&&Object.keys(manifest.files).length>0,'frozen candidate must enumerate source SHA256');
  for(const [path,expected] of Object.entries(manifest.files)){
    assert.ok((path.startsWith('assets/')||path.startsWith('scripts/')||['package.json','pnpm-lock.yaml','forge.json'].includes(path))
      &&!path.split('/').includes('..'),`unexpected candidate source path ${path}`);
    assert.equal(hash(await readFile(join(GAME,path))),expected,`candidate source changed: ${path}`);
  }
  const engine=await json(join(GAME,'node_modules/@forgeax/engine/package.json'));
  const sdk=await json(join(GAME,'node_modules/zaohua-platform-sdk/package.json'));
  assert.equal(engine.version,'0.5.0');assert.equal(sdk.version,'0.2.0');
  const receipt=await json(receiptFile(binding.reachabilityReceipt));
  assert.equal(receipt.sourceUnchangedDuringRun,true,'route receipt must preserve the same source before/after controller simulation');
  const requiredSources=['world-layout.ts','scene-details.ts','road-safety.ts','travel-controller.ts','hero-mountain.ts','windmill-profile.ts'];
  for(const suffix of requiredSources)assert.ok(receipt.source?.some(s=>s.path.endsWith(`/${suffix}`)),`route receipt must pin ${suffix}`);
  for(const source of receipt.source){
    assert.ok(source.path.startsWith('game/assets/')&&!source.path.split('/').includes('..'));
    assert.equal(hash(await readFile(join(ROOT,source.path))),source.sha256,`controller receipt source changed: ${source.path}`);
  }
  for(const landmark of Object.values(P0_C_LANDMARKS)){
    const proof=receipt.results?.find(r=>r.id===landmark.id);
    assert.ok(proof?.continuousRingComplete,`${landmark.id}: final continuous exterior ring not proved`);
    assert.equal(proof.stations.length,8);
    assert.equal(proof.returnToFirst?.result,'controller-pass',`${landmark.id}: normal return to first point was not proved`);
    assert.deepEqual(proof.returnToFirst.target,landmark.returnToFirst.at(-1));
    for(const site of landmark.stations){
      const passed=proof.stations.find(s=>dir(s.direction)===site.direction);
      assert.equal(passed?.result,'controller-pass',`${landmark.id}/${site.direction}: not controller-passed`);
      assert.deepEqual(passed.xz,site.feet,`${landmark.id}/${site.direction}: route point differs from frozen receipt`);
      assert.deepEqual(passed.via??[],site.via,`${landmark.id}/${site.direction}: normal connection differs from frozen receipt`);
    }
  }
  assert.equal(binding.ridgeViewReceipt,'P0-C-RIDGE-VIEW-RAY-RECEIPT.json');
  // This earlier bounded ray diagnostic selected the candidate, not the final
  // visual verdict. Preserve any source drift explicitly; do not call it a
  // current-source ray PASS after unrelated forest / town-source work.
  const ridgeFile=receiptFile(binding.ridgeViewReceipt),ridge=await json(ridgeFile);
  const selected=ridge.candidates?.find(c=>c.id==='ridge-postal-road-distant-view');
  assert.equal(selected?.result,'controller-pass');assert.deepEqual(selected.requestedXZ,[64,204]);
  const historicalSourceDifferences=[];
  for(const source of ridge.source){
    assert.ok(source.path.startsWith('game/assets/')&&!source.path.split('/').includes('..'));
    const current=hash(await readFile(join(ROOT,source.path)));
    if(current!==source.sha256)historicalSourceDifferences.push({path:source.path,diagnosticSha256:source.sha256,currentSha256:current});
  }
  return {binding,manifestFile:binding.candidateManifest,manifestSha256:hash(await readFile(receiptFile(binding.candidateManifest))),
    candidateCommit:manifest.commit??null,routeReceipt:binding.reachabilityReceipt,
    routeReceiptSha256:hash(await readFile(receiptFile(binding.reachabilityReceipt))),ridgeViewReceipt:binding.ridgeViewReceipt,
    ridgeViewReceiptSha256:hash(await readFile(ridgeFile)),historicalSourceDifferences,
    ridgeReceiptScope:'Earlier source-bound geometric selection only; final images must be checked, not a current-source ray or beauty PASS'};
}

export const forestReady=s=>s.state.durable.stamps.forest&&s.world.windmillTurning&&s.world.curtainOpen&&s.world.ziplineAvailable;
export const townReady=s=>s.state.durable.stamps.town&&s.world.gateOpen&&s.world.bridgeProgress===1
  &&s.world.bridgeWalkable&&s.world.townLights&&s.world.courtyardOpen;
const fixedWorld=s=>({gateOpen:s.world.gateOpen,bridgeProgress:s.world.bridgeProgress,bridgeWalkable:s.world.bridgeWalkable,
  townLights:s.world.townLights,courtyardOpen:s.world.courtyardOpen,windmillTurning:s.world.windmillTurning,
  curtainOpen:s.world.curtainOpen,ziplineAvailable:s.world.ziplineAvailable,sunset:s.world.sunset,
  valleyLetterOpened:s.world.valleyLetterOpened});
function defaultPhotography(s){
  for(const settings of [s.state.durable.photography,s.controller.photography.settings]){
    assert.equal(settings.mode,'landscape');assert.equal(settings.lens,'wide');assert.equal(settings.exposure,0);
  }
  assert.ok(Math.abs(s.controller.camera.verticalFovRadians-Math.PI/3)<1e-5,'ordinary wide lens should remain 60 degrees');
}

export async function createP0C(play,plan,preflight){
  const h=await createP0Harness(play,plan);h.report.sourceBinding=preflight;
  h.report.exteriorSamples=[];h.report.setupPhotos=[];h.report.weatherComparisons=[];
  h.report.notCovered.push('288 weather/offset matrix; original platform [0,235] hero viewpoint remains visually failed',
    'windmill rotation remains a natural live animation; fixed-world means stable unlocked flags, not identical animation phase');
  async function setupCard(card,view,ready){
    await h.walkTo(view.feet,.15);
    await h.cameraAt(view,`${card}-ordinary-setup`);
    const photo=await h.photograph(`${card}-setup-excluded-from-weather-comparison`,{matchedCard:card});
    const settled=await h.wait(ready,10000);
    h.report.setupPhotos.push({photoId:photo.id,card,excludedFromWeatherComparisons:true,worldAfter:fixedWorld(settled)});
    await h.shot(`${card}-unlocked-world-before-weather-comparison`);
  }
  async function weatherOriginals(label,view,ready){
    await h.cameraAt(view,`${label}-fixed-view`);const frozen=fixedWorld(await h.read());let camera;
    for(const weather of ['morning','rain','afterglow']){
      await h.weather(weather);const before=await h.read();assert.ok(ready(before));
      assert.deepEqual(fixedWorld(before),frozen,'weather samples must retain completed world state');
      defaultPhotography(before);
      const photo=await h.photograph(`${label}-${weather}`);const after=await h.read();
      assert.deepEqual(fixedWorld(after),frozen,'weather exposure must not be the first unlock photograph');
      const actual={position:photo.scene.camera.position,forward:photo.scene.camera.forward,lens:photo.scene.lens,exposure:photo.scene.exposure};
      if(camera){
        assert.equal(actual.lens,camera.lens);assert.equal(actual.exposure,camera.exposure);
        for(const key of ['position','forward'])actual[key].forEach((n,i)=>assert.ok(Math.abs(n-camera[key][i])<1e-4,`${label}: actual camera changed between weather samples`));
      }else camera=actual;
      const download=await h.exportLatest(photo,`${label}-${weather}`);
      h.report.weatherComparisons.push({name:label,weather,photoId:photo.id,worldBefore:frozen,worldAfter:fixedWorld(after),camera:actual,download});
    }
    const originals=h.report.downloads.filter(p=>p.name.startsWith(`${label}-`));
    assert.equal(originals.length,3);assert.equal(new Set(originals.map(p=>p.sha256)).size,3,'three real weather exports should produce different JPEG bytes');
    await h.lowerCamera();
  }
  async function exteriorRing(landmark){
    const starting=(await h.read()).state.durable.totalPhotos;
    const frozen=fixedWorld(await h.read());let previous;
    for(const site of landmark.stations){
      await h.route([...site.via,site.feet],`${landmark.id}-${site.direction}-ordinary-exterior-approach`,.35);
      await h.cameraAt({feet:site.feet,target:landmark.target},`${landmark.id}-${site.direction}-outside`);
      await h.weather('morning');const s=await h.wait(v=>cameraActive(v)&&v.controller.grounded);
      defaultPhotography(s);
      assert.deepEqual(fixedWorld(s),frozen,'circumference capture must retain completed world flags');
      assert.ok(Math.hypot(s.controller.position[0]-site.feet[0],s.controller.position[2]-site.feet[1])<=.5);
      if(previous)assert.ok(Math.hypot(s.controller.position[0]-previous[0],s.controller.position[2]-previous[2])>2,
        'different exterior direction requires physically different player position');
      const name=`exterior-${landmark.id}-${site.direction}-morning`;
      const captured=await h.shot(name),evidence=h.report.timeline.at(-1);
      h.report.exteriorSamples.push({landmark:landmark.id,direction:site.direction,plannedFeet:site.feet,
        actualFeet:captured.controller.position,actualCamera:captured.controller.camera,target:landmark.target,
        world:fixedWorld(captured),weather:captured.environment.weather,screenshot:evidence.screenshot,
        captureKind:'ordinary-photo-mode-compositor-PNG; no shutter or JPEG export',visualReview:'pending'});
      previous=captured.controller.position;await h.lowerCamera();
    }
    await h.route(landmark.returnToFirst,`${landmark.id}-normal-ring-closed`,.35);
    assert.equal((await h.read()).state.durable.totalPhotos,starting,'direction PNGs must not consume film or count as exported photographs');
    assert.equal(new Set(h.report.exteriorSamples.filter(s=>s.landmark===landmark.id).map(s=>s.direction)).size,8);
  }
  return {...h,setupCard,weatherOriginals,exteriorRing};
}
