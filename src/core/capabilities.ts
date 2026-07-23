/**
 * Renderer capability detection and the WebGPU→WebGL fallback decision.
 *
 * Three.js ships an experimental WebGPU renderer, but for a stable, broadly
 * compatible experience we use the battle-tested WebGL2 renderer as the primary
 * path. We still *detect* WebGPU so the UI can report it and so a future upgrade
 * can flip the backend without touching the scene code.
 */

export interface Capabilities {
  webgl2: boolean;
  webgpu: boolean;
  maxTextureSize: number;
  /** Rough device tier used to pick a default quality level. */
  tier: 'low' | 'medium' | 'high';
  isMobile: boolean;
  /** Backend actually used to render. */
  backend: 'webgl2' | 'webgl1';
}

export function detectCapabilities(): Capabilities {
  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(
    typeof navigator !== 'undefined' ? navigator.userAgent : '',
  );

  let webgl2 = false;
  let maxTextureSize = 2048;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (gl) {
      webgl2 = true;
      maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    }
  } catch {
    webgl2 = false;
  }

  const webgpu = typeof navigator !== 'undefined' && 'gpu' in navigator;

  // Heuristic device tier: cores + memory + mobile flag.
  const cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
  const mem = (typeof navigator !== 'undefined' && (navigator as any).deviceMemory) || 4;
  let tier: Capabilities['tier'] = 'medium';
  if (isMobile || cores <= 4 || mem <= 3) tier = 'low';
  else if (cores >= 8 && mem >= 8) tier = 'high';

  return {
    webgl2,
    webgpu,
    maxTextureSize,
    tier,
    isMobile,
    backend: webgl2 ? 'webgl2' : 'webgl1',
  };
}
