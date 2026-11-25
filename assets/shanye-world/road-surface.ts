import type { Vec3 } from './world-layout.ts';

type Plane = (point: Vec3) => number;
type Bounds = readonly [minX: number, minZ: number, maxX: number, maxZ: number];
export interface RoadSurface { points: readonly Vec3[]; material: string; ownsFootprint?: true }
const epsilon = 1e-8;

function bounds(points: readonly Vec3[]): Bounds {
  const xs = points.map(p => p[0]), zs = points.map(p => p[2]);
  return [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
}

function signedArea(points: readonly Vec3[]): number {
  if (points.length < 3) return 0;
  const a = points[0]!;
  return points.slice(1, -1).reduce((sum, b, i) => {
    const c = points[i + 2]!;
    return sum + (b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0]);
  }, 0) * .5;
}

function heightAt(points: readonly Vec3[]): Plane {
  const [a, b, c] = points as readonly [Vec3, Vec3, Vec3, ...Vec3[]];
  const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2];
  const cx = c[0] - a[0], cy = c[1] - a[1], cz = c[2] - a[2];
  const area = bx * cz - bz * cx;
  const sx = (by * cz - bz * cy) / area, sz = (bx * cy - by * cx) / area;
  return p => a[1] + sx * (p[0] - a[0]) + sz * (p[2] - a[2]);
}

function sides(points: readonly Vec3[]): Plane[] {
  const sign = Math.sign(signedArea(points));
  return points.map((a, i) => {
    const b = points[(i + 1) % points.length]!;
    return p => sign * ((b[0] - a[0]) * (p[2] - a[2]) - (b[2] - a[2]) * (p[0] - a[0]));
  });
}

/** Split along the exact line of a linear plane, interpolating the source road's height. */
function split(points: readonly Vec3[], side: Plane) {
  const inside: Vec3[] = [], outside: Vec3[] = [];
  for (const [i, a] of points.entries()) {
    const b = points[(i + 1) % points.length]!, da = side(a), db = side(b);
    if (da >= 0) inside.push(a);
    if (da <= 0) outside.push(a);
    if ((da > 0 && db < 0) || (da < 0 && db > 0)) {
      const t = da / (da - db);
      const at: Vec3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      inside.push(at);
      outside.push(at);
    }
  }
  return { inside, outside };
}

function subtract(points: readonly Vec3[], cutters: readonly Plane[]): (readonly Vec3[])[] {
  let inside = points;
  const exposed: (readonly Vec3[])[] = [];
  for (const cutter of cutters) {
    const parts = split(inside, cutter);
    if (Math.abs(signedArea(parts.inside)) <= epsilon) return [points];
    if (Math.abs(signedArea(parts.outside)) > epsilon) exposed.push(parts.outside);
    inside = parts.inside;
  }
  return exposed;
}

/** Partition an already visible top for material assignment. Heights, edge
 * interpolation and ownership stay with the original road surface. */
export function partitionRoadTop(points: readonly Vec3[], rect: Bounds) {
  const [left,south,right,north] = rect, area = bounds(points);
  if (area[0] >= right || area[2] <= left || area[1] >= north || area[3] <= south)
    return { inside: [] as readonly Vec3[], outside: [points] };
  const cutters: Plane[] = [p=>p[0]-left,p=>right-p[0],p=>p[2]-south,p=>north-p[2]];
  let inside = points;
  const outside: (readonly Vec3[])[] = [];
  for (const cutter of cutters) {
    const part = split(inside,cutter);
    if (Math.abs(signedArea(part.inside))<=epsilon) return {inside:[],outside:[points]};
    if (Math.abs(signedArea(part.outside))>epsilon) outside.push(part.outside);
    inside = part.inside;
  }
  return { inside, outside };
}

const cellSize = 8;
function cellsFor([minX, minZ, maxX, maxZ]: Bounds) {
  const keys: string[] = [];
  for (let x = Math.floor(minX / cellSize); x <= Math.floor(maxX / cellSize); x++) {
    for (let z = Math.floor(minZ / cellSize); z <= Math.floor(maxZ / cellSize); z++) keys.push(x + '/' + z);
  }
  return keys;
}

/** Emit only the upper surface at each X/Z. Flat duplicates use source order;
 * crossing grades are cut at the world-space line where their heights meet. */
export function exposedRoadSurfaces(surfaces: readonly RoadSurface[]): { points: readonly Vec3[]; source: RoadSurface }[] {
  const indexed = surfaces.map(surface => {
    const box = bounds(surface.points);
    return { surface, box, cells: cellsFor(box), sides: sides(surface.points), height: heightAt(surface.points) };
  });
  const spatial = new Map<string, number[]>();
  indexed.forEach((entry, id) => {
    for (const key of entry.cells) {
      const indexes = spatial.get(key);
      if (indexes) indexes.push(id);
      else spatial.set(key, [id]);
    }
  });
  return indexed.flatMap((entry, id) => {
    const candidates = new Set(entry.cells.flatMap(key => spatial.get(key)!));
    let pieces: (readonly Vec3[])[] = [entry.surface.points];
    for (const otherId of candidates) {
      if (id === otherId) continue;
      const other = indexed[otherId]!;
      const a = entry.box, b = other.box;
      if (a[0] >= b[2] || b[0] >= a[2] || a[1] >= b[3] || b[1] >= a[3]) continue;
      if (entry.surface.ownsFootprint && !other.surface.ownsFootprint) continue;
      if (other.surface.ownsFootprint && !entry.surface.ownsFootprint) {
        pieces = pieces.flatMap(points => subtract(points, other.sides));
        if (!pieces.length) break;
        continue;
      }
      const difference = (p: Vec3) => other.height(p) - entry.height(p);
      const heights = entry.surface.points.map(difference);
      const samePlane = heights.every(h => Math.abs(h) <= epsilon);
      if (samePlane ? id < otherId : heights.every(h => h <= 0)) continue;
      const cutters = samePlane ? other.sides : [...other.sides, difference];
      pieces = pieces.flatMap(points => subtract(points, cutters));
      if (!pieces.length) break;
    }
    return pieces.map(points => ({ points, source:entry.surface }));
  });
}

export function triangulateRoadSurface(points: readonly Vec3[]): [Vec3, Vec3, Vec3][] {
  const origin = points[0]!;
  const result: [Vec3, Vec3, Vec3][] = [];
  for (let i = 2; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!;
    if (Math.abs(signedArea([origin, a, b])) > epsilon) result.push([origin, a, b]);
  }
  return result;
}
