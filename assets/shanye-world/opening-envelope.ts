import { projectAnchor, projectPoint, lerp } from '../controller/geometry.ts';
import type { CameraPose, TraceSegment, Vec3 } from '../controller/types.ts';
import { HERO_MOUNTAIN_SUMMITS } from './hero-mountain.ts';
import type { OpeningMountainCount } from '../journey/types.ts';
import { withVertexColors } from '@forgeax/engine/geometry';
import { VoxelMesh } from './voxel-mesh.ts';
import { detailObstacles, type DetailBox } from './scene-details.ts';

import { POSTAL_EYE_RISE, POSTAL_LOOKOUT_FLOOR } from './postal-lookout.ts';
import { appendPostalCamera, POSTAL_CAMERA_BASE } from './postal-camera-art.ts';
import { appendPostalAutumnTree, POSTAL_AUTUMN_TRUNK, POSTAL_TOWER_TREE_TRUNK } from './postal-autumn-tree.ts';

type EnvelopeStand = {
  x: number; z: number; rise: number;
  halfWidth: number; rim: number; fold: number; tabTop: number;
};
const lookout: EnvelopeStand = {
  x: -23.65, z: -244.25, rise: 10.12 + POSTAL_EYE_RISE,
  halfWidth: .96, rim: 16.273, fold: 16.084, tabTop: 16.55,
};
const doorstep: EnvelopeStand = {
  x: 11.38, z: -226.65, rise: 0,
  halfWidth: .52, rim: 16.255, fold: 16.115, tabTop: 16.45,
};
const bottom = 15.58;
const stations = [lookout, doorstep];

const structure: DetailBox[] = [];
const built = (id: string, center: Vec3, size: Vec3, material: string, solid = false) =>
  structure.push({ id: 'post-opening/' + id, center, size, material, solid });

const { west, east, south, north, top } = POSTAL_LOOKOUT_FLOOR;
const floorX = (west + east) / 2;
built('front-course', [floorX, 23.30, north - .29], [east - west, .55, .56], 'stone-blue');
built('front-plinth', [floorX, 22.66, north - .40], [east - west, .72, .80], 'stone-jade');

// The raised deck is the post office's outdoor sorting porch. Keep its
// south approach open and put the work bay on the side of the walking line.
const roofCenter: Vec3 = [-29.26, 28.03, -248.49];
const roofSize: Vec3 = [3.1, .24, 5.18];
built('shelter', roofCenter, roofSize, 'temple-tile', true);
built('soffit', [-29.26, 27.87, -248.49], [3.04, .08, 5.15], 'temple-wood');
built('eave', [-29.26, 27.88, -245.9], [3.21, .19, .17], 'wood');
built('sort-wall', [-30, 25.99, -248.34], [.19, 3.72, 4.24], 'cream', true);
for (const z of [-250.71, -246.12]) {
  built('shelter-post-' + z, [-29.83, 25.99, z], [.27, 3.79, .27], 'temple-wood', true);
  built('shelter-foot-' + z, [-29.83, 24.24, z], [.42, .31, .43], 'stone-jade', true);
}
for (let i = 0; i < 5; i++)
  built('rafter-' + i, [-30.43 + i * .58, 27.77, -248.49], [.13, .17, 5.18], 'wood');
built('sorting-box', [-29.23, 24.71, -247.35], [1.11, 1.28, .63], 'temple-wood', true);
for (let i = 0; i < 3; i++) {
  built('sorting-letter-' + i, [-29.61 + i * .37, 25.21, -247.71], [.24, .25, .062], 'envelope-paper');
  built('sorting-seal-' + i, [-29.61 + i * .37, 25.19, -247.75], [.055, .060, .027], 'oxblood');
}

// The east eave shelters the sorting bench. Its shadow follows the valley
// sun over both the paper and the stone on the way out, leaving an open aisle.
const sortingEaveCenter: Vec3 = [-23.38, 28.24, -246.39];
const sortingEaveSize: Vec3 = [3.66, .20, 2.81];
built('sort-eave-tile', sortingEaveCenter, sortingEaveSize, 'temple-tile', true);
for (let i = 0; i < 5; i++)
  built('sort-eave-rafter-' + i, [-24.97 + i * .79, 28.04, -246.39], [.10, .19, 2.88], 'wood');
