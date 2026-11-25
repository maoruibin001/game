// Isolated presentation contract and layout fixture. No game/GPU, storage, or reward mutation.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from '../../../node_modules/.pnpm/node_modules/esbuild/lib/main.js';
import { chromium } from '../../../node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs';
const game=fileURLToPath(new URL('../../../',import.meta.url));
const mailOnly=process.argv.includes('--mail-confirmation');
const out=new URL(`../../../../production/iteration-letter-courtyard-20261116/${mailOnly?'mail-confirmation-component':'reply-ui-component'}/`,import.meta.url);
await mkdir(out,{recursive:true});
const archived=await readFile(new URL('../../../../production/iteration-clock-outings-20261116/owner/clock-outings-probe-2026-11-16T10-00-48-629Z/checkin-before-reload.jpg',import.meta.url));
const image='data:image/jpeg;base64,'+archived.toString('base64');
const built=await build({stdin:{resolveDir:game,loader:'ts',contents:`
import {createPresentation} from './assets/presentation/presentation.ts';
import {initialPresentationView} from './assets/presentation/types.ts';
import {REPLY_LETTERS,FINAL_REPLY} from './assets/journey/content.ts';
import {DEFAULT_PHOTOGRAPHY} from './assets/shared/photography-contract.ts';
const img=${JSON.stringify(image)};
const photo=(id,title,noteOptions)=>({id,title,location:'组件场景 · 复用既有实拍',imageUrl:img,originalKey:'fixture:'+id,width:1920,height:1080,originalState:'ready',sceneDescription:'第 1 天 15:30 · 晴朗',noteOptions});
const forest=photo('forest-1','林间风铃与风车',['这是我今天见到的样子','今天的叶片很清楚']);
const town=photo('town-1','石拱里的山',['这是我今天见到的样子']);
const rain=photo('forest-rain','细雨里的风车',['这是我今天见到的样子','今天的风车藏在细雨里']);
const courtyard=photo('town-courtyard','听雨钟院',['这是我今天见到的样子']);
let view={...initialPresentationView(),screen:'play',film:[forest,town],saveStatus:'saved',
 weather:{id:'morning',label:'晴朗',options:[{id:'morning',label:'晴朗'}]},
 camera:{active:false,alignment:1,ready:true,photography:DEFAULT_PHOTOGRAPHY},
 replies:{items:['forest','town'].map(id=>({id,...REPLY_LETTERS[id],response:undefined,status:'choose',note:'',candidates:[id==='forest'?forest:town]})),final:{...FINAL_REPLY,ready:false,photo:undefined,note:'',response:''}}};
const actions=[];const render=patch=>{view={...view,...patch};ui.render(view)};
const ui=createPresentation(document.querySelector('#ui'),{onAction(action,payload){actions.push({action,payload});if(action==='open-journal'||action==='open-replies'||action==='open-film')render({screen:'journal'});if(action==='close-panel')render({screen:'play'});}});
render({});
window.fixture={actions,render,get view(){return view},
 acknowledge(){const last=actions.at(-1);if(last.action==='select-reply-photo'){const {letterId,photoId,note}=last.payload;const items=view.replies.items.map(letter=>letter.id===letterId?{...letter,status:'answered',photo:[...letter.candidates,letter.photo].find(photo=>photo?.id===photoId),note,response:REPLY_LETTERS[letterId].response}:letter);render({replies:{...view.replies,items,final:{...view.replies.final,ready:items.every(letter=>letter.status==='answered')}}});}else if(last.action==='select-ending-photo'){const all=[...view.film,...view.replies.items.flatMap(letter=>[...letter.candidates,letter.photo].filter(Boolean))];const photo=all.find(photo=>photo.id===last.payload.photoId);render({endingPhoto:photo,replies:{...view.replies,final:{...view.replies.final,photo,note:last.payload.note}}});}},
 addReplacement(id){render({replies:{...view.replies,items:view.replies.items.map(letter=>letter.id===id?{...letter,candidates:[...letter.candidates,id==='forest'?rain:courtyard]}:letter)}})},
 legacy(){render({screen:'journal',film:[],album:[],replies:{items:[{...view.replies.items[0],carriedOver:true},{...view.replies.items[1],photo:undefined,candidates:[],status:'searching',legacyUnlocked:true}],final:{...view.replies.final,ready:true}}});},
 destroy(){ui.destroy()}};
`},bundle:true,format:'iife',platform:'browser',write:false,logLevel:'silent'});
const browser=await chromium.launch({headless:true}),page=await browser.newPage();
const results=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
const lastAction=()=>page.evaluate(()=>window.fixture.actions.at(-1));
const screenshot=async(name,v)=>{await page.locator('img').evaluateAll(images=>Promise.all(images.map(img=>img.decode().catch(()=>undefined))));return page.screenshot({path:fileURLToPath(new URL(`${name}-${v.width}x${v.height}-component-only.png`,out)),animations:'disabled'});};
const geometry=()=>page.locator('[role=dialog] button:not(:disabled)').evaluateAll(buttons=>buttons.map((button,i)=>{const b=button.getBoundingClientRect();return{tab:i+1,label:button.textContent.trim(),action:button.dataset.action,letter:button.dataset.letter,photoId:button.dataset.id,note:button.dataset.note,bounds:{x:b.x,y:b.y,width:b.width,height:b.height}}}));
const noHorizontalOverflow=async()=>assert.equal(await page.locator('[role=dialog]').evaluate(el=>el.scrollWidth>el.clientWidth+1),false,'dialog must not overflow horizontally');
try{
 for(const viewport of [{width:1920,height:1080},{width:1280,height:720},{width:1280,height:600}]){
  await page.setViewportSize(viewport);await page.setContent('<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#829581}#ui{position:absolute;inset:0;pointer-events:none}</style><div id="ui"></div>');await page.addScriptTag({content:built.outputFiles[0].text});
  if(mailOnly){
   await page.evaluate(()=>{
    const v=window.fixture.view,photo=v.replies.items[0].candidates[0];
    window.fixture.render({screen:'play',endingPhoto:photo,canSendLetter:true,mailRequest:1,
     replies:{items:v.replies.items.map(letter=>({...letter,status:'answered',photo:letter.candidates[0],response:'已收到你选的照片。'})),final:{...v.replies.final,ready:true,photo,note:'下次，我还会慢慢走。'}}});
   });
   assert.equal(await page.locator('[aria-label="寄给远方的信"]').count(),1);
   assert.equal(await page.evaluate(()=>window.fixture.actions.length),0,'request pulse cannot send');
   const before=await page.evaluate(()=>({id:window.fixture.view.endingPhoto.id,note:window.fixture.view.replies.final.note}));
   await noHorizontalOverflow();const confirmation=await geometry();await screenshot('mail-request-opens-confirmation',viewport);
   await page.keyboard.press('Escape');assert.equal(await page.locator('[role=dialog]').count(),0);
   await page.evaluate(()=>window.fixture.render({mailRequest:1}));assert.equal(await page.locator('[role=dialog]').count(),0,'same request cannot reopen after Escape');
   await page.evaluate(()=>window.fixture.render({mailRequest:2}));assert.equal(await page.locator('[aria-label="寄给远方的信"]').count(),1);
   await page.locator('[data-action=keep-exploring]').click();assert.equal(await page.locator('[role=dialog]').count(),0);
   assert.equal(await page.evaluate(()=>window.fixture.actions.length),0,'cancel must not send or advance the story');
   assert.deepEqual(await page.evaluate(()=>({id:window.fixture.view.endingPhoto.id,note:window.fixture.view.replies.final.note})),before);
   await page.evaluate(()=>window.fixture.render({mailRequest:2}));assert.equal(await page.locator('[role=dialog]').count(),0,'same request cannot reopen after cancel');
   await page.evaluate(()=>window.fixture.render({mailRequest:3}));await page.locator('[data-action=send-letter]').click();
   assert.deepEqual(await lastAction(),{action:'send-letter',payload:undefined});
   assert.equal(await page.evaluate(()=>window.fixture.view.sentLetter),false,'UI waits for the real commit');
   await page.evaluate(()=>window.fixture.render({screen:'ending',sentLetter:true,replies:{...window.fixture.view.replies,final:{...window.fixture.view.replies.final,response:'这一次，信封里有你自己选的风景。'}}}));
   assert.match(await page.locator('.sy-ending-top').textContent(),/已经寄出/);
   assert.equal(await page.locator('[data-action=send-letter]').count(),0);await screenshot('mail-authoritative-result',viewport);
   results.push({viewport,confirmation,passed:['new real-mailbox request pulse opens confirmation only','Escape and cancel preserve photograph/note without action','same pulse never reopens','only explicit confirmation emits send-letter','mailed state waits for authoritative response']});
   await page.evaluate(()=>window.fixture.destroy());continue;
  }
  await page.locator('[data-action=open-journal]').click();
  assert.match(await page.locator('[data-tab=letters]').textContent(),/三封来信/);
  assert.equal(await page.locator('[data-tab=discoveries]').textContent(),'沿途未读的风景');
  assert.equal(await page.locator('[data-reply-letter]').count(),3);
  const firstOpen=await geometry();
  assert.equal(await page.locator('[data-reply-letter=final] [data-action=edit-reply]').count(),0);
  assert.equal(await page.locator('[data-action=select-reply-photo][data-letter=forest]').isDisabled(),true);
  await noHorizontalOverflow();await screenshot('01-read-three-letters',viewport);
  const actionCount=await page.evaluate(()=>window.fixture.actions.length);
  await page.locator('[data-action=pick-reply-photo][data-letter=forest][data-id=forest-1]').click();
  assert.equal(await page.evaluate(()=>window.fixture.actions.length),actionCount,'preselection cannot reply');
  assert.equal(await page.locator('[data-letter=forest][data-action=pick-reply-note][data-note=""]').getAttribute('aria-pressed'),'true');
  await page.locator('[data-letter=forest][data-action=pick-reply-note][data-note="今天的叶片很清楚"]').click();
  assert.equal(await page.evaluate(()=>window.fixture.actions.length),actionCount,'note is not committed before confirmation');
  const forestSelection=await geometry();await screenshot('02-forest-selected-not-submitted',viewport);
  await page.locator('[data-action=select-reply-photo][data-letter=forest]').click();
  assert.deepEqual(await lastAction(),{action:'select-reply-photo',payload:{letterId:'forest',photoId:'forest-1',note:'今天的叶片很清楚'}});
  assert.equal(await page.locator('[data-reply-letter=forest]').getAttribute('data-reply-status'),'choose','UI cannot fabricate answered state');
  await page.evaluate(()=>window.fixture.acknowledge());
  assert.match(await page.locator('[data-reply-letter=forest] .sy-reply-response').textContent(),/远方的回应/);
  await page.locator('[data-action=pick-reply-photo][data-letter=town]').click();await page.locator('[data-action=select-reply-photo][data-letter=town]').click();await page.evaluate(()=>window.fixture.acknowledge());
  assert.equal(await page.locator('[data-reply-letter=final] [data-action=edit-reply]').count(),1);
  await screenshot('03-two-answered',viewport);
  await page.evaluate(()=>window.fixture.addReplacement('town'));
  await page.locator('[data-action=edit-reply][data-letter=town]').click();
  await page.locator('[data-action=pick-reply-photo][data-letter=town][data-id=town-courtyard]').click();
  const townReplacement=await geometry();
  await page.locator('[data-action=select-reply-photo][data-letter=town]').click();
  assert.deepEqual(await lastAction(),{action:'select-reply-photo',payload:{letterId:'town',photoId:'town-courtyard',note:''}});await page.evaluate(()=>window.fixture.acknowledge());
  await page.evaluate(()=>window.fixture.addReplacement('forest'));
  await page.locator('[data-action=edit-reply][data-letter=forest]').click();await page.locator('[data-action=pick-reply-photo][data-letter=forest][data-id=forest-rain]').click();
  assert.equal(await page.locator('[data-letter=forest][data-action=pick-reply-note][data-note=""]').getAttribute('aria-pressed'),'true','switching photos clears the old weather-specific note');
  assert.equal(await page.locator('[data-letter=forest][data-action=pick-reply-note][data-note="今天的叶片很清楚"]').count(),0);
  await page.locator('[data-letter=forest][data-action=pick-reply-note][data-note="今天的风车藏在细雨里"]').click();await page.locator('[data-action=select-reply-photo][data-letter=forest]').click();await page.evaluate(()=>window.fixture.acknowledge());
  await page.locator('[data-reply-letter=forest] [data-action=export-postcard]').click();
  assert.equal((await lastAction()).payload.note,'今天的风车藏在细雨里');
  await page.evaluate(()=>window.fixture.render({film:[],album:[]}));
  await page.locator('[data-reply-letter=forest] [data-action=view-reply-photo]').click();assert.equal(await page.locator('.sy-large-photo-image img').count(),1,'reply-only retained photo opens');
  assert.equal(await page.locator('[data-action=export-photo]').count(),1);assert.equal(await page.locator('[data-action=export-postcard]').count(),1);
  await page.locator('[data-action=export-postcard]').click();assert.equal((await lastAction()).payload.note,'今天的风车藏在细雨里','large photograph export preserves the originating letter note');
  await page.keyboard.press('Escape');await page.keyboard.press('Escape');
  await page.locator('[data-action=edit-reply][data-letter=final]').click();
  assert.equal(await page.locator('[data-action=confirm-final-photo]').isDisabled(),true);
  await page.locator('[data-action=pick-reply-photo][data-letter=final][data-id=forest-rain]').click();
  assert.equal(await page.locator('[data-letter=final][data-action=pick-reply-note][data-note=""]').getAttribute('aria-pressed'),'true');
  await page.locator('[data-letter=final][data-action=pick-reply-note][data-note="下次，我还会慢慢走。"]').click();
  const finalSelection=await geometry();await screenshot('04-final-personal-choice',viewport);
  await page.locator('[data-action=confirm-final-photo]').click();
  assert.deepEqual(await lastAction(),{action:'select-ending-photo',payload:{photoId:'forest-rain',note:'下次，我还会慢慢走。'}});await page.evaluate(()=>window.fixture.acknowledge());
  await page.evaluate(()=>window.fixture.render({screen:'ending',canSendLetter:true}));
  assert.equal(await page.locator('.sy-reply-ending-pair img').count(),2);
  assert.match(await page.locator('.sy-ending-letter').textContent(),/下次，我还会慢慢走。/);
  await noHorizontalOverflow();const ending=await geometry();await screenshot('05-confirm-before-postmark',viewport);
  await page.locator('[data-action=export-postcard]').click();assert.equal((await lastAction()).action,'export-postcard');
  await page.locator('[data-action=export-photo]').click();assert.deepEqual(await lastAction(),{action:'export-photo',payload:{photoId:'forest-rain'}});
  await page.locator('[data-action=send-letter]').click();assert.deepEqual(await lastAction(),{action:'send-letter',payload:undefined});
  await page.evaluate(()=>window.fixture.render({sentLetter:true,replies:{...window.fixture.view.replies,final:{...window.fixture.view.replies.final,response:'这一次，信封里有你自己选的风景。'}}}));
  assert.equal(await page.locator('[data-action=send-letter]').count(),0);assert.equal(await page.locator('[data-action=open-replies]').count(),0);
  await page.evaluate(()=>window.fixture.legacy());assert.match(await page.locator('[data-reply-letter=town]').textContent(),/旧旅途进度已保留，可补拍配图/);
  assert.match(await page.locator('[data-reply-letter=forest]').textContent(),/旧旅途带来的照片/);await screenshot('06-legacy-progress',viewport);
  // Actual camera toolbar remains the same size, with a normal route into letter selection.
  await page.evaluate(()=>window.fixture.render({screen:'play',sentLetter:false,camera:{...window.fixture.view.camera,active:true},film:[window.fixture.view.replies.items[0].candidates[0]],toast:{id:'reply-ready',title:'这张可以回答来信',message:'选哪张，由你决定。'}}));
  assert.equal(await page.locator('.sy-latest-photo').getAttribute('data-action'),'open-replies');
  const boxes=await page.locator('.sy-latest-photo,.sy-save,.sy-toast,.sy-field-tools').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return{className:el.className,x:r.x,y:r.y,width:r.width,height:r.height}}));
  const toast=boxes.find(b=>b.className==='sy-toast');for(const b of boxes.filter(b=>b!==toast))assert(!(toast.x<b.x+b.width&&toast.x+toast.width>b.x&&toast.y<b.y+b.height&&toast.y+toast.height>b.y),'camera ready toast collision');
  await screenshot('07-camera-reply-entry',viewport);await page.locator('.sy-latest-photo').click();assert.equal(await page.locator('[data-tab=letters]').getAttribute('aria-selected'),'true');
  results.push({viewport,geometry:{firstOpen,forestSelection,townReplacement,finalSelection,ending},cameraBoxes:boxes,passed:['no reply before explicit confirm and authoritative DTO','photo snapshot-specific optional notes','both letters, replacement, and reply-only photo retention','personal final photo/note then existing send-letter action','original and postcard export actions are distinct','legacy progress without invented picture','camera reply entry and toast/save separation']});
  await page.evaluate(()=>window.fixture.destroy());
 }
 assert.deepEqual(errors,[]);
 const result={passed:true,scope:'Presentation-only fixture; archived real JPEG reused as visual placeholder. No new gameplay, rules, persistence, export artifact, or GPU acceptance.',results,errors};
 await writeFile(new URL('RESULT.json',out),JSON.stringify(result,null,2));console.log(JSON.stringify({passed:true,viewports:results.map(r=>r.viewport),screenshots:results.length*(mailOnly?2:7),errors}));
}finally{await browser.close()}
