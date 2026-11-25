/** Browser component fixture: real SDK input acquisition, no game World or test-only game commands. */
import { attachBrowserInputBackend } from '@forgeax/engine/input';
import { createPresentation } from '../presentation';
import { initialPresentationView } from '../types';
import type { Presentation, PresentationAction, PresentationCallbacks, PresentationViewModel } from '../types';
const canvas=document.querySelector<HTMLCanvasElement>('#game-focus')!;
const uiRoot=document.querySelector<HTMLElement>('#ui-root')!;
const backend=attachBrowserInputBackend(canvas,{uiRoot,pointerLockAllowed:()=>false}).backend;
let view=initialPresentationView(), ui:Presentation;
const chronology:{kind:string;dialogs:number;focused:string|null}[]=[];
const focus=()=>({tag:document.activeElement?.tagName,id:(document.activeElement as HTMLElement)?.id??'',action:(document.activeElement as HTMLElement)?.dataset.action??'',insideUi:uiRoot.contains(document.activeElement),canvasFocused:document.activeElement===canvas});
const record=(kind:string)=>chronology.push({kind,dialogs:uiRoot.querySelectorAll('[role=dialog]').length,focused:document.activeElement?.tagName??null});
const render=(patch:Partial<PresentationViewModel>)=>{view={...view,...patch};ui.render(view)};
let reenter=false;
const callbacks:PresentationCallbacks & {onReturnToGame():void}={
 onAction(action:PresentationAction){
  // Port delivery is asynchronous in the real host; preserve that ordering here.
  queueMicrotask(()=>{
   if(action==='start'||action==='close-panel'||action==='resume'||action==='save-photo'||action==='discard-photo') render({screen:'play',pendingPhoto:undefined});
   else if(action==='shutter') render({screen:'photo',pendingPhoto:{id:'fixture-photo',title:'Component focus fixture',location:'Fixture'}});
   else if(action==='open-journal')render({screen:'journal'});
   else if(action==='pause')render({screen:'paused'});
  });
 },
 onModalChange(open){record(open?'modal-open':'modal-close');backend.setInputAllowed?.(!open);if(!open&&reenter){reenter=false;render({screen:'map'})}},
 onReturnToGame(){record('return-game');canvas.focus({preventScroll:true})},
};
ui=createPresentation(uiRoot,callbacks);
Object.assign(window,{focusFixture:{render,focus,chronology,sample:()=>{const s=backend.sample();return {pressed:[...(s.pressedCodes??[])],held:[...(s.downCodes??[])],focused:s.focused}},reopenOnClose:()=>{reenter=true},destroy:()=>{ui.destroy();backend.detach()}}});
