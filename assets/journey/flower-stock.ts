import { FLOWER_ORDER, isFlowerKind, type FlowerKind } from './flower-catalog.ts';
import type { Vec3 } from './types.ts';

export interface FlowerBox {
  kind: FlowerKind;
  position: Vec3;
  source: 'stock'|'sample';
}

export type FlowerCounts = Partial<Record<FlowerKind, number>>;

export interface FlowerStock {
  earned: FlowerKind[];
  counts: FlowerCounts;
  boxes: FlowerBox[];
  samples: { night: number; kinds: FlowerKind[]; invitation: boolean } | null;
  invitation: { started: boolean; witnessed: boolean };
}

export const FIELD_BOX_LIMIT = 12;
export const PINE_BOX_LIMIT = 3;
export const BOX_GAP = 1.05;

export function emptyFlowerStock(): FlowerStock {
  return { earned:[], counts:{}, boxes:[],samples:null,invitation:{started:false,witnessed:false} };
}

export function nextFlower(earned: readonly FlowerKind[]) {
  return FLOWER_ORDER.find(kind=>!earned.includes(kind));
}

export function awardFlower(stock: FlowerStock, kind: FlowerKind): FlowerStock {
  if (nextFlower(stock.earned)!==kind) return stock;
  return {...stock,earned:[...stock.earned,kind],counts:{...stock.counts,[kind]:(stock.counts[kind]??0)+1}};
}

export function awardRepeatBox(stock: FlowerStock, kind: FlowerKind): FlowerStock {
  return nextFlower(stock.earned) ? stock
    : {...stock,counts:{...stock.counts,[kind]:(stock.counts[kind]??0)+1}};
}

export function availableFlower(stock: FlowerStock, kind: FlowerKind, source: FlowerBox['source'], night: number) {
  const count=source==='stock' ? stock.counts[kind]??0 : Number(stock.samples?.night===night && stock.samples.kinds.includes(kind));
  return count-stock.boxes.filter(box=>box.kind===kind&&box.source===source).length;
}

export function consumeFlowerBoxes(stock: FlowerStock, naturalInvitation: boolean): FlowerStock {
  const counts={...stock.counts};
  for (const {kind,source} of stock.boxes) {
    if (source==='stock') counts[kind]=Math.max(0,(counts[kind]??0)-1);
  }
  return {...stock,boxes:[],counts,samples:null,
    invitation:{...stock.invitation,started:stock.invitation.started||naturalInvitation||Boolean(stock.samples?.invitation)}};
}

const object = (value: unknown) => value && typeof value==='object' ? value as Record<string,unknown> : {};
const validPoint = (value: unknown): Vec3 | undefined => Array.isArray(value)&&value.length===3&&value.every(Number.isFinite)
  ? [value[0],value[1],value[2]] : undefined;

export function readFlowerStock(
  value: unknown,
  old: FlowerStock,
  night: number,
  allowedSite: (point: Vec3) => { id:string; capacity:number } | undefined,
): FlowerStock {
  if (!value || typeof value!=='object') return old;
  const input=object(value), result=emptyFlowerStock();
  const earned=Array.isArray(input.earned)?input.earned.filter(isFlowerKind):[];
  for (const kind of FLOWER_ORDER) {
    if (!earned.includes(kind)) break;
    result.earned.push(kind);
    const count=object(input.counts)[kind];
    if(typeof count==='number'&&Number.isSafeInteger(count)&&count>0)result.counts[kind]=Math.min(999,count);
  }
  const sample=object(input.samples), status=object(input.invitation);
  if (night>=1 && night===sample.night && Array.isArray(sample.kinds)) {
    const kinds=result.earned.filter(kind=>sample.kinds instanceof Array&&sample.kinds.includes(kind));
    if(kinds.length)result.samples={night,kinds,invitation:sample.invitation===true&&kinds.length===FLOWER_ORDER.length};
  }
  result.invitation.started=result.earned.length===FLOWER_ORDER.length&&status.started===true;
  result.invitation.witnessed=result.invitation.started&&status.witnessed===true;
  for (const raw of Array.isArray(input.boxes)?input.boxes:[]) {
    const box=object(raw),kind=box.kind,position=validPoint(box.position),source=box.source;
    if(!isFlowerKind(kind)||!position||(source!=='stock'&&source!=='sample'))continue;
    const site=allowedSite(position);
    if(!site||result.boxes.length>=site.capacity||availableFlower(result,kind,source,night)<=0)continue;
    if(result.boxes.some(other=>allowedSite(other.position)?.id!==site.id||
      Math.hypot(...other.position.map((c,i)=>c-position[i]!))<BOX_GAP))continue;
    result.boxes.push({kind,source,position});
  }
  return result;
}
