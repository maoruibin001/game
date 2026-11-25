import type { AABB, Vec3 } from './world-layout.ts';

/** Local staging shared by the physical interaction and the photographed world. */
export const TOWN_POSTBOX_SHIFT = [-1.25, 0, 1.5] as const;

/** The hinged bridge remains visibly raised and impassable before the photograph. */
export const TOWN_BRIDGE_REST_ANGLE = -Math.PI * 0.18;
/** Finished faces of the imported bridge in its lowered pose. */
export const TOWN_BRIDGE_DECK = { west:152, east:158, south:24.25, north:30.75, y:24.25 };
// Whole fine terrain cells and vertices beyond the visible boards keep the
// shoulders from interpolating back up through a moving foreground edge.
export const TOWN_BRIDGE_BED = { west:151, east:159, south:24, north:31, ceiling:24 };


// The planter used to occupy the middle of the road behind the stone arch.
export const TOWN_PLANTER_SHIFT = [-4.75, 0, 0] as const;

const shiftPlanter = ([x, y, z]: Vec3): Vec3 => [
  x + TOWN_PLANTER_SHIFT[0], y + TOWN_PLANTER_SHIFT[1], z + TOWN_PLANTER_SHIFT[2],
];
const planterBox = (id: string, min: Vec3, max: Vec3): AABB => ({
  id: `town-planter-${id}`, min: shiftPlanter(min), max: shiftPlanter(max),
});
const planterBase = planterBox('base', [153,24,17], [157,24.75,20]);

// Preserve the visible hollow above the moss between the rim and the blooms.
export const TOWN_PLANTER_SOLIDS: readonly AABB[] = [
  planterBase,
  planterBox('west-rim', [153,24.75,17], [153.5,25,20]),
  planterBox('east-rim', [156.5,24.75,17], [157,25,20]),
  planterBox('south-rim', [153.5,24.75,17], [156.5,25,17.5]),
  planterBox('north-rim', [153.5,24.75,19.5], [156.5,25,20]),
  ...[153.75,154.75,155.75].map((x, i) =>
    planterBox(`bloom-${i+1}`, [x,25,18.5], [x+.5,25.5,19.25])),
];

export function clearPlanterOnRestore(position: Vec3): Vec3 {
  const [x, y, z] = position;
  const { min, max } = planterBase;
  const clearance = .30;
  if (x <= min[0]-clearance || x >= max[0]+clearance ||
      z <= min[2]-clearance || z >= max[2]+clearance) return position;
  // An old save may now overlap the planter. Exit toward the street at the
  // same depth, so the restore never moves a player through the gate.
  return [max[0]+clearance, y, z];
}
