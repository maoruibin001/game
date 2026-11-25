import { describe, expect, it } from 'vitest';
import { createTravelController } from '../../controller/travel-controller.ts';
import { EMPTY_INPUT } from '../../controller/types.ts';
import { nearPlayableBoundary, resolveMove, ROCK_PLACEMENTS, rockGroundOnRestore, SCENERY_PLACEMENTS, STATIC_OBSTACLES, terrainHeight, traceSegment, type Vec3 } from '../world-layout.ts';

const rock = STATIC_OBSTACLES.filter(box => box.id.startsWith('scenery-rock-810-'));
const foot = (x:number,z:number):Vec3 => [x,terrainHeight(x,z),z];

describe('east slope boulder and valley edge',()=>{
  it('blocks the old clipping position and repairs an earlier save in the rendered ledge',()=>{
    const oldPosition=foot(385.159,-159.054);
    const contact=traceSegment([385.159,101.1,-160.75],[385.159,101.1,-159.054],0);
    expect(contact.obstacle).toBe(rock[1]?.id);
    const restoredY=rockGroundOnRestore(oldPosition[0],oldPosition[2]);
    expect(restoredY).toBeCloseTo(rock[2]!.max[1]+.015);
    expect(traceSegment([oldPosition[0],restoredY+.22,oldPosition[2]],[oldPosition[0],restoredY+1.85,oldPosition[2]],0).hit).toBe(false);
  });

  it('reaches every exposed tier with ordinary jumps and restores the summit height',()=>{
    const controller=createTravelController({spawn:foot(383.65,-161.1),terrainHeight,resolveMove,traceSegment,restoreGround:rockGroundOnRestore});
    function approach(x:number,z:number,jump=true){
      const before=controller.snapshot(),yaw=Math.atan2(x-before.position[0],before.position[2]-z);
      controller.submitInput({...EMPTY_INPUT,lookActive:true,lookX:(yaw-before.yaw)/.0022});
      controller.submitInput({...EMPTY_INPUT,jump,vertical:1,steerCharacter:true});
      for(let step=0;step<75;step++){
        const [px,,pz]=controller.snapshot().position;
        if(Math.hypot(px-x,pz-z)<.085)break;
        controller.step(1/60);
      }
      controller.submitInput({...EMPTY_INPUT});
      for(let step=0;step<45;step++)controller.step(1/60);
      return controller.snapshot();
    }
    expect(approach(383.65,-160.38).position[1]).toBeCloseTo(rock[0]!.max[1]+.015);
    expect(approach(383.65,-159.63).position[1]).toBeCloseTo(rock[1]!.max[1]+.015);
    expect(approach(383.65,-158.72).position[1]).toBeCloseTo(rock[2]!.max[1]+.015);
    approach(384.15,-158.72,false);
    const summit=approach(384.15,-157.45);
    expect(summit.grounded).toBe(true);
    expect(summit.position[1]).toBeCloseTo(rock[3]!.max[1]+.015);
    controller.restore(summit.position,summit.yaw);
    expect(controller.snapshot().position).toEqual(summit.position);
  });

  it('warns at each of the four edges before the actual movement limit',()=>{
    expect(nearPlayableBoundary(foot(385.159,-159.054))).toBe(false);
    for(const [x,z] of [[388,0],[-388,0],[0,388],[0,-388]] as const){
      const current=foot(x,z),next=resolveMove(current,[Math.sign(x)*8,0,Math.sign(z)*8]);
      expect(nearPlayableBoundary(current)).toBe(true);
      expect(Math.abs(x?next[0]:next[2])).toBeCloseTo(389.72);
    }
  });
});


describe('stepped rocks on uneven ground', () => {
  it('makes the south meadow foothold reachable with the original jump', () => {
    const first = STATIC_OBSTACLES.find(box => box.id === 'scenery-rock-227-0')!;
    const x = first.max[0] + .28, z = -325.4;
    const controller = createTravelController({
      spawn: foot(x, z), initialYaw: -Math.PI / 2, terrainHeight, resolveMove, traceSegment,
    });
    controller.submitInput({ ...EMPTY_INPUT, jump: true, vertical: 1 });
    for (let i = 0; i < 21; i++) controller.step(1 / 60);
    controller.submitInput(EMPTY_INPUT);
    for (let i = 0; i < 42; i++) controller.step(1 / 60);
    expect(controller.snapshot().position[1]).toBeCloseTo(first.max[1] + .015);
    expect(controller.snapshot().grounded).toBe(true);
  });

  it('fits the floating east ridge footholds to the slope and keeps their visible shape solid', () => {
    for (const index of [1936, 1979]) {
      const original = SCENERY_PLACEMENTS[index]!;
      const placed = ROCK_PLACEMENTS[index]!;
      expect(placed.yaw).not.toBe(original.yaw);
      expect(placed.tiers).toHaveLength(4);
      const first = STATIC_OBSTACLES.find(box => box.id === `scenery-rock-${index}-0`)!;
      const z = (first.min[2] + first.max[2]) / 2;
      const x = first.min[0] - .28;
      expect(first.max[1] - terrainHeight(x, z)).toBeLessThan(.95);
      expect(traceSegment([x, first.max[1] - .05, z], [(first.min[0] + first.max[0]) / 2, first.max[1] - .05, z], 0).obstacle).toBe(first.id);
    }
  });
});
