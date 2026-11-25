import { hallCollectsAt, HALL_OPEN } from './afternoon.ts';
import { inSixthRoom } from '../shanye-world/sixth-layout.ts';
import { DAY_MINUTES, GAME_MINUTES_PER_REAL_SECOND, MAX_JOURNEY_DAY } from './day-clock.ts';
import { inFootprint, launchSite, NIGHT_MARKET, NIGHT_STOPS, onMountain, townContains } from '../shanye-world/night-layout.ts';
import { STATIC_OBSTACLES, terrainHeight } from '../shanye-world/world-layout.ts';
import type { DurableJourney, JourneyState, RuntimeJourney, Vec3 } from './types.ts';

export interface NightProgress {
  torch: boolean;
  placed: Vec3 | null;
  spent: boolean;
  fishLetter: 'unread' | 'carrying' | 'delivered';
  scarletClaimed: boolean;
  scarletPlaced: Vec3 | null;
  scarletSpent: boolean;
  goldEncore: { night: number; spent: boolean } | null;
  repriseNight: number | null;
  // Keep the first launch even after dawn so a later gold box cannot replay the response.
  firstWillowLantern?: { night: number; ignitedAt: number };
}

export const FIREWORK_NAMES = { gold:'金柳', scarlet:'朱红' } as const;
export type FireworkKind = keyof typeof FIREWORK_NAMES;
export type FireworkLaunches = Partial<Record<FireworkKind, Vec3>>;
export const FIREWORK_KINDS = ['gold','scarlet'] as const;
export const FIREWORK_DISTANCE = 1.05;
export const FIREWORK_FINALE_SECONDS = 42;
export const FIRST_WILLOW_CORE_OUT = 13.10;
export const FIRST_WILLOW_RESPONSE = { start: 13.40, end: 17.03, swayEnd: 18.20 } as const;
export const FIRST_WILLOW_DURATION = 17.4;
export const FIRST_WILLOW_CUE = {kind:'gold',rise:3.2,burst:8.9,offset:[.65,17.6,-7.2],
  radius:10.7,count:29,color:'gold',shape:'willow'} as const;
export const GOLDEN_WILLOW_BURST = 28.2;
export const SCARLET_FINALE_BURST = 29.05;
export const FIREWORK_CUES = [
  { kind:'gold', rise:1.3, burst:3.1, offset:[-1,12,-4.2], radius:3.5, count:42, color:'pearl', shape:'star' },
  { kind:'scarlet', rise:7, burst:10.3, offset:[0,9.8,-2.8], radius:3.9, count:16, color:'coral', shape:'petals' },
  { kind:'gold', rise:12.1, burst:15.4, offset:[5.4,15.2,-8.1], radius:4.4, count:62, color:'pearl', shape:'spray' },
  { kind:'gold', rise:25, burst:GOLDEN_WILLOW_BURST, offset:[1,17.2,-6.6], radius:9.4, count:27, color:'gold', shape:'willow' },
  { kind:'scarlet', rise:26.4, burst:SCARLET_FINALE_BURST, offset:[-1,11,-4.2], radius:5.2, count:22, color:'coral', shape:'petals' },
  { kind:'gold', rise:28.5, burst:31.3, offset:[7.4,14.2,-11.1], radius:3.1, count:46, color:'pearl', shape:'spray' },
] as const;

type ActiveShow = NonNullable<RuntimeJourney['fireworkShow']>;
export const fireworkCues = (show:ActiveShow) => show.party?.cues ?? (show.firstWillow ? [FIRST_WILLOW_CUE] : FIREWORK_CUES);

export const createNightProgress = (): NightProgress => ({
  torch:false, placed:null, spent:false, fishLetter:'unread',
  scarletClaimed:false, scarletPlaced:null, scarletSpent:false, goldEncore:null, repriseNight:null,
});
export const afterClosing = (d: DurableJourney) => !hallCollectsAt(d.clock.minute);
export const fireworkNight = (d: DurableJourney) => d.clock.day - Number(d.clock.minute < HALL_OPEN);
export const firstWillowIgnition = (d: DurableJourney) => ({night:fireworkNight(d),ignitedAt:d.playSeconds});

