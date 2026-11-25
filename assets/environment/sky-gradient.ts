import { createMeshBuilder } from '@forgeax/engine/geometry';
import { RenderQueue, type MaterialAsset } from '@forgeax/engine/types';
import { WEATHER, type WeatherValues } from './weather.ts';

export function skyGradientValues({ zenith, horizon, ground }: WeatherValues, sunAir = 0) {
  return { zenith, horizon, ground, sunAir };
}

export const skyGradientMaterial: MaterialAsset = {
  kind: 'material',
  parameters: [
    { name: 'zenith', type: 'vec3' },
    { name: 'horizon', type: 'vec3' },
    { name: 'ground', type: 'vec3' },
    { name: 'sunAir', type: 'f32' },
  ],
  values: skyGradientValues(WEATHER.morning),
  passes: [{
    name: 'forward',
    program: {
      module: 'shanye::sky_gradient',
      vertexEntry: 'vs_main',
      fragmentEntry: 'fs_main',
      bindings: 'render-material',
    },
    renderState: {
      tags: { LightMode: 'Forward' },
      queue: RenderQueue.Background,
      cullMode: 'none',
      depthWriteEnabled: false,
      depthCompare: 'equal',
    },
  }],
};

export function skyGradientMesh() {
  // Clip-space triangle. The world bounds follow the camera so any heading
  // intersects the bounds used by the ordinary mesh visibility check.
  return createMeshBuilder({
    attributes: { position: new Float32Array([-1, -1, -1, 3, -1, 1, -1, 3, 1]) },
    submeshes: [{ indexOffset: 0, indexCount: 0, vertexCount: 3, topology: 'triangle-list', materialSlot: 0 }],
  }).build().unwrap();
}

export function skyFillColor({ zenith, horizon, ground }: WeatherValues) {
  // Approximate the broad diffuse response of the authored sky, including a
  // small contribution from the ground. The probe retains its angular shape.
  return [0, 1, 2].map(channel =>
    zenith[channel]! * .64 + horizon[channel]! * .30 + ground[channel]! * .06);
}
