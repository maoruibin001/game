import { isCommissionSite } from './commission-sites.ts';
import { readCommissionRound, startNextStoryRound } from './commission-rounds.ts';
import { hallCollectsAt } from './afternoon.ts';
import { readSixth } from './sixth.ts';
import { isFlowerSubject } from './flower-catalog.ts';
import { adoptOldBoxes, launchGround } from './flower-party.ts';
import { readFlowerStock } from './flower-stock.ts';
import { readFlowerQuests } from './flower-quests.ts';
import { afterClosing, fireworkNight, readNightProgress } from './night.ts';
import { ALBUM_CAPACITY, DEFAULT_POSE, FILM_CAPACITY, MAX_SAVE_LENGTH, SAVE_KEY, SAVE_VERSION } from './content.ts';
import { cleanPose, cleanSettings, cleanThumbnail, createJourney, createRuntime, isArea, isDiscovery, isPose } from './journey.ts';
import { copyPhoto, isMemoryPhoto, memoryClues } from './memories.ts';
import { completeRoute, routeAttachment, allRetainedPhotos, cleanEndingNote, cleanReplyCandidates, cleanReplyNote, independentRoute, hasStoryReplies, isUsableReplyPhoto, replyNoteOptions, replyVariant } from './replies.ts';
import { cleanOriginalPhoto, cleanPhotography, cleanPhotoScene, isWeather } from './photo-settings.ts';
import { scenicSpotById } from './scenic-spots.ts';
import { cleanWeatherCycle } from './weather.ts';
import { cleanDayClock } from './day-clock.ts';
import { photoSpotById, photoOutingSlotAt, suitablePhotoWeather, isPhotoOutingSlot } from './photo-outings.ts';
import type { CardId, DurableJourney, JourneyState, Photo, Pose, RestoreResult, SaveResult, Settings, StoragePort } from './types.ts';

const object = (v: unknown): Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const number = (v: unknown, max = 1e9): number => typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, v)) : 0;
const integer = (v: unknown, max = 1e9): number => Math.floor(number(v, max));
const text = (v: unknown, max: number): string => typeof v === 'string' ? v.slice(0, max) : '';

function readPhoto(value: unknown, schemaVersion: number): Photo | null {
  const p = object(value);
  if (!isArea(p.area) || !isPose(p.pose) || typeof p.id !== 'string' || !/^photo-[1-9][0-9]{0,9}$/.test(p.id)) return null;
  const sequence = integer(p.sequence);
  if (sequence < 1 || p.id !== `photo-${sequence}`) return null;
  const cards: CardId[] = [];
  if (Array.isArray(p.matchedCards)) for (const id of p.matchedCards) if ((id === 'forest' || id === 'town') && !cards.includes(id)) cards.push(id);
  const original = schemaVersion >= 4 ? cleanOriginalPhoto(p.original) : undefined;
  const scene = schemaVersion >= 4 ? cleanPhotoScene(p.scene) : undefined;
  const replyCandidates = schemaVersion >= 6 && original ? cleanReplyCandidates(p.replyCandidates).filter(c => c.letter === p.area) : [];
  return {
    id: p.id, sequence, area: p.area, pose: { ...cleanPose(p.pose), area: p.area },
    title: text(p.title, 100) || `旅途 · 第${sequence}张`, capturedAt: number(p.capturedAt, 1e15), playSeconds: number(p.playSeconds),
    thumbnail: cleanThumbnail(p.thumbnail), caption: text(p.caption, 140), matchedCards: cards,
    memoryCandidates: schemaVersion >= 3 && Array.isArray(p.memoryCandidates) && p.memoryCandidates.includes('valley-letter') ? ['valley-letter'] : [],
    tutorialMatch: p.tutorialMatch === true,
    ...(original ? { original } : {}), ...(scene ? { scene } : {}),
    ...(original && scene && Array.isArray(p.commissionSites) ? {commissionSites:[...new Set(p.commissionSites.filter(isCommissionSite))].slice(0,3)} : {}),
    ...((schemaVersion < 6 || p.legacyCapture === true) ? {legacyCapture:true as const} : {}),
    ...(original && p.area === 'ridge' && (p.routeSlot === 'turn' || p.routeSlot === 'destination') ? {routeSlot:p.routeSlot} : {}),
    ...(original && p.area === 'town' && (p.afternoonSubject === 'swallow-roof' || p.afternoonSubject === 'hall-window')
      ? {afternoonSubject:p.afternoonSubject} : {}),
    ...(original && Array.isArray(p.flowerSubjects) ? {flowerSubjects:[...new Set(p.flowerSubjects.filter(isFlowerSubject))]} : {}),
    ...(replyCandidates.length ? {replyCandidates} : {}),
    ...(original && p.area === 'post' && (p.openingMountains === 0 || p.openingMountains === 1 || p.openingMountains === 2)
      ? {openingMountains: p.openingMountains} : {}),
  };
}

