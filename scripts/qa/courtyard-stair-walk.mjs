import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {writeFile} from 'node:fs/promises';
import {createLetterHarness,walking} from './letter-normal-input.mjs';
import {P0_ROUTE} from './p0-route-plan.mjs';

async function recordCanvas(page,destination,move){
 const canvas=page.locator('canvas').first();
 await canvas.evaluate(el=>{
  const stream=el.captureStream(30);
  const type=['video/mp4;codecs=avc1.42001E','video/webm;codecs=vp9'].find(t=>MediaRecorder.isTypeSupported(t));
  if(!type)throw Error('No recording format');
  const recorder=new MediaRecorder(stream,{mimeType:type,videoBitsPerSecond:16000000}),parts=[];
  const done=new Promise(resolve=>{recorder.ondataavailable=e=>{if(e.data.size)parts.push(e.data);};recorder.onstop=()=>resolve(new Blob(parts,{type}));});
  el.stairRecording={recorder,stream,done,type};recorder.start(250);
 });
 try {await move();}finally{
  const result=await canvas.evaluate(async el=>{
   const {recorder,stream,done,type}=el.stairRecording;
   recorder.stop();const blob=await done;for(const t of stream.getTracks())t.stop();delete el.stairRecording;
   const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';
   for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));
   return {base64:btoa(binary),ext:type.includes('mp4')?'mp4':'webm'};
  });
  await writeFile(destination+'.'+result.ext,Buffer.from(result.base64,'base64'));
 }
}

export async function walkStairFlight(h,play,name,yaw,test){
  const page=play.page;
  await h.turnTo(yaw,.18);await h.shot(name+'-start');await h.wait(walking);
  await recordCanvas(page,join(h.out,name),async()=>{
   await play.wait(1000);await page.keyboard.down('KeyW');
   try{await h.wait(s=>walking(s)&&test(s.controller.position[2]),22000);}finally{await page.keyboard.up('KeyW');}
   await play.wait(1000);
  });
  await h.shot(name+'-end');
 }

export default async function stairWalk(play){
 const root=fileURLToPath(new URL('../../../production/upper-valley/',import.meta.url));
 const h=await createLetterHarness(play,{id:'stairs',viewport:[1920,1080]},{budgetMs:275000},root),page=play.page,errors=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});

 let failure;
 try{
  await h.startFresh();await h.route(P0_ROUTE.town.slice(0,-1));await h.route(P0_ROUTE.lever,.35);await h.key('KeyE');
  await h.wait(s=>s.state.durable.gateOpened);await h.route([[148,-2],[155,-3]],.35);
  await h.cameraAt({feet:[155,-3],target:[155,29,10]},'town');await h.photograph('bridge',{matchedCard:'town'});await h.lowerCamera();
  await h.wait(s=>walking(s)&&s.state.runtime.bridgeProgress===1&&s.world.bridgeWalkable,12000);
  await h.route([[155,7],[155,20],[155,28],[155,37],[155.6,45],[155.95,50],[155.95,54.8],[156.45,56.2],[156.45,58.6],[158,61],[158,65.5]],.27);
  await walkStairFlight(h,play,'ascending',Math.PI,z=>z>=92.8);await walkStairFlight(h,play,'descending',0,z=>z<66.4);
  const bottom=await h.wait(walking);assert.ok(bottom.controller.position[1]<25&&Math.abs(bottom.controller.position[0]-158)<1.7);
  assert.deepEqual(errors,[]);
 }catch(e){failure=e;await h.shot('FAILED').catch(()=>{});throw e;}finally{h.report.browserErrors=errors;await h.finish(failure);}
}
