import type { AssetRegistry } from '@forgeax/engine/assets-runtime';
import type { World } from '@forgeax/engine/ecs';
import { createMeshBuilder } from '@forgeax/engine/geometry';
import { Materials, MeshFilter, MeshRenderer, ShadowParticipation } from '@forgeax/engine/render';
import { Transform } from '@forgeax/engine/scene';
import { RenderQueue } from '@forgeax/engine/types';
import { clamp } from '../controller/geometry.ts';
import type { courierSole, VisibleTread } from '../controller/traveler-stance.ts';
import type { TravelStatus } from '../controller/types.ts';

type Soles = readonly [ReturnType<typeof courierSole>, ReturnType<typeof courierSole>];

export function installTravelerContact(world:World,assets:AssetRegistry,surface:VisibleTread) {
  const sides=8, count=sides*3*2;
  const position=new Float32Array(count*3), color=new Float32Array(count*4);
  // Seed conservative local bounds for the tiny mesh before it receives per-foot positions.
  position.set([-.5,-.5,-.7,.5,.5,.7,-.5,-.5,.7]);
  const mesh=assets.create(createMeshBuilder({attributes:{position,color},
    submeshes:[{topology:'triangle-list',indexCount:0,indexOffset:0,vertexCount:count,materialSlot:0}],
  }).build().unwrap()).unwrap();
  const material=assets.create(Materials.unlit([1,1,1,1],{queue:RenderQueue.Transparent,
    renderState:{depthWriteEnabled:false,cullMode:'none',
      blend:{color:{srcFactor:'src-alpha',dstFactor:'one-minus-src-alpha',operation:'add'},
        alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'}}},
  })).unwrap();
  const actor=world.spawn({component:Transform,data:{scale:[0,0,0]}},
    {component:MeshFilter,data:{assetHandle:mesh}},{component:MeshRenderer,data:{materials:[material]}},
    {component:ShadowParticipation,data:{cast:false,receive:false}}).unwrap();
  let active=false,last='';
  return {
    update(status:TravelStatus,soles:Soles|undefined,illumination:number) {
      const visible=!!soles&&status.avatarVisible&&status.grounded;
      if(visible!==active){
        world.set(actor,Transform,{scale:visible?[1,1,1]:[0,0,0]}).unwrap();
        active=visible;
      }
      if(!visible||!soles){last='';return;}
      const [x,y,z]=status.position;
      const lightBucket=Math.round(32*clamp(illumination,0,1));
      const sample=[x,y,z,status.facingYaw,status.stepPhase,status.speed,lightBucket].join('/');
      if(last===sample)return;
      last=sample;
      const cos=Math.cos(status.facingYaw),sin=Math.sin(status.facingYaw);
      let vertex=0;
      for(const {center,clearance} of soles){
        const start=surface(center[0],center[2],y);
        const opacity=(.079+.13*lightBucket/32)*clamp(1-(clearance-.008)/.065,0,1);
        const rim=Array.from({length:sides},(_,i)=>{
          const angle=i*Math.PI*2/sides, lat=.15*Math.cos(angle), depth=.205*Math.sin(angle);
          const px=center[0]+lat*cos-depth*sin,pz=center[2]+lat*sin+depth*cos;
          const py=surface(px,pz,y);
          return {x:px,y:py,z:pz};
        });
        const plot=(px:number,py:number,pz:number,alpha:number)=>{
          position.set([px-x,py-y+.012,pz-z],vertex*3);
          color.set([.046,.05,.06,alpha],vertex++*4);
        };
        for(let i=0;i<sides;i++){
          const a=rim[i]!,b=rim[(i+1)%sides]!;
          // Avoid bridging a riser / ledge with a dark hovering triangle.
          const sameTread=Math.abs(a.y-start)<.13 && Math.abs(b.y-start)<.13;
          plot(center[0],start,center[2],sameTread?opacity:0);
          plot(a.x,sameTread?a.y:start,a.z,0);
          plot(b.x,sameTread?b.y:start,b.z,0);
        }
      }
      world.set(actor,Transform,{pos:status.position}).unwrap();
      assets.writeRange(mesh,[{attribute:'position',first:0,values:position},{attribute:'color',first:0,values:color}]).unwrap();
    },
    dispose() {world.despawn(actor).unwrap();assets.release(material).unwrap();assets.release(mesh).unwrap();},
  };
}
