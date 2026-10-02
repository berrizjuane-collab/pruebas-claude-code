/**
 * Mapa escalar sobre el corte (REN-06, DESIGN §9.6–9.8): banda oscura L* 6–32 ∝ |s|/V_ref,
 * puntos para s > 0 y rayado a 45° para s < 0 (+10 L* sobre la base), fondo liso con
 * |s| < 2 % V_ref, curva discontinua en s = 0 y glifos dispersos con el signo (+/−, ⊙/⊗, ↺/↻).
 *
 * Los patrones se generan en el *shader* en coordenadas del plano, así que acompañan al
 * plano al orbitar; su periodo se elige por potencias de 2 según el zoom para que siempre
 * mida ≈ 10–20 px. El mapa es opaco y queda un poco por detrás en profundidad: la curva de
 * nivel, el contorno del corte y las flechas apoyadas en el plano se dibujan encima.
 */
import * as THREE from 'three';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { hexARgb } from '../../design/color';
import { escena, rampa } from '../../design/tokens';
import { muestrasGlifos, signoGlifo, UMBRAL_CERO, type RejillaEscalar } from '../../geometria/escalar';
import { EJES_PLANO } from '../../math/tipos';
import type { TipoEscalar } from '../../numerics/slice';
import { CapaGlifos, FORMA } from '../glifos';

export interface DatosEscalar {
  tipo: TipoEscalar;
  /** Escalar nulo en todo el corte (la leyenda lo dice en vez de mostrar una escala). */
  nulo: boolean;
  rejilla: RejillaEscalar;
  vRef: number;
  /** Curva s = 0 (pares de puntos 3D) o null si el escalar no tiene signo. */
  contorno: Float32Array | null;
  /** Nodos de las flechas en los ejes (u, v) del plano: los glifos se apartan de ellos. */
  nodos: [number, number];
}

/** Forma del glifo disperso para cada signo (DESIGN §9.6–9.8). */
export const GLIFO_SIGNO: Record<Exclude<TipoEscalar, 'magnitud'>, { pos: number; neg: number }> = {
  divergencia: { pos: FORMA.MAS, neg: FORMA.MENOS },
  normal: { pos: FORMA.PUNTO_CIRCULO, neg: FORMA.CRUZ_CIRCULO },
  rotacional: { pos: FORMA.GIRO_ANTIHORARIO, neg: FORMA.GIRO_HORARIO },
};

/** Periodo objetivo del patrón en píxeles y número de periodos por lado corto del corte. */
const PERIODO_PX = 14;
const PERIODOS_POR_LADO = 24;

const vertice = /* glsl */ `
varying vec2 vUV;
void main() {
  vUV = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const fragmento = /* glsl */ `
precision highp float;
uniform sampler2D uValores;
uniform float uLado;
uniform vec2 uTamano;
uniform float uPeriodo;
uniform float uVRef;
uniform float uConSigno;
uniform vec3 uFondo;
varying vec2 vUV;

float srgbDeL(float L) {
  float fy = (L + 16.0) / 116.0;
  float y3 = fy * fy * fy;
  float Y = y3 > 0.008856451679 ? y3 : L / 903.2962963;
  return Y <= 0.0031308 ? 12.92 * Y : 1.055 * pow(Y, 1.0 / 2.4) - 0.055;
}

vec2 texel(ivec2 k) {
  int m = int(uLado) - 1;
  return texelFetch(uValores, clamp(k, ivec2(0), ivec2(m)), 0).rg;
}

