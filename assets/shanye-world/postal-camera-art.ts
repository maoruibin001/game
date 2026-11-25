import { cross, normalize, subtract } from '../controller/geometry.ts';
import type { Vec3 } from '../controller/types.ts';
import { POSTAL_EYE_RISE } from './postal-lookout.ts';
import type { VoxelMesh } from './voxel-mesh.ts';

export const POSTAL_CAMERA_BASE: Vec3 = [-22.11, 25.705 + POSTAL_EYE_RISE, -243.91];

/** The camera and one clipped print occupy the same solid wooden bench. */
export function appendPostalCamera(mesh: VoxelMesh) {
  const yaw = -1.90, c = Math.cos(yaw), s = Math.sin(yaw);
  const cameraPoint = (x: number, y: number, z: number): Vec3 =>
    [POSTAL_CAMERA_BASE[0] + x * c + z * s, POSTAL_CAMERA_BASE[1] + y, POSTAL_CAMERA_BASE[2] - x * s + z * c];
  const box = (x: number, y: number, z: number, size: Vec3, tone: string) =>
    mesh.box(cameraPoint(x, y, z), size, tone, yaw);
  const face = (points: readonly [Vec3, Vec3, Vec3, Vec3], tone: string) => {
    const normal = normalize(cross(subtract(points[1], points[0]), subtract(points[2], points[0])));
    mesh.quad(points, normal, tone);
  };

  // Focus rack and two wooden standards. The brass pins and slot show how the
  // front standard slides on the folding rail.
  box(0, .045, -.03, [.56, .09, 1.36], 'lane-timber');
  for (const side of [-1, 1]) {
    box(side * .21, .101, -.02, [.055, .033, 1.21], 'weathered-brass');
    box(side * .26, .16, .35, [.10, .15, .18], 'temple-wood');
    box(side * .31, .19, .24, [.07, .13, .13], 'bell-gold');
    box(side * .34, .26, -.52, [.095, .19, .054], 'weathered-brass');
  }
  box(0, .49, -.51, [.84, .72, .13], 'temple-wood');
  box(0, .49, -.586, [.68, .56, .031], 'lane-timber');
  box(0, .49, -.608, [.51, .40, .022], 'window-shadow');
  box(0, .55, .40, [.57, .56, .096], 'cedar-lining');
  box(0, .55, .457, [.42, .41, .046], 'lane-timber');

  const ring = (step: number): Vec3[] => {
    const t = step / 12, edge = step % 2 ? -.033 : .036;
    const x = .37 - .139 * t + edge, y = .325 - .112 * t + edge, z = -.435 + .786 * t;
    const center = .51 + .04 * t;
    return [cameraPoint(-x, center - y, z), cameraPoint(x, center - y, z),
      cameraPoint(x, center + y, z), cameraPoint(-x, center + y, z)];
  };
  let rear = ring(0);
  for (let k = 1; k <= 12; k++) {
    const front = ring(k);
    for (let side = 0; side < 4; side++) {
      const next = (side + 1) % 4;
      face([rear[side]!, rear[next]!, front[next]!, front[side]!], k % 2 ? 'camera' : 'iron');
    }
    rear = front;
  }

  const lens = (r: number, angle: number, z: number) => cameraPoint(r * Math.cos(angle), .55 + r * Math.sin(angle), z);
  for (let facet = 0; facet < 14; facet++) {
    const a = facet * Math.PI / 7, b = (facet + 1) * Math.PI / 7;
    face([lens(.218, a, .468), lens(.218, b, .468), lens(.204, b, .646), lens(.204, a, .646)], 'weathered-brass');
    face([lens(.204, a, .646), lens(.204, b, .646), lens(.151, b, .643), lens(.151, a, .643)], 'bell-gold');
    face([lens(.151, a, .643), lens(.151, b, .643), lens(.130, b, .605), lens(.130, a, .605)], 'lane-timber');
    const center = lens(0, a, .607);
    face([center, lens(.13, a, .605), lens(.13, b, .605), center], facet > 2 && facet < 6 ? 'glass' : 'window-shadow');
  }

  // The print leans away from the ledge. Its scenery and figures are part of
  // the asset and can be read close up, without a separate UI or texture file.
  const print = (u: number, v: number, depth: number): Vec3 => [POSTAL_CAMERA_BASE[0] - .24 + (u - .5) * .60, 25.725 + POSTAL_EYE_RISE + v * .36, -244.66 + v * .09 - depth];
  const patch = (u: number, v: number, w: number, h: number, depth: number, tone: string) =>
    face([print(u, v, depth), print(u, h, depth), print(w, h, depth), print(w, v, depth)], tone);
  patch(0, 0, 1, 1, 0, 'envelope-paper');
  face([print(0, 0, -.01), print(1, 0, -.01), print(1, 1, -.01), print(0, 1, -.01)], 'lane-paper');
  patch(.057, .151, .943, .928, .003, 'lane-paper');
  patch(.062, .435, .938, .925, .006, 'stone-blue');
  face([print(.065, .435, .009), print(.26, .74, .009), print(.48, .435, .009), print(.065, .435, .009)], 'stone-deep');
  face([print(.30, .435, .01), print(.68, .80, .01), print(.938, .435, .01), print(.30, .435, .01)], 'stone-pale');
  patch(.06, .153, .94, .425, .007, 'ink-mist');
  patch(.21, .20, .50, .48, .014, 'lane-timber');
  patch(.29, .46, .42, .63, .015, 'lane-paper');
  patch(.23, .59, .47, .65, .017, 'lane-timber');
  patch(.28, .65, .42, .687, .016, 'lane-timber');
  patch(.55, .191, .79, .384, .014, 'dye-blue');
  patch(.61, .378, .74, .514, .015, 'lane-paper');
  patch(.588, .49, .758, .54, .016, 'lane-timber');
  patch(.47, .351, .57, .401, .016, 'lane-paper');
  for (const u of [.17, .81]) {
    const p = print(u, .967, .017);
    mesh.box(p, [.068, .085, .053], 'weathered-brass');
  }
}
