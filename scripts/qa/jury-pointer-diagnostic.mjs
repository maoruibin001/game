// Bounded input provenance diagnosis only. Ordinary input calls are forwarded unchanged.
// The browser listener records events; it never dispatches an event or calls the game.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {cameraActive,createJuryHarness,photoFacts,sha} from './jury-p0-input.mjs';

const GAME=fileURLToPath(new URL('../../',import.meta.url));
const QA=fileURLToPath(new URL('../../../production/iteration-jury-remediation-20261116/qa/',import.meta.url));
export async function diagnosticBinding(){
  const b=JSON.parse(await readFile(join(QA,'INPUT-DIAGNOSTIC-OWNER-BINDING.json'),'utf8'));
  assert.equal(b.runnable,true,'Pointer diagnostic disabled pending root review and fixed candidate');
  assert.equal(b.budgetMs,90000);assert.match(b.candidateManifest,/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.json$/);
  const bytes=await readFile(join(QA,b.candidateManifest)),manifest=JSON.parse(bytes);
  assert.equal(manifest.engine,'0.5.0');assert.equal(manifest.sdk,'0.2.0');assert.ok(Object.keys(manifest.files??{}).length);
  for(const [file,hash]of Object.entries(manifest.files)){
    assert.ok((file.startsWith('assets/')||file.startsWith('scripts/')||['package.json','pnpm-lock.yaml','forge.json'].includes(file))&&!file.split('/').includes('..'));
    assert.equal(sha(await readFile(join(GAME,file))),hash,`diagnostic candidate changed: ${file}`);
  }
  assert.equal(JSON.parse(await readFile(join(GAME,'node_modules/@forgeax/engine/package.json'))).version,'0.5.0');
  assert.equal(JSON.parse(await readFile(join(GAME,'node_modules/zaohua-platform-sdk/package.json'))).version,'0.2.0');
  return{probe:'jury-pointer-diagnostic',budgetMs:b.budgetMs,candidate:manifest.commit,manifestSha256:sha(bytes),segmentBudgetsMs:{}};
}

