/**
 * Nubes: billboards instanciados (un solo draw call) orientados a la cámara, con una
 * textura procedural de cúmulos generada una vez (4 variantes en un atlas 2×2).
 *
 * - Sin coste en reposo: el vaivén del viento avanza solo en los fotogramas que ya se
 *   dibujan (render bajo demanda), con un paso de tiempo acotado para que no salten.
 * - Legibilidad: los copos se desvanecen al acercarse a la cámara y cuando se interponen
 *   entre la cámara y el punto que se está mirando (nunca tapan el foco).
 * - Niebla y tono como el resto de la escena (AgX); luz del preset de mañana/tarde.
 */
import * as THREE from 'three';
import type { Frame } from '../geo/frame.ts';
import { layoutClouds, mulberry32, type CloudPuff } from './cloudLayout.ts';

const VERT = /* glsl */ `
attribute vec3 aCenter;
attribute vec2 aSize;
attribute vec4 aMisc; // tile, shade, phase, bandera
uniform float uTime;
uniform float uSway;
uniform vec3 uCam;
uniform vec3 uTarget;
varying vec2 vUv;
varying float vShade;
varying float vAlpha;
varying float vFogDepth;
varying float vHeight;
varying vec3 vWorld;
void main() {
  float tile = aMisc.x;
  vec2 cell = vec2(mod(tile, 2.0), floor(tile / 2.0));
  vUv = (uv + cell) * 0.5;
  vShade = aMisc.y;
  vHeight = uv.y;
  // vaivén lento del viento (oeste → este dominante), distinto por copo
  float ph = aMisc.z;
  float sway = (aMisc.w > 0.5 ? 0.25 : 1.0) * uSway;
  vec3 c = aCenter + vec3(sin(uTime * 0.021 + ph) * sway, sin(uTime * 0.013 + ph * 1.7) * 0.15 * sway, cos(uTime * 0.017 + ph) * 0.35 * sway);
  vec4 mv = viewMatrix * vec4(c, 1.0);
  mv.xy += position.xy * aSize;
  gl_Position = projectionMatrix * mv;
  vWorld = (inverse(viewMatrix) * mv).xyz;
  vFogDepth = -mv.z;
  // desvanecer cerca de la cámara (no llenar la pantalla) ...
  float d = distance(c, uCam);
  float r = max(aSize.x, aSize.y);
  float nearFade = smoothstep(r * 0.6, r * 1.6, d);
  // ... y si se interpone entre la cámara y el objetivo de la vista
  vec3 toT = uTarget - uCam;
  float dt = length(toT);
  vec3 toC = c - uCam;
  float along = dot(toC, toT) / max(dt, 1.0);
  float off = length(toC - toT * (along / max(dt, 1.0)));
  float blocking = step(0.0, along) * step(along, dt) * (1.0 - smoothstep(r * 0.35, r * 0.9 + dt * 0.08, off));
  vAlpha = nearFade * (1.0 - 0.85 * blocking);
}
`;

