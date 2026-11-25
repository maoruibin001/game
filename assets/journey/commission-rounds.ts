import { commissionSite, commissionSiteIds, isCommissionSite, type CommissionSiteId } from './commission-sites.ts';
import { FLOWERS, FLOWER_ORDER, isFlowerKind, type FlowerKind } from './flower-catalog.ts';
import { adoptOldBoxes } from './flower-party.ts';
import { awardFlower, awardRepeatBox, nextFlower } from './flower-stock.ts';
import type { DurableJourney, Photo } from './types.ts';

export const STORY_COMMISSIONS = [
  { title:'给阿禾寄一座山', hint:'按 J 打开来信，挑一张山口实拍寄给阿禾。一座、两座或没对齐，她都会回信。' },
  { title:'帮阿禾认路', hint:'在林间拍一张路标与风车，或者在东岭拍「在哪拐」和「认哪里」两张。回到来信寄出。' },
  { title:'替阿公补拍老窗', hint:'先在旧镇打开木屏、拍石拱落桥。白天上禅院，把山门拍进老窗，再到客堂交照领金柳。' },
] as const;

export interface CommissionRound {
  number: number;
  afterSequence: number;
  orders: { site: CommissionSiteId; photoId?: string }[];
  seen: CommissionSiteId[];
  previous?: { number: number; reward: FlowerKind };
  legacy?: true;
}

export const firstCommissionRound = (): CommissionRound => ({ number:1, afterSequence:0, orders:[], seen:[] });

export function storyCommissionProgress(d: DurableJourney) {
  return [Boolean(d.openingReply), Boolean(d.replyPhotos.forest), Boolean(d.fireworks)] as const;
}

/** Daylight sites can be planned for the next opening, and the market has a
 * nightly opening. The revealed room is the only extra progression lock once
 * the player has opened the wood screen and crossed the bridge for the hall. */
export function eligibleCommissionSites(d: DurableJourney): CommissionSiteId[] {
  if (!d.fireworks || !d.gateOpened || !d.stamps.town) return [];
  return commissionSiteIds.filter(id => !commissionSite(id).hidden || d.sixth.displayed);
}

function drawRound(d: DurableJourney, number: number, previous?: CommissionRound['previous']): CommissionRound | undefined {
  const choices = eligibleCommissionSites(d);
  let seed = ((d.weatherCycle.seed >>> 0) ^ Math.imul(number, 0x9e3779b1)) >>> 0;
  const nextRandom = () => {
    // Mix all bits before shuffling so adjacent world seeds do not yield
    // correlated picks or leave neighboring entries disproportionately absent.
    seed = (seed + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(seed ^ (seed >>> 15), seed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 0x100000000;
  };
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(nextRandom() * (i + 1));
    [choices[i], choices[j]] = [choices[j]!, choices[i]!];
  }
  const groups = new Set<string>();
  const round = d.photoCommissions;
  let seen = [...round.seen];
  const orders: CommissionRound['orders'] = [];
  for (let i = 0; i < 3; i++) {
    const available = choices.filter(site => !groups.has(commissionSite(site).group));
    let site = available.find(site => !seen.includes(site));
    if (!site) { seen = []; site = available[0]; }
    if (!site) return;
    groups.add(commissionSite(site).group); seen.push(site); orders.push({site});
  }
  return { number, afterSequence:d.totalPhotos, orders, seen, ...(previous ? {previous} : {}), ...(round.legacy ? {legacy:true as const} : {}) };
}

export function startNextStoryRound(d: DurableJourney): boolean {
  if (d.photoCommissions.number !== 1 || !(d.photoCommissions.legacy && d.fireworks) && !storyCommissionProgress(d).every(Boolean)) return false;
  const round = drawRound(d, 2, { number: 1, reward: 'gold' });
  if (!round) return false;
  d.photoCommissions = round;
  return true;
}

export function commissionPhotoFits(round: CommissionRound, site: CommissionSiteId, photo: Photo): boolean {
  return Boolean(photo.original && photo.sequence > round.afterSequence && photo.commissionSites?.includes(site)
    && !round.orders.some(order => order.photoId === photo.id));
}

export function submitCommission(d: DurableJourney, number: number, site: CommissionSiteId, photo: Photo): boolean {
  const round = d.photoCommissions;
  const order = round.orders.find(order => order.site === site);
  if (round.number !== number || !order || order.photoId || !commissionPhotoFits(round, site, photo)) return false;
  d.photoCommissions = {...round, orders:round.orders.map(other => other === order ? {...other, photoId:photo.id} : other)};
  return true;
}

export function commissionReward(d: DurableJourney): FlowerKind {
  const stock = d.flowerStock ?? adoptOldBoxes(d);
  return nextFlower(stock.earned) ?? FLOWER_ORDER[(d.photoCommissions.number - 2) % FLOWER_ORDER.length] ?? 'gold';
}

export function claimCommissionRound(d: DurableJourney, number: number): string | undefined {
  const round = d.photoCommissions;
  if (round.number !== number || round.orders.length !== 3 || !round.orders.every(order => order.photoId)) return;
  const reward = commissionReward(d);
  const next = drawRound(d, number + 1, {number, reward});
  if (!next) return;
  const stock = d.flowerStock ?? adoptOldBoxes(d);
  d.flowerStock = nextFlower(stock.earned) ? awardFlower(stock, reward) : awardRepeatBox(stock, reward);
  d.photoCommissions = next;
  return FLOWERS[reward];
}

export function readCommissionRound(value: unknown, d: DurableJourney): CommissionRound {
  if (!value || typeof value !== 'object') {
    // Completed old journeys carry their original hall reward into round two.
    return {...firstCommissionRound(), ...(d.started ? {legacy:true as const} : {})};
  }
  const input = value as Partial<CommissionRound>;
  if (input.number === 1) return {...firstCommissionRound(), ...(input.legacy === true ? {legacy:true as const} : {})};
  if (!Number.isSafeInteger(input.number) || input.number! < 2 || input.number! >= 1e9
      || !Number.isSafeInteger(input.afterSequence) || input.afterSequence! < 0 || input.afterSequence! > d.totalPhotos
      || !Array.isArray(input.orders) || input.orders.length !== 3) return firstCommissionRound();
  const groups = new Set<string>(), submitted = new Set<string>(), orders: CommissionRound['orders'] = [];
  for (const raw of input.orders) {
    if (!raw || !isCommissionSite(raw.site) || groups.has(commissionSite(raw.site).group)) return firstCommissionRound();
    groups.add(commissionSite(raw.site).group);
    const seq = typeof raw.photoId === 'string' && /^photo-[1-9][0-9]{0,9}$/.test(raw.photoId) ? Number(raw.photoId.slice(6)) : 0;
    const photoId = raw.photoId && seq > input.afterSequence! && seq <= d.totalPhotos && !submitted.has(raw.photoId) ? raw.photoId : undefined;
    if (photoId) submitted.add(photoId);
    orders.push({site:raw.site,...(photoId ? {photoId} : {})});
  }
  const previous = input.previous && input.previous.number === input.number! - 1 && isFlowerKind(input.previous.reward)
    ? {number:input.previous.number, reward:input.previous.reward} : undefined;
  return {number:input.number!, afterSequence:input.afterSequence!, orders,
    seen:[...new Set(Array.isArray(input.seen) ? input.seen.filter(isCommissionSite) : [])],
    ...(previous ? {previous} : {}), ...(input.legacy === true ? {legacy:true as const} : {})};
}