void main() {
  // Derivadas antes de cualquier bifurcación (no están definidas en flujo divergente).
  vec2 q = vUV * uTamano / uPeriodo;
  vec2 dq = fwidth(q);
  float aa = max(max(dq.x, dq.y), 1e-6);
  // Con menos de ≈ 5 px por periodo el patrón se funde (sin muaré); los glifos mantienen el signo.
  float visible = smoothstep(4.0, 7.0, 1.0 / aa);

  vec2 g = clamp(vUV, 0.0, 1.0) * (uLado - 1.0);
  vec2 g0 = min(floor(g), vec2(uLado - 2.0));
  vec2 f = g - g0;
  ivec2 k = ivec2(g0);
  vec2 a = texel(k);
  vec2 b = texel(k + ivec2(1, 0));
  vec2 c = texel(k + ivec2(0, 1));
  vec2 d = texel(k + ivec2(1, 1));
  float definido = min(min(a.y, b.y), min(c.y, d.y));
  float s = mix(mix(a.x, b.x, f.x), mix(c.x, d.x, f.x), f.y) / uVRef;
  float u = min(abs(s), 1.0);
  if (definido < 0.5 || u < ${UMBRAL_CERO.toFixed(3)}) {
    gl_FragColor = vec4(uFondo, 1.0);
    return;
  }
  float L = ${rampa.escalar.lMin.toFixed(1)} + ${(rampa.escalar.lMax - rampa.escalar.lMin).toFixed(1)} * u;
  vec3 base = vec3(srgbDeL(L));
  float dist;
  if (s > 0.0) {
    // Puntos: radio 0.22 del periodo (cobertura ≈ 15 %).
    dist = length(fract(q) - 0.5) - 0.22;
  } else {
    // Rayado a 45° (líneas u − v = cte), grosor 0.16 del periodo (cobertura ≈ 16 %).
    float w = (q.x - q.y) * 0.70710678;
    dist = abs(fract(w + 0.5) - 0.5) - 0.08;
  }
  float cobertura = (1.0 - smoothstep(-0.5 * aa, 0.5 * aa, dist)) * visible * uConSigno;
  gl_FragColor = vec4(mix(base, vec3(srgbDeL(L + ${rampa.patronDeltaL.toFixed(1)})), cobertura), 1.0);
}`;

export class CapaEscalar {
  readonly grupo = new THREE.Group();
  private readonly mapa: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;
  private textura: THREE.DataTexture | null = null;
  private readonly matCero: LineMaterial;
  private cero: LineSegments2;
  // Glifos sobre el plano: el sesgo los adelanta un 2 % de la distancia para no cortarse con él.
  private readonly glifos = new CapaGlifos({ orden: 6, sesgo: 0.02 });
  private datos: DatosEscalar | null = null;
  private lados: [number, number] = [1, 1];
  private resumenGlifos: { pos: number[]; signo: number; forma: number }[] = [];

  constructor() {
    const [r, g, b] = hexARgb(escena.fondo);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uValores: { value: null },
        uLado: { value: 2 },
        uTamano: { value: new THREE.Vector2(1, 1) },
        uPeriodo: { value: 1 },
        uVRef: { value: 1 },
        uConSigno: { value: 1 },
        uFondo: { value: new THREE.Vector3(r / 255, g / 255, b / 255) },
      },
      vertexShader: vertice,
      fragmentShader: fragmento,
      side: THREE.DoubleSide,
      // Un poco por detrás: lo que está apoyado en el plano (curva, contorno, flechas) gana.
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 4,
    });
    this.mapa = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    this.mapa.name = 'corte-mapa';
    this.matCero = new LineMaterial({ linewidth: 1.5, dashed: true, dashSize: 0.1, gapSize: 0.07, toneMapped: false });
    this.matCero.color.setStyle(escena.cero, THREE.SRGBColorSpace);
    this.cero = new LineSegments2(new LineSegmentsGeometry(), this.matCero);
    this.cero.name = 'corte-cero';
    this.cero.frustumCulled = false;
    this.grupo.add(this.mapa, this.cero, this.glifos.objeto);
    this.grupo.visible = false;
  }

  /** Coloca el mapa (o lo oculta). `esquinas` es el rectángulo del corte (4 × 3). */
  fijar(d: DatosEscalar | null, esquinas: [number, number, number][]): void {
    this.datos = d;
    this.grupo.visible = !!d;
    if (!d) return;
    const r = d.rejilla;
    const L = r.lado;
    const datos = new Float32Array(2 * L * L);
    for (let k = 0; k < L * L; k++) {
      const v = r.valores[k] as number;
      const ok = r.estado[k] === 0 && Number.isFinite(v);
      datos[2 * k] = ok ? v : 0;
      datos[2 * k + 1] = ok ? 1 : 0;
    }
    this.textura?.dispose();
    const t = new THREE.DataTexture(datos, L, L, THREE.RGFormat, THREE.FloatType);
    t.minFilter = THREE.NearestFilter;
    t.magFilter = THREE.NearestFilter;
    t.needsUpdate = true;
    this.textura = t;
    const { u, v } = EJES_PLANO[r.plano];
    this.lados = [(r.dominio.max[u] as number) - (r.dominio.min[u] as number), (r.dominio.max[v] as number) - (r.dominio.min[v] as number)];
    const un = this.material.uniforms;
    un.uValores!.value = t;
    un.uLado!.value = L;
    (un.uTamano!.value as THREE.Vector2).set(this.lados[0], this.lados[1]);
    un.uVRef!.value = d.vRef;
    un.uConSigno!.value = d.tipo === 'magnitud' ? 0 : 1;

    const [a, b, c, e] = esquinas as [[number, number, number], [number, number, number], [number, number, number], [number, number, number]];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...e], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2));
    this.mapa.geometry.dispose();
    this.mapa.geometry = geo;

    this.cero.geometry.dispose();
    this.cero.geometry = new LineSegmentsGeometry();
    this.cero.visible = !!d.contorno && d.contorno.length > 0;
    if (this.cero.visible) {
      this.cero.geometry.setPositions(d.contorno as Float32Array);
      this.cero.computeLineDistances();
    }
    this.fijarGlifos(d);
  }

  /** Glifos dispersos: signo de cada muestra (o × sin valor); ninguno cerca de s = 0. */
  private fijarGlifos(d: DatosEscalar): void {
    const m = muestrasGlifos(d.rejilla, d.nodos);
    const formas = d.tipo === 'magnitud' ? null : GLIFO_SIGNO[d.tipo];
    const pos: number[] = [];
    const forma: number[] = [];
    this.resumenGlifos = [];
    for (let k = 0; k < m.valor.length; k++) {
      const s = signoGlifo(m.valor[k] as number, d.vRef);
      const f = Number.isNaN(s) ? FORMA.ASPA : formas && s !== 0 ? (s > 0 ? formas.pos : formas.neg) : -1;
      if (f < 0) continue;
      const p = [m.pos[3 * k] as number, m.pos[3 * k + 1] as number, m.pos[3 * k + 2] as number];
      pos.push(...p);
      forma.push(f);
      this.resumenGlifos.push({ pos: p, signo: s, forma: f });
    }
    const n = forma.length;
    const gris = hexARgb(escena.cero)[0] / 255;
    this.glifos.actualizar({ n, pos, forma, tam: new Float32Array(n).fill(13), gris: new Float32Array(n).fill(gris) });
  }

  /** Por fotograma: discontinuidad de la curva (≈ 6-4 px) y periodo del patrón (≈ 14 px, por potencias de 2). */
  ajustar(pxPorUnidad: number, anchoCss: number, altoCss: number): void {
    this.matCero.resolution.set(anchoCss, altoCss);
    if (!this.datos || pxPorUnidad <= 0) return;
    this.matCero.dashSize = 6 / pxPorUnidad;
    this.matCero.gapSize = 4 / pxPorUnidad;
    const p0 = Math.min(this.lados[0], this.lados[1]) / PERIODOS_POR_LADO;
    const nivel = Math.round(Math.log2(PERIODO_PX / (p0 * pxPorUnidad)));
    this.material.uniforms.uPeriodo!.value = p0 * 2 ** nivel;
  }

  setResolucion(anchoPx: number, altoPx: number, pixelRatio: number): void {
    this.glifos.setResolucion(anchoPx, altoPx, pixelRatio);
  }

  get estadisticas() {
    const d = this.datos;
    return d
      ? {
          tipo: d.tipo,
          vRef: d.vRef,
          lado: d.rejilla.lado,
          contorno: d.contorno ? Array.from(d.contorno) : [],
          periodo: this.material.uniforms.uPeriodo!.value as number,
          glifos: this.resumenGlifos,
        }
      : null;
  }

  dispose(): void {
    this.textura?.dispose();
    this.mapa.geometry.dispose();
    this.material.dispose();
    this.cero.geometry.dispose();
    this.matCero.dispose();
    this.glifos.dispose();
  }
}
