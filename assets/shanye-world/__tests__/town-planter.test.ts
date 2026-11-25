import { describe, expect, it } from 'vitest';
import { compilePipelineBundles } from '../pipeline-import.ts';
import { SOURCE_BUNDLES } from '../pipeline-sources.ts';
import { clearPlanterOnRestore, TOWN_PLANTER_SOLIDS } from '../town-postcard-layout.ts';
import { resolveMove, terrainHeight, traceSegment, type Vec3 } from '../world-layout.ts';

const town = SOURCE_BUNDLES.find(bundle => bundle.id === 'town-street')!;
const foot = (x: number, z: number): Vec3 => [x, terrainHeight(x, z), z];
const insidePlanter = (point: readonly number[]) => TOWN_PLANTER_SOLIDS.some(({ min, max }) =>
  point.every((value, axis) => value >= min[axis]! && value <= max[axis]!),
);

describe('old town stone planter', () => {
  it('matches the placed native mesh, including the hollow rim and the three blooms', () => {
    const key = 'hero/town-street/town-planter';
    const { resources, entities } = compilePipelineBundles([
      { ...town, meshes: town.meshes.filter(mesh => mesh.entityId === 'town_planter') },
    ]);
    const mesh = resources[`mesh/${key}`];
    if (mesh?.kind !== 'mesh' || !mesh.indices) throw new Error('Missing native planter mesh');
    const { position, normal } = mesh.attributes;
    if (!(position instanceof Float32Array) || !(normal instanceof Float32Array)) {
      throw new Error('Missing native planter surface');
    }
    const origin = (entities[key]!.components.Transform as { pos: Vec3 }).pos;
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const [a,b,c] = [mesh.indices[i]! * 3, mesh.indices[i+1]! * 3, mesh.indices[i+2]! * 3];
      const center = origin.map((value, axis) =>
        value + (position[a+axis]! + position[b+axis]! + position[c+axis]!) / 3,
      );
      const inward = center.map((value, axis) => value - normal[a+axis]! * .01);
      const outward = center.map((value, axis) => value + normal[a+axis]! * .01);
      expect(insidePlanter(inward), `no collision behind ${center}`).toBe(true);
      expect(insidePlanter(outward), `collision outside ${center}`).toBe(false);
    }
  });

  it('stops movement and camera traces at the visible rim and leaves the centre of the street clear', () => {
    expect(resolveMove(foot(154,18.5), [-2,0,0])[0]).toBeCloseTo(152.53);
    expect(resolveMove(foot(150.25,15.9), [0,0,1.25])[2]).toBeCloseTo(16.72);
    const sight = traceSegment([154,24.65,18.5], [151,24.65,18.5], 0);
    expect(sight.point[0]).toBeCloseTo(152.25);
    expect(sight.obstacle).toBe('town-planter-base');
    for (let z = 11; z < 21.5; z += .1) {
      const next = resolveMove(foot(155,z), [0,0,.1]);
      expect(next[2]).toBeCloseTo(z+.1);
    }
  });

  it('safely restores old positions covered by the moved base and keeps the old central position', () => {
    const before = foot(150.25,18.5);
    const repaired = clearPlanterOnRestore(before);
    expect(repaired[0]).toBeCloseTo(152.55);
    expect(repaired[2]).toBe(before[2]);
    expect(resolveMove(repaired, [0,0,0])).toEqual(repaired);
    const oldCentralPosition = foot(155,18.5);
    expect(clearPlanterOnRestore(oldCentralPosition)).toEqual(oldCentralPosition);
  });
});
