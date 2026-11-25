import { clampZoom, DEFAULT_PHOTOGRAPHY, WEATHER_LABELS, type OriginalPhoto, type PhotographySettings, type PhotoSceneRecord, type WeatherId } from '../shared/photography-contract.ts';

export const isWeather = (value: unknown): value is WeatherId => typeof value === 'string' && Object.hasOwn(WEATHER_LABELS, value);
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const vector = (value: unknown): value is [number, number, number] => Array.isArray(value) && value.length === 3 && value.every(n => finite(n) && Math.abs(n) <= 1_000_000);

export function cleanPhotography(value: unknown, base: Readonly<PhotographySettings> = DEFAULT_PHOTOGRAPHY): PhotographySettings {
  const p = object(value), result = { ...base };
  if (p.mode === 'landscape' || p.mode === 'portrait') result.mode = p.mode;
  if (p.framing === 'wide' || p.framing === 'full') result.framing = p.framing;
  if (p.lens === 'wide' || p.lens === 'standard' || p.lens === 'detail' || p.lens === 'tele') {
    result.lens = p.lens;
    delete result.zoom;
  }
  if (finite(p.zoom)) result.zoom=clampZoom(p.zoom);
  if (p.pose === 'look' || p.pose === 'wave' || p.pose === 'letter') result.pose = p.pose;
  if (finite(p.exposure)) result.exposure = Math.max(-1, Math.min(1, p.exposure));
  if (finite(p.viewpoint)) result.viewpoint = Math.max(0, Math.min(2, Math.floor(p.viewpoint)));
  if (p.timerSeconds === 0 || p.timerSeconds === 3) result.timerSeconds = p.timerSeconds;
  return result;
}

/** Only a reference to the original stored by the frontend; never accepts its image bytes. */
export function cleanOriginalPhoto(value: unknown): OriginalPhoto | undefined {
  const p = object(value);
  if (typeof p.key !== 'string' || p.key.length < 1 || p.key.length > 200 || /[\u0000-\u001f]/.test(p.key) || p.mime !== 'image/jpeg') return undefined;
  if (![p.width,p.height].every(n => finite(n) && Number.isInteger(n) && n >= 1 && n <= 16384)
    || !finite(p.bytes) || !Number.isInteger(p.bytes) || p.bytes < 1 || p.bytes > 100_000_000) return undefined;
  return { key: p.key, width: p.width as number, height: p.height as number, mime: 'image/jpeg', bytes: p.bytes };
}

/** Describes the already applied capture frame. Defaults must not invent old photo metadata. */
export function cleanPhotoScene(value: unknown): PhotoSceneRecord | undefined {
  const p = object(value), camera = object(p.camera), subject = object(p.subject);
  if (!isWeather(p.weather) || !finite(p.weatherBlend) || p.weatherBlend < 0 || p.weatherBlend > 1
    || (p.mode !== 'landscape' && p.mode !== 'portrait') || !['wide','standard','detail','tele'].includes(String(p.lens))
    || !finite(p.exposure) || p.exposure < -1 || p.exposure > 1 || !['look','wave','letter'].includes(String(p.pose))
    || !vector(camera.position) || !vector(camera.forward) || Math.hypot(...camera.forward) < .001
    || !finite(camera.verticalFovRadians) || camera.verticalFovRadians <= 0 || camera.verticalFovRadians >= Math.PI
    || !finite(camera.aspect) || camera.aspect < .1 || camera.aspect > 10 || !vector(subject.position)
    || !finite(subject.yaw) || typeof subject.visible !== 'boolean') return undefined;
  const clock = object(p.clock);
  const recordedClock = finite(clock.day) && Number.isInteger(clock.day) && clock.day >= 1 && clock.day <= 1e6
    && finite(clock.minute) && clock.minute >= 0 && clock.minute < 1440 ? { day: clock.day, minute: clock.minute } : undefined;
  return { ...(recordedClock ? { clock: recordedClock } : {}), weather: p.weather, weatherBlend: p.weatherBlend, mode: p.mode, lens: p.lens as PhotoSceneRecord['lens'], exposure: p.exposure, pose: p.pose as PhotoSceneRecord['pose'],
    camera: { position: [...camera.position], forward: [...camera.forward], verticalFovRadians: camera.verticalFovRadians, aspect: camera.aspect },
    subject: { position: [...subject.position], yaw: subject.yaw, visible: subject.visible } };
}
