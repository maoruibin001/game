import type { DurableJourney, MemoryId, Photo } from './types.ts';

export function memoryClues(d: DurableJourney): { clueFound: boolean; seatFound: boolean } {
  return { clueFound: d.discoveries.some(found => found.id === 'lost-postcard'), seatFound: d.discoveries.some(found => found.id === 'sunset-seat') };
}
/** Geometry eligibility alone never supplies the image used by the letter. */
export function isMemoryPhoto(photo: Photo | null | undefined, id: MemoryId = 'valley-letter'): photo is Photo {
  return Boolean(photo && photo.thumbnail && photo.memoryCandidates.includes(id));
}
export function copyPhoto(photo: Photo): Photo {
  return { ...photo, pose: { ...photo.pose, position: [...photo.pose.position] }, matchedCards: [...photo.matchedCards], memoryCandidates: [...photo.memoryCandidates],
    ...(photo.replyCandidates ? { replyCandidates: photo.replyCandidates.map(candidate => ({...candidate})) } : {}),
    ...(photo.original ? { original: { ...photo.original } } : {}),
    ...(photo.scene ? { scene: { ...photo.scene, ...(photo.scene.clock ? {clock:{...photo.scene.clock}} : {}), camera: { ...photo.scene.camera, position: [...photo.scene.camera.position], forward: [...photo.scene.camera.forward] }, subject: { ...photo.scene.subject, position: [...photo.scene.subject.position] } } } : {}) };
}
/** Pending drafts count only for the shutter that completes the event or explicit replacement. */
export function retainedMemoryPhotos(d: DurableJourney, includeDraft = false): Photo[] {
  const sources = [...d.film, ...d.album, d.endingPhoto, ...Object.values(d.cardPhotos), ...Object.values(d.replyPhotos).map(reply=>reply?.photo), ...(includeDraft ? [d.pendingPhoto] : [])];
  const unique = new Map<string, Photo>();
  for (const photo of sources) if (isMemoryPhoto(photo)) unique.set(photo.id, photo);
  return [...unique.values()].sort((a, b) => b.sequence - a.sequence);
}
