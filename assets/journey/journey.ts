import { commissionTimeAllows } from './commission-sites.ts';
import { claimCommissionRound, firstCommissionRound, startNextStoryRound, submitCommission } from './commission-rounds.ts';
import { emptySixth, openSixth, operateSixth } from './sixth.ts';
import { COMMISSIONS, COMMISSION_STOPS, FLOWERS, isFlowerSubject, type CommissionStop } from './flower-catalog.ts';
import { completeCommission, emptyFlowerQuests, recordCommissionEvidence, stopCommission } from './flower-quests.ts';
import { adoptOldBoxes, partyPlacement } from './flower-party.ts';
import { nextFlower } from './flower-stock.ts';
import { applyFlowerAction, interactWithCommission, interactWithParty } from './flower-actions.ts';
import { AFTERNOON_STOPS } from '../shanye-world/afternoon-layout.ts';
import { afternoonPhoto, EVENING_BELL, hallCollectsAt, HALL_CLOSE, hasAfternoonDirections } from './afternoon.ts';
import {
  afterClosing, atFirework, canInviteGold, canInviteGoldHere, canReprise, canRepriseHere, createNightProgress, fireworkNight, fireworkPlacement, fireworkPosition,
  fireworkCues, firstWillowIgnition, FIREWORK_FINALE_SECONDS, FIREWORK_KINDS, FIREWORK_NAMES, FIRST_WILLOW_DURATION, FIRST_WILLOW_RESPONSE, hasAnyFirework, hasBox, lodgingClock,
  pairReady, proposedFirework, repriseActive, type FireworkLaunches,
} from './night.ts';
import { NIGHT_STOPS, onMountain } from '../shanye-world/night-layout.ts';
import { ALBUM_CAPACITY, AREA_LABELS, CAPTURE_THUMBNAIL_MAX_LENGTH, CARDS, DEFAULT_POSE, DEFAULT_SETTINGS, DISCOVERIES, ENDING_LETTER, FILM_CAPACITY, INTRO_LETTER, MOUNTAIN_LETTER, POST_OPENING_HINT, REPLY_LETTERS } from './content.ts';
import { nearOpeningEnvelope } from '../shanye-world/opening-envelope.ts';
import { DEFAULT_PHOTOGRAPHY, WEATHER_LABELS } from '../shared/photography-contract.ts';
import { cleanOriginalPhoto, cleanPhotography, cleanPhotoScene, isWeather } from './photo-settings.ts';
import { scenicSpotById } from './scenic-spots.ts';
import { advanceWeather, createWeatherCycle } from './weather.ts';
import { advanceDayClock, createDayClock, restDayClock, formatClock } from './day-clock.ts';
import { photoSpotById, evaluatePhotoCheckIn, isPhotoOutingSlot } from './photo-outings.ts';
import { nearbyRestPoint } from './rest-points.ts';
import { cleanThumbnail } from './thumbnail.ts';
export { cleanThumbnail } from './thumbnail.ts';
import { ridgeRouteSlot, cliffPhotoNote, routeSignFrame, evaluateFrame, evaluateMemoryFrame, evaluateCourtyardFrame } from './photography.ts';
import { copyPhoto, isMemoryPhoto, memoryClues, retainedMemoryPhotos } from './memories.ts';
import { completeRoute, routeAttachment, allRetainedPhotos, cleanEndingNote, cleanReplyNote, independentRoute, hasStoryReplies, isUsableReplyPhoto, replyNoteOptions, replyVariant } from './replies.ts';
import type { AreaId, CardId, DiscoveryId, DurableJourney, JourneyAction, JourneyEvent, JourneyState, Photo, Pose, RuntimeJourney, Settings, Transition } from './types.ts';

export const isArea = (value: unknown): value is AreaId => typeof value === 'string' && Object.hasOwn(AREA_LABELS, value);
export const isDiscovery = (value: unknown): value is DiscoveryId => typeof value === 'string' && Object.hasOwn(DISCOVERIES, value);
/** World-authored IDs are adapted here so the game and scene share one interaction contract. */
export function canonicalInteraction(id: string | null): string | null {
  if (id === null) return null;
  if (id === 'town-lever') return 'town-gate';
  if (id === 'postman') return 'postmaster';
  if (/^(post|forest|town|ridge)-mailbox$/.test(id)) return `mailbox:${id.slice(0, -8)}`;
  const key = id.startsWith('discover:') ? id.slice(9) : id;
  const aliases: Record<string, DiscoveryId> = { 'hidden-path': 'hidden-trail', stamp: 'old-stamp', 'old-card': 'lost-postcard', viewpoint: 'sunset-seat' };
  if (Object.hasOwn(aliases, key)) return `discover:${aliases[key]}`;
  if (isDiscovery(key)) return `discover:${key}`;
  return id;
}
export const isPose = (value: unknown): value is Pose => {
  if (!value || typeof value !== 'object') return false;
  const p = value as Pose;
  return isArea(p.area) && Array.isArray(p.position) && p.position.length === 3 && p.position.every(n => Number.isFinite(n) && Math.abs(n) <= 1_000_000)
    && Number.isFinite(p.yaw) && Number.isFinite(p.pitch);
};
export const cleanPose = (p: Pose): Pose => ({ position: [...p.position], area: p.area, yaw: p.yaw, pitch: Math.max(-1.55, Math.min(1.55, p.pitch)) });
export function cleanSettings(value: Partial<Settings>, base: Settings = DEFAULT_SETTINGS): Settings {
  const next = { ...base };
  for (const key of ['masterVolume', 'musicVolume', 'ambienceVolume', 'effectsVolume'] as const) {
    if (typeof value[key] === 'number' && Number.isFinite(value[key])) next[key] = Math.max(0, Math.min(1, value[key]));
  }
  if (typeof value.sensitivity === 'number' && Number.isFinite(value.sensitivity)) next.sensitivity = Math.max(0.25, Math.min(3, value.sensitivity));
  for (const key of ['invertY', 'cameraAssist', 'reducedMotion'] as const) if (typeof value[key] === 'boolean') next[key] = value[key];
  if (['high', 'balanced', 'low'].includes(value.quality ?? '')) next.quality = value.quality!;
  return next;
}
export function createRuntime(durable: DurableJourney): RuntimeJourney {
  return { screen: 'menu', letterMapPreview: null, showNavigation: false, returnScreen: 'play', pauseReasons: [], nearby: null, observation: null, lastComposition: null,
    notice: '', bridgeProgress: durable.stamps.town ? 1 : 0, ride: null, inputEpoch: 0, countdownSeconds: null, restRequest: 0, mailRequest: 0,
    torchLit:false, placingFirework:false, fireworkInHand:'gold', sixthPanel:null, partyHolding:null, fireworkShow:null, fishMotionUntil:0 };
}
export function createJourney(initialPose: Pose = DEFAULT_POSE, options: { weatherSeed?: number; pocketMapCollapsed?: boolean } = {}): JourneyState {
  if (!isPose(initialPose)) throw new Error('Invalid starting pose');
  const durable: DurableJourney = {
    version: 6, clock: createDayClock(), checkIns: [], trackedPhotoSpot: null, trackedPhotoSlot: null, trackedScenicSpot: null, storyRoute: null, pocketMapCollapsed: options.pocketMapCollapsed ?? false, creativeMode: false, creativeReturn: null, started: false, tutorial: { moved: false, looked: false, cameraOpened: false, photoTaken: false, compositionMatched: false },
    openingReply: null, openingSkipped: false, skills: { run:false, jump:false }, fireworks:null, sixth:emptySixth(), flowerStock:null, flowerQuests:emptyFlowerQuests(), photoCommissions:firstCommissionRound(), night:createNightProgress(),
    stamps: { forest: false, town: false }, cardPhotos: { forest: null, town: null }, routeDraft: {turn:null,destination:null}, replyPhotos: {forest:null,town:null}, legacyReplyUnlock:{forest:false,town:false}, endingNote:'', gateOpened: false,
    discoveries: [], album: [], film: [], weather: 'morning', weatherCycle: createWeatherCycle(options.weatherSeed), photography: { ...DEFAULT_PHOTOGRAPHY }, memories: { 'valley-letter': null }, endingPhoto: null, pendingPhoto: null, mailed: false, endingSeen: false, mailedFrom: null,
    totalPhotos: 0, playSeconds: 0, distanceWalked: 0, ziplineRides: 0, player: cleanPose(initialPose), settings: { ...DEFAULT_SETTINGS },
  };
  return { durable, runtime: createRuntime(durable) };
}
export function canPlay(state: JourneyState): boolean {
  return state.durable.started && state.runtime.pauseReasons.length === 0 && (state.runtime.screen === 'play' || state.runtime.screen === 'photo');
}