built('sort-eave-fascia', [-23.38, 28.11, -245.01], [3.70, .17, .16], 'temple-wood');
for (const z of [-247.30, -245.34]) {
  built('sort-eave-post-' + z, [-21.80, 26.09, z], [.22, 4.0, .24], 'temple-wood', true);
  built('sort-eave-foot-' + z, [-21.80, 24.23, z], [.34, .30, .35], 'stone-jade', true);
  built('sort-eave-beam-' + z, [-23.33, 27.96, z], [3.31, .22, .20], 'temple-wood');
}

for (const [index, x, z, w, d] of [
  [0, -28.87, -240.23, 2.26, .35], [1, -22.82, -240.23, 2.64, .35],
  [2, -29.82, -244.14, .34, 7.9], [3, -21.68, -243.83, .34, 7.15],
] as const) {
  built('rail-sill-' + index, [x, 24.27, z], [w, .40, d], 'stone-jade', true);
  built('rail-panel-' + index, [x, 24.62, z], [w, .32, d * .8], 'lane-timber', true);
  built('rail-cap-' + index, [x, 24.83, z], [w + .09, .13, d + .09], 'wood-light');
}

// Mark the open end with a post-route sign and a continuous stone threshold.
built('downhill-sign-post', [-27.94, 24.84, -241.20], [.15, 1.53, .17], 'temple-wood', true);
built('downhill-sign', [-27.94, 25.50, -241.20], [.91, .48, .13], 'ink-mist', true);
const signZ = -241.277;

for (const side of [-1, 1]) {
  built('lookout-foot-' + side, [lookout.x + side * .88, 24.17, lookout.z + .12], [.21, .20, .64], 'stone-jade', true);
  built('lookout-leg-' + side, [lookout.x + side * .88, 24.91 + POSTAL_EYE_RISE / 2, lookout.z + .12], [.17, 1.44 + POSTAL_EYE_RISE, .25], 'lane-timber', true);
}
built('lookout-stretcher', [lookout.x, 24.53, lookout.z + .18], [1.85, .13, .19], 'lane-timber', true);
built('lookout-sill', [-23.22, 25.64 + POSTAL_EYE_RISE, -244.08], [2.98, .12, .86], 'wood-light', true);
built('lookout-camera-leg', [POSTAL_CAMERA_BASE[0], 24.86 + POSTAL_EYE_RISE / 2, POSTAL_CAMERA_BASE[2] + .23], [.18, 1.54 + POSTAL_EYE_RISE, .27], 'lane-timber', true);
built('lookout-cradle', [lookout.x, 25.71 + POSTAL_EYE_RISE, lookout.z + .13], [2.02, .065, .42], 'temple-wood');
for (let j = 0; j < 3; j++)
  built('lookout-sheet-' + j, [lookout.x + .88 + j * .015, 25.728 + POSTAL_EYE_RISE + j * .027, lookout.z + .25], [.25, .022, .23], j % 2 ? 'cream' : 'envelope-paper');
built('lookout-stamp-pad', [lookout.x - .91, 25.735 + POSTAL_EYE_RISE, lookout.z - .23], [.21, .055, .22], 'oxblood');
built('lookout-stamp', [lookout.x - .91, 25.825 + POSTAL_EYE_RISE, lookout.z - .23], [.10, .13, .10], 'temple-wood');
built('doorstep-post', [doorstep.x, 14.79, doorstep.z + .10], [.37, 1.47, .40], 'wood', true);
built('doorstep-sill', [doorstep.x, 15.53, doorstep.z + .05], [1.20, .13, .52], 'wood-light', true);

