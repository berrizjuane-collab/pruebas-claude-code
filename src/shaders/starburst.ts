/**
 * Starburst pass: the optical signature of a genuinely bright point source.
 *
 * Bloom alone cannot make something look brilliant — it only spreads light that
 * is already there, so past a certain radius it reads as fog. What the eye (and
 * a camera) actually uses to judge "this is intensely bright" is the *structure*
 * around the source: diffraction spikes from the aperture blades, an anamorphic
 * streak from a cylindrical element, and a tight ghost halo. Those are additive
 * artefacts of the optics, not of the subject, so they are generated procedurally
 * from the star's screen position rather than filtered out of the frame buffer.
 *
 * The whole effect scales with the star's apparent radius and fades out as it
 * fills the frame — an aperture star over a surface close-up would be absurd.
 */

import * as THREE from 'three';

export const StarburstShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    /** Star centre in screen uv. */
    uStarScreen: { value: new THREE.Vector2(0.5, 0.5) },
    /** Apparent star radius in uv (vertical). */
    uStarRadius: { value: 0.1 },
    uAspect: { value: 1.0 },
    uStrength: { value: 1.0 },
    /** Rises when a beam sweeps the observer, so the flare pulses with the pulse. */
    uFlare: { value: 0.0 },
    uTime: { value: 0.0 },
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
    uniform float uAspect;
    uniform float uStrength;
    uniform float uFlare;
    uniform float uTime;

    void main() {
      vec3 col = texture2D(tDiffuse, vUv).rgb;

      if (uStrength > 0.001) {
        // Work in aspect-corrected space so the burst is radially symmetric.
        vec2 d = (vUv - uStarScreen) * vec2(uAspect, 1.0);
        float r = length(d);
        float R = max(uStarRadius, 0.004);

        // Fade in over distance from the star's edge, and fade the whole effect
        // out once the star is large in frame.
        float scale = smoothstep(0.32, 0.06, uStarRadius);
        float amp = uStrength * scale * (0.75 + 0.85 * uFlare);

        if (amp > 0.001) {
          float ang = atan(d.y, d.x);

          // Everything here is an artefact of the lens, so it must not be drawn
          // over the subject: gate it to outside the star's disc, or the spikes
          // read as an asterisk stamped on a coin.
          float outside = smoothstep(R * 0.88, R * 1.35, r);

          // ── six-vane diffraction spikes ──────────────────────────────────
          // Sharpened cosine lobes, with a slow rotation so the burst is not a
          // dead decal pinned to the screen.
          float vane = abs(cos(ang * 3.0 + uTime * 0.06));
          float spikes = pow(vane, 30.0);
          // Length falls off as 1/r², the way a real spike tapers.
          float spikeFall = R / (R + r * 6.5);
          spikes *= spikeFall * spikeFall;

          // ── anamorphic horizontal streak ─────────────────────────────────
          // Kept short. A streak that reaches the frame edge stops reading as a
          // lens artefact and starts reading as a horizon line drawn across the
          // sky, which is what the first pass at this looked like.
          float streak = exp(-abs(d.y) / (R * 0.16)) * exp(-abs(d.x) / (R * 1.3));

          // ── tight ghost halo hugging the limb ────────────────────────────
          float halo = exp(-pow(max(r - R, 0.0) / (R * 1.4), 1.35));

          vec3 spikeCol = vec3(0.70, 0.86, 1.0);
          vec3 streakCol = vec3(0.48, 0.70, 1.0);

          col += spikeCol * spikes * 1.35 * amp * outside;
          col += streakCol * streak * 0.30 * amp * outside;
          col += spikeCol * halo * 0.10 * amp * outside;
        }
      }

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};
