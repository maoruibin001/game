import { commissionPhotoFits, commissionReward, STORY_COMMISSIONS, storyCommissionProgress } from './commission-rounds.ts';
import { commissionSite, isCommissionSite } from './commission-sites.ts';
import type { MemoryView, PhotoOutingView, PhotoView, PresentationAction, PresentationViewModel, RestPointView } from '../presentation/types.ts';
import { AREA_LABELS, DISCOVERIES, FREE_PHOTO_HINT, VALLEY_LETTER, REPLY_LETTERS, FINAL_REPLY, MOUNTAIN_LETTER } from './content.ts';
import { canSendLetter, currentObjective, firstEnvelopeGuide, nearbyInteraction } from './journey.ts';
import { ridgeRouteSlot, routeSignFrame, evaluateFrame, evaluateMemoryFrame, evaluateCourtyardFrame, evaluatePostPorchFrame } from './photography.ts';
import { composePhotoCaption } from './photo-notes.ts';
import { memoryClues, retainedMemoryPhotos } from './memories.ts';
import { magnificationForFov, LEGACY_WEATHER_LABELS, WEATHER_LABELS } from '../shared/photography-contract.ts';
import { cleanPhotography, isWeather } from './photo-settings.ts';
import { weatherForecast, weatherProbabilitiesAtOffset } from './weather.ts';
import type { JourneyAction, JourneyState, Photo, Vec3, WeatherId } from './types.ts';
import { eligibleSixthPortrait } from './sixth.ts';
import { inSixthRoom } from '../shanye-world/sixth-layout.ts';
import { COMMISSIONS, FLOWERS } from './flower-catalog.ts';
import { launchGround, isCloseToBox } from './flower-party.ts';
import { availableFlower, nextFlower } from './flower-stock.ts';
import { photoDayPart } from './flower-quests.ts';
import { fireworkNight } from './night.ts';
import { formatClock, restDayClock, SUNSET_MINUTE, SUNSET_WINDOW_START, type JourneyClock, type RestTarget } from './day-clock.ts';
import { buildPhotoOutings, photoSpotById, isPhotoOutingSlot, suitablePhotoWeather, type PhotoOutingRecommendation } from './photo-outings.ts';
import { nearbyRestPoint } from './rest-points.ts';
import { routeAttachment, allRetainedPhotos, hasStoryReplies, replyPhotoCandidates, replyNoteOptions, replyResponse } from './replies.ts';
import { navigationFor, POSTAL_MAP_ROADS } from './navigation.ts';
import { SCENIC_SPOTS, scenicSpotById } from './scenic-spots.ts';
import { afterClosing, canInviteGold, canInviteGoldHere, canRepriseHere, fireworkPosition, hasBox, repriseActive } from './night.ts';

const scenicSpots = (['post', 'forest', 'town', 'ridge'] as const).flatMap(area => SCENIC_SPOTS
  .filter(spot => spot.area === area)
  .map(({ id, title, hidden }) => ({ id, title, hidden, regionLabel: title === AREA_LABELS[area] ? '' : AREA_LABELS[area] })));

export interface PresentationOptions {
  hasSave?: boolean;
  saveStatus?: PresentationViewModel['saveStatus'];
  saveMessage?: string;
  toast?: PresentationViewModel['toast'];
  mapBounds?: { minX: number; maxX: number; minZ: number; maxZ: number };
  mapHeading?: number;
  /** Native controller facts only; the adapter must not infer running from a key or pose. */
  movement?: PresentationViewModel['movement'];
}

const timeLabel = (clock: JourneyClock) => formatClock(clock).split(' · ')[1]!;
const atMinute = (minute: number) => timeLabel({ day: 1, minute });
function roundedForecast(probabilities: Record<WeatherId, number>): Record<WeatherId, number> {
  const ids: WeatherId[] = ['morning', 'rain', 'afterglow'];
  const values = Object.fromEntries(ids.map(id => [id, Math.floor(probabilities[id])])) as Record<WeatherId, number>;
  const order = [...ids].sort((a, b) => (probabilities[b] - values[b]) - (probabilities[a] - values[a]));
  for (let i = 0, rest = 100 - ids.reduce((sum, id) => sum + values[id], 0); i < rest; i++) values[order[i % order.length]!]++;
  return values;
}

