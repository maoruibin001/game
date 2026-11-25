import { describe, expect, it, vi } from 'vitest';
import { World } from '@forgeax/engine/ecs';
import { PointLight, PointLightShadow } from '@forgeax/engine/render';
import { Transform } from '@forgeax/engine/scene';
import { installPostalLantern, POSTAL_LANTERN_POSITION } from '../postal-lantern.ts';

describe('native post-office point shadow', () => {
  it('pairs the anchored emitter and a single cube only near the lit lamp', () => {
    const world = new World();
    for (const component of [Transform, PointLight, PointLightShadow]) world.components.register(component).unwrap();
    const spawn = vi.spyOn(world, 'spawn');
    const lantern = installPostalLantern(world);
    const emitter = spawn.mock.results[0]!.value.unwrap();
    const near = [-9.5,14.5,-225] as const;
    expect(Array.from(world.get(emitter,Transform).unwrap().pos)).toEqual(
      POSTAL_LANTERN_POSITION.map(Math.fround),
    );

    lantern.update(0,near);
    expect(world.hasComponent(emitter,PointLightShadow)).toBe(false);
    expect(world.get(emitter,PointLight).unwrap().intensity).toBe(0);

    lantern.update(1,near);
    expect(world.get(emitter,PointLight).unwrap()).toMatchObject({intensity:86,range:15,decay:2});
    expect(world.get(emitter,PointLightShadow).unwrap()).toMatchObject({
      mapSize:512, pcfKernelSize:1, shadowAutoUpdate:true, shadowProjection:0,
    });
    lantern.update(1,[-9.5,14.5,-199]);
    expect(world.hasComponent(emitter,PointLightShadow)).toBe(true);
    lantern.update(1,[-9.5,14.5,-193]);
    expect(world.hasComponent(emitter,PointLightShadow)).toBe(false);
    expect(world.get(emitter,PointLight).unwrap().intensity).toBe(86);
    lantern.update(1,near);
    expect(world.hasComponent(emitter,PointLightShadow)).toBe(true);
    lantern.update(0,near);
    expect(world.hasComponent(emitter,PointLightShadow)).toBe(false);
    lantern.dispose();
    expect(world.get(emitter,PointLight).ok).toBe(false);
  });
});
