import { mat4, vec3 } from '@forgeax/engine/math';
import { DirectionalShadowFilterValue } from '@forgeax/engine/render';
import type { Vec3 } from '../controller/types.ts';

export const valleyShadowQuality = {
  high: { mapSize: 2048, halfSpan: 64 },
  balanced: { mapSize: 1536, halfSpan: 64 },
  low: { mapSize: 1024, halfSpan: 55 },
} as const;

export type ValleyShadowQuality = keyof typeof valleyShadowQuality;

export const valleyShadowLight = {
  castShadow: true,
  shadowProjection: 1,
  shadowFilter: DirectionalShadowFilterValue.pcf5,
  depthBias: .000075,
  normalBias: .028,
  contactShadowLength: 0,
} as const;

const origin: Vec3 = [0, 0, 0];
const up: Vec3 = [0, 1, 0];
// Long eaves and voxel terrain edges should cross the shadow texels at
// different times. Rolling around the light ray leaves the sun direction intact.
const rasterRoll = mat4.fromRotation(mat4.create(), [0, 0, 1], -19 * Math.PI / 180);
const pagesPerAxis = 16;
const projectionStepCos = Math.cos(.5 * Math.PI / 180);
// Match the same world-space filter on each tier. A constant radius in texels
// would spread the low tier's shadow over much more ground.
// A .37 m hat half-width was smaller than the old PCF radius before
// adding the hardware comparison footprint. Keep stable light-space taps
// and page alignment, but leave useful inner coverage on a human caster.
const filterRadiusWorld = .32;

export function createValleyShadowProjection() {
  const view = mat4.create();
  const clip = mat4.create();
  const positionInLight = vec3.create();
  let previousDirection: Vec3 | undefined;
  let previousQuality: ValleyShadowQuality | undefined;
  let previousCell: Vec3 | undefined;

  return (position: Vec3, direction: Vec3, quality: ValleyShadowQuality) => {
    // Keep the caster raster on one basis through sub-texel solar changes.
    // Environment lighting still uses the live sun every simulation frame.
    const directionChanged = !previousDirection || vec3.dot(direction, previousDirection)
      < projectionStepCos * Math.hypot(...direction) * Math.hypot(...previousDirection);
    if (directionChanged) {
      mat4.lookAt(view, origin, direction, up);
      mat4.multiply(view, rasterRoll, view);
      previousDirection = [direction[0], direction[1], direction[2]];
    }
    const { halfSpan, mapSize } = valleyShadowQuality[quality];
    const page = 2 * halfSpan / pagesPerAxis;
    const [x, y, z] = mat4.transformVec3(positionInLight, view, position);
    const cell: Vec3 = [Math.round(x / page), Math.round(y / page), Math.round(z / page)];
    if (!directionChanged && quality === previousQuality && cell.every((value, axis) => value === previousCell?.[axis])) return;
    previousCell = cell;
    previousQuality = quality;
    const [cx, cy, cz] = cell.map(index => index * page);
    // Shift by whole pages (whole texels) so receivers in the overlap keep
    // their samples at a fixed light angle. The depth volume includes terrain
    // uphill and toward the sun, even if the player is standing below it.
    mat4.orthographicReverseZ(clip, cx - halfSpan, cx + halfSpan, cy + halfSpan, cy - halfSpan,
      -cz - 2.5 * halfSpan, -cz + 1.5 * halfSpan);
    return {
      mapSize,
      // The native PCF kernel adds one texel to the authored spread.
      shadowRadius: filterRadiusWorld * mapSize / (2 * halfSpan) - 1,
      shadowViewProjection: mat4.multiply(mat4.create(), clip, view),
    };
  };
}
