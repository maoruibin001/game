import { INPUT_SNAPSHOT_RESOURCE_KEY, snapshotFromSample } from '@forgeax/engine/input';
import { Camera, perspective } from '@forgeax/engine/render';
import { describe, expect, it } from 'vitest';
import { pluginFixture } from '../../shared/__tests__/plugin-fixture.ts';
import { installTravelController } from '../forgeax-controller.ts';

/** SDK snapshots and native Update/FixedUpdate, without a browser or direct shutter calls. */
describe('photography input across a journal pause', () => {
  async function fixture() {
    const { world, ctx, entity } = await pluginFixture();
    world.components.register(Camera).unwrap();
    world.addComponent(entity('camera'), { component: Camera, data: perspective({ fov: Math.PI / 3, aspect: 16 / 9 }) }).unwrap();
    let allowed = true;
    const actions: string[] = [];
    const handle = installTravelController({ world, host: ctx.gameHost!, player: entity('player'), camera: entity('camera'), spawn: [0, 0, 0], terrainHeight: () => 0,
      inputAllowed: () => allowed,
      onAction(event) { actions.push(event.type); if (event.type === 'journal') { allowed = false; handle.controller.setPaused(true); } },
    });
    const frame = (codes: string[] = [], count = 1) => {
      for (let i = 0; i < count; i++) {
        world.insertResource(INPUT_SNAPSHOT_RESOURCE_KEY, snapshotFromSample({ downKeys: new Set(), upKeys: new Set(), downCodes: new Set(codes), buttons: [false, false, false], movementX: 0, movementY: 0, wheelDelta: 0, focused: true, pointerLocked: false }));
        world.update(1 / 60).unwrap();
      }
    };
    const resume = () => { allowed = true; handle.controller.setPaused(false); };
    const dispose = async () => { handle.dispose(); await ctx.fiber.dispose(); };
    frame(['KeyC']); frame();
    return { controller: handle.controller, actions, frame, resume, dispose };
  }

  it('accepts the first new shutter after returning from a long journal pause', async () => {
    const f = await fixture();
    try {
      // A normal press held for three engine frames, then ~80 ms released.
      f.frame(['Space'], 3); f.frame([], 5);
      f.frame(['KeyJ'], 3); f.frame([], 198);
      expect(f.controller.snapshot().paused).toBe(true);
      expect(f.actions.filter(x => x === 'shutter')).toHaveLength(1);
      // Escape is owned/cleared by the modal; eight resumed input frames are empty.
      f.resume(); f.frame([], 8);
      expect(f.controller.snapshot().paused).toBe(false);
      f.frame(['Space'], 3); f.frame([], 5);
      expect(f.actions.filter(x => x === 'shutter')).toHaveLength(2);
    } finally { await f.dispose(); }
  });

  it('still suppresses held input across the modal and repeated held shutter frames', async () => {
    const f = await fixture();
    try {
      f.frame(['Space'], 3); f.frame([], 5); f.frame(['KeyJ']);
      f.frame(['Space'], 198); f.resume(); f.frame(['Space'], 30);
      expect(f.actions.filter(x => x === 'shutter')).toHaveLength(1);
      f.frame(); f.frame(['Space'], 30);
      expect(f.actions.filter(x => x === 'shutter')).toHaveLength(2);
    } finally { await f.dispose(); }
  });
});
