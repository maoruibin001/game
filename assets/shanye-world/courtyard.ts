import { COURTYARD_SOLIDS } from './courtyard-solids.ts';
import type { Vec3 } from './world-layout.ts';

const subject=(entityId:string,position:Vec3,size:Vec3)=>Object.freeze({position,size,
  proxy:new Set(COURTYARD_SOLIDS.filter(b=>b.entityId===entityId).map(b=>b.id)) as ReadonlySet<string>});
/** A real, optional view inside the existing courtyard. Region membership alone never awards a photograph. */
export const COURTYARD_PHOTO=Object.freeze({
  bounds:Object.freeze({minX:154,maxX:163,minZ:42,maxZ:55}),
  zoneHeight:24,maxFeetHeightDelta:3,
  // Face the larger hollow bronze bell from the open entrance. The shortened
  // roof and side supports frame its complete silhouette, not a dark ceiling.
  view:Object.freeze({feet:[155.5,24.08,43.5] as Vec3,target:[161.125,26.4,51.125] as Vec3}),
  anchors:Object.freeze({
    bell:subject('town_courtyard_bell',[161.125,26.375,51.125],[2.25,2.75,2.25]),
    // The real, now thinner front fascia remains above the bell.
    eave:subject('town_courtyard_eave',[161.125,28.375,49.375],[2.5,.25,.25]),
  }),
});
export { COURTYARD_SOLIDS } from './courtyard-solids.ts';
