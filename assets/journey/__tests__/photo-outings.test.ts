import { GAME_MINUTES_PER_REAL_SECOND } from '../day-clock.ts';
import { describe, expect, it } from 'vitest';
import { createWeatherCycle, weatherProbabilitiesAtOffset } from '../weather.ts';
import { buildPhotoOutings, evaluatePhotoCheckIn, PHOTO_SPOTS, photoOutingSlotAt, photoSpotById, suitablePhotoWeather, type PhotoCheckInInput, type PhotoOutingsInput } from '../photo-outings.ts';
import type { Photo, ProjectedAnchor, WeatherId } from '../types.ts';
import { terrainHeight } from '../../shanye-world/world-layout.ts';
import { createTravelController } from '../../controller/travel-controller.ts';
import { observePhoto } from '../../entry/engine-helper.ts';
import { clockWeatherValues } from '../../environment/weather.ts';
import { sunDiscShape } from '../../environment/sun-disc.ts';

function planning(weather: WeatherId = 'morning'): PhotoOutingsInput {
  return { clock: { day: 1, minute: 930 }, weather, weatherCycle: createWeatherCycle(123), position: [2, terrainHeight(2, -214), -214],
    gateOpened: false, checkIns: [], trackedSpotId: null };
}
const anchor: ProjectedAnchor = { x: .5, y: .5, width: .2, height: .2, depth: 20, visibleFraction: 1, occluded: false };
function capture(spotId: string = 'post-porch', minute = 930, weather: WeatherId = 'morning'): PhotoCheckInInput {
  const spot = photoSpotById(spotId)!, clock = { day: 1, minute };
  const photo: Photo = { id: 'photo-1', sequence: 1, title: '', area: spot.area, pose: { position: spot.position, area: spot.area, yaw: 0, pitch: 0 },
    capturedAt: 1, playSeconds: 1, thumbnail: null, matchedCards: [], memoryCandidates: [], tutorialMatch: false, caption: '',
    original: { key: 'original-1', width: 1920, height: 1080, mime: 'image/jpeg', bytes: 1000 },
    scene: { weather, weatherBlend: 1, clock, mode: 'landscape', lens: 'wide', exposure: 0, pose: 'look',
      camera: { position: [spot.position[0], spot.position[1] + 1.64, spot.position[2]], forward: [0, 0, -1], verticalFovRadians: Math.PI / 3, aspect: 16 / 9 },
      subject: { position: spot.position, yaw: 0, visible: false } } };
  return { photo, observation: { area: spot.area, vantageTags: [], anchors: { 'post-door': { ...anchor }, windmill: { ...anchor }, 'forest-chime': { ...anchor, x:.72, y:.55, width:.035, height:.06, depth:8 },
    'stone-arch': { ...anchor }, mountain: { ...anchor }, 'red-mailbox': { ...anchor }, 'memory-windmill': { ...anchor }, 'sun-disc': { ...anchor } } },
  clock, weather, gateOpened: true, checkIns: [], creativeMode: false, captured: true };
}

