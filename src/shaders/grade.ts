/**
 * Final cinematic grade, applied after bloom and before the output pass.
 *
 * Four cheap, purely cosmetic effects that together do most of the work of
 * making a WebGL frame look photographed rather than rendered:
 *
 *  - lateral chromatic aberration, scaling with distance from the optical axis,
 *    as a real lens does;
 *  - a soft vignette, which also stops the corners of the star field from
 *    competing with the subject;
 *  - a gentle contrast S-curve with a slight blue lift in the shadows, keeping
 *    deep space cold without crushing it to pure black;
 *  - fine animated grain, the single most effective cure for the banding that
 *    smooth dark gradients always produce on 8-bit displays.
 *
 * All four are driven by uniforms rather than hard-coded, so the whole grade can
 * be dialled down in one call if a future mode ever needs an unretouched frame.
 */

import * as THREE from 'three';

export const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uAberration: { value: 1.0 },
    uVignette: { value: 1.0 },
    uGrain: { value: 1.0 },
    uContrast: { value: 1.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uAberration;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uContrast;

    // Hash-without-sine (Dave Hoskins). A sin-based hash aliases into visible
    // diagonal stripes at screen-pixel frequencies — exactly the moiré that film
    // grain is supposed to hide — so the grain needs a genuinely flat hash.
    float hash(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);

      // ── chromatic aberration: zero on axis, growing toward the corners ─────
      vec3 col;
      if (uAberration > 0.001) {
        vec2 off = c * r2 * 0.008 * uAberration;
        col.r = texture2D(tDiffuse, vUv + off).r;
        col.g = texture2D(tDiffuse, vUv).g;
        col.b = texture2D(tDiffuse, vUv - off).b;
      } else {
        col = texture2D(tDiffuse, vUv).rgb;
      }

      // ── contrast S-curve ──────────────────────────────────────────────────
      // This pass runs on linear HDR, before tone mapping, so the curve must be
      // split: x²(3-2x) is only an S-curve on [0,1] and turns negative above it.
      // Applying it to raw HDR would crush whichever channel is brightest — on a
      // blue-white star that means the highlights invert to orange.
      //
      // Note there is deliberately NO shadow lift. Space is black, and a lifted
      // floor is what made the earlier version read as a hazy studio backdrop
      // rather than as vacuum.
      if (uContrast > 0.001) {
        vec3 lo = min(col, vec3(1.0));
        vec3 over = max(col - 1.0, vec3(0.0));
        vec3 graded = lo * lo * (3.0 - 2.0 * lo) + over;
        col = mix(col, graded, 0.34 * uContrast);
      }

      // ── vignette ──────────────────────────────────────────────────────────
      if (uVignette > 0.001) {
        float v = smoothstep(1.05, 0.18, r2 * 2.0);
        col *= mix(1.0, 0.34 + 0.66 * v, uVignette);
      }

      // ── grain: breaks up banding in the large dark gradients ──────────────
      if (uGrain > 0.001) {
        // Decorrelate the two axes per frame so successive frames don't share a
        // pattern (which would read as a static screen door rather than grain).
        vec2 jitter = vec2(fract(uTime * 13.71), fract(uTime * 7.33)) * 512.0;
        float n = hash(gl_FragCoord.xy + jitter) - 0.5;
        // Scale with luminance and clamp at zero: grain must never push a black
        // pixel above black, or the "pure black" falls apart into static.
        float lum = dot(col, vec3(0.299, 0.587, 0.114));
        float amt = smoothstep(0.0, 0.06, lum) * (0.006 + 0.013 * smoothstep(0.0, 0.4, lum));
        col = max(col + n * amt * uGrain, vec3(0.0));
      }

      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
  `,
};
