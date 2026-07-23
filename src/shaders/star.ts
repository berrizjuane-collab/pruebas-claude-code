/**
 * Neutron-star surface shader.
 *
 * The surface is fully procedural so it holds up under extreme close-ups (no
 * baked texture to pixelate). It encodes, as an *artistic but physically
 * informed* translation:
 *   - a dense, non-uniform crust (fbm + ridged simplex noise) with subtle
 *     fractures whose strength is driven by magnetar activity;
 *   - a thermal map: hotter, brighter caps around the two magnetic poles,
 *     cooler mid-latitudes, with fine thermal mottling;
 *   - gravitational redshift, reddening the emitted colour by (1+z);
 *   - relativistic Doppler beaming: the limb rotating toward the viewer is
 *     brighter and bluer, the receding limb dimmer and redder;
 *   - limb darkening / a faint gravitational rim glow.
 *
 * Real neutron-star thermal emission peaks in X-rays; the visible-light palette
 * here is a deliberate visual translation, surfaced to the user in the UI.
 */

import * as THREE from 'three';
import { NOISE_GLSL } from './noise.glsl.ts';

export interface StarUniforms {
  uTime: { value: number };
  uColorTemp: { value: number }; // normalised temperature 0..1
  uHotCap: { value: number }; // polar-cap intensity 0..1
  uMagAxisObject: { value: THREE.Vector3 }; // magnetic axis in object space
  uSpinAxisWorld: { value: THREE.Vector3 };
  uCenterWorld: { value: THREE.Vector3 };
  uBeta: { value: number }; // equatorial v/c
  uRedshift: { value: number };
  uDetail: { value: number }; // noise octaves
  uMagnetarActivity: { value: number }; // 0..1
  uSeed: { value: number };
  uReducedFlashing: { value: number }; // 0 or 1
}