/** Version 1 was the unwrapped early journal format. Only these documented fields migrate. */
function migrateV1(input: Record<string, unknown>): Record<string, unknown> {
  const old = object(input.journey ?? input);
  const album = Array.isArray(old.photos) ? old.photos : Array.isArray(old.album) ? old.album : [];
  const selected = typeof old.selectedPhotoId === 'string' ? album.find(p => object(p).id === old.selectedPhotoId) : null;
  return {
    ...old, version: 4, stamps: old.stamps ?? old.completed, gateOpened: old.gateOpened ?? old.gateOpen,
    album, endingPhoto: old.endingPhoto ?? selected, pendingPhoto: old.pendingPhoto ?? null,
    discoveries: Array.isArray(old.discoveries) ? old.discoveries.map(d => typeof d === 'string' ? { id: d, foundAtPlaySeconds: 0 } : d) : [],
  };
}

function readDurable(input: Record<string, unknown>, spawn: Pose, warnings: string[], schemaVersion: number): DurableJourney {
  const result = createJourney(spawn).durable;
  result.started = input.started === true;
  const tutorial = object(input.tutorial);
  for (const key of ['moved', 'looked', 'cameraOpened', 'photoTaken', 'compositionMatched'] as const) result.tutorial[key] = tutorial[key] === true;
  const stamps = object(input.stamps), cardPhotos = object(input.cardPhotos);
  for (const key of ['forest', 'town'] as const) {
    result.stamps[key] = stamps[key] === true;
    const p = readPhoto(cardPhotos[key], schemaVersion);
    result.cardPhotos[key] = p?.matchedCards.includes(key) ? p : null;
  }
  result.gateOpened = input.gateOpened === true || result.stamps.town;
  if (Array.isArray(input.discoveries)) {
    for (const entry of input.discoveries.slice(0, 100)) {
      const d = object(entry);
      if (!isDiscovery(d.id) || result.discoveries.some(found => found.id === d.id)) continue;
      if (d.id === 'last-letter' && !result.stamps.town) continue;
      result.discoveries.push({ id: d.id, foundAtPlaySeconds: number(d.foundAtPlaySeconds) });
    }
  }
  if (Array.isArray(input.album)) for (const entry of input.album.slice(0, 100)) {
    const p = readPhoto(entry, schemaVersion);
    if (p && !result.album.some(saved => saved.id === p.id) && result.album.length < ALBUM_CAPACITY) result.album.push(p);
  }
  if (schemaVersion >= 4 && Array.isArray(input.film)) for (const entry of input.film.slice(0, 100)) {
    const p = readPhoto(entry, schemaVersion);
    if (p && !result.film.some(saved => saved.id === p.id)) result.film.push(p);
  }
  const oldDraft = readPhoto(input.pendingPhoto, schemaVersion);
  if (oldDraft && !result.film.some(p => p.id === oldDraft.id)) result.film.push(oldDraft);
  result.film = result.film.slice(-FILM_CAPACITY);
  result.pendingPhoto = null;
  result.endingPhoto = readPhoto(input.endingPhoto, schemaVersion);
  result.endingNote = schemaVersion >= 6 ? cleanEndingNote(input.endingNote) : '';
  for (const slot of ['turn','destination'] as const) {
    const photo = readPhoto(object(input.routeDraft)[slot],schemaVersion);
    if (routeAttachment(photo,slot)) result.routeDraft[slot] = photo;
  }
  const replies = object(input.replyPhotos), legacyUnlock = object(input.legacyReplyUnlock);
  for (const id of ['forest','town'] as const) {
    result.legacyReplyUnlock[id] = result.stamps[id] && (schemaVersion < 6 || legacyUnlock[id] === true);
    if (schemaVersion < 6) {
      const photo = result.cardPhotos[id], variant = replyVariant(photo,id);
      if(photo && variant) result.replyPhotos[id] = {photo:copyPhoto(photo),variant,note:'',carriedOver:true};
    } else {
      const record=object(replies[id]), photo=readPhoto(record.photo,schemaVersion), variant=record.variant === 'ridge-route' && id === 'forest' && isUsableReplyPhoto(photo) && photo.original && photo.area === 'ridge' && photo.memoryCandidates.includes('valley-letter') ? 'ridge-route' : replyVariant(photo,id);
      const destination = readPhoto(record.destination,schemaVersion);
      if (id === 'forest' && record.variant === 'route-pair' && photo && destination && completeRoute(photo,destination)) {
        result.replyPhotos.forest = {photo, destination, variant:'route-pair', note:''};
        continue;
      }
      if(photo && variant && (result.stamps[id] || independentRoute(variant)) && record.variant===variant) result.replyPhotos[id] = {
        photo:copyPhoto(photo), variant, note:cleanReplyNote(record.note,replyNoteOptions(id,photo)),
        ...(record.carriedOver === true && photo.legacyCapture ? {carriedOver:true} : {}),
      };
    }
  }
  if (schemaVersion >= 3) {
    const raw = object(input.memories)['valley-letter'];
    if (raw != null) {
      const memory = object(raw), photo = readPhoto(memory.photo, schemaVersion), clues = memoryClues(result);
      if (memory.id === 'valley-letter' && clues.clueFound && clues.seatFound && isMemoryPhoto(photo)) {
        result.memories['valley-letter'] = { id: 'valley-letter', photo: copyPhoto(photo), unlockedAtPlaySeconds: number(memory.unlockedAtPlaySeconds) };
      } else warnings.push('完整来信的照片或线索不完整，已保留其它旅行进度。');
    }
  }
  result.playSeconds = number(input.playSeconds);
  result.distanceWalked = number(input.distanceWalked);
  result.ziplineRides = integer(input.ziplineRides);
  if (schemaVersion >= 5 && Array.isArray(input.checkIns)) for (const entry of input.checkIns.slice(-24)) {
    const c = object(entry), photo = readPhoto(c.photo, schemaVersion), spot = typeof c.spotId === 'string' ? photoSpotById(c.spotId) : undefined;
    const slot = photo?.scene?.clock ? photoOutingSlotAt(photo.scene.clock) : null;
    if (!photo?.scene?.clock || !photo.original || photo.scene.weatherBlend < .98 || !spot || !Number.isInteger(c.day) || c.day !== photo.scene.clock.day
      || !slot || c.slot !== slot || result.checkIns.some(saved => saved.day === c.day && saved.slot === c.slot)
      || !suitablePhotoWeather(spot.id, slot).includes(photo.scene.weather)
      || photo.area !== spot.area || Math.hypot(photo.pose.position[0]-spot.position[0], photo.pose.position[2]-spot.position[2]) > spot.radius) continue;
    result.checkIns.push({ day: c.day as number, slot, spotId: spot.id, photo: copyPhoto(photo) });
  }
  const openingReply = readPhoto(input.openingReply, schemaVersion);
  if (openingReply?.openingMountains !== undefined) result.openingReply = openingReply;
  // Saves written before the optional skill field had both controls available.
  const skills = object(input.skills);
  result.skills = input.skills === undefined ? {run:true, jump:true} : {run:skills.run === true, jump:skills.jump === true};
  const reward = object(input.fireworks), rewardPhoto = readPhoto(reward.photo, schemaVersion);
  if (rewardPhoto?.afternoonSubject === 'hall-window' && typeof reward.minute === 'number' && hallCollectsAt(reward.minute)
    && typeof reward.day === 'number' && Number.isSafeInteger(reward.day) && reward.day >= 1) {
    result.fireworks = {photo:rewardPhoto, day:reward.day, minute:reward.minute};
  }
  result.flowerQuests=readFlowerQuests(input.flowerQuests,raw=>readPhoto(raw,schemaVersion),integer(input.totalPhotos));
  result.sixth=readSixth(input.sixth,raw=>readPhoto(raw,schemaVersion));
  const everyPhoto = allRetainedPhotos(result);
  result.totalPhotos = Math.max(integer(input.totalPhotos), ...everyPhoto.map(p => p.sequence), 0);
  result.tutorial.photoTaken ||= result.totalPhotos > 0;
  result.openingSkipped = input.openingSkipped === true || (
    input.openingSkipped === undefined && !result.openingReply && result.tutorial.photoTaken
  );
  result.tutorial.cameraOpened ||= result.tutorial.photoTaken;
  result.player = isPose(input.player) ? cleanPose(input.player) : cleanPose(spawn);
  if (!isPose(input.player)) warnings.push('玩家位置无效，已回到山口安全位置。');
  result.settings = cleanSettings(object(input.settings) as Partial<Settings>);
  // An already-mailed legacy envelope stays mailed even if an old image is lost;
  // no replacement image is manufactured, and an unfinished journey still needs one.
  const preservedLegacyEnding = input.mailed === true && result.legacyReplyUnlock.forest && result.legacyReplyUnlock.town;
  const endingValid = hasStoryReplies(result) && (isUsableReplyPhoto(result.endingPhoto) || preservedLegacyEnding);
  result.mailed = input.mailed === true && endingValid;
  result.endingSeen = input.endingSeen === true && result.mailed;
  result.weather = schemaVersion >= 4 && isWeather(input.weather) ? input.weather : result.mailed ? 'afterglow' : 'morning';
  result.clock = schemaVersion >= 5 ? cleanDayClock(input.clock) : cleanDayClock({ day: 1, minute: result.weather === 'afterglow' ? 1060 : 930 });
  result.night = readNightProgress(input.night, result.fireworks !== null, result.clock, result.playSeconds);
  if(result.fireworks && input.flowerStock){
    const old=adoptOldBoxes(result);
    const stock=readFlowerStock(input.flowerStock,old,afterClosing(result)?fireworkNight(result):0,launchGround);
    if(stock.earned.length>=2)result.flowerStock=stock;
  }
  if (schemaVersion < 5 && result.weather === 'afterglow') result.weather = 'morning';
  result.creativeMode = schemaVersion >= 5 && input.creativeMode === true;
  if (result.creativeMode) {
    const returning = object(input.creativeReturn);
    result.creativeReturn = { clock: cleanDayClock(returning.clock),
      weather: isWeather(returning.weather) ? returning.weather : 'morning',
      weatherCycle: cleanWeatherCycle(returning.weatherCycle) };
  }
  result.trackedPhotoSpot = schemaVersion >= 5 && typeof input.trackedPhotoSpot === 'string' && photoSpotById(input.trackedPhotoSpot) ? input.trackedPhotoSpot : null;
  result.trackedPhotoSlot = result.trackedPhotoSpot && isPhotoOutingSlot(input.trackedPhotoSlot) ? input.trackedPhotoSlot : null;
  if (typeof input.trackedScenicSpot === 'string' && scenicSpotById(input.trackedScenicSpot)) {
    result.trackedScenicSpot = input.trackedScenicSpot;
    result.trackedPhotoSpot = null;
    result.trackedPhotoSlot = null;
  }
  if (input.storyRoute === 'forest' || input.storyRoute === 'ridge' || input.storyRoute === 'free') result.storyRoute = input.storyRoute;
  result.pocketMapCollapsed = input.pocketMapCollapsed === true;
  result.weatherCycle = cleanWeatherCycle(schemaVersion >= 4 ? input.weatherCycle : undefined);
  result.photography = cleanPhotography(schemaVersion >= 4 ? input.photography : undefined);
  result.mailedFrom = result.mailed ? text(input.mailedFrom, 100) || 'mailbox:post' : null;
  if (input.mailed === true && !endingValid) warnings.push('寄信记录缺少必要照片或印记，已保留旅行进度供继续完成。');
  if (result.stamps.forest || result.stamps.town || result.totalPhotos > 0) result.started = true;
  result.photoCommissions = readCommissionRound(input.photoCommissions, result);
  startNextStoryRound(result);
  return result;
}

