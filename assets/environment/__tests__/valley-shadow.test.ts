import { describe, expect, it } from 'vitest';
import { mat4, vec3 } from '@forgeax/engine/math';
import { createValleyShadowProjection, valleyShadowQuality } from '../valley-shadow.ts';
import { presentedSolarPosition } from '../runtime.ts';
import type { Vec3 } from '../../controller/types.ts';

const sunAt = (minute: number): Vec3 => {
  const [x, y, z] = presentedSolarPosition({ day: 1, minute }).direction;
  return [-x, -y, -z];
};

describe('valley sun shadow projection', () => {
  const feet: Vec3 = [0, 14, -220];
  const direction = sunAt(855);

  it('keeps the same projection while standing or taking a small step on the same shadow page', () => {
    const update = createValleyShadowProjection();
    const first = update(feet, direction, 'high')!;
    expect(first.mapSize).toBe(2048);
    expect(update(feet, direction, 'high')).toBeUndefined();
    expect(update([.03, 14, -220], direction, 'high')).toBeUndefined();
  });

  it('retains the caster basis for sub-step solar motion and updates once the sun moves on', () => {
    const update = createValleyShadowProjection();
    const tilt = (degrees: number): Vec3 => [Math.cos(degrees * Math.PI / 180), -0.5, Math.sin(degrees * Math.PI / 180)];
    const first = update(feet, tilt(0), 'high')!;
    expect(update(feet, tilt(0.3), 'high')).toBeUndefined();
    const moved = update(feet, tilt(0.8), 'high')!;
    expect(moved.shadowViewProjection).not.toEqual(first.shadowViewProjection);
    expect(update(feet, tilt(0.6), 'high')).toBeUndefined();
  });

  it('uses the same world-space filter radius on all three quality tiers', () => {
    const update = createValleyShadowProjection();
    const radii = (['high', 'balanced', 'low'] as const).map(quality => {
      const config = update(feet, direction, quality)!;
      return (config.shadowRadius + 1) * 2 * valleyShadowQuality[quality].halfSpan / config.mapSize;
    });
    for (const radius of radii) expect(radius).toBeCloseTo(.32, 10);
  });

  it('keeps the overlap aligned to whole texels when crossing shadow pages', () => {
    const update = createValleyShadowProjection();
    const { mapSize } = valleyShadowQuality.high;
    const first = update(feet, direction, 'high')!.shadowViewProjection;
    const next = update([29, 16, -194], direction, 'high')!.shadowViewProjection;
    const sample = vec3.create(4, 14.5, -217);
    const a = mat4.transformVec3(vec3.create(), first, sample);
    const b = mat4.transformVec3(vec3.create(), next, sample);
    for (const axis of [0, 1] as const) {
      const shift = (a[axis] - b[axis]) * mapSize / 2;
      expect(shift).toBeCloseTo(Math.round(shift), 3);
    }
  });

  it('follows the real sun with finite coverage around each valley region, at all quality levels', () => {
    const update = createValleyShadowProjection();
    for (const feet of [[9.75,14,-226.4], [-170,38,-50], [155,34,92], [0,96,235]] as const) {
      let previous;
      for (const quality of ['high', 'balanced', 'low'] as const) {
        for (const minute of [810, 900, 1065]) {
          const direction = sunAt(minute);
          const { shadowViewProjection: frame } = update(feet, direction, quality)!;
          const a = mat4.transformVec3(vec3.create(), frame, feet);
          const alongRay = vec3.create(...feet.map((axis, i) => axis + direction[i]! * 15) as [number, number, number]);
          const b = mat4.transformVec3(vec3.create(), frame, alongRay);
          expect(a.every(Number.isFinite)).toBe(true);
          expect(a[2]).toBeGreaterThan(0);
          expect(b[2]).toBeLessThan(a[2]);
          expect(a[0]).toBeCloseTo(b[0], 5);
          expect(a[1]).toBeCloseTo(b[1], 5);
          expect(Math.abs(a[0])).toBeLessThan(.07);
          expect(Math.abs(a[1])).toBeLessThan(.07);
          if (previous) expect(frame).not.toEqual(previous);
          previous = frame;
        }
      }
    }
  });
});
