/** Game-authored profile applied to the locally compiled tower; the sole rotor stays unchanged. */
export function windmillTowerHeight(y:number):number {
 if(y<=39.5)return y;
 return y<=48.5?39.5+(y-39.5)*.5:y-4.5;
}
export const WINDMILL_TOWER_SHAPE={
 min:[-174,38,-23.75],max:[-166,46.5,-16.75],
 position:[-170,42.25,-20.25],size:[8,8.5,7],
} as const;
