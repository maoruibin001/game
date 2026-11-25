import type { Asset, SceneEntity } from '@forgeax/engine/types';
import { VoxelMesh } from './voxel-mesh.ts';
import { worldAsset, worldGuidText } from './world-refs.ts';
import type { Vec3 } from './world-layout.ts';

export const FOREST_ROTOR_KEY='hero/forest-windmill/windmill-sails';
export const FOREST_TIMBER_KEY='hero/forest-windmill/timber-structure';
export const FOREST_ROTOR_REST_PHASE=Math.PI*.15;

/** Game-authored replacement of the compiled rotor only. The scene's original
 * pivot, curtain, unlock and live rotation still own its motion. Long slender
 * spars retain the original 13.5m sweep; open ribs replace the four solid plates.
 */
export function forestRotorMesh():VoxelMesh{
 const out=new VoxelMesh();
 for(let arm=0;arm<4;arm++){
  const wing=new VoxelMesh();
  wing.beam([0,.4,0],[0,6.74,0],.22,.28,'wood');
  wing.beam([.08,1.55,.02],[1.64,5.9,.02],.12,.16,'wood-light');
  wing.beam([1.64,2.55,.02],[1.64,5.9,.02],.12,.16,'wood');
  // A real open lattice: the outer tip and inner root retain sky between the ribs.
  for(const y of [2.1,2.75,3.4,4.05,4.7,5.35,6]){
   const width=y<2.55?1.08:1.64;
   wing.beam([-.12,y,-.08],[width,y,-.08],.13,.14,'wood-light');
  }
  // The outer sail reads as one shape at postal-road distance. The timber lattice
  // remains open at the root and between the two tied panels.
  wing.box([.82,3.04,-.15],[1.34,.53,.08],'cream');
  wing.box([.79,4.83,-.15],[1.43,1.92,.08],'cream');
  wing.box([1.48,4.83,-.20],[.10,1.92,.038],'gold-light');
  wing.box([.78,5.52,-.20],[1.39,.17,.035],'red');
  if(arm===1)wing.box([.28,4.16,-.20],[.38,.33,.04],'gold-light');
  const angle=FOREST_ROTOR_REST_PHASE+arm*Math.PI/2,c=Math.cos(angle),s=Math.sin(angle),start=out.vertices.length/8;
  for(let i=0;i<wing.vertices.length;i+=8){
   const x=wing.vertices[i]!,y=wing.vertices[i+1]!,nx=wing.vertices[i+3]!,ny=wing.vertices[i+4]!;
   out.vertices.push(x*c-y*s,x*s+y*c,wing.vertices[i+2]!,nx*c-ny*s,nx*s+ny*c,wing.vertices[i+5]!,wing.vertices[i+6]!,wing.vertices[i+7]!);
  }
  for(const [material,indices]of wing.groups){
   const group=out.groups.get(material)??[];if(!out.groups.has(material))out.groups.set(material,group);
   for(const index of indices)group.push(start+index);
  }
 }
 // The shaft reaches the roof bearing; this is part of the same rotating assembly.
 out.beam([0,0,-.22],[0,0,2.05],.3,.3,'wood');
 out.box([0,0,-.23],[.72,.72,.45],'wood');
 out.box([0,0,-.48],[.42,.42,.09],'iron');
 out.box([0,0,-.54],[.16,.16,.05],'gold');
 return out;
}

/** Timber bays, a roof bearing and eave layers support the original compiled tower.
 * All static additions stay inside its existing solid envelope, including sides
 * and rear. The original roof, plaster, foundation and source bundle are retained.
 */
export function forestTowerTimberMesh():VoxelMesh{
 const m=new VoxelMesh();
 for(const z of [-23.12,-17.38]){
  for(const [left,right]of [[-172.9,-171.1],[-168.9,-167.1]]as const){
   m.beam([left,39.85,z],[right,43.55,z],.16,.18,'wood');
   m.beam([left,43.55,z],[right,39.85,z],.16,.18,'wood');
  }
  m.box([-170,43.82,z],[6.65,.18,.26],'wood');
  m.box([-170,43.99,z],[6.9,.12,.36],'wood-light');
 }
 for(const x of [-173.2,-166.8]){
  m.beam([x,39.8,-22.5],[x,43.55,-18],.16,.18,'wood');
  m.beam([x,43.55,-22.5],[x,39.8,-18],.16,.18,'wood');
  m.box([x,43.82,-20.25],[.26,.18,5.6],'wood');
 }
 m.box([-170,46.23,-23.13],[1.05,.54,.65],'wood');
 m.box([-170,45.99,-23.13],[1.45,.12,.9],'wood-light');
 for(const z of [-23.55,-16.95])m.box([-170,39.18,z],[7.8,.18,.25],'rock-light');
 return m;
}

// A red enamel lunch tin with a propped lid and a folded paper sleeve on the stone.
export function forestLunchTin(): VoxelMesh {
 const m = new VoxelMesh();
 m.box([0,.035,0],[.76,.07,.48],'cream');
 m.box([0,.17,0],[.78,.22,.50],'red');
 m.box([0,.285,0],[.80,.04,.52],'cream');
 m.box([0,.31,0],[.69,.02,.41],'gold');
 m.box([.07,.335,.02],[.42,.04,.29],'cream');
 m.box([.16,.36,.01],[.09,.018,.045],'leaf');
 m.box([-.05,.36,-.05],[.075,.018,.04],'leaf');
 m.box([0,.48,.21],[.76,.36,.06],'red');
 m.box([0,.48,.17],[.67,.28,.032],'cream');
 m.box([-.24,.39,-.10],[.18,.11,.19],'cream');
 return m;
}

/** Call after compilePipelineBundles has populated the original scene; never create
 * another rotor or move the authoritative dynamic Transform. Existing asset GUIDs
 * select the replacement mesh, while the original source remains rollback-ready.
 */
export function applyForestWindmillArt(resources:Record<string,Asset>,entities:Record<string,SceneEntity>):void{
 if(!entities[FOREST_ROTOR_KEY])throw new Error('Forest rotor source must be compiled before art replacement');
 resources[`mesh/${FOREST_ROTOR_KEY}`]=forestRotorMesh().build(name=>worldAsset(`material/${name}`));
 resources[`mesh/${FOREST_TIMBER_KEY}`]=forestTowerTimberMesh().build(name=>worldAsset(`material/${name}`));
 entities[FOREST_TIMBER_KEY]={components:{Name:{value:'风来林地 / 风车木构'},Transform:{pos:[0,0,0] as Vec3},
  MeshFilter:{assetHandle:worldGuidText(`mesh/${FOREST_TIMBER_KEY}`)},MeshRenderer:{materials:[]}}};
}
