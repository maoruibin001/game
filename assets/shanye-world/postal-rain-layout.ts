import type { Vec3 } from './world-layout.ts';

/** World X/Z limits. The dry inset is wholly inside the real postal eave. */
export const POSTAL_WET_STONE = [-8.5,-232,2.8,-222.25] as const;
export const POSTAL_DRY_STONE = [-5.4,-232,1.65,-229.45] as const;

export const POSTAL_POOLS = [
  { position: [-5.22,14.073,-228.2] as Vec3, radius: [.65,.37] as const, catchment: 1 },
  { position: [.2,14.073,-228.19] as Vec3, radius: [.65,.39] as const, catchment: .79 },
  { position: [-2.77,14.089,-226.39] as Vec3, radius: [.49,.34] as const, catchment: .86 },
] as const;

export const POSTAL_RAIN_MATERIALS = {
  hat: ['mail-wicker','mail-weave','mail-straw-shade','traveler-hat-light'],
  shoulders: ['mail-indigo','mail-blue','mail-rain','mail-hem'],
  coat: ['mail-indigo','mail-blue','mail-rain','mail-hem'],
  bag: ['traveler-pack','traveler-pack-light','mail-flap','traveler-leather'],
} as const;

export const travelerRainMaterial = (part:string, key:string): string => {
  const group = part==='head' ? 'hat' : part==='body' && (POSTAL_RAIN_MATERIALS.bag as readonly string[]).includes(key) ? 'bag'
    : part==='arm' ? 'shoulders' : part==='body' ? 'coat' : undefined;
  return group&&(POSTAL_RAIN_MATERIALS[group] as readonly string[]).includes(key) ? `traveler-rain/${group}/${key}` : key;
};
