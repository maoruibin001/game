import { cross, dot, subtract } from '../controller/geometry.ts';
import type { Vec3 } from '../controller/types.ts';
import type { SourceBundle } from './pipeline-import.ts';

type Triangle = { entity: string; material: string; a: Vec3; e1: Vec3; e2: Vec3 };

/** Source meshes use the same coordinate basis as compilePipelineBundles. */
export function authoredTriangles(
  bundle: SourceBundle, entity?: string, adjustX?: (x: number, entity: string) => number,
): Triangle[] {
  const out: Triangle[] = [];
  const pivot = bundle.pivotSourceMeters, anchor = bundle.worldAnchorEngine;
  for (const mesh of bundle.meshes) {
    if (entity && mesh.entityId !== entity) continue;
    const {positions, indices} = mesh.geometry;
    const vertex = (index: number): Vec3 => {
      const x = positions[index * 3]! - pivot[0]! + anchor[0]!;
      return [adjustX ? adjustX(x, mesh.entityId) : x,
        positions[index * 3 + 2]! - pivot[2]! + anchor[1]!,
        -(positions[index * 3 + 1]! - pivot[1]!) + anchor[2]!];
    };
    for (let i = 0; i < indices.length; i += 3) {
      const a = vertex(indices[i]!);
      out.push({entity:mesh.entityId, material:mesh.geometry.material.id, a,
        e1:subtract(vertex(indices[i + 1]!), a), e2:subtract(vertex(indices[i + 2]!), a)});
    }
  }
  return out;
}

/** First actual authored surface along a finite segment. */
export function firstAuthoredSurface(triangles: readonly Triangle[], origin: Vec3, destination: Vec3): { entity: string; material: string; point: Vec3; fraction: number } | null {
  const direction = subtract(destination, origin);
  let first: Triangle | undefined, fraction = Infinity;
  for (const triangle of triangles) {
    const h = cross(direction, triangle.e2), determinant = dot(triangle.e1, h);
    if (Math.abs(determinant) < 1e-8) continue;
    const inverse = 1 / determinant, s = subtract(origin, triangle.a), u = inverse * dot(s, h);
    if (u < -1e-8 || u > 1 + 1e-8) continue;
    const q = cross(s, triangle.e1), v = inverse * dot(direction, q);
    if (v < -1e-8 || u + v > 1 + 1e-8) continue;
    const t = inverse * dot(triangle.e2, q);
    if (t >= 0 && t <= 1 && t < fraction) { first = triangle; fraction = t; }
  }
  return first ? { entity: first.entity, material: first.material, fraction,
    point: [origin[0] + direction[0] * fraction, origin[1] + direction[1] * fraction, origin[2] + direction[2] * fraction] } : null;
}
