/**
 * Pulsar beam shader — a volumetric emission cone (one per magnetic pole).
 *
 * The geometry is a cone whose apex sits at the star; the shader shapes it into a
 * glowing beam that is:
 *
 *  - HOLLOW. Real pulsar beams are widely modelled as hollow cones: the emission
 *    comes from the last open field lines bounding the polar cap, so the bright
 *    part is an annulus around the magnetic axis rather than a filled pencil.
 *    That is also why many observed pulse profiles are double-peaked — the line
 *    of sight cuts the cone wall twice. We render a bright wall plus a weaker
 *    "core" component, which is the standard core/cone decomposition;
 *  - soft-edged, never a hard laser;
 *  - filled with drifting filaments (sub-pulse drift) that spiral with the
 *    co-rotating plasma;
 *  - brightest at the base and fading outward as the flux tube expands.
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
  uHotColor: { value: THREE.Color };
  uLength: { value: number };
  uFlare: { value: number }; // 0..1, how squarely the beam faces the observer
  uReducedMotion: { value: number };
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
uniform vec3  uHotColor;
uniform float uFlare;
uniform float uReducedMotion;

${NOISE_GLSL}

void main() {
  // Radial distance from the cone axis, normalised by the local cone radius.
  float radius = length(vLocal.xz);
  float coneR = mix(0.02, 1.0, vAxial); // widens with distance
  float rn = radius / max(coneR, 1e-3);
  float azim = atan(vLocal.z, vLocal.x);

  float t = uTime * (uReducedMotion > 0.5 ? 0.3 : 1.0);

  // ── hollow cone: emission concentrated on the wall of the flux tube ────────
  // The wall sits a little inside the geometric edge and softens with uWidth.
  float wallPos = 0.74;
  float wallW = 0.16 + uWidth * 0.55;
  float wall = exp(-pow((rn - wallPos) / wallW, 2.0));
  // The far side of the wall must not spill outside the cone.
  wall *= smoothstep(1.18, 0.92, rn);

  // ── core component: a weaker filled pencil along the very axis ────────────
  float core = exp(-rn * rn * 9.0);

  // ── longitudinal profile ──────────────────────────────────────────────────
  // Bright at the base, then a slow decay so the beam actually reaches out into
  // the frame instead of dying within a stellar radius.
  float along = exp(-vAxial * 1.5) * 0.75 + 0.25 * (1.0 - vAxial);

  // ── drifting sub-pulse filaments, spiralling with the co-rotating plasma ──
  vec3 np = vec3(cos(azim) * 2.4, sin(azim) * 2.4, vAxial * 5.0 - t * 0.9);
  float fil = 0.62 + 0.38 * fbm(np, 4, 2.1, 0.5);
  // A slow spiral striping keyed to azimuth reads as rotation of the flux tube.
  float spiral = 0.82 + 0.18 * sin(azim * 3.0 - vAxial * 7.0 + t * 1.6);

  float a = (wall * 1.15 * fil * spiral + core * 0.55) * along * uIntensity;

  // Hot white-blue on the axis and while the cone sweeps the observer; the cone
  // wall itself stays saturated blue, or the whole beam washes out to grey.
  float heat = clamp(core * 0.9 + wall * 0.18 + uFlare * 0.5, 0.0, 1.0);
  vec3 col = mix(uColor, uHotColor, heat);
  // Slight blue-shift toward the base where the plasma is densest.
  col *= 0.85 + 0.45 * (1.0 - vAxial);

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
