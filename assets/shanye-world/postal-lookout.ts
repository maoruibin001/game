import type { Route, Vec3 } from './world-layout.ts';

export const POSTAL_LOOKOUT_FLOOR = { west: -30, east: -21.5, south: -251, north: -240, top: 24.08 };
export const POSTAL_LOOKOUT_SPAWN: Vec3 = [-26, POSTAL_LOOKOUT_FLOOR.top, -248];
export const POSTAL_LOOKOUT_YAW = Math.PI - .105;
export const POSTAL_LOOKOUT_PITCH = -.19;
export const POSTAL_EYE_RISE = .14;
export const POSTAL_LOOKOUT_ROAD: Route = {
  id: 'post-lookout', title: '邮局晒信台下行路', width: 4.25,
  points: [[-26, 24, -248], [-26, 24, -240], [-25.35, 23.35, -236.9], [-16.4, 20.3, -233.1],
    [-13.8, 16.4, -222.5], [-10.95, 14.15, -216.65], [0, 14, -220]],
};

export function onPostalLookout(x: number, z: number): boolean {
  const { west, east, south, north } = POSTAL_LOOKOUT_FLOOR;
  return x >= west && x <= east && z >= south && z <= north;
}

function porchCameraWeight([x, y, z]: Vec3): number {
  if (x < -32 || x > -19 || y < 22 || z < -253 || z > -239) return 0;
  const edge = Math.min(x + 32, -19 - x, y - 22, z + 253, -239 - z);
  const t = Math.min(1, edge / 2);
  return t * t * (3 - 2 * t);
}

/** A shorter orbit keeps the traveller, sorting bench and exit in the same shot. */
export function postalLookoutCamera(position: Vec3) {
  const weight = porchCameraWeight(position);
  if (!weight) return;
  return { height: 1.38 + 1.01 * weight, distance: 6.5 - 1.9 * weight, pitchOffset: .015 * weight, raiseSeconds: weight>=.9?.22:undefined };
}

export function postalLookoutEyeHeight(position: Vec3): number {
  return 1.64 + POSTAL_EYE_RISE * porchCameraWeight(position);
}

/** Support the stone road and platform with a local continuation of the hillside. */
export function postalLookoutGrade(x: number, z: number, natural: number): number {
  if (x < -40 || x > -4 || z < -262 || z > -209) return natural;
  const { west, east, south, north, top } = POSTAL_LOOKOUT_FLOOR;
  const fromDeck = Math.hypot(Math.max(west - x, x - east, 0), Math.max(south - z, z - north, 0));
  const blend = (distance: number, core: number, breadth: number) => {
    const t = Math.max(0, Math.min(1, (distance - core) / breadth));
    return 1 - t * t * (3 - 2 * t);
  };
  let soil = natural + Math.max(0, top - .66 - natural) * blend(fromDeck, 0, 8);
  const points = POSTAL_LOOKOUT_ROAD.points;
  for (let i = 2; i < points.length - 1; i++) {
    const a = points[i - 1]!, b = points[i]!;
    const dx = b[0] - a[0], dz = b[2] - a[2];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[2]) * dz) / (dx * dx + dz * dz)));
    const distance = Math.hypot(x - (a[0] + dx * t), z - (a[2] + dz * t));
    const support = a[1] + (b[1] - a[1]) * t - .68;
    soil = Math.max(soil, natural + Math.max(0, support - natural) * blend(distance, 1.5, 5.2));
  }
  return soil;
}
