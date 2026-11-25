import type { Vec3 } from './types.ts';

/** Existing sheltered/bench locations, not teleport destinations. */
export const REST_POINTS = [
  { id:'post', title:'邮局廊下', position:[9.75,14.08,-230.25] as Vec3, radius:4.5 },
  { id:'forest', title:'林地木椅', position:[-180.25,38.08,-35.75] as Vec3, radius:4.5 },
  { id:'town', title:'旧镇茶亭', position:[158.5,24.08,49.5] as Vec3, radius:4.5 },
  { id:'ridge', title:'山脊歇脚亭', position:[0,96.5,235] as Vec3, radius:5 },
  { id:'cliff', title:'晚照崖长椅', position:[67.25,84.08,206.5] as Vec3, radius:3.5 },
] as const;
export function nearbyRestPoint(position:Vec3,townReady=true){
  return REST_POINTS.filter(p=>(p.id!=='town'||townReady)&&Math.abs(position[1]-p.position[1])<3
    &&Math.hypot(position[0]-p.position[0],position[2]-p.position[2])<=p.radius)
    .sort((a,b)=>Math.hypot(position[0]-a.position[0],position[2]-a.position[2])-Math.hypot(position[0]-b.position[0],position[2]-b.position[2]))[0];
}
