import type { Vec3 } from '../journey/types.ts';
import type { DetailBox } from './scene-details.ts';

export const SIXTH_PLATFORMS=[
  {id:'photo-shop/drying-step',min:[179.6,26.32,33.42],max:[180.6,27.42,36.32]},
  {id:'photo-shop/drying-board',min:[180.6,26.45,33.4],max:[182.2,27.91,36.3]},
  {id:'photo-shop/film-platform',min:[183.04,25.55,33.48],max:[185.44,28.67,36.22]},
] as const;

export const SIXTH_ROOM = { west:178.42, east:182.44, south:21.95, north:26.12, floor:24.92, doorSouth:23.42, doorNorth:25.64 };
const { west, east, south, north, floor, doorSouth, doorNorth } = SIXTH_ROOM;
export const SIXTH_ROOM_LAMP: Vec3 = [west + 2.73, floor + 2.36, south + 1.61];
const box = (id:string, center:Vec3, size:Vec3, material:string, solid=false):DetailBox =>
  ({ id:'photo-shop/room-'+id, center, size, material, solid });
export const SIXTH_ROOM_BOXES = [
  box('deck',[(west+east)/2,floor-.18,(north+south)/2],[east-west,.36,north-south],'lane-timber'),
  box('west',[west,floor+1.54,(north+south)/2],[.21,3.48,north-south+.12],'wood',true),
  box('north',[(west+east)/2,floor+1.54,north],[east-west+.18,3.48,.21],'temple-wood',true),
  box('south',[(west+east)/2,floor+1.54,south],[east-west+.18,3.48,.21],'wood',true),
  box('door-jamb-south',[east,floor+1.54,(doorSouth+south)/2],[.21,3.48,doorSouth-south+.10],'temple-wood',true),
  box('door-jamb-north',[east,floor+1.54,(doorNorth+north)/2],[.21,3.48,north-doorNorth+.10],'temple-wood',true),
  box('door-head',[east,floor+2.83,(doorSouth+doorNorth)/2],[.27,.33,doorNorth-doorSouth+.06],'tile-cap',true),
  box('roof',[(west+east)/2,floor+3.36,(north+south)/2],[east-west+.51,.22,north-south+.52],'temple-tile',true),
  box('chair-seat',[west+.62,floor+.46,south+3.39],[.56,.14,.64],'wood-light',true),
  box('chair-back',[west+.38,floor+.91,south+3.39],[.10,.82,.64],'temple-wood'),
  box('lamp-hook',[SIXTH_ROOM_LAMP[0],floor+2.76,SIXTH_ROOM_LAMP[2]],[.08,.48,.08],'bark'),
  box('lamp-paper',SIXTH_ROOM_LAMP,[.29,.36,.29],'paper-light'),
  ...[-.205,.205].map((offset,index)=>box('lamp-cap-'+index,[SIXTH_ROOM_LAMP[0],SIXTH_ROOM_LAMP[1]+offset,SIXTH_ROOM_LAMP[2]],[.34,.07,.34],'temple-wood')),
  box('picture-wall', [west+.122,floor+1.94,south+1.89],[.05,1.80,3.30],'wood-light'),
  box('empty-place',[west+1.75,floor+.008,south+2.69],[.58,.015,.56],'cedar-lining'),
  ...[-1,1].flatMap(a=>[-1,1].map(b=>box('chair-foot-'+a+'-'+b,[west+.62+a*.2,floor+.20,south+3.39+b*.24],[.10,.42,.10],'bark'))),
  box('lattice-crossbar',[west+.16,floor+2.62,south+1.88],[.10,.11,3.62],'temple-wood'),
  box('lattice-rail',[west+.16,floor+.96,south+1.88],[.10,.10,3.62],'temple-wood'),
];
export const SIXTH_ROOM_DOOR = box('closed-door',[east,floor+1.35,(doorSouth+doorNorth)/2],[.18,2.70,doorNorth-doorSouth],'lane-timber');

export function inSixthRoom([x,y,z]:Vec3) {
  return x>=west && x<=east && z>=south && z<=north && y<floor+3.32;
}
export function sixthRoomGrade(x:number,z:number,base:number) {
  const edge=Math.max(west-.42-x,x-east-.64,south-.35-z,z-north-.57,0);
  const t=Math.max(0,1-edge/.85);
  return base+(floor-.19-base)*t*t*(3-2*t);
}

export const SIXTH_STOPS={
  window:{position:[173.1,25.25,24.3] as Vec3,radius:2.25},
  tin:{position:[184.25,28.67,34.78] as Vec3,radius:1.1},
  enlarger:{position:[174.8,25.5,26.8] as Vec3,radius:1.65},
  room:{position:[west+1.75,floor,south+2.69] as Vec3,radius:1.10},
} as const;

export function sixthPortraitStage(position:Vec3) {
  const [x, , z]=SIXTH_STOPS.room.position;
  if(!inSixthRoom(position)||Math.hypot(position[0]-x,position[2]-z)>.45)return undefined;
  return {heading:-Math.PI/2-.12,distance:2.02,aimRight:.42};
}

export const SIXTH_PICTURE = { width:68, croppedWidth:55, height:29, step:.041 } as const;

/** The display has an opaque wooden back and a raised mosaic on its front. */
export function sixthPictureFrame(restored:boolean) {
  const [x,y,z]=SIXTH_STOPS.window.position;
  const {width,croppedWidth,height,step}=SIXTH_PICTURE;
  const top=y+2.22, center:Vec3=[x,top-height*step/2,z+.78];
  const size:Vec3=[(restored?width:croppedWidth)*step+.16,height*step+.16,.141];
  const pixelFace=z+.70;
  return {center,size,top,pixelFace};
}

export const SIXTH_PICTURE_BLOCKERS = [false,true].map(restored=>{
  const {center:[x,y,z],size:[width,height,depth],pixelFace}=sixthPictureFrame(restored);
  const min:Vec3=[x-width/2,y-height/2,pixelFace-.021];
  const max:Vec3=[x+width/2,y+height/2,z+depth/2];
  return {id:'photo-shop/picture-frame',min,max};
});

export type SixthStop=keyof typeof SIXTH_STOPS;
export function sixthNearby([x,y,z]:Vec3):string|null{
  for(const [id,{position,radius}] of Object.entries(SIXTH_STOPS)){
    if(Math.hypot(x-position[0],z-position[2])>radius)continue;
    if(id==='tin'&&(y<position[1]-.08||y>position[1]+.27))continue;
    if(id==='room'&&!inSixthRoom([x,y,z]))continue;
    if(id!=='tin'&&Math.abs(y-position[1])>1.45)continue;
    return `sixth:${id}`;
  }
  return null;
}