/** Save only durable progress. A reload during a ride starts at the safe boarding point. */
export function serializeJourney(state: JourneyState): string {
  const journey = state.runtime.ride ? { ...state.durable, player: cleanPose(state.runtime.ride.safeStart) } : state.durable;
  const photoTable: Record<string, Photo> = Object.create(null), encodedPhotos = new Map<string, string>();
  const reference = (photo: Photo | null): string | null => {
    if (!photo) return null;
    const json = JSON.stringify(photo);
    let key = photo.id, suffix = 1;
    // Normal copies share an immutable ID. Preserve a conflicting historical
    // copy rather than silently discard its independently retained image.
    while (encodedPhotos.has(key) && encodedPhotos.get(key) !== json) key = `${photo.id}~${suffix++}`;
    if (!encodedPhotos.has(key)) { photoTable[key] = photo; encodedPhotos.set(key, json); }
    return key;
  };
  const packed = { ...journey, checkIns: journey.checkIns.map(c => ({ ...c, photo: reference(c.photo) })), album: journey.album.map(reference), film: journey.film.map(reference),
    routeDraft: {turn:reference(journey.routeDraft.turn), destination:reference(journey.routeDraft.destination)},
    cardPhotos: { forest: reference(journey.cardPhotos.forest), town: reference(journey.cardPhotos.town) },
    replyPhotos: Object.fromEntries((['forest','town'] as const).map(id=>[id,journey.replyPhotos[id] ? {...journey.replyPhotos[id],photo:reference(journey.replyPhotos[id]!.photo),destination:reference(journey.replyPhotos[id]!.destination ?? null)} : null])),
    fireworks: journey.fireworks ? {...journey.fireworks, photo:reference(journey.fireworks.photo)} : null,
    sixth:{...journey.sixth,portrait:reference(journey.sixth.portrait)},
    flowerQuests:{...journey.flowerQuests,
      proofs:Object.fromEntries(Object.entries(journey.flowerQuests.proofs).map(([kind,photo])=>[kind,reference(photo)])),
      draft:Object.fromEntries(Object.entries(journey.flowerQuests.draft).map(([part,photo])=>[part,reference(photo)])),
      dayNight:journey.flowerQuests.dayNight?{day:reference(journey.flowerQuests.dayNight.day),night:reference(journey.flowerQuests.dayNight.night)}:null},
    openingReply: reference(journey.openingReply), endingPhoto: reference(journey.endingPhoto), pendingPhoto: reference(journey.pendingPhoto),
    memories: { 'valley-letter': journey.memories['valley-letter'] ? { ...journey.memories['valley-letter'], photo: reference(journey.memories['valley-letter'].photo) } : null } };
  const encoded = JSON.stringify({ game: 'shanye-laixin', version: SAVE_VERSION, photoTable, journey: packed });
  if (encoded.length > MAX_SAVE_LENGTH) throw new Error('旅行册过大，请减少照片图片大小。');
  return encoded;
}

