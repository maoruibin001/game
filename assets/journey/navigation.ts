import { hallCollectsAt, hasAfternoonDirections } from './afternoon.ts';
import { LANDMARKS, LOCAL_ROUTES, ROUTES, SIDE_ROUTES, type Route, type Vec3 } from '../shanye-world/world-layout.ts';
import { travelBlockers } from '../shanye-world/road-safety.ts';
import { createRoadRouteEstimator } from './road-route-distance.ts';
import { scenicFeet, scenicSpotById } from './scenic-spots.ts';
import { afterClosing, canReprise, hasAnyFirework } from './night.ts';
import { onMountain } from '../shanye-world/night-layout.ts';
import type { JourneyState } from './types.ts';

export const POSTAL_MAP_ROADS = LOCAL_ROUTES.filter(route => route.id === 'post-gateway' || route.id === 'post-doorstep' || route.id === 'post-lookout');
const lever = scenicFeet(148, 8.8);
const arch = scenicSpotById('town-arch')!.position;
const ridgeArrow = { title: '东岭古道 · 红箭头', position: scenicSpotById('ridge-mail-road')!.position };
const leverPath: Route = { id: 'town-lever-spur', title: '西侧摇柄小路', width: 2, points: [[155, 24, -19], scenicFeet(148, -2), lever] };
const monasteryWaypoints = [[155, 28], [155, 37], [155.4, 38], [155.6, 45], [155.95, 50], [155.95, 54.8],
  [156.45, 56.2], [156.45, 58.6], [158, 61], [158, 65.5], [158, 93.25]] as const;
const monasteryWalk: Route = { id: 'monastery-walk', title: '钟院至禅院石阶', width: 2, points: [
  LANDMARKS.town.position, ...monasteryWaypoints.map(([x, z]) => scenicFeet(x, z)),
] };
const publicRoads = [...ROUTES.filter(route => route.id !== 'hidden-trail'), ...SIDE_ROUTES, ...POSTAL_MAP_ROADS, leverPath];
const gate = travelBlockers({ gateOpen: false, bridgeWalkable: true })[0]!;
const approachZ = gate.min[2] - .65;

function roadsForTravel(gateOpen: boolean, bridgeWalkable: boolean): Route[] {
  const roads = bridgeWalkable ? [...publicRoads, monasteryWalk] : publicRoads;
  return roads.map(route => {
    if (!gateOpen && (route.id === 'town-low' || route.id === 'valley-cross')) {
      const firstBlocked = route.points.findIndex(p => p[2] > approachZ && p[0] >= gate.min[0] && p[0] <= gate.max[0]);
      const south = route.points[firstBlocked - 1], north = route.points[firstBlocked];
      if (south && north) {
        const t = (approachZ - south[2]) / (north[2] - south[2]);
        const stop: Vec3 = [south[0] + (north[0] - south[0]) * t, south[1] + (north[1] - south[1]) * t, approachZ];
        return { ...route, points: [...route.points.slice(0, firstBlocked), stop] };
      }
    }
    // Use the ridge-connected northern approach until the courtyard crossing is open.
    if ((!gateOpen || !bridgeWalkable) && route.id === 'town-high') return { ...route, points: route.points.slice(1) };
    return route;
  });
}

const beforeGate = createRoadRouteEstimator(roadsForTravel(false, false));
const beforeBridge = createRoadRouteEstimator(roadsForTravel(true, false));
const openRoads = createRoadRouteEstimator(roadsForTravel(true, true));
const postalFork = ROUTES.find(route => route.id === 'forest-low')!.points[0]!;
const distance = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2]);

