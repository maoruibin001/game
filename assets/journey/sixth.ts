import { inSixthRoom, SIXTH_STOPS, sixthNearby } from '../shanye-world/sixth-layout.ts';
import { copyPhoto } from './memories.ts';
import { hallCollectsAt } from './afternoon.ts';
import { allRetainedPhotos } from './replies.ts';
import type { JourneyState, Photo } from './types.ts';

export interface SixthProgress {
  seen: boolean;
  tin: boolean;
  revealed: boolean;
  displayed: boolean;
  portrait: Photo | null;
}

export const emptySixth=():SixthProgress=>({seen:false,tin:false,revealed:false,displayed:false,portrait:null});

export function eligibleSixthPortrait(photo:Photo):boolean{
  const [x,y,z]=photo.pose.position,[wx,wy,wz]=SIXTH_STOPS.window.position;
  const onIndoorMark=sixthNearby(photo.pose.position)==='sixth:room';
  const oldWindow=Math.hypot(x-wx,z-wz)<3&&Math.abs(y-wy)<1.7&&!inSixthRoom(photo.pose.position);
  return Boolean(photo.original&&photo.scene?.mode==='portrait'&&(onIndoorMark||oldWindow));
}

export function readSixth(value:unknown,readPhoto:(input:unknown)=>Photo|null):SixthProgress{
  if(!value||typeof value!=='object')return emptySixth();
  const saved=value as Partial<SixthProgress>;
  const tin=saved.tin===true,revealed=tin&&saved.revealed===true,displayed=revealed&&saved.displayed===true;
  const portrait=displayed?readPhoto(saved.portrait):null;
  return {seen:saved.seen===true,tin,revealed,displayed,portrait:portrait&&eligibleSixthPortrait(portrait)?portrait:null};
}

export function openSixth({durable:d,runtime:r}:JourneyState,id:string) {
  if(d.creativeMode||sixthNearby(d.player.position)!==id)return '';
  if(id==='sixth:tin'){
    if(!d.skills.jump)return '先到桥头拓印摊借草鞋。';
    d.sixth={...d.sixth,tin:true};
    return '打开梅花铁匣，找到一张全幅老底片。拿去照相铺的放大台吧。';
  }
  if(id==='sixth:room'){
    if(!hallCollectsAt(d.clock.minute))return '内室已经闭门。次晨 06:20 再来。';
    if(!d.sixth.revealed)return '椅背上夹着半张印样。旁边的放大台还空着。';
  }
  if(id==='sixth:window'||id==='sixth:room')d.sixth={...d.sixth,seen:true};
  r.sixthPanel=id==='sixth:room'?'room':id==='sixth:window'?'window':'enlarger';
  r.screen='journal';r.returnScreen='play';
  return '';
}

export function operateSixth({durable:d,runtime:r}:JourneyState,operation:'reveal'|'display'|'portrait',id?:string) {
  if(r.screen!=='journal'||d.creativeMode||r.pauseReasons.some(reason=>reason!=='ui')||!r.sixthPanel)return;
  const stop=sixthNearby(d.player.position);
  if(stop!==`sixth:${r.sixthPanel}`)return;
  if(operation==='reveal'&&stop==='sixth:enlarger'&&d.sixth.tin&&!d.sixth.revealed)
    d.sixth={...d.sixth,revealed:true};
  else if(operation==='display'&&stop==='sixth:room'&&hallCollectsAt(d.clock.minute)&&d.sixth.revealed&&!d.sixth.displayed)
    d.sixth={...d.sixth,displayed:true};
  else if(operation==='portrait'&&stop==='sixth:room'&&hallCollectsAt(d.clock.minute)&&d.sixth.displayed){
    const photo=allRetainedPhotos(d).find(candidate=>candidate.id===id);
    if(photo&&eligibleSixthPortrait(photo)&&inSixthRoom(photo.pose.position))d.sixth={...d.sixth,portrait:copyPhoto(photo)};
  }
}
