/**
 * Capa de glifos en espacio de pantalla (DESIGN §9.1): marcas de tamaño constante en
 * píxeles dibujadas con funciones de distancia con signo, con halo oscuro. Un solo
 * material sirve para rombos «≈ 0», aspas «no definido», semillas, cheurones de sentido
 * (orientados según la tangente proyectada), aros de selección y signos +, −, ⊙, ⊗, ↺, ↻.
 *
 * El gris se escribe directamente en sRGB (el lienzo se interpreta como sRGB).
 */
import * as THREE from 'three';
import { hexARgb } from '../design/color';
import { escena } from '../design/tokens';

export const FORMA = {
  CIRCULO: 0,
  CIRCULO_HUECO: 1,
  ROMBO: 2,
  ASPA: 3,
  CHEURON: 4,
  ARO: 5,
  MAS: 6,
  MENOS: 7,
  PUNTO_CIRCULO: 8,
  CRUZ_CIRCULO: 9,
  GIRO_ANTIHORARIO: 10,
  GIRO_HORARIO: 11,
} as const;

export interface DatosGlifos {
  n: number;
  pos: ArrayLike<number>;
  forma: ArrayLike<number>;
  /** Diámetro en píxeles CSS. */
  tam: ArrayLike<number>;
  /** Gris sRGB [0, 1]. */
  gris: ArrayLike<number>;
  /** Tangente (3n) para los cheurones; cero = sin orientación. */
  tangente?: ArrayLike<number>;
}

const MARGEN_HALO_CSS = 3;

const vertice = /* glsl */ `
attribute float aForma;
attribute float aTam;
attribute float aGris;
attribute vec3 aTangente;
uniform float uPixelRatio;
uniform vec2 uResolucion;
uniform float uSesgo;
varying float vForma;
varying float vGris;
varying float vAngulo;
varying float vRadio;
varying float vTam;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec4 c0 = projectionMatrix * mv;
  gl_Position = c0;
  // Sesgo de profundidad hacia la cámara (en NDC): el glifo gana a la línea sobre la que está.
  gl_Position.z -= uSesgo * gl_Position.w;
  vTam = (aTam + 2.0 * ${MARGEN_HALO_CSS.toFixed(1)}) * uPixelRatio;
  vRadio = 0.5 * aTam * uPixelRatio;
  gl_PointSize = vTam;
  vForma = aForma;
  vGris = aGris;
  vAngulo = 0.0;
  if (dot(aTangente, aTangente) > 0.0) {
    vec4 c1 = projectionMatrix * modelViewMatrix * vec4(position + aTangente * 0.01, 1.0);
    vec2 d = (c1.xy / c1.w - c0.xy / c0.w) * uResolucion;
    if (dot(d, d) > 0.0) vAngulo = atan(d.y, d.x);
  }
}`;

const fragmento = /* glsl */ `
uniform float uPixelRatio;
uniform vec3 uHalo;
varying float vForma;
varying float vGris;
varying float vAngulo;
varying float vRadio;
varying float vTam;

float segmento(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  p.y = -p.y;
  vec2 q = p * (vTam * 0.5);
  float c = cos(vAngulo);
  float s = sin(vAngulo);
  vec2 qr = vec2(c * q.x + s * q.y, -s * q.x + c * q.y);
  float R = vRadio;
  float w = 0.75 * uPixelRatio;
  int forma = int(vForma + 0.5);
  float d;
  if (forma == 0) {
    d = length(q) - R;
  } else if (forma == 1) {
    d = abs(length(q) - (R - w)) - w;
  } else if (forma == 2) {
    d = abs((abs(q.x) + abs(q.y)) - (R - w) * 1.05) * 0.70710678 - w;
  } else if (forma == 3) {
    float a = R * 0.62;
    d = min(segmento(q, vec2(-a), vec2(a)), segmento(q, vec2(-a, a), vec2(a, -a))) - w;
  } else if (forma == 4) {
    float a = R * 0.62;
    d = min(segmento(qr, vec2(-a * 0.55, a), vec2(a * 0.55, 0.0)), segmento(qr, vec2(-a * 0.55, -a), vec2(a * 0.55, 0.0))) - w;
  } else if (forma == 5) {
    float w2 = 1.0 * uPixelRatio;
    d = abs(length(q) - (R - w2)) - w2;
  } else if (forma == 6) {
    float a = R * 0.7;
    d = min(segmento(q, vec2(-a, 0.0), vec2(a, 0.0)), segmento(q, vec2(0.0, -a), vec2(0.0, a))) - w;
  } else if (forma == 7) {
    float a = R * 0.7;
    d = segmento(q, vec2(-a, 0.0), vec2(a, 0.0)) - w;
  } else if (forma == 8) {
    d = min(abs(length(q) - (R - w)) - w, length(q) - R * 0.3);
  } else if (forma == 9) {
    float a = R * 0.48;
    d = min(abs(length(q) - (R - w)) - w, min(segmento(q, vec2(-a), vec2(a)), segmento(q, vec2(-a, a), vec2(a, -a))) - w);
  } else {
    float r0 = R * 0.7;
    float arco = abs(length(q) - r0) - w;
    float sentido = forma == 10 ? -1.0 : 1.0;
    vec2 t = vec2(0.0, r0);
    float ch = min(segmento(q, t + vec2(-sentido * R * 0.38, R * 0.32), t), segmento(q, t + vec2(-sentido * R * 0.38, -R * 0.32), t)) - w;
    d = min(arco, ch);
  }
  float halo = 1.5 * uPixelRatio;
  float aa = 0.6;
  // El círculo hueco (semilla) se rellena con el color del halo: la línea que pasa por la
  // semilla no se ve dentro del aro y la marca se lee como «○», no como «⊖».
  float dAlfa = forma == 1 ? length(q) - R : d;
  float alfa = 1.0 - smoothstep(halo - aa, halo + aa, dAlfa);
  if (alfa <= 0.0) discard;
  float mezcla = 1.0 - smoothstep(-aa, aa, d);
  gl_FragColor = vec4(mix(uHalo, vec3(vGris), mezcla), alfa);
}`;

