import { GINKGO_BARK, ginkgoCrown, ginkgoFan } from './ginkgo-garden.ts';
import type { DetailBox } from './scene-details.ts';
import type { VoxelMesh } from './voxel-mesh.ts';
import type { Vec3 } from './world-layout.ts';

const root: Vec3 = [-6.45, 14.08, -230.70];
const at = ([x, y, z]: Vec3): Vec3 => [root[0] + x, root[1] + y, root[2] + z];

export const POSTAL_AUTUMN_TRUNK: DetailBox = {
  id: 'post-opening/autumn-trunk', center: at([-.11, 1.96, .13]),
  size: [1.36, 4.1, 1.37], material: GINKGO_BARK, solid: true,
};

const boughs = [
  { elbow: [-2.40, 14.37, .73], tip: [-4.63, 17.38, 2.06], spread: [2.23, 1.08], gold: false },
  { elbow: [-.91, 17.1, .79], tip: [-2.23, 20.04, 2.15], spread: [1.78, 1.06], gold: true },
  { elbow: [.87, 17.7, 1.64], tip: [.65, 21.55, 2.17], spread: [2.15, 1.53], gold: true },
  { elbow: [2.50, 14.79, .55], tip: [4.05, 17.98, 1.62], spread: [1.80, 1.2], gold: false },
  { elbow: [-.71, 13.2, 2.68], tip: [-1.73, 16.6, 4.2], spread: [1.4, .96], gold: true },
] as const;

/** Crooked silhouette and staggered crowns with visible gaps at the forks. */
export function appendPostalAutumnTree(mesh: VoxelMesh): void {
  const limb = (a: Vec3, b: Vec3, diameter: number) =>
    mesh.beam(at(a), at(b), diameter, diameter * .85, GINKGO_BARK);
  const fork: Vec3 = [-.46, 11.4, .70];
  limb([0, -.19, 0], [-.35, 4.1, .37], 1.30);
  limb([-.35, 4.1, .37], [.47, 7.8, .12], 1.02);
  limb([.47, 7.8, .12], fork, .77);
  limb([0, .73, 0], [-1.63, -.10, 1.02], .32);
  limb([0, .88, 0], [1.68, -.11, -.72], .37);

  let seed = 23917;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (const [i, bough] of boughs.entries()) {
    const { elbow, tip: [x, y, z], spread: [width, depth], gold } = bough;
    limb(fork, elbow, .47 - i * .036);
    limb(elbow, [x, y, z], .31 - i * .025);

    const lit = i === 2 ? 'ginkgo-light' : gold ? 'ginkgo-gold' : 'ginkgo-amber';
    const dark = gold ? 'ginkgo-ochre' : 'postal-copper';
    for (let j = 0; j < 8; j++) {
      const angle = j * 2.40 + i * .83, t = (j + 1) / 8;
      const radius = Math.sqrt(t);
      const end: Vec3 = [x + width * radius * Math.cos(angle), y + .68 * (1 - t) + .36 * Math.sin(angle), z + depth * radius * Math.sin(angle)];
      if (j < 5) limb([x, y - .13, z], end, .085);
      const position = at(end);
      const leafWidth = .61 + random() * .32, leafDepth = .42 + random() * .21;
      ginkgoCrown(mesh, position[0], position[1] - .14, position[2], leafWidth, leafDepth, .88, angle, dark);
      ginkgoCrown(mesh, position[0] + .06, position[1] + .24, position[2], leafWidth * .96, leafDepth * .93, .66, angle, lit);
      for (let k = 0; k < 5; k++) {
        const offset = k * 2.4 + angle;
        const fan: Vec3 = [position[0] + .94 * leafWidth * Math.cos(offset), position[1] + (k - 2) * .14,
          position[2] + .93 * leafDepth * Math.sin(offset)];
        ginkgoFan(mesh, fan, .26 + random() * .19, offset, .18 + random() * .59, k % 3 ? lit : dark);
      }
    }
  }
  appendTowerTree(mesh);
}

const towerTreeBase: Vec3 = [-37.5, 14.45, -232.0];
export const POSTAL_TOWER_TREE_TRUNK: DetailBox = {
  id: 'post-opening/west-slope-trunk', center: [-37.62, 16.22, -232],
  size: [.69, 3.6, .69], material: GINKGO_BARK, solid: true,
};

// A near slope canopy interrupts the long middle eaves in the two opening
// cameras. The tower itself, including its finial, is the original landmark.
function appendTowerTree(mesh: VoxelMesh): void {
  const [, y, z] = towerTreeBase;
  const bend: Vec3 = [-37.84, y + 5.1, z + .15];
  const fork: Vec3 = [-38.2, y + 9.2, z + .6];
  mesh.beam(towerTreeBase, bend, .68, .61, GINKGO_BARK);
  mesh.beam(bend, fork, .52, .44, GINKGO_BARK);
  const crowns = [
    [-40.65, 26.95, -231.55, 1.43, 1.05], [-39.72, 27.60, -230.65, 1.35, .95],
    [-38.66, 27.40, -231.4, 1.55, 1.16], [-37.42, 26.55, -230.9, 1.31, 1.0],
    [-36.05, 25.54, -230.12, 1.50, 1.12], [-39.16, 25.42, -231.8, 1.58, 1.01],
  ] as const;
  for (const [i, [x, h, depth, width, spread]] of crowns.entries()) {
    const tip: Vec3 = [x, h - .36, depth];
    mesh.beam(fork, tip, .24, .20, GINKGO_BARK);
    ginkgoCrown(mesh, x, h - .15, depth, width, spread, 1.18, i * 1.9,
      i % 2 ? 'hillside-jade' : 'hillside-shade');
    ginkgoCrown(mesh, x - .16, h + .30, depth + .09, width * .75, spread * .81, .81,
      i * 1.9 + .45, 'hillside-sun');
  }
}
