// Independent input-provenance log around an unchanged official owner test.
// No game commands, synthetic events, extra waits, retries or acceptance changes.
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {photoFacts} from './jury-p0-input.mjs';

const QA=fileURLToPath(new URL('../../../production/iteration-jury-remediation-20261116/qa/',import.meta.url));
const rawKey='__shanyeQaReadOnlyPointerAudit';
export function withPassivePointerAudit(run,binding,options={}){
  return async play=>{
    const auditId=options.id??'gate1-east';
    const out=join(QA,'owner',`${auditId}-input-audit-${new Date().toISOString().replace(/[:.]/g,'-')}`);
    await mkdir(out,{recursive:true});
    const audit={binding,startedAt:new Date().toISOString(),scope:options.scope??'passive input provenance around unchanged Gate-1 east',
      calls:[],nativeMouseCalls:[],rawEvents:[],rawEpochs:[],gameSamples:[],diagnosticErrors:[]};
    let sequence=0,epoch=0,installed=false,originalError,lastGameSignature;
    const restores=[];
    // Predicate-based ordinary key holds contain a function. Describe it in
    // the log while passing the original arguments unchanged to the helper.
    const logArg=value=>typeof value==='function'?{kind:'function',name:value.name||'anonymous-predicate'}:
      Array.isArray(value)?value.map(logArg):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,logArg(v)])):value;
    const trace=(owner,name,fn,records,drainAfterRelease=false)=>async(...args)=>{
      const entry={sequence:++sequence,name,args:logArg(args),startedAtMs:Date.now()};records.push(entry);
      try{return await Reflect.apply(fn,owner,args);}catch(e){entry.error=String(e);throw e;}finally{
        entry.finishedAtMs=Date.now();
        if(drainAfterRelease)await drainRaw().catch(e=>audit.diagnosticErrors.push(`after ${name}: ${String(e)}`));
      }
    };
    const observed={...play,mouse:{},keyboard:{}};
    // Drain only after the official helper has released its mouse button. This
    // preserves the actual drag, with no extra evaluation while a button is held.
    for(const name of ['move','drag','click'])observed.mouse[name]=trace(play.mouse,`play.mouse.${name}`,play.mouse[name],audit.calls,name!=='move');
    for(const name of ['press','hold'])observed.keyboard[name]=trace(play.keyboard,`play.keyboard.${name}`,play.keyboard[name],audit.calls);
    for(const name of ['move','down','up','click']){
      const original=play.page.mouse[name];play.page.mouse[name]=trace(play.page.mouse,`page.mouse.${name}`,original,audit.nativeMouseCalls);
      restores.push(()=>{play.page.mouse[name]=original;});
    }
    function recordGame(s,source){
      if(!s?.state?.durable||!s.controller)return;
      const signature=JSON.stringify([s.state.durable.totalPhotos,s.pendingCapture,s.inputDiagnostics?.shutters?.at(-1)?.sequence]);
      if(signature===lastGameSignature)return;lastGameSignature=signature;
      audit.gameSamples.push({source,atMs:Date.now(),totalPhotos:s.state.durable.totalPhotos,pendingCapture:s.pendingCapture,
        camera:s.controller.camera,inputDiagnostics:s.inputDiagnostics,focus:s.frontend?.focus});
    }
    // Reuse results of existing official reads. No extra polling between inputs.
    observed.state=async(...args)=>{const s=await play.state(...args);recordGame(s,'state');return s;};
    observed.waitFor=async(...args)=>{const s=await play.waitFor(...args);recordGame(s,'waitFor');return s;};
    async function installRaw(){
      epoch++;
      await play.page.evaluate(({key,epoch})=>{
        if(Object.hasOwn(globalThis,key))throw new Error('pointer audit already installed');
        const events=[],limit=20000;let dropped=0,sequence=0;
        const kinds=['pointerdown','pointerup','pointermove','pointercancel','mousedown','mouseup','mousemove','click','contextmenu'];
        const listener=event=>{
          const value={epoch,sequence:++sequence,atMs:Date.now(),eventTimestamp:event.timeStamp,performanceNow:performance.now(),
            type:event.type,isTrusted:event.isTrusted,button:event.button,buttons:event.buttons,
            pointerId:event.pointerId,pointerType:event.pointerType,clientX:event.clientX,clientY:event.clientY,
            movementX:event.movementX,movementY:event.movementY,targetTag:event.target?.tagName??null,
            targetIsGameCanvas:event.target instanceof HTMLCanvasElement};
          if(events.length===limit){events.shift();dropped++;}events.push(value);
        };
        for(const kind of kinds)globalThis.addEventListener(kind,listener,{capture:true,passive:true});
        Object.defineProperty(globalThis,key,{configurable:true,value:{
          drain:()=>({events:events.splice(0),dropped,epoch}),
          dispose:()=>{for(const kind of kinds)globalThis.removeEventListener(kind,listener,{capture:true});delete globalThis[key];},
        }});
      },{key:rawKey,epoch});installed=true;
    }
    async function drainRaw(){
      if(!installed)return;
      const data=await play.page.evaluate(key=>globalThis[key].drain(),rawKey);
      audit.rawEvents.push(...data.events);audit.rawEpochs.push({epoch:data.epoch,readAtMs:Date.now(),events:data.events.length,dropped:data.dropped});
    }
    // A normal reload destroys listeners; archive before it, reinstall afterwards.
    // The original reload and every subsequent game operation remain unchanged.
    observed.reload=async(...args)=>{
      await drainRaw();installed=false;
      const result=await play.reload(...args);await installRaw();return result;
    };
    try{
      await installRaw();const result=await run(observed);audit.originalTest='returned-success';return result;
    }catch(e){originalError=e;audit.originalTest='failed';audit.originalError=String(e);throw e;}
    finally{
      await drainRaw().catch(e=>audit.diagnosticErrors.push(`drain: ${String(e)}`));
      await play.state('shan.journey').then(s=>{audit.finalGame={atMs:Date.now(),totalPhotos:s.state.durable.totalPhotos,
        film:s.state.durable.film.map(photoFacts),pendingCapture:s.pendingCapture,controller:s.controller,
        inputDiagnostics:s.inputDiagnostics,focus:s.frontend?.focus};}).catch(e=>audit.diagnosticErrors.push(`final journey: ${String(e)}`));
      await play.state('shan.capture').then(s=>{audit.finalCapture=s;}).catch(e=>audit.diagnosticErrors.push(`final capture: ${String(e)}`));
      if(installed)await play.page.evaluate(key=>globalThis[key]?.dispose(),rawKey).catch(e=>audit.diagnosticErrors.push(`dispose: ${String(e)}`));
      for(const restore of restores)restore();
      audit.finishedAt=new Date().toISOString();audit.rawDropped=audit.rawEpochs.reduce((n,e)=>n+e.dropped,0);
      audit.disposition=originalError?'original failure preserved; no recovery or retry':'original assertions passed; prior unexplained failure is not erased';
      await writeFile(join(out,'input-audit.json'),JSON.stringify(audit,null,2)+'\n',{flag:'wx'});
      console.log(JSON.stringify({name:`${auditId}-passive-input-audit`,candidate:binding.candidate,output:out,
        originalTest:audit.originalTest,rawEvents:audit.rawEvents.length,rawDropped:audit.rawDropped,diagnosticErrors:audit.diagnosticErrors}));
    }
  };
}
