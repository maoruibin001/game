import { LOCAL_ROUTES, ROUTES, SIDE_ROUTES, STATIC_OBSTACLES, WORLD, terrainHeight, traceSegment, visiblePathWidth, type AABB, type Vec3, type SegmentTrace } from './world-layout.ts';

export interface TravelSafetyFlags { gateOpen:boolean; bridgeWalkable:boolean }
export interface RecoveryPoint { position:Vec3; yaw:number; routeId:string }

const GATE:AABB={id:'town-closed-gate',min:[152,24,9.7],max:[158,33,10.3]};
// The raised deck reclines north from the same hinge and blocks the closed crossing.
const BRIDGE:AABB={id:'town-raised-bridge',min:[152,23.5,24.2],max:[158,29.5,30]};
/** Movement and recovery use the same physical stateful blockers. */
export function travelBlockers(flags:TravelSafetyFlags):readonly AABB[]{
 return [...(flags.gateOpen?[]:[GATE]),...(flags.bridgeWalkable?[]:[BRIDGE])];
}

/** Camera traces see the same currently closed gate / raised bridge as feet. */
export function traceTravelSegment(origin:Vec3,destination:Vec3,flags:TravelSafetyFlags,clearance=.15,viewOccluders:readonly AABB[]=[]):SegmentTrace{
 const base=traceSegment(origin,destination,clearance),d:Vec3=[destination[0]-origin[0],destination[1]-origin[1],destination[2]-origin[2]];
 let fraction=base.fraction,obstacle=base.obstacle;
 for(const box of [...travelBlockers(flags),...viewOccluders]){
  let near=0,far=1;
  for(let axis=0;axis<3;axis++){
   if(Math.abs(d[axis]!)<1e-8){if(origin[axis]!<box.min[axis]!-clearance||origin[axis]!>box.max[axis]!+clearance){near=2;break;}}
   else{
    let entry=(box.min[axis]!-clearance-origin[axis]!)/d[axis]!,exit=(box.max[axis]!+clearance-origin[axis]!)/d[axis]!;
    if(entry>exit)[entry,exit]=[exit,entry];near=Math.max(near,entry);far=Math.min(far,exit);
   }
  }
  if(near<=far&&near<fraction&&far>=0){fraction=Math.max(0,near);obstacle=box.id;}
 }
 return {hit:fraction<1,point:[origin[0]+d[0]*fraction,origin[1]+d[1]*fraction,origin[2]+d[2]*fraction],distance:Math.hypot(...d)*fraction,fraction,obstacle};
}

const RADIUS=.35,HEIGHT=1.8,SPACING=.7,GRID=2;
const ALL_ROUTES=[...ROUTES,...SIDE_ROUTES,...LOCAL_ROUTES];
const finite=(p:Vec3)=>p.every(Number.isFinite);
const key=(x:number,z:number)=>`${Math.floor(x/GRID)}/${Math.floor(z/GRID)}`;
const dist=(a:Vec3,b:Vec3)=>Math.hypot(a[0]-b[0],a[2]-b[2]);

/** Conservative rescue policy: a rescue is never a way to unlock the town or its
 * north courtyard. The east hillside remains reachable through the ridge loop. */
function permittedRegion(p:Vec3,flags:TravelSafetyFlags):boolean{
 if(!flags.gateOpen&&p[0]>=137&&p[0]<=184&&p[2]>=9.4&&p[2]<=63)return false;
 if(!flags.bridgeWalkable&&p[0]>=140&&p[0]<=162&&p[2]>=26&&p[2]<=62)return false;
 return true;
}

function sameApproachSide(candidate:Vec3,origin:Vec3,flags:TravelSafetyFlags):boolean{
 // A player who slipped into the still-locked local area goes back to its approach,
 // even if the ridge-connected road on the far side happens to be closer in XZ.
 if(!flags.gateOpen&&origin[0]>=137&&origin[0]<=184&&origin[2]>=-10&&origin[2]<=63&&candidate[2]>9.35)return false;
 if(!flags.bridgeWalkable&&origin[0]>=140&&origin[0]<=162&&origin[2]>=24&&origin[2]<=62&&candidate[2]>23.8)return false;
 return true;
}