/** This is the single display projection; the UI never owns quest or world state. */
export function toPresentationView(state: JourneyState, options: PresentationOptions = {}): PresentationViewModel {
  const d = state.durable, r = state.runtime, objective = currentObjective(state);
  const cameraActive = r.screen === 'photo';
  const mountainOpening = d.player.area === 'post' && !d.openingSkipped && !d.openingReply;
  const opening = firstEnvelopeGuide(d)
    ? { step: cameraActive ? d.tutorial.looked ? 'shutter' as const : 'frame' as const : 'camera' as const }
    : undefined;
  const courtyardComposition = cameraActive && r.observation?.vantageTags.includes('courtyard-view') && d.stamps.town && r.bridgeProgress >= 1 ? evaluateCourtyardFrame(r.observation) : null;
  const target = !courtyardComposition && (d.player.area === 'forest' || d.player.area === 'town') ? d.player.area : undefined;
  // Main postcard targets stay independent from optional scenic advice.
  // The authored postal doorway never pretends to frame the distant windmill.
  const composition = cameraActive && r.observation && target ? evaluateFrame(state, r.observation, target) : null;
  const clues = memoryClues(d), memory = d.memories['valley-letter'];
  const memoryComposition = cameraActive && r.observation && (clues.clueFound || clues.seatFound || !d.replyPhotos.forest) && r.observation.vantageTags.includes('valley-letter-view') ? evaluateMemoryFrame(r.observation) : null;
  const postComposition = cameraActive && r.observation?.vantageTags.includes('post-porch-view') ? evaluatePostPorchFrame(r.observation) : null;
  const activeComposition = courtyardComposition ?? composition ?? memoryComposition ?? postComposition;
  const routeSlot = cameraActive && !d.replyPhotos.forest && r.observation ? ridgeRouteSlot(r.observation) : undefined;
  const ridgeHint = routeSlot === 'turn' ? '第一张 · 在哪拐。红箭头清楚了，可以按快门。'
    : routeSlot === 'destination' ? '第二张 · 走到哪。风车已经看清，可以按快门。'
    : cameraActive && !d.replyPhotos.forest && r.observation?.vantageTags.includes('valley-letter-view')
      ? '阿禾的两张认路照：拍长椅旁的红箭头，沿古道向旧镇走几步，转向西南，用「望远」拍风车。' : undefined;
  const signReady = cameraActive && r.observation && !d.replyPhotos.forest && routeSignFrame(r.observation) === 'ready';
  const replyGuide = signReady ? 'forest-sign' as const : ridgeHint ? 'ridge-pair' as const : undefined;
  const openingCount = r.observation?.openingMountains;
  const openingReady = openingCount === 1 || openingCount === 2;
  const cameraFeedback = cameraActive && mountainOpening && (!postComposition?.matched || openingCount !== undefined)
    ? openingCount === 2 ? '两座山都装进去了。按空格拍下。'
      : openingReady ? '一座山进了封口。横着挪一点，再看看另一座。'
      : '按 A 或 D 横移一点，看看封口和远山怎么变。空格拍照。'
    : signReady ? `红箭头和风车都在画面里。这张能给阿禾指路。${composition?.matched && !d.stamps.forest ? '风铃也符合旧卡，拍下会让风车转起来。' : ''}`
    : r.observation?.afternoonSubject === 'hall-window' && cameraActive ? '山门在窗里了。拍下这张，收起相机后交给客堂。'
    : r.observation?.afternoonSubject === 'swallow-roof' && cameraActive && !d.skills.jump ? '燕尾屋脊清楚了。拍下来，回拓印摊借草鞋。'
    : ridgeHint ?? activeComposition?.hint ?? FREE_PHOTO_HINT;
  const photoView = (p: Photo): PhotoView => ({
    id: p.id,
    caption: p.caption || composePhotoCaption({
      area: p.area,
      pose: p.pose,
      ...(p.scene ? { scene: p.scene } : {}),
      matchedCards: p.matchedCards,
      courtyard: Boolean(p.replyCandidates?.some(c => c.variant === 'courtyard')),
      memory: p.memoryCandidates.includes('valley-letter'),
      postPorch: p.area === 'post' && Math.hypot(p.pose.position[0] - 2, p.pose.position[2] + 214) <= 7,
    }),
    ...(p.thumbnail ? { imageUrl: p.thumbnail } : {}), title: p.title, location: AREA_LABELS[p.area],
    dateLabel: p.scene?.clock ? formatClock(p.scene.clock) : `旅途第 ${Math.max(1, Math.ceil(p.playSeconds / 60))} 分钟`, card: p.matchedCards[0] ?? 'free', isEnding: p.id === d.endingPhoto?.id,
    ...(p.original ? { originalKey: p.original.key, width: p.original.width, height: p.original.height } : {}),
    ...(p.scene ? { sceneDescription: `${(p.scene.clock ? WEATHER_LABELS : LEGACY_WEATHER_LABELS)[p.scene.weather]} · ${p.scene.mode === 'portrait' ? '代拍' : '手持'} · ${{ wide: '广角', standard: '日常', detail: '特写', tele: '望远' }[p.scene.lens]} ${magnificationForFov(p.scene.camera.verticalFovRadians).toFixed(1)}× · 曝光 ${p.scene.exposure > 0 ? '+' : ''}${p.scene.exposure.toFixed(1)}` } : {}),
  });
  const mountainCandidates = allRetainedPhotos(d).flatMap(photo => photo.openingMountains !== undefined && photo.original
    ? [{ ...photoView(photo), result: MOUNTAIN_LETTER.labels[photo.openingMountains], mountains: photo.openingMountains }] : []);
  const mountainLetter = {
    title: MOUNTAIN_LETTER.title, body: MOUNTAIN_LETTER.body, initial: mountainOpening,
    candidates: mountainCandidates,
    ...(!mountainOpening ? { request: MOUNTAIN_LETTER.request, oldPhotoBack: MOUNTAIN_LETTER.oldPhotoBack,
      canChooseRidge: d.started && !d.mailed && !d.replyPhotos.forest && !d.legacyReplyUnlock.forest } : {}),
    ...(d.openingReply?.openingMountains !== undefined ? {
      photo: photoView(d.openingReply), response: MOUNTAIN_LETTER.responses[d.openingReply.openingMountains],
    } : {}),
  };
  const bounds = options.mapBounds;
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  const usableBounds = bounds && bounds.maxX > bounds.minX && bounds.maxZ > bounds.minZ ? bounds : undefined;
  const mapPoint = (position: Vec3) => usableBounds ? {
    x: clamp((position[0] - usableBounds.minX) / (usableBounds.maxX - usableBounds.minX)),
    y: 1 - clamp((position[2] - usableBounds.minZ) / (usableBounds.maxZ - usableBounds.minZ)),
  } : undefined;
  const outings = buildPhotoOutings({ clock: d.clock, weather: d.weather, weatherCycle: d.weatherCycle, position: d.player.position,
    gateOpened: d.gateOpened, checkIns: d.checkIns, trackedSpotId: d.trackedPhotoSpot, trackedSlot: d.trackedPhotoSlot, creativeMode: d.creativeMode });
  const navigation = usableBounds ? navigationFor(state, outings.tracked) : undefined;
  const outingView = (outing: PhotoOutingRecommendation): PhotoOutingView => {
    const checkIn = d.checkIns.find(c => c.day === outing.day && c.slot === outing.slot && c.spotId === outing.spotId);
    const nextDay = outing.nextWindow.day > d.clock.day;
    const mapTarget = mapPoint(outing.position);
    return { spotId: outing.spotId, spotTitle: outing.spotTitle, regionLabel: AREA_LABELS[outing.area], slot: outing.slot, slotTitle: outing.slotTitle,
      status: outing.status, windowLabel: `${atMinute(outing.window.startMinute)}–${atMinute(outing.window.endMinute)}`,
      ...(nextDay ? { nextWindowLabel: `次日 ${atMinute(outing.nextWindow.startMinute)}–${atMinute(outing.nextWindow.endMinute)}` } : {}),
      weatherProbability: Math.round(outing.weatherProbability), weatherLabel: suitablePhotoWeather(outing.spotId, outing.slot).map(id => WEATHER_LABELS[id]).join(' / '),
      distanceMeters: outing.distanceMeters, etaSeconds: outing.etaSeconds, arrivalLabel: formatClock(outing.arrivalClock), canArriveInWindow: outing.canArriveInWindow,
      preparation: outing.preparation, facingHint: outing.facingHint, compositionHint: outing.compositionHint,
      ...(checkIn ? { photo: photoView(checkIn.photo) } : {}),
      ...(mapTarget ? { mapTarget, routePoints: outing.routePoints.map(p => mapPoint(p)!) } : {}) };
  };
  const currentOuting = outings.recommendations.find(o => o.status === 'active');
  const nextOuting = outings.recommendations.filter(o => o.status !== 'active').sort((a, b) =>
    a.nextWindow.day * 1440 + a.nextWindow.startMinute - b.nextWindow.day * 1440 - b.nextWindow.startMinute)[0];
  const rest = nearbyRestPoint(d.player.position, d.stamps.town);
  let restPoint: RestPointView | undefined;
  if (rest) {
    const available = d.started && !d.creativeMode && !r.ride && (r.screen === 'play' || r.screen === 'photo') && !r.pauseReasons.some(reason => reason !== 'ui');
    const labels: Record<RestTarget, string> = { morning: '等到清晨', golden: '等到黄金时段', sunset: '等到日落时分' };
    restPoint = { id: rest.id, title: rest.title, available, requestOpen: r.restRequest,
      ...(!available ? { reason: d.creativeMode ? '退出自由创作后，再到歇脚点候时。' : '回到正常旅途，在歇脚点停稳后再小憩。' } : {}),
      targets: (['morning', 'golden', 'sunset'] as const).flatMap(target => {
        try {
          const future = restDayClock(d.clock, target), chances = roundedForecast(weatherProbabilitiesAtOffset(d.weather, d.weatherCycle, future.weatherSeconds));
          return [{ target, label: labels[target], arrivalLabel: `${future.clock.day > d.clock.day ? '次日 ' : '今日 '}${timeLabel(future.clock)}`,
            weatherSummary: `晴朗 ${chances.morning}% · 细雨 ${chances.rain}% · 多云 ${chances.afterglow}%（预估）` }];
        } catch (error) { if (error instanceof RangeError) return []; throw error; }
      }) };
  }
  const sunsetLabel = d.clock.minute < SUNSET_WINDOW_START ? `日落观赏 17:40–18:20 · 约 ${Math.ceil(SUNSET_WINDOW_START - d.clock.minute)} 山谷分钟后`
    : d.clock.minute < SUNSET_MINUTE ? d.weather === 'morning' ? '日落观赏中 · 至 18:20 · 向西南望日，山体可能提前遮挡'
      : d.weather === 'rain' ? '日落时段 · 至 18:20 · 细雨遮日，可拍旧镇雨幕' : '日落时段 · 至 18:20 · 多云遮日，可拍邮局暮色'
    : '今日日落已过 · 可在歇脚点等到次日 17:40';
  const memoryView: MemoryView = {
    id: 'valley-letter', title: VALLEY_LETTER.title,
    status: memory ? 'completed' : clues.clueFound && clues.seatFound ? 'ready' : clues.clueFound || clues.seatFound ? 'tracing' : 'unseen',
    ...clues,
    hint: memory ? '这一页已独立保存你的照片。以后拍到更喜欢的合影，可以主动换上。'
      : clues.clueFound && clues.seatFound ? '在东岭长椅附近回望，把风车与旧镇红屋顶一起拍下来。以前保留的合格照片也能连起这封信。'
      : clues.clueFound ? '沿东岭古道找到朝南的长椅，读一读椅边的折纸。'
      : clues.seatFound ? '折纸还缺一段来历。旧镇东侧屋后的木托上，留着半封被雨浸过的信。'
      : '旧街的背面与高处的归路，或许藏着同一封信的两段话。',
    ...(memory ? { letter: VALLEY_LETTER.complete, photo: photoView(memory.photo) } : {}),
    replacementPhotos: memory ? retainedMemoryPhotos(d, true).filter(p => p.id !== memory.photo.id).map(photoView) : [],
  };
  return {
    screen: cameraActive ? 'play' : r.screen,
    hasSave: options.hasSave ?? d.started, area: d.player.area, areaName: AREA_LABELS[d.player.area],
    objective: objective.title, objectiveDetail: objective.detail, hint: cameraActive ? cameraFeedback : r.notice,
    interaction: nearbyInteraction(state), completed: { ...d.stamps },
    discoveries: Object.entries(DISCOVERIES).map(([id, def]) => {
      const found = d.discoveries.some(item => item.id === id);
      const clues = { post: '邮路的起点，也留着尚未说完的话。', forest: '林间的风与旧物，记得有人走过。', town: '顺着旧街慢慢看，留意屋檐和来路以外的一面。', ridge: '走高一点，回望刚才经过的地方。' };
      return { id, title: found ? def.title : `${AREA_LABELS[def.area]} · 未读的风景`, description: found ? def.letter : clues[def.area], found, icon: found ? def.kind : '足迹' };
    }),
    mountainLetter, ...(d.started ? {commissions:commissionView(state,photoView)} : {}), album: d.album.map(photoView), film: d.film.map(photoView), ...(opening ? { opening } : {}), settings: { ...d.settings }, memories: [memoryView],
    replies: { items: (['forest','town'] as const).map(id => {
      const letter = REPLY_LETTERS[id], selected = d.replyPhotos[id], candidates = replyPhotoCandidates(d, id);
      const routeSlots = (['turn', 'destination'] as const).map(slot => {
        const attached = selected?.variant === 'route-pair' ? (slot === 'turn' ? selected.photo : selected.destination) : d.routeDraft[slot];
        return { id: slot, ...(attached ? { photo: photoView(attached) } : {}), choices: allRetainedPhotos(d).filter(p => routeAttachment(p, slot)).map(photoView) };
      });
      return { id, title: letter.title, body: letter.body, status: selected || d.legacyReplyUnlock[id] ? 'answered' as const : candidates.length ? 'choose' as const : 'searching' as const,
        ...(id === 'forest' ? {route:{
          sent:selected?.variant === 'route-pair',
          expanded: !selected && (d.player.area === 'ridge' || routeSlots.some(slot => slot.photo || slot.choices.length)),
          slots:routeSlots,
        }} : {}),
        candidates: candidates.map(photo => ({ ...photoView(photo), noteOptions: replyNoteOptions(id, photo) })),
        note: selected?.note ?? '', ...(selected ? { photo: photoView(selected.photo), response: replyResponse(id, selected), noteOptions: replyNoteOptions(id, selected.photo), carriedOver: selected.carriedOver } : {}),
        legacyUnlocked: d.legacyReplyUnlock[id] };
    }), final: { title: FINAL_REPLY.title, body: FINAL_REPLY.body, response: d.mailed ? `${FINAL_REPLY.response}${d.fireworks ? '' : `\n${FINAL_REPLY.oldWindowPostscript}`}` : '', ready: hasStoryReplies(d), note: d.endingNote,
      noteOptions: FINAL_REPLY.noteOptions, ...(d.endingPhoto ? { photo: photoView(d.endingPhoto) } : {}) } },
    weather: { id: d.weather, label: WEATHER_LABELS[d.weather], options: Object.entries(WEATHER_LABELS).map(([id, label]) => ({ id: id as typeof d.weather, label })), forecast: weatherForecast(d) },
    dayClock: { day: d.clock.day, minute: d.clock.minute, timeLabel: timeLabel(d.clock), sunsetLabel },
    outings: { day: d.clock.day, slots: outings.recommendations.map(outingView), ...(outings.tracked ? { tracked: outingView(outings.tracked) } : {}),
      ...(currentOuting ? { currentSpotId: currentOuting.spotId } : {}), ...(nextOuting ? { nextSpotId: nextOuting.spotId } : {}) },
    skills: d.skills, ...(d.fireworks ? {fireworks:photoView(d.fireworks.photo)} : {}),
    night: {
      open:afterClosing(d),torch:d.night.torch,lit:r.torchLit,placing:r.placingFirework,spent:d.night.spent,playing:Boolean(r.fireworkShow),
      gold:{ available:hasBox(d),placed:Boolean(fireworkPosition(d,'gold')),borrowed:d.night.spent && hasBox(d) },
      scarlet:{ claimed:d.night.scarletClaimed,available:hasBox(d,'scarlet'),placed:Boolean(fireworkPosition(d,'scarlet')),spent:d.night.scarletSpent },
      fishLetter:d.night.fishLetter,goldInvitation:canInviteGold(d),inviteAtThisSite:canInviteGoldHere(d),repriseActive:repriseActive(d),repriseHere:canRepriseHere(d),
    },
    ...(r.sixthPanel?{sixth:{panel:r.sixthPanel,tin:d.sixth.tin,revealed:d.sixth.revealed,displayed:d.sixth.displayed,
      ...(d.sixth.portrait?{portrait:photoView(d.sixth.portrait)}:{}),
      choices:d.sixth.displayed?allRetainedPhotos(d).filter(photo=>eligibleSixthPortrait(photo)&&inSixthRoom(photo.pose.position)).map(photoView):[]}}:{}),
    ...((d.night.scarletClaimed || d.flowerStock) ? {flowers:flowerView(state,photoView)} : {}),
    creativeMode: d.creativeMode, ...(restPoint ? { restPoint } : {}), ...(options.movement ? { movement: { ...options.movement } } : {}),
    camera: { active: cameraActive, target: replyGuide ? undefined : target, replyGuide, alignment: openingReady || signReady ? 1 : ridgeHint ? Number(Boolean(routeSlot)) : activeComposition?.proximity ?? 0, ready: Boolean(r.observation?.commissionHint?.ready) || openingReady || Boolean(signReady) || (ridgeHint ? Boolean(routeSlot) : Boolean(activeComposition?.matched)), feedback: r.observation?.commissionHint?.text ?? cameraFeedback, referenceVisible: d.settings.cameraAssist && !courtyardComposition && !postComposition,
      photography: { ...d.photography }, countdownSeconds: r.countdownSeconds,
      ...(memoryComposition && (clues.clueFound || clues.seatFound) ? { memory: { id: 'valley-letter', title: VALLEY_LETTER.title, alignment: memoryComposition.proximity, ready: memoryComposition.matched, feedback: memoryComposition.hint } } : {}),
    },
    ...(d.endingPhoto ? { endingPhoto: photoView(d.endingPhoto) } : {}),
    canSendLetter: canSendLetter(state), sentLetter: d.mailed, mailRequest: r.mailRequest,
    ...(navigation ? {
      playerMap: { ...mapPoint(d.player.position)!, heading: options.mapHeading ?? d.player.yaw },
      navigation: { canChooseStory: navigation.canChooseStory, preview: navigation.preview, storyRoute: navigation.storyRoute, collapsed: navigation.collapsed,
        scenicSpotId: navigation.scenicSpotId, scenicSpots:scenicSpots.filter(spot => !spot.hidden || d.sixth.displayed), hint: navigation.hint,
        postalRoads: POSTAL_MAP_ROADS.map(road => road.points.map(p => mapPoint(p)!)),
        ...(navigation.destination ? { destination: { title: navigation.destination.title, point: mapPoint(navigation.destination.position)!,
          points: navigation.destination.points.map(p => mapPoint(p)!),
          ...(navigation.destination.nextPoint ? { nextPoint: mapPoint(navigation.destination.nextPoint)! } : {}) } } : {}) },
    } : {}),
    elapsedMinutes: Math.floor(d.playSeconds / 60), saveStatus: options.saveStatus, saveMessage: options.saveMessage, toast: options.toast,
    ...(r.ride ? { cinematic: { title: '顺着风回山口', subtitle: '可以自由转头，看一眼刚走过的山路。', progress: r.ride.progress } } : {}),
  };
}

