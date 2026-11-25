import type { Vec3 } from './world-layout.ts';

type Footprint = readonly [west: number, east: number, south: number, north: number];
export const NIGHT_MARKET: Footprint = [127, 146, -24, -10];
export const OLD_TOWN: Footprint = [123, 187, -33, 65.7];
export const LAUNCH_SITES = [
  { title: '镇外晒谷场', bounds: [127, 140, -48, -39] as Footprint },
  { title: '半山松台', bounds: [159.10, 161.24, 77.95, 81.30] as Footprint },
];
// West gable of the same house is visible from the field and the pine terrace.
export const WILLOW_PROMISE_WINDOW:Vec3=[161.38,32.10,20.92];
// The mast is braced to the southern timber face of the house with the promise window.
export const WILLOW_LAMP_MAST = { x:165, z:17.15, foot:27.65, down:29.50, up:36.55, drop:.56 } as const;
export const NIGHT_STOPS = {
  footTorch: { id: 'night-torch-foot', title: '山门火把架', x: 160.6, z: 60.6, radius: 2.5 },
  // Keep the rack beside the steps, clear of the view back down toward the pine terrace.
  upperTorch: { id: 'night-torch-upper', title: '上院火把架', x: 160.05, z: 90.9, radius: 2.3 },
  inn: { id: 'night-inn', title: '花街客栈', x: 140.5, z: -20.2, radius: 2.25 },
  fish: { id: 'night-fish', title: '摇一摇纸鱼灯', x: 131.2, z: -17.2, radius: 2.3 },
  letter: { id: 'night-letter', title: '读《鱼灯夜信》', x: 139.6, z: -12.7, radius: 2.1 },
  repair: { id: 'night-repair', title: '给修灯人送夜信', x: 129.9, z: -21.0, radius: 2.1 },
};

export function inFootprint([x, , z]: Vec3, [west, east, south, north]: Footprint): boolean {
  return x >= west && x <= east && z >= south && z <= north;
}

export function onMountain([x, , z]: Vec3): boolean {
  return z >= 76 || (z >= 65.7 && x >= 123 && x <= 193);
}

export function townContains(point: Vec3): boolean {
  return inFootprint(point, OLD_TOWN) || (point[0] >= 139 && point[0] <= 195 && point[2] >= 5 && point[2] <= 48);
}

export function launchSite(point: Vec3) {
  return townContains(point) ? undefined : LAUNCH_SITES.find(site => inFootprint(point, site.bounds));
}

export const MARKET_GATE = [146, 0, -16.5] as const;
