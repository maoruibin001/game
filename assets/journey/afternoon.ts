import type { DurableJourney, Photo } from './types.ts';
import { allRetainedPhotos } from './replies.ts';

export const EVENING_BELL = 17 * 60 + 30;
export const HALL_CLOSE = 18 * 60 + 40;
export const HALL_OPEN = 6 * 60 + 20;

export function hallCollectsAt(minute: number): boolean {
  return minute >= HALL_OPEN && minute < HALL_CLOSE;
}

/** The directions can arrive as one real forest frame or the two attached east-ridge frames. */
export function hasAfternoonDirections(d: DurableJourney): boolean {
  const forest = d.replyPhotos.forest;
  if (forest?.variant === 'route-pair') return Boolean(forest.photo.original && forest.destination?.original);
  if (forest?.photo.original || d.cardPhotos.forest?.original) return true;
  return allRetainedPhotos(d).some(photo => photo.original && photo.replyCandidates?.some(candidate => candidate.variant === 'sign-route'));
}

export function afternoonPhoto(d: DurableJourney, subject: 'swallow-roof' | 'hall-window'): Photo | undefined {
  return allRetainedPhotos(d).find(photo => photo.original && photo.afternoonSubject === subject);
}
