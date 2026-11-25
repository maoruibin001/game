import { worldGuidText } from './world-refs.ts';
type Color=readonly[number,number,number,number];
export interface WetSurface {readonly guid:string;readonly materialKey:string;readonly dryColor:Color;readonly dryRoughness:number;readonly wetColor:Color;readonly wetRoughness:number}
const linear=(hex:string):Color=>{const channel=(offset:number)=>{const s=parseInt(hex.slice(offset,offset+2),16)/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4;};return[channel(1),channel(3),channel(5),1];};
const surface=(materialKey:string,dry:string,dryRoughness:number,wet:string,wetRoughness:number):WetSurface=>({guid:worldGuidText(`material/${materialKey}`),materialKey,dryColor:linear(dry),dryRoughness,wetColor:linear(wet),wetRoughness});
/** Only dedicated road, paving and roof material slots participate; grass, mountains and props stay independent. */
export const WET_SURFACES:readonly WetSurface[]=[
 surface('temple-tile','#536a73',.74,'#394e5a',.32),
 surface('tile-cap','#69828a',.72,'#4e6a74',.28),
 surface('stair-surface','#a6ad9f',.90,'#7b8881',.54),
 surface('stair-riser','#9da597',.93,'#76837c',.60),
 surface('stone-jade','#909b97',.90,'#687b78',.43),
 surface('stone-blue','#849499',.91,'#5c727b',.39),
 surface('stone-pale','#acb1a3',.89,'#82938a',.48),
 surface('stone-lichen','#9da498',.93,'#768a7e',.46),
 surface('path','#b2a582',.88,'#887b5f',.58),
 surface('road-stone','#b0aa90',.88,'#73796d',.32),
 surface('weather-roof','#A74F3B',1,'#823e31',.36),
 surface('weather-roof-dark','#793D35',1,'#60332d',.4),
];
export interface NightLightMaterial { readonly guid:string;readonly materialKey:string;readonly emissive:readonly[number,number,number];readonly maxIntensity:number }
export const NIGHT_LIGHT_MATERIALS:readonly NightLightMaterial[]=[
 {guid:worldGuidText('material/night-window'),materialKey:'night-window',emissive:[1,.64,.24],maxIntensity:1.85},
 {guid:worldGuidText('material/pipeline-window'),materialKey:'pipeline-window',emissive:[1,.64,.24],maxIntensity:1.85},
 {guid:worldGuidText('material/pipeline-lamp'),materialKey:'pipeline-lamp',emissive:[1,.76,.36],maxIntensity:2.6},
];
export const CLOUD_ENTITY_KEY='clouds';
const wetRoofEntities=new Set(['post_office','windmill_tower','town_house_east','town_house_west','town_courtyard_house','town_awning','ridge_shelter']);
export function wetRoofMaterial(entityId:string,materialId:string):string|undefined{
 if(!wetRoofEntities.has(entityId))return;
 return materialId==='roof'?'weather-roof':materialId==='roofDark'?'weather-roof-dark':undefined;
}