export function firstWillowLantern(d: DurableJourney) {
  const cue=d.night.firstWillowLantern;
  if(!cue||!afterClosing(d)||cue.night!==fireworkNight(d))return;
  const t=d.playSeconds-cue.ignitedAt;
  const {start,end,swayEnd}=FIRST_WILLOW_RESPONSE;
  if(t<start)return;
  const slide=Math.min(1,(t-start)/(end-start));
  const extension=slide*slide*(3-2*slide);
  const swing=(t-end)/(swayEnd-end);
  const angle=swing>0&&swing<1 ? .20*Math.sin(2*Math.PI*swing)*Math.pow(1-swing,1.4) : 0;
  return {extension,angle,lit:t>=end};
}

export const canInviteGold = (d: DurableJourney) => Boolean(afterClosing(d) && d.fireworks &&
  d.night.spent && d.night.scarletClaimed && !d.night.scarletSpent && d.night.goldEncore?.night !== fireworkNight(d));
export const canReprise = (d: DurableJourney) => Boolean(afterClosing(d) && d.fireworks && d.night.spent && d.night.scarletSpent);
export const repriseActive = (d: DurableJourney) => canReprise(d) && d.night.repriseNight===fireworkNight(d);
export const canRepriseHere = (d: DurableJourney) => canReprise(d) && !repriseActive(d) && Boolean(launchSite(d.player.position));
export const hasBox = (d: DurableJourney, kind: FireworkKind = 'gold') => repriseActive(d) || Boolean(d.fireworks && (kind==='gold'
  ? !d.night.spent || (d.night.goldEncore?.night===fireworkNight(d) && !d.night.goldEncore.spent)
  : d.night.scarletClaimed && !d.night.scarletSpent));
export const hasAnyFirework = (d: DurableJourney) => FIREWORK_KINDS.some(kind=>hasBox(d,kind));
export const canInviteGoldHere = (d: DurableJourney) => canInviteGold(d) && Boolean(launchSite(d.player.position));
export const fireworkPosition = (d: DurableJourney, kind: FireworkKind) =>
  hasBox(d,kind) ? kind==='gold' ? d.night.placed : d.night.scarletPlaced : null;
export const pairReady = (d: DurableJourney) => Boolean(fireworkPosition(d,'gold') && fireworkPosition(d,'scarlet'));

export function nightTravelBlock(d: DurableJourney, lit: boolean, from: Vec3, to: Vec3): 'mountain' | 'market' | 'photo-shop' | null {
  const dark = afterClosing(d);
  if (dark && !inSixthRoom(from) && inSixthRoom(to)) return 'photo-shop';
  if (!dark && !inFootprint(from, NIGHT_MARKET) && inFootprint(to, NIGHT_MARKET)) return 'market';
  if (dark && !onMountain(from) && onMountain(to) && !(d.fireworks && d.night.torch && lit)) return 'mountain';
  return null;
}

const distance = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const atFirework = (d: DurableJourney, kind: FireworkKind) => {
  const point=fireworkPosition(d,kind);
  return Boolean(point && distance(d.player.position,point)<=2.7);
};

export function canSetFirework(point: Vec3): boolean {
  if (!launchSite(point) || Math.abs(point[1] - terrainHeight(point[0], point[2])) > .15) return false;
  const [x,y,z] = point;
  if ([[.43,0],[-.43,0],[0,.43],[0,-.43]].some(([dx,dz])=>Math.abs(terrainHeight(x+dx!,z+dz!)-y) > .24)) return false;
  return !STATIC_OBSTACLES.some(b => x+.48>b.min[0] && x-.48<b.max[0] && z+.48>b.min[2] && z-.48<b.max[2] && y+.9>b.min[1] && y<b.max[1]);
}

export function proposedFirework(d: DurableJourney): Vec3 {
  const { position, yaw } = d.player;
  const x = position[0]+Math.sin(yaw)*1.55, z = position[2]-Math.cos(yaw)*1.55;
  return [x, terrainHeight(x,z), z];
}

export function fireworkPlacement(d: DurableJourney, kind: FireworkKind, point: Vec3) {
  if (townContains(point)) return { valid:false, hint:'镇内禁放烟花。请去镇外晒谷场或半山松台。' };
  const site = launchSite(point);
  if (!site || !canSetFirework(point)) return { valid:false, hint:'需要镇外开阔平地。走到划出的晒谷场或松台石面。' };
  const other = fireworkPosition(d,kind==='gold'?'scarlet':'gold');
  if (other && launchSite(other)!==site) return { valid:false, hint:'两盒要放在同一个场地。可先收回另一盒，再到这里布置。' };
  if (other && distance(other,point)<FIREWORK_DISTANCE) return { valid:false, hint:'两盒之间留出一步空地，再按 E 放下。' };
  return {valid:true,hint:`${site.title} · 按 E 放下${FIREWORK_NAMES[kind]}`};
}

