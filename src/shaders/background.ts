/**
 * Deep-sky background: a real galactic sky rather than decorative nebulosity.
 *
 * The previous version painted saturated blue clouds across the whole dome,
 * which is not what the sky looks like and left nothing genuinely black to make
 * the star read as bright. This one is built the way the real thing is built:
 *
 *  - the sky is BLACK. There is no ambient floor, no colour wash. Everything
 *    visible is either a resolved star or unresolved starlight;
 *  - the Milky Way is the integrated light of stars too faint to resolve, so it
 *    is rendered as a near-neutral cream glow — never blue — concentrated into a
 *    thin disc plus a fainter thick disc, with a brighter, warmer bulge toward
 *    the galactic centre;
 *  - dark nebulae cut the band. Interstellar dust does not add colour, it
 *    subtracts light, so the lanes are applied as extinction (multiplying the
 *    glow down toward zero) rather than as dark paint;
 *  - the glow carries fine high-frequency granularity, because unresolved
 *    starlight is grainy at the limit of resolution and a smooth gradient is the
 *    single biggest giveaway of a fake sky.
 *
 * Resolved stars are a separate additive Points cloud (see Background.ts).
 */

import * as THREE from 'three';
import { NOISE_GLSL } from './noise.glsl.ts';

export interface NebulaUniforms {
  uTime: { value: number };
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
uniform float uIntensity;

${NOISE_GLSL}

// Galactic plane normal and the direction of the bulge. Kept in sync with
// GAL_NORMAL / GAL_CORE in Background.ts so the resolved stars share the band.
const vec3 GAL_NORMAL = vec3(0.3237, 0.8188, -0.4750);
const vec3 GAL_CORE   = vec3(-0.7107, -0.1579, 0.6712);

void main() {
  vec3 d = normalize(vDir);

  // Height above the galactic mid-plane, in radians of arc.
  float h = dot(d, GAL_NORMAL);

  // Thin disc + thick disc. Two exponentials, as the real vertical light
  // distribution is: a bright narrow core with a broad faint envelope. Both are
  // tight — the band subtends only a few degrees, and a wide one immediately
  // reads as a painted backdrop rather than as a galaxy seen edge-on.
  float thin  = exp(-h * h * 1100.0);
  float thick = exp(-h * h * 95.0);
  float band  = thin * 0.66 + thick * 0.34;

  // Longitude: the far side of the disc is much fainter than the bulge side.
  float lon = dot(d, GAL_CORE);
  float bulge = exp(-pow(max(1.0 - lon, 0.0) * 1.45, 2.0));
  float arm = 0.30 + 0.70 * smoothstep(-0.85, 0.95, lon);

  // ── unresolved starlight ──────────────────────────────────────────────────
  // Almost smooth, with only gentle large-scale variation. The graininess of the
  // band comes from the 30k resolved star points that share this plane, not from
  // noise in here: layering high-frequency noise on the dome produced a regular
  // scaly ripple, which is a texture, not a galaxy.
  vec3 p = d * 3.4;
  float clumps = fbm(p + 13.0, 4, 2.1, 0.55) * 0.5 + 0.5;
  float swirl  = fbm(p * 2.6 + 71.0, 3, 2.2, 0.5) * 0.5 + 0.5;
  float texture = 0.80 + 0.14 * clumps + 0.09 * swirl;

  float glow = band * arm * texture;
  glow += band * bulge * 0.55 * texture;

  // ── extinction: dust removes light, it does not add colour ────────────────
  // Warped fbm at two scales, soft-thresholded, and gated by the band profile so
  // dust can only remove light where there is light to remove.
  //
  // fbm rather than ridged: ridged noise builds long continuous crests, which on
  // a sphere read as contour lines drawn across the sky — the previous version
  // produced exactly that wood-grain ripple. fbm gives irregular clouds instead.
  vec3 wp = d * 4.0 + vec3(
    snoise(d * 2.2 + 5.0),
    snoise(d * 2.2 + 37.0),
    snoise(d * 2.2 + 91.0)
  ) * 1.2;
  float rift = fbm(wp, 5, 2.1, 0.55) * 0.5 + 0.5;             // broad rifts
  float filament = fbm(wp * 3.1 + 17.0, 4, 2.2, 0.5) * 0.5 + 0.5; // finer structure
  float dust = smoothstep(0.44, 0.80, rift * 0.74 + filament * 0.26);
  dust *= exp(-h * h * 220.0);
  float extinction = clamp(dust * 0.88, 0.0, 0.88) * clamp(band * 1.7, 0.0, 1.0);
  glow *= (1.0 - extinction);

  // ── colour ────────────────────────────────────────────────────────────────
  // Integrated starlight is close to neutral, running slightly warm; the bulge
  // is older and redder, and dust reddens whatever shines through it a little.
  vec3 diffuse = vec3(0.95, 0.97, 1.00);
  vec3 core    = vec3(1.00, 0.965, 0.920);
  vec3 col = mix(diffuse, core, clamp(bulge * 0.5, 0.0, 1.0));
  col = mix(col, vec3(1.00, 0.94, 0.88), extinction * 0.08); // reddening

  // Deliberately low: the band should be a presence you notice, not a subject.
  vec3 outCol = col * glow * uIntensity;

  // No ambient floor. Away from the band this returns exact black, which is what
  // lets the star and the resolved stars carry the entire dynamic range.
  gl_FragColor = vec4(max(outCol, 0.0), 1.0);
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

// ── Resolved stars ──────────────────────────────────────────────────────────

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
  // Scintillation: three incommensurate frequencies so no two stars share a
  // rhythm and the field never pulses as a whole.
  float ph = aTwinkle * 6.2831;
  vTwinkle = 0.70
           + 0.16 * sin(uTime * 1.30 + ph)
           + 0.09 * sin(uTime * 3.10 + ph * 2.7)
           + 0.05 * sin(uTime * 7.70 + ph * 5.1);
  vMag = clamp((aSize - 2.2) / 4.2, 0.0, 1.0); // 0 faint → 1 brightest
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  // Screen size does NOT fall off with the shell's distance. These stars stand in
  // for objects effectively at infinity, so their apparent size must not depend
  // on which parallax shell they happen to live in — attenuating by depth made
  // the outer shells collapse to single dim pixels and the sky look empty.
  // The aSize attribute is therefore already expressed in device pixels.
  gl_PointSize = clamp(aSize * uPixelRatio, 1.0, 26.0);
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

  // Airy-ish core plus a wide faint skirt: a hard-edged disc is what makes
  // procedural star fields look like confetti.
  float core = exp(-r * r * 110.0);
  float glow = exp(-r * r * 16.0);
  float skirt = exp(-r * r * 4.0);

  // Four-vane diffraction spikes, gated hard on magnitude so only the handful of
  // genuinely bright stars get them — that contrast is the brightness cue.
  vec2 a = abs(uv);
  float spike = exp(-a.x * 46.0) * exp(-a.y * a.y * 150.0)
              + exp(-a.y * 46.0) * exp(-a.x * a.x * 150.0);
  spike *= pow(vMag, 3.0) * 0.7;

  float disc = (core + glow * 0.40 + skirt * 0.10) * smoothstep(0.5, 0.36, r);
  float alpha = clamp(disc + spike, 0.0, 2.2) * vTwinkle;

  // Bright stars saturate toward white at the very centre, as film does.
  vec3 col = mix(vColor, vec3(1.0), core * vMag * 0.55);

  gl_FragColor = vec4(col * alpha, alpha);
}
`;
