import { describe, expect, it } from 'vitest';
import { forwardFor, projectPoint } from '../../controller/geometry.ts';
import type { CameraPose, TraceSegment } from '../../controller/types.ts';
import { LENS_FOV } from '../../shared/photography-contract.ts';
import { createTravelController } from '../../controller/travel-controller.ts';
import { openingMountainCount } from '../opening-envelope.ts';
import { postalLookoutCamera, postalLookoutEyeHeight, POSTAL_EYE_RISE, POSTAL_LOOKOUT_PITCH } from '../postal-lookout.ts';
import { traceSegment, terrainHeight, WORLD } from '../world-layout.ts';

const cameraAt = (x: number, z: number, yaw = WORLD.spawnYaw): CameraPose => ({
  position: [x, terrainHeight(x, z) + 1.64, z],
  forward: forwardFor(yaw, -.16), up: [0, 1, 0],
  aspect: 16 / 9, verticalFovRadians: LENS_FOV.standard,
});

describe('actual-envelope forced perspective', () => {
  it('changes the number of visible mountain tips as a player shifts and approaches', () => {
    expect(openingMountainCount(cameraAt(9.75, -230.25), traceSegment)).toBe(0);
    // The view that formerly counted a tip grazing the paper tab as a hit.
    expect(openingMountainCount(cameraAt(10.064, -230.061), traceSegment)).toBe(0);
    expect(openingMountainCount(cameraAt(10.135, -230.078), traceSegment)).toBe(1);
    expect(openingMountainCount(cameraAt(10.349, -230.129), traceSegment)).toBe(2);
    expect(openingMountainCount(cameraAt(10.5, -229.5), traceSegment)).toBe(2);
  });

  it('has a broad, ordered zero/one/two-crest progression for ordinary A/D travel', () => {
    const porch = createTravelController({ spawn: WORLD.spawn, initialYaw: WORLD.spawnYaw, terrainHeight,
      traceSegment, initialPitch: POSTAL_LOOKOUT_PITCH, walkingCameraFrame: postalLookoutCamera, landscapeEyeHeight: postalLookoutEyeHeight });
    porch.toggleCamera();
    for (let tick=0;tick<3;tick++) porch.updateCamera(.1);
    const first = porch.snapshot().camera;
    const at = (lateral: number, forward = 0): CameraPose => {
      const [x, y, z] = first.position;
      return { ...first, position: [
        x - Math.cos(WORLD.spawnYaw) * lateral + Math.sin(WORLD.spawnYaw) * forward,
        y,
        z - Math.sin(WORLD.spawnYaw) * lateral - Math.cos(WORLD.spawnYaw) * forward,
      ] };
    };
    expect(openingMountainCount(first, traceSegment)).toBe(0);
    for (const distance of [.28, .38, .49, .55]) {
      expect(openingMountainCount(at(distance), traceSegment)).toBe(1);
    }
    for (const distance of [.73, .88, 1.03, 1.18, 1.33, 1.47]) {
      expect(openingMountainCount(at(distance), traceSegment)).toBe(2);
    }
    for (const depth of [-.12, .12]) {
      expect(openingMountainCount(at(.43, depth), traceSegment)).toBe(1);
      expect(openingMountainCount(at(.96, depth), traceSegment)).toBe(2);
    }
    expect(openingMountainCount(at(1.86), traceSegment)).toBe(0);
  });

  it('frames the seal near the lower third in both views, with a clear walk toward the exit', () => {
    const options = { spawn: WORLD.spawn, initialYaw: WORLD.spawnYaw, initialPitch: POSTAL_LOOKOUT_PITCH, terrainHeight, traceSegment };
    const ordinary = createTravelController(options);
    const porch = createTravelController({ ...options, walkingCameraFrame: postalLookoutCamera, landscapeEyeHeight: postalLookoutEyeHeight });
    const seal = [-23.65, 26 + POSTAL_EYE_RISE, -244.332] as const;
    const walkingY = projectPoint(porch.snapshot().camera, seal).y;
    expect(walkingY).toBeGreaterThan(.60);
    expect(walkingY).toBeLessThan(.70);
    expect(porch.snapshot().avatarVisible).toBe(true);
    ordinary.toggleCamera();
    const walkingCamera=porch.snapshot().camera;
    porch.toggleCamera();
    expect(porch.snapshot().photoRaising).toBe(true);
    expect(porch.snapshot().camera.position).toEqual(walkingCamera.position);
    const middle=porch.updateCamera(.1);
    expect(middle.position[2]).toBeGreaterThan(walkingCamera.position[2]);
    expect(middle.position[2]).toBeLessThan(WORLD.spawn[2]);
    porch.updateCamera(.1);porch.updateCamera(.03);
    expect(porch.snapshot().photoRaising).toBeUndefined();
    expect(porch.snapshot().camera.position[1] - ordinary.snapshot().camera.position[1]).toBeCloseTo(POSTAL_EYE_RISE);
    expect(porch.snapshot().camera.forward).toEqual(ordinary.snapshot().camera.forward);
    const handheldY = projectPoint(porch.snapshot().camera, seal).y;
    expect(handheldY).toBeGreaterThan(.60);
    expect(handheldY).toBeLessThan(.70);
    expect(traceSegment([-26, 25.35, -248], [-25.20, 25.35, -240.4], .28).hit).toBe(false);

    const crossroads = [0, terrainHeight(0, -220), -220] as const;
    porch.restore(crossroads);
    ordinary.restore(crossroads);
    expect(porch.snapshot().camera).toEqual(ordinary.snapshot().camera);
    porch.toggleCamera();
    expect(porch.snapshot().photoRaising).toBeUndefined();
    expect(porch.snapshot().camera.position[1] - crossroads[1]).toBeCloseTo(1.64);
    porch.restore(WORLD.spawn, WORLD.spawnYaw, POSTAL_LOOKOUT_PITCH);
    expect(porch.snapshot().pitch).toBe(POSTAL_LOOKOUT_PITCH);
  });

  it('requires visible sky between both crests', () => {
    const centered = cameraAt(10.349, -230.129);
    const coverSaddle: TraceSegment = (from, to, clearance) => {
      if (to[2] > 200 && to[0] > 150 && to[0] < 156) return {hit:true, point:from, distance:0, fraction:0};
      return traceSegment(from, to, clearance);
    };
    expect(openingMountainCount(centered, coverSaddle)).toBe(1);
  });

  it('leaves a cropped or physically obstructed photograph unrelated to the letter', () => {
    const centered = cameraAt(10.5, -229.5);
    expect(openingMountainCount(cameraAt(10.5, -229.5, WORLD.spawnYaw + 1.4), traceSegment)).toBeUndefined();
    expect(openingMountainCount(centered, (from, to, clearance) => {
      if (to[2] > 0) return {hit:true, point:from, distance:0, fraction:0};
      return traceSegment(from, to, clearance);
    })).toBeUndefined();
  });
});