function unpackV4(parsed: Record<string, unknown>): Record<string, unknown> {
  const journey = object(parsed.journey), table = object(parsed.photoTable);
  const resolve = (value: unknown): unknown => typeof value === 'string' ? Object.hasOwn(table, value) ? table[value] : null : value;
  const flowers=object(journey.flowerQuests),pair=object(flowers.dayNight);
  const resolveMap=(map:unknown)=>Object.fromEntries(Object.entries(object(map)).map(([key,value])=>[key,resolve(value)]));
  const cards = object(journey.cardPhotos), replies=object(journey.replyPhotos), memory = object(object(journey.memories)['valley-letter']);
  return { ...journey, checkIns: Array.isArray(journey.checkIns) ? journey.checkIns.slice(-24).map(c => ({ ...object(c), photo: resolve(object(c).photo) })) : [], album: Array.isArray(journey.album) ? journey.album.slice(0, 100).map(resolve) : [],
    film: Array.isArray(journey.film) ? journey.film.slice(0, 100).map(resolve) : [],
    routeDraft: {turn:resolve(object(journey.routeDraft).turn),destination:resolve(object(journey.routeDraft).destination)},
    cardPhotos: { forest: resolve(cards.forest), town: resolve(cards.town) },
    replyPhotos: Object.fromEntries((['forest','town'] as const).map(id=>[id,replies[id] ? {...object(replies[id]),photo:resolve(object(replies[id]).photo),destination:resolve(object(replies[id]).destination)} : null])),
    fireworks: journey.fireworks ? {...object(journey.fireworks), photo:resolve(object(journey.fireworks).photo)} : null,
    sixth:{...object(journey.sixth),portrait:resolve(object(journey.sixth).portrait)},
    flowerQuests:{...flowers,proofs:resolveMap(flowers.proofs),draft:resolveMap(flowers.draft),
      dayNight:{day:resolve(pair.day),night:resolve(pair.night)}},
    openingReply: resolve(journey.openingReply), endingPhoto: resolve(journey.endingPhoto), pendingPhoto: resolve(journey.pendingPhoto),
    memories: { 'valley-letter': Object.keys(memory).length ? { ...memory, photo: resolve(memory.photo) } : null } };
}

