import { COMMISSIONS, FLOWERS, FLOWER_ORDER, type CommissionStop } from './flower-catalog.ts';
import { completeCommission, followCommission, photoDayPart, stopCommission } from './flower-quests.ts';
import { adoptOldBoxes, completeParty, invitationBoxes, isCloseToBox, launchGround, partyCues, partyPlacement } from './flower-party.ts';
import { availableFlower, awardFlower, awardRepeatBox, consumeFlowerBoxes, nextFlower } from './flower-stock.ts';
import { afterClosing, fireworkNight, firstWillowIgnition, FIRST_WILLOW_CUE, proposedFirework, type FireworkLaunches } from './night.ts';
import { copyPhoto } from './memories.ts';
import { allRetainedPhotos } from './replies.ts';
import type { JourneyAction, JourneyEventType, JourneyState } from './types.ts';

type Notify = (type:JourneyEventType,message:string)=>void;
type FlowerAction = Extract<JourneyAction,{type:'flower-gear'|'flower-photo'}>;

export function applyFlowerAction({durable:d,runtime:r}:JourneyState,action:FlowerAction,notify:Notify):boolean {
  if(!d.started||d.creativeMode||r.ride||!['play','journal'].includes(r.screen)||r.pauseReasons.some(reason=>reason!=='ui'))return false;
  const stock=d.flowerStock,quests=d.flowerQuests;
  if(action.type==='flower-photo') {
    const {operation,photoId,kind}=action;
    const photo=photoId?allRetainedPhotos(d).find(p=>p.id===photoId):undefined;
    if((operation==='day'||operation==='night')&&r.nearby==='flower:day-night-post'&&d.mailed&&!quests.dayNight&&photo&&photoDayPart(photo)===operation){
      d.flowerQuests={...quests,draft:{...quests.draft,[operation]:copyPhoto(photo)}};
    }else if(r.nearby==='flower:moon-riddle'&&afterClosing(d)&&quests.revisit){
      if(operation==='repeat'&&!quests.revisit.reviewed&&photo?.original&&photo.flowerSubjects?.includes('moon')&&photo.sequence>quests.revisit.acceptedAfter){
        d.flowerQuests={...quests,revisit:{...quests.revisit,reviewed:true}};
        notify('notice','新的缺月灯底片已签收。选一盒带走吧。');
      }else if(operation==='redeem'&&stock&&kind&&quests.revisit.reviewed){
        const awarded=awardRepeatBox(stock,kind);
        if(awarded===stock)return false;
        d.flowerStock=awarded;d.flowerQuests={...quests,revisit:null};
        notify('reward:fireworks',`这次重访换到一盒${FLOWERS[kind]}。`);
      }
    }
    return false;
  }
  if(!stock||r.fireworkShow||!afterClosing(d))return false;
  const {operation,kind,index,source}=action,night=fireworkNight(d);
  if(operation==='clear'){
    if(stock.boxes.length && !stock.boxes.some(box=>launchGround(box.position)?.id===launchGround(d.player.position)?.id))return false;
    d.flowerStock={...stock,boxes:[]};r.partyHolding=null;r.placingFirework=false;
    notify('notice','地上的花盒都已收回。');return false;
  }
  if(operation==='retrieve'){
    const box=index===undefined?undefined:stock.boxes[index];
    if(!box||!isCloseToBox(d.player.position,box)){notify('notice','走近这一盒再收回。');return false;}
    d.flowerStock={...stock,boxes:stock.boxes.filter((_,i)=>i!==index)};
    notify('notice',`${FLOWERS[box.kind]}收回了。`);return false;
  }
  if(!r.torchLit||!launchGround(d.player.position)){
    notify('notice','持火把站到镇外场地里，再布置花盒。');return false;
  }
  if(operation==='invite'||operation==='sample'){
    if(stock.boxes.length){notify('notice','请先收回当前场地的花盒。');return false;}
    const invitation=operation==='invite';
    if(invitation&&nextFlower(stock.earned))return false;
    const kinds=invitation?[...FLOWER_ORDER]:stock.earned.filter(flower=>!stock.counts[flower]);
    if(!kinds.length)return false;
    d.flowerStock={...stock,samples:{night,kinds,invitation}};
    notify('notice',invitation?'阿禾备好了十种留样。选三处摆下主花和侧花。':'留样已经备好，这一晚可从行囊取出。');
    return false;
  }
  if(!kind||!source||availableFlower(stock,kind,source,night)<=0)return false;
  if(stock.samples?.invitation&&source!=='sample'){
    notify('notice','当前在布置邀约留样。个人库存可以留到另一场。');return false;
  }
  r.partyHolding={kind,source};r.placingFirework=true;
  r.screen='play';r.returnScreen='play';r.pauseReasons=r.pauseReasons.filter(reason=>reason!=='ui');
  return true;
}

