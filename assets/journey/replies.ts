import { FINAL_REPLY, REPLY_LETTERS } from './content.ts';
import type { CardId, DurableJourney, Photo, ReplyCandidate, ReplyPhoto, ReplyVariant } from './types.ts';

/** Historical thumbnails stay usable; a new reply needs its captured original reference. */
export function isUsableReplyPhoto(photo: Photo | null | undefined): photo is Photo {
  return Boolean(photo?.thumbnail && (photo.original || photo.legacyCapture === true));
}
export function cleanReplyCandidates(value: unknown): ReplyCandidate[] {
  if (!Array.isArray(value)) return [];
  const clean: ReplyCandidate[] = [];
  for (const candidate of value) {
    if (candidate?.ruleVersion !== 1 || clean.some(entry => entry.letter === candidate.letter)) continue;
    if (candidate.letter === 'town' && candidate.variant === 'courtyard') clean.push({letter:'town',variant:'courtyard',ruleVersion:1});
    if (candidate.letter === 'forest' && candidate.variant === 'sign-route') clean.push({letter:'forest',variant:'sign-route',ruleVersion:1});
  }
  return clean;
}
export function replyVariant(photo: Photo | null | undefined, letterId: CardId): ReplyVariant | null {
  if (!isUsableReplyPhoto(photo)) return null;

  if (photo.area !== letterId) return null;
  const candidate = cleanReplyCandidates(photo.replyCandidates).find(entry => entry.letter === letterId);
  if (photo.original && candidate) return candidate.variant;
  return photo.matchedCards.includes(letterId) ? 'landmark' : null;
}
/** Includes independently retained replies so film eviction cannot strand a chosen image. */
export function allRetainedPhotos(d: DurableJourney): Photo[] {
  const sources = [d.pendingPhoto, ...d.film, ...d.album, ...Object.values(d.cardPhotos),
    ...Object.values(d.routeDraft), ...Object.values(d.replyPhotos).flatMap(r => [r?.photo, r?.destination]), d.endingPhoto, d.openingReply, d.fireworks?.photo,
    ...Object.values(d.memories).map(m => m?.photo), ...d.checkIns.map(c => c.photo),
    ...Object.values(d.flowerQuests.proofs), ...Object.values(d.flowerQuests.draft), d.flowerQuests.dayNight?.day, d.flowerQuests.dayNight?.night, d.sixth.portrait];
  const unique = new Map<string, Photo>();
  for (const photo of sources) if (photo && !unique.has(photo.id)) unique.set(photo.id, photo);
  return [...unique.values()].sort((a, b) => b.sequence - a.sequence);
}
export function routeAttachment(photo: Photo | null | undefined, slot: Photo['routeSlot']): photo is Photo {
  return Boolean(isUsableReplyPhoto(photo) && photo.original && photo.area === 'ridge' && slot && photo.routeSlot === slot);
}
export function completeRoute(turn: Photo | null, end: Photo | null): boolean {
  return routeAttachment(turn, 'turn') && routeAttachment(end, 'destination') && turn.id !== end.id && turn.original!.key !== end.original!.key;
}
export function replyPhotoCandidates(d: DurableJourney, letterId: CardId): Photo[] {
  return allRetainedPhotos(d).filter(photo => {
    const variant = replyVariant(photo, letterId);
    return variant !== null && (d.stamps[letterId] || independentRoute(variant));
  });
}
export function independentRoute(variant: ReplyVariant | null | undefined): boolean {
  return variant === 'route-pair' || variant === 'sign-route' || variant === 'ridge-route';
}
export function hasStoryReplies(d: DurableJourney): boolean {
  const answered = (id: CardId) => d.replyPhotos[id] !== null || d.legacyReplyUnlock[id];
  return d.stamps.town && answered('town') && (independentRoute(d.replyPhotos.forest?.variant) || (d.stamps.forest && answered('forest')));
}
export function replyNoteOptions(letterId: CardId, photo: Photo): readonly string[] {
  const neutral = '这是我今天见到的样子';
  if (letterId === 'forest' && photo.area === 'ridge' && photo.memoryCandidates.includes('valley-letter')) return ['', neutral, '找到红屋顶，再看看山谷另一头。'];
  if (letterId === 'forest' && replyVariant(photo, letterId) === 'sign-route') return ['', neutral, '到了红箭头这儿，就往风车去。'];
  if (!photo.scene || photo.scene.weatherBlend < .98) return ['', neutral];
  if (letterId === 'forest') return ['', neutral, photo.scene.weather === 'rain' ? '今天的风车藏在细雨里。' : '今天的叶片很清楚。'];
  return ['', neutral, photo.scene.weather === 'rain' ? '今天的旧镇落着细雨。' : '门外看山，檐下歇脚。'];
}
export function cleanReplyNote(value: unknown, options: readonly string[]): string {
  return typeof value === 'string' && options.includes(value) ? value : '';
}
export function cleanEndingNote(value: unknown): string { return cleanReplyNote(value, FINAL_REPLY.noteOptions); }
export function replyResponse(letterId: CardId, reply: ReplyPhoto): string {
  if (letterId === 'forest' && reply.variant === 'route-pair') return REPLY_LETTERS.forest.pairResponse;
  if (letterId === 'forest') return reply.variant === 'ridge-route' ? REPLY_LETTERS.forest.ridgeResponse : reply.variant === 'sign-route' ? REPLY_LETTERS.forest.response : REPLY_LETTERS.forest.chimeResponse;
  if (reply.variant !== 'courtyard') return REPLY_LETTERS.town.response;
  const scene = reply.photo.scene;
  return REPLY_LETTERS.town.courtyardResponse + (scene?.weather === 'rain' && scene.weatherBlend >= .98 ? REPLY_LETTERS.town.rainResponse : '');
}
