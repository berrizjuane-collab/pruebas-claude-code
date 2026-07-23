/**
 * Approximate gravitational-lensing post-process pass.
 *
 * HONEST SCOPE: this is a *screen-space* approximation, not a full geodesic ray
 * trace. Around the star's projected disc it deflects background light inward
 * with a radial displacement whose magnitude follows the weak-field Schwarzschild
 * deflection angle α ≈ 2 r_s / b (light bending 4GM/(c²b)). This reproduces the
 * qualitative signature — background stars compressed into an arc/ring near the
 * limb, and light from just behind the star pulled into view — without claiming
 * to solve the exterior metric exactly. The strength is driven by the star's
 * real compactness, and the limitation is stated in the UI.
 */

import * as THREE from 'three';

export const LensingShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uStarScreen: { value: new THREE.Vector2(0.5, 0.5) },
    uStarRadius: { value: 0.15 }, // star projected radius in uv (y-normalised)
    uStrength: { value: 0.5 }, // ∝ r_s (compactness)
    uAspect: { value: 1.0 },
    uActive: { value: 1.0 },
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
    uniform vec2 uStarScreen;
    uniform float uStarRadius;
    uniform float uStrength;
    uniform float uAspect;
    uniform float uActive;

    void main() {
      if (uActive < 0.5) { gl_FragColor = texture2D(tDiffuse, vUv); return; }

      // Work in aspect-corrected space so the deflection is circular.
      vec2 d = vUv - uStarScreen;
      d.x *= uAspect;
      float r = length(d);
      vec2 dir = r > 1e-5 ? d / r : vec2(0.0);

      float R = uStarRadius;
      // Impact parameter in units of the star radius.
      float b = r / max(R, 1e-4);

      vec2 uv = vUv;
      if (b > 1.0) {
        // Exterior: deflect inward. α ≈ 2 r_s / b → displacement ∝ strength / b.
        // Confine the visible effect to a few stellar radii around the limb.
        float falloff = smoothstep(4.0, 1.0, b); // strong near limb, fades out
        float deflect = uStrength * R * (1.0 / b) * falloff * 0.6;
        vec2 disp = dir * deflect;
        disp.x /= uAspect;
        uv = vUv - disp;
      }
      // Interior of the disc is left to the star's own shader (opaque surface).

      gl_FragColor = texture2D(tDiffuse, uv);
    }
  `,
};
