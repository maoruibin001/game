import { SIXTH_PICTURE, SIXTH_PLATFORMS, SIXTH_ROOM, SIXTH_ROOM_BOXES, SIXTH_ROOM_DOOR, SIXTH_STOPS, sixthPictureFrame } from './sixth-layout.ts';
import { VoxelMesh } from './voxel-mesh.ts';

const {width:WIDTH,height:HEIGHT,croppedWidth:CROPPED,step}=SIXTH_PICTURE;
type Tone='sand'|'cloth'|'paper'|'skin'|'shadow'|'ink'|'warm'|'plaid'|'blue'|'tile';
const colors:Record<Tone,{html:string;mesh:string}>={
  sand:{html:'#b0966a',mesh:'wood-light'},cloth:{html:'#8b775b',mesh:'wood'},
  paper:{html:'#d8c394',mesh:'cream'},skin:{html:'#c0936b',mesh:'skin'},
  shadow:{html:'#594c3e',mesh:'bark'},ink:{html:'#383a31',mesh:'temple-tile'},
  warm:{html:'#8b4c42',mesh:'red'},plaid:{html:'#a09858',mesh:'grass-dark'},
  blue:{html:'#526a67',mesh:'trousers'},tile:{html:'#6c6150',mesh:'temple-wood'},
};
interface Patch {x:number;y:number;w:number;h:number;tone:Tone}
const patches:Patch[]=[];
const box=(x:number,y:number,w:number,h:number,tone:Tone)=>patches.push({x,y,w,h,tone});
box(0,0,WIDTH,HEIGHT,'sand');
box(0,20,WIDTH,9,'cloth');
for(let x=0;x<WIDTH;x+=13)box(x,0,1,20,'tile');
box(0,4,WIDTH,2,'shadow');
box(3,7,16,11,'paper');box(4,9,14,8,'cloth');
box(5,10,3,6,'tile');box(15,10,3,6,'tile');
for(let i=0;i<5;i++){
  const x=6+i*9,y=[9,11,8,12,10][i]!,tone:Tone[]=['ink','warm','blue','plaid','warm'];
  box(x-2,y+8,10,11,tone[i]!);box(x,y,6,7,'skin');box(x-1,y-2,8,3,'ink');
  box(x+1,y+3,1,1,'ink');box(x+4,y+3,1,1,'ink');box(x+2,y+5,2,1,'shadow');
  box(x+1,y+8,4,1,'paper');
}
box(46,19,11,1,'shadow');box(54,19,2,9,'shadow');
// The same hand remains in the crop. The full impression reveals its sleeve and owner.
box(51,17,5,2,'skin');box(56,16,4,2,'blue');box(58,14,4,5,'blue');
box(60,10,7,17,'blue');box(61,6,5,7,'skin');
box(59,4,8,3,'paper');box(60,7,7,1,'ink');
box(61,9,5,1,'shadow');box(62,11,3,1,'paper');
box(45,15,2,1,'paper');
for(const [x,y] of [[2,25],[4,23],[4,25],[6,25],[4,27]])box(x!,y!,1,1,'warm');

