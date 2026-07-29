/**
 * Star corona / limb halo.
 *
 * A camera-facing billboard centred on the star, drawn additively behind and
 * around the surface. It supplies three things the bare sphere cannot:
 *
 *  - a *limb ring*: because the star is compact, light leaving the far side is
 *    bent toward the observer, so the apparent edge is brighter than the disc
 *    and you see more than a hemisphere. The ring's strength is driven by the
 *    real compactness r_s/R, so it grows for denser stars;
 *  - a *halo*: a power-law falloff outside the limb standing in for scattered
 *    and strongly-deflected light, which is what makes the object read as a
 *    radiating source rather than a matte ball pasted onto black;
 *  - a *thermal wash* over the disc itself, tinted by the surface temperature.
 *
 * It is an artistic rendering of a real effect, not a ray-traced one — the same
 * honest-approximation caveat that applies to the lensing post pass.
 */

import * as THREE from 'three';
import { NOISE_GLSL } from './noise.glsl.ts';

export interface CoronaUniforms {
  uTime: { value: number };
  uInner: { value: number }; // star radius as a fraction of the billboard half-size
  uColor: { value: THREE.Color };
  uHotColor: { value: THREE.Color };
  uIntensity: { value: number };
  uRing: { value: number }; // limb-ring strength, from compactness
  uActivity: { value: number }; // magnetar agitation of the halo
  uReducedMotion: { value: number };
}

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;

uniform float uTime;
uniform float uInner;
uniform vec3  uColor;
uniform vec3  uHotColor;
uniform float uIntensity;
uniform float uRing;
uniform float uActivity;
uniform float uReducedMotion;

${NOISE_GLSL}

void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  if (r > 1.0) discard;

  // Normalised radius in units of the stellar radius: 1.0 sits exactly on the limb.
  float rn = r / max(uInner, 1e-3);

  // Break the perfect circle with a slow angular ripple so the halo breathes.
  float ang = atan(p.y, p.x);
  float t = uTime * (uReducedMotion > 0.5 ? 0.06 : 0.22);
  float ripple = fbm(vec3(cos(ang) * 2.2, sin(ang) * 2.2, t), 4, 2.0, 0.55);
  float wobble = 1.0 + (0.05 + 0.14 * uActivity) * ripple;
  rn /= wobble;

  // ── outer halo: power-law falloff, plus a wider, softer second lobe ────────
  float halo = 0.0;
  if (rn > 1.0) {
    float d = rn - 1.0;
    halo  = 0.34 * exp(-d * 7.0);   // tight sheath hugging the limb
    halo += 0.17 * exp(-d * 1.9);   // broad glow
    halo += 0.07 / (1.0 + d * d * 9.0); // long power-law tail
  } else {
    // Inside the disc the surface shader owns the look; add only a faint wash
    // that rises toward the edge, so the disc still feels lit from within.
    halo = 0.10 * pow(rn, 4.0);
  }

  // ── limb ring: light bent around the star piles up just outside the edge ───
  float ringPos = 1.0 + 0.055;
  float ring = exp(-pow((rn - ringPos) / 0.105, 2.0));
  halo += ring * uRing * 0.75;

  // Colour: hottest right at the limb, cooling outward into the halo.
  float heat = clamp(exp(-(max(rn, 1.0) - 1.0) * 3.2), 0.0, 1.0);
  vec3 col = mix(uColor, uHotColor, heat);

  float a = halo * uIntensity;
  // Fade the billboard out before its own square edge so it never shows a seam.
  a *= smoothstep(1.0, 0.86, r);

  gl_FragColor = vec4(col * a, a);
}
`;

export function createCoronaMaterial(uniforms: CoronaUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
    transparent: true,
    blending: THREE.AdditiveBlending,
    // Depth-tested against the scene but never writing: the star's own front
    // hemisphere occludes the inner half of the billboard, so the halo only ever
    // appears outside the silhouette and never washes out the crust detail.
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}
