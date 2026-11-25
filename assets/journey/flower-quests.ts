import { hallCollectsAt } from './afternoon.ts';
import { COMMISSION_ORDER, COMMISSIONS, type CommissionKind } from './flower-catalog.ts';
import type { DurableJourney, Photo } from './types.ts';

export interface FlowerQuests {
  visited: CommissionKind[];
  proofs: Partial<Record<CommissionKind,Photo>>;
  draft: Partial<Record<'day'|'night',Photo>>;
  dayNight: {day:Photo;night:Photo} | null;
  revisit: {acceptedAfter:number;reviewed:boolean} | null;
}

export function emptyFlowerQuests():FlowerQuests {
  return {visited:[],proofs:{},draft:{},dayNight:null,revisit:null};
}

export function stopCommission(stop:string) {
  return COMMISSION_ORDER.find(kind=>{
    const order=COMMISSIONS[kind];
    return stop===order.pickup || stop===order.delivery;
  });
}

export function followCommission(d:DurableJourney, kind:CommissionKind): boolean {
  if(kind==='moon') return !hallCollectsAt(d.clock.minute);
  return true;
}

export function completeCommission(d: DurableJourney, kind:CommissionKind): boolean {
  const state=d.flowerQuests;
  if(kind==='twins') {
    const pair=d.replyPhotos.forest;
    return Boolean(pair?.variant==='route-pair' && pair.photo.original && pair.destination?.original);
  }
  if(kind==='stars') return Boolean(d.mailed&&state.dayNight);
  if(kind==='swallow'&&!d.discoveries.some(discovery=>discovery.id==='lost-postcard')) return false;
  return state.visited.includes(kind)&&Boolean(state.proofs[kind]?.original);
}

export function commissionEvidence(photo:Photo): CommissionKind[] {
  if(!photo.original) return [];
  const subjects:CommissionKind[]=[...(photo.flowerSubjects??[])];
  if(photo.replyCandidates?.some(candidate=>candidate.variant==='courtyard'))subjects.push('rain');
  if(photo.memoryCandidates.includes('valley-letter'))subjects.push('swallow');
  return subjects;
}

export function recordCommissionEvidence(state:FlowerQuests, photo:Photo):FlowerQuests {
  const subjects=commissionEvidence(photo);
  if(!subjects.length)return state;
  const proofs={...state.proofs};
  for(const subject of subjects)proofs[subject]=photo;
  return {...state,proofs};
}

export function photoDayPart(photo:Photo): 'day'|'night'|undefined {
  if(!photo.original||!photo.scene?.clock)return;
  return hallCollectsAt(photo.scene.clock.minute)?'day':'night';
}

export function isCommissionKind(value:unknown):value is CommissionKind {
  return typeof value==='string'&&Object.hasOwn(COMMISSIONS,value);
}

export function readFlowerQuests(value:unknown, readPhoto:(raw:unknown)=>Photo|null, maxSequence:number):FlowerQuests {
  const source=value && typeof value==='object' ? value as Partial<FlowerQuests> : {};
  const out=emptyFlowerQuests();
  out.visited=COMMISSION_ORDER.filter(kind=>Array.isArray(source.visited)&&source.visited.includes(kind));
  for(const kind of COMMISSION_ORDER){
    const proof=readPhoto(source.proofs?.[kind]);
    if(proof&&commissionEvidence(proof).includes(kind))out.proofs[kind]=proof;
  }
  for(const part of ['day','night'] as const){
    const photo=readPhoto(source.draft?.[part]);
    if(photo&&photoDayPart(photo)===part)out.draft[part]=photo;
  }
  const day=readPhoto(source.dayNight?.day),night=readPhoto(source.dayNight?.night);
  if(day&&night&&day.id!==night.id&&photoDayPart(day)==='day'&&photoDayPart(night)==='night')out.dayNight={day,night};
  const repeat=source.revisit;
  if(repeat&&Number.isSafeInteger(repeat.acceptedAfter)&&repeat.acceptedAfter>=0&&repeat.acceptedAfter<=maxSequence)
    out.revisit={acceptedAfter:repeat.acceptedAfter,reviewed:repeat.reviewed===true};
  return out;
}