const rawKey='__shanyeQaReadOnlyPointerAudit';
export function createPointerDiagnostic(binding){
  return async play=>{
    const plan={id:'jury-pointer-diagnostic',revision:'pointer-provenance-01',viewport:[1920,1080],
      coverage:'postal normal camera: eight ordinary Space shutters, each followed by four ordinary small RMB drags; first anomaly stops; no replays'};
    const calls=[],nativeMouseCalls=[],restores=[];let h,error,listenerInstalled=false,callSequence=0;
    const trace=(owner,name,fn,records)=>async(...args)=>{
      const entry={sequence:++callSequence,name,args:structuredClone(args),startedAtMs:Date.now()};records.push(entry);
      try{return await Reflect.apply(fn,owner,args);}catch(e){entry.error=String(e);throw e;}finally{entry.finishedAtMs=Date.now();}
    };
    // Observe the exact official helper calls and their unmodified Playwright mouse calls.
    // Wrappers do not insert extra input, waits or browser evaluations inside a drag.
    const observed={...play,mouse:{},keyboard:{}};
    for(const name of ['move','drag','click'])observed.mouse[name]=trace(play.mouse,`play.mouse.${name}`,play.mouse[name],calls);
    for(const name of ['press','hold'])observed.keyboard[name]=trace(play.keyboard,`play.keyboard.${name}`,play.keyboard[name],calls);
    for(const name of ['move','down','up','click']){
      const original=play.page.mouse[name];play.page.mouse[name]=trace(play.page.mouse,`page.mouse.${name}`,original,nativeMouseCalls);
      restores.push(()=>{play.page.mouse[name]=original;});
    }
    async function drainRaw(){
      if(!listenerInstalled)return;
      const result=await play.page.evaluate(key=>globalThis[key].drain(),rawKey);
      h.report.inputAudit.rawEvents.push(...result.events);h.report.inputAudit.rawDropped=result.dropped;
    }
    async function observe(label){
      await drainRaw();const s=await h.read();
      h.report.inputAudit.gameSamples.push({label,atMs:Date.now(),expectedPhotos:h.report.photos.length,
        totalPhotos:s.state.durable.totalPhotos,pendingCapture:s.pendingCapture,controller:s.controller,inputDiagnostics:s.inputDiagnostics});
    }
    try{
      h=await createJuryHarness(observed,plan,binding);
      h.report.inputAudit={calls,nativeMouseCalls,rawEvents:[],rawDropped:0,gameSamples:[],scope:'read-only DOM input evidence; no synthetic events or game commands'};
      await play.page.evaluate(key=>{
        if(Object.hasOwn(globalThis,key))throw new Error('pointer diagnostic already installed');
        const events=[],limit=5000;let dropped=0,sequence=0;
        const kinds=['pointerdown','pointerup','pointermove','pointercancel','mousedown','mouseup','mousemove','click','contextmenu'];
        const listener=event=>{
          const value={sequence:++sequence,atMs:Date.now(),eventTimestamp:event.timeStamp,performanceNow:performance.now(),
            type:event.type,isTrusted:event.isTrusted,button:event.button,buttons:event.buttons,
            pointerId:event.pointerId,pointerType:event.pointerType,clientX:event.clientX,clientY:event.clientY,
            movementX:event.movementX,movementY:event.movementY,targetTag:event.target?.tagName??null,
            targetIsGameCanvas:event.target instanceof HTMLCanvasElement};
          if(events.length===limit){events.shift();dropped++;}events.push(value);
        };
        for(const kind of kinds)globalThis.addEventListener(kind,listener,{capture:true,passive:true});
        Object.defineProperty(globalThis,key,{configurable:true,value:{
          drain:()=>({events:events.splice(0),dropped}),
          dispose:()=>{for(const kind of kinds)globalThis.removeEventListener(kind,listener,{capture:true});delete globalThis[key];},
        }});
      },rawKey);listenerInstalled=true;
      await h.startFresh();assert.equal((await h.uiRead()).ready,true);
      await h.key('KeyC');await h.wait(cameraActive);await h.shot('postal-before-pointer-diagnosis');await observe('camera-open');
      for(let exposure=0;exposure<8;exposure++){
        await h.photograph(`postal-space-${exposure+1}`,{screenshot:false});await observe(`after-space-${exposure+1}`);
        for(let drag=0;drag<4;drag++){
          const s=await h.wait(cameraActive);
          await h.turnTo(s.controller.yaw+(drag%2===0?-.022:.022),s.controller.pitch);
          await observe(`space-${exposure+1}-after-rmb-${drag+1}`);
        }
      }
      assert.equal(h.report.photos.length,8);assert.equal(h.report.inputAudit.rawDropped,0);
      h.report.diagnosticDisposition='no anomaly observed within eight shutters and 32 small drags; prior failure remains unresolved';
    }catch(e){error=e;if(h)h.report.diagnosticDisposition='first anomaly preserved; no retry or count correction';throw e;}
    finally{
      // Final projections are read without the acceptance guard so an extra real photo
      // is retained as evidence, never adopted as an expected photograph.
      if(h){
        await drainRaw().catch(e=>{h.report.inputAudit.rawDrainError=String(e);});
        await play.state('shan.journey').then(s=>{h.report.inputAudit.finalGame={atMs:Date.now(),totalPhotos:s.state.durable.totalPhotos,
          film:s.state.durable.film.map(photoFacts),pendingCapture:s.pendingCapture,controller:s.controller,
          inputDiagnostics:s.inputDiagnostics,focus:s.frontend?.focus};}).catch(e=>{h.report.inputAudit.finalGameError=String(e);});
        await play.state('shan.capture').then(s=>{h.report.inputAudit.finalCapture=s;}).catch(e=>{h.report.inputAudit.finalCaptureError=String(e);});
      }
      if(listenerInstalled)await play.page.evaluate(key=>globalThis[key]?.dispose(),rawKey).catch(()=>{});
      for(const restore of restores)restore();
      if(h)await h.finish(error);
    }
  };
}

export default async function pointerDiagnostic(play){return createPointerDiagnostic(await diagnosticBinding())(play);}
