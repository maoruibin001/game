import type { AABB, Vec3 } from './world-layout.ts';

interface RockTier { center: Vec3; size: Vec3; material: string }

/** The exposed ledges stay below the normal jump height at every instance scale. */
export const ROCK_TIERS: readonly [RockTier, RockTier, RockTier, RockTier] = [
  { center: [1.7,.24,-.80], size: [1.1,.48,1.20], material: 'rock' },
  { center: [.8,.46,-.6], size: [2.1,.92,1.9], material: 'grass-dark' },
  { center: [0,.7,0], size: [2.7,1.4,2.5], material: 'rock' },
  { center: [-.3,1.625,.2], size: [1.9,.45,1.8], material: 'rock-light' },
];

/** Cardinal orientations preserve exact axis-aligned collision for every tier. */
export const rockYaw = (yaw: number): number => Math.round(yaw / (Math.PI / 2)) * (Math.PI / 2);

export const CRAG_TIERS = ROCK_TIERS.slice(2);

export function rockSolids(id: string, position: Vec3, scale: number, yaw: number, tiers: readonly RockTier[] = ROCK_TIERS): AABB[] {
  const c = Math.round(Math.cos(yaw)), s = Math.round(Math.sin(yaw));
  return tiers.map(({ center: [x,y,z], size: [w,h,d] }, index) => {
    const cx = position[0] + scale * (c*x + s*z);
    const cy = position[1] + scale*y;
    const cz = position[2] + scale * (c*z - s*x);
    const rx = scale * (Math.abs(c)*w + Math.abs(s)*d)/2;
    const ry = scale*h/2;
    const rz = scale * (Math.abs(c)*d + Math.abs(s)*w)/2;
    return { id: `${id}-${index}`, min: [cx-rx,cy-ry,cz-rz], max: [cx+rx,cy+ry,cz+rz] };
  });
}


interface RockPlacement {
  position: Vec3;
  yaw: number;
  tiers: readonly RockTier[];
}

export function fitRockToSlope(x: number, z: number, scale: number, yaw: number,
  groundAt: (x: number, z: number) => number): RockPlacement {
  const y = groundAt(x, z);
  const position: Vec3 = [x, y, z];
  const [foot, shelf] = ROCK_TIERS;
  const front = (foot.center[0] + foot.size[0] / 2) * scale;
  const shelfFront = (shelf.center[0] + shelf.size[0] / 2) * scale;
  function measure(heading: number) {
    const c = Math.round(Math.cos(heading)), s = Math.round(Math.sin(heading));
    const groundAlongFoot = (forward: number) =>
      groundAt(x + c * forward + s * foot.center[2] * scale, z + c * foot.center[2] * scale - s * forward);
    const parts = rockSolids('slope', position, scale, heading);
    const top = parts[0]!.max[1];
    const rise = top - groundAlongFoot(front + .46);
    const exposed = top - groundAlongFoot((front + shelfFront) / 2);
    // Leave connected overhangs, but don't project a whole tread into the air.
    const gaps = parts.slice(0, 2).map(({ min, max }) => {
      const footprint = [min[0], (min[0] + max[0]) / 2, max[0]].flatMap(px =>
        [min[2], (min[2] + max[2]) / 2, max[2]].map(pz => groundAt(px, pz)));
      return min[1] - Math.max(...footprint);
    });
    const gap = Math.max(...gaps);
    const sink = Math.max(0, rise - .88, gap - .20);
    return { heading, rise, exposed, gap, sink };
  }

  const authored = measure(yaw);
  if (authored.rise <= .98 && authored.gap <= .35) return { position, yaw, tiers: ROCK_TIERS };

  // Preserve the approach where a shallow sink is enough. Otherwise put the
  // foothold along the contour instead of extending it over the downhill drop.
  const fits = (option: ReturnType<typeof measure>) =>
    option.sink <= .35 && option.rise - option.sink >= .10 && option.exposed - option.sink >= .05;
  const alternative = fits(authored) ? authored : [1, 2, 3]
    .map(turn => measure(yaw + turn * Math.PI / 2))
    .filter(fits)
    .sort((a, b) => a.sink - b.sink)[0];
  return alternative
    ? { position: [x, y - alternative.sink, z], yaw: alternative.heading, tiers: ROCK_TIERS }
    : { position, yaw, tiers: CRAG_TIERS };
}