function selectedId(payload: unknown): string | undefined {
  if (typeof payload === 'string') return payload;
  if (payload && typeof payload === 'object') {
    const p = payload as Record<string, unknown>;
    return typeof p.photoId === 'string' ? p.photoId : typeof p.id === 'string' ? p.id : typeof p.replaceId === 'string' ? p.replaceId : undefined;
  }
  return undefined;
}

/** null means host-owned: capture, recovery, rest, new game, fullscreen, or a settings key callback. */
export function actionFromPresentation(state: JourneyState, action: PresentationAction, payload?: unknown): JourneyAction | null {
  switch (action) {
    // A frontend payload can never choose a recovery destination.
    case 'recover-path': case 'rest-until': case 'export-postcard': return null;
    case 'start': case 'continue': return { type: 'start' };
    case 'resume': return { type: 'set-screen', screen: 'play' };
    case 'pause': return { type: 'set-screen', screen: 'paused' };
    case 'open-journal': case 'open-film': case 'open-replies': return { type: 'set-screen', screen: 'journal' };
    case 'send-opening-photo': {
      const photoId = selectedId(payload);
      return photoId ? { type: 'send-opening-photo', photoId } : null;
    }
    case 'skip-opening-photo': return { type: 'skip-opening-photo' };
    case 'open-map': return { type: 'set-screen', screen: 'map',
      ...(payload === 'ridge-arrow' || payload === 'arch-courtyard' ? { letterMapPreview: payload } : {}) };
    case 'back-to-menu': return { type: 'return-to-menu' };
    case 'close-panel': return state.runtime.screen === 'photo' ? { type: 'close-camera' } : { type: 'set-screen', screen: 'play' };
    case 'camera-toggle': return { type: state.runtime.screen === 'photo' ? 'close-camera' : 'open-camera' };
    case 'save-photo': case 'replace-photo': {
      const p = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
      const photoId = typeof p.photoId === 'string' ? p.photoId : action === 'save-photo' && typeof payload === 'string' ? payload : undefined;
      const replaceId = typeof p.replaceId === 'string' ? p.replaceId : action === 'replace-photo' && typeof payload === 'string' ? payload : undefined;
      return { type: 'keep-photo', ...(photoId ? { photoId } : {}), ...(replaceId ? { replaceId } : {}) };
    }
    case 'discard-photo': case 'delete-film-photo': {
      const id = selectedId(payload) ?? state.durable.film.at(-1)?.id;
      return id ? { type: 'delete-film-photo', photoId: id } : action === 'discard-photo' ? { type: 'discard-draft' } : null;
    }
    case 'send-route-pair': return {type:'send-route-pair'};
    case 'attach-route-photo': {
      const p = payload as {slot?:unknown;photoId?:unknown} | undefined;
      return p && (p.slot === 'turn' || p.slot === 'destination') && typeof p.photoId === 'string' ? {type:'attach-route-photo',slot:p.slot,photoId:p.photoId} : null;
    }
    case 'select-reply-photo': {
      if (!payload || typeof payload !== 'object') return null;
      const p = payload as Record<string, unknown>;
      return (p.letterId === 'forest' || p.letterId === 'town') && typeof p.photoId === 'string'
        ? { type: 'select-reply-photo', letterId: p.letterId, photoId: p.photoId, ...(typeof p.note === 'string' ? { note: p.note } : {}) } : null;
    }
    case 'select-ending-photo': {
      const id = selectedId(payload) ?? state.durable.pendingPhoto?.id ?? state.durable.film.at(-1)?.id;
      const note = payload && typeof payload === 'object' ? (payload as Record<string, unknown>).note : undefined;
      return id ? { type: 'select-ending-photo', photoId: id, ...(typeof note === 'string' ? { note } : {}) } : null;
    }
    case 'set-weather': {
      const id = payload && typeof payload === 'object' ? (payload as Record<string, unknown>).id : payload;
      return state.durable.creativeMode && isWeather(id) ? { type: 'set-weather', weather: id } : null;
    }
    case 'track-photo-spot': {
      const selected = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {spotId:payload};
      if (selected.spotId === null) return {type:'track-photo-spot',spotId:null};
      if (typeof selected.spotId !== 'string' || !photoSpotById(selected.spotId)
        || (selected.slot !== undefined && !isPhotoOutingSlot(selected.slot))) return null;
      return { type: 'track-photo-spot', spotId:selected.spotId, ...(isPhotoOutingSlot(selected.slot) ? {slot:selected.slot} : {}) };
    }
    case 'submit-commission':
    case 'claim-commission-round': {
      if (!payload || typeof payload !== 'object') return null;
      const { round,site,photoId } = payload as Record<string,unknown>;
      if (typeof round !== 'number' || !Number.isSafeInteger(round) || round < 2) return null;
      if (action === 'claim-commission-round') return {type:action,round};
      return isCommissionSite(site) && typeof photoId === 'string' ? {type:action,round,site,photoId} : null;
    }
    case 'navigate-commission': return isCommissionSite(payload) ? { type:action, site:payload } : null;
    case 'read-ahe-route': return { type: 'read-ahe-route' };
    case 'track-scenic-spot':
      return payload === null || (typeof payload === 'string' && scenicSpotById(payload)) ? { type: 'track-scenic-spot', spotId: payload } : null;
    case 'choose-story-route':
      return payload === 'forest' || payload === 'ridge' || payload === 'free' ? { type: 'choose-story-route', route: payload } : null;
    case 'set-pocket-map': return typeof payload === 'boolean' ? { type: 'set-pocket-map', collapsed: payload } : null;
    case 'set-creative-mode': {
      const enabled = payload && typeof payload === 'object' ? (payload as Record<string, unknown>).enabled : payload;
      return typeof enabled === 'boolean' ? { type: 'set-creative-mode', enabled } : null;
    }
    case 'set-time': {
      const minute = payload && typeof payload === 'object' ? (payload as Record<string, unknown>).minute : payload;
      return state.durable.creativeMode && typeof minute === 'number' && Number.isFinite(minute) && minute >= 0 && minute < 1440 ? { type: 'set-time', minute } : null;
    }
    case 'set-photography': return payload && typeof payload === 'object' ? { type: 'set-photography', settings: cleanPhotography(payload, state.durable.photography) } : null;
    case 'cancel-countdown': return { type: 'cancel-countdown' };
    case 'replace-memory-photo': {
      if (!payload || typeof payload !== 'object') return null;
      const p = payload as Record<string, unknown>;
      return p.memoryId === 'valley-letter' && typeof p.photoId === 'string' ? { type: 'replace-memory-photo', memoryId: p.memoryId, photoId: p.photoId } : null;
    }
    case 'interact': case 'send-letter': return state.runtime.nearby ? { type: 'interact', id: state.runtime.nearby } : null;
    case 'keep-exploring': return { type: 'finish-ending' };
    default: return null;
  }
}

