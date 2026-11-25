import type { TravelStatus, Vec3 } from '../controller/types.ts';
import { POSTAL_POOLS } from '../shanye-world/postal-rain-layout.ts';

export type WetChannels = Readonly<{hat:number; shoulders:number; coat:number; bag:number}>;
type Shelter = (x:number,z:number)=>number|undefined;
export type RainTraveler = Pick<TravelStatus,'position'|'facingYaw'|'speed'|'grounded'|'stepPhase'>;
const clamp = (n:number) => Math.max(0,Math.min(1,n));

export function postalExposure({position:[x,y,z],facingYaw}:RainTraveler,shelter:Shelter): WetChannels {
  // First batch covers both the entrance and the official approach from the
  // sorting porch. Already-wet clothes can dry farther down the valley.
  if (x < -32 || x > 15 || z < -252 || z > -214) return {hat:0,shoulders:0,coat:0,bag:0};
  const sideX=Math.cos(facingYaw),sideZ=Math.sin(facingYaw);
  const backX=-sideZ,backZ=sideX;
  const exposed=(lateral:number,back:number,height:number)=> {
    const roof=shelter(x+sideX*lateral+backX*back,z+sideZ*lateral+backZ*back);
    return Number(roof===undefined||roof<y+height+.06);
  };
  return {
    hat: exposed(0,0,1.83),
    shoulders: (exposed(-.33,0,1.35)+exposed(.33,0,1.35))*.5,
    coat: (exposed(-.18,-.12,1.22)+exposed(.18,-.12,1.22))*.5,
    bag: exposed(0,.28,1.37),
  };
}

export const PUDDLE_THRESHOLD=.075;
export const puddleScale=(level:number)=>Math.sqrt(clamp((level-PUDDLE_THRESHOLD)/(1-PUDDLE_THRESHOLD)));

export function wetAreaAt(x:number,z:number,levels:readonly number[]): number {
  return POSTAL_POOLS.findIndex(({position,radius},index)=>{
    const scale=puddleScale(levels[index]??0);
    return scale>0 && ((x-position[0])/radius[0])**2+((z-position[2])/radius[1])**2 < (.83*scale)**2;
  });
}

export function createPostalWetness(shelter:Shelter) {
  let clothing:WetChannels={hat:0,shoulders:0,coat:0,bag:0}, stone=0;
  const pools=POSTAL_POOLS.map(()=>0);
  let lastFoot=-1,lastPool=-1,splashes=0,lastGrounded=true;
  return {
    step(traveler:RainTraveler,rain:number,seconds:number){
      const dt=Math.max(0,Math.min(.1,seconds)),intensity=clamp(rain/.8);
      const exposure=postalExposure(traveler,shelter);
      const saturate=(level:number,exposed:number,gain:number,drain:number)=>
        clamp(level+dt*(gain*intensity*exposed-drain*(1-intensity*exposed)));
      clothing={
        hat:saturate(clothing.hat,exposure.hat,.72,.073),
        shoulders:saturate(clothing.shoulders,exposure.shoulders,.53,.063),
        coat:saturate(clothing.coat,exposure.coat,.34,.048),
        bag:saturate(clothing.bag,exposure.bag,.24,.035),
      };
      stone=saturate(stone,1,.43,.055);
      for (const [i,{catchment}] of POSTAL_POOLS.entries()) {
        pools[i]=saturate(pools[i]!,1,.34*catchment,.061/catchment);
      }
      const [x,y,z]=traveler.position,here=wetAreaAt(x,z,pools);
      const pool=here>=0&&Math.abs(y-POSTAL_POOLS[here]!.position[1])<.15 ? here : -1;
      const foot=Math.floor((traveler.stepPhase+Math.PI*.5)/Math.PI);
      const contact=traveler.grounded && (!lastGrounded || (traveler.speed>.2&&(foot!==lastFoot||pool!==lastPool)));
      const splash=pool>=0&&contact;
      if (splash) splashes++;
      lastFoot=foot;lastPool=pool;lastGrounded=traveler.grounded;
      return {clothing,stone,pools:[...pools],exposure,underfoot:pool,splash,splashes};
    },
  };
}
