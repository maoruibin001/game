import type { SceneryPlacement } from './world-layout.ts';

type Sample = (x: number, z: number, salt: number) => number;

const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};
const shoulder = (x: number) => 118 + .24 * x + 16 * Math.sin(x * .047);
const breadth = (x: number) => 19 + 7 * Math.cos(x * .064);

/** Fir stands climb the shoulder in coves, with open cuts between crowns. */
function woodlandCover(x: number, z: number): number {
  const edge = smooth((x + 62) / 33) * smooth((164 - x) / 33);
  const crossSlope = 1 - smooth((Math.abs(z - shoulder(x)) - 5) / breadth(x));
  const glade = 1 - .9 * Math.exp(-((x - 57) ** 2 + (z - 146) ** 2) / 225);
  return edge * crossSlope * glade;
}

/** Share the grove outline with ground color, so the shade reads as a connected slope. */
export function postalSlopeColor(x: number, z: number): readonly [number, number, number] {
  const edge = smooth((x + 94) / 37) * smooth((218 - x) / 46)
    * smooth((z - 40) / 35) * smooth((246 - z) / 30);
  const uphill = z - shoulder(x);
  const meadow = smooth((uphill + 57) / 37) * (1 - smooth((uphill + 18) / 36));
  const farSlope = smooth((uphill - 14) / 27) * (1 - smooth((uphill - 65) / 36));
  const shade = edge * (.33 * meadow + .37 * farSlope + .71 * woodlandCover(x, z));
  return [1 - .64 * shade, 1 - .42 * shade, 1 - .14 * shade];
}

export function postalWoodland(sample: Sample, canPlant: (x: number, z: number) => boolean): SceneryPlacement[] {
  const trees: SceneryPlacement[] = [];
  for (let z = 78; z <= 178; z += 8) {
    for (let x = -58; x < 164; x += 8) {
      const px = x + sample(x, z, 71) * 7;
      const pz = z + sample(x, z, 72) * 7;
      const cover = woodlandCover(px, pz);
      if (sample(x, z, 73) >= cover * .88 || !canPlant(px, pz)) continue;
      trees.push({
        kind: sample(x, z, 74) < .8 ? 'tree-pine' : 'tree-leaf',
        x: px, z: pz, scale: .72 + cover * .22 + sample(x, z, 75) * .53,
        yaw: sample(x, z, 76) * Math.PI * 2,
      });
    }
  }
  return trees;
}
