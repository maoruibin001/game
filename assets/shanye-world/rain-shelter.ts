import {precinctShelter} from './mountain-precinct.ts';
import {bellRoofHeight} from './courtyard-structure.ts';
import { NATIVE_RAIN_SURFACES } from './rain-surfaces.ts';
import { openingPorchShelter } from './opening-envelope.ts';
const cellSize=8,index=new Map<string,number[]>();
for(let i=0;i<NATIVE_RAIN_SURFACES.length;i++){
 const [x0,x1,z0,z1]=NATIVE_RAIN_SURFACES[i]!;
 for(let x=Math.floor(x0/cellSize);x<=Math.floor(x1/cellSize);x++)for(let z=Math.floor(z0/cellSize);z<=Math.floor(z1/cellSize);z++){
  const key=`${x},${z}`,list=index.get(key)??[];list.push(i);index.set(key,list);
 }
}
/** Highest actual static roof/porch top at this XZ; open courtyards and gaps remain open. */
export function rainShelterHeight(x:number,z:number):number|undefined {
 let top=bellRoofHeight(x,z);
 const postal=openingPorchShelter(x,z);if(postal!==undefined)top=Math.max(top??-Infinity,postal);
 const precinct=precinctShelter(x,z);if(precinct!==undefined)top=Math.max(top??-Infinity,precinct);
 for(const i of index.get(`${Math.floor(x/cellSize)},${Math.floor(z/cellSize)}`)??[]){
  const [x0,x1,z0,z1,y]=NATIVE_RAIN_SURFACES[i]!;
  if(x>=x0&&x<=x1&&z>=z0&&z<=z1)top=Math.max(top??-Infinity,y);
 }
 return top;
}
export const RAIN_SHELTER_STATS=Object.freeze({surfaces:NATIVE_RAIN_SURFACES.length,cells:index.size,maxCellSurfaces:Math.max(...[...index.values()].map(a=>a.length)),cellSize});