export const OPENING_POSTAL_SOLIDS = detailObstacles([...structure, POSTAL_AUTUMN_TRUNK, POSTAL_TOWER_TREE_TRUNK, {
  id: 'post-opening/lookout-camera-body', center: [POSTAL_CAMERA_BASE[0], 26.17 + POSTAL_EYE_RISE, POSTAL_CAMERA_BASE[2]],
  size: [1.06, .77, .90], material: 'temple-wood', solid: true,
}]);
export function openingPorchShelter(px: number, pz: number): number | undefined {
  for (const [center, size] of [[roofCenter, roofSize], [sortingEaveCenter, sortingEaveSize]] as const)
    if (Math.abs(px - center[0]) <= size[0] / 2 && Math.abs(pz - center[2]) <= size[2] / 2)
      return center[1] + size[1] / 2;
}

export function nearOpeningEnvelope([px, py, pz]: Vec3): boolean {
  return stations.some(({ x, z, rise }) => Math.abs(px - x) < 3.6 && Math.abs(py - (14.08 + rise)) < 1.2
    && pz > z - 5.8 && pz < z - .75);
}

function paperPoint({ x, z, rise }: EnvelopeStand, dx: number, y: number, dz = 0): Vec3 {
  return [x + dx, y + rise, z + dz];
}

function appendEnvelope(mesh: VoxelMesh, station: EnvelopeStand) {
  const front = (dx: number, y: number, dz = 0) => paperPoint(station, dx, y, dz);
  const { halfWidth, rim, fold, tabTop } = station;
  const paperFold = (a: Vec3, b: Vec3, c: Vec3, material: string) => {
    const edge = (p: Vec3): Vec3 => [p[0], p[1], p[2] + .062];
    const ab = b.map((value, axis) => value - a[axis]!);
    const ac = c.map((value, axis) => value - a[axis]!);
    const normal = [ab[1]! * ac[2]! - ab[2]! * ac[1]!, ab[2]! * ac[0]! - ab[0]! * ac[2]!, ab[0]! * ac[1]! - ab[1]! * ac[0]!];
    const length = Math.hypot(...normal) * (normal[2]! > 0 ? -1 : 1);
    const face = normal.map(axis => axis / length) as unknown as Vec3;
    mesh.quad([a, b, c, a], face, material);
    mesh.quad([edge(a), edge(b), edge(c), edge(a)], [-face[0], -face[1], -face[2]], 'cream');
    for (const [p, q, other] of [[a, b, c], [b, c, a], [c, a, b]] as const) {
      const dx = q[0] - p[0], dy = q[1] - p[1], span = Math.hypot(dx, dy);
      const sign = dx * (other[1] - p[1]) - dy * (other[0] - p[0]) > 0 ? 1 : -1;
      mesh.quad([p, q, edge(q), edge(p)], [sign * dy / span, -sign * dx / span, 0], 'wood-light');
    }
  };
  // The back flap folds down away from the viewer. The front pocket is opaque;
  // the gap between the paper tabs is real space through which the valley shows.
  const lowerLeft = front(-halfWidth, bottom, .025), lowerRight = front(halfWidth, bottom, .025);
  const left = front(-halfWidth, rim, .024), right = front(halfWidth, rim, .024);
  const center = front(0, fold, -.018);
  // Keep the folded back below the opening. From a close station it must not
  // cover the lower mountain profile through the real gap above the front lip.
  const back = station === lookout ? fold - .025 : 16.14;
  const backWidth = station === lookout ? halfWidth * .73 : .38;
  const tabInner = halfWidth - .16;
  paperFold(front(-backWidth, back, .085), front(backWidth, back, .085),
    front(0, 15.76, station === lookout ? .39 : .49), 'wood-light');
  paperFold(left, front(-halfWidth, tabTop, .065), front(-tabInner, rim - .04, .04), 'cream');
  paperFold(right, front(halfWidth, tabTop, .065), front(tabInner, rim - .04, .04), 'cream');
  paperFold(lowerLeft, left, center, 'cream');
  paperFold(lowerRight, center, right, 'cream');
  paperFold(lowerLeft, center, lowerRight, 'envelope-paper');
  if (station !== lookout) {
    mesh.beam(front(-halfWidth, rim + .008, .007), front(0, fold + .008, -.035), .017, .018, 'envelope-paper');
    mesh.beam(front(0, fold + .008, -.035), front(halfWidth, rim + .008, .007), .017, .018, 'envelope-paper');
  }
  mesh.beam(lowerLeft, front(-.10, 15.90, -.013), .022, .025, 'wood-light');
  mesh.beam(lowerRight, front(.10, 15.90, -.013), .022, .025, 'wood-light');
  const seal = station === lookout ? 15.88 : 15.93;
  mesh.box(front(0, seal - .01, -.031), [.22, .19, .058], 'oxblood');
  mesh.box(front(0, seal, -.065), [.181, .151, .027], 'red');
  mesh.box(front(0, seal, -.082), [.081, .043, .009], 'envelope-paper');
}

