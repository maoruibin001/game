import type { AssetRegistry } from '@forgeax/engine/assets-runtime';
import type { EntityHandle, World } from '@forgeax/engine/ecs';
import { createMeshBuilder } from '@forgeax/engine/geometry';
import { Materials, MeshFilter, MeshRenderer, ShadowParticipation } from '@forgeax/engine/render';
import { Transform } from '@forgeax/engine/scene';
import { RenderQueue, type AssetHandle, type MaterialValue } from '@forgeax/engine/types';
import type { TravelStatus, Vec3 } from '../controller/types.ts';
import { POSTAL_POOLS, POSTAL_RAIN_MATERIALS } from '../shanye-world/postal-rain-layout.ts';
import { worldGuidText } from '../shanye-world/world-refs.ts';
import { createPostalWetness, puddleScale } from './postal-wetness.ts';

const translucent = {
  depthWriteEnabled: false,
  cullMode: 'none',
  blend: {
    color: {srcFactor:'src-alpha',dstFactor:'one-minus-src-alpha',operation:'add'},
    alpha: {srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'},
  },
} as const;
const origin:Vec3 = [-2.7,14,-227.6];
const tpi = Math.PI*2;
const segments = 12, capacity = 12, droplets = 4;
const verticesPerImpact = segments*6+droplets*3;
type WetMaterialGroup = keyof typeof POSTAL_RAIN_MATERIALS | 'stone';
const wetAppearance: Record<WetMaterialGroup, readonly [darkening:number,roughness:number]> = {
  hat:[.32,.53],shoulders:[.40,.49],coat:[.38,.52],bag:[.36,.55],stone:[.23,.46],
};
interface WetMaterial {
  handle:AssetHandle<'material'>; values:Record<string,MaterialValue|null>; base:readonly number[];
  roughness:number; group:WetMaterialGroup; bucket:number;
}


function surfaceMesh(position:Float32Array,color:Float32Array,indices?:Uint32Array) {
  const count = position.length/3;
  const normal = new Float32Array(position.length), uv = new Float32Array(count*2), tangent = new Float32Array(count*4);
  for (let i=0; i<count; i++) {normal[i*3+1]=1;tangent[i*4]=1;tangent[i*4+3]=1;}
  return createMeshBuilder({attributes:{position,normal,uv,tangent,color},...(indices?{indices}:{}),
    submeshes:[{indexOffset:0,indexCount:indices?.length??0,vertexCount:count,topology:'triangle-list',materialSlot:0}]}).build().unwrap();
}

function waterSilhouette() {
  const position = [0,0,0], color = [1,1,1,1], indices:number[]=[];
  const count=18;
  for (const radius of [.84,1]) for (let i=0;i<count;i++){
    const angle=i*tpi/count;
    const edge=.91+.065*Math.sin(3*angle+.4)+.044*Math.sin(5*angle-1.1);
    position.push(radius*edge*Math.cos(angle),0,radius*edge*Math.sin(angle));
    color.push(1,1,1,radius===1?0:1);
  }
  for(let i=0;i<count;i++){
    const a=1+i,b=1+(i+1)%count,c=a+count,d=b+count;
    indices.push(0,b,a,a,b,c,b,d,c);
  }
  return surfaceMesh(new Float32Array(position),new Float32Array(color),new Uint32Array(indices));
}

interface Impact {
  position: Vec3; age: number; span: number; seed: number; foot: boolean;
}

export async function installPostalWater(
  world:World, assets:AssetRegistry, shelter:(x:number,z:number)=>number|undefined,
) {
  const owned:AssetHandle[] = [], entities:EntityHandle[] = [];
  const dispose = () => {
    for (const item of entities.splice(0).reverse()) world.despawn(item).unwrap();
    for (const asset of owned.splice(0).reverse()) assets.release(asset).unwrap();
  };
  const loaded = <H extends AssetHandle>(handle:H) => {owned.push(handle);return handle;};
  try {
    const state=createPostalWetness(shelter);
    const water=loaded(assets.create(waterSilhouette()).unwrap());
    const glaze=loaded(assets.create(Materials.standard({baseColor:[.085,.109,.117,.9],roughness:.19,queue:RenderQueue.Transparent,renderState:translucent})).unwrap());
    const positions=new Float32Array(capacity*verticesPerImpact*3), colors=new Float32Array(capacity*verticesPerImpact*4);
    // Seed a conservative postal-only draw bound before the dynamic range writes.
    positions.set([-4,0,-2,4,1,2,-4,0,-2]);
    const effects=loaded(assets.create(surfaceMesh(positions,colors)).unwrap());
    const effectMat=loaded(assets.create(Materials.unlit([1,1,1,1],{queue:RenderQueue.Transparent+1,renderState:translucent})).unwrap());
    function spawn(asset:AssetHandle<'mesh'>,material:AssetHandle<'material'>,pos:Vec3,receive:boolean) {
      const entity=world.spawn({component:Transform,data:{pos,scale:[0,0,0]}},
        {component:MeshFilter,data:{assetHandle:asset}},{component:MeshRenderer,data:{materials:[material]}},
        {component:ShadowParticipation,data:{cast:false,receive}}).unwrap();
      entities.push(entity);
      return entity;
    }
    const pools=POSTAL_POOLS.map(({position})=>spawn(water,glaze,position,true));
    const marks=spawn(effects,effectMat,origin,false);

    const tones = [
      ...Object.entries(POSTAL_RAIN_MATERIALS).flatMap(([group,ids])=>ids.map(id=>({group:group as keyof typeof POSTAL_RAIN_MATERIALS,key:`traveler-rain/${group}/${id}` }))),
      ...['path','road-stone'].map(id=>({group:'stone' as const,key:`postal-rain/exposed-${id}`})),
    ];
    const mats:WetMaterial[]=[];
    for (const {group,key} of tones) {
      const handle=loaded((await assets.load(worldGuidText(`material/${key}`),'material')).unwrap());
      const values={...assets.read(handle).unwrap().values};
      mats.push({handle,values,base:values.baseColor as readonly number[],roughness:Number(values.roughness),group,bucket:0});
    }
    const rainTimer=[.16,.39,.61], writtenScale=[-1,-1,-1];
    const impacts:Impact[]=[];
    let effectTime=1, seed=0, marksShown=false;
    let facts={clothing:{hat:0,shoulders:0,coat:0,bag:0},pools:[0,0,0],sheltered:false,underfoot:false,splashes:0};

    function addImpact(position:Vec3,span:number,foot:boolean) {
      if (impacts.length>=capacity) impacts.shift();
      impacts.push({position,age:0,span,seed:++seed,foot});
    }

    function drawImpacts() {
      const visible=impacts.length>0;
      if (visible!==marksShown) {
        world.set(marks,Transform,{scale:visible?[1,1,1]:[0,0,0]}).unwrap();
        marksShown=visible;
      }
      if (!visible) return;
      positions.fill(0);colors.fill(0);
      let v=0;
      function plot(x:number,y:number,z:number,a:number) {
        positions.set([x-origin[0],y-origin[1],z-origin[2]],v*3);
        colors.set([.60,.76,.84,a],v*4);v++;
      }
      for (const impact of impacts) {
        const {position:[x,y,z],age,span,foot,seed}=impact, t=age/(foot?.48:.64);
        const radius=span*(.24+.76*t), edge=(foot?.028:.017)*(1-.45*t);
        const alpha=(foot?.62:.46)*(1-t)**2;
        for(let i=0;i<segments;i++){
          const a=i*tpi/segments,b=(i+1)*tpi/segments;
          const ca=Math.cos(a),sa=Math.sin(a),cb=Math.cos(b),sb=Math.sin(b), inner=Math.max(0,radius-edge);
          plot(x+ca*inner,y,z+sa*inner,alpha);
          plot(x+ca*radius,y,z+sa*radius,alpha);
          plot(x+cb*radius,y,z+sb*radius,alpha);
          plot(x+ca*inner,y,z+sa*inner,alpha);
          plot(x+cb*radius,y,z+sb*radius,alpha);
          plot(x+cb*inner,y,z+sb*inner,alpha);
        }
        if (!foot) continue;
        for(let j=0;j<droplets;j++){
          const angle=j*tpi/droplets+seed*1.11,x0=x+Math.cos(angle)*radius,z0=z+Math.sin(angle)*radius;
          const height=Math.sin(t*Math.PI)*(.09+.028*j);
          plot(x0-.016,y+height,z0,alpha);
          plot(x0+.016,y+height,z0,alpha);
          plot(x0,y+height+.05,z0+.009,alpha);
        }
      }
      assets.writeRange(effects,[{attribute:'position',first:0,values:positions},{attribute:'color',first:0,values:colors}]).unwrap();
    }

    return {
      snapshot:()=>facts,
      update(status:TravelStatus,rain:number,dt:number) {
        const step=state.step(status,rain,dt), [x,y,z]=status.position;
        const roof=shelter(x,z);
        facts={clothing:step.clothing,pools:step.pools,sheltered:roof!==undefined&&roof>y+1.89,underfoot:step.underfoot>=0&&status.grounded,splashes:step.splashes};
        for (const mat of mats) {
          const wet=mat.group==='stone'?step.stone:step.clothing[mat.group];
          const bucket=Math.round(wet*24);
          if (bucket===mat.bucket) continue;
          mat.bucket=bucket;
          const amount=bucket/24;
          const [dark,polish]=wetAppearance[mat.group];
          const baseColor=mat.base.map((c,i)=>i===3?c:c*(1-dark*amount));
          assets.update(mat.handle,{values:{...mat.values,baseColor,roughness:mat.roughness+(polish-mat.roughness)*amount}}).unwrap();
        }

        const close=Math.hypot(status.position[0]-origin[0],status.position[2]-origin[2])<29;
        for(const [i,site] of POSTAL_POOLS.entries()){
          const scale=close?Math.round(puddleScale(step.pools[i]!)*64)/64:0;
          if (scale!==writtenScale[i]){
            world.set(pools[i]!,Transform,{scale:scale?[site.radius[0]*scale,1,site.radius[1]*scale]:[0,0,0]}).unwrap();
            writtenScale[i]=scale;
          }
          if (!close || scale<.28 || rain<.14) continue;
          rainTimer[i]!-=dt;
          if (rainTimer[i]!<=0) {
            const angle=seed*2.39996, [x,y,z]=site.position;
            addImpact([x+site.radius[0]*.33*scale*Math.cos(angle),y+.005,z+site.radius[1]*.33*scale*Math.sin(angle)],.16*scale,false);
            rainTimer[i]=.23+(seed%4)*.071 + (.8-rain)*.55;
          }
        }
        if (step.splash && close) {
          const surface=POSTAL_POOLS[step.underfoot]!.position[1];
          addImpact([x,surface+.007,z],.27,true);
        }
        for(let i=impacts.length-1;i>=0;i--){
          const impact=impacts[i]!;
          impact.age+=dt;
          if(impact.age>=(impact.foot?.48:.64)||!close) impacts.splice(i,1);
        }
        effectTime+=dt;
        if(effectTime>=1/24 && (impacts.length||marksShown)){drawImpacts();effectTime=0;}
      },
      dispose,
    };
  } catch(error) {
    dispose();
    throw error;
  }
}
