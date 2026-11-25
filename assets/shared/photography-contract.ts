/** Shared game contract, not a second manifest or an Engine configuration. */
import type { JourneyClock } from '../journey/day-clock.ts';
/** Persisted IDs retain their V4 spelling; sunlight is now owned by the clock. */
export type WeatherId = 'morning' | 'rain' | 'afterglow';
export type LensId = 'wide' | 'standard' | 'detail' | 'tele';
export type PhotoMode = 'landscape' | 'portrait';
export type PhotoPose = 'look' | 'wave' | 'letter';
export type PhotoFraming = 'full' | 'wide';
export interface PhotographySettings {
  mode: PhotoMode;
  framing?: PhotoFraming;
  lens: LensId;
  /** Optional continuous optical magnification, relative to the wide lens. */
  zoom?: number;
  exposure: number; // EV compensation, -1 .. 1.
  pose: PhotoPose;
  viewpoint: number; // Ordinary collision-checked assisted camera candidate.
  timerSeconds: 0 | 3;
}
export const DEFAULT_PHOTOGRAPHY: Readonly<PhotographySettings> = Object.freeze({
  mode: 'landscape', lens: 'wide', exposure: 0, pose: 'look', viewpoint: 0, timerSeconds: 0,
});
export const WIDE_PHOTO_ASPECT = 16 / 9;

/** Pixel-aligned centre crop. The JPEG and the finder use these same source pixels. */
export function photoFrameBounds(width:number,height:number,framing?:PhotoFraming) {
  const step = framing === 'wide' ? Math.floor(Math.min(width / 16, height / 9)) : 0;
  if (step < 1) return { x:0, y:0, width, height };
  const frameWidth = 16 * step, frameHeight = 9 * step;
  return { x:Math.floor((width - frameWidth) / 2), y:Math.floor((height - frameHeight) / 2), width:frameWidth, height:frameHeight };
}
export const WEATHER_LABELS: Readonly<Record<WeatherId, string>> = Object.freeze({
  morning: '晴朗', rain: '细雨', afterglow: '多云',
});
export const LEGACY_WEATHER_LABELS: Readonly<Record<WeatherId, string>> = Object.freeze({
  morning: '晴朗清晨', rain: '薄雾细雨', afterglow: '雨后夕照',
});
export const LENS_FOV: Readonly<Record<LensId, number>> = Object.freeze({
  wide: Math.PI / 3, standard: 42 * Math.PI / 180, detail: 28 * Math.PI / 180, tele: 8 * Math.PI / 180,
});
export const MAX_ZOOM=10;
export const magnificationForFov=(fov:number)=>Math.tan(LENS_FOV.wide/2)/Math.tan(fov/2);
export const clampZoom=(value:number)=>Math.min(MAX_ZOOM,Math.max(1,Math.round(value*10)/10));
export function photographyFov(settings:Pick<PhotographySettings,'lens'|'zoom'>):number {
  return settings.zoom===undefined ? LENS_FOV[settings.lens] : 2*Math.atan(Math.tan(LENS_FOV.wide/2)/clampZoom(settings.zoom));
}
export function closestLens(fov:number):LensId {
  const lenses=Object.keys(LENS_FOV) as LensId[];
  return lenses.reduce((a,b)=>Math.abs(Math.log(magnificationForFov(LENS_FOV[a])/magnificationForFov(fov)))<=
    Math.abs(Math.log(magnificationForFov(LENS_FOV[b])/magnificationForFov(fov)))?a:b);
}
export interface OriginalPhoto {
  key: string;
  width: number;
  height: number;
  mime: 'image/jpeg';
  bytes: number;
}
export interface PhotoSceneRecord {
  /** Actual applied capture time. Absent for historic photographs. */
  clock?: JourneyClock;
  weather: WeatherId;
  /** Actual applied target blend, not a future requested state. */
  weatherBlend: number;
  mode: PhotoMode;
  lens: LensId;
  exposure: number;
  pose: PhotoPose;
  camera: {
    position: readonly [number, number, number];
    forward: readonly [number, number, number];
    verticalFovRadians: number;
    aspect: number;
  };
  subject: { position: readonly [number, number, number]; yaw: number; visible: boolean };
}
