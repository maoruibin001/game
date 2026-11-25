import { describe, expect, it } from 'vitest';
import { createRoadRouteEstimator, estimateRoadJourney } from '../road-route-distance.ts';
import { terrainHeight, type Route } from '../../shanye-world/world-layout.ts';

describe('road-based photo outing ETA', () => {
  it('follows bends and splits a true mid-segment junction rather than measuring a straight line', () => {
    const routes: Route[] = [
      { id: 'bend', title: '', width: 4, points: [[0, 0, 0], [0, 0, 100], [100, 0, 100]] },
      { id: 'branch', title: '', width: 4, points: [[50, 0, 100], [50, 0, 200]] },
    ];
    const result = createRoadRouteEstimator(routes)([0, 0, 20], [50, 0, 200], 5);
    expect(result.distanceMeters).toBeCloseTo(230);
    expect(result.etaSeconds).toBeCloseTo(46);
    expect(result.routeIds).toEqual(['bend', 'branch']);
    expect(result.points).toContainEqual([0, 0, 100]);
    expect(result.points).toContainEqual([50, 0, 100]);
  });
  it('includes approach distance and does not join roads that cross at different elevations', () => {
    const routes: Route[] = [
      { id: 'a', title: '', width: 4, points: [[0, 0, 0], [100, 0, 0]] },
      { id: 'b', title: '', width: 4, points: [[50, 20, 0], [50, 20, 100]] },
    ];
    const estimate = createRoadRouteEstimator(routes);
    expect(estimate([10, 0, 3], [90, 0, 4]).distanceMeters).toBeCloseTo(87);
    expect(estimate([0, 0, 0], [50, 20, 100]).distanceMeters).toBe(Infinity);
  });
  it('connects all four real viewpoints using existing world roads without a synthetic shortcut', () => {
    const origin = [2, terrainHeight(2, -214), -214] as const;
    for (const [x, z] of [[-170, -49.5], [155, -3], [64, 204]]) {
      const target = [x!, terrainHeight(x!, z!), z!] as const, route = estimateRoadJourney(origin, target);
      expect(Number.isFinite(route.distanceMeters)).toBe(true);
      expect(route.distanceMeters).toBeGreaterThan(Math.hypot(x! - 2, z! + 214));
      expect(route.routeIds.length).toBeGreaterThan(0);
      expect(route.points.at(-1)).toEqual(target);
    }
    expect(estimateRoadJourney(origin, origin)).toMatchObject({ distanceMeters: 0, etaSeconds: 0 });
  });
});