export class CapaGlifos {
  readonly objeto: THREE.Points;
  private readonly geometria = new THREE.BufferGeometry();
  private readonly material: THREE.ShaderMaterial;

  constructor(opciones: { siempreVisible?: boolean; orden?: number; sesgo?: number } = {}) {
    const [r, g, b] = hexARgb(escena.halo);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uPixelRatio: { value: 1 },
        uResolucion: { value: new THREE.Vector2(1, 1) },
        uSesgo: { value: opciones.sesgo ?? 0 },
        uHalo: { value: new THREE.Vector3(r / 255, g / 255, b / 255) },
      },
      vertexShader: vertice,
      fragmentShader: fragmento,
      transparent: true,
      depthWrite: false,
      depthTest: !opciones.siempreVisible,
    });
    this.objeto = new THREE.Points(this.geometria, this.material);
    this.objeto.frustumCulled = false;
    this.objeto.renderOrder = opciones.orden ?? 2;
    this.actualizar({ n: 0, pos: [], forma: [], tam: [], gris: [] });
  }

  actualizar(d: DatosGlifos): void {
    const n = d.n;
    const g = this.geometria;
    g.setAttribute('position', new THREE.BufferAttribute(Float32Array.from({ length: 3 * n }, (_, i) => d.pos[i] as number), 3));
    g.setAttribute('aForma', new THREE.BufferAttribute(Float32Array.from({ length: n }, (_, i) => d.forma[i] as number), 1));
    g.setAttribute('aTam', new THREE.BufferAttribute(Float32Array.from({ length: n }, (_, i) => d.tam[i] as number), 1));
    g.setAttribute('aGris', new THREE.BufferAttribute(Float32Array.from({ length: n }, (_, i) => d.gris[i] as number), 1));
    const tangente = new Float32Array(3 * n);
    if (d.tangente) for (let i = 0; i < 3 * n; i++) tangente[i] = d.tangente[i] as number;
    g.setAttribute('aTangente', new THREE.BufferAttribute(tangente, 3));
    g.setDrawRange(0, n);
    this.objeto.visible = n > 0;
  }

  setResolucion(anchoPx: number, altoPx: number, pixelRatio: number): void {
    (this.material.uniforms.uResolucion as THREE.IUniform<THREE.Vector2>).value.set(anchoPx, altoPx);
    (this.material.uniforms.uPixelRatio as THREE.IUniform<number>).value = pixelRatio;
  }

  dispose(): void {
    this.geometria.dispose();
    this.material.dispose();
  }
}

/** Construye datos de glifos homogéneos (misma forma, tamaño y gris). */
export function glifosUniformes(pos: ArrayLike<number>, forma: number, tam: number, gris: number, tangente?: ArrayLike<number>): DatosGlifos {
  const n = Math.floor(pos.length / 3);
  return {
    n,
    pos,
    forma: new Float32Array(n).fill(forma),
    tam: new Float32Array(n).fill(tam),
    gris: new Float32Array(n).fill(gris),
    ...(tangente ? { tangente } : {}),
  };
}