export function nearbyNightInteraction(state: JourneyState, position: Vec3): string | null {
  const d = state.durable, r = state.runtime;
  if (r.placingFirework) return 'night-place';
  const dark = afterClosing(d);
  if (dark && !r.fireworkShow && (d.flowerStock
    ? d.flowerStock.boxes.some(box=>distance(position,box.position)<=2.7)
    : FIREWORK_KINDS.some(kind=>atFirework(d,kind)))) return 'night-ignite';
  const stops = [NIGHT_STOPS.footTorch, NIGHT_STOPS.upperTorch, ...(dark ? [NIGHT_STOPS.inn,NIGHT_STOPS.fish,NIGHT_STOPS.letter,NIGHT_STOPS.repair] : [])];
  return stops.find(s=>distance(position,[s.x,terrainHeight(s.x,s.z),s.z])<=s.radius)?.id ?? null;
}

export function lodgingClock(d: DurableJourney) {
  const nextDay = d.clock.minute >= HALL_OPEN;
  if (nextDay && d.clock.day >= MAX_JOURNEY_DAY) return null;
  const minutes = (nextDay ? DAY_MINUTES : 0) + HALL_OPEN - d.clock.minute;
  return { clock:{day:d.clock.day+Number(nextDay),minute:HALL_OPEN}, weatherSeconds:minutes/GAME_MINUTES_PER_REAL_SECOND };
}

export function readNightProgress(value: unknown, hasReward: boolean, clock: DurableJourney['clock'], playSeconds:number): NightProgress {
  const raw = value && typeof value === 'object' ? value as Partial<NightProgress> : {};
  const readPoint = (value: unknown): Vec3 | null => {
    if (!Array.isArray(value) || value.length!==3 || !value.every(Number.isFinite)) return null;
    const point:Vec3=[value[0],value[1],value[2]];
    return canSetFirework(point)?point:null;
  };
  const spent = hasReward && raw.spent === true;
  const fishLetter = raw.fishLetter === 'delivered' || raw.fishLetter === 'carrying' ? raw.fishLetter : 'unread';
  const scarletClaimed=hasReward && fishLetter==='delivered' && raw.scarletClaimed===true;
  const scarletSpent=scarletClaimed && raw.scarletSpent===true;
  const activeNight=clock.day-Number(clock.minute<HALL_OPEN);
  const encore=raw.goldEncore;
  const goldEncore = spent && scarletClaimed && encore && Number.isSafeInteger(encore.night) &&
    encore.night>=1 && encore.night<=activeNight ? {night:encore.night,spent:encore.spent===true} : null;
  const repriseNight=spent && scarletSpent && !hallCollectsAt(clock.minute) &&
    raw.repriseNight===activeNight && activeNight>=1 ? activeNight : null;
  const placed=hasReward && (!spent || repriseNight!==null || (goldEncore?.night===activeNight && !goldEncore.spent)) ? readPoint(raw.placed) : null;
  let scarletPlaced=scarletClaimed && (!scarletSpent || repriseNight!==null) ? readPoint(raw.scarletPlaced) : null;
  if (scarletPlaced && placed && (launchSite(scarletPlaced)!==launchSite(placed) || distance(scarletPlaced,placed)<FIREWORK_DISTANCE)) scarletPlaced=null;
  const lantern=raw.firstWillowLantern;
  const firstLantern=hasReward && lantern && Number.isSafeInteger(lantern.night) && lantern.night>=1
    && lantern.night<=activeNight && Number.isFinite(lantern.ignitedAt)
    && lantern.ignitedAt>=0 && lantern.ignitedAt<=playSeconds ? lantern : undefined;
  return {...(firstLantern?{firstWillowLantern:firstLantern}:{}),torch:hasReward && raw.torch===true, spent, placed, fishLetter, scarletClaimed, scarletPlaced, scarletSpent, goldEncore, repriseNight};
}