export function interactWithCommission({durable:d}:JourneyState,stop:CommissionStop,notify:Notify) {
  const commission=stopCommission(stop);
  if(d.creativeMode||!commission||!followCommission(d,commission))return;
  const order=COMMISSIONS[commission],quests=d.flowerQuests;
  const stock=d.flowerStock??adoptOldBoxes(d),expected=nextFlower(stock.earned);
  if(!expected&&commission==='moon'){
    if(!quests.revisit){
      d.flowerQuests={...quests,revisit:{acceptedAfter:d.totalPhotos,reviewed:false}};
      notify('notice','重访：再拍一张新的缺月灯与墙影。回来在行囊里交片。');
    }else notify('notice',quests.revisit.reviewed?'打开行囊挑一盒。':'打开行囊交出接受委托后拍的新底片。');
    return;
  }
  if (d.photoCommissions.number >= 2 && !d.photoCommissions.legacy) {
    notify('notice', '这一带仍有沿途故事。新的摄影委托和花盒收件都夹在旅行册的来信里。');
    return;
  }
  if(stop===order.pickup&&!quests.visited.includes(commission)){
    d.flowerQuests={...quests,visited:[...quests.visited,commission]};
  }
  if(commission==='stars'&&d.mailed&&!quests.dayNight&&quests.draft.day&&quests.draft.night){
    d.flowerQuests={...d.flowerQuests,dayNight:{day:quests.draft.day,night:quests.draft.night},draft:{}};
  }
  if(order.delivery===stop&&expected===commission&&completeCommission(d,commission)){
    d.flowerStock=awardFlower(stock,commission);
    notify('reward:fireworks',commission==='stars'?'收下了「千星归谷」。阿禾来信：下回把它们都带来吧。你挑地方，我替你留着灯。'
      : `收下了「${FLOWERS[commission]}」。下一封委托可以在行囊查看。`);
  }else if(commission==='stars'&&d.mailed&&!d.flowerQuests.dayNight)
    notify('notice','在这里打开行囊选白日与夜色各一张，再按 E 寄出。');
  else notify('notice',order.brief);
}

export function interactWithParty({durable:d,runtime:r}:JourneyState,id:'night-place'|'night-ignite',notify:Notify) {
  const stock=d.flowerStock;
  if(!stock||!afterClosing(d)||r.fireworkShow)return;
  if(id==='night-place'){
    if(!r.partyHolding)return;
    const point=proposedFirework(d),placement=partyPlacement(d,r.partyHolding,point);
    if(!placement.ok){notify('notice',placement.reason);return;}
    d.flowerStock={...stock,boxes:[...stock.boxes,{...r.partyHolding,position:point}]};
    notify('notice',`${FLOWERS[r.partyHolding.kind]}已放下。可以再摆一盒，或靠近任一盒按 E 点燃。`);
    r.partyHolding=null;r.placingFirework=false;
    return;
  }
  if(!stock.boxes.some(box=>isCloseToBox(d.player.position,box)))return;
  if(!r.torchLit||!d.night.torch){notify('notice','请先从行囊拿起火把。');return;}
  const invited=stock.samples?.invitation===true;
  if(invited&&stock.boxes.length!==3){notify('notice','邀约需要布置三处落点。再从行囊取一盒留样。');return;}
  const invitation=invited||completeParty(stock.boxes);
  const boxes=invited?invitationBoxes(stock.boxes):stock.boxes;
  const launches:FireworkLaunches={};
  for(const box of boxes)if(box.kind==='gold'||box.kind==='scarlet')launches[box.kind]=box.position;
  const firstWillow=!d.night.spent&&!d.night.firstWillowLantern&&!invitation&&boxes.length===1&&boxes[0]?.kind==='gold'&&boxes[0]?.source==='stock';
  r.fireworkShow={position:boxes[0]!.position,launches,startedAt:d.playSeconds,...(firstWillow?{firstWillow:true as const}:{}),
    party:{cues:firstWillow?[{...FIRST_WILLOW_CUE,launch:boxes[0]!.position}]:partyCues(boxes,invitation),boxes:stock.boxes,invitation}};
  d.flowerStock=consumeFlowerBoxes(stock,invitation);
  d.night={...d.night,placed:null,scarletPlaced:null,repriseNight:null,goldEncore:null,
    ...(firstWillow?{firstWillowLantern:firstWillowIgnition(d)}:{}),
    spent:!d.flowerStock.counts.gold,scarletSpent:!d.flowerStock.counts.scarlet};
  notify('night:spark',invitation?'《满山赴约》开始了。退到开阔处，按 C 自己取景。'
    :firstWillow?'引线点着了。退到开阔处按 C，留一点画面给山下的窗。':'引线点着了。退开几步，举起相机看看山口。');
}
