import { describe, expect, it } from 'vitest';
import { add, cross, distance, dot, normalize, subtract } from '../../controller/geometry.ts';
import { createTravelController } from '../../controller/travel-controller.ts';
import type { Vec3 } from '../../controller/types.ts';
import { createWeatherTransition, type EnvironmentSnapshot } from '../../environment/weather.ts';
import { sunDiscShape } from '../../environment/sun-disc.ts';
import { createJourney, reduceJourney } from '../../journey/journey.ts';
import { evaluatePostPorchFrame } from '../../journey/photography.ts';
import { toPresentationView } from '../../journey/presentation-adapter.ts';
import { evaluatePhotoCheckIn } from '../../journey/photo-outings.ts';
import { SOURCE_BUNDLES } from '../../shanye-world/pipeline-sources.ts';
import { compilePipelineBundles } from '../../shanye-world/pipeline-import.ts';
import { POST_PORCH_PHOTO, firstPostSurface, projectPostSubject } from '../../shanye-world/post-photo.ts';
import { terrainHeight, traceSegment } from '../../shanye-world/world-layout.ts';
import { observeAppliedPhoto, appliedPhotoScene } from '../journey-host.ts';
import { poseFromController } from '../engine-helper.ts';

// Rules-only fixture. It is not a rendered original or real capture receipt.
const thumbnail = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC9sAAAAASUVORK5CYII=';
const original = { key: 'unit-post-porch-photo', width: 1920, height: 1080, mime: 'image/jpeg' as const, bytes: 10000 };
function at(x = 2, z = -214, backwards = false) {
  const feet: Vec3 = [x, terrainHeight(x, z), z], direction = normalize(subtract(POST_PORCH_PHOTO.view.target, add(feet, [0, 1.64, 0])));
  const controller = createTravelController({ spawn: feet, terrainHeight, traceSegment,
    initialYaw: Math.atan2(direction[0], -direction[2]) + (backwards ? Math.PI : 0), initialPitch: -Math.asin(direction[1]) });
  controller.toggleCamera(); return controller.snapshot();
}
function environment(position: Vec3, weather: 'morning' | 'rain' | 'afterglow' = 'morning'): EnvironmentSnapshot {
  const values = createWeatherTransition(weather).step(weather, 0, false, { day: 1, minute: 930 });
  return { ...values, exposure: 0, revision: 1, frozen: false, rainVisible: 0, sheltered: false,
    sunDisc: sunDiscShape(position, values.solar, values.sunVisibility) };
}
function framed(status = at()) {
  const env = environment(status.camera.position), observation = observeAppliedPhoto(status, env);
  let state = reduceJourney(createJourney(poseFromController(status)), { type: 'start' }).state;
  state = reduceJourney(state, { type: 'open-camera' }).state;
  state = reduceJourney(state, { type: 'set-context', nearby: null, observation }).state;
  return { state, observation, scene: appliedPhotoScene(status, env) };
}

// Independently consume the exact Native Mesh output installed by world.pack.
// This catches source coordinate/pivot changes that a source-only test would miss.
const compiled = compilePipelineBundles(SOURCE_BUNDLES.filter(b => b.id === 'post-office'));
const nativeTriangles: { entity: string; material: string; a: Vec3; b: Vec3; c: Vec3 }[] = [];
for (const [key, entity] of Object.entries(compiled.entities)) {
  const mesh = compiled.resources[`mesh/${key}`], origin = entity.components.Transform!.pos!;
  if (mesh?.kind !== 'mesh' || !(mesh.attributes.position instanceof Float32Array) || !mesh.indices || !Array.isArray(origin))
    throw new Error('Expected the installed postal Native Mesh');
  const positions = mesh.attributes.position;
  const vertex = (index: number): Vec3 => [positions[index * 3]! + origin[0]!, positions[index * 3 + 1]! + origin[1]!, positions[index * 3 + 2]! + origin[2]!];
  for (const section of mesh.submeshes) for (let i = section.indexOffset; i < section.indexOffset + section.indexCount; i += 3)
    nativeTriangles.push({ entity: key.split('/').at(-1)!.replaceAll('-', '_'),
      material: mesh.materialSlots[section.materialSlot]!.slotName.replace(/^pipeline-/, '').replace(/-\d+$/, ''),
      a: vertex(mesh.indices[i]!), b: vertex(mesh.indices[i + 1]!), c: vertex(mesh.indices[i + 2]!) });
}
function nativeFirstSurface(origin: Vec3, destination: Vec3) {
  const direction = subtract(destination, origin); let first: typeof nativeTriangles[number] | null = null, fraction = Infinity;
  for (const triangle of nativeTriangles) {
    const e1 = subtract(triangle.b, triangle.a), e2 = subtract(triangle.c, triangle.a), h = cross(direction, e2), determinant = dot(e1, h);
    if (Math.abs(determinant) < 1e-8) continue;
    const inverse = 1 / determinant, s = subtract(origin, triangle.a), u = inverse * dot(s, h);
    if (u < 0 || u > 1) continue;
    const q = cross(s, e1), v = inverse * dot(direction, q);
    if (v < 0 || u + v > 1) continue;
    const t = inverse * dot(e2, q);
    if (t >= 0 && t <= 1 && t < fraction) { first = triangle; fraction = t; }
  }
  return first ? { entity: first.entity, material: first.material, fraction } : null;
}

