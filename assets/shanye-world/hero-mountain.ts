/**
 * Town photograph mountain: metres, +Y up / +Z north.
 * P0 broadens the true twin ridges 1.5x around the unchanged photo anchor.
 * B3 repair raises only the upper rock above y97; the road, landing footprint
 * and real anchor-bearing shoulder stay unchanged. The complete summits fit
 * through the thick arch from the normal approach at z-3, not the old z-6 view.
 * Two exclusive rock tones distinguish the lit ridge and shadow courses
 * from the distant hills.
 * Authored local geometry, not a Scene Foundry model-worker output.
 * One union owns render and collision: consumers must replace the old nine
 * distant-crag boxes with HERO_MOUNTAIN_BOXES when adopting this helper.
 * No game imports, hidden score anchor, lighting or fog.
 */
export type MountainVec3 = readonly [number, number, number];
export type MountainMaterial = 'rock' | 'rock-light' | 'skyrock' | 'peak-shadow' | 'peak-sun';
export interface HeroMountainBox {
  readonly center: MountainVec3;
  readonly size: MountainVec3;
  readonly material: MountainMaterial;
}
export interface HeroMountainMeshSink {
  quad(points: readonly MountainVec3[], normal: MountainVec3, material: string): void;
}

const quarter = (value: number): number => Math.round(value * 4) / 4;
const strata = (bottom: number): MountainMaterial => bottom >= 99 ? 'rock-light' : bottom >= 79 ? 'rock' : 'skyrock';
function slab(x: number, z: number, bottom: number, top: number, width: number, depth: number): HeroMountainBox {
  // Snap the boundaries, not just centres, onto the existing quarter-metre grid.
  const x0 = quarter(x - width / 2), x1 = quarter(x + width / 2);
  const z0 = quarter(z - depth / 2), z1 = quarter(z + depth / 2);
  return Object.freeze({ center: [(x0 + x1) / 2, (bottom + top) / 2, (z0 + z1) / 2] as MountainVec3,
    size: [x1 - x0, top - bottom, z1 - z0] as MountainVec3, material: strata(bottom) });
}
function authoredBoxes(): readonly HeroMountainBox[] {
  const boxes: HeroMountainBox[] = [slab(154, 280, 45, 51, 94, 72)];
  // The original landing footprint stays exact. This broad lower mass connects
  // both ridges; its buried courses are intentionally coarser than the skyline.
  for (let y = 51; y < 81; y += 4) {
    const top = Math.min(81, y + 4), t = (top - 51) / 30;
    boxes.push(slab(154, 280, y, top, 94 - 34 * t, 72 - 16 * t));
  }
  // The eastern crag leans away from the camera as it rises. The real forward
  // shoulder at y95..97 contains the unchanged [154,96,268] photo anchor.
  for (let y = 81; y < 103; y += 2) {
    const t = (y - 81) / 24;
    // Above the anchor shoulder, retreat north through the *back* of the 2m
    // thick arch. Checking just its centre plane wrongly admits a 106m tip.
    const z = y === 101 ? 286 : y >= 97 ? 281 + (y - 97) : 280 + t;
    const width = y === 93 ? 24 : y === 95 ? 22 : y === 101 ? 10 : 2 * (106 - y) + 4;
    boxes.push(slab(156 + 4 * t, z, y, y + 2, width, 2 * (106 - y) + 4));
  }
  // The source profile ends at 103.5m, before the upper-only B3 transform.
  // Keeping this small cap and northward retreat preserves the two real tips.
  boxes.push(slab(160, 286, 103, 103.5, 5, 6));
  // A lower, thinner western ridge is farther back, leaving a readable saddle.
  for (let y = 81; y < 102; y += 2) {
    const t = (y - 81) / 20;
    boxes.push(slab(146.5, 288 + 5 * t, y, Math.min(102, y + 2),
      (y >= 93 ? 1.25 : 1.6) * (102 - y) + 4, 1.45 * (102 - y) + 4));
  }
  // r2: carve the two real ridges from the existing solid, keeping the anchor
  // inside a 15.75m-wide forward shoulder. A coordinate-only high cap is not
  // enough: the old near shoulders hid both tips in the actual photograph.
  return Object.freeze(boxes.map(box => {
    const lo = box.center.map((v, i) => v - box.size[i]! / 2);
    const hi = box.center.map((v, i) => v + box.size[i]! / 2);
    const bottom = lo[1]!;
    if (box.center[0] > 155 && bottom >= 91 && bottom < 103) {
      const westEdge: Record<number, number> = {91:153, 93:153, 95:153.5, 97:155.5, 99:156.5, 101:158};
      const frontEdge: Record<number, number> = {97:272, 99:280, 101:283};
      lo[0] = Math.max(lo[0]!, westEdge[bottom] ?? lo[0]!);
      lo[2] = Math.max(lo[2]!, frontEdge[bottom] ?? lo[2]!);
    }
    if (box.center[0] < 150 && bottom >= 81) {
      // Keep the same 102m western summit, now nearer within the old envelope.
      lo[2]! -= 10; hi[2]! -= 10;
      const westEdge: Record<number, number> = {93:141, 95:142, 97:143, 99:143.5};
      // Deepen the inner saddle between the summits while retaining the scoring shoulder.
      const eastEdge: Record<number, number> = {89:153, 91:152, 93:150.75, 95:149.75, 97:149, 99:149.25};
      lo[0] = Math.max(lo[0]!, westEdge[bottom] ?? lo[0]!);
      hi[0] = Math.min(hi[0]!, eastEdge[bottom] ?? hi[0]!);
      if (bottom === 99) lo[2] = 280.25;
    }
    return Object.freeze({center: lo.map((v, i) => (v + hi[i]!) / 2) as unknown as MountainVec3,
      size: lo.map((v, i) => hi[i]! - v) as unknown as MountainVec3, material: box.material});
  }));
}

