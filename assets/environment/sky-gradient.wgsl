#define_import_path shanye::sky_gradient

#import forgeax_view::common::{FullscreenOutput, view}
#import forgeax_material::parameters::{material}

@vertex
fn vs_main(@location(0) position: vec3<f32>) -> FullscreenOutput {
  var out: FullscreenOutput;
  out.position = vec4<f32>(position.xy, 0.0, 1.0);
  out.uv = vec2<f32>(position.x, position.y);
  return out;
}

@fragment
fn fs_main(in: FullscreenOutput) -> @location(0) vec4<f32> {
  let worldPoint = view.inverseViewProj * vec4<f32>(in.uv, 0.5, 1.0);
  let direction = normalize(worldPoint.xyz / worldPoint.w - view.cameraPos);
  let elevation = direction.y;
  let horizonWeight = exp(-max(elevation, 0.0) * 6.0);
  let skyWeight = smoothstep(-0.06, 0.02, elevation);
  // A small forward-scattering lobe in the sky itself. Occluding geometry
  // already writes depth, so the lobe never brightens buildings or terrain.
  let alignment = max(dot(direction, normalize(-view.lightDir)), 0.0);
  let glow = pow(alignment, 420.0) * 0.19 + pow(alignment, 1800.0) * 0.16;
  let sky = mix(material.zenith, material.horizon, horizonWeight)
    + vec3<f32>(1.0, 0.77, 0.44) * glow * material.sunAir;
  return vec4<f32>(mix(material.ground, sky, skyWeight), 1.0);
}