export function firstEnvelopeGuide(d: DurableJourney): boolean {
  return d.started && d.player.area === 'post' && !d.openingSkipped && !d.openingReply &&
    !d.tutorial.photoTaken && nearOpeningEnvelope(d.player.position);
}
export function canMove(state: JourneyState): boolean { return canPlay(state) && state.runtime.ride === null; }
export function canSendLetter(state: JourneyState): boolean { return hasStoryReplies(state.durable) && isUsableReplyPhoto(state.durable.endingPhoto) && !state.durable.mailed; }
export function worldState(state: JourneyState) {
  const d = state.durable, r = state.runtime;
  return { windmillTurning: d.stamps.forest, curtainOpen: d.stamps.forest, ziplineAvailable: d.stamps.forest,
    gateOpen: d.gateOpened, bridgeProgress: r.bridgeProgress, bridgeWalkable: d.stamps.town && r.bridgeProgress >= 1,
    townLights: d.stamps.town, courtyardOpen: d.stamps.town, sunset: d.clock.minute >= 1060 && d.clock.minute <= 1100, lunchDelivered: Boolean(d.replyPhotos.forest && !d.replyPhotos.forest.carriedOver), valleyLetterOpened: d.memories['valley-letter'] !== null,
    rideProgress: r.ride?.progress ?? null, canMove: canMove(state), paused: !canPlay(state) };
}
export function currentObjective(state: JourneyState): { title: string; detail: string } {
  const d = state.durable, area = d.player.area;
  const forestOutstanding = !d.stamps.forest && !d.replyPhotos.forest && !hasAfternoonDirections(d);
  if (!d.started) return { title: '让今天的风景，成为一封来信。', detail: INTRO_LETTER };
  if (afterClosing(d) && !d.creativeMode) {
    if (state.runtime.fireworkShow) return { title:'烟花在山口上空', detail:'举起相机，可以随时取景和按快门。' };
    if (d.flowerStock) {
      const stock = d.flowerStock;
      if (state.runtime.partyHolding) return { title:'找一处平地摆下花盒', detail:'看脚边的落点提示，在合适的位置按 E 放下。' };
      if (stock.samples?.night === fireworkNight(d) && stock.samples.invitation) {
        const placed = stock.boxes.length;
        return placed === 3 ? { title:'三处花盒都放好了', detail:'拿起火把，靠近任意一盒按 E 开始《满山赴约》。' }
          : { title:`布置满山赴约 · ${placed}/3`, detail:'从行囊取出留样，在同一场地分开摆三盒。' };
      }
      if (stock.boxes.length) return { title:'场地上已有花盒', detail:'可以继续布置，也可以拿起火把，靠近一盒按 E 点燃。' };
      if (stock.invitation.witnessed) return { title:'满山赴约 · 已盖戳', detail:'想再看一场，持火把到镇外布置点，在行囊选「再次赴约」。也可以回花街谜摊重访。' };
      if (!nextFlower(stock.earned)) return { title:'十种烟花齐了', detail:'持火把到镇外布置点，在行囊选「赴阿禾的约」，布置《满山赴约》。' };
      return { title:`花谱 · ${stock.earned.length}/10`, detail:'按 J 查看来信里的摄影委托。想放已取得的烟花，持火把到镇外布置点，打开行囊取花盒。' };
    }
    if (canInviteGold(d)) return { title:'让金柳和朱红同场', detail:'带朱红去镇外晒谷场。在布置点打开行囊，可请阿禾留一盒金柳。' };
    if (d.fireworks && d.night.fishLetter==='delivered' && !d.night.scarletClaimed)
      return { title:'花街留着一盒朱红', detail:'回缺角月牙的修灯铺，按 E 兑现夜信的谢礼。' };
    if (pairReady(d)) return { title:'金柳和朱红都放好了', detail:'拿起火把，靠近任意一盒按 E 一起点燃。' };
    if (canReprise(d) && !repriseActive(d)) return {
      title:'想补拍，两盒都能再放',
      detail:'回镇外布置点，打开行囊请阿禾留样。可换落点，再自己点火。',
    };
    if (hasAnyFirework(d)) return { title:'把烟花带到镇外', detail:d.night.scarletClaimed && !d.night.scarletSpent
      ? '将行囊里的花盒带去晒谷场。两盒放在同一场地，分开一步。'
      : d.night.torch ? '去镇外晒谷场或半山松台，从行囊取出金柳。'
        : '在山门或上院的火把架按 E 领取火把。也可以先逛花街。' };
    if (onMountain(d.player.position)) return { title:'禅院已闭院', detail:'可以沿原路下山。山路没有照明，留意脚下。花街夜市和客栈已开放。' };
    return { title:'花街夜市开门了', detail:'去旧镇石拱西南侧逛花街、摇鱼灯。可在客栈住到明早 06:20，再去客堂交照。' };
  }
  if (d.fireworks && d.photoCommissions.number >= 2 && !d.photoCommissions.legacy) {
    const done = d.photoCommissions.orders.filter(order => order.photoId).length;
    return done === 3 ? { title:'本轮三张照片齐了', detail:'按 J 打开来信，领取花盒并拆开下一轮委托。' }
      : { title:`第 ${d.photoCommissions.number} 轮摄影委托 · ${done}/3`, detail:d.night.spent
        ? '按 J 打开来信，选一处景点出发。' : '按 J 打开来信查看新委托。18:40 后也可以领火把，去镇外放金柳。' };
  }
  if (d.fireworks) return { title:d.night.spent ? '山口的烟花已经放完' : '烟花已收进背包', detail:d.night.spent ? '可以在旅行册查看你实拍的照片。' : '18:40 后可领火把，带烟花去镇外。' };
  // Meeting a destination takes priority over the suggested order at the post office.
  if (area === 'town' && !d.stamps.town) return { title: CARDS.town.title, detail: d.gateOpened
    ? '木屏已打开。站到石拱外，举起相机，让双峰落进拱门，红邮筒留在画面下方。'
    : '石拱旁的木屏挡住了远山。找到系红绳的绞盘，走近后按 E 转动摇柄。' };
  if (area === 'forest' && forestOutstanding) return { title: CARDS.forest.title, detail: '你已到风来林地。走到风铃前，举起相机，让近处风铃与远处风车清楚同框，别叠住叶片。' };
  if (area === 'post' && !d.openingReply && !d.openingSkipped) {
    const hasMountainPhoto = [...d.film, ...d.album].some(p => p.openingMountains !== undefined);
    return { title: '给阿禾寄一座山', detail: hasMountainPhoto ? '按 J 选一张寄给阿禾，也可以换个站位再拍。' : POST_OPENING_HINT };
  }
  if (!d.tutorial.photoTaken) return { title: '留住旅程的第一张风景', detail: '先拍一张眼前喜欢的风景，或按 J 读下一封来信。' };
  if (area === 'ridge' && forestOutstanding) return { title: REPLY_LETTERS.forest.title, detail: '在长椅岔口拍红箭头，再沿古道向旧镇走几步，面向西南，用望远镜头拍山脚的风车。按 J 把两张照片贴给阿禾。' };
  if (forestOutstanding && d.storyRoute === 'ridge') return { title: REPLY_LETTERS.forest.title, detail: '你选了东岭古道：沿亮线走西坡风铃小径上山，先到长椅旁拍红箭头，再用望远镜头拍山脚风车。' };
  if (forestOutstanding && d.storyRoute === 'forest') return { title: REPLY_LETTERS.forest.title, detail: '你选了林间近路：在邮局前岔口走西侧，沿林间邮路找风铃，让风铃和远处风车同框。' };
  if (forestOutstanding && !d.stamps.town) return { title: REPLY_LETTERS.forest.title, detail: '沿西侧林间邮路找风铃。也可以先去石巷旧镇，沿东岭上山，从高处替阿禾认路。' };
  if (forestOutstanding) return { title: REPLY_LETTERS.forest.title, detail: '去风来林地拍风铃和风车，或在东岭长椅分别拍红箭头与风车。阿禾等着认路。' };
  if (!d.stamps.town) return { title: CARDS.town.title, detail: d.gateOpened ? '回到石巷旧镇，从已打开木屏的石拱外，拍下门里的双峰。' : '下一张旧卡在石巷旧镇。到石拱旁找系红绳的绞盘，打开挡住远山的木屏。' };
  if (d.stamps.town && hasAfternoonDirections(d)) {
    if (!hallCollectsAt(d.clock.minute)) return { title: '禅院已停止收件', detail: '已拍的照片会保留。下一次开门是 06:20。' };
    return { title: '给阿公补拍老窗', detail: afternoonPhoto(d, 'hall-window')
      ? '在上院老窗旁按 E 交给客堂，对照新旧照片。' : '过落桥后沿石阶上禅院。到老窗背后，让窗格框住山门的屋脊再拍。' };
  }
  if (d.mailed) return { title: '信已寄出，山谷还在。', detail: '按你的步子继续走，补看错过的风景，或为旅行册再拍一张。' };
  for (const id of ['forest','town'] as const) if (!d.replyPhotos[id] && !d.legacyReplyUnlock[id]) return {title:`选一张照片回答：${REPLY_LETTERS[id].title}`,detail:'打开旅行册看看实拍照片，选“用这张回信”。不用等天气，也不必重开机关。'};
  if (!d.endingPhoto) return { title: '为这段旅程选一张自己的明信片', detail: '登上山脊看看，或选你喜欢的任何风景。拍照后选“作为最后一张”。' };
  return { title: '把今天的山谷寄出去', detail: '两封回信和你自己的照片都齐了。在任意邮筒按 E 寄信。' };
}
export function nearbyInteraction(state: JourneyState): { label: string; detail?: string; key: string; disabled?: boolean } | undefined {
  if (firstEnvelopeGuide(state.durable)) return;
  const id = state.runtime.nearby;
  if (!id) return undefined;
  const d = state.durable;
  if(id==='sixth:window')return {label:'看橱窗老照片',key:'E'};
  if(id==='sixth:room')return {label:'在空椅旁看合影',key:'E'};
  if(id==='sixth:enlarger')return {label:'查看放大台',key:'E'};
  if(id==='sixth:tin')return {label:d.sixth.tin?'查看梅花底片匣':'打开梅花底片匣',key:'E'};
  if (id.startsWith('flower:')) {
    const stop=id.slice(7) as CommissionStop,commission=stopCommission(stop);
    if(commission) {
      const ready=(d.photoCommissions.number===1||d.photoCommissions.legacy)&&nextFlower(d.flowerStock?.earned??adoptOldBoxes(d).earned)===commission&&completeCommission(d,commission)&&COMMISSIONS[commission].delivery===stop;
      return {label:ready?`领取${FLOWERS[commission]}`:COMMISSION_STOPS[stop].title,key:'E'};
    }
  }
  if (id === 'night-place') {
    if(state.runtime.partyHolding) {
      const holding=state.runtime.partyHolding,placement=partyPlacement(d,holding);
      return {label:`放下${FLOWERS[holding.kind]}`,key:'E',detail:placement.reason,disabled:!placement.ok};
    }
    const kind=state.runtime.fireworkInHand;
    return {label:`放下${FIREWORK_NAMES[kind]}`,key:'E',detail:fireworkPlacement(d,kind,proposedFirework(d)).hint};
  }
  if (id === 'night-ignite') return { label:d.flowerStock?.boxes.length ? `点燃 ${d.flowerStock.boxes.length} 盒烟花` : pairReady(d)?'点燃金柳与朱红':'点燃烟花', key:'E', detail:state.runtime.torchLit ? '点燃后退到开阔处，按 C 举机。' : '先打开行囊，拿起火把。' };
  if (id === NIGHT_STOPS.footTorch.id || id === NIGHT_STOPS.upperTorch.id)
    return { label:d.night.torch ? state.runtime.torchLit ? '收起火把' : '拿起火把' : '领取火把', key:'E',
      detail:d.fireworks ? '持火把可在闭院后上山。' : '夜间上山的火把留给领到烟花的旅人。' };
  if (id === NIGHT_STOPS.inn.id) return {label:'登记入住至 06:20', key:'E', detail:'留宿一晚。明早从这里出发，照片和交件进度会保留。'};
  if (id === NIGHT_STOPS.fish.id) return {label:'摇一摇纸鱼灯', key:'E', detail:'松手后还能看它在墙上游一圈。'};
  if (id === NIGHT_STOPS.letter.id) return {label:'读《鱼灯夜信》', key:'E', detail:'信封上的月牙缺了一角。'};
  if (id === NIGHT_STOPS.repair.id) {
    if (d.fireworks && d.night.fishLetter==='delivered' && !d.night.scarletClaimed && !d.flowerStock?.earned.includes('scarlet'))
      return {label:'领取谢礼「朱红」',key:'E',detail:'修灯人还记得你送来的鱼灯夜信。'};
    if (d.night.fishLetter==='delivered') return {label:'和修灯人聊聊',key:'E',detail:'檐下挂着缺角的月牙。'};
    return {label:'把夜信交给修灯人',key:'E',detail:'檐下挂着缺角的月牙。'};
  }
  if (id === AFTERNOON_STOPS.pineBag.id) return { label:d.skills.run ? '松针邮袋架' : '把底片箱交给松针邮袋', key:'E',
    detail:d.skills.run ? '相机已系牢。按 Shift 轻装快跑。' : '箱子上的邮戳是一株松。交给同样标记的邮袋，可学会快跑。', disabled:d.skills.run };
  if (id === AFTERNOON_STOPS.townBag.id) return { label:'查对屋脊邮袋', key:'E', detail:'要交的底片箱盖着松针印。' };
  if (id === AFTERNOON_STOPS.shoes.id) return { label:d.skills.jump ? '踏石跳已学会' : '向拓印摊借草鞋', key:'E',
    detail:d.skills.jump ? '走路时按空格起跳。桥东侧两块石头可试着跳。' : '退到石拱与木桥之间的路中间，抬头拍东侧青瓦的燕尾，再回摊前交照。', disabled:d.skills.jump };
  if (id === AFTERNOON_STOPS.window.id) return { label:d.fireworks ? '烟花已领' : '把老窗照交给客堂', key:'E',
    detail:d.fireworks ? '烟花已收进背包。' : '需有一份认路照片，并从上院老窗后拍到窗里的山门。', disabled:Boolean(d.fireworks) };
  if (id === 'town-gate') return { label: state.durable.gateOpened ? '木屏已经打开' : '转动红绳绞盘', detail: state.durable.gateOpened ? '走到石拱外，举起相机看看门里的山。' : '转动摇柄，打开挡住远山的木屏。', key: 'E', disabled: state.durable.gateOpened };
  if (id === 'zipline') return { label: '乘滑索回到山口', key: 'E', detail: state.durable.stamps.forest ? '沿途可以自由看风景，普通山路仍然可走。' : '先让风车重新转起来。', disabled: !state.durable.stamps.forest };
  if (id.startsWith('mailbox:')) return { label: state.durable.mailed ? '读山谷的回信' : canSendLetter(state) ? '寄出你的明信片' : '看看邮筒', key: 'E', detail: currentObjective(state).detail };
  if (id.startsWith('discover:')) {
    const key = id.slice(9);
    if (!isDiscovery(key)) return undefined;
    return { label: state.durable.discoveries.some(d => d.id === key) ? `再读一次：${DISCOVERIES[key].title}` : DISCOVERIES[key].title, key: 'E' };
  }
  if (id.startsWith('rest:')) return { label: '坐一会儿，等下一阵光', key: 'E', detail: '小憩推进山谷时间，天气仍按概率变化。' };
  if (id === 'forest-lunch' && worldState(state).lunchDelivered) return { label: '读饭盒上的纸条', key: 'E' };
  if (id === 'postmaster') return { label: '读邮递员的信', key: 'E' };
  return undefined;
}
function photoById(state: JourneyState, id: string): Photo | undefined {
  return allRetainedPhotos(state.durable).find(p => p.id === id);
}

