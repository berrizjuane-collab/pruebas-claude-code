/**
 * Background shaders: a subtle nebula/dust dome and soft star-point sprites.
 *
 * The dome renders faint, low-saturation nebulosity and dark dust lanes so the
 * sky reads as deep space rather than a flat gradient — deliberately understated
 * so it never competes with the star. Star points are drawn as a separate
 * additive Points cloud (see Background.ts) with per-star colour/size and a soft
 * circular falloff, avoiding the "big flat circle" look.
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

  // Two nebula families in cool, muted hues; large scale, low frequency.
  float n1 = fbm(d * 1.6 + 11.0, 5, 2.0, 0.55);
  float n2 = fbm(d * 3.1 - 5.0, 5, 2.0, 0.5);
  float neb = smoothstep(0.15, 0.9, n1 * 0.6 + n2 * 0.4);

  // Dark dust lanes carve into the nebula.
  float dust = smoothstep(0.4, 0.75, fbm(d * 4.0 + 30.0, 4, 2.2, 0.5));
  neb *= (1.0 - 0.7 * dust);

  vec3 cool = vec3(0.04, 0.08, 0.17);
  vec3 violet = vec3(0.10, 0.05, 0.16);
  vec3 cyan = vec3(0.04, 0.13, 0.16);
  vec3 col = mix(cool, mix(violet, cyan, n2 * 0.5 + 0.5), neb);

  // Scientific mode: desaturate and dim further for a sober backdrop.
  if (uMode > 0.5 && uMode < 1.5) {
    float g = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(col, vec3(g), 0.6) * 0.5;
  }

  float strength = neb * uIntensity;
  gl_FragColor = vec4(col * strength, 1.0);
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
uniform float uPixelRatio;
uniform float uTime;
void main() {
  vColor = aColor;
  vTwinkle = 0.75 + 0.25 * sin(uTime * 1.5 + aTwinkle * 6.2831);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  // Size attenuates gently with distance but is clamped so far stars stay points.
  gl_PointSize = aSize * uPixelRatio * (300.0 / max(1.0, -mv.z));
  gl_PointSize = clamp(gl_PointSize, 0.6, 9.0);
}
`;

export const STAR_POINT_FRAG = /* glsl */ `
precision highp float;
varying vec3 vColor;
varying float vTwinkle;
void main() {
  // Soft circular falloff → round stars with a gentle halo, never hard squares.
  vec2 uv = gl_PointCoord - 0.5;
  float r = length(uv);
  float core = smoothstep(0.5, 0.0, r);
  float glow = exp(-r * r * 7.0);
  float a = clamp(core * 0.7 + glow * 0.5, 0.0, 1.0) * vTwinkle;
  gl_FragColor = vec4(vColor * a, a);
}
`;
