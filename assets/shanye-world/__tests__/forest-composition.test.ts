import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { add, normalize, projectPoint, subtract } from '../../controller/geometry.ts';
import { createTravelController } from '../../controller/travel-controller.ts';
import { EMPTY_INPUT, type TravelStatus, type Vec3 } from '../../controller/types.ts';
import { observePhoto } from '../../entry/engine-helper.ts';
import { createJourney } from '../../journey/journey.ts';
import { evaluateFrame } from '../../journey/photography.ts';
import { FOREST_CHIME, FOREST_CHIME_PROXY_IDS, FOREST_PHOTO, FOREST_PHOTO_STATION } from '../forest-composition.ts';
import { FOREST_FRAME_BOXES, detailObstacles } from '../scene-details.ts';
import { resolveMove, STATIC_OBSTACLES, terrainHeight, traceSegment } from '../world-layout.ts';

function statusAt(x: number, z: number, target: Vec3): TravelStatus {
  const position: Vec3 = [x, terrainHeight(x, z), z], eye = add(position, [0, 1.64, 0]);
  return { ...createTravelController({ spawn: position, terrainHeight }).snapshot(), position, mode: 'photo',
    camera: { position: eye, forward: normalize(subtract(target, eye)), up: [0, 1, 0], verticalFovRadians: Math.PI / 3, aspect: 16 / 9 } };
}
const station = FOREST_PHOTO_STATION;

describe('forest physical composition', () => {
  it('derives the subject from the actual bronze shell and shares every solid with physics', () => {
    const shell=FOREST_FRAME_BOXES.filter(b=>FOREST_CHIME_PROXY_IDS.has(b.id));
    expect(shell).toHaveLength(4);
    for(let axis=0;axis<3;axis++){
      expect(Math.min(...shell.map(b=>b.center[axis]!-b.size[axis]!/2))).toBeCloseTo(FOREST_CHIME.position[axis]!-FOREST_CHIME.size[axis]!/2,8);
      expect(Math.max(...shell.map(b=>b.center[axis]!+b.size[axis]!/2))).toBeCloseTo(FOREST_CHIME.position[axis]!+FOREST_CHIME.size[axis]!/2,8);
    }
    expect(FOREST_FRAME_BOXES.filter(b=>b.id==='forest-chime-post')).toHaveLength(1);
    expect(FOREST_FRAME_BOXES.some(b=>b.id.startsWith('forest-frame-'))).toBe(false);
    for (const part of FOREST_FRAME_BOXES) {
      const collider = STATIC_OBSTACLES.find(o => o.id === part.id);
      expect(collider, part.id).toEqual(part.solid ? detailObstacles([part])[0] : undefined);
    }
  });

  it.each([60,42])('keeps the two real subjects separate and complete at %s degree field of view',degrees=>{
    const s=statusAt(...station.feet,station.target);s.camera.verticalFovRadians=degrees*Math.PI/180;
    const observation=observePhoto(s),bell=observation.anchors['forest-chime']!,mill=observation.anchors.windmill!;
    expect(evaluateFrame(createJourney(),observation,'forest'),JSON.stringify(observation.anchors)).toMatchObject({matched:true});
    expect(bell.width).toBeLessThan(.06);
    expect(Math.abs(bell.x-mill.x)).toBeGreaterThan(mill.width/2+bell.width/2);
    expect(bell.depth).toBeLessThan(mill.depth*.8);
    for(const subject of [bell,mill]){
      expect(subject.x-subject.width/2).toBeGreaterThan(.035);expect(subject.x+subject.width/2).toBeLessThan(.965);
      expect(subject.y-subject.height/2).toBeGreaterThan(.035);expect(subject.y+subject.height/2).toBeLessThan(.965);
    }
  });

  it('keeps the established frontal main-card station valid without weakening visibility rejection', () => {
    expect(evaluateFrame(createJourney(), observePhoto(statusAt(-170, -49.5, [-170, 46.5, -25])), 'forest').matched).toBe(true);
    const blocked = statusAt(-178.5, -41, FOREST_CHIME.position);
    expect(observePhoto(blocked).anchors['forest-chime']!.occluded).toBe(true);
    expect(evaluateFrame(createJourney(), observePhoto(blocked), 'forest').matched).toBe(false);
    const backwards = statusAt(...station.feet, station.target);
    backwards.camera.forward = backwards.camera.forward.map(v => -v) as unknown as Vec3;
    expect(evaluateFrame(createJourney(), observePhoto(backwards), 'forest').matched).toBe(false);
  });

  it('walks from the existing arrival to the new photo spot and through the opening normally', () => {
    const c = createTravelController({ spawn: [-170, terrainHeight(-170, -49.5), -49.5], terrainHeight, resolveMove, traceSegment });
    for (const target of [station.feet, [-170, -49.5], [-170, -35], [-170, -49.5]]) {
      let frames = 0;
      while (Math.hypot(c.snapshot().position[0] - target[0]!, c.snapshot().position[2] - target[1]!) > .12 && frames++ < 900) {
        const s = c.snapshot(), yaw = Math.atan2(target[0]! - s.position[0], -(target[1]! - s.position[2]));
        c.submitInput({ ...EMPTY_INPUT, vertical: 1, lookActive: true, lookX: Math.atan2(Math.sin(yaw - s.yaw), Math.cos(yaw - s.yaw)) / .0022 });
        c.step(1 / 60);
      }
      expect(frames, `blocked at ${c.snapshot().position} toward ${target}`).toBeLessThan(900);
    }
  });

  it('keeps the ordinary-input QA station data synchronized without game-control imports', () => {
    for (const file of ['scripts/journey-full-playthrough.mjs', 'scripts/qa/p0-route-plan.mjs']) {
      const source = readFileSync(file, 'utf8'), match = source.match(/forestPhoto:\s*\{\s*feet:\s*(\[[^\]]+\]),\s*target:\s*(\[[^\]]+\])/);
      expect(match, file).not.toBeNull();
      expect(JSON.parse(match![1]!)).toEqual(station.feet);
      expect(JSON.parse(match![2]!)).toEqual(station.target);
    }
  });
});