/** All transitions return new state. Events are edge-triggered, never replayed by render/load. */
export function reduceJourney(state: JourneyState, action: JourneyAction): Transition {
  const d: DurableJourney = { ...state.durable, clock: { ...state.durable.clock }, checkIns: [...state.durable.checkIns], tutorial: { ...state.durable.tutorial }, stamps: { ...state.durable.stamps }, cardPhotos: { ...state.durable.cardPhotos }, routeDraft: {...state.durable.routeDraft}, replyPhotos: {...state.durable.replyPhotos}, legacyReplyUnlock:{...state.durable.legacyReplyUnlock}, memories: { ...state.durable.memories }, album: [...state.durable.album], film: [...state.durable.film], photography: { ...state.durable.photography }, discoveries: [...state.durable.discoveries], settings: { ...state.durable.settings } };
  const r: RuntimeJourney = { ...state.runtime, pauseReasons: [...state.runtime.pauseReasons], ride: state.runtime.ride ? { ...state.runtime.ride } : null };
  const next = { durable: d, runtime: r }, events: JourneyEvent[] = [];
  const emit = (type: JourneyEvent['type'], message?: string, detail: Partial<JourneyEvent> = {}) => { events.push({ type, ...(message ? { message } : {}), ...detail }); if (message) r.notice = message; };
  const blocked = (message: string) => emit('notice', message);
  const clearInputs = () => { r.inputEpoch++; emit('input:reset'); };
  const cancelCountdown = () => { if (r.countdownSeconds !== null) { r.countdownSeconds = null; emit('photo:timer-cancelled', '定时拍摄已取消。'); } };
  const departWithRoute = () => {
    if (r.screen === 'photo' || r.returnScreen === 'photo') {
      r.lastComposition = null;
      emit('camera:closed');
    }
    cancelCountdown();
    r.screen = 'play';
    r.returnScreen = 'play';
    r.letterMapPreview = null;
    r.showNavigation = true;
    r.pauseReasons = r.pauseReasons.filter(reason => reason !== 'ui');
    clearInputs();
    emit('screen:changed');
  };
  const selectScenic = (spotId: string | null) => {
    if (spotId !== null) {
      d.trackedPhotoSpot = null;
      d.trackedPhotoSlot = null;
    }
    d.trackedScenicSpot = spotId;
    r.letterMapPreview = null;
    if (spotId !== null) departWithRoute();
    else r.showNavigation = false;
  };
  const discover = (id: DiscoveryId) => {
    if (!isDiscovery(id) || r.nearby !== `discover:${id}`) return;
    if (id === 'last-letter' && !d.stamps.town) { blocked('小院还没有打开，先找回石拱里的风景。'); return; }
    if (d.discoveries.some(entry => entry.id === id)) { emit('discovery:read', DISCOVERIES[id].letter, { discovery: id }); return; }
    d.discoveries.push({ id, foundAtPlaySeconds: d.playSeconds });
    emit('discovery:found', DISCOVERIES[id].letter, { discovery: id });
  };
  switch (action.type) {
    case 'sixth': operateSixth(next,action.operation,action.photoId); break;
    case 'flower-gear': case 'flower-photo':
      if(applyFlowerAction(next,action,emit))clearInputs();
      break;
    case 'night-gear': {
      if (!d.started || d.creativeMode || r.ride || !['play','journal'].includes(r.screen) || r.pauseReasons.some(p=>p!=='ui')) break;
      if (action.operation === 'cancel') { r.placingFirework=false;r.partyHolding=null; break; }
      if(d.flowerStock&&action.operation!=='torch')break;
      const kind=action.kind ?? 'gold';
      if (action.operation === 'torch') {
        if (!d.night.torch || !d.fireworks) break;
        r.torchLit=!r.torchLit;
      } else if (action.operation === 'invite-gold') {
        if (!canInviteGoldHere(d) || r.fireworkShow) break;
        d.night={...d.night,placed:null,goldEncore:{night:fireworkNight(d),spent:false}};
        emit('notice','阿禾给你留了一盒金柳。和朱红摆在同一场地，两个落点隔开一步。');
      } else if (action.operation === 'reprise') {
        if (!canRepriseHere(d) || r.fireworkShow) break;
        d.night={...d.night,placed:null,scarletPlaced:null,repriseNight:fireworkNight(d)};
        emit('notice','两盒补拍留样已经备好。选两个位置放下，再持火把一起点燃。');
      } else if (action.operation === 'retrieve') {
        if (!hasBox(d,kind) || !atFirework(d,kind) || r.fireworkShow) { blocked('走到对应的花盒旁边，再从行囊收回。'); break; }
        d.night={...d.night,[kind==='gold'?'placed':'scarletPlaced']:null};
        r.placingFirework=afterClosing(d);r.fireworkInHand=kind;
      } else if (action.operation === 'take') {
        if (!hasBox(d,kind) || fireworkPosition(d,kind) || !afterClosing(d) || r.fireworkShow) break;
        r.placingFirework=true;r.fireworkInHand=kind;
      } else break;
      r.screen='play';r.returnScreen='play';r.pauseReasons=r.pauseReasons.filter(p=>p!=='ui');
      clearInputs(); break;
    }
    case 'start': {
      const returning = d.started;
      d.started = true; r.screen = d.mailed && !d.endingSeen ? 'ending' : 'play'; r.returnScreen = 'play';
      clearInputs(); emit(returning ? 'journey:continued' : 'journey:started', returning ? currentObjective(next).detail : firstEnvelopeGuide(d) ? undefined : INTRO_LETTER);
      break;
    }
    case 'return-to-menu':
      if (r.ride) { d.player = cleanPose(r.ride.safeStart); r.ride = null; }
      r.screen = 'menu'; r.sixthPanel=null; r.returnScreen = 'play'; r.nearby = null; clearInputs(); emit('journey:menu'); break;
    case 'set-screen': {
      if (!d.started || r.screen === 'ending') break;
      if (r.ride && action.screen !== 'paused' && action.screen !== 'play') { blocked('先把这一段风景看完，到站后再打开旅行册。'); break; }
      if ((action.screen === 'journal' || action.screen === 'map' || action.screen === 'paused') && (r.screen === 'play' || r.screen === 'photo')) r.returnScreen = r.screen;
      r.sixthPanel=null;
      r.letterMapPreview = action.screen === 'map' && r.screen === 'journal' ? action.letterMapPreview ?? null : null;
      r.screen = action.screen === 'play' ? r.returnScreen : action.screen;
      clearInputs(); emit('screen:changed'); break;
    }
    case 'submit-commission': {
      if (!d.started || d.creativeMode || r.screen !== 'journal' || r.ride || r.pauseReasons.some(reason => reason !== 'ui')) break;
      const photo = photoById(next, action.photoId);
      if (photo && submitCommission(d, action.round, action.site, photo)) emit('notice', '委托照片已签收。', {photoId:photo.id});
      else blocked('请从本轮委托下面选择一张新拍、主体合格的原片。');
      break;
    }
    case 'claim-commission-round': {
      if (!d.started || d.creativeMode || r.screen !== 'journal' || r.ride || r.pauseReasons.some(reason => reason !== 'ui')) break;
      const reward = claimCommissionRound(d, action.round);
      if (reward) emit('reward:fireworks', `收下了一盒「${reward}」。新一轮委托已夹在来信里。`);
      break;
    }
    case 'send-opening-photo': {
      if (!d.started || r.screen !== 'journal') break;
      const photo = photoById(next, action.photoId);
      if (!photo?.original || photo.area !== 'post' || photo.openingMountains === undefined || photo.id === d.openingReply?.id) break;
      d.openingReply = copyPhoto(photo);
      d.openingSkipped = false;
      emit('notice', '这张山色已经寄出。阿禾把回话夹在信下。', {photoId: photo.id});
      break;
    }
    case 'skip-opening-photo':
      if (d.started && r.screen === 'journal' && !d.openingReply) d.openingSkipped = true;
      break;
    case 'open-camera':
      if (!canMove(state) || r.screen !== 'play') break;
      d.tutorial.cameraOpened = true; r.screen = 'photo'; r.returnScreen = 'photo'; clearInputs(); emit('camera:opened'); break;
    case 'close-camera':
      if (r.screen !== 'photo') break;
      r.screen = 'play'; r.returnScreen = 'play'; r.lastComposition = null; clearInputs(); emit('camera:closed'); break;
    case 'set-context':
      r.nearby = canonicalInteraction(action.nearby);
      if (action.observation !== undefined) r.observation = action.observation;
      break;
    case 'set-pose': {
      if (!canPlay(state) || r.ride || !isPose(action.pose)) break;
      const old = d.player, pose = cleanPose(action.pose);
      // The controller owns terrain/collision and photography walking speed.
      const distance = Math.hypot(...pose.position.map((n, i) => n - old.position[i]));
      d.distanceWalked += distance; d.tutorial.moved ||= d.distanceWalked >= 2;
      d.tutorial.looked ||= Math.abs(pose.yaw - old.yaw) > 0.025 || Math.abs(pose.pitch - old.pitch) > 0.025;
      if (old.area !== pose.area) emit('area:entered', AREA_LABELS[pose.area]);
      d.player = pose; break;
    }
    case 'recover-path': {
      if (!d.started || r.screen === 'menu' || r.screen === 'ending' || !isPose(action.pose)) break;
      // This trusted action comes only from the engine's road-clearance check.
      // Teleporting is not walking, finishing a ride, or solving a postcard.
      cancelCountdown();
      if (r.ride) { r.ride = null; emit('ride:cancelled'); }
      // Old saves may keep their only copy in pendingPhoto. Close its UI without
      // deleting it; a duplicate reference can safely be cleared.
      if (d.pendingPhoto && [...d.film, ...d.album, d.endingPhoto, ...Object.values(d.cardPhotos), ...Object.values(d.replyPhotos).map(reply=>reply?.photo), d.memories['valley-letter']?.photo]
        .some(photo => photo?.id === d.pendingPhoto!.id)) d.pendingPhoto = null;
      d.player = cleanPose(action.pose);
      r.screen = 'play'; r.returnScreen = 'play';
      r.pauseReasons = r.pauseReasons.filter(reason => reason !== 'ui');
      r.nearby = null; r.observation = null; r.lastComposition = null;
      clearInputs(); emit('screen:changed');
      emit('journey:recovered', '已回到最近可走的小路。照片和旅途进度都还在。');
      break;
    }
    case 'take-photo': {
      if (!canPlay(state) || r.screen !== 'photo' || r.ride || r.countdownSeconds !== null) break;
      if (action.observation.area !== d.player.area) { blocked('景物信息正在更新，请稍后再拍。'); break; }
      const thumbnail = cleanThumbnail(action.thumbnail, CAPTURE_THUMBNAIL_MAX_LENGTH);
      if (!thumbnail) { blocked('没有收到有效的照片缩图，请重新拍摄。'); break; }
      const matchedCards: CardId[] = [];
      for (const card of ['forest', 'town'] as const) {
        const check = evaluateFrame(next, action.observation, card);
        if (action.observation.area === card) r.lastComposition = check;
        if (check.matched) matchedCards.push(card);
      }
      const tutorialCheck = evaluateFrame(next, action.observation, 'tutorial');
      if (action.observation.area === 'post') r.lastComposition = tutorialCheck;
      const sequence = ++d.totalPhotos;
      const original = cleanOriginalPhoto(action.original), scene = cleanPhotoScene(action.scene);
      const routeSlot = original && ridgeRouteSlot(action.observation);
      const signFrame = routeSignFrame(action.observation);
      const routeCaption = !d.replyPhotos.forest && (signFrame === 'mill-only' ? '风车拍到了。阿禾要走到哪儿，才能看见该拐的路口呢？' : signFrame === 'sign-only' ? '箭头很清楚。要是把它指着的风车也拍进来，阿禾就敢走了。' : '');
      const courtyard = Boolean(original && d.stamps.town && r.bridgeProgress >= 1 && evaluateCourtyardFrame(action.observation).matched);
      const openingMountains = original && action.observation.area === 'post' ? action.observation.openingMountains : undefined;
      const afternoonSubject = original && action.observation.area === 'town' ? action.observation.afternoonSubject : undefined;
      const openingCaption = openingMountains === undefined ? '' : MOUNTAIN_LETTER.labels[openingMountains];
      const photo: Photo = {
        id: `photo-${sequence}`, sequence, title: `${AREA_LABELS[d.player.area]} · 第${sequence}张`, area: d.player.area, pose: cleanPose(d.player),
        capturedAt: Number.isFinite(action.capturedAt) && action.capturedAt! >= 0 ? action.capturedAt! : 0,
        playSeconds: d.playSeconds, thumbnail, matchedCards, memoryCandidates: evaluateMemoryFrame(action.observation).matched ? ['valley-letter'] : [], tutorialMatch: tutorialCheck.matched,
        caption: typeof action.caption === 'string' ? action.caption.trim().slice(0, 140) : openingCaption || (afternoonSubject === 'hall-window' ? '禅院老窗里的山门' : afternoonSubject === 'swallow-roof' ? '桥头青瓦上的燕尾' : '') || routeCaption || cliffPhotoNote(action.observation,scene?.clock?.minute,scene?.weather==='rain'),
        ...(original ? { original } : {}), ...(scene ? { scene } : {}),
        ...(original && scene?.clock && !d.creativeMode && action.observation.commissionSites?.length
          ? {commissionSites:d.photoCommissions.orders.filter(order => action.observation.commissionSites!.includes(order.site) && commissionTimeAllows(order.site, scene.clock!.minute)).map(order => order.site)} : {}),
        ...(routeSlot ? {routeSlot} : {}),
        ...(openingMountains !== undefined ? { openingMountains } : {}),
        ...(afternoonSubject ? { afternoonSubject } : {}),
        ...(original && !d.creativeMode && action.observation.flowerSubjects?.length ? {flowerSubjects:action.observation.flowerSubjects.filter(isFlowerSubject)} : {}),
        ...(original && signFrame === 'ready' ? {replyCandidates:[{letter:'forest' as const,variant:'sign-route' as const,ruleVersion:1 as const}]} : {}),
        ...(courtyard ? {replyCandidates:[{letter:'town' as const,variant:'courtyard' as const,ruleVersion:1 as const}]} : {}),
      };
      if(!d.creativeMode)d.flowerQuests=recordCommissionEvidence(d.flowerQuests,photo);
      if (scene?.clock && original) {
        const visit = evaluatePhotoCheckIn({ photo, observation: action.observation, clock: scene.clock,
          weather: scene.weather, gateOpened: d.gateOpened, checkIns: d.checkIns, creativeMode: d.creativeMode, captured: true });
        if (visit.matched && visit.checkIn) {
          d.checkIns = [...d.checkIns, { ...visit.checkIn, photo: copyPhoto(photo) }].slice(-24);
          emit('outing:checked-in', visit.hint, { photoId: photo.id });
        }
      }
      const full = d.film.length >= FILM_CAPACITY;
      const firstPhoto = !d.tutorial.photoTaken;
      d.film = [...d.film, photo].slice(-FILM_CAPACITY); d.tutorial.photoTaken = true;
      emit('photo:captured', photo.openingMountains !== undefined
        ? `${MOUNTAIN_LETTER.labels[photo.openingMountains]}。按 J 选照片寄给阿禾。` : firstPhoto ? '第一张照片留在底片里了。打开它，再读阿禾的信。' : full ? '新照片已放入底片。最早的候选已移除，精选与信中的照片仍会保留。' : `照片已放入底片（${d.film.length}/${FILM_CAPACITY}）。可以继续取景，稍后再选喜欢的。`, { photoId: photo.id });
      if (photo.commissionSites?.length) emit('notice', '这张能交本轮委托。按 J 打开来信选片。');
      else if (action.observation.commissionHint && !action.observation.commissionHint.ready) emit('notice', action.observation.commissionHint.text);
      if (afternoonSubject === 'hall-window') emit('notice', '山门留在窗里了。收起相机，到老窗旁按 E 交照。');
      if (afternoonSubject === 'swallow-roof' && !d.skills.jump) emit('notice', '燕尾屋脊拍清了。回拓印摊按 E 借草鞋。');
      if (tutorialCheck.matched && !d.tutorial.compositionMatched) { d.tutorial.compositionMatched = true; emit('tutorial:completed', '听见了吗？老相机还记得这里的风。现在，你可以自己选路了。'); }
      for (const card of matchedCards) {
        d.cardPhotos[card] = photo;
        if (d.stamps[card]) continue;
        d.stamps[card] = true;
        emit('photo:matched', CARDS[card].after, { card, photoId: photo.id });
        if (card === 'forest') emit('world:windmill-awaken', '风车醒来了，滑索也能用了。', { card });
        else { r.bridgeProgress = 0; emit('world:bridge-lowering', '桥正在落下。稍等片刻，就能走进那座小院。', { card }); }
      }
      if (routeSlot && !d.mailed) emit('notice', routeSlot === 'turn' ? '岔口拍清楚了。按 J 贴在「在哪拐」；另一张找风车。' : '风车拍清楚了。按 J 贴在「认哪里」。');
      const replyId = (['forest', 'town'] as const).find(id => replyVariant(photo, id));
      if (!d.mailed && replyId && isUsableReplyPhoto(photo)) emit('notice',`这张可以回答《${REPLY_LETTERS[replyId].title}》，按 J 选择回信照片。`,{card:replyId,photoId:photo.id});
      break;
    }
    case 'keep-photo': {
      const photo = action.photoId ? photoById(next, action.photoId) : d.pendingPhoto ?? d.film.at(-1);
      if (!photo) break;
      if (d.album.some(entry => entry.id === photo.id)) { emit('album:already-kept', '这张照片已经在旅行册里。'); break; }
      if (action.replaceId) {
        const index = d.album.findIndex(entry => entry.id === action.replaceId);
        if (index < 0) { blocked('要替换的照片已不在旅行册里。'); break; }
        d.album[index] = copyPhoto(photo);
      } else {
        if (d.album.length >= ALBUM_CAPACITY) { emit('album:full', '旅行册已经放了十二张照片。选一张替换即可，回信和主线印记都会保留。'); break; }
        d.album.push(copyPhoto(photo));
      }
      if (d.pendingPhoto?.id === photo.id) d.pendingPhoto = null;
      emit('album:kept', '这张风景已收入精选。', { photoId: photo.id }); break;
    }
    case 'discard-draft': d.pendingPhoto = null; emit('album:draft-discarded'); break;
    case 'delete-film-photo': {
      const old = d.film.length; d.film = d.film.filter(p => p.id !== action.photoId);
      if (old !== d.film.length) emit('album:deleted', '已移除这张候选底片，精选与信中的独立照片会保留。', { photoId: action.photoId });
      break;
    }
    case 'delete-photo': {
      const old = d.album.length; d.album = d.album.filter(p => p.id !== action.photoId);
      if (old !== d.album.length) emit('album:deleted', '已从旅行册移除。作为回信或主线记录的副本会保留。');
      break;
    }
    case 'select-ending-photo': {
      if (d.mailed) { blocked('信已寄出。你仍可以在旅行册里保存新的风景。'); break; }
      const photo = photoById(next, action.photoId);
      if (!isUsableReplyPhoto(photo)) { blocked('这张照片的图像尚不完整，请选择一张可显示的实拍照片。'); break; }
      d.endingPhoto = copyPhoto(photo);
      d.endingNote = cleanEndingNote(action.note);
      emit('ending:photo-selected', canSendLetter(next) ? '这张卡片可以寄出了。找一个邮筒吧。' : '替你留下最后一张。为前两封来信选好照片后，任意邮筒都能寄出。', { photoId: photo.id }); break;
    }
    case 'attach-route-photo': {
      const photo = photoById(next, action.photoId);
      if (d.mailed || (action.slot !== 'turn' && action.slot !== 'destination') || !routeAttachment(photo, action.slot)) break;
      d.routeDraft[action.slot] = copyPhoto(photo);
      emit('notice', '照片已贴好，回信草稿已留下。');
      break;
    }
    case 'send-route-pair': {
      const { turn, destination } = d.routeDraft;
      if (d.mailed || !turn || !destination || !completeRoute(turn, destination)) break;
      d.replyPhotos.forest = { photo:copyPhoto(turn), destination:copyPhoto(destination), variant:'route-pair', note:'' };
      d.routeDraft = {turn:null,destination:null};
      emit('reply:photo-selected','两张认路照寄到了。阿禾把回信夹在原信下面。',{card:'forest',photoId:turn.id});
      break;
    }
    case 'select-reply-photo': {
      if (d.mailed) { blocked('信已寄出。这一页保留着你当时选定的照片。'); break; }
      if (action.letterId !== 'forest' && action.letterId !== 'town') break;
      const photo = photoById(next,action.photoId), variant = replyVariant(photo,action.letterId);
      if (!photo || !variant || (!independentRoute(variant) && !d.stamps[action.letterId])) { blocked('这张还没有留下信里要看的景物，请选择合适的实拍照片。'); break; }
      const note = cleanReplyNote(action.note,replyNoteOptions(action.letterId,photo));
      const previous=d.replyPhotos[action.letterId];
      if(previous?.photo.id===photo.id && previous.note===note && !previous.carriedOver) break;
      d.replyPhotos[action.letterId] = {photo:copyPhoto(photo),variant,note};
      emit('reply:photo-selected',`已用这张照片回答《${REPLY_LETTERS[action.letterId].title}》。`,{card:action.letterId,photoId:photo.id}); break;
    }
    case 'replace-memory-photo': {
      if (action.memoryId !== 'valley-letter') break;
      const memory = d.memories[action.memoryId], photo = photoById(next, action.photoId);
      if (!memory) { blocked('先把两处信的线索与山谷合影连起来，再替换这一页的照片。'); break; }
      if (!isMemoryPhoto(photo)) { blocked('这张照片没有同时留下清楚的风车和红屋顶，请选择一张合格的实拍。'); break; }
      if (memory.photo.id === photo.id) break;
      d.memories[action.memoryId] = { ...memory, photo: copyPhoto(photo) };
      emit('memory:photo-replaced', '完整来信已换上你新拍的山谷。', { memory: action.memoryId, photoId: photo.id }); break;
    }
    case 'request-mail-confirmation':
      if (canMove(state) && canSendLetter(next) && /^mailbox:(post|forest|town|ridge)$/.test(r.nearby ?? '')) r.mailRequest++;
      break;
    case 'interact': {
      const id = canonicalInteraction(action.id)!;
      if (!canMove(state) || r.nearby !== id) break;
      if(id.startsWith('sixth:')){
        const message=openSixth(next,id);
        if(message)emit('notice',message);
        if(r.sixthPanel)clearInputs();
      }else if(id.startsWith('flower:')) {
        interactWithCommission(next,id.slice(7) as CommissionStop,emit);
      } else if(d.flowerStock&&(id==='night-ignite'||id==='night-place')) {
        interactWithParty(next,id,emit);
      } else if (id === 'night-place' && r.placingFirework) {
        const kind=r.fireworkInHand,point=proposedFirework(d),placement=fireworkPlacement(d,kind,point);
        if (!hasBox(d,kind) || fireworkPosition(d,kind) || !afterClosing(d) || !placement.valid) { blocked(placement.hint); break; }
        d.night={...d.night,[kind==='gold'?'placed':'scarletPlaced']:point};r.placingFirework=false;
        const other=kind==='gold'?'scarlet':'gold';
        const tip=pairReady(d) ? '两盒都放好了，持火把靠近任意一盒，按 E 一起点燃。'
          : hasBox(d,other) ? `还可从行囊取出${FIREWORK_NAMES[other]}。` : '可用火把点燃，也可从行囊收回重摆。';
        emit('notice',`${FIREWORK_NAMES[kind]}放好了。${tip}`);
      } else if (id === 'night-ignite') {
        if (!afterClosing(d) || r.fireworkShow || !FIREWORK_KINDS.some(kind=>atFirework(d,kind))) {
          blocked('烟花只能在夜间于镇外点燃。');break;
        }
        if (!r.torchLit || !d.night.torch) { blocked('请先从行囊拿起火把。'); break; }
        const launches:FireworkLaunches={};
        for (const kind of FIREWORK_KINDS) {
          const point=fireworkPosition(d,kind);
          if (point && fireworkPlacement(d,kind,point).valid) launches[kind]=point;
        }
        const position=launches.gold??launches.scarlet;
        if (!position) break;
        if (repriseActive(d) && !(launches.gold && launches.scarlet)) {
          blocked('两盒补拍留样要一起放。请把另一盒也布置好。');break;
        }
        if (launches.gold && d.night.spent && d.night.goldEncore && !launches.scarlet) {
          blocked('这是阿禾给朱红留的金柳。把朱红也放好，再一起点燃。'); break;
        }
        const firstWillow=Boolean(launches.gold&&!launches.scarlet&&!d.night.spent&&!d.night.firstWillowLantern);
        r.fireworkShow={position,launches,startedAt:d.playSeconds,...(firstWillow?{firstWillow:true as const}:{})};
        const night={...d.night,repriseNight:null,...(firstWillow?{firstWillowLantern:firstWillowIgnition(d)}:{})};
        if (launches.gold) {
          if (night.spent && night.goldEncore) night.goldEncore={...night.goldEncore,spent:true};
          night.spent=true;night.placed=null;
        }
        if (launches.scarlet) {night.scarletSpent=true;night.scarletPlaced=null;}
        d.night=night;
        emit('night:spark',launches.gold && launches.scarlet
          ? '两处引线都点着了。退到开阔处，按 C 举机，等朱红与金柳同场。'
          : firstWillow ? '引线点着了。退到开阔处按 C，留一点画面给山下的窗。' : '引线点着了。退开几步，举起相机看看山口。');
      } else if (id === NIGHT_STOPS.footTorch.id || id === NIGHT_STOPS.upperTorch.id) {
        if (!d.fireworks || (!afterClosing(d) && !d.night.torch)) { blocked('闭院后，领到烟花的旅人可来借火把。'); break; }
        r.torchLit=!d.night.torch || !r.torchLit;
        d.night={...d.night,torch:true};
        emit('notice',r.torchLit?'火把点亮了。只照手边的路。':'火把已收进行囊。');
      } else if (id === NIGHT_STOPS.inn.id && afterClosing(d) && !d.creativeMode) {
        const rest=lodgingClock(d); if(!rest)break;
        const weather=advanceWeather(d.weather,d.weatherCycle,rest.weatherSeconds);
        d.clock=rest.clock;d.weather=weather.weather;d.weatherCycle=weather.cycle;
        r.torchLit=false;r.placingFirework=false;r.partyHolding=null;r.fireworkShow=null;r.fishMotionUntil=0;
        clearInputs();emit('clock:rested',`住了一晚。现在是${formatClock(d.clock)}，禅院可以收件了。`);
      } else if (afterClosing(d) && id === NIGHT_STOPS.fish.id) {
        r.fishMotionUntil=d.playSeconds+11;emit('night:fish','纸鱼顺着白墙游了过去。');
      } else if (afterClosing(d) && id === NIGHT_STOPS.letter.id) {
        if(d.night.fishLetter==='unread')d.night={...d.night,fishLetter:'carrying'};
        emit('notice',d.night.fishLetter==='delivered'?'夜信已送到修灯铺。':'《鱼灯夜信》收好了。找挂着缺角月牙的修灯铺。');
      } else if (afterClosing(d) && id === NIGHT_STOPS.repair.id) {
        if (d.night.fishLetter==='unread') {blocked('客栈旁挂着一封画有月牙的信。');break;}
        const firstDelivery=d.night.fishLetter==='carrying';
        const grantScarlet=Boolean(d.fireworks && !d.night.scarletClaimed && !d.flowerStock?.earned.includes('scarlet'));
        if (firstDelivery || grantScarlet) {
          d.night={...d.night,fishLetter:'delivered',scarletClaimed:d.night.scarletClaimed||grantScarlet};
          r.fishMotionUntil=d.playSeconds+14;
          emit('night:fish',grantScarlet
            ? '修灯人把一盒「朱红」交给你。花谱记下了这一盒。'
            : d.flowerStock?.earned.includes('scarlet') ? '夜信送到了。你带来的花谱已经有朱红了。' : '夜信送到了。等禅院给你第一盒金柳，再来领修灯人准备的谢礼。');
        } else emit('notice',d.night.scarletClaimed?'送信的心意，花街记得。':'修灯人为你留了谢礼。领了金柳再来。');
      } else if (id === AFTERNOON_STOPS.pineBag.id && !d.skills.run) {
        d.skills = {...d.skills, run:true};
        emit('skill:learned', '底片箱交给了松针邮袋。相机系牢了，按 Shift 轻装快跑。');
      } else if (id === AFTERNOON_STOPS.townBag.id) {
        emit('notice', '这个袋子寄往旧镇。底片箱上的邮戳是一株松。');
      } else if (id === AFTERNOON_STOPS.shoes.id && !d.skills.jump) {
        if (!afternoonPhoto(d, 'swallow-roof')) { blocked('退到石拱后的石路中间，拍清东侧青瓦屋顶上的燕尾，再来借鞋。'); break; }
        d.skills = {...d.skills, jump:true};
        emit('skill:learned', '草鞋借给你了。收起相机，走路时按空格踏石跳。');
      } else if (id === AFTERNOON_STOPS.window.id && !d.fireworks) {
        if (!d.stamps.town || r.bridgeProgress < 1 || !hasAfternoonDirections(d)) { blocked('先带来一份指路照片，再从落桥走上禅院。'); break; }
        if (!hallCollectsAt(d.clock.minute)) { blocked('客堂已经歇了。次晨 06:20 再来，照片会保留。'); break; }
        const photo = afternoonPhoto(d, 'hall-window');
        if (!photo) { blocked('站到老窗背后，让山门留在窗里，再拍一张。'); break; }
        d.fireworks = {photo:copyPhoto(photo), day:d.clock.day, minute:d.clock.minute};
        emit('reward:fireworks', '找到了，就是阿公的老窗。新旧照片已夹进来信。客堂交给你第一盒「金柳」，山下替你留着一扇窗。', {photoId:photo.id});
      } else if (id === 'town-gate' && d.player.area === 'town') {
        if (d.gateOpened) { blocked('木屏已经打开。走到石拱外，看看门里的山。'); break; }
        d.gateOpened = true; emit('world:gate-opened', '木屏慢慢打开了。站到石拱外，把双峰和红邮筒一起留在照片里。');
      } else if (id.startsWith('discover:') && isDiscovery(id.slice(9))) discover(id.slice(9) as DiscoveryId);
      else if (id === 'forest-lunch' && worldState(next).lunchDelivered) emit('letter:read', '饭盒里还剩半块葱饼。折着的小纸条上有两种笔迹：「给带路的人。」下面歪歪扭扭补了一句：「多放了葱。——阿公」');
      else if (id === 'postmaster') emit('letter:read', INTRO_LETTER);
      else if (id.startsWith('mailbox:')) {
        if (d.mailed) {
          r.screen = 'ending'; r.returnScreen = 'play'; clearInputs();
          break;
        }
        if (!canSendLetter(next)) { blocked(currentObjective(next).detail); break; }
        d.mailed = true; d.mailedFrom = id;
        r.screen = 'ending'; r.returnScreen = 'play'; clearInputs(); emit('ending:mailed', ENDING_LETTER, { photoId: d.endingPhoto!.id }); emit('world:sunset');
      }
      break;
    }
    case 'discover': if (canMove(state)) discover(action.id); break;
    case 'start-ride': {
      if (!canMove(state) || r.screen !== 'play' || r.nearby !== 'zipline' || d.player.area !== 'forest') break;
      if (!d.stamps.forest) { blocked('先让风车转起来，滑索才会松开。'); break; }
      if (!isPose(action.destination)) break;
      r.ride = { route: 'forest-post', elapsed: 0, progress: 0, duration: Number.isFinite(action.duration) ? Math.max(4, Math.min(20, action.duration!)) : 9, safeStart: cleanPose(d.player), destination: cleanPose(action.destination) };
      clearInputs(); emit('ride:started', '抓稳了。沿着风，看看你刚刚走过的路。'); break;
    }
    case 'cancel-ride':
      if (!r.ride) break;
      d.player = cleanPose(r.ride.safeStart); r.ride = null; clearInputs(); emit('ride:cancelled', '已回到滑索起点。山路也可以继续走。'); break;
    case 'ride-progress':
      if (r.ride && canPlay(state) && Number.isFinite(action.progress)) r.ride.progress = Math.max(r.ride.progress, Math.min(1, Math.max(0, action.progress)));
      break;
    case 'finish-ride': {
      if (!r.ride) break;
      let landing = r.ride.destination;
      if (action.pose !== undefined) {
        if (!isPose(action.pose) || Math.hypot(...action.pose.position.map((n, i) => n - r.ride!.destination.position[i])) > 8) break;
        landing = action.pose;
      } else if (r.ride.progress < 1) break;
      // The controller's landing event owns completion, never a second duration timer.
      d.player = cleanPose(landing); d.ziplineRides++; r.ride = null; r.nearby = null;
      clearInputs(); emit('ride:arrived', '到站了。慢慢松手，接着走吧。'); break;
    }
    case 'tick': {
      if (!canPlay(state) || !Number.isFinite(action.deltaSeconds) || action.deltaSeconds <= 0) break;
      const dt = Math.min(action.deltaSeconds, 1); d.playSeconds += dt;
      if (r.fireworkShow) {
        const show=r.fireworkShow,t=d.playSeconds-show.startedAt;
        const party=show.party;
        for(const cue of fireworkCues(show)){
          if(!('launch' in cue)&&!show.launches[cue.kind])continue;
          if (t-dt < cue.rise && t >= cue.rise) emit('night:launch');
          if (t-dt < cue.burst && t >= cue.burst) emit('night:burst');
        }
        if(show.firstWillow&&t-dt<FIRST_WILLOW_RESPONSE.end&&t>=FIRST_WILLOW_RESPONSE.end)
          emit('notice','阿公把灯挑过屋脊了。');
        if(t>=(show.firstWillow?FIRST_WILLOW_DURATION:party?.invitation?50:FIREWORK_FINALE_SECONDS)){
          if(party?.invitation&&d.flowerStock&&!d.flowerStock.invitation.witnessed){
            d.flowerStock={...d.flowerStock,invitation:{started:true,witnessed:true}};
            emit('notice','全场看完了。旅行册盖上了「满山赴约」邮戳。');
          }
          r.fireworkShow=null;
        }
      }
      if (!d.creativeMode) {
        const previous = d.clock;
        d.clock = advanceDayClock(previous, dt);
        if (!d.fireworks && previous.day === d.clock.day && previous.minute < EVENING_BELL && d.clock.minute >= EVENING_BELL)
          emit('clock:evening-bell','禅院响了第一声晚钟。客堂收件到 18:40。');
        if (previous.day === d.clock.day && previous.minute < HALL_CLOSE && d.clock.minute >= HALL_CLOSE)
          emit('clock:market-open','末钟响了。禅院停止收件，花街夜市开门。');
        if (!afterClosing(d)) {r.placingFirework=false;r.partyHolding=null;}
        if(d.flowerStock?.samples&&(!afterClosing(d)||d.flowerStock.samples.night!==fireworkNight(d)))
          d.flowerStock={...d.flowerStock,samples:null,boxes:d.flowerStock.boxes.filter(box=>box.source==='stock')};
      }
      const weather = d.creativeMode ? { weather: d.weather, cycle: d.weatherCycle } : advanceWeather(d.weather, d.weatherCycle, dt);
      d.weatherCycle = weather.cycle;
      // A new applied target invalidates a timed shot before it can emit ready.
      // Engine additionally freezes active capture requests and handles cancellation.
      if (weather.weather !== d.weather) {
        cancelCountdown(); d.weather = weather.weather;
        emit('weather:changed', `山谷的天气渐渐转为${WEATHER_LABELS[d.weather]}。`);
      }
      if (r.countdownSeconds !== null) {
        r.countdownSeconds = Math.max(0, r.countdownSeconds - dt);
        if (r.countdownSeconds <= 1e-8) { r.countdownSeconds = null; emit('photo:timer-ready'); }
      }
      if (d.stamps.town && r.bridgeProgress < 1) {
        r.bridgeProgress = Math.min(1, r.bridgeProgress + dt / 3.2);
        if (r.bridgeProgress >= 1) emit('world:bridge-lowered', '桥落稳了，去小院看看吧。');
      }
      if (r.ride) r.ride.elapsed += dt;
      break;
    }
    case 'pause':
      if (!r.pauseReasons.includes(action.reason)) { r.pauseReasons.push(action.reason); clearInputs(); emit('journey:suspended'); } break;
    case 'resume': {
      const count = r.pauseReasons.length; r.pauseReasons = r.pauseReasons.filter(reason => reason !== action.reason);
      if (count !== r.pauseReasons.length) { clearInputs(); emit('journey:resumed'); }
      break;
    }
    case 'finish-ending':
      if (!d.mailed) break;
      d.endingSeen = true; r.screen = 'play'; r.returnScreen = 'play'; clearInputs();
      emit('ending:finished', currentObjective(next).detail);
      break;
    case 'set-settings': d.settings = cleanSettings(action.settings, d.settings); emit('settings:changed'); break;
    case 'set-weather':
      if (d.creativeMode && isWeather(action.weather)) {
        cancelCountdown(); d.weatherCycle = createWeatherCycle(d.weatherCycle.seed, d.weatherCycle.cycle + 1);
        if (action.weather !== d.weather) { d.weather = action.weather; emit('weather:changed', `天气已选为${WEATHER_LABELS[d.weather]}。`); }
      }
      break;
    case 'track-photo-spot':
      if (action.spotId === null || photoSpotById(action.spotId)) {
        if (action.spotId !== null) d.trackedScenicSpot = null;
        d.trackedPhotoSpot = action.spotId;
        d.trackedPhotoSlot = action.spotId && isPhotoOutingSlot(action.slot) ? action.slot : null;
        if (!action.spotId) r.showNavigation = false;
        if (d.started && action.spotId !== null && (r.screen === 'play' || r.screen === 'photo' || r.screen === 'map') && !r.ride) departWithRoute();
        emit('outing:tracked', action.spotId ? '已在随身地图标出取景点。天气变化不会替你改路。' : '已收起取景引导。');
      }
      break;
    case 'track-scenic-spot':
      if (d.started && r.screen === 'map' && (action.spotId === null || (scenicSpotById(action.spotId) && (action.spotId !== 'sixth-room' || d.sixth.displayed)))) {
        r.notice = '';
        selectScenic(action.spotId);
      }
      break;
    case 'navigate-commission':
      if (d.started && r.screen === 'journal' && !r.ride && d.photoCommissions.orders.some(order => order.site === action.site && !order.photoId)) selectScenic(action.site);
      break;
    case 'read-ahe-route':
      if (r.screen === 'journal' && d.started && !d.mailed && !d.replyPhotos.forest && !d.legacyReplyUnlock.forest && d.storyRoute === null && !d.trackedPhotoSpot && !d.trackedScenicSpot) d.storyRoute = 'forest';
      break;
    case 'choose-story-route':
      if (d.started && (r.screen === 'journal' || r.screen === 'map') && !d.mailed && !d.replyPhotos.forest && !d.legacyReplyUnlock.forest) {
        if (d.trackedPhotoSpot) r.notice = '';
        d.storyRoute = action.route;
        d.trackedPhotoSpot = null;
        d.trackedPhotoSlot = null;
        d.trackedScenicSpot = null;
        if (action.route !== 'free') departWithRoute();
      }
      break;
    case 'set-pocket-map':
      if (d.started && r.screen === 'play' && !r.ride) {
        r.showNavigation = false;
        d.pocketMapCollapsed = action.collapsed;
      }
      break;
    case 'open-rest':
      if (canMove(state) && nearbyRestPoint(d.player.position, d.stamps.town)) { r.restRequest++; clearInputs(); }
      break;
    case 'rest-until': {
      if (!d.started || d.creativeMode || r.ride || (r.screen !== 'play' && r.screen !== 'photo') || r.pauseReasons.some(p => p !== 'ui')
        || !nearbyRestPoint(d.player.position, d.stamps.town) || !['morning','golden','sunset'].includes(action.target)) break;
      cancelCountdown(); const rest = restDayClock(d.clock, action.target);
      const weather = advanceWeather(d.weather, d.weatherCycle, rest.weatherSeconds);
      d.clock = rest.clock; d.weather = weather.weather; d.weatherCycle = weather.cycle;
      r.screen = 'play'; r.returnScreen = 'play'; r.pauseReasons = r.pauseReasons.filter(p => p !== 'ui');
      clearInputs(); emit('clock:rested', `小憩后，山谷来到${formatClock(d.clock)}，${WEATHER_LABELS[d.weather]}。天色依然有它自己的变化。`);
      break;
    }
    case 'set-creative-mode':
      if (d.started && !r.ride && typeof action.enabled === 'boolean' && action.enabled !== d.creativeMode) {
        cancelCountdown();
        if (action.enabled) d.creativeReturn = { clock: { ...d.clock }, weather: d.weather, weatherCycle: { ...d.weatherCycle } };
        else if (d.creativeReturn) {
          d.clock = { ...d.creativeReturn.clock }; d.weather = d.creativeReturn.weather;
          d.weatherCycle = { ...d.creativeReturn.weatherCycle }; d.creativeReturn = null;
        }
        d.creativeMode = action.enabled; clearInputs();
        emit('creative:changed', action.enabled ? '自由创作：可以调节时间和天气，摄影日程暂停打卡。' : '回到旅途：恢复创作前的时间与天气，摄影日程继续。');
      }
      break;
    case 'set-time':
      if (d.creativeMode && Number.isFinite(action.minute) && action.minute >= 0 && action.minute < 1440) {
        cancelCountdown(); d.clock = { ...d.clock, minute: action.minute }; emit('clock:changed');
      }
      break;
    case 'set-photography': {
      const settings = cleanPhotography(action.settings, d.photography);
      if (JSON.stringify(settings) !== JSON.stringify(d.photography)) { cancelCountdown(); d.photography = settings; emit('photography:changed'); }
      break;
    }
    case 'begin-countdown':
      if (!canPlay(state) || r.screen !== 'photo' || r.ride || r.countdownSeconds !== null) break;
      if (d.photography.timerSeconds === 0) emit('photo:timer-ready');
      else { r.countdownSeconds = d.photography.timerSeconds; emit('photo:timer-started', '三秒后拍摄，可以继续调整位置。'); }
      break;
    case 'cancel-countdown': cancelCountdown(); break;
  }
  if (d.started && startNextStoryRound(d)) emit('notice', '首轮来信收齐了。按 J 看下一轮三处景点。');
  if (r.screen !== 'photo' || r.pauseReasons.length > 0) cancelCountdown();
  const recognitionTriggered = events.some(e => ['photo:captured','album:kept','ending:photo-selected','discovery:found','discovery:read'].includes(e.type));
  if (!d.memories['valley-letter'] && recognitionTriggered) {
    const clues = memoryClues(d);
    if (clues.clueFound && clues.seatFound) {
      const newPhoto = action.type === 'take-photo' && d.totalPhotos > state.durable.totalPhotos ? d.film.at(-1) : null;
      const photo = isMemoryPhoto(newPhoto) ? newPhoto : retainedMemoryPhotos(d)[0];
      if (photo) {
        d.memories['valley-letter'] = { id: 'valley-letter', photo: copyPhoto(photo), unlockedAtPlaySeconds: d.playSeconds };
        emit('memory:unlocked', '折纸展开了。你拍下的山谷，替那封残信补上了后半页。', { memory: 'valley-letter', photoId: photo.id });
      }
    }
  }
  return { state: next, events };
}