function commissionView({durable:d}:JourneyState,photoView:(photo:Photo)=>PhotoView):NonNullable<PresentationViewModel['commissions']> {
  const round = d.photoCommissions;
  if (round.number === 1) {
    const progress = storyCommissionProgress(d);
    return {round:1,reward:FLOWERS.gold,canClaim:false,
      entries:STORY_COMMISSIONS.map((item,index) => ({...item,done:progress[index]! ,photos:[]}))};
  }
  const retained = allRetainedPhotos(d);
  return {round:round.number,reward:FLOWERS[commissionReward(d)],
    canClaim:!d.creativeMode && round.orders.every(order => order.photoId),
    ...(round.previous ? {previous:`第 ${round.previous.number} 轮已收件 · ${FLOWERS[round.previous.reward]}`} : {}),
    entries:round.orders.map(order => ({
      title:scenicSpotById(order.site)!.title, site:order.site, hint:commissionSite(order.site).instruction, done:Boolean(order.photoId),
      photos:order.photoId || d.creativeMode ? [] : retained.filter(photo => commissionPhotoFits(round,order.site,photo)).map(photoView),
    })),
  };
}

function flowerView({durable:d,runtime:r}:JourneyState,photoView:(photo:Photo)=>PhotoView):NonNullable<PresentationViewModel['flowers']>{
  const stock=d.flowerStock,quests=d.flowerQuests;
  const next=nextFlower(stock?.earned??['gold','scarlet']);
  const site=launchGround(d.player.position),night=fireworkNight(d);
  const photos=()=>allRetainedPhotos(d);
  const view:NonNullable<PresentationViewModel['flowers']>={};
  if(next&&next!=='gold'&&next!=='scarlet'&&(d.photoCommissions.number===1||d.photoCommissions.legacy))view.next={title:COMMISSIONS[next].title,brief:COMMISSIONS[next].brief};
  if(stock) {
    const invitation=!next,liveSamples=afterClosing(d)&&stock.samples?.night===night;
    const here=Boolean(site&&stock.boxes.every(box=>launchGround(box.position)?.id===site.id));
    view.party={litSite:afterClosing(d)&&r.torchLit&&Boolean(site),capacity:stock.samples?.invitation?3:site?.capacity??0,
      invitation,invitationActive:Boolean(liveSamples&&stock.samples?.invitation),here,
      started:stock.invitation.started,witnessed:stock.invitation.witnessed,
      slots:stock.earned.map(kind=>({kind,name:FLOWERS[kind],count:stock.counts[kind]??0,
        available:availableFlower(stock,kind,'stock',night),sample:Boolean(liveSamples&&availableFlower(stock,kind,'sample',night)>0)})),
      boxes:stock.boxes.map(box=>({name:FLOWERS[box.kind],nearby:isCloseToBox(d.player.position,box)})),
      maySample:stock.earned.some(kind=>!stock.counts[kind])};
  }
  if(r.nearby==='flower:day-night-post'&&d.mailed&&!quests.dayNight){
    const retained=photos();
    view.pair={day:retained.filter(p=>photoDayPart(p)==='day').map(photoView),night:retained.filter(p=>photoDayPart(p)==='night').map(photoView),
      selectedDay:quests.draft.day?.id, selectedNight:quests.draft.night?.id};
  }
  if(r.nearby==='flower:moon-riddle'&&quests.revisit)
    view.repeat={reviewed:quests.revisit.reviewed,
      photos:photos().filter(p=>p.original&&p.sequence>quests.revisit!.acceptedAfter&&p.flowerSubjects?.includes('moon')).map(photoView)};
  return view;
}