describe('daily photography recommendations', () => {
  it('has three distinct clock windows and uses half-open sunset boundaries', () => {
    expect(photoOutingSlotAt({ day: 1, minute: 359 })).toBe(null);
    expect(photoOutingSlotAt({ day: 1, minute: 360 })).toBe('morning');
    expect(photoOutingSlotAt({ day: 1, minute: 930 })).toBe('afternoon');
    expect(photoOutingSlotAt({ day: 1, minute: 1060 })).toBe('sunset');
    expect(photoOutingSlotAt({ day: 1, minute: 1100 })).toBe(null);
  });
  it.each([1, 2, 3])('keeps all three cards distinct on day %s across skies, time windows, and departure regions', day => {
    for (const weather of ['morning', 'rain', 'afterglow'] as const) {
      for (const minute of [407, 930, 1070]) {
        for (const departure of PHOTO_SPOTS) {
          const input = planning(weather); input.clock = { day, minute }; input.position = departure.position;
          const { recommendations } = buildPhotoOutings(input);
          expect(recommendations.map(r => r.slot)).toEqual(['morning', 'afternoon', 'sunset']);
          expect(new Set(recommendations.map(r => r.spotId)).size).toBe(3);
          expect(recommendations.find(r => r.status === 'active')!.weatherProbability).toBeGreaterThan(0);
          for (const recommendation of recommendations) {
            expect(recommendation.weatherProbability).toBeCloseTo(suitablePhotoWeather(recommendation.spotId, recommendation.slot)
              .reduce((chance, id) => chance + recommendation.weatherProbabilities[id], 0));
          }
        }
      }
    }
  });
  it('fixes day-two rainy morning without allowing the other slots to repeat its arch', () => {
    const input = planning('rain'); input.clock = { day: 2, minute: 407 };
    input.position = photoSpotById('town-arch')!.position; input.trackedSpotId = 'town-arch';
    const result = buildPhotoOutings(input);
    expect(result.recommendations[0]).toMatchObject({ spotId: 'town-arch', status: 'active', weatherProbability: 100 });
    expect(result.recommendations.slice(1).every(r => r.spotId !== 'town-arch')).toBe(true);
    expect(result.tracked).toMatchObject({ spotId: 'town-arch', slot: 'morning', weatherProbability: 100 });
    expect(result.tracked!.preparation).toBe('到石拱西侧找系着红绳的绞盘，按 E 打开木屏。');
  });
  it('changes the active recommendation with the weather while the followed spot stays fixed', () => {
    const clear = planning(), rainy = planning('rain'); clear.trackedSpotId = rainy.trackedSpotId = 'forest-windmill';
    const a = buildPhotoOutings(clear), b = buildPhotoOutings(rainy);
    expect(a.recommendations.find(r => r.slot === 'afternoon')!.spotId).toBe('forest-windmill');
    expect(b.recommendations.find(r => r.slot === 'afternoon')!.spotId).toBe('town-arch');
    expect(a.tracked!.spotId).toBe('forest-windmill'); expect(b.tracked!.spotId).toBe('forest-windmill');
    expect(a.tracked!.weatherProbability).toBeGreaterThan(b.tracked!.weatherProbability);
    expect(b.tracked!.preparation).toContain('无需机关');
  });
  it('uses ETA-to-window Markov probabilities, never the next seeded weather result', () => {
    const a = planning(); a.weatherCycle.elapsedSeconds = a.weatherCycle.durationSeconds - 1;
    const b = { ...a, weatherCycle: { ...a.weatherCycle, seed: 987654321 } };
    expect(buildPhotoOutings(a)).toEqual(buildPhotoOutings(b));
    const sunset = buildPhotoOutings(a).recommendations.find(r => r.slot === 'sunset')!;
    const offset = ((sunset.forecastAt.day - a.clock.day) * 1440 + sunset.forecastAt.minute - a.clock.minute) / GAME_MINUTES_PER_REAL_SECOND;
    expect(sunset.weatherProbabilities).toEqual(weatherProbabilitiesAtOffset(a.weather, a.weatherCycle, offset));
    expect(Object.values(sunset.weatherProbabilities).filter(chance=>chance>0).length).toBeGreaterThan(1);
  });
  it('varies similarly suitable cloudy-day choices by day, while reloading the same day stays deterministic', () => {
    const input = planning('afterglow'), spots = new Set<string>();
    for (let day = 1; day <= 17; day++) {
      input.clock.day = day;
      const first = buildPhotoOutings(input);
      expect(buildPhotoOutings(input)).toEqual(first);
      spots.add(first.recommendations.find(r => r.slot === 'afternoon')!.spotId);
    }
    expect(spots).toEqual(new Set(['forest-windmill', 'town-arch']));
  });
  it('recommends an actual rainy sunset alternative and preserves a completed slot location', () => {
    const rainy = planning('rain'); rainy.clock.minute = 1070;
    expect(buildPhotoOutings(rainy).recommendations.find(r => r.slot === 'sunset')!.spotId).toBe('town-arch');
    rainy.checkIns = [{ day: 1, slot: 'sunset', spotId: 'post-porch' }];
    expect(buildPhotoOutings(rainy).recommendations.find(r => r.slot === 'sunset')).toMatchObject({ spotId: 'post-porch', status: 'completed', nextWindow: { day: 2 } });
  });
  it('reserves completed photographs before all other slots without moving a followed destination', () => {
    const input = planning('rain');
    input.checkIns = [{ day: 1, slot: 'morning', spotId: 'town-arch' }]; input.trackedSpotId = 'town-arch';
    const result = buildPhotoOutings(input);
    expect(result.recommendations[0]).toMatchObject({ spotId: 'town-arch', status: 'completed', isCompleted: true });
    expect(result.recommendations[1]).toMatchObject({ spotId: 'post-porch', status: 'active', weatherProbability: 100 });
    expect(new Set(result.recommendations.map(r => r.spotId)).size).toBe(3);
    expect(result.tracked).toMatchObject({ spotId: 'town-arch', slot: 'afternoon', isCompleted: false });
    input.checkIns = [...input.checkIns, { day: 1, slot: 'afternoon', spotId: 'town-arch' }];
    const history = buildPhotoOutings(input).recommendations;
    expect(history.slice(0, 2).every(r => r.spotId === 'town-arch' && r.isCompleted)).toBe(true);
    expect(history[2]!.spotId).not.toBe('town-arch');
  });
  it('uses the ridge sun subject only in its clear-weather sunset window', () => {
    const input = planning(); input.position = photoSpotById('ridge-mail-road')!.position;
    input.trackedSpotId = 'ridge-mail-road';
    const daytime = buildPhotoOutings(input).tracked!;
    expect(daytime.facingHint).toContain('风车与山谷'); expect(daytime.compositionHint).not.toContain('太阳');
    input.clock.minute = 1070;
    const sunset = buildPhotoOutings(input).tracked!;
    expect(sunset.weatherProbability).toBe(100);
    expect(sunset.facingHint).toContain('晴朗时'); expect(sunset.preparation).toContain('18:20');
    expect(sunset.compositionHint).toContain('若雨云遮日');
    const cloudy = { ...input, weather: 'afterglow' as const };
    expect(buildPhotoOutings(cloudy).tracked!.weatherProbability).toBe(0);
  });
  it('does not recommend an invisible overcast sun, and keeps a tracked ridge honest', () => {
    const cloudy = planning('afterglow'); cloudy.clock.minute = 1070; cloudy.position = photoSpotById('ridge-mail-road')!.position;
    cloudy.trackedSpotId = 'ridge-mail-road';
    const light = clockWeatherValues(cloudy.clock, { morning: 0, rain: 0, afterglow: 1 });
    expect(sunDiscShape(cloudy.position, light.solar, light.sunVisibility).visible).toBe(false);
    const result = buildPhotoOutings(cloudy);
    expect(result.recommendations.find(r => r.slot === 'sunset')!.spotId).not.toBe('ridge-mail-road');
    expect(result.tracked!.spotId).toBe('ridge-mail-road'); expect(result.tracked!.weatherProbability).toBe(0);
    expect(suitablePhotoWeather('ridge-mail-road', 'sunset')).toEqual(['morning']);
    expect(evaluatePhotoCheckIn(capture('ridge-mail-road', 1070, 'afterglow')).reason).toBe('wrong-weather');
  });
  it('reports tomorrow after a missed window and warns if the road journey would miss today', () => {
    const late = planning(); late.clock.minute = 1099.9; late.trackedSpotId = 'ridge-mail-road';
    expect(buildPhotoOutings(late).tracked!.canArriveInWindow).toBe(false);
    late.clock.minute = 1101;
    const result = buildPhotoOutings(late).recommendations.find(r => r.slot === 'sunset')!;
    expect(result.status).toBe('missed'); expect(result.nextWindow.day).toBe(2); expect(result.canArriveInWindow).toBe(true);
    expect(result.routePoints.length).toBeGreaterThan(1);
  });
  it('does not send a player on an outing that misses the window when a suitable nearby photograph remains', () => {
    const late = planning(); late.clock.minute = 1059;
    expect(buildPhotoOutings(late).recommendations.find(r => r.slot === 'afternoon')).toMatchObject({ spotId: 'post-porch', canArriveInWindow: true });
  });
});