export function navigationFor(state: JourneyState, tracked?: { spotTitle: string; position: Vec3 } | null) {
  const d = state.durable;
  const canChooseStory = !d.mailed && !d.replyPhotos.forest && !d.legacyReplyUnlock.forest;
  const preview = state.runtime.screen === 'map' ? state.runtime.letterMapPreview : null;
  const story = preview === 'ridge-arrow' ? 'ridge' : canChooseStory ? d.storyRoute : null;
  const postalHall = d.started && !d.fireworks && hallCollectsAt(d.clock.minute) && hasAfternoonDirections(d)
    ? scenicSpotById(d.stamps.town ? 'monastery' : 'town-arch') : undefined;
  const chosenScenic = scenicSpotById(d.trackedScenicSpot);
  const nightDestination = afterClosing(d) && !d.creativeMode
    ? scenicSpotById(canReprise(d) ? 'field-firework' : !hasAnyFirework(d) ? 'flower-market'
      : !d.night.torch ? onMountain(d.player.position) ? 'night-torch-upper' : 'night-torch-foot'
        : d.night.scarletClaimed && !d.night.scarletSpent ? 'field-firework' : 'pine-firework') : undefined;
  const scenic = preview === 'arch-courtyard' ? scenicSpotById('courtyard-bell')
    : preview ? undefined : chosenScenic ?? (tracked ? undefined : nightDestination ?? postalHall);
  const selection = scenic ? 'scenic' : tracked && !preview ? 'outing' : story;
  const destination = scenic ?? (preview === 'ridge-arrow' ? ridgeArrow : tracked ? { title: tracked.spotTitle, position: tracked.position }
    : story === 'forest' ? { title: '林间近路 · 风车', position: LANDMARKS.forest.position }
    : story === 'ridge' ? ridgeArrow
    : undefined);
  const common = { canChooseStory, preview, storyRoute: d.storyRoute, scenicSpotId: chosenScenic?.id ?? null, collapsed: d.pocketMapCollapsed && !state.runtime.showNavigation };
  if (!destination) return { ...common, destination: undefined, hint: canChooseStory && !story ? '按 J 读阿禾的信。' : '' };

  const bridgeWalkable = d.stamps.town && state.runtime.bridgeProgress >= 1;
  const estimate = !d.gateOpened ? beforeGate : bridgeWalkable ? openRoads : beforeBridge;
  const from = d.player.position;
  if (scenic) {
    const needsLever = (scenic.beyondBridge || scenic.id === 'town-arch') && !d.gateOpened;
    const needsBridge = scenic.beyondBridge && !bridgeWalkable;
    const nextPoint = needsLever ? lever : needsBridge ? arch : undefined;
    const goal = nextPoint ?? scenic.position;
    const road = estimate(from, goal);
    const near = distance(from, goal);
    let hint = '沿地图上的亮线前往景点。';
    if (needsLever) hint = near <= 3 ? '在摇柄旁按 E 打开木屏。' : '先到旧镇西侧的摇柄，打开木屏。';
    else if (needsBridge) hint = d.stamps.town ? '等木桥完全落稳，再过桥。'
      : near <= 5 ? '在拱门外拍下石拱、双峰和红邮筒，让木桥降下。' : '先去拱门外的取景点，拍下旧卡片里的风景。';
    else if (near <= (scenic.beyondBridge ? 2.5 : 8)) hint = preview === 'arch-courtyard'
      ? '到了钟院。从山门后的石阶上行，到禅院客堂找老窗。' : `已到${scenic.title}。`;
    else if (!road.roadPoints.length || distance(from, road.roadPoints[0]!) > 6) hint = '先回到图上标出的邮路。';
    else if (scenic.beyondBridge && from[2] < 32) hint = '沿亮线过木桥，进入旧镇钟院。';
    else if (scenic.id === 'monastery') hint = '从钟院后方穿过山门，沿石阶上到禅院正殿。';
    return { ...common, destination: { ...destination, points: road.roadPoints, nextPoint }, hint };
  }

  const road = estimate(from, destination.position);
  let hint = '沿图上亮起的小路走。';
  if (distance(from, destination.position) <= (story === 'forest' && !tracked ? 28 : 8)) {
    hint = selection === 'forest' ? '到了风车附近，找红箭头，停下来取景。'
      : preview === 'ridge-arrow' ? '到了红箭头附近。留一张告诉阿禾在这里怎么拐。'
        : selection === 'ridge' ? '到了长椅旁的红箭头。先拍一张“在哪拐”，再面向西南找风车。' : '已到取景点附近。';
  } else if (!road.roadPoints.length || distance(from, road.roadPoints[0]!) > 6) {
    hint = '先回到图上标出的邮路。';
  } else if (selection === 'forest' && road.routeIds[0] === 'town-low' && distance(from, postalFork) > 7
      && road.roadPoints.some(point => distance(point, postalFork) < .05)) {
    hint = '沿石路回岔口，再接西侧林间邮路。';
  } else if (selection === 'forest' && distance(from, postalFork) < 20 && from[0] > -10) {
    hint = '走到邮局前岔口，走西侧（图左）。';
  } else if (selection === 'forest' && road.routeIds[0] === 'forest-low') {
    hint = '沿林间邮路走到底，找风车旁的红箭头。';
  } else if (selection === 'ridge' && road.routeIds.includes('forest-high')) {
    hint = '东岭古道从西侧林地上坡。沿亮线走西坡风铃小径，上到山脊找长椅红箭头。';
  }
  return { ...common, destination: { ...destination, points: road.roadPoints, nextPoint: undefined }, hint };
}