export const HERO_MOUNTAIN_BOXES:readonly HeroMountainBox[] = Object.freeze(authoredBoxes().map(box=>{
 const left=quarter(154+(box.center[0]-box.size[0]/2-154)*1.5),right=quarter(154+(box.center[0]+box.size[0]/2-154)*1.5);
 // Preserve every point at/below the existing 97m shoulder, including [154,96,268].
 const upper=(y:number)=>y<=97?y:97+(y-97)*3;
 const bottom=upper(box.center[1]-box.size[1]/2),top=upper(box.center[1]+box.size[1]/2);
 return Object.freeze({...box,center:[(left+right)/2,(bottom+top)/2,box.center[2]] as MountainVec3,
  size:[right-left,top-bottom,box.size[2]] as MountainVec3,
  material:box.material==='rock-light'?'peak-sun':box.material==='rock'?'peak-shadow':box.material});
}).flatMap(box => {
 const [x, y, z] = box.center, [width, height, depth] = box.size;
 const top = y + height / 2;
 if (top !== 116.5 && top !== 112) return [box];
 // Two receding strata put distinct ridges on the formerly flat caps.
 // The peak above the eastern shoulder is higher, with a clear saddle.
 const split = top - (top === 116.5 ? .75 : 2.5);
 const bottom = y - height / 2;
 const base: HeroMountainBox = { ...box, center: [x, (bottom + split) / 2, z], size: [width, split - bottom, depth] };
 const higher = top === 116.5;
 const cap = slab(x + (higher ? .80 : -.65), z + (higher ? 3 : .35), split,
   higher ? 118.5 : 110.75, width * .52, depth * .83);
 return [base, { ...cap, material: 'peak-sun' } as const];
}));
export const HERO_MOUNTAIN_BOUNDS = Object.freeze({ min: [83.5, 45, 244] as MountainVec3, max: [224.5, 118.5, 316] as MountainVec3 });
export const HERO_MOUNTAIN_PHOTO_ANCHOR: MountainVec3 = [154, 96, 268];
export const HERO_MOUNTAIN_SUMMITS = [false, true].map(east => HERO_MOUNTAIN_BOXES
  .filter(box => (box.center[0] > 154) === east)
  .reduce((top, box) => box.center[1] + box.size[1] / 2 > top.center[1] + top.size[1] / 2 ? box : top));
const materials: readonly MountainMaterial[] = ['skyrock', 'rock', 'rock-light', 'peak-shadow', 'peak-sun'];