const VERT = /* glsl */ `
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vObjPos;

void main() {
  vObjPos = normalize(position);
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
precision highp float;

varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vObjPos;

uniform float uTime;
uniform float uColorTemp;
uniform float uHotCap;
uniform vec3  uMagAxisObject;
uniform vec3  uSpinAxisWorld;
uniform vec3  uCenterWorld;
uniform float uBeta;
uniform float uRedshift;
uniform int   uDetail;
uniform float uMagnetarActivity;
uniform float uSeed;
uniform float uReducedFlashing;

${NOISE_GLSL}

// Visual "blackbody-ish" ramp tuned to the app's cold, high-energy palette:
// deep near-black blue crust → dark cyan → cyan → white-hot → blue-white.
// Starts dark so the crust reads as dense and only caps/cracks approach white.
// This is a visual translation of a very hot (X-ray) surface.
vec3 thermalColor(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 c0 = vec3(0.015, 0.035, 0.085); // coldest crust — near black blue
  vec3 c1 = vec3(0.05, 0.13, 0.29);    // dark blue
  vec3 c2 = vec3(0.20, 0.46, 0.72);    // cyan-blue
  vec3 c3 = vec3(0.85, 0.95, 1.00);    // white hot
  vec3 c4 = vec3(0.72, 0.86, 1.12);    // blue-white overshoot
  vec3 col;
  if (t < 0.30)      col = mix(c0, c1, t / 0.30);
  else if (t < 0.62) col = mix(c1, c2, (t - 0.30) / 0.32);
  else if (t < 0.85) col = mix(c2, c3, (t - 0.62) / 0.23);
  else               col = mix(c3, c4, (t - 0.85) / 0.15);
  return col;
}

void main() {
  vec3 dir = normalize(vObjPos);
  vec3 np = dir * 2.2 + vec3(uSeed);

  // Distance-adaptive detail: fine, high-frequency structure fades in as the
  // camera approaches, so close-ups reveal NEW crust detail (not a blurry zoom).
  float dist = length(cameraPosition - vWorldPos);
  float proximity = clamp(1.0 - (dist - 1.0) / 2.5, 0.0, 1.0); // 0 far → 1 hugging surface

  // Crust: large-scale temperature domains + fine mottling + ridged fractures.
  float domains = fbm(np * 1.4, uDetail, 2.0, 0.5);
  float fine    = fbm(np * 8.0, uDetail, 2.0, 0.55);
  float micro   = proximity * fbm(np * 26.0, uDetail, 2.1, 0.55); // close-up only
  float cracks  = ridged(np * 5.5 + domains, uDetail, 2.1, 0.5);

  // Magnetic-pole proximity (both poles). Hot caps sit on the magnetic axis.
  float axial = abs(dot(dir, normalize(uMagAxisObject)));
  float cap = smoothstep(0.84, 0.995, axial);

  // Base thermal field — kept mostly in the dark/mid range for a dense crust,
  // with strong spatial contrast so the surface never looks uniform.
  float temp = uColorTemp * 0.72;
  temp += 0.20 * domains;                     // pronounced thermal domains
  temp += 0.07 * fine + 0.05 * micro;         // mottling + close-up grain
  temp += uHotCap * cap * 0.6;                // bright polar caps
  temp -= 0.16 * smoothstep(0.45, 0.85, cracks); // dark crust fractures/grooves
  temp -= 0.06 * (1.0 - axial);               // slightly cooler magnetic equator

  // Magnetar activity: glowing fracture network that breathes over time.
  float activity = uMagnetarActivity;
  if (activity > 0.001) {
    float crackMask = smoothstep(0.58, 0.82, cracks);
    float pulse = 0.5 + 0.5 * sin(uTime * (uReducedFlashing > 0.5 ? 0.6 : 1.8) + cracks * 12.0);
    temp += activity * crackMask * (0.4 + 0.4 * pulse);
  }
  temp = clamp(temp, 0.0, 1.25);

  vec3 color = thermalColor(temp);

  // Perturbed normal from the noise gradient → relief shading.
  float e = 0.015;
  float h0 = domains + 0.5 * cracks + 0.3 * micro;
  float hx = fbm((dir + vec3(e,0.0,0.0)) * 3.08 + uSeed, uDetail, 2.0, 0.5)
           + 0.5 * ridged((dir + vec3(e,0.0,0.0)) * 5.5, uDetail, 2.1, 0.5);
  float hy = fbm((dir + vec3(0.0,e,0.0)) * 3.08 + uSeed, uDetail, 2.0, 0.5)
           + 0.5 * ridged((dir + vec3(0.0,e,0.0)) * 5.5, uDetail, 2.1, 0.5);
  vec3 bump = normalize(vWorldNormal + vec3(h0 - hx, h0 - hy, 0.0) * (0.9 + proximity));

  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  float ndv = clamp(dot(bump, viewDir), 0.0, 1.0);

  // Relativistic Doppler beaming from rotation. Local surface velocity direction
  // = Ω × r; brightness ∝ (1 - β·n)^(-3) (approx.), colour shifts with LOS speed.
  vec3 r = vWorldPos - uCenterWorld;
  vec3 vdir = cross(uSpinAxisWorld, r);
  float vlen = length(vdir);
  vec3 los = normalize(uCenterWorld - cameraPosition);
  float losSpeed = (vlen > 1e-5) ? uBeta * dot(normalize(vdir), -los) : 0.0; // + = toward viewer
  float dopplerBoost = clamp(pow(max(0.25, 1.0 - losSpeed), -3.0), 0.6, 1.9);
  color.b *= 1.0 + 0.25 * losSpeed;
  color.r *= 1.0 - 0.22 * losSpeed;

  // Emission model: self-luminous, but with real relief-driven contrast so the
  // body has form and the crust reads as dense rather than a flat white ball.
  float shade = 0.22 + 0.78 * ndv;
  vec3 emission = color * shade * dopplerBoost;

  // Limb: a hot optically-thick edge + a faint gravitational rim glow (light bent
  // around the star). Grows toward the silhouette.
  float limb = pow(1.0 - ndv, 3.0);
  emission += vec3(0.30, 0.52, 0.95) * limb * (0.5 + 0.9 * uRedshift);

  // Gravitational redshift: reduce blue, lift red, and dim slightly by 1/(1+z).
  float z = uRedshift;
  emission.r *= 1.0 + 0.22 * z;
  emission.b *= 1.0 / (1.0 + 0.35 * z);
  emission /= (1.0 + 0.22 * z);

  gl_FragColor = vec4(max(emission, 0.0), 1.0);
}
`;

/** Build the star ShaderMaterial with sensible defaults. */
export function createStarMaterial(uniforms: StarUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
    // The surface is opaque and self-lit.
    lights: false,
  });
}
