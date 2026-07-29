/**
 * Background shaders: a deep-space dome and soft star-point sprites.
 *
 * The dome renders a domain-warped nebula in three colour families, carved by
 * dark dust lanes and concentrated into a Milky-Way-like band with a brighter
 * core direction. It is deliberately kept an order of magnitude dimmer than the
 * star so it reads as depth behind the subject, never as competition for it —
 * but unlike a flat gradient it gives the camera something to move against, so
 * orbiting actually feels like orbiting.
 *
 * Star points are a separate additive Points cloud (see Background.ts) with
 * per-star colour, magnitude and twinkle, a soft circular core, and diffraction
 * spikes on the brightest few — the cue that reads as "bright star" rather than
 * "large dot".
 */

import * as THREE from 'three';
import { NOISE_GLSL } from './noise.glsl.ts';

export interface NebulaUniforms {
  uTime: { value: number };
  uMode: { value: number }; // 0 cinematic, 1 scientific, 2 lab, 3 grid
  uIntensity: { value: number };
}

const DOME_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const DOME_FRAG = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform float uTime;
uniform float uMode;
uniform float uIntensity;

${NOISE_GLSL}

void main() {
  vec3 d = normalize(vDir);

  if (uMode > 2.5) {
    // Grid / lab modes: essentially black; the dome contributes nothing.
    gl_FragColor = vec4(0.0);
    return;
  }

  // ── galactic band ─────────────────────────────────────────────────────────
  // A plane tilted off the spin axis so the band cuts the frame diagonally
  // rather than lining up with the star's equator.
  vec3 galNormal = normalize(vec3(0.34, 0.86, -0.38));
  float bandDist = abs(dot(d, galNormal));
  float band = exp(-bandDist * bandDist * 11.0);
  // A brighter "core" region in one direction along the band.
  vec3 coreDir = normalize(vec3(-0.72, -0.16, 0.68));
  float core = pow(max(dot(d, coreDir), 0.0), 3.0);

  // ── domain-warped nebulosity ──────────────────────────────────────────────
  vec3 w = vec3(
    snoise(d * 1.7 + 3.0),
    snoise(d * 1.7 + 29.0),
    snoise(d * 1.7 + 61.0)
  );
  vec3 p = d * 2.3 + w * 0.75;

  float n1 = fbm(p * 0.9 + 11.0, 5, 2.0, 0.55);
  float n2 = fbm(p * 2.4 - 5.0, 5, 2.0, 0.5);
  float n3 = fbm(p * 5.5 + 44.0, 4, 2.1, 0.5);

  float neb = smoothstep(-0.05, 0.72, n1 * 0.62 + n2 * 0.28 + n3 * 0.10);
  // Nebulosity clings to the galactic plane.
  neb *= 0.22 + 1.05 * band;
  neb += core * 0.30 * band;

  // Dark dust lanes carve into the nebula, strongest right along the band.
  float dust = smoothstep(0.30, 0.72, fbm(p * 3.2 + 30.0, 4, 2.2, 0.5));
  neb *= (1.0 - 0.78 * dust * (0.35 + 0.65 * band));

  // ── colour ────────────────────────────────────────────────────────────────
  // Three families mixed by the mid-frequency field: cold steel blue for the
  // bulk, a violet emission tint, and teal where dust thins out.
  vec3 steel  = vec3(0.055, 0.105, 0.235);
  vec3 violet = vec3(0.150, 0.070, 0.230);
  vec3 teal   = vec3(0.040, 0.170, 0.205);
  vec3 hue = mix(violet, teal, clamp(n2 * 0.5 + 0.5, 0.0, 1.0));
  vec3 col = mix(steel, hue, clamp(n1 * 0.6 + 0.5, 0.0, 1.0));

  // A faint warm lift in the galactic core direction, the only warm note in the
  // whole palette — it keeps the sky from reading as monochrome blue.
  col += vec3(0.16, 0.10, 0.05) * core * band;

  // Baseline sky glow so the frame is never pure black even away from the band.
  vec3 skyFloor = vec3(0.007, 0.011, 0.024) * (0.5 + 0.9 * band);

  // Scientific mode: desaturate and dim further for a sober backdrop.
  if (uMode > 0.5 && uMode < 1.5) {
    float g = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(col, vec3(g), 0.6) * 0.5;
    skyFloor *= 0.5;
  }

  vec3 outCol = col * neb * uIntensity + skyFloor;
  gl_FragColor = vec4(outCol, 1.0);
}
`;

export function createNebulaMaterial(uniforms: NebulaUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: DOME_VERT,
    fragmentShader: DOME_FRAG,
    uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
    side: THREE.BackSide,
    depthWrite: false,
  });
}

// ── Star points ─────────────────────────────────────────────────────────────

export const STAR_POINT_VERT = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
attribute float aTwinkle;
varying vec3 vColor;
varying float vTwinkle;
varying float vMag;
uniform float uPixelRatio;
uniform float uTime;
void main() {
  vColor = aColor;
  // Two beat frequencies so the field never pulses in unison.
  float ph = aTwinkle * 6.2831;
  vTwinkle = 0.68 + 0.20 * sin(uTime * 1.5 + ph) + 0.12 * sin(uTime * 3.7 + ph * 2.3);
  vMag = clamp((aSize - 1.6) / 3.2, 0.0, 1.0); // 0 faint → 1 brightest
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  // Size attenuates gently with distance but is clamped so far stars stay points.
  gl_PointSize = aSize * uPixelRatio * (340.0 / max(1.0, -mv.z));
  gl_PointSize = clamp(gl_PointSize, 1.0, 16.0);
}
`;

export const STAR_POINT_FRAG = /* glsl */ `
precision highp float;
varying vec3 vColor;
varying float vTwinkle;
varying float vMag;
void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float r = length(uv);

  // Soft circular falloff → round stars with a gentle halo, never hard squares.
  float core = exp(-r * r * 60.0);
  float glow = exp(-r * r * 9.0);

  // Diffraction spikes, scaled by magnitude: only genuinely bright stars get
  // them, which is exactly the cue the eye uses to rank stellar brightness.
  vec2 a = abs(uv);
  float spike = exp(-a.x * 55.0) * exp(-a.y * a.y * 90.0)
              + exp(-a.y * 55.0) * exp(-a.x * a.x * 90.0);
  spike *= vMag * vMag * 0.55;

  // Trim the disc at the sprite edge so no square corner ever shows; the spikes
  // carry their own falloff and are allowed to reach further out.
  float disc = (core * 0.95 + glow * 0.42) * smoothstep(0.5, 0.40, r);
  float alpha = clamp(disc + spike, 0.0, 1.6) * vTwinkle;

  gl_FragColor = vec4(vColor * alpha, alpha);
}
`;
