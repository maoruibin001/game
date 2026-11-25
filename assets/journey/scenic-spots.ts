import { SIXTH_STOPS } from '../shanye-world/sixth-layout.ts';
import { LANDMARKS, terrainHeight, type Vec3 } from '../shanye-world/world-layout.ts';
import { PHOTO_SPOTS } from './photo-outings.ts';
import type { AreaId } from './types.ts';
import { MARKET_GATE, NIGHT_STOPS } from '../shanye-world/night-layout.ts';

export const scenicFeet = (x: number, z: number): Vec3 => [x, terrainHeight(x, z), z];
interface ScenicSpot { id: string; title: string; area: AreaId; position: Vec3; beyondBridge?: true; hidden?: true }

export const SCENIC_SPOTS: readonly ScenicSpot[] = [
  { id: 'old-post', title: LANDMARKS.post.title, area: 'post', position: scenicFeet(-3, -232) },
  { id: 'forest-clearing', title: LANDMARKS.forest.title, area: 'forest', position: LANDMARKS.forest.position },
  { id: 'old-town', title: LANDMARKS.town.title, area: 'town', position: scenicFeet(155, -19) },
  { id: 'ridge-station', title: LANDMARKS.ridge.title, area: 'ridge', position: LANDMARKS.ridge.position },
  ...PHOTO_SPOTS.map(({ id, title, area, position }) => ({ id, title, area, position })),
  { id: 'ridge-arrow', title: '东岭古道 · 红箭头', area: 'ridge', position: scenicFeet(64, 204) },
  { id: 'courtyard-bell', title: '旧镇钟院', area: 'town', position: scenicFeet(155.4, 38), beyondBridge: true },
  { id: 'monastery', title: '禅院', area: 'town', position: scenicFeet(158, 93.25), beyondBridge: true },
  { id: 'flower-market', title: '花街夜市 · 18:40–06:20', area: 'town', position: scenicFeet(MARKET_GATE[0]+1, MARKET_GATE[2]) },
  { id: 'night-torch-foot', title: '山门火把架', area: 'town', position: scenicFeet(NIGHT_STOPS.footTorch.x,NIGHT_STOPS.footTorch.z), beyondBridge:true },
  { id: 'night-torch-upper', title: '上院火把架', area: 'town', position: scenicFeet(NIGHT_STOPS.upperTorch.x,NIGHT_STOPS.upperTorch.z), beyondBridge:true },
  { id: 'pine-firework', title: '半山松台 · 烟花布置点', area: 'town', position: scenicFeet(160.2,79.45), beyondBridge:true },
  { id: 'sixth-room', title: '照相铺内室', area: 'town', position: SIXTH_STOPS.room.position, hidden:true },
  { id: 'field-firework', title: '镇外晒谷场 · 烟花布置点', area: 'town', position: scenicFeet(133.5,-43.5) },
];

export const scenicSpotById = (id: string | null) => SCENIC_SPOTS.find(spot => spot.id === id);