/**
 * Emit the closed union of the same collision boxes through VoxelMesh.quad.
 * Coordinate compression avoids millions of quarter-metre cells. Internal
 * faces are omitted; adjacent coplanar faces of one material are greedily
 * merged. This is a deterministic surface compiler, not per-voxel entities.
 */
export function appendHeroMountain(mesh: HeroMountainMeshSink): { boxes: number; quads: number; triangles: number; unionVolume: number } {
  const boundaries = [0, 1, 2].map(axis => [...new Set(HERO_MOUNTAIN_BOXES.flatMap(box =>
    [box.center[axis]! - box.size[axis]! / 2, box.center[axis]! + box.size[axis]! / 2]))].sort((a, b) => a - b));
  const dimensions = boundaries.map(values => values.length - 1);
  const [nx, ny, nz] = dimensions as [number, number, number];
  const index = (x: number, y: number, z: number) => x + nx * (y + ny * z);
  const solid = new Uint8Array(nx * ny * nz);
  for (const box of HERO_MOUNTAIN_BOXES) {
    const lo = boundaries.map((values, axis) => values.indexOf(box.center[axis]! - box.size[axis]! / 2));
    const hi = boundaries.map((values, axis) => values.indexOf(box.center[axis]! + box.size[axis]! / 2));
    const material = materials.indexOf(box.material) + 1;
    for (let z = lo[2]!; z < hi[2]!; z++) for (let y = lo[1]!; y < hi[1]!; y++) for (let x = lo[0]!; x < hi[0]!; x++) solid[index(x, y, z)] = material;
  }
  let quads = 0, unionVolume = 0;
  for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) if (solid[index(x, y, z)]) {
    unionVolume += (boundaries[0]![x + 1]! - boundaries[0]![x]!) * (boundaries[1]![y + 1]! - boundaries[1]![y]!) * (boundaries[2]![z + 1]! - boundaries[2]![z]!);
  }
  for (let axis = 0; axis < 3; axis++) {
    const u = (axis + 1) % 3, v = (axis + 2) % 3, nu = dimensions[u]!, nv = dimensions[v]!;
    const mask = new Int8Array(nu * nv), p = [0, 0, 0];
    for (let plane = 0; plane <= dimensions[axis]!; plane++) {
      for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
        p[u] = i; p[v] = j; p[axis] = plane - 1;
        const before = plane === 0 ? 0 : solid[index(p[0]!, p[1]!, p[2]!)]!;
        p[axis] = plane;
        const after = plane === dimensions[axis] ? 0 : solid[index(p[0]!, p[1]!, p[2]!)]!;
        mask[i + nu * j] = before && !after ? before : after && !before ? -after : 0;
      }
      for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
        const code = mask[i + nu * j]!; if (!code) continue;
        let width = 1, depth = 1;
        while (i + width < nu && mask[i + width + nu * j] === code) width++;
        rows: while (j + depth < nv) {
          for (let k = 0; k < width; k++) if (mask[i + k + nu * (j + depth)] !== code) break rows;
          depth++;
        }
        const point = (iu: number, iv: number): MountainVec3 => {
          const position = [0, 0, 0]; position[axis] = boundaries[axis]![plane]!;
          position[u] = boundaries[u]![iu]!; position[v] = boundaries[v]![iv]!;
          return position as unknown as MountainVec3;
        };
        const normal = [0, 0, 0]; normal[axis] = Math.sign(code);
        const face = materials[Math.abs(code) - 1]!;
        // Cooler cut faces and lighter strata on the shoulder expose the
        // volume of the rock in the same daylight as the valley.
        const tone = axis === 1 && code > 0 && face === 'peak-shadow' ? 'rock-light' : face;
        mesh.quad([point(i, j), point(i + width, j), point(i + width, j + depth), point(i, j + depth)],
          normal as unknown as MountainVec3, tone);
        quads++;
        for (let row = j; row < j + depth; row++) mask.fill(0, i + nu * row, i + width + nu * row);
      }
    }
  }
  return { boxes: HERO_MOUNTAIN_BOXES.length, quads, triangles: quads * 2, unionVolume };
}
