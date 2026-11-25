import {closestLens} from '../shared/photography-contract.ts';
import { framedPhotoCamera, projectAnchor } from '../controller/geometry.ts';
import type { AnchorShape, TravelStatus, Vec3 } from '../controller/types.ts';
import type { AreaId, PhotoObservation, Pose } from '../journey/types.ts';
import { CLIFF_PINE, CLIFF_PINE_PROXIES, ridgeArrow } from '../shanye-world/scene-details.ts';
import { HERO_MOUNTAIN_BOXES } from '../shanye-world/hero-mountain.ts';
import { FOREST_CHIME_PROXY_IDS, POSTAL_ARROW, POSTAL_ARROW_PROXIES } from '../shanye-world/forest-composition.ts';
import { DISCOVERIES, INTERACTIONS, LANDMARKS, PHOTO_ANCHORS, terrainHeight, traceSegment } from '../shanye-world/world-layout.ts';
import type { PhotoSceneRecord } from '../shared/photography-contract.ts';
import type { EnvironmentSnapshot } from '../environment/weather.ts';

// The rendered mountain union and its colliders share this exact authored box list.
// A first hit on the target itself is its visible surface, not an intervening wall.
const mountainProxies=new Set(HERO_MOUNTAIN_BOXES.map((_,index)=>`distant-crag-${index}`));

export function areaAt(position: Vec3): AreaId {
  const [x,,z]=position;
  if(z>155)return 'ridge';
  if(z<-140&&x>-85)return 'post';
  if(x< -65)return 'forest';
  if(x>65)return 'town';
  let result:AreaId='post',distance=Infinity;
  for(const [id,landmark] of Object.entries(LANDMARKS)) {
    const d=Math.hypot(x-landmark.position[0],z-landmark.position[2]);
    if(d<distance){result=id as AreaId;distance=d;}
  }
  return result;
}
export function poseFromController(status:TravelStatus):Pose {
  return {position:[...status.position],yaw:status.yaw,pitch:status.pitch,area:areaAt(status.position)};
}
/** Snapshot only applied native-controller/environment facts at the final shutter. */
export function photoSceneFrom(status:TravelStatus,environment:EnvironmentSnapshot):PhotoSceneRecord {
  const settings=status.photography.settings;
  const camera=framedPhotoCamera(status.camera,settings.framing);
  return {
    weather:environment.weather,weatherBlend:environment.blend,mode:settings.mode,lens:settings.zoom===undefined?settings.lens:closestLens(status.camera.verticalFovRadians),
    exposure:environment.exposure,pose:settings.pose,
    camera:{position:[...camera.position],forward:[...camera.forward],verticalFovRadians:camera.verticalFovRadians,aspect:camera.aspect},
    subject:{position:[...status.position],yaw:status.facingYaw,visible:status.avatarVisible&&status.photography.subjectVisible},
  };
}
export function nearestInteraction(position:Vec3):string|null {
  let nearest:string|null=null,score=Infinity;
  for(const item of [...INTERACTIONS,...DISCOVERIES.map(d=>({...d,id:`discover:${d.id}`}))]) {
    const distance=Math.hypot(position[0]-item.position[0],position[2]-item.position[2]);
    if(distance<=item.radius&&Math.abs(position[1]-item.position[1])<5&&distance<score){nearest=item.id;score=distance;}
  }
  return nearest;
}
/** Visibility is traced to each actual subject; only that subject's own proxy may be ignored. */
export function observePhoto(status:TravelStatus):PhotoObservation {
  const area=areaAt(status.position),vantageTags:string[]=[];
  const project=(shape:AnchorShape,targetProxy?:string|ReadonlySet<string>)=>projectAnchor(status.camera,shape,0,(from,to,clearance)=>{
    const hit=traceSegment(from,to,clearance);
    const subjectHit=typeof targetProxy==='string'?hit.obstacle===targetProxy:hit.obstacle!==undefined&&targetProxy?.has(hit.obstacle);
    if(subjectHit)return {hit:false,point:to,distance:Math.hypot(to[0]-from[0],to[1]-from[1],to[2]-from[2]),fraction:1};
    return hit;
  });
  for(const id of ['forest','town'] as const){
    const zone=PHOTO_ANCHORS[id];
    if(Math.hypot(status.position[0]-zone.zone[0],status.position[2]-zone.zone[2])<=zone.zoneRadius&&Math.abs(status.position[1]-zone.zone[1])<7)vantageTags.push(`${id}-view`);
  }
  const anchors:PhotoObservation['anchors']={};
  if(area==='forest'||area==='post') {
    anchors.windmill=project({...PHOTO_ANCHORS.forest.anchors.windmill,right:[1,0,0]},'windmill-tower');
    if (area==='forest') anchors['postal-arrow']=project({...POSTAL_ARROW,right:[1,0,0]},POSTAL_ARROW_PROXIES);
    anchors['forest-chime']=project({...PHOTO_ANCHORS.forest.anchors.chime,right:[1,0,0]},FOREST_CHIME_PROXY_IDS);
  }
  if(area==='town') {
    anchors['stone-arch']=project({...PHOTO_ANCHORS.town.anchors.arch,right:[1,0,0]});
    anchors.mountain=project({position:PHOTO_ANCHORS.town.anchors.mountain.position,size:[24,12,12]},mountainProxies);
    anchors['red-mailbox']=project({position:PHOTO_ANCHORS.town.anchors.mailbox.position,size:[1.7,2.6,1.3]});
  }
  const valley=PHOTO_ANCHORS.valley,{minX,maxX,minZ,maxZ}=valley.bounds,[x,,z]=status.position;
  if(x>=minX&&x<=maxX&&z>=minZ&&z<=maxZ){
    // The region offers a clue, not a completion condition. Both real subjects
    // must still fit the current camera and survive terrain/scene occlusion.
    // From the north the tower is visible; its south-facing sails sit behind it.
    // The town subject is the east house's actual red roof, never the whole town.
    vantageTags.push('valley-letter-view');
    anchors['ridge-arrow']=project(ridgeArrow(terrainHeight), 'ridge-sign/board');
    anchors['cliff-pine']=project(CLIFF_PINE,CLIFF_PINE_PROXIES);
    anchors['memory-windmill']=project(valley.anchors.windmill,valley.anchors.windmill.proxy);
    anchors['memory-town']=project(valley.anchors.townRoof,valley.anchors.townRoof.proxy);
  }
  // The authored post-office door does not face the windmill. The tutorial accepts
  // a real free photograph; no fabricated post-overlook composition is supplied.
  return {area,vantageTags,anchors};
}
