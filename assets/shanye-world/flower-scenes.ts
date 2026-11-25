import { COMMISSION_STOPS, type CommissionStop, type FlowerSubject } from '../journey/flower-catalog.ts';
import { distance, projectAnchor } from '../controller/geometry.ts';
import type { TravelStatus } from '../controller/types.ts';
import { FOREST_PHOTO } from './forest-composition.ts';
import { VoxelMesh } from './voxel-mesh.ts';
import { terrainHeight, traceSegment, type Vec3 } from './world-layout.ts';

const plant = (x:number,z:number,height:number):Vec3=>[x,terrainHeight(x,z)+height,z];
const vane = [-174.5,43,-44.8] as const;
const wheatSign=[141.2,23.93,-41.7] as const;
const route= [145.4,23.25,-38.6] as const;
const moon=[134.55,26.1,-20.8] as const;
const moonShadow=[136.23,25.85,-22.55] as const;

export function nearestFlowerStop(position:Vec3,marketOpen:boolean):string|null {
  let best=Infinity,id:CommissionStop|undefined;
  for(const [stop,place] of Object.entries(COMMISSION_STOPS)){
    if(stop==='moon-riddle'&&!marketOpen)continue;
    const delta=distance(position,plant(place.x,place.z,0));
    if(delta<=place.radius&&delta<best){best=delta;id=stop as CommissionStop;}
  }
  return id?`flower:${id}`:null;
}

export function photographedFlowerSubjects(status:TravelStatus,camera:TravelStatus['camera'],night:boolean):FlowerSubject[]{
  if(status.mode!=='photo')return [];
  const [x,,z]=status.position, subjects:FlowerSubject[]=[];
  const visible=(position:Vec3,size:Vec3,minWidth:number,proxy?:string)=>{
    const frame=projectAnchor(camera,{position,size},0,(from,to,clearance)=>{
      const hit=traceSegment(from,to,clearance);
      return proxy&&hit.obstacle?.startsWith(proxy)?{hit:false,point:to,distance:distance(from,to),fraction:1}:hit;
    });
    return frame.depth>0&&!frame.occluded&&frame.visibleFraction>.82&&frame.width>=minWidth;
  };
  if(Math.hypot(x+174,z+49)<24 && visible(vane,[1.28,.62,.52],.025)
    && visible(FOREST_PHOTO.anchors.windmill.position,FOREST_PHOTO.anchors.windmill.size,.10,'windmill'))subjects.push('silver');
  if(Math.hypot(x-140,z+42)<17&&visible(wheatSign,[1.35,.65,.19],.029)
    &&visible(route,[2.5,.2,1.3],.042))subjects.push('wheat');
  if(Math.hypot(x-159.6,z-76.5)<20 && visible(plant(155.6,72.35,4),[2.2,1.2,2.2],.045)
    &&visible([171,31,22],[7,3,8],.055,'town-house-east')
    &&visible([125,terrainHeight(125,-360)+2,-360],[25,3,8],.02))subjects.push('pine');
  if(night&&Math.hypot(x-134.7,z+20)<8&&visible(moon,[.64,.84,.20],.044)&&visible(moonShadow,[.68,.9,.20],.044))subjects.push('moon');
  return subjects;
}

export function flowerSceneMeshes(field:VoxelMesh){
  const lamps=new VoxelMesh();
  for(const [id,stop] of Object.entries(COMMISSION_STOPS)){
    if(id==='moon-riddle')continue;
    const [x,y,z]=plant(stop.x,stop.z,0);
    if (id === 'forest-request' || id === 'ridge-request') {
      // Both original commission triggers stay at their authored positions.
      field.box([x, y - .012, z], [.46, .06, .34], 'stone-jade');
      field.box([x, y + .024, z], [.32, .012, .19], 'temple-wood');
      field.box([x, y + .035, z], [.17, .010, .10], 'weathered-brass');
      continue;
    }
    field.box([x,y+.46,z],[.12,.92,.12],'temple-wood');
    field.box([x,y+.92,z],[.62,.34,.25],'wood-light');
    field.box([x,y+1.1,z],[.73,.11,.31],'red');
    field.box([x,y+.92,z+.133],[.25,.16,.022],'cream');
    field.box([x,y+.92,z-.133],[.25,.16,.022],'cream');
  }
  const [vx,vy,vz]=vane;
  field.box([vx,40.45,vz],[.137,4.74,.137],'temple-wood');
  field.box([vx,vy-.04,vz],[1.48,.09,.105],'bell-bronze');
  field.box([vx+.49,vy+.15,vz],[.31,.27,.14],'bell-gold');
  field.box([vx-.49,vy+.07,vz],[.34,.17,.14],'red');
  const [wx,wy,wz]=wheatSign;
  field.box([wx,wy-.7,wz],[.12,1.46,.17],'temple-wood');
  field.box([wx,wy,wz],[1.43,.46,.13],'wood-light');
  for(const side of [-1,1])field.box([wx+.1,wy+.05,wz+side*.079],[.89,.085,.025],'red');
  const [tx,ty,tz]=plant(155.6,72.35,0);
  field.box([tx,ty+2.3,tz],[.34,4.6,.29],'bark');
  for(const [dx,dy,dz,width] of [[0,4.6,0,2.5],[.59,4.1,-.32,1.4],[-.5,3.78,.55,1.47],[.08,5.28,0,1.36]] as const)
    field.box([tx+dx,ty+dy,tz+dz],[width,.60,width*.85],'pine');
  const [mx,my,mz]=moon,[sx,sy,sz]=moonShadow;
  lamps.box([mx,my-.83,mz],[.11,1.6,.11],'bark');
  lamps.box([sx,sy,sz-.10],[1.8,2.50,.16],'cream');
  for(const [cx,cy,cz,mat] of [[mx,my,mz,'night-paper'],[sx,sy,sz,'temple-wood']] as const){
    for(let i=0;i<13;i++){
      const angle=.64+i*.39;
      lamps.box([cx+Math.cos(angle)*.32,cy+Math.sin(angle)*.41,cz],[.17,.13,.09],mat);
    }
  }
  return lamps;
}
