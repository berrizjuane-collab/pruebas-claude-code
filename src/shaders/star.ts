/**
 * Neutron-star surface shader.
 *
 * The surface is fully procedural so it holds up under extreme close-ups (no
 * baked texture to pixelate). It encodes, as an *artistic but physically
 * informed* translation:
 *   - a dense, fractured crust built from domain-warped fbm plus two families of
 *     ridged fractures, stretched along magnetic meridians because the crust is
 *     structured by the field;
 *   - a thermal map: hot, overbright caps around the two magnetic poles with a
 *     surrounding halo, cooler mid-latitudes, fine thermal mottling;
 *   - gravitational redshift, reddening the emitted colour by (1+z);
 *   - relativistic Doppler beaming: the limb rotating toward the viewer is
 *     brighter and bluer, the receding limb dimmer and redder;
 *   - limb darkening plus an optically-thick, gravitationally-brightened rim.
 *
 * Real neutron-star thermal emission peaks in X-rays; the visible-light palette
 * here is a deliberate visual translation, surfaced to the user in the UI.
 *
 * Note on range: the hot caps and fracture network are deliberately allowed to
 * exceed 1.0 so the bloom pass has something genuinely bright to catch. Keeping
 * the crust dark and letting only the caps/cracks overshoot is what makes the
 * body read as a compact, high-energy object instead of a pale sphere.
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

// Visual "blackbody-ish" ramp for a very hot (X-ray) surface, translated into a
// cold high-energy palette. Deliberately dark through the low half so the crust
// reads as dense iron, then climbs fast into cyan and white with a super-white
// overshoot reserved for the polar caps.
vec3 thermalColor(float t) {
  t = clamp(t, 0.0, 1.35);
  vec3 c0 = vec3(0.008, 0.016, 0.044); // coldest crust — near-black iron blue
  vec3 c1 = vec3(0.030, 0.075, 0.185); // deep blue
  vec3 c2 = vec3(0.090, 0.260, 0.520); // mid blue
  vec3 c3 = vec3(0.300, 0.640, 0.940); // bright cyan
  vec3 c4 = vec3(0.880, 0.970, 1.000); // white hot
  vec3 c5 = vec3(1.150, 1.180, 1.300); // overshoot — only caps/cracks reach here
  vec3 col;
  if (t < 0.26)      col = mix(c0, c1, t / 0.26);
  else if (t < 0.52) col = mix(c1, c2, (t - 0.26) / 0.26);
  else if (t < 0.74) col = mix(c2, c3, (t - 0.52) / 0.22);
  else if (t < 0.92) col = mix(c3, c4, (t - 0.74) / 0.18);
  else               col = mix(c4, c5, (t - 0.92) / 0.43);
  return col;
}

void main() {
  vec3 dir = normalize(vObjPos);
  vec3 mag = normalize(uMagAxisObject);

  // Distance-adaptive detail: fine, high-frequency structure fades in as the
  // camera approaches, so close-ups reveal NEW crust detail (not a blurry zoom).
  float dist = length(cameraPosition - vWorldPos);
  float proximity = clamp(1.0 - (dist - 1.0) / 2.5, 0.0, 1.0); // 0 far → 1 hugging surface

  // Magnetic latitude drives everything structural: the crust is stressed and
  // organised by the field, so features stretch along magnetic meridians. We get
  // that by compressing the sampling coordinate along the magnetic axis.
  float axial = dot(dir, mag);
  vec3 np = (dir * 3.2 - mag * axial * 1.5) + vec3(uSeed);

  // Domain warp: turns smooth fbm blobs into interlocking plates and ridges.
  vec3 warp = vec3(
    snoise(np * 1.05 + 19.0),
    snoise(np * 1.05 + 47.0),
    snoise(np * 1.05 + 83.0)
  );
  vec3 wp = np + warp * 0.55;

  float plates = fbm(wp * 0.75, uDetail, 2.0, 0.5);   // large thermal domains
  float grain  = fbm(wp * 6.5, uDetail, 2.1, 0.55);   // crust grain
  float micro  = proximity * fbm(wp * 28.0, uDetail, 2.1, 0.5); // close-up only

  // Two fracture families: a coarse tectonic network always visible, and a fine
  // craquelure that resolves as you approach.
  float fracture  = ridged(wp * 2.6 + plates * 0.5, uDetail, 2.2, 0.5);
  float fine      = ridged(wp * 9.0, uDetail, 2.1, 0.5);
  // The fine craquelure is faded out with distance rather than kept at a fixed
  // weight: at a few stellar radii it lands near one pixel per feature and
  // aliases into white speckle, which is worse than not drawing it at all.
  float cracks    = max(fracture, fine * (0.14 + 0.86 * proximity));
  float crackMask = smoothstep(0.56, 0.86, cracks);

  // Magnetic-pole proximity (both poles). Hot caps sit on the magnetic axis, and
  // are kept small: the real polar cap of a slow pulsar is a patch a few hundred
  // metres across on a 12 km star, so a broad bright lid would be wrong as well
  // as ugly — it would bury the crust detail under a white blob.
  float aa  = abs(axial);
  float cap = smoothstep(0.930, 0.998, aa);       // the cap proper
  float halo = smoothstep(0.720, 0.960, aa);      // warm surround bleeding out of it

  // Base thermal field — kept mostly dark so the crust reads dense, with strong
  // spatial contrast so the surface never looks uniform.
  float temp = uColorTemp * 0.58;
  temp += 0.26 * plates;                       // pronounced thermal domains
  temp += 0.09 * grain + 0.07 * micro;         // mottling + close-up crust grain
  temp += uHotCap * (halo * 0.13 + cap * 0.85); // hot caps, with a softer surround
  temp -= 0.22 * crackMask;                    // fractures read as dark grooves
  temp -= 0.05 * (1.0 - aa);                   // slightly cooler magnetic equator

  // Magnetar activity: a glowing fracture network that breathes over time. The
  // cracks flip from dark grooves to incandescent seams as the field ramps up.
  float activity = uMagnetarActivity;
  if (activity > 0.001) {
    float rate = uReducedFlashing > 0.5 ? 0.6 : 1.8;
    float pulse = 0.5 + 0.5 * sin(uTime * rate + cracks * 12.0 + plates * 4.0);
    temp += activity * crackMask * (0.55 + 0.55 * pulse);
  }
  temp = clamp(temp, 0.0, 1.35);

  vec3 color = thermalColor(temp);

  // Perturbed normal from the noise gradient → relief shading. Sampling the same
  // warped field keeps the relief consistent with the visible crust pattern.
  float e = 0.012;
  float h0 = plates + 0.6 * cracks + 0.3 * micro;
  float hx = fbm((wp + vec3(e, 0.0, 0.0)) * 0.75, uDetail, 2.0, 0.5)
           + 0.6 * ridged((wp + vec3(e, 0.0, 0.0)) * 2.6, uDetail, 2.2, 0.5);
  float hy = fbm((wp + vec3(0.0, e, 0.0)) * 0.75, uDetail, 2.0, 0.5)
           + 0.6 * ridged((wp + vec3(0.0, e, 0.0)) * 2.6, uDetail, 2.2, 0.5);
  vec3 bump = normalize(vWorldNormal + vec3(h0 - hx, h0 - hy, 0.0) * (1.3 + proximity * 1.2));

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
  float shade = 0.16 + 0.84 * ndv;
  vec3 emission = color * shade * dopplerBoost;

  // Hot caps punch through the shading so they stay overbright at any angle —
  // this is what the bloom pass latches onto.
  emission += vec3(0.55, 0.80, 1.05) * cap * uHotCap * 0.85;

  // Incandescent magnetar seams get their own additive contribution so they glow
  // rather than merely lightening.
  emission += vec3(0.55, 0.72, 1.00) * activity * crackMask * 0.9;

  // Limb: an optically-thick hot edge plus the gravitational rim glow from light
  // bent around the star. Sharpened into a genuine Fresnel rim.
  float fres = pow(1.0 - ndv, 3.5);
  float rim  = pow(1.0 - ndv, 9.0);
  emission += vec3(0.24, 0.46, 0.92) * fres * (0.55 + 1.10 * uRedshift);
  emission += vec3(0.62, 0.84, 1.10) * rim * (0.45 + 1.60 * uRedshift);

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