const slabTop = top - .02;
const floorContacts = structure.filter(box => box.id.includes('-foot-') || box.id.endsWith('/lookout-camera-leg'));

function lookoutPaving(mesh: VoxelMesh) {
  const underlay = slabTop - .04;
  mesh.quad([[west, underlay, south], [east, underlay, south], [east, underlay, north], [west, underlay, north]],
    [0, 1, 0], 'lane-timber');
  for (const [a, b, normal] of [
    [[west, south], [east, south], [0, 0, -1]], [[east, south], [east, north], [1, 0, 0]],
    [[east, north], [west, north], [0, 0, 1]], [[west, north], [west, south], [-1, 0, 0]],
  ] as const) {
    mesh.quad([[a[0], slabTop - .5, a[1]], [b[0], slabTop - .5, b[1]], [b[0], slabTop, b[1]], [a[0], slabTop, a[1]]],
      normal, 'stone-jade');
  }
  // Split the boards for neutral contact occlusion near the supporting feet.
  // Light and cast shadows arrive through the native directional light.
  const rows = 36, columns = 34;
  for (let row = 0; row < rows; row++) {
    const near = south + (north - south) * row / rows;
    const far = south + (north - south) * (row + 1) / rows - (row % 2 ? .018 : 0);
    for (let column = 0; column < columns; column++) {
      const left = west + (east - west) * column / columns;
      const right = west + (east - west) * (column + 1) / columns;
      const threshold = near > -246.1 && left >= -27.25 && right <= -24.75;
      const edge = left < -27 || right > -25;
      mesh.quad([[left, slabTop, near], [right, slabTop, near], [right, slabTop, far], [left, slabTop, far]],
        [0, 1, 0], threshold ? edge ? 'stone-blue' : 'path-light' : 'cedar-lining');
    }
  }
}

export function openingEnvelopeMesh(material: Parameters<VoxelMesh['build']>[0]) {
  const mesh = new VoxelMesh();
  lookoutPaving(mesh);
  for (const box of structure) mesh.box(box.center, box.size, box.material);
  // An envelope and descending chevron are readable on the approach.
  mesh.box([-28.10, 25.53, signZ], [.23, .15, .023], 'envelope-paper');
  mesh.beam([-28.211, 25.59, signZ - .015], [-28.10, 25.51, signZ - .015], .018, .012, 'weathered-brass');
  mesh.beam([-28.10, 25.51, signZ - .015], [-27.99, 25.59, signZ - .015], .018, .012, 'weathered-brass');
  mesh.beam([-27.88, 25.57, signZ], [-27.76, 25.44, signZ], .033, .019, 'envelope-paper');
  mesh.beam([-27.76, 25.44, signZ], [-27.65, 25.57, signZ], .033, .019, 'envelope-paper');
  for (const station of stations) appendEnvelope(mesh, station);
  appendPostalCamera(mesh);
  appendPostalAutumnTree(mesh);

  const tints = new Float32Array(mesh.vertices.length / 8 * 3);
  for (let i = 0, color = 0; i < mesh.vertices.length; i += 8, color += 3) {
    const [x, y, z] = mesh.vertices.slice(i, i + 3) as [number, number, number];
    const onBoards = y === slabTop && z >= south && z <= north && x >= west && x <= east;
    if (onBoards) {
      let occlusion = 0;
      for (const { center, size } of floorContacts) {
        const distance = Math.hypot(Math.max(0, Math.abs(x - center[0]) - size[0] / 2),
          Math.max(0, Math.abs(z - center[2]) - size[2] / 2));
        occlusion = Math.max(occlusion, Math.max(0, 1 - distance / .38) ** 2);
      }
      const tone = .82 - .37 * occlusion;
      tints.set([tone, tone, tone], color);
    } else if (z > -244.72 && z < -243.78 && x > lookout.x - .71 && x < lookout.x + .71 && y > 25.63 + POSTAL_EYE_RISE && y < 26.57 + POSTAL_EYE_RISE) {
      tints.set([1, .96, .88], color);
    } else {
      tints.set([1, 1, 1], color);
    }
  }
  const result = withVertexColors(mesh.build(material), tints);
  if (!result.ok) throw result.error;
  return result.value;
}

