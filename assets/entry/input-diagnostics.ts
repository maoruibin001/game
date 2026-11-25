import type { InputSnapshot } from '@forgeax/engine/input';
import type { InputFrame } from '../controller/types.ts';

export type ShutterSource='native:shutter'|'presentation:shutter'|'command:take-photo'|'command:begin-countdown';
/** Bounded, local, read-only evidence. No arbitrary keys, text or input setters. */
export function createInputDiagnostics(){
  let sequence=0;
  const samples:ReturnType<typeof sample>[]=[];
  const shutters:{sequence:number;source:ShutterSource;busy:boolean;samples:ReturnType<typeof sample>[]}[]=[];
  function sample(frame:InputFrame,snapshot:InputSnapshot|undefined,mode:string,screen:string,paused:boolean){
    const key=(code:string)=>snapshot?.keyboard.downCode(code)??false;
    return{sequence:++sequence,atMs:Date.now(),sourceAvailable:!!snapshot,mode,screen,paused,
      keys:{Space:key('Space'),KeyF:key('KeyF'),KeyC:key('KeyC'),ShiftLeft:key('ShiftLeft'),ShiftRight:key('ShiftRight')},
      mouse:{left:snapshot?.mouse.button(0)??false,right:snapshot?.mouse.button(2)??false},
      translated:{jump:frame.jump,shutter:frame.shutter,camera:frame.camera,run:frame.run,lookActive:frame.lookActive}};
  }
  return{
    observe(frame:InputFrame,snapshot:InputSnapshot|undefined,mode:string,screen:string,paused:boolean){samples.push(sample(frame,snapshot,mode,screen,paused));if(samples.length>90)samples.shift();},
    shutter(source:ShutterSource,busy:boolean){shutters.push({sequence,source,busy,samples:samples.slice(-8)});if(shutters.length>12)shutters.shift();},
    read(){return{samples:samples.map(s=>({...s,keys:{...s.keys},mouse:{...s.mouse},translated:{...s.translated}})),shutters:shutters.map(s=>({...s,samples:s.samples.map(frame=>({...frame,keys:{...frame.keys},mouse:{...frame.mouse},translated:{...frame.translated}}))}))};},
  };
}
