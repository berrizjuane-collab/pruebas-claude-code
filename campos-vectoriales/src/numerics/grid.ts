/**
 * Malla de muestreo y clasificación de nodos (SPEC §5.1, §3.3, §3.8).
 */
import type { Dominio, EvaluadorCampo } from '../math/tipos';
import { percentil, redondeoLegible } from './stats';

/** Magnitud por encima de la cual un valor finito se considera singular. */
export const F_MAX = 1e12;
/** Umbral visual de cero, relativo a F_ref (DESIGN §9.1). */
export const CERO_VISUAL = 0.02;

export const CLASE = { VALIDO: 0, CERO: 1, NO_DEFINIDO: 2, SINGULAR: 3 } as const;
export type Clase = (typeof CLASE)[keyof typeof CLASE];

export type PosicionNodos = 'nodos' | 'centros';

export interface Malla {
  n: readonly [number, number, number];
  ejes: readonly [Float64Array, Float64Array, Float64Array];
  total: number;
  /** Separación por eje. */
  delta: readonly [number, number, number];
  /** Separación de referencia Δ = min(Δx, Δy, Δz). */
  deltaRef: number;
}

export function crearMalla(dom: Dominio, n: readonly [number, number, number], posicion: PosicionNodos = 'nodos'): Malla {
  const ejes = [0, 1, 2].map((k) => {
    const m = n[k] as number;
    const a = dom.min[k] as number;
    const b = dom.max[k] as number;
    const eje = new Float64Array(m);
    if (posicion === 'nodos') {
      const d = m > 1 ? (b - a) / (m - 1) : 0;
      for (let i = 0; i < m; i++) eje[i] = i === m - 1 && m > 1 ? b : a + i * d;
    } else {
      const d = (b - a) / m;
      for (let i = 0; i < m; i++) eje[i] = a + (i + 0.5) * d;
    }
    return eje;
  }) as unknown as [Float64Array, Float64Array, Float64Array];
  const delta = [0, 1, 2].map((k) => {
    const m = n[k] as number;
    const l = (dom.max[k] as number) - (dom.min[k] as number);
    return posicion === 'nodos' ? (m > 1 ? l / (m - 1) : l) : l / m;
  }) as unknown as [number, number, number];
  return { n, ejes, total: n[0] * n[1] * n[2], delta, deltaRef: Math.min(...delta) };
}

export interface MuestraMalla {
  malla: Malla;
  /** Número de nodos (= malla.total). */
  total: number;
  /** Posiciones (x, y, z) por nodo, en orden i + nx·(j + ny·k). */
  pos: Float64Array;
  /** F por nodo. */
  F: Float64Array;
  /** ‖F‖ por nodo (NaN si no definido). */
  mag: Float64Array;
  clase: Uint8Array;
  recuento: { validos: number; ceros: number; noDefinidos: number; singulares: number };
}

/** Evalúa F en todos los nodos y clasifica los no definidos y los singulares. */
export function muestrearMalla(F: EvaluadorCampo, p: Float64Array, malla: Malla): MuestraMalla {
  const [nx, ny, nz] = malla.n;
  const [ex, ey, ez] = malla.ejes;
  const total = malla.total;
  const pos = new Float64Array(3 * total);
  const valores = new Float64Array(3 * total);
  const mag = new Float64Array(total);
  const clase = new Uint8Array(total);
  let idx = 0;
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const x = ex[i] as number;
        const y = ey[j] as number;
        const z = ez[k] as number;
        pos[3 * idx] = x;
        pos[3 * idx + 1] = y;
        pos[3 * idx + 2] = z;
        F(x, y, z, p, valores, 3 * idx);
        const fx = valores[3 * idx] as number;
        const fy = valores[3 * idx + 1] as number;
        const fz = valores[3 * idx + 2] as number;
        if (!Number.isFinite(fx) || !Number.isFinite(fy) || !Number.isFinite(fz)) {
          clase[idx] = CLASE.NO_DEFINIDO;
          mag[idx] = NaN;
        } else {
          const m = Math.hypot(fx, fy, fz);
          mag[idx] = m;
          clase[idx] = m > F_MAX ? CLASE.SINGULAR : CLASE.VALIDO;
        }
        idx++;
      }
    }
  }
  const muestra: MuestraMalla = { malla, total, pos, F: valores, mag, clase, recuento: { validos: 0, ceros: 0, noDefinidos: 0, singulares: 0 } };
  recontar(muestra);
  return muestra;
}

