import { launchSite, LAUNCH_SITES } from '../shanye-world/night-layout.ts';
import { FLOWER_ORDER, type FlowerKind } from './flower-catalog.ts';
import { availableFlower, BOX_GAP, emptyFlowerStock, FIELD_BOX_LIMIT, PINE_BOX_LIMIT, type FlowerBox } from './flower-stock.ts';
import { afterClosing, canSetFirework, fireworkNight, proposedFirework } from './night.ts';
import type { DurableJourney, Vec3 } from './types.ts';

export function launchGround(point:Vec3) {
  const site=launchSite(point);
  if(!site||!canSetFirework(point))return;
  return {id:site.title,capacity:site===LAUNCH_SITES[0]?FIELD_BOX_LIMIT:PINE_BOX_LIMIT};
}

export function adoptOldBoxes(d:DurableJourney) {
  const stock=emptyFlowerStock();
  if (!d.fireworks) return stock;
  const n=d.night,m=fireworkNight(d);
  stock.earned=n.scarletClaimed?['gold','scarlet']:['gold'];
  stock.counts={gold:Number(!n.spent),scarlet:Number(n.scarletClaimed&&!n.scarletSpent)};
  if(afterClosing(d)&&n.repriseNight===m)stock.samples={night:m,kinds:['gold','scarlet'],invitation:false};
  else if(afterClosing(d)&&n.goldEncore?.night===m&&!n.goldEncore.spent)stock.samples={night:m,kinds:['gold'],invitation:false};
  if(n.placed&&availableFlower(stock,'gold',n.spent?'sample':'stock',m)>0)
    stock.boxes.push({kind:'gold',position:n.placed,source:n.spent?'sample':'stock'});
  if(n.scarletPlaced&&availableFlower(stock,'scarlet',n.scarletSpent?'sample':'stock',m)>0)
    stock.boxes.push({kind:'scarlet',position:n.scarletPlaced,source:n.scarletSpent?'sample':'stock'});
  return stock;
}

export type PartyHolding = Pick<FlowerBox,'kind'|'source'>;

export function partyPlacement(d:DurableJourney, holding:PartyHolding, point=proposedFirework(d)) {
  const stock=d.flowerStock,site=launchGround(point);
  if(!stock||!site||!afterClosing(d))return {ok:false,reason:'请到镇外有标记的合法平地放下花盒。'};
  if(availableFlower(stock,holding.kind,holding.source,fireworkNight(d))<=0)
    return {ok:false,reason:'行囊里的这类花盒已经摆完。'};
  const capacity=stock.samples?.invitation?3:site.capacity;
  if(stock.boxes.length>=capacity)return {ok:false,reason:`这里最多放 ${capacity} 处。可收回一盒，再换位置。`};
  for(const box of stock.boxes){
    if(launchGround(box.position)?.id!==site.id)return {ok:false,reason:'同一场的花盒需要摆在同一片场地。'};
    if(Math.hypot(...box.position.map((coordinate,i)=>coordinate-point[i]!))<BOX_GAP)
      return {ok:false,reason:'和已经摆好的花盒隔开一步。'};
  }
  return {ok:true,reason:'按 E 放在这里'};
}

export const isCloseToBox=(player:Vec3,box:FlowerBox)=>Math.hypot(...player.map((coordinate,i)=>coordinate-box.position[i]!))<=2.7;

export const completeParty=(boxes:readonly FlowerBox[])=>FLOWER_ORDER.every(kind=>boxes.some(box=>box.kind===kind&&box.source==='stock'));

export function invitationBoxes(anchors:readonly FlowerBox[]):FlowerBox[] {
  if(anchors.length!==3)return [];
  const order=['scarlet','gold','silver','wheat','rain','pine','swallow','twins','moon','stars'] as const;
  return order.map((kind,i)=>({kind,position:anchors[i%3]!.position,source:'sample'}));
}

export type PartyColor = 'gold'|'pearl'|'coral'|'amber'|'indigo'|'mist'|'leaf';
const style:Record<FlowerKind,{height:number;radius:number;color:PartyColor}> = {
  gold:{height:18,radius:9.2,color:'gold'},scarlet:{height:10.4,radius:4.9,color:'coral'},
  silver:{height:13.4,radius:5.6,color:'pearl'},twins:{height:15,radius:6.2,color:'pearl'},
  rain:{height:13.5,radius:5.9,color:'mist'},wheat:{height:9.1,radius:6.1,color:'amber'},
  swallow:{height:13.0,radius:5.6,color:'indigo'},pine:{height:15.6,radius:5.4,color:'leaf'},
  moon:{height:14.8,radius:5.6,color:'pearl'},stars:{height:20.6,radius:8.6,color:'pearl'},
};
export interface PartyCue {
  launch:Vec3;
  kind:FlowerKind;
  shape:'willow'|'petals'|'festival';
  color:PartyColor;
  radius:number;
  count:number;
  rise:number;
  burst:number;
  offset:Vec3;
}
const fourActs:Record<FlowerKind,number>={
  scarlet:6,wheat:8.4,silver:15,swallow:17.1,moon:19.2,twins:25,rain:27.1,pine:29,gold:38,stars:39.1,
};

export function partyCues(boxes:readonly FlowerBox[],invitation:boolean):PartyCue[] {
  const cues:PartyCue[]=[];
  const repetitions:Partial<Record<FlowerKind,number>>={};
  for(const box of boxes){
    const repetition=repetitions[box.kind]??0;
    repetitions[box.kind]=repetition+1;
    const {height,radius,color}=style[box.kind];
    const {kind,position}=box;
    const lastStars=invitation&&kind==='stars';
    const time=lastStars?41.65:invitation?fourActs[kind] : boxes.length<=2?28.2+(kind==='scarlet'?.84:0)
      : 12+(fourActs[kind]-6)*.64;
    const burst=time+repetition*.37;
    const shape=kind==='gold'?'willow':kind==='scarlet'?'petals':'festival';
    const offset:Vec3=[kind==='gold'?1:kind==='scarlet'?-1:0,lastStars?height+2.1:height,-(height*.36)];
    cues.push({launch:position,kind,shape,color,radius,count:kind==='gold'?27:19,rise:burst-2.45,burst,offset});
    if(!invitation&&kind==='scarlet')cues.push({launch:position,kind,shape,color,radius:radius*.76,count:16,
      rise:7,burst:10.3,offset:[offset[0],offset[1]*.9,offset[2]]});
  }
  return cues;
}