/** Invalid/future saves are never silently overwritten by this reader. */
export function restoreJourney(serialized: string | null | undefined, spawn: Pose = DEFAULT_POSE): RestoreResult {
  const fresh = () => createJourney(spawn);
  if (serialized == null || serialized === '') return { state: fresh(), status: 'empty', warnings: [] };
  if (typeof serialized !== 'string' || serialized.length > MAX_SAVE_LENGTH) return { state: fresh(), status: 'invalid', warnings: ['存档体积异常，原始记录未被改写。'] };
  let parsed: Record<string, unknown>;
  try { parsed = object(JSON.parse(serialized)); }
  catch { return { state: fresh(), status: 'invalid', warnings: ['存档内容无法读取，原始记录未被改写。'] }; }
  if (typeof parsed.version === 'number' && parsed.version > SAVE_VERSION) return { state: fresh(), status: 'future-version', warnings: ['这个旅行册来自更新版本，请使用对应版本打开。'] };
  if (parsed.version !== 1 && ((parsed.version !== 2 && parsed.version !== 3 && parsed.version !== 4 && parsed.version !== 5 && parsed.version !== 6) || parsed.game !== 'shanye-laixin' || !parsed.journey || typeof parsed.journey !== 'object' || Array.isArray(parsed.journey))) {
    return { state: fresh(), status: 'invalid', warnings: ['不是可识别的拍一卷山色存档，原始记录未被改写。'] };
  }
  const warnings: string[] = [];
  const durable = readDurable(parsed.version === 1 ? migrateV1(parsed) : (parsed.version === 4 || parsed.version === 5 || parsed.version === 6) ? unpackV4(parsed) : object(parsed.journey), spawn, warnings, parsed.version as number);
  return { state: { durable, runtime: createRuntime(durable) }, status: parsed.version === SAVE_VERSION ? 'loaded' : 'migrated', warnings };
}

export function saveToStorage(storage: StoragePort, state: JourneyState, key = SAVE_KEY): SaveResult {
  try { storage.setItem(key, serializeJourney(state)); return { ok: true }; }
  catch (error) { return { ok: false, reason: error instanceof Error ? error.message : '旅行册暂时无法保存，请保留当前页面。' }; }
}

export function loadFromStorage(storage: StoragePort, spawn: Pose = DEFAULT_POSE, key = SAVE_KEY): RestoreResult {
  try { return restoreJourney(storage.getItem(key), spawn); }
  catch { return { state: createJourney(spawn), status: 'invalid', warnings: ['浏览器暂不允许读取旅行册。当前游玩仍可继续。'] }; }
}