describe('real camera-only daily check-ins', () => {
  it('accepts an ordinary initial-afternoon postcard and retains its actual original photo', () => {
    const input = capture(), result = evaluatePhotoCheckIn(input);
    expect(result.matched).toBe(true); expect(result.checkIn).toMatchObject({ day: 1, slot: 'afternoon', spotId: 'post-porch' });
    expect(result.checkIn!.photo).toBe(input.photo);
  });
  it.each(['forest-windmill', 'town-arch'])('uses the existing ray-tested world subjects at %s and rejects facing away', spotId => {
    const spot = photoSpotById(spotId)!, input = capture(spotId, 930, spotId === 'town-arch' ? 'afterglow' : 'morning');
    const dx = spot.target[0] - spot.position[0], dz = spot.target[2] - spot.position[2];
    const controller = createTravelController({ spawn: spot.position, terrainHeight,
      initialYaw: Math.atan2(dx, -dz), initialPitch: -Math.atan2(spot.target[1] - spot.position[1] - 1.64, Math.hypot(dx, dz)) });
    controller.toggleCamera(); const status = controller.snapshot();
    input.observation = observePhoto(status);
    expect(evaluatePhotoCheckIn(input).matched).toBe(true);
    status.camera.forward = status.camera.forward.map(v => -v) as unknown as readonly [number, number, number];
    input.observation = observePhoto(status);
    expect(evaluatePhotoCheckIn(input).reason).toBe('composition');
  });
  it('does not reward walking into a region, a legacy photo, a mismatched scene, or creative mode', () => {
    const noCapture = capture(); noCapture.captured = false; expect(evaluatePhotoCheckIn(noCapture).reason).toBe('not-captured');
    const noOriginal = capture(); delete noOriginal.photo.original; expect(evaluatePhotoCheckIn(noOriginal).reason).toBe('not-captured');
    const noScene = capture(); delete noScene.photo.scene; expect(evaluatePhotoCheckIn(noScene).reason).toBe('missing-scene');
    const mismatch = capture(); mismatch.clock = { day: 2, minute: 930 }; expect(evaluatePhotoCheckIn(mismatch).reason).toBe('scene-mismatch');
    const creative = capture(); creative.creativeMode = true; expect(evaluatePhotoCheckIn(creative).reason).toBe('creative-mode');
  });
  it('rejects transition weather, the wrong real weather, a closed gate, and an occluded subject', () => {
    const blending = capture(); blending.photo.scene!.weatherBlend = .4; expect(evaluatePhotoCheckIn(blending).reason).toBe('weather-transition');
    const wetForest = capture('forest-windmill', 930, 'rain'); expect(evaluatePhotoCheckIn(wetForest).reason).toBe('wrong-weather');
    const town = capture('town-arch', 930, 'rain'); town.gateOpened = false; expect(evaluatePhotoCheckIn(town).reason).toBe('open-gate');
    const blocked = capture(); blocked.observation.anchors['post-door']!.occluded = true; expect(evaluatePhotoCheckIn(blocked).reason).toBe('composition');
  });
  it('requires the real sun and windmill at sunset, but permits the rainy town alternative', () => {
    const ridge = capture('ridge-mail-road', 1070); expect(evaluatePhotoCheckIn(ridge).matched).toBe(true);
    ridge.observation.anchors['sun-disc']!.occluded = true; expect(evaluatePhotoCheckIn(ridge).reason).toBe('composition');
    expect(evaluatePhotoCheckIn(ridge).hint).toContain('晴朗时');
    const daytime = capture('ridge-mail-road', 930); daytime.observation.anchors['memory-windmill']!.occluded = true;
    expect(evaluatePhotoCheckIn(daytime).hint).not.toContain('太阳');
    const town = capture('town-arch', 1070, 'rain'); delete town.observation.anchors['sun-disc']; expect(evaluatePhotoCheckIn(town).matched).toBe(true);
  });
  it('awards at most one per day and slot, with no streak penalty or automatic midnight completion', () => {
    const input = capture(); input.checkIns = [{ day: 1, slot: 'afternoon', spotId: 'forest-windmill' }];
    expect(evaluatePhotoCheckIn(input).reason).toBe('already-completed');
    input.checkIns = [{ day: 2, slot: 'afternoon', spotId: 'forest-windmill' }]; expect(evaluatePhotoCheckIn(input).matched).toBe(true);
    expect(evaluatePhotoCheckIn(capture('post-porch', 1100)).reason).toBe('outside-window');
    const far = capture(); far.photo.pose.position = [0, 14, -230]; far.photo.scene!.subject.position = [0, 14, -230]; expect(evaluatePhotoCheckIn(far).reason).toBe('wrong-place');
  });
});
