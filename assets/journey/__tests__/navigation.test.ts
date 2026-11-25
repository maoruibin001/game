import { describe, expect, it } from 'vitest';
import { mapForwardAngle, pocketMapProjection } from '../../presentation/navigation-map.ts';
import { WORLD } from '../../shanye-world/world-layout.ts';
import { createJourney, reduceJourney } from '../journey.ts';
import { navigationFor } from '../navigation.ts';
import { PHOTO_SPOTS } from '../photo-outings.ts';
import { actionFromPresentation, toPresentationView } from '../presentation-adapter.ts';
import { SCENIC_SPOTS, scenicFeet, scenicSpotById } from '../scenic-spots.ts';
import { restoreJourney, serializeJourney } from '../save.ts';
import type { JourneyAction, JourneyState } from '../types.ts';

const change = (state: JourneyState, action: JourneyAction) => reduceJourney(state, action).state;
const begin = () => change(createJourney({ position: WORLD.spawn, yaw: WORLD.spawnYaw, pitch: .13, area: 'post' }), { type: 'start' });
const openLetters = (state: JourneyState) => change(state, { type: 'set-screen', screen: 'journal' });

describe('postal map navigation', () => {
  it('uses the screen-scaled forward vector for south, north, east, west and the forest road', () => {
    expect(mapForwardAngle(0)).toBeCloseTo(180);
    expect(mapForwardAngle(Math.PI)).toBeCloseTo(0);
    expect(mapForwardAngle(Math.PI / 2)).toBeCloseTo(90);
    expect(mapForwardAngle(-Math.PI / 2)).toBeCloseTo(-90);
    expect(mapForwardAngle(Math.atan2(-35, -28))).toBeCloseTo(Math.atan2(-35 * 720, 28 * 500) * 180 / Math.PI);
  });

  it('puts the nearby world on the same side as the camera as the traveller turns', () => {
    const player={x:.5,y:.5};
    const other={x:.51,y:.49};
    expect(pocketMapProjection({...player,heading:Math.PI})(other)).toEqual([
      expect.closeTo(-6.4),expect.closeTo(-6.4),
    ]);
    expect(pocketMapProjection({...player,heading:0})(other)).toEqual([
      expect.closeTo(6.4),expect.closeTo(6.4),
    ]);
    expect(pocketMapProjection({...player,heading:Math.PI/2})(other)).toEqual([
      expect.closeTo(6.4),expect.closeTo(-6.4),
    ]);
  });

  it('defaults only when reading the letter and retains explicit choice and collapse on reload', () => {
    let state = begin();
    expect(navigationFor(state).destination).toBeUndefined();
    state = change(state, { type: 'read-ahe-route' });
    expect(state.durable.storyRoute).toBeNull();
    state = change(openLetters(state), { type: 'read-ahe-route' });
    expect(navigationFor(state).destination?.title).toContain('风车');
    state = change(state, { type: 'choose-story-route', route: 'free' });
    state = change(state, { type: 'read-ahe-route' });
    state = change(change(state, { type: 'set-screen', screen: 'play' }), { type: 'set-pocket-map', collapsed: true });
    const restored = restoreJourney(serializeJourney(state)).state;
    expect(restored.durable.storyRoute).toBe('free');
    expect(restored.durable.pocketMapCollapsed).toBe(true);
    expect(restored.durable.player).toEqual(state.durable.player);
  });

  it('returns along the wrong branch to the fork without drawing a straight line from off-road', () => {
    let state = change(openLetters(begin()), { type: 'read-ahe-route' });
    state = { ...state, durable: { ...state.durable, player: { ...state.durable.player, position: [19, 13.58, -202.5] } } };
    const guide = navigationFor(state);
    expect(guide.hint).toContain('回岔口');
    expect(guide.destination?.points).toContainEqual([0, 14, -220]);
    state.durable.player.position = [29, 16, -219];
    const offRoad = navigationFor(state);
    expect(offRoad.destination?.points[0]).not.toEqual(state.durable.player.position);
    expect(offRoad.hint).toContain('先回到');
  });

  it('uses public northern ridge access when the town bridge is raised, including tracked outings', () => {
    let state = change(openLetters(begin()), { type: 'choose-story-route', route: 'ridge' });
    const ridgeOuting = PHOTO_SPOTS.find(spot => spot.id === 'ridge-mail-road')!;
    for (const gateOpened of [false, true]) {
      state = { ...state, durable: { ...state.durable, gateOpened } };
      for (const tracked of [undefined, { spotTitle: ridgeOuting.title, position: ridgeOuting.position }]) {
        const guide = navigationFor(state, tracked);
        expect(guide.destination?.points.length).toBeGreaterThan(6);
        expect(guide.destination?.points.some(([x, , z]) => x < -160 && z > 0)).toBe(true);
        expect(guide.destination?.points.some(([x, , z]) => x >= 152 && x <= 158 && z >= 24 && z <= 30)).toBe(false);
      }
    }
    state = change(state, { type: 'track-photo-spot', spotId: 'ridge-mail-road' });
    state = change(openLetters(state), { type: 'choose-story-route', route: 'forest' });
    expect(state.durable.trackedPhotoSpot).toBeNull();
  });

  it('lists every scheduled photo spot and public landmark independently of today’s schedule', () => {
    let state = begin();
    const options = { mapBounds: WORLD.bounds };
    const original = toPresentationView(state, options);
    expect(original.navigation?.scenicSpots.map(spot => spot.id).sort()).toEqual([
      ...PHOTO_SPOTS.map(spot => spot.id), 'old-post', 'forest-clearing', 'old-town', 'courtyard-bell', 'monastery', 'ridge-station',
      'ridge-arrow', 'flower-market', 'night-torch-foot', 'night-torch-upper', 'pine-firework', 'field-firework',
    ].sort());
    state = change(change(state, { type: 'set-screen', screen: 'map' }), { type: 'track-scenic-spot', spotId: 'monastery' });
    expect(toPresentationView(state, options).outings?.slots).toEqual(original.outings?.slots);
    state = change(openLetters(state), { type: 'read-ahe-route' });
    const restored = restoreJourney(serializeJourney(state)).state;
    expect(restored.durable.storyRoute).toBeNull();
    expect(navigationFor(restored).destination?.title).toBe('禅院');
    state = change(state, { type: 'track-photo-spot', spotId: 'town-arch' });
    expect(state.durable.trackedScenicSpot).toBeNull();
    expect(state.durable.trackedPhotoSpot).toBe('town-arch');
  });

  it('sends a monastery or bell courtyard visitor to the lever and photo before opening the bridge route', () => {
    for (const spotId of ['courtyard-bell', 'monastery']) {
      let state = change(change(begin(), { type: 'set-screen', screen: 'map' }), { type: 'track-scenic-spot', spotId });
      const guide = () => navigationFor(state);
      const spot = scenicSpotById(spotId)!;
      expect(guide().destination?.position).toEqual(spot.position);
      expect(guide().hint).toContain('西侧的摇柄');
      expect(guide().destination?.points.at(-1)).toEqual(scenicFeet(148, 8.8));
      state.durable.gateOpened = true;
      state.durable.player.position = scenicFeet(155, -3);
      expect(guide().hint).toContain('拍下石拱、双峰和红邮筒');
      expect(guide().destination?.nextPoint).toEqual(scenicFeet(155, -3));
      state.durable.stamps.town = true;
      state.runtime.bridgeProgress = .9;
      expect(guide().hint).toContain('完全落稳');
      expect(guide().destination?.points.every(point => point[2] < 24)).toBe(true);
      state.runtime.bridgeProgress = 1;
      expect(guide().destination?.nextPoint).toBeUndefined();
      expect(guide().destination?.points).toContainEqual(scenicFeet(155, 28));
      expect(guide().destination?.points.at(-1)).toEqual(spot.position);
      state.durable.player.position = spot.position;
      expect(guide().hint).toBe(`已到${spot.title}。`);
    }
  });

  it('previews the two letter destinations over the current tracking without saving a change', () => {
    let state = change(change(begin(), { type: 'set-screen', screen: 'map' }), { type: 'track-scenic-spot', spotId: 'forest-clearing' });
    state = openLetters(state);
    const preview = (route: string) => change(state, actionFromPresentation(state, 'open-map', route)!);
    const ridge = preview('ridge-arrow');
    expect(navigationFor(ridge).destination?.title).toBe('东岭古道 · 红箭头');
    expect(navigationFor(ridge).destination?.position).toEqual(scenicSpotById('ridge-mail-road')!.position);
    expect(navigationFor(ridge).destination?.points.at(-1)).toEqual([64, 84, 204]);
    expect(serializeJourney(ridge)).toEqual(serializeJourney(state));
    expect(navigationFor(change(ridge, { type: 'set-screen', screen: 'play' })).destination?.title).toBe('风来林地');
    expect(restoreJourney(serializeJourney(ridge)).state.runtime.letterMapPreview).toBeNull();

    const courtyard = preview('arch-courtyard');
    expect(navigationFor(courtyard).destination?.title).toBe('旧镇钟院');
    expect(navigationFor(courtyard).destination?.nextPoint).toEqual(scenicFeet(148, 8.8));
    courtyard.durable.gateOpened = true;
    expect(navigationFor(courtyard).destination?.nextPoint).toEqual(scenicFeet(155, -3));
    courtyard.durable.stamps.town = true;
    courtyard.runtime.bridgeProgress = 1;
    expect(navigationFor(courtyard).destination?.points.at(-1)).toEqual(scenicSpotById('courtyard-bell')!.position);
    expect(navigationFor(change(courtyard, { type: 'track-scenic-spot', spotId: 'monastery' })).destination?.title).toBe('禅院');
  });

  it.each(['play', 'photo'] as const)('starts a real walk with the same red-arrow route when choosing from %s', screen => {
    let state = begin();
    state.durable.pocketMapCollapsed = true;
    if (screen === 'photo') state = change(state, { type: 'open-camera' });
    state = openLetters(state);
    const preview = change(state, actionFromPresentation(state, 'open-map', 'ridge-arrow')!);
    expect(preview.durable.storyRoute).toBeNull();
    expect(change(preview, { type: 'set-screen', screen: 'play' }).runtime.screen).toBe(screen);
    const departed = change(state, { type: 'choose-story-route', route: 'ridge' });
    expect(departed.runtime).toMatchObject({screen:'play', returnScreen:'play', letterMapPreview:null});
    expect(navigationFor(departed)).toMatchObject({collapsed:false, destination:{title:'东岭古道 · 红箭头'}});
    expect(departed.durable.pocketMapCollapsed).toBe(true);
    expect(navigationFor(change(departed, {type:'set-pocket-map',collapsed:true})).collapsed).toBe(true);
  });

  it('comes back to the camera after ordinary close, but walks after picking a site or a schedule task', () => {
    const camera = change(begin(), {type:'open-camera'});
    const map = change(camera, {type:'set-screen',screen:'map'});
    expect(change(map, {type:'set-screen',screen:'play'}).runtime.screen).toBe('photo');
    const scenic = change(map, {type:'track-scenic-spot',spotId:'monastery'});
    expect(scenic.runtime.screen).toBe('play');
    expect(navigationFor(scenic).destination?.title).toBe('禅院');
    const scheduled = change(camera, {type:'track-photo-spot',spotId:'town-arch'});
    expect(scheduled.runtime.screen).toBe('play');
    expect(scheduled.durable.trackedPhotoSpot).toBe('town-arch');
  });

  it('provides a road route to every public destination from a fresh start', () => {
    const state = change(begin(), { type: 'set-screen', screen: 'map' });
    for (const spot of SCENIC_SPOTS.filter(spot => !spot.hidden)) {
      const selected = change(state, { type: 'track-scenic-spot', spotId: spot.id });
      const { destination } = navigationFor(selected);
      expect(destination?.title).toBe(spot.title);
      expect(destination?.points.length).toBeGreaterThanOrEqual(2);
    }
  });
});
