import { meshFromInterleaved } from '@forgeax/engine/geometry';
import { Materials } from '@forgeax/engine/render';
import type { SceneEntity, Submesh, MeshMaterialSlot, Asset } from '@forgeax/engine/types';
import { worldAsset, worldGuidText } from './world-refs.ts';
import type { Vec3 } from './world-layout.ts';
import { windmillTowerHeight } from './windmill-profile.ts';
import { wetRoofMaterial } from './environment-refs.ts';
import { TOWN_PLANTER_SHIFT, TOWN_POSTBOX_SHIFT } from './town-postcard-layout.ts';
export interface SourceBundle {
 [key:string]:unknown;
 id:string; pivotSourceMeters:number[];worldAnchorEngine:number[];anchors:Record<string,number[]>;
 meshes:{[key:string]:unknown;name:string;entityId:string;geometry:{[key:string]:unknown;positions:number[];normals:number[];uvs:number[];indices:number[];material:{[key:string]:unknown;id:string;surface:{[key:string]:unknown;baseColor:number[];roughness:number;metallic:number}}}}[];
}
export const DYNAMIC_PIVOTS:Record<string,Vec3>={
 'hero/forest-windmill/windmill-sails':[-170,46.5,-25],
 'hero/forest-windmill/windmill-curtain':[-170,45.75,-24.75],
 'hero/town-street/town-gate':[152,24,10],
 'hero/town-street/town-bridge':[155,24,24.25],
 'hero/town-courtyard/town-courtyard-bell':[161.125,27.75,51.125],
 'hero/ridge-station/ridge-flag':[12.5,102,241.5],
};
function courtyardTone(bundle:string,id:string,material:string):string|undefined{
 if(bundle!=='town-courtyard')return;
 if(material==='roof'||material==='roofDark')return material==='roof'?'temple-tile':'tile-edge';
 if(id==='town_courtyard_eave'&&material==='woodLight')return 'temple-wood';
 if(id==='town_courtyard_house'&&material==='plaster')return 'cream';
 if(id==='town_awning'&&material==='woodLight')return 'temple-wood';
}
export function compilePipelineBundles(bundles:readonly SourceBundle[]):{resources:Record<string,Asset>;entities:Record<string,SceneEntity>} {
 const resources:Record<string,Asset>={},entities:Record<string,SceneEntity>={};
 for(const bundle of bundles){
  if(bundle.id.endsWith('-kit'))continue;
  const pivot=bundle.pivotSourceMeters,anchor=bundle.worldAnchorEngine;
  const groups=new Map<string,typeof bundle.meshes>();
  for(const m of bundle.meshes){const list=groups.get(m.entityId)??[];list.push(m);groups.set(m.entityId,list);}
  for(const[id,meshes]of groups){
   const key=`hero/${bundle.id}/${id.replaceAll('_','-')}`,meshKey=`mesh/${key}`;
   const relocate:Vec3=id==='town_postbox'?TOWN_POSTBOX_SHIFT:id==='town_planter'?TOWN_PLANTER_SHIFT:
     id==='zipline_station'?[-28,0,16]:id==='windmill_sails'?[0,0,-8.5]:id==='windmill_curtain'?[0,0,-7.5]:[0,0,0];
   const entityOrigin=DYNAMIC_PIVOTS[key]??anchor.map((v,i)=>v+relocate[i]!) as unknown as Vec3;
   const vertices:number[]=[],indices:number[]=[],submeshes:Submesh[]=[],materialSlots:MeshMaterialSlot[]=[];
   for(const m of meshes){
    const g=m.geometry,start=vertices.length/8,slot=materialSlots.length,materialName=wetRoofMaterial(id,g.material.id)??`pipeline-${g.material.id.toLowerCase().replaceAll('_','-')}`;
    for(let v=0;v<g.positions.length/3;v++){
     let x=g.positions[v*3]!-pivot[0]!+anchor[0]!+relocate[0];
     if(id==='postal_portal')x=9.75+(x-9.75)*1.35;
     let y=g.positions[v*3+2]!-pivot[2]!+anchor[1]!+relocate[1];
     if(id==='windmill_tower')y=windmillTowerHeight(y);
     vertices.push(x-entityOrigin[0],y-entityOrigin[1],-(g.positions[v*3+1]!-pivot[1]!)+anchor[2]!+relocate[2]-entityOrigin[2],g.normals[v*3]!,g.normals[v*3+2]!,-g.normals[v*3+1]!,g.uvs[v*2]??0,g.uvs[v*2+1]??0);
    }
    submeshes.push({indexOffset:indices.length,indexCount:g.indices.length,vertexCount:g.positions.length/3,topology:'triangle-list',materialSlot:slot});
    for(const index of g.indices)indices.push(start+index);
    materialSlots.push({slotName:`${materialName}-${slot}`,defaultMaterial:worldAsset(`material/${courtyardTone(bundle.id,id,g.material.id)??materialName}`)});
    resources[`material/${materialName}`]=Materials.standard({baseColor:g.material.surface.baseColor as [number,number,number,number],roughness:g.material.surface.roughness,metallic:g.material.surface.metallic,
      ...(materialName==='pipeline-window'||materialName==='pipeline-lamp'?{emissive:[0,0,0],emissiveIntensity:0}:{})});
   }
   const built=meshFromInterleaved(new Float32Array(vertices),new Uint32Array(indices));if(!built.ok)throw built.error;
   resources[meshKey]={...built.value,submeshes,materialSlots};
   entities[key]={components:{Name:{value:`Scene Foundry / ${id}`},Transform:{pos:entityOrigin},MeshFilter:{assetHandle:worldGuidText(meshKey)},MeshRenderer:{materials:[]}}};
  }
 }
 return{resources,entities};
}