describe('postal farewell uses the actual door frame and eave', () => {
  it.each([-.5, 0, .5])('the recommended viewpoint offset %sm meets actual wood and fascia triangles', offset => {
    const status = at(2 + offset);
    for (const subject of [POST_PORCH_PHOTO.door, POST_PORCH_PHOTO.eave]) for (const sample of subject.samples) {
      const native = nativeFirstSurface(status.camera.position, sample), observed = firstPostSurface(status.camera.position, sample);
      expect(native!.entity).toBe(subject.entity); expect(observed!.entity).toBe(native!.entity);
      expect(observed!.fraction).toBeCloseTo(native!.fraction, 7);
      expect(native!.material).toBe(subject === POST_PORCH_PHOTO.eave ? 'roofdark' : sample === subject.samples[0] ? 'wood' : 'wooddark');
      expect(distance(observed!.point, sample)).toBeLessThan(.15);
    }
    expect(evaluatePostPorchFrame(observeAppliedPhoto(status, environment(status.camera.position)))).toMatchObject({ matched: true, proximity: 1 });
  });
  it.each(['morning', 'rain', 'afterglow'] as const)('offers the real optional composition in %s without a weather lock', weather => {
    const status = at(), observation = observeAppliedPhoto(status, environment(status.camera.position, weather));
    expect(observation.vantageTags).toContain('post-porch-view');
    expect(evaluatePostPorchFrame(observation)).toMatchObject({ matched: true, proximity: 1, hint: expect.stringContaining('构图 100%') });
  });
  it('rejects real back-wall and porch-post occlusion, a reverse view, and cropped framing', () => {
    const back = at(-3, -250);
    expect(projectPostSubject(back.camera, POST_PORCH_PHOTO.door, traceSegment).occluded).toBe(true);
    const post = at(2.25, -230);
    expect(projectPostSubject(post.camera, POST_PORCH_PHOTO.door, traceSegment).occluded).toBe(true);
    const reverse = at(2, -214, true);
    expect(evaluatePostPorchFrame(observeAppliedPhoto(reverse, environment(reverse.camera.position))).matched).toBe(false);
    const cropped = at(); cropped.camera.verticalFovRadians = .1;
    expect(evaluatePostPorchFrame(observeAppliedPhoto(cropped, environment(cropped.camera.position))).matched).toBe(false);
    const outside = at(2, -200);
    expect(observeAppliedPhoto(outside, environment(outside.camera.position)).vantageTags).not.toContain('post-porch-view');
  });
  it('still honors an intervening world solid even when the postal mesh is visible', () => {
    const status = at(), projected = projectPostSubject(status.camera, POST_PORCH_PHOTO.eave, (a, b) =>
      ({ hit: true, fraction: .5, distance: distance(a, b) / 2, point: add(a, subtract(b, a).map(n => n / 2) as unknown as Vec3), obstacle: 'intervening-world-solid' }));
    expect(projected.occluded).toBe(true); expect(projected.visibleFraction).toBe(0);
  });
  it('shows 100% as optional advice without an invented old card or tutorial match', () => {
    const { state, observation, scene } = framed(), view = toPresentationView(state);
    expect(view.camera).toMatchObject({ ready: true, alignment: 1, referenceVisible: false, feedback: expect.stringContaining('廊前告别') });
    expect(view.camera.target).toBeUndefined();
    const taken = reduceJourney(state, { type: 'take-photo', observation, scene, thumbnail, original }).state;
    expect(taken.durable.tutorial.photoTaken).toBe(true);
    expect(taken.durable.tutorial.compositionMatched).toBe(false);
    expect(taken.durable.film.at(-1)!).toMatchObject({ original, tutorialMatch: false, matchedCards: [] });
    expect(taken.durable.stamps).toEqual({ forest: false, town: false });
  });
  it('keeps ordinary first photography and the existing daily doorway rule independent of the optional eave', () => {
    const { state, observation, scene } = framed(at(2, -214, true));
    expect(toPresentationView(state).camera.ready).toBe(false);
    const free = reduceJourney(state, { type: 'take-photo', observation, scene, thumbnail, original }).state;
    expect(free.durable.tutorial.photoTaken).toBe(true); expect(free.durable.film).toHaveLength(1);
    const good = framed(), noEave = { ...good.observation, anchors: { ...good.observation.anchors } };
    delete noEave.anchors['post-eave'];
    expect(evaluatePostPorchFrame(noEave).matched).toBe(false);
    const daily = reduceJourney(good.state, { type: 'take-photo', observation: noEave, scene: good.scene, thumbnail, original }).state;
    expect(daily.durable.checkIns).toHaveLength(1);
    expect(evaluatePhotoCheckIn({ photo: daily.durable.film.at(-1)!, observation: noEave, clock: good.scene.clock!, weather: good.scene.weather,
      gateOpened: false, checkIns: [], creativeMode: false, captured: true }).matched).toBe(true);
    good.state.durable.trackedPhotoSpot = 'post-porch';
    expect(toPresentationView(good.state).outings!.tracked!.compositionHint).toContain('日程留影只需门窗清楚入镜');
  });
});