function groundClear(p:Vec3,flags:TravelSafetyFlags):boolean{
 if(!finite(p)||Math.abs(p[0])>389||Math.abs(p[2])>389||!permittedRegion(p,flags))return false;
 const floor=terrainHeight(p[0],p[2]);
 if(!Number.isFinite(floor)||Math.abs(p[1]-floor)>.12)return false;
 for(const [dx,dz]of [[RADIUS,0],[-RADIUS,0],[0,RADIUS],[0,-RADIUS],[.25,.25],[-.25,.25],[.25,-.25],[-.25,-.25]]){
  // Keep the complete capsule on a stable tread, away from steep column edges.
  if(Math.abs(terrainHeight(p[0]+dx!,p[2]+dz!)-floor)>.55)return false;
 }
 for(const b of [...STATIC_OBSTACLES,...travelBlockers(flags)]){
  if(p[1]+HEIGHT>b.min[1]&&p[1]<b.max[1]&&p[0]+RADIUS>b.min[0]&&p[0]-RADIUS<b.max[0]&&p[2]+RADIUS>b.min[2]&&p[2]-RADIUS<b.max[2])return false;
 }
 return true;
}

function walkableLink(a:Vec3,b:Vec3,flags:TravelSafetyFlags):boolean{
 const steps=Math.ceil(dist(a,b)/.2);let previous=a[1];
 for(let i=1;i<=steps;i++){
  const t=i/steps,x=a[0]+(b[0]-a[0])*t,z=a[2]+(b[2]-a[2])*t,p:Vec3=[x,terrainHeight(x,z),z];
  if(Math.abs(p[1]-previous)>.6||!groundClear(p,flags))return false;
  previous=p[1];
 }
 return true;
}

interface Node extends RecoveryPoint { adjacent:number[]; halfWidth:number }
interface RoadGraph { nodes:Node[]; reachable:Set<number>; cells:Map<string,number[]> }
const graphs=new Map<string,RoadGraph>();

/** Only connected, bidirectionally walkable paving is eligible. This rules out a
 * superficially clear node cut off by a wall, a step, or the current gate state. */
function roadGraph(flags:TravelSafetyFlags):RoadGraph{
 const cacheKey=`${flags.gateOpen}:${flags.bridgeWalkable}`,cached=graphs.get(cacheKey);if(cached)return cached;
 const nodes:Node[]=[],cells=new Map<string,number[]>();
 for(const route of ALL_ROUTES)for(let i=1;i<route.points.length;i++){
  const a=route.points[i-1]!,b=route.points[i]!,length=dist(a,b),steps=Math.ceil(length/SPACING),yaw=Math.atan2(b[0]-a[0],-(b[2]-a[2]));
  for(let j=0;j<=steps;j++){
   const t=j/steps,x=a[0]+(b[0]-a[0])*t,z=a[2]+(b[2]-a[2])*t,position:Vec3=[x,terrainHeight(x,z),z];
   if(!groundClear(position,flags))continue;
   const index=nodes.length;nodes.push({position,yaw,routeId:route.id,adjacent:[],halfWidth:visiblePathWidth({route:route.id,width:route.width})*.5});
   const cellKey=key(x,z),bucket=cells.get(cellKey)??[];bucket.push(index);cells.set(cellKey,bucket);
  }
 }
 for(let i=0;i<nodes.length;i++){
  const a=nodes[i]!,cx=Math.floor(a.position[0]/GRID),cz=Math.floor(a.position[2]/GRID);
  for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(const j of cells.get(`${cx+dx}/${cz+dz}`)??[]){
   if(j<=i)continue;const b=nodes[j]!;
   if(dist(a.position,b.position)>1||Math.abs(a.position[1]-b.position[1])>.6||!walkableLink(a.position,b.position,flags))continue;
   a.adjacent.push(j);b.adjacent.push(i);
  }
 }
 // There is a four-metre level approach between the town-low junction and the
 // first courtyard paving strip. Validate that real walk before linking it;
 // distance-only neighbor joins would incorrectly jump gaps elsewhere.
 const approach=nodes.findIndex(n=>dist(n.position,[155,24,20])<.01);
 const courtyard=nodes.findIndex(n=>n.routeId==='town-courtyard'&&dist(n.position,[155,24,24])<.01);
 if(approach>=0&&courtyard>=0&&walkableLink(nodes[approach]!.position,nodes[courtyard]!.position,flags)){
  nodes[approach]!.adjacent.push(courtyard);nodes[courtyard]!.adjacent.push(approach);
 }
 // The high porch paving contains the authored spawn. It is the graph root,
 // not an arbitrary point on the far side of a lock selected by Euclidean distance.
 let seed=-1,nearest=1;
 for(let i=0;i<nodes.length;i++){const d=dist(nodes[i]!.position,WORLD.spawn);if(d<nearest&&walkableLink(WORLD.spawn,nodes[i]!.position,flags)){nearest=d;seed=i;}}
 const reachable=new Set<number>(),queue=seed<0?[]:[seed];if(seed>=0)reachable.add(seed);
 for(let at=0;at<queue.length;at++)for(const next of nodes[queue[at]!]!.adjacent)if(!reachable.has(next)){reachable.add(next);queue.push(next);}
 const graph={nodes,reachable,cells};graphs.set(cacheKey,graph);return graph;
}

