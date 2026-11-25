import type { World } from '@forgeax/engine/ecs';
import { PointLight, PointLightShadow } from '@forgeax/engine/render';
import { Transform } from '@forgeax/engine/scene';
import type { Vec3 } from '../controller/types.ts';

// Just outside the front paper panel of Scene Foundry's post_lamp. Its
// opaque geometry is allowed to block this emitter from the rear.
export const POSTAL_LANTERN_POSITION = [-9.5, 19.625, -229.62] as const;
const range = 15;
const shadow = {
  mapSize: 512, nearPlane: .16, depthBias: .018, normalBias: .42,
  pcfKernelSize: 1, shadowIntensity: .95,
};

export function installPostalLantern(world: World) {
  const lamp = world.spawn(
    { component: Transform, data: { pos: POSTAL_LANTERN_POSITION } },
    { component: PointLight, data: { color: [1,.68,.32], intensity: 0, range } },
  ).unwrap();
  let previousStep = 0, shadowed = false;
  return {
    update(nightGlow: number, traveler: Vec3) {
      const step = Math.round(nightGlow * 32);
      if (step !== previousStep) {
        world.set(lamp, PointLight, { intensity: 86 * step / 32 }).unwrap();
        previousStep = step;
      }
      // Keep the light on outside the shadow update radius. At that range
      // its ground pool is well beyond the normal third-person orbit.
      const distance = Math.hypot(traveler[0]-POSTAL_LANTERN_POSITION[0], traveler[2]-POSTAL_LANTERN_POSITION[2]);
      const needsShadow = step > 0 && distance <= (shadowed ? 32 : 27);
      if (needsShadow !== shadowed) {
        if (needsShadow) world.addComponent(lamp, { component: PointLightShadow, data: shadow }).unwrap();
        else world.removeComponent(lamp, PointLightShadow).unwrap();
        shadowed = needsShadow;
      }
    },
    dispose() { world.despawn(lamp).unwrap(); },
  };
}