const FRAG = /* glsl */ `
uniform sampler2D uTex;
uniform vec3 uLit;
uniform vec3 uShadow;
uniform float uOpacity;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform sampler2D uHeight;
uniform float uHalf;
uniform float uTexels;
uniform float uH0;
varying vec2 vUv;
varying float vShade;
varying float vAlpha;
varying float vFogDepth;
varying float vHeight;
varying vec3 vWorld;
void main() {
  vec4 t = texture2D(uTex, vUv);
  // intersección suave con el relieve: la nube se funde donde toca la ladera
  vec2 g = (vWorld.xz + uHalf) / (2.0 * uHalf);
  g = g * (uTexels - 1.0) / uTexels + 0.5 / uTexels;
  float above = vWorld.y + uH0 - texture2D(uHeight, g).r;
  float a = t.a * uOpacity * vAlpha * smoothstep(0.0, 160.0, above);
  if (a < 0.008) discard;
  // r: iluminación propia del cúmulo (arriba y hacia el sol más clara); base gris
  float l = clamp(t.r * 0.9 + vHeight * 0.12, 0.0, 1.0) * vShade;
  vec3 col = mix(uShadow, uLit, l);
  float f = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
  col = mix(col, uFogColor, f);
  gl_FragColor = vec4(col, a * (1.0 - f * 0.6));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** Ruido de valor 2D determinista (interpolación suave) y su suma fractal. */
function valueNoise(seed: number): (x: number, y: number) => number {
  const hash = (i: number, j: number) => {
    let h = (i * 374761393 + j * 668265263 + seed * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  return (x, y) => {
    const i = Math.floor(x);
    const j = Math.floor(y);
    const fx = x - i;
    const fy = y - j;
    const u = fx * fx * (3 - 2 * fx);
    const v = fy * fy * (3 - 2 * fy);
    const a = hash(i, j);
    const b = hash(i + 1, j);
    const c = hash(i, j + 1);
    const d = hash(i + 1, j + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

/**
 * Atlas 2×2 de cúmulos. Densidad = silueta de cúmulo (base plana, «coliflor» de lóbulos
 * de varios tamaños arriba) erosionada con ruido fractal; luz = marcha corta de la luz a
 * través de la densidad hacia el sol (cimas claras, bases grises, bordes deshilachados).
 * Alfa = densidad; rojo = luz propia.
 */
function makeCloudTexture(size = 512): THREE.Texture {
  const tile = size / 2;
  const data = new Uint8Array(size * size * 4);
  const dens = new Float32Array(tile * tile);
  const rnd = mulberry32(8611);
  for (let k = 0; k < 4; k++) {
    const noise = valueNoise(17 + k * 31);
    const fbm = (x: number, y: number) => {
      let s = 0;
      let amp = 0.5;
      let f = 1;
      for (let o = 0; o < 5; o++) {
        s += amp * noise(x * f, y * f);
        f *= 2.03;
        amp *= 0.5;
      }
      return s;
    };
    // lóbulos: grandes en el cuerpo, pequeños a lo largo del borde superior
    const lobes: [number, number, number][] = [];
    const width = 0.62 + rnd() * 0.18;
    const x0 = 0.5 - width / 2;
    const tower = 0.25 + rnd() * 0.5; // dónde crece la torre
    for (let i = 0; i < 7; i++) {
      const lx = x0 + width * (0.1 + 0.8 * (i / 6)) + (rnd() - 0.5) * 0.05;
      const hump = Math.exp(-((lx - (x0 + width * tower)) ** 2) / 0.03);
      lobes.push([lx, 0.6 - 0.12 - hump * 0.16 - rnd() * 0.05, 0.11 + hump * 0.07 + rnd() * 0.03]);
    }
    for (let i = 0; i < 22; i++) {
      const lx = x0 + width * rnd();
      const hump = Math.exp(-((lx - (x0 + width * tower)) ** 2) / 0.03);
      const top = 0.6 - 0.22 - hump * 0.2;
      lobes.push([lx, top + rnd() * 0.08, 0.035 + rnd() * 0.05]);
    }
    for (let j = 0; j < tile; j++)
      for (let i = 0; i < tile; i++) {
        const u = (i + 0.5) / tile;
        const v = (j + 0.5) / tile;
        let s = 0;
        for (const [lx, ly, lr] of lobes) {
          const q = ((u - lx) ** 2 + ((v - ly) * 1.1) ** 2) / (lr * lr);
          if (q < 2.2) s = Math.max(s, 1 - q / 2.2);
        }
        // base horizontal algo irregular; el ruido erosiona el borde y da textura interior
        const baseY = 0.62 + (noise(u * 9, 3.7) - 0.5) * 0.03;
        const base = 1 - smooth(baseY - 0.13, baseY + 0.03, v);
        const n = fbm(u * 7 + k * 3.1, v * 7);
        const d = (s * 1.25 - 0.18 + (n - 0.5) * 0.75) * base;
        dens[j * tile + i] = Math.max(0, Math.min(1, d));
      }
    const ox = (k % 2) * tile;
    const oy = Math.floor(k / 2) * tile;
    for (let j = 0; j < tile; j++)
      for (let i = 0; i < tile; i++) {
        const d = dens[j * tile + i];
        // marcha de 8 pasos hacia el sol (arriba y algo a la izquierda en la textura)
        let tau = 0;
        for (let st = 1; st <= 8; st++) {
          const si = i - st * 4;
          const sj = j - st * 6;
          if (si < 0 || sj < 0) break;
          tau += dens[sj * tile + si];
        }
        const light = Math.exp(-tau * 0.28) * 0.8 + 0.24 + (1 - j / tile) * 0.05;
        const idx = ((oy + j) * size + (ox + i)) * 4;
        const l = Math.round(Math.min(1, light) * 255);
        data[idx] = l;
        data[idx + 1] = l;
        data[idx + 2] = l;
        data[idx + 3] = Math.round(smooth(0.02, 0.55, d) * 235);
      }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  // la fila 0 de los datos es la parte de arriba de la nube: el uv del quad va de abajo arriba
  tex.flipY = false;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export class Clouds {
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  readonly puffs: CloudPuff[];
  private readonly geometry: THREE.InstancedBufferGeometry;
  private readonly material: THREE.ShaderMaterial;
  private readonly texture: THREE.Texture;
  private time = 0;

  private readonly heightTex: THREE.DataTexture;

  /**
   * @param ground rejilla de alturas (m) que cubre todas las nubes, fila 0 al norte: se sube
   *   como textura de medio flotante (filtrable en cualquier WebGL 2) para el fundido con el relieve
   */
  constructor(
    frame: Frame,
    heightAt: (x: number, y: number) => number,
    summit: { x: number; y: number },
    fog: THREE.FogExp2,
    ground: { data: Float32Array; n: number; half: number },
  ) {
    this.puffs = layoutClouds(heightAt, { summit, half: 20000 });
    // los copos de la bandera, primero: así un recorte de instancias (perfil Baja) conserva el penacho
    this.puffs.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'mar' ? 1 : -1));
    const n = this.puffs.length;
    const center = new Float32Array(n * 3);
    const size = new Float32Array(n * 2);
    const misc = new Float32Array(n * 4);
    this.puffs.forEach((p, i) => {
      center.set([p.x, p.alt - frame.h0, -p.y], i * 3);
      size.set([p.w, p.h], i * 2);
      misc.set([p.tile, p.shade, p.phase, p.kind === 'bandera' ? 1 : 0], i * 4);
    });
    const quad = new THREE.PlaneGeometry(1, 1);
    this.geometry = new THREE.InstancedBufferGeometry();
    this.geometry.index = quad.index;
    this.geometry.setAttribute('position', quad.getAttribute('position'));
    this.geometry.setAttribute('uv', quad.getAttribute('uv'));
    this.geometry.setAttribute('aCenter', new THREE.InstancedBufferAttribute(center, 3));
    this.geometry.setAttribute('aSize', new THREE.InstancedBufferAttribute(size, 2));
    this.geometry.setAttribute('aMisc', new THREE.InstancedBufferAttribute(misc, 4));
    this.geometry.instanceCount = n;
    this.texture = makeCloudTexture();
    const half16 = new Uint16Array(ground.data.length);
    for (let i = 0; i < half16.length; i++) half16[i] = THREE.DataUtils.toHalfFloat(ground.data[i]);
    this.heightTex = new THREE.DataTexture(half16, ground.n, ground.n, THREE.RedFormat, THREE.HalfFloatType);
    this.heightTex.magFilter = THREE.LinearFilter;
    this.heightTex.minFilter = THREE.LinearFilter;
    this.heightTex.needsUpdate = true;
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTex: { value: this.texture },
        uTime: { value: 0 },
        uSway: { value: 120 },
        uCam: { value: new THREE.Vector3() },
        uTarget: { value: new THREE.Vector3() },
        uLit: { value: new THREE.Color('#ffffff') },
        uShadow: { value: new THREE.Color('#8e9aa8') },
        uOpacity: { value: 0.92 },
        uFogColor: { value: fog.color },
        uFogDensity: { value: fog.density },
        uHeight: { value: this.heightTex },
        uHalf: { value: ground.half },
        uTexels: { value: ground.n },
        uH0: { value: frame.h0 },
      },
      transparent: true,
      depthWrite: false,
      depthTest: true,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = 'nubes';
    this.mesh.frustumCulled = false; // billboards desplazados en el shader: la caja del quad no sirve
    this.mesh.renderOrder = 3; // después del terreno y las rutas: tapan lo que queda detrás
  }

  /** Copos activos (los perfiles bajos dibujan menos; la bandera siempre). */
  setCount(max: number): void {
    this.geometry.instanceCount = Math.min(this.puffs.length, max);
  }

  textures(): THREE.Texture[] {
    return [this.texture, this.heightTex];
  }

  setVisible(on: boolean): void {
    this.mesh.visible = on;
  }

  get visible(): boolean {
    return this.mesh.visible;
  }

  /** Luz del preset: color de la cara iluminada y de la sombra propia. */
  setLight(lit: THREE.ColorRepresentation, shadow: THREE.ColorRepresentation): void {
    this.material.uniforms.uLit.value.set(lit);
    this.material.uniforms.uShadow.value.set(shadow);
  }

  /**
   * Se llama en cada fotograma dibujado. dtMs se acota: tras un reposo largo las nubes
   * siguen donde estaban en vez de saltar.
   */
  update(camera: THREE.Camera, target: THREE.Vector3, dtMs: number, animate: boolean): void {
    if (animate) this.time += Math.min(Math.max(dtMs, 0), 50) / 1000;
    const u = this.material.uniforms;
    u.uTime.value = this.time;
    u.uCam.value.copy(camera.position);
    u.uTarget.value.copy(target);
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
    this.heightTex.dispose();
  }
}