// Use the visible top front edge of each authored summit, never the old
// town-photo anchor at the centre of the whole mountain.
const peakEdges = HERO_MOUNTAIN_SUMMITS.map(({ center, size }) => {
  const height = center[1] + size[1] / 2;
  const span = size[0] * .34;
  const frontZ = center[2] - size[2] / 2;
  return {tip: [center[0], height - .07, frontZ] as Vec3, samples: [
    [center[0] - span, height - .35, frontZ - .06],
    [center[0], height - .07, frontZ - .06],
    [center[0] + span, height - .35, frontZ - .06],
  ] as Vec3[]};
});
const [lowerTip, higherTip] = peakEdges.map(peak => peak.tip) as [Vec3, Vec3];
const skyBetweenSummits: Vec3 = [
  (lowerTip[0] + higherTip[0]) / 2,
  lowerTip[1] - 1.8,
  Math.min(lowerTip[2], higherTip[2]),
];

/** Undefined means an unrelated photo. Zero means the peaks are still outside the envelope. */
export function openingMountainCount(camera: CameraPose, trace: TraceSegment): OpeningMountainCount | undefined {
  const eye = camera.position;
  const station = stations.find(({ x, z }) => eye[2] <= z - .75 && eye[2] >= z - 12 && Math.abs(eye[0] - x) <= 7);
  if (!station) return;
  const { x, z, rise, halfWidth, rim, fold, tabTop } = station;
  const paper = projectAnchor(camera, { position: paperPoint(station, 0, 15.91, -.06),
    size: [2 * halfWidth, .66, 0], right: [1, 0, 0] }, 0, trace);
  if (paper.occluded || paper.visibleFraction < .97 || paper.width < .057 || paper.height < .075) return;
  const crossesOpening = (point: Vec3) => {
    const at = lerp(eye, point, (z - eye[2]) / (point[2] - eye[2]));
    const lateral = Math.abs(at[0] - x);
    const height = at[1] - rise;
    if (station !== lookout) {
      // Keep the narrow ground-floor opening's established scoring margin.
      return lateral < halfWidth - .23 && height > fold + (rim - fold) * lateral / halfWidth + .04
        && height < tabTop - .006;
    }
    // Follow the physical V and the inside edge of the corner folds. A crest
    // grazing the paper is not a whole crest in the opening.
    const tabEdge = halfWidth - .16 * (1 - Math.max(0, (height - rim + .04) / (tabTop - rim + .04)));
    return lateral < tabEdge - .025 && height > fold + (rim - fold) * lateral / halfWidth + .012
      && height < tabTop - .012;
  };
  let visible = 0, inside = 0;
  for (const { tip, samples } of peakEdges) {
    const screen = projectPoint(camera, tip);
    if (screen.depth <= paper.depth || screen.x < .025 || screen.x > .975 || screen.y < .03 || screen.y > .97) continue;
    if (samples.some(point => trace(eye, point, 0).hit)) continue;
    visible++;
    if (samples.every(crossesOpening)) inside++;
  }
  if (inside === 2 && (!crossesOpening(skyBetweenSummits) || trace(eye, skyBetweenSummits, 0).hit)) return 1;
  return visible ? inside === 2 ? 2 : inside === 1 ? 1 : 0 : undefined;
}
