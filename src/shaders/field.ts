/**
 * Glowing field-line / particle shaders. Field lines fade toward their far ends
 * (an `aFade` attribute) and can "breathe" via uPulse for magnetar tension.
 */

import * as THREE from 'three';

export interface FieldLineUniforms {
  uColor: { value: THREE.Color };
  uOpacity: { value: number };
  uPulse: { value: number };
}

export function createFieldLineMaterial(uniforms: FieldLineUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
    vertexShader: /* glsl */ `
      attribute float aFade;
      varying float vFade;
      void main() {
        vFade = aFade;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision mediump float;
      varying float vFade;
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uPulse;
      void main() {
        float a = vFade * uOpacity * (0.75 + 0.25 * uPulse);
        gl_FragColor = vec4(uColor * a, a);
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
        gl_PointSize = uSize * uPixelRatio * (60.0 / max(1.0, -mv.z));
        gl_PointSize = clamp(gl_PointSize, 1.0, 6.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision mediump float;
      varying float vBright;
      uniform vec3 uColor;
      uniform float uOpacity;
      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv);
        float a = smoothstep(0.5, 0.0, d) * vBright * uOpacity;
        gl_FragColor = vec4(uColor * a, a);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}
