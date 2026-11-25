import { GAME_MINUTES_PER_REAL_SECOND } from './day-clock.ts';
import { evaluateForestSubjects } from './photography.ts';
import { PHOTO_ANCHORS, terrainHeight } from '../shanye-world/world-layout.ts';
import type { AnchorId, AreaId, Photo, PhotoObservation, ProjectedAnchor, Vec3, WeatherCycle, WeatherId } from './types.ts';
import type { JourneyClock } from './day-clock.ts';
import { weatherProbabilitiesAtOffset } from './weather.ts';
import { estimateRoadJourney } from './road-route-distance.ts';

export type PhotoOutingSlot = 'morning' | 'afternoon' | 'sunset';
export type PhotoSpotId = 'post-porch' | 'forest-windmill' | 'town-arch' | 'ridge-mail-road';
export interface CheckInSummary { day: number; slot: PhotoOutingSlot; spotId: string }
export interface PhotoOutingWindow { startMinute: number; endMinute: number; active: boolean; nextDay: boolean }
export interface PhotoSpot {
  id: PhotoSpotId; title: string; area: AreaId; position: Vec3; target: Vec3; radius: number;
  facingHint: string; compositionHint: string; preparation: string;
}
const feet = (x: number, z: number): Vec3 => [x, terrainHeight(x, z), z];
export const PHOTO_SPOTS: readonly PhotoSpot[] = Object.freeze([
  { id: 'post-porch', title: '邮局廊前', area: 'post', position: feet(2, -214), target: [-3, 17.5, -235], radius: 7,
    facingHint: '站在邮局北侧廊前，面向南偏西，回望门窗和屋檐。', compositionHint: '日程留影只需门窗清楚入镜；也可把门与檐线同框，尝试相机里的可选构图「廊前告别」。', preparation: '无需机关；站在廊前开阔处，避免贴墙。' },
  { id: 'forest-windmill', title: '风铃前的风车', area: 'forest', position: feet(-170, -49.5), target: PHOTO_ANCHORS.forest.target, radius: 6,
    facingHint: '沿林间邮路到侧置风铃南侧，面向北方风车，让铜铃留在右手边。', compositionHint: '让近处铜铃留在风车一侧，叶片完整入镜；可用标准镜头拉近。', preparation: '无需机关；不要站在风铃立柱后。' },
  { id: 'town-arch', title: '石拱里的双峰', area: 'town', position: feet(155, -3), target: PHOTO_ANCHORS.town.target, radius: 6,
    facingHint: '走到石拱南侧，面向北方；雨天把石拱与红邮筒一起留下。', compositionHint: '近处石拱和红邮筒、门内远山都要清楚，稍向拱门走近。', preparation: '到石拱西侧找系着红绳的绞盘，按 E 打开木屏。' },
  { id: 'ridge-mail-road', title: '东岭 · 晚照崖', area: 'ridge', position: feet(64, 204), target: [-170, 85, -25], radius: 8,
    facingHint: '东岭长椅旁面向西南。把崖松留在左边，右侧留一点天空给落日。', compositionHint: '让远处风车和太阳一起入镜，给天空留出上半幅；山体可能提前遮住太阳。', preparation: '沿东岭古道上山；经过旧镇时先开木屏。提前到达，18:20 是太阳时日落标志。' },
]);
export const PHOTO_OUTING_SLOTS = Object.freeze([
  { id: 'morning' as const, title: '晨间来信', startMinute: 360, endMinute: 540 },
  { id: 'afternoon' as const, title: '午后漫游', startMinute: 780, endMinute: 1060 },
  { id: 'sunset' as const, title: '日落与雨幕', startMinute: 1060, endMinute: 1100 },
]);
const WEATHER_IDS: readonly WeatherId[] = ['morning', 'rain', 'afterglow'];
const clockAt = (clock: JourneyClock, extraMinutes: number): JourneyClock => {
  const minute = clock.minute + extraMinutes; return { day: clock.day + Math.floor(minute / 1440), minute: minute % 1440 };
};
export const photoSpotById = (id: string | null): PhotoSpot | undefined => PHOTO_SPOTS.find(s => s.id === id);
export const isPhotoOutingSlot = (value: unknown): value is PhotoOutingSlot => PHOTO_OUTING_SLOTS.some(slot => slot.id === value);
export function photoOutingSlotAt(clock: JourneyClock): PhotoOutingSlot | null {
  return PHOTO_OUTING_SLOTS.find(s => clock.minute >= s.startMinute && clock.minute < s.endMinute)?.id ?? null;
}
/** A covered building works in any weather; exposed views have weather-specific alternatives. */
export function suitablePhotoWeather(spotId: PhotoSpotId, slot: PhotoOutingSlot): readonly WeatherId[] {
  if (spotId === 'post-porch') return WEATHER_IDS;
  if (spotId === 'town-arch') return slot === 'sunset' ? ['rain'] : ['rain', 'afterglow'];
  // Legacy weather IDs describe sky conditions, not time: morning = 晴朗,
  // afterglow = 多云. Only a clear sky shows the physical sun at sunset.
  if (spotId === 'ridge-mail-road' && slot === 'sunset') return ['morning'];
  return ['morning', 'afterglow'];
}
const quality: Record<PhotoSpotId, Record<WeatherId, number>> = {
  'post-porch': { morning: .42, rain: .86, afterglow: .72 },
  'forest-windmill': { morning: 1, rain: .15, afterglow: .9 },
  'town-arch': { morning: .45, rain: 1, afterglow: .92 },
  'ridge-mail-road': { morning: .82, rain: .08, afterglow: .72 },
};
function spotGuidance(spot: PhotoSpot, slot: PhotoOutingSlot, gateOpened: boolean) {
  if (spot.id === 'ridge-mail-road') {
    const sunset = slot === 'sunset';
    return {
      preparation: `沿东岭古道上山，在晚照崖长椅旁停下；${gateOpened ? '' : '经过旧镇时先开木屏。'}${sunset ? '17:40 起，晴日的余光会扫过崖顶。18:20 日落，山体可能提前遮日。' : '白天可以看风车与山谷，不必等太阳入镜。'}`,
      facingHint: sunset ? '在东岭长椅旁面向西南。把横松放在左侧，晴朗时落日会在枝梢右边。让几穗芒草从画面下沿探进来。' : '在东岭长椅旁面向西南的风车与山谷，稍向左转就能带上崖松。',
      compositionHint: sunset ? '晴朗时让远处风车和太阳一起入镜，给天空留出上半幅；若雨云遮日，可改拍邮局屋檐或查看今日推荐。'
        : '让远处风车与层叠山谷清楚入镜，留下一段出发时的邮路。',
    };
  }
  return { preparation: spot.id === 'town-arch' && gateOpened ? '木屏已打开，可以在拱门外找构图。' : spot.preparation,
    facingHint: spot.facingHint, compositionHint: spot.compositionHint };
}
export interface PhotoOutingRecommendation {
  spotId: PhotoSpotId; spotTitle: string; area: AreaId; position: Vec3; target: Vec3;
  slot: PhotoOutingSlot; slotTitle: string; day: number;
  status: 'upcoming' | 'active' | 'missed' | 'completed'; window: PhotoOutingWindow;
  nextWindow: { day: number; startMinute: number; endMinute: number };
  distanceMeters: number; etaSeconds: number; arrivalClock: JourneyClock; canArriveInWindow: boolean;
  weatherProbability: number; weatherProbabilities: Record<WeatherId, number>; forecastAt: JourneyClock;
  isCompleted: boolean; preparation: string; facingHint: string; compositionHint: string;
  routePoints: readonly Vec3[]; routeIds: readonly string[];
}
export interface PhotoOutingsInput {
  clock: JourneyClock; weather: WeatherId; weatherCycle: WeatherCycle; position: Vec3; gateOpened: boolean;
  checkIns: readonly CheckInSummary[]; trackedSpotId: string | null; trackedSlot?: PhotoOutingSlot | null; creativeMode?: boolean;
}
export function buildPhotoOutings(input: PhotoOutingsInput): { recommendations: PhotoOutingRecommendation[]; tracked: PhotoOutingRecommendation | null } {
  const { clock } = input;
  const journeys = new Map(PHOTO_SPOTS.map(spot => [spot.id, estimateRoadJourney(input.position, spot.position)]));
  const make = (spot: PhotoSpot, slot: typeof PHOTO_OUTING_SLOTS[number]): PhotoOutingRecommendation => {
    const road = journeys.get(spot.id)!;
    const completed = input.checkIns.some(c => c.day === clock.day && c.slot === slot.id);
    const active = clock.minute >= slot.startMinute && clock.minute < slot.endMinute;
    const missed = clock.minute >= slot.endMinute;
    const nextDay = missed || completed;
    const nextWindow = { day: clock.day + Number(nextDay), startMinute: slot.startMinute, endMinute: slot.endMinute };
    const arrivalClock = clockAt(clock, road.etaSeconds * GAME_MINUTES_PER_REAL_SECOND);
    const futureMinutes = Math.max(road.etaSeconds * GAME_MINUTES_PER_REAL_SECOND, (nextWindow.day - clock.day) * 1440 + slot.startMinute - clock.minute, 0);
    const weatherProbabilities = weatherProbabilitiesAtOffset(input.weather, input.weatherCycle, futureMinutes / GAME_MINUTES_PER_REAL_SECOND);
    const weatherProbability = suitablePhotoWeather(spot.id, slot.id).reduce((sum, weather) => sum + weatherProbabilities[weather], 0);
    return { spotId: spot.id, spotTitle: spot.title, area: spot.area, position: spot.position, target: spot.target,
      slot: slot.id, slotTitle: slot.title, day: clock.day, status: completed ? 'completed' : missed ? 'missed' : active ? 'active' : 'upcoming',
      window: { startMinute: slot.startMinute, endMinute: slot.endMinute, active, nextDay }, nextWindow,
      distanceMeters: road.distanceMeters, etaSeconds: road.etaSeconds, arrivalClock,
      canArriveInWindow: arrivalClock.day * 1440 + arrivalClock.minute < nextWindow.day * 1440 + slot.endMinute,
      weatherProbability, weatherProbabilities, forecastAt: clockAt(clock, futureMinutes), isCompleted: completed,
      ...spotGuidance(spot, slot.id, input.gateOpened), routePoints: road.points, routeIds: road.routeIds };
  };
  const chosen = new Map<PhotoOutingSlot, PhotoOutingRecommendation>();
  const usedSpots = new Set<PhotoSpotId>();
  // A completed card is a record of the actual photograph. Reserve its location
  // before selecting new advice, without rewriting duplicate historical photos.
  for (const slot of PHOTO_OUTING_SLOTS) {
    const completedSpot = photoSpotById(input.checkIns.find(c => c.day === clock.day && c.slot === slot.id)?.spotId ?? null);
    if (completedSpot) { chosen.set(slot.id, make(completedSpot, slot)); usedSpots.add(completedSpot.id); }
  }
  // Let today's active/next window keep the best weather and reachable subject.
  // An already-missed morning card must not reserve the rainy afternoon's arch.
  const selectionOrder = [...PHOTO_OUTING_SLOTS].sort((a, b) => {
    const priority = (slot: typeof PHOTO_OUTING_SLOTS[number]) => clock.minute >= slot.endMinute ? 2 : clock.minute >= slot.startMinute ? 0 : 1;
    return priority(a) - priority(b) || a.startMinute - b.startMinute;
  });
  for (const slot of selectionOrder) {
    if (chosen.has(slot.id)) continue;
    const candidates = PHOTO_SPOTS.filter(spot => !usedSpots.has(spot.id)).map(spot => {
      const recommendation = make(spot, slot);
      const score = WEATHER_IDS.reduce((sum, weather) => {
        let value = quality[spot.id][weather];
        if (slot.id === 'sunset') value = spot.id === 'ridge-mail-road' ? weather === 'morning' ? 1.45 : .02
          : spot.id === 'town-arch' ? weather === 'rain' ? 1.5 : .1 : spot.id === 'post-porch' ? weather === 'rain' ? .85 : .25 : .15;
        return sum + recommendation.weatherProbabilities[weather] * value;
      }, 0);
      // Day changes only near-ties; it cannot overrule a substantially better forecast.
      const dailyVariation = ((clock.day * 13 + slot.startMinute + spot.id.length * 7) % 17) / 2;
      // A known unsuitable scene stays below a viable future option. Keep the
      // arrival warning when no photograph with a chance can still be reached.
      const availability = recommendation.weatherProbability <= 0 ? -2000 : recommendation.canArriveInWindow ? 0 : -1000;
      return { recommendation, score: score + dailyVariation + availability };
    });
    const recommendation = candidates.sort((a, b) => b.score - a.score)[0]!.recommendation;
    chosen.set(slot.id, recommendation); usedSpots.add(recommendation.spotId);
  }
  const recommendations = PHOTO_OUTING_SLOTS.map(slot => chosen.get(slot.id)!);
  const trackedSpot = photoSpotById(input.trackedSpotId);
  const trackedSlot = PHOTO_OUTING_SLOTS.find(s => s.id === input.trackedSlot)
    ?? PHOTO_OUTING_SLOTS.find(s => s.id === photoOutingSlotAt(clock))
    ?? PHOTO_OUTING_SLOTS.find(s => s.startMinute > clock.minute) ?? PHOTO_OUTING_SLOTS[0];
  // Following a card keeps its destination and time-of-day. Tomorrow's
  // forecast can still change and photography itself is never restricted.
  return { recommendations, tracked: trackedSpot ? make(trackedSpot, trackedSlot!) : null };
}

