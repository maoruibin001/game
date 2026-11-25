import { LOCAL_ROUTES, ROUTES, SIDE_ROUTES, type Route, type Vec3 } from '../shanye-world/world-layout.ts';

export interface RoadJourney {
  /** Metres along the existing road graph plus the two short approaches. */
  distanceMeters: number;
  etaSeconds: number;
  points: readonly Vec3[];
  /** Just the connected road segments, without straight off-road approaches. */
  roadPoints: readonly Vec3[];
  routeIds: readonly string[];
  estimated: true;
}
interface Segment { a: Vec3; b: Vec3; routeId: string }
interface Edge { to: number; distance: number; routeId: string }
const length = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
function project(p: Vec3, s: Segment) {
  const dx = s.b[0] - s.a[0], dz = s.b[2] - s.a[2];
  const t = Math.max(0, Math.min(1, ((p[0] - s.a[0]) * dx + (p[2] - s.a[2]) * dz) / (dx * dx + dz * dz)));
  const point: Vec3 = [s.a[0] + dx * t, s.a[1] + (s.b[1] - s.a[1]) * t, s.a[2] + dz * t];
  return { point, t, distance: length(p, point) };
}

/** Read the same authored polylines used by the path mesh; no second map manifest. */
export function createRoadRouteEstimator(routes: readonly Route[] = [...ROUTES, ...SIDE_ROUTES, ...LOCAL_ROUTES]) {
  const segments: Segment[] = routes.flatMap(r => r.points.slice(1).map((b, i) => ({ a: r.points[i]!, b, routeId: r.id })))
    .filter(s => Math.hypot(s.a[0] - s.b[0], s.a[2] - s.b[2]) > 1e-6);
  const basePoints: Vec3[] = [];
  const index = (p: Vec3) => { const n = basePoints.findIndex(q => length(p, q) < .001); if (n >= 0) return n; return basePoints.push(p) - 1; };
  for (const s of segments) { index(s.a); index(s.b); }
  // Split at shared authored vertices, including the town side-lane node on
  // the middle of the uphill segment and the courtyard's overlapping paving.
  const cuts = segments.map(s => basePoints.flatMap((p, node) => {
    const hit = project(p, s); return hit.distance < .05 ? [{ node, t: hit.t }] : [];
  }).sort((a, b) => a.t - b.t));

  return (from: Vec3, to: Vec3, walkingSpeed = 6.8): RoadJourney => {
    if (![...from, ...to].every(Number.isFinite)) throw new Error('Road estimates require finite world feet positions');
    if (!Number.isFinite(walkingSpeed) || walkingSpeed <= 0) throw new Error('Road estimates require a positive walking speed');
    if (length(from, to) < .01) return { distanceMeters: 0, etaSeconds: 0, points: [from], roadPoints: [], routeIds: [], estimated: true };
    if (!segments.length) return { distanceMeters: Infinity, etaSeconds: Infinity, points: [], roadPoints: [], routeIds: [], estimated: true };
    const nearest = (p: Vec3) => segments.map((s, i) => ({ ...project(p, s), segment: i })).sort((a, b) => a.distance - b.distance)[0]!;
    const start = nearest(from), finish = nearest(to);
    const points: Vec3[] = [...basePoints, start.point, finish.point];
    const startId = basePoints.length, finishId = startId + 1;
    const adjacency: Edge[][] = points.map(() => []);
    segments.forEach((s, i) => {
      const nodes = [...cuts[i]!];
      if (i === start.segment) nodes.push({ node: startId, t: start.t });
      if (i === finish.segment) nodes.push({ node: finishId, t: finish.t });
      nodes.sort((a, b) => a.t - b.t);
      for (let j = 1; j < nodes.length; j++) {
        const a = nodes[j - 1]!.node, b = nodes[j]!.node, distance = length(points[a]!, points[b]!);
        adjacency[a]!.push({ to: b, distance, routeId: s.routeId }); adjacency[b]!.push({ to: a, distance, routeId: s.routeId });
      }
    });
    const distance = points.map(() => Infinity), previous = points.map(() => -1), via = points.map(() => ''), visited = new Set<number>();
    distance[startId] = 0;
    for (;;) {
      let current = -1;
      for (let i = 0; i < points.length; i++) if (!visited.has(i) && (current < 0 || distance[i]! < distance[current]!)) current = i;
      if (current < 0 || !Number.isFinite(distance[current]) || current === finishId) break;
      visited.add(current);
      for (const edge of adjacency[current]!) if (distance[current]! + edge.distance < distance[edge.to]!) {
        distance[edge.to] = distance[current]! + edge.distance; previous[edge.to] = current; via[edge.to] = edge.routeId;
      }
    }
    if (!Number.isFinite(distance[finishId])) return { distanceMeters: Infinity, etaSeconds: Infinity, points: [], roadPoints: [], routeIds: [], estimated: true };
    const nodes: number[] = []; for (let n = finishId; n >= 0; n = previous[n]!) { nodes.unshift(n); if (n === startId) break; }
    const total = start.distance + distance[finishId]! + finish.distance;
    const roadPoints = nodes.map(n => points[n]!).filter((p, i, all) => i === 0 || length(p, all[i - 1]!) > .01);
    const routePoints = [from, ...roadPoints, to].filter((p, i, all) => i === 0 || length(p, all[i - 1]!) > .01);
    return { distanceMeters: total, etaSeconds: total / walkingSpeed, points: routePoints, roadPoints,
      routeIds: [...new Set(nodes.slice(1).map(n => via[n]!).filter(Boolean))], estimated: true };
  };
}

export const estimateRoadJourney = createRoadRouteEstimator();