function nearbyRoad(p:Vec3,flags:TravelSafetyFlags):Node|undefined{
 const graph=roadGraph(flags),cx=Math.floor(p[0]/GRID),cz=Math.floor(p[2]/GRID);let best:Node|undefined,bestDistance=Infinity;
 for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(const index of graph.cells.get(`${cx+dx}/${cz+dz}`)??[]){
  if(!graph.reachable.has(index))continue;const node=graph.nodes[index]!,distance=dist(p,node.position);
  if(distance>node.halfWidth-RADIUS||distance>=bestDistance||!walkableLink(p,node.position,flags))continue;
  best=node;bestDistance=distance;
 }
 return best;
}

/** Suitable for caching the current session's last grounded road pose. */
export function isSafeRoadPose(position:Vec3,flags:TravelSafetyFlags):boolean{
 return groundClear(position,flags)&&!!nearbyRoad(position,flags);
}

/** Prefer a nearby previously walked foothold; otherwise choose the nearest safe
 * node in the spawn-connected road graph. Never trust a saved or caller-supplied Y. */
export function findRecoveryPoint(position:Vec3,flags:TravelSafetyFlags,lastSafe?:Vec3,reachable:(point:Vec3)=>boolean=()=>true):RecoveryPoint|null{
 if(lastSafe&&finite(position)&&dist(position,lastSafe)<=18&&sameApproachSide(lastSafe,position,flags)&&reachable(lastSafe)&&isSafeRoadPose(lastSafe,flags)){
  const node=nearbyRoad(lastSafe,flags)!;return {position:[lastSafe[0],terrainHeight(lastSafe[0],lastSafe[2]),lastSafe[2]],yaw:node.yaw,routeId:node.routeId};
 }
 const graph=roadGraph(flags);let best:Node|undefined,bestDistance=Infinity;
 const origin=finite(position)?position:WORLD.spawn;
 for(const index of graph.reachable){
  const node=graph.nodes[index]!;if(!sameApproachSide(node.position,origin,flags)||!reachable(node.position))continue;
  const distance=dist(origin,node.position)+Math.abs(origin[1]-node.position[1])*.2;
  if(distance<bestDistance){best=node;bestDistance=distance;}
 }
 if(best)return {position:[...best.position] as Vec3,yaw:best.yaw,routeId:best.routeId};
 if(lastSafe&&sameApproachSide(lastSafe,origin,flags)&&reachable(lastSafe)&&isSafeRoadPose(lastSafe,flags)){const node=nearbyRoad(lastSafe,flags)!;return {position:[...lastSafe] as Vec3,yaw:node.yaw,routeId:node.routeId};}
 return reachable(WORLD.spawn)&&groundClear(WORLD.spawn,flags)?{position:[...WORLD.spawn] as Vec3,yaw:WORLD.spawnYaw,routeId:'post-lookout'}:null;
}
