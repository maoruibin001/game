/** Diagnostic fixture only: actual SDK acquisition + actual game controller; no World or game state shortcuts. */
import { attachBrowserInputBackend, snapshotFromSample } from '@forgeax/engine/input';
import { createTravelController } from '../../controller/travel-controller';
import { sampleTravelInput } from '../../controller/forgeax-controller';
import { createPresentation } from '../presentation';
import { initialPresentationView } from '../types';
import type { Presentation, PresentationViewModel } from '../types';
const canvas=document.querySelector<HTMLCanvasElement>('#game-input')!;
const uiRoot=document.querySelector<HTMLElement>('#ui-root')!;
const input=attachBrowserInputBackend(canvas,{uiRoot,pointerLockAllowed:()=>false}).backend;
let view=initialPresentationView(),ui:Presentation,boundary:'none'|'clear'='none';
const controllerEvents:string[]=[], keyboardEvents:{type:string;code:string;insideUi:boolean}[]=[], boundaries:{open:boolean;mode:string}[]=[];
const focus=()=>({tag:document.activeElement?.tagName,action:(document.activeElement as HTMLElement)?.dataset.action??'',insideUi:uiRoot.contains(document.activeElement),canvasFocused:document.activeElement===canvas});
const render=(patch:Partial<PresentationViewModel>)=>{view={...view,...patch};ui.render(view)};
const controller=createTravelController({spawn:[0,0,0],terrainHeight:()=>0,onAction:event=>{
 controllerEvents.push(event.type);
 queueMicrotask(()=>{
  if(event.type==='camera-enter')render({camera:{active:true,alignment:0,ready:false}});
  if(event.type==='journal')render({screen:'journal'});
  if(event.type==='camera-exit')render({camera:{active:false,alignment:0,ready:false}});
  if(event.type==='shutter')render({screen:'photo',pendingPhoto:{id:'fixture',title:'Keyboard boundary fixture',location:'Fixture'}});
 });
}});
ui=createPresentation(uiRoot,{
 onAction(action){queueMicrotask(()=>{if(['start','save-photo','discard-photo','close-panel'].includes(action))render({screen:'play',pendingPhoto:undefined})})},
 onModalChange(open){boundaries.push({open,mode:boundary});if(boundary==='clear')input.clear?.();controller.setPaused(open)},
 onReturnToGame(){canvas.focus({preventScroll:true})},
});
const record=(event:KeyboardEvent)=>keyboardEvents.push({type:event.type,code:event.code,insideUi:event.target instanceof Node&&uiRoot.contains(event.target)});
document.addEventListener('keydown',record,true);document.addEventListener('keyup',record,true);
function tick(count=1){
 let last;
 for(let i=0;i<count;i++){
  const raw=input.sample();const translated=sampleTravelInput(snapshotFromSample(raw));controller.submitInput(translated);controller.step(1/60);
  last={held:[...(raw.downCodes??[])],pressed:[...(raw.pressedCodes??[])],shutter:translated.shutter,camera:translated.camera,mode:controller.snapshot().mode,paused:controller.snapshot().paused};
 }
 return last;
}
Object.assign(window,{heldFixture:{setBoundary:(mode:'none'|'clear')=>{boundary=mode},tick,focus,controllerEvents,keyboardEvents,boundaries,state:()=>({mode:controller.snapshot().mode,paused:controller.snapshot().paused,focus:focus(),screen:view.screen}),destroy:()=>{ui.destroy();input.detach();document.removeEventListener('keydown',record,true);document.removeEventListener('keyup',record,true)}}});