export type PhotoCheckInReason = 'ready' | 'creative-mode' | 'not-captured' | 'missing-scene' | 'scene-mismatch' | 'weather-transition' | 'outside-window' | 'already-completed' | 'wrong-place' | 'wrong-weather' | 'open-gate' | 'composition';
export interface PhotoCheckInInput {
  photo: Photo; observation: PhotoObservation; clock: JourneyClock; weather: WeatherId;
  gateOpened: boolean; checkIns: readonly CheckInSummary[]; creativeMode: boolean; captured: boolean;
}
export interface PhotoCheckInResult {
  matched: boolean; reason: PhotoCheckInReason; hint: string;
  checkIn?: { day: number; slot: PhotoOutingSlot; spotId: PhotoSpotId; photo: Photo };
}
function visible(anchor: ProjectedAnchor | undefined, minArea = .00012) {
  return !!anchor && [anchor.x, anchor.y, anchor.width, anchor.height, anchor.depth, anchor.visibleFraction].every(Number.isFinite)
    && !anchor.occluded && anchor.visibleFraction >= .65 && anchor.depth > 0
    && anchor.x >= .04 && anchor.x <= .96 && anchor.y >= .04 && anchor.y <= .96
    && anchor.width > 0 && anchor.height > 0 && anchor.width <= 4 && anchor.height <= 4 && anchor.width * anchor.height >= minArea;
}
/** Call only for a newly captured camera result; entering a region grants nothing. */
export function evaluatePhotoCheckIn(input: PhotoCheckInInput): PhotoCheckInResult {
  const reject = (reason: PhotoCheckInReason, hint: string): PhotoCheckInResult => ({ matched: false, reason, hint });
  if (input.creativeMode) return reject('creative-mode', '自由创作模式保留照片，但不登记日程打卡。');
  const { photo } = input;
  if (!input.captured || !photo.original || photo.original.bytes <= 0 || photo.original.width <= 0 || photo.original.height <= 0)
    return reject('not-captured', '到达后请用相机拍下真实照片，再留下今日邮戳。');
  const scene = photo.scene, sceneClock = scene?.clock;
  if (!scene || !sceneClock) return reject('missing-scene', '这张照片没有拍摄时的时间与天色记录，不能补记日程。');
  if (sceneClock.day !== input.clock.day || Math.abs(sceneClock.minute - input.clock.minute) > .02 || scene.weather !== input.weather
    || Math.hypot(...photo.pose.position.map((v, i) => v - scene.subject.position[i]!)) > .75)
    return reject('scene-mismatch', '以快门瞬间的地点、时间和天色为准，请重新拍摄。');
  if (!Number.isFinite(scene.weatherBlend) || scene.weatherBlend < .98) return reject('weather-transition', '天色还在变化，等光线稳定后再按快门。');
  const slot = photoOutingSlotAt(sceneClock);
  if (!slot) return reject('outside-window', '这张照片已保存；下一段摄影时光再来打卡。');
  if (input.checkIns.some(c => c.day === sceneClock.day && c.slot === slot)) return reject('already-completed', '这一时段的来信已经留下了，继续拍喜欢的风景吧。');
  const spot = PHOTO_SPOTS.find(s => photo.area === s.area && input.observation.area === s.area
    && Math.hypot(photo.pose.position[0] - s.position[0], photo.pose.position[2] - s.position[2]) <= s.radius
    && Math.abs(photo.pose.position[1] - s.position[1]) < 3);
  if (!spot) return reject('wrong-place', '沿推荐小路到拍照点，找到清楚的主体再按快门。');
  if (!suitablePhotoWeather(spot.id, slot).includes(scene.weather)) return reject('wrong-weather', '这阵天色更适合另一处景物；可保留当前路线，也可以查看今日推荐。');
  if (spot.id === 'town-arch' && !input.gateOpened) return reject('open-gate', spot.preparation);
  const anchors = input.observation.anchors as Partial<Record<AnchorId | 'sun-disc', ProjectedAnchor>>;
  const required: (AnchorId | 'sun-disc')[] = spot.id === 'post-porch' ? ['post-door'] : spot.id === 'forest-windmill' ? ['windmill', 'forest-chime']
    : spot.id === 'town-arch' ? ['stone-arch', 'mountain', 'red-mailbox'] : slot === 'sunset' ? ['memory-windmill', 'sun-disc'] : ['memory-windmill'];
  if (required.some(id => !visible(anchors[id], id === 'sun-disc' ? .00002 : .00012))) return reject('composition', spotGuidance(spot, slot, input.gateOpened).compositionHint);
  if(spot.id==='forest-windmill'){const composition=evaluateForestSubjects(input.observation);if(!composition.matched)return reject('composition',composition.hint);}
  return { matched: true, reason: 'ready', hint: '今天这一刻，已经留在照片里了。', checkIn: { day: sceneClock.day, slot, spotId: spot.id, photo } };
}
