import { distance, projectAnchor } from '../controller/geometry.ts';
import type { CameraPose, TraceSegment, Vec3 } from '../controller/types.ts';
import { authoredTriangles, firstAuthoredSurface } from './authored-triangles.ts';
import { SOURCE_BUNDLES } from './pipeline-sources.ts';

/** Existing northern door frame and porch fascia, not the old windmill portal.
 * Samples sit 5cm behind actual front faces so a ray must meet authored timber. */
export const POST_PORCH_PHOTO = Object.freeze({
  bounds: { minX: -9, maxX: 9, minZ: -225, maxZ: -205 },
  feetHeight: 14, maxFeetHeightDelta: 3,
  view: { feet: [2, 14.08, -214] as Vec3, target: [-3, 16.4, -231] as Vec3 },
  door: { position: [-3, 15.625, -232.25] as Vec3, size: [2, 2.25, 0] as Vec3, right: [1, 0, 0] as Vec3,
    entity: 'post_office', samples: [[-3, 16.625, -232.3], [-3.875, 15.625, -232.3], [-2.125, 15.625, -232.3]] as readonly Vec3[] },
  eave: { position: [-3, 17.875, -229] as Vec3, size: [9, .25, 0] as Vec3, right: [1, 0, 0] as Vec3,
    entity: 'post_porch', samples: [[-3, 17.875, -229.05], [-6, 17.875, -229.05], [0, 17.875, -229.05]] as readonly Vec3[] },
});

// Keep every postal surface as an occluder, including the rescaled gate.
const triangles = authoredTriangles(SOURCE_BUNDLES.find(b => b.id === 'post-office')!, undefined,
  (x, entity) => entity === 'postal_portal' ? 9.75 + (x - 9.75) * 1.35 : x);

export function firstPostSurface(origin: Vec3, destination: Vec3) {
  return firstAuthoredSurface(triangles, origin, destination);
}

/** Ray-check real frame surfaces rather than tracing only through a hollow door. */
export function projectPostSubject(camera: CameraPose, subject: typeof POST_PORCH_PHOTO.door | typeof POST_PORCH_PHOTO.eave, trace: TraceSegment) {
  const projected = projectAnchor(camera, subject);
  const visibleSamples = subject.samples.filter(sample => {
    const surface = firstPostSurface(camera.position, sample);
    if (!surface || surface.entity !== subject.entity || distance(surface.point, sample) > .15) return false;
    const obstruction = trace(camera.position, surface.point, .025);
    return !obstruction.hit || distance(obstruction.point, surface.point) <= .15;
  }).length;
  const occluded = visibleSamples < subject.samples.length;
  return { ...projected, occluded, visibleFraction: projected.visibleFraction * visibleSamples / subject.samples.length,
    visible: projected.visible && !occluded };
}
