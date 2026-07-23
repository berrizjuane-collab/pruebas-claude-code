/**
 * Pulsar beam shader — a soft, volumetric emission cone (one per magnetic pole).
 *
 * The geometry is a cone whose apex sits at the star; the shader shapes it into a
 * glowing beam that is bright on-axis, falls off toward the cone wall (soft
 * edges, NOT a hard laser), thins with distance, and carries faint internal
 * filament structure that drifts over time. Additive, depth-write off.
 *
 * Colour is a deliberate visual translation — real beams radiate mostly in radio
 * / X-ray / gamma bands, which the UI states explicitly.
 */

import * as THREE from 'three';
import { NOISE_GLSL } from './noise.glsl.ts';

export interface BeamUniforms {
  uTime: { value: number };
  uIntensity: { value: number };
  uWidth: { value: number }; // relative half-width used for edge softness
  uColor: { value: THREE.Color };
  uLength: { value: number };
}

const VERT = /* glsl */ `
varying vec3 vLocal;
varying float vAxial; // 0 at apex (star) → 1 at far end
void main() {
  vLocal = position;
  // Cone is built along +Y with apex at origin; height stored in uLength.
  vAxial = clamp(position.y, 0.0, 1.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = /* glsl */ `
precision highp float;
varying vec3 vLocal;
varying float vAxial;

uniform float uTime;
uniform float uIntensity;
uniform float uWidth;
uniform vec3  uColor;

${NOISE_GLSL}

void main() {
  // Radial distance from the cone axis, normalised by the local cone radius.
  float radius = length(vLocal.xz);
  float coneR = mix(0.02, 1.0, vAxial); // widens with distance
  float rn = radius / max(coneR, 1e-3);

  // Soft radial falloff — Gaussian-ish, softened by uWidth.
  float edge = exp(-rn * rn * (5.0 - uWidth * 3.0));

  // Longitudinal falloff: bright near the star, fading outward.
  float along = pow(1.0 - vAxial, 1.4);

  // Internal filament structure, drifting outward over time.
  vec3 np = vec3(vLocal.xz * 6.0, vAxial * 4.0 - uTime * 0.6);
  float fil = 0.6 + 0.4 * fbm(np, 4, 2.0, 0.5);

  float a = edge * along * fil * uIntensity;
  // A brighter hot core along the very axis.
  a += exp(-rn * rn * 14.0) * along * uIntensity * 0.6;

  vec3 col = uColor * (0.7 + 0.6 * (1.0 - vAxial));
  gl_FragColor = vec4(col * a, a);
}
`;

export function createBeamMaterial(uniforms: BeamUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}
