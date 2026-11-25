// New-iteration normal-input QA only. No game commands, DOM/eval or saved-state writes.
// The pure source geometry below is an offline measurement oracle, never a runtime setter.
import assert from 'node:assert/strict';
import {copyFile,mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {terrainHeight} from '../../assets/shanye-world/world-layout.ts';

const GAME=fileURLToPath(new URL('../../',import.meta.url));
const EVIDENCE=fileURLToPath(new URL('../../../production/iteration-jury-remediation-20261116/qa/',import.meta.url));
export const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=async file=>JSON.parse(await readFile(file,'utf8'));
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const wrap=n=>((n+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI;
const distance=(p,t)=>Math.hypot(p[0]-t[0],p[2]-t[1]);
export const walking=s=>s.state.runtime.screen==='play'&&s.controller.mode==='walk'&&!s.controller.paused
  &&s.state.runtime.pauseReasons.length===0&&s.frontend?.focus?.target==='canvas';
export const cameraActive=s=>s.state.runtime.screen==='photo'&&s.controller.mode==='photo'&&!s.controller.paused
  &&s.state.runtime.pauseReasons.length===0&&s.frontend?.focus?.target==='canvas'&&!s.pendingCapture&&!s.state.durable.pendingPhoto;
export const photoFacts=p=>p?{id:p.id,sequence:p.sequence,area:p.area,pose:p.pose,original:p.original,scene:p.scene,
  matchedCards:p.matchedCards,replyCandidates:p.replyCandidates,thumbnailSha256:sha(p.thumbnail??'')}:null;
export function progressFacts(s){
  const d=s.state.durable;return {clock:d.clock,weather:d.weather,weatherCycle:d.weatherCycle,playSeconds:d.playSeconds,
    stamps:d.stamps,gateOpened:d.gateOpened,replyPhotos:Object.fromEntries(Object.entries(d.replyPhotos??{}).map(([k,r])=>[k,r?{...r,photo:photoFacts(r.photo)}:null])),
    endingPhoto:photoFacts(d.endingPhoto),endingNote:d.endingNote,mailed:d.mailed,endingSeen:d.endingSeen,mailedFrom:d.mailedFrom,
    totalPhotos:d.totalPhotos,film:d.film.map(photoFacts),checkIns:d.checkIns.map(c=>({...c,photo:photoFacts(c.photo)}))};
}

export async function loadJuryBinding(probe){
  const b=await json(join(EVIDENCE,'QA-OWNER-BINDING.json'));assert.equal(b.runnable,true,'Jury P0 QA disabled until root freezes source and runtime conditions');
  assert.ok(b.enabledProbes.includes(probe),`${probe} is not enabled`);assert.match(b.candidateManifest,/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.json$/);
  const manifestBytes=await readFile(join(EVIDENCE,b.candidateManifest)),manifest=JSON.parse(manifestBytes);
  assert.equal(manifest.engine,'0.5.0');assert.equal(manifest.sdk,'0.2.0');assert.ok(Object.keys(manifest.files??{}).length>0);
  for(const [file,hash]of Object.entries(manifest.files)){
    assert.ok((file.startsWith('assets/')||file.startsWith('scripts/')||['package.json','pnpm-lock.yaml','forge.json'].includes(file))&&!file.split('/').includes('..'));
    assert.equal(sha(await readFile(join(GAME,file))),hash,`Frozen candidate changed: ${file}`);
  }
  assert.equal((await json(join(GAME,'node_modules/@forgeax/engine/package.json'))).version,'0.5.0');
  assert.equal((await json(join(GAME,'node_modules/zaohua-platform-sdk/package.json'))).version,'0.2.0');
  assert.ok(Number.isFinite(b.budgetsMs[probe])&&b.budgetsMs[probe]>0);
  return {probe,budgetMs:b.budgetsMs[probe],segmentBudgetsMs:b.segmentBudgetsMs??{},candidate:manifest.commit,manifestSha256:sha(manifestBytes)};
}

export function jpegSize(bytes){
  assert.equal(bytes.readUInt16BE(0),0xffd8);let at=2;
  while(at<bytes.length-9){
    while(bytes[at]===0xff)at++;const marker=bytes[at++];if(marker===0xd9||marker===0xda)break;
    if(marker===0x01||marker>=0xd0&&marker<=0xd7)continue;
    const length=bytes.readUInt16BE(at);assert.ok(length>=2&&at+length<=bytes.length);
    if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker))return{width:bytes.readUInt16BE(at+5),height:bytes.readUInt16BE(at+3)};
    at+=length;
  }assert.fail('Actual JPEG has no SOF dimensions');
}

export async function createJuryHarness(play,plan,binding){
  const began=Date.now(),out=join(EVIDENCE,'owner',`${plan.id}-${new Date().toISOString().replace(/[:.]/g,'-')}`);await mkdir(out,{recursive:true});
  let last,expectedPhotos=0,captureAllowance=false,segment;
  const report={plan,binding,startedAt:new Date().toISOString(),status:'running',segments:[],observations:[],photos:[],downloads:[],
    safetySamples:[],frameSamples:[],notCovered:['15-minute independent blind play','human visual/audio approval','public platform submission','portrait/three-weather/eight-direction matrices','historical fall exact coordinates are unknown; finite route samples cannot cover every point']};
  const remaining=()=>Math.min(binding.budgetMs-(Date.now()-began),segment?segment.budgetMs-(Date.now()-segment.began):Infinity);
  const budget=()=>{assert.ok(!play.signal.aborted,'owner aborted');assert.ok(remaining()>0,'jury P0 probe cumulative/segment budget exhausted');};
  const guard=s=>{last=s;
    // Ordinary reload briefly publishes an unrestored empty bootstrap state.
    // Do not mistake it for erased photos; every restored state remains strict.
    if(!s.restored)return s;
    const c=s.controller,p=c.position,ground=terrainHeight(p[0],p[2]);
    const bodyDistance=Math.hypot(c.camera.position[0]-p[0],c.camera.position[1]-p[1]-1.38,c.camera.position[2]-p[2]);
    if(c.mode==='walk'&&!c.paused){
      report.safetySamples.push({atMs:Date.now(),position:p,camera:c.camera.position,ground,
        bodyDistance,avatarVisible:c.avatarVisible,grounded:c.grounded,verticalVelocity:c.verticalVelocity,recovery:s.lastRecovery?.sequence??0});
      assert.ok(p[1]>=ground-.13,`feet below the actual rendered ground: ${p} versus ${ground}`);
      assert.ok(bodyDistance>=1.8||!c.avatarVisible,'compressed camera still shows the hat/backpack');
      assert.equal(s.lastRecovery?.sequence??0,0,'route must not silently use manual/automatic recovery');
    }
    const total=s.state.durable.totalPhotos;
    if(captureAllowance)assert.ok(total===expectedPhotos||total===expectedPhotos+1,'one explicit shutter produced extra photographs');
    else{assert.equal(total,expectedPhotos,'unexpected photograph: preserve input provenance and stop');assert.equal(s.pendingCapture,null,'unexpected pending capture: do not wait it away');}
    return s;};
  const read=async()=>{budget();return guard(await play.state('shan.journey'));};
  const wait=async(predicate,timeoutMs=7000)=>{budget();return guard(await play.waitFor(s=>predicate(guard(s)),{read:'shan.journey',timeoutMs:Math.max(1,Math.min(timeoutMs,remaining()))}));};
  const settle=async()=>{budget();await play.wait(80);};
  const uiRead=async()=>{budget();const ui=await play.state('shan.capture');report.frameSamples.push({atMs:Date.now(),frameProgress:ui.frameProgress,lastCapture:ui.lastCapture,completedFrames:ui.completedFrames});return ui;};
  const key=async code=>{budget();await play.keyboard.press(code);await settle();};
  const tabs=async count=>{for(let i=0;i<count;i++)await key('Tab');};
  const click=async(x,y)=>{budget();await play.mouse.click([x/1920,y/1080]);await settle();};
  const record=(name,s)=>{const entry={name,elapsedMs:Date.now()-began,segment:segment?.name,progress:progressFacts(s),
    restored:s.restored,controller:s.controller,observation:s.state.runtime.observation,environment:s.environment,bridgeProgress:s.state.runtime.bridgeProgress,
    focus:s.frontend?.focus,pendingCapture:s.pendingCapture,inputDiagnostics:s.inputDiagnostics,cameraPropScale:s.cameraPropScale};report.observations.push(entry);return entry;};
  const shot=async name=>{const s=await read(),capture=await play.screenshot(name),file=join(out,`${name}.png`);await copyFile(capture.path,file);
    record(name,s).screenshot={file,ownerFile:capture.path,rendered:capture.rendered,digest:capture.digest};assert.equal(capture.rendered,true);return s;};
  const step=(name,fn)=>play.step(name,async()=>{budget();return fn();});
  async function runSegment(name,fn){
    const budgetMs=binding.segmentBudgetsMs[name];assert.ok(Number.isFinite(budgetMs)&&budgetMs>0&&budgetMs<=360000,'root must bind each story segment to at most six minutes');
    segment={name,budgetMs,began:Date.now()};const entry={name,budgetMs,startedAt:new Date().toISOString(),status:'running'};report.segments.push(entry);
    try{const result=await fn();budget();entry.status='functional-steps-passed';return result;}catch(error){entry.status='failed';entry.error=String(error);throw error;}
    finally{entry.realElapsedMs=Date.now()-segment.began;entry.finishedAt=new Date().toISOString();segment=undefined;}
  }
  async function turnTo(yaw,pitch=.13){
    for(let attempt=0;attempt<16;attempt++){
      const s=await read();assert.ok(walking(s)||cameraActive(s));const dx=wrap(yaw-s.controller.yaw),dy=pitch-s.controller.pitch;
      if(Math.abs(dx)<.012&&Math.abs(dy)<.012)return;
      const sensitivity=.0022*s.state.durable.settings.sensitivity,invert=s.state.durable.settings.invertY?-1:1;
      await play.mouse.move([.5,.5]);const before=await read();await wait(v=>(walking(v)||cameraActive(v))&&v.state.durable.playSeconds>before.state.durable.playSeconds,2000);
      await play.mouse.drag([.5,.5],[.5+clamp(dx/sensitivity,-230,230)/1920,.5+clamp(dy/(sensitivity*invert),-170,170)/1080],{button:'right'});await settle();
      const after=await read();assert.ok(Math.abs(wrap(after.controller.yaw-s.controller.yaw))+Math.abs(after.controller.pitch-s.controller.pitch)>.001,'ordinary RMB made no progress');
    }assert.fail('ordinary look did not converge');
  }
  async function walkTo(point,tolerance=1.1,run=false){
    let s=await read();assert.ok(walking(s));let blocked=0;const beganLeg=Date.now(),limit=16000+distance(s.controller.position,point)/3*1000;
    while(distance(s.controller.position,point)>tolerance){
      assert.ok(Date.now()-beganLeg<limit,'ordinary route timed out; no teleport fallback');const p=s.controller.position;
      await turnTo(Math.atan2(point[0]-p[0],-(point[1]-p[2])));const before=await read();
      await play.keyboard.hold(run?['KeyW','ShiftLeft']:'KeyW',clamp((distance(before.controller.position,point)-tolerance*.55)/(run?11:6.8)*1000,40,300));
      await settle();s=await read();assert.ok(walking(s));
      blocked=distance(s.controller.position,[before.controller.position[0],before.controller.position[2]])<.045?blocked+1:0;
      if(blocked>=3){await shot('FAIL-normal-movement-blocked');assert.fail(`ordinary movement blocked toward ${point}`);}
    }return s;
  }
  const route=async(points,tolerance=1.1,run=false)=>{for(const point of points)await walkTo(point,tolerance,run);};
  const lowerCamera=async()=>{await wait(cameraActive);await key('KeyC');return wait(walking);};
  async function cameraAt(view,name){
    if(cameraActive(await read()))await lowerCamera();await walkTo(view.feet,.15);await key('KeyC');await wait(cameraActive);
    const p=(await read()).controller.camera.position,t=view.target;
    await turnTo(Math.atan2(t[0]-p[0],-(t[2]-p[2])),-Math.atan2(t[1]-p[1],Math.hypot(t[0]-p[0],t[2]-p[2])));return shot(`${name}-actual-composition`);
  }
  async function photograph(name,{matchedCard,courtyard=false,screenshot=true}={}){
    await wait(cameraActive);captureAllowance=true;
    const previousCapture=(await uiRead()).lastCapture?.requestId;await key('Space');const captureStarted=Date.now();let saved,renderProof;
    while(Date.now()-captureStarted<12000){
      const s=await read(),ui=await uiRead();
      if(cameraActive(s)&&s.state.durable.totalPhotos===expectedPhotos+1){saved=s;renderProof=ui.lastCapture;break;}
      assert.ok(!String(s.state.runtime.notice??'').includes('照片没有保存'),'shutter explicitly failed; no silent retry');
      await play.wait(250);
    }
    assert.ok(saved,'one ordinary shutter did not produce a saved photo within 12 seconds');
    assert.ok(renderProof?.requestId&&renderProof.requestId!==previousCapture,'saved photograph needs its own native capture receipt');
    assert.equal(renderProof.phase,'captured');assert.equal(renderProof.completed?.presentation,'ready');
    assert.ok(renderProof.completed.frameId>renderProof.fence?.frameId,'captured frame must cross the shutter source-frame fence');
    assert.equal(renderProof.completed.worldIdentity,renderProof.fence.worldIdentity);
    assert.equal(renderProof.completed.deviceGeneration,renderProof.fence.deviceGeneration);
    expectedPhotos++;captureAllowance=false;const photo=saved.state.durable.film.at(-1);
    assert.ok(photo?.original&&photo.scene?.clock&&photo.thumbnail?.startsWith('data:image/jpeg;'));
    assert.equal(photo.original.mime,'image/jpeg');assert.deepEqual([photo.original.width,photo.original.height],[1920,1080]);assert.ok(photo.original.bytes>10000);
    if(matchedCard)assert.ok(photo.matchedCards.includes(matchedCard),`real photograph did not match ${matchedCard}`);
    if(courtyard)assert.ok(photo.replyCandidates?.some(c=>c.letter==='town'&&c.variant==='courtyard'&&c.ruleVersion===1),'real photograph did not match courtyard subjects');
    report.photos.push({name,elapsedMs:Date.now()-captureStarted,renderProof,...photoFacts(photo)});if(screenshot)await shot(name);return structuredClone(photo);
  }
  async function download(name,activate,dimensions,{photoId,bytes:expectedBytes}={}){
    const pending=play.page.waitForEvent('download',{timeout:12000});const [,value]=await Promise.all([activate(),pending]);
    const file=join(out,`${name}.jpg`);await value.saveAs(file);assert.equal(await value.failure(),null);
    const bytes=await readFile(file),size=jpegSize(bytes);assert.deepEqual([size.width,size.height],dimensions);if(expectedBytes!==undefined)assert.equal(bytes.length,expectedBytes);
    const receipt={name,photoId,file,...size,bytes:bytes.length,sha256:sha(bytes)};report.downloads.push(receipt);return receipt;
  }
  async function startFresh(){const menu=await wait(s=>s.restored&&s.state.runtime.screen==='menu');assert.equal(menu.state.durable.started,false,'existing journeys must not be erased');await key('Tab');await key('Enter');return wait(walking);}
  async function finish(error){report.status=error?'failed':report.frameRateCondition?.reducedRateObserved===false?'functional-checks-passed-reduced-frame-rate-condition-unverified':'functional-checks-passed-visual-review-pending';if(error){report.error=String(error);if(last)record('last-observed-failure',last);}
    report.realElapsedMs=Date.now()-began;report.finishedAt=new Date().toISOString();await writeFile(join(out,'acceptance.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    console.log(JSON.stringify({name:'jury-p0-result',status:report.status,elapsedMs:report.realElapsedMs,output:out,error:report.error}));}
  return {read,uiRead,wait,key,tabs,click,settle,record,shot,step,runSegment,turnTo,walkTo,route,lowerCamera,cameraAt,photograph,download,startFresh,finish,report,out};
}
