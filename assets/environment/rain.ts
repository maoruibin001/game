import type { MeshAsset } from '@forgeax/engine/types';
import { createMeshBuilder } from '@forgeax/engine/geometry';
import { cross, dot, normalize } from '../controller/geometry.ts';
import type { CameraPose, Vec3 } from '../controller/types.ts';

type RainView = Pick<CameraPose, 'forward' | 'up'>;
const SAFE_CAMERA_DEPTH = .8;

const random=(n:number)=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
export interface RainDrop {x:number;y:number;z:number;floor:number;cycle:number}
export interface RainFieldOptions {
  count?:number; terrainHeight:(x:number,z:number)=>number;
  shelterHeight:(x:number,z:number)=>number|undefined;
}
/** A bounded real 3D line field. Each column stops at its actual highest roof/terrain. */
export function createRainField(options:RainFieldOptions){
  const count=options.count??160,drops:RainDrop[]=Array.from({length:count},()=>({x:0,y:-1e6,z:0,floor:0,cycle:0}));
  const positions=new Float32Array(count*6),colors=new Float32Array(count*8);
  let visible=0,sheltered=false;
  function reset(drop:RainDrop,i:number,eye:Vec3){
    drop.cycle++;
    const seed=i*13+drop.cycle*151;
    drop.x=eye[0]+(random(seed)-.5)*32;drop.z=eye[2]+(random(seed+1)-.5)*32;
    const radius=Math.hypot(drop.x-eye[0],drop.z-eye[2]);
    if(radius<1.25){const angle=random(seed+3)*Math.PI*2;drop.x=eye[0]+Math.cos(angle)*1.25;drop.z=eye[2]+Math.sin(angle)*1.25;}
    const roof=options.shelterHeight(drop.x,drop.z);
    drop.floor=Math.max(options.terrainHeight(drop.x,drop.z),roof??-Infinity)+.06;
    drop.y=eye[1]+3+random(seed+2)*11;
  }
  return {
    positions,colors,
    update(eye:Vec3,seconds:number,intensity:number,view?:RainView){
      const dt=Math.max(0,Math.min(.1,seconds)),roof=options.shelterHeight(eye[0],eye[2]);
      sheltered=roof!==undefined&&roof>eye[1]+.12;visible=0;
      // The wide-line renderer expands each strand after projection. Leave no
      // submitted endpoints on opposite sides of the near plane, even at zero alpha.
      const forward=view?.forward;
      const right=view&&normalize(cross(view.forward,view.up));
      const parking=forward&&right&&[
        eye[0]+2*forward[0]+20*right[0],eye[1]+2*forward[1]+20*right[1],eye[2]+2*forward[2]+20*right[2],
        eye[0]+2*forward[0]+20.28*right[0],eye[1]+2*forward[1]+20.28*right[1],eye[2]+2*forward[2]+20.28*right[2],
      ];
      const strandDepthSpan=forward?dot([.056,.28,.026],forward):0;
      for(let i=0;i<count;i++){
        const drop=drops[i]!;
        if(drop.y<drop.floor||Math.hypot(drop.x-eye[0],drop.z-eye[2])>24||drop.y>eye[1]+15)reset(drop,i,eye);
        drop.y-=dt*(12+random(i)*5);
        // Keep the wind-slanted strand wholly above its roof; the next cycle resamples the column.
        // Suppress a whole strand close to the moving lens, not just at birth.
        // The 1.1–2.5 m fade avoids clipped, bright rods dominating a portrait.
        const dx=drop.x-eye[0],dy=drop.y-eye[1],dz=drop.z-eye[2];
        const closest=Math.max(0,Math.min(1,(dx*.056+dy*.28+dz*.026)/(.056**2+.28**2+.026**2)));
        const lensDistance=Math.hypot(dx-closest*.056,dy-closest*.28,dz-closest*.026);
        const lensFade=Math.max(0,Math.min(1,(lensDistance-1.1)/1.4));
        const depth=forward?dot([dx,dy,dz],forward)-Math.max(0,strandDepthSpan):Infinity;
        const depthFade=Math.max(0,Math.min(1,(depth-SAFE_CAMERA_DEPTH)/.65));
        const nearFade=Math.min(lensFade,depthFade);
        const on=intensity>0&&i<count*intensity&&drop.y>drop.floor+.8&&nearFade>0;
        const offset=i*6;
        positions.set(!on&&parking?parking:[drop.x,drop.y,drop.z,drop.x-.056,Math.max(drop.floor,drop.y-.28),drop.z-.026],offset);
        const alpha=on?.14*nearFade:0;colors.set([.72,.83,.92,alpha,.72,.83,.92,alpha*.3],i*8);
        if(on)visible++;
      }
      return {visible,sheltered};
    },
    mesh():MeshAsset{
      const normals=new Float32Array(count*6),uv=new Float32Array(count*4),tangents=new Float32Array(count*8);
      for(let i=0;i<count*2;i++){normals[i*3+1]=1;tangents[i*4]=1;tangents[i*4+3]=1;}
      return createMeshBuilder({attributes:{position:positions,normal:normals,uv,tangent:tangents,color:colors},submeshes:[{indexOffset:0,indexCount:0,vertexCount:count*2,topology:'line-list',materialSlot:0}]}).build().unwrap();
    },
  };
}