export const SIXTH_NAMES=['阿秋','春嫂','老周','阿禾','阿桥','阿公'];
export function sixthPortraitMarkup(full:boolean, anonymous=false){
  const width=full?WIDTH:CROPPED;
  return `<svg class="sy-sixth-picture" viewBox="0 0 ${width} ${HEIGHT}" role="img" aria-label="${full?(anonymous?'旧底片的右侧露出衣袖与椅背':'六人老合影，右侧阿公扶着椅背'):'五人老合影，右边有一只扶椅背的手'}" shape-rendering="crispEdges">${patches.map(({x,y,w,h,tone})=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${colors[tone].html}"/>`).join('')}</svg>`;
}

type DryingPlatform = (typeof SIXTH_PLATFORMS)[number];

function dryingPlatform(mesh:VoxelMesh,{min,max}:DryingPlatform) {
  const [west,bottom,south]=min, [east,top,north]=max, apron=top-.07;
  const bands: {from:number;to:number;wood:string}[]=[];
  let previous:number=west;
  for (let center=west+.11;center<east-.08;center+=.24) {
    const from=Math.max(west,center-.1135), to=Math.min(east,center+.1135);
    if (from>previous) bands.push({from:previous,to:from,wood:'bark'});
    bands.push({from,to,wood:'wood-light'});
    previous=to;
  }
  if (previous<east) bands.push({from:previous,to:east,wood:'bark'});

  const floor=(from:number,to:number,y:number,normalY:number,wood:string) =>
    mesh.quad([[from,y,south],[to,y,south],[to,y,north],[from,y,north]],[0,normalY,0],wood);
  floor(west,east,bottom,-1,'bark');
  // The seams and boards tile the exterior skin. The former solid bark
  // top and the buried backs of the individual plank boxes are absent.
  for (const {from,to,wood} of bands) floor(from,to,top,1,wood);
  for (const [z,sign] of [[south,-1],[north,1]] as const) {
    const end=(from:number,to:number,y0:number,y1:number,wood:string) =>
      mesh.quad([[from,y0,z],[to,y0,z],[to,y1,z],[from,y1,z]],[0,0,sign],wood);
    end(west,east,bottom,apron,'bark');
    for (const {from,to,wood} of bands) end(from,to,apron,top,wood);
  }
  for (const [x,sign,cap] of [[west,-1,bands[0]!.wood],[east,1,bands.at(-1)!.wood]] as const) {
    const neighbor=SIXTH_PLATFORMS.find(platform=>(sign<0?platform.max[0]:platform.min[0])===x);
    const ys=[bottom,apron,top], zs=[south,north];
    if (neighbor) {
      for (const y of [neighbor.min[1],neighbor.max[1]]) if (y>bottom&&y<top) ys.push(y);
      for (const z of [neighbor.min[2],neighbor.max[2]]) if (z>south&&z<north) zs.push(z);
    }
    ys.sort((a,b)=>a-b);zs.sort((a,b)=>a-b);
    for (let iy=1;iy<ys.length;iy++) for (let iz=1;iz<zs.length;iz++) {
      const y0=ys[iy-1]!,y1=ys[iy]!,z0=zs[iz-1]!,z1=zs[iz]!;
      const y=(y0+y1)/2,z=(z0+z1)/2;
      if (neighbor&&y>neighbor.min[1]&&y<neighbor.max[1]&&z>neighbor.min[2]&&z<neighbor.max[2]) continue;
      mesh.quad([[x,y0,z0],[x,y1,z0],[x,y1,z1],[x,y0,z1]],[sign,0,0],y<apron?'bark':cap);
    }
  }
}

export function sixthSceneMeshes(){
  const fixed=new VoxelMesh(), door=new VoxelMesh();
  for(const part of SIXTH_ROOM_BOXES)fixed.box(part.center,part.size,part.material);
  const {center,size,material}=SIXTH_ROOM_DOOR;
  door.box(center,size,material);
  door.box([center[0]+.115,center[1],center[2]+.24],[.12,.11,.08],'weathered-brass');
  for (const platform of SIXTH_PLATFORMS) dryingPlatform(fixed,platform);
  const [x,y,z]=SIXTH_STOPS.window.position;
  for(const dx of [-1.53,1.53])fixed.box([x+dx,y+1.21,z+.74],[.18,2.85,.21],'temple-wood');
  fixed.box([x,y+2.62,z+.74],[3.45,.19,.31],'temple-tile');
  fixed.box([x,y+.44,z+.73],[3.11,.17,.46],'wood-light');
  for(let i=0;i<6;i++)fixed.box([x-1.10+i*.36,y+.72,z+.60],[.23,.13,.04],'cream');
  const tin=SIXTH_STOPS.tin.position;
  fixed.box([tin[0],tin[1]+.20,tin[2]],[.71,.39,.52],'temple-tile');
  for(const [dx,dz] of [[-.08,0],[0,-.08],[0,0],[.08,0],[0,.08]])
    fixed.box([tin[0]+dx!,tin[1]+.40,tin[2]+dz!],[.067,.024,.067],'red');
  const [ex,ey,ez]=SIXTH_STOPS.enlarger.position;
  fixed.box([ex,ey+.68,ez+.53],[1.28,.18,.8],'wood-light');
  fixed.box([ex,ey+.37,ez+.77],[.23,.72,.29],'bark');
  fixed.box([ex+.34,ey+1.12,ez+.67],[.16,.78,.15],'bark');
  fixed.box([ex+.17,ey+1.45,ez+.67],[.50,.29,.45],'temple-tile');
  fixed.box([ex-.16,ey+.8,ez+.48],[.62,.035,.47],'cream');
  function mosaic(width: number, draw: (col: number, row: number, run: number, material: string) => void) {
    const pixels=Array.from({length:HEIGHT},()=>Array<Tone>(width).fill('sand'));
    for(const {x:px,y:py,w,h,tone} of patches)
      for(let row=py;row<Math.min(HEIGHT,py+h);row++)
        for(let col=px;col<Math.min(width,px+w);col++)pixels[row]![col]=tone;
    for(const [row,line] of pixels.entries()){
      for(let col=0;col<width;){
        const tone=line[col]!;let end=col+1;
        while(end<width&&line[end]===tone)end++;
        draw((col+end)/2,row+.5,end-col,colors[tone].mesh);
        col=end;
      }
    }
  }
  const frame=(full:boolean)=>{
    const m=new VoxelMesh(),width=full?WIDTH:CROPPED,left=x-width*step/2;
    const {center,size,top,pixelFace}=sixthPictureFrame(full);
    m.box(center,size,'temple-wood');
    mosaic(width,(col,row,run,material)=>
      m.box([left+col*step,top-row*step,pixelFace],[run*step,step,.042],material));
    return m;
  };
  const inside=new VoxelMesh(), tile=.0264, roomZ=SIXTH_ROOM.south+1.29, roomTop=SIXTH_ROOM.floor+2.44;
  const roomX=SIXTH_ROOM.west+.21, roomWidth=WIDTH*tile;
  inside.box([roomX,roomTop-HEIGHT*tile/2,roomZ],[.12,HEIGHT*tile+.12,roomWidth+.12],'temple-wood');
  mosaic(WIDTH,(col,row,run,material)=>
    inside.box([roomX+.071,roomTop-row*tile,roomZ+roomWidth/2-col*tile],[.024,tile,run*tile],material));

  return {fixed,door,inside,old:frame(false),restored:frame(true)};
}