export interface Escala {
  /** Magnitud de referencia: longitud máxima y luminancia máxima de los glifos. */
  ref: number;
  origen: 'auto' | 'fija';
  /** Todos los valores definidos son ≈ 0. */
  nulo: boolean;
  /** Campo temporal con escala automática: ventana [t₀, t₁] en cuyos instantes se calculó (SPEC §3.10). */
  ventana?: readonly [number, number];
}

/** F_ref automática: P95 de ‖F‖ en los nodos definidos, redondeado a un valor legible. */
export function escalaAutomatica(mag: Float64Array, clase: Uint8Array): Escala {
  const definidos: number[] = [];
  for (let i = 0; i < mag.length; i++) {
    const c = clase[i];
    if (c === CLASE.VALIDO || c === CLASE.CERO) definidos.push(mag[i] as number);
  }
  if (!definidos.length) return { ref: 1, origen: 'auto', nulo: false };
  let max = 0;
  for (const m of definidos) if (m > max) max = m;
  if (max <= 1e-12) return { ref: 1, origen: 'auto', nulo: true };
  return { ref: redondeoLegible(percentil(definidos, 0.95)), origen: 'auto', nulo: false };
}

/** Marca como CERO los nodos con ‖F‖ ≤ ε₀ = max(10⁻¹², 10⁻⁹·F_ref) (SPEC §3.3). */
export function clasificarCeros(muestra: Pick<MuestraMalla, 'mag' | 'clase' | 'recuento'>, fRef: number): void {
  const eps0 = Math.max(1e-12, 1e-9 * fRef);
  const { mag, clase } = muestra;
  for (let i = 0; i < mag.length; i++) {
    if (clase[i] === CLASE.VALIDO && (mag[i] as number) <= eps0) clase[i] = CLASE.CERO;
    else if (clase[i] === CLASE.CERO && (mag[i] as number) > eps0) clase[i] = CLASE.VALIDO;
  }
  recontar(muestra);
}

function recontar(m: Pick<MuestraMalla, 'clase' | 'recuento'>): void {
  const r = { validos: 0, ceros: 0, noDefinidos: 0, singulares: 0 };
  for (let i = 0; i < m.clase.length; i++) {
    const c = m.clase[i];
    if (c === CLASE.VALIDO) r.validos++;
    else if (c === CLASE.CERO) r.ceros++;
    else if (c === CLASE.NO_DEFINIDO) r.noDefinidos++;
    else r.singulares++;
  }
  m.recuento = r;
}

/** Instantes de la ventana con que se calcula la escala de un campo temporal (SPEC §3.10, D-64). */
export const INSTANTES_VENTANA = 9;

/** t_j = t₀ + j·(t₁ − t₀)/(K − 1), j = 0 … K − 1 (el último es exactamente t₁). */
export function instantesVentana(t0: number, t1: number, k: number = INSTANTES_VENTANA): number[] {
  return Array.from({ length: k }, (_, j) => (j === k - 1 ? t1 : t0 + (j * (t1 - t0)) / (k - 1)));
}

/**
 * Magnitudes y clases de una magnitud por nodo en los instantes de la ventana, concatenadas
 * (entrada de `escalaAutomatica`). `p` es un vector de evaluación con t en su última ranura
 * (D-63); no se modifica. `muestra(pj)` devuelve las magnitudes del instante de pj.
 */
export function enVentana(
  p: Float64Array,
  t0: number,
  t1: number,
  muestra: (pj: Float64Array) => { mag: Float64Array; clase: Uint8Array },
): { mag: Float64Array; clase: Uint8Array } {
  const partes = instantesVentana(t0, t1).map((tj) => {
    const pj = Float64Array.from(p);
    pj[pj.length - 1] = tj;
    return muestra(pj);
  });
  const total = partes.reduce((s, m) => s + m.mag.length, 0);
  const mag = new Float64Array(total);
  const clase = new Uint8Array(total);
  let o = 0;
  for (const m of partes) {
    mag.set(m.mag, o);
    clase.set(m.clase, o);
    o += m.mag.length;
  }
  return { mag, clase };
}

/** F_ref de un campo temporal: P95 de ‖F‖ en los nodos y en los 9 instantes de [t₀, t₁] (SPEC §3.10). */
export function escalaEnVentana(F: EvaluadorCampo, p: Float64Array, malla: Malla, t0: number, t1: number): Escala {
  const { mag, clase } = enVentana(p, t0, t1, (pj) => muestrearMalla(F, pj, malla));
  return { ...escalaAutomatica(mag, clase), ventana: [t0, t1] };
}
