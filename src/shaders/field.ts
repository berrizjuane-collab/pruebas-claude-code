/**
 * Glowing field-line / particle shaders.
 *
 * Field lines carry two per-vertex attributes: `aFade` (how bright this stretch
 * should be, so lines dim toward their apex) and `aArc` (normalised position
 * along the line). `aArc` drives travelling brightness pulses, which is what
 * makes a static dipole geometry read as an energised, co-rotating magnetosphere
 * rather than a wireframe. `uPulse` adds the magnetar "breathing" on top.
 */

import * as THREE from 'three';

export interface FieldLineUniforms {
  uColor: { value: THREE.Color };
  uHotColor: { value: THREE.Color };
  uOpacity: { value: number };
  uPulse: { value: number };
  uTime: { value: number };
  uFlow: { value: number }; // travelling-pulse speed
}

export function createFieldLineMaterial(uniforms: FieldLineUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
    vertexShader: /* glsl */ `
      attribute float aFade;
      attribute float aArc;
      varying float vFade;
      varying float vArc;
      varying float vDepth;
      void main() {
        vFade = aFade;
        vArc = aArc;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      precision mediump float;
      varying float vFade;
      varying float vArc;
      varying float vDepth;
      uniform vec3 uColor;
      uniform vec3 uHotColor;
      uniform float uOpacity;
      uniform float uPulse;
      uniform float uTime;
      uniform float uFlow;

      void main() {
        // Travelling packets of brightness running along each line. Two
        // frequencies beating against each other keep it from looking like a
        // marquee.
        float ph = vArc * 9.0 - uTime * uFlow;
        float packet = pow(0.5 + 0.5 * sin(ph), 6.0);
        packet += 0.6 * pow(0.5 + 0.5 * sin(vArc * 3.5 - uTime * uFlow * 0.55), 10.0);

        // Hot where the line hugs the star, cooling toward the apex. Only the
        // crest of a packet reaches the hot colour, so the cage reads blue.
        vec3 col = mix(uColor, uHotColor, clamp(vFade * 0.30 + packet * 0.55, 0.0, 1.0));

        // Aerial perspective: distant strands recede instead of stacking into a
        // flat cyan mat, which is what gives the cage its sense of volume.
        float depthFade = clamp(11.0 / (6.0 + vDepth), 0.22, 1.0);

        // Kept under 1 so the lines stay below the bloom threshold except where
        // a packet crests — the cage should frame the star, not glare.
        float a = vFade * uOpacity * (0.62 + 0.38 * uPulse) * depthFade * 0.85;
        a *= 0.5 + 0.9 * packet;
        gl_FragColor = vec4(col * a, a);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

// Charged-particle point shader (instanced positions in a Points cloud).
export interface ParticleUniforms {
  uColor: { value: THREE.Color };
  uHotColor: { value: THREE.Color };
  uSize: { value: number };
  uPixelRatio: { value: number };
  uOpacity: { value: number };
}

export function createParticleMaterial(uniforms: ParticleUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
    vertexShader: /* glsl */ `
      attribute float aBright;
      varying float vBright;
      uniform float uSize;
      uniform float uPixelRatio;
      void main() {
        vBright = aBright;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        // Particles funnelled toward the caps are both brighter AND bigger, so
        // the polar streams read as the dense channels they are.
        float s = uSize * (0.45 + 1.15 * aBright);
        gl_PointSize = s * uPixelRatio * (75.0 / max(1.0, -mv.z));
        gl_PointSize = clamp(gl_PointSize, 1.0, 11.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision mediump float;
      varying float vBright;
      uniform vec3 uColor;
      uniform vec3 uHotColor;
      uniform float uOpacity;
      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv);
        if (d > 0.5) discard;
        // A tight core inside a soft halo, rather than a flat disc.
        float core = exp(-d * d * 42.0);
        float halo = exp(-d * d * 8.0);
        float a = (core * 0.85 + halo * 0.4) * vBright * uOpacity;
        vec3 col = mix(uColor, uHotColor, clamp(vBright * vBright, 0.0, 1.0));
        gl_FragColor = vec4(col * a, a);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}
