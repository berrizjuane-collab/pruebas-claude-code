/**
 * Geometría de los glifos de flecha (DESIGN §9.2–9.3), calculada como función pura para
 * poder verificarla sin GPU (REN-02, V-FUN-05).
 *
 * - Cada flecha está centrada en su nodo y apunta según F.
 * - Proporcional: ℓ = ℓmax·min(‖F‖/F_ref, 1). Normalizada: ℓ = 0.75·ℓmax.
 * - Luminancia L* = 45.2 + 51.3·u, con u = min(‖F‖/F_ref, 1) (o logarítmica).
 * - ‖F‖ ≥ F_ref → doble punta (saturada). ‖F‖ < 2 % F_ref → rombo «≈ 0».
 * - Nodo no definido o singular → aspa.
 */
import { grisDeLstar } from '../design/color';
import { rampa } from '../design/tokens';
import { CERO_VISUAL, CLASE } from '../numerics/grid';

export type ModoLongitud = 'proporcional' | 'normalizado';
export type ModoLuminancia = 'lineal' | 'log';

export interface EntradaFlechas {
  total: number;
  pos: ArrayLike<number>;
  F: ArrayLike<number>;
  mag: ArrayLike<number>;
  clase: ArrayLike<number>;
}

export interface OpcionesFlechas {
  fRef: number;
  lMax: number;
  modo: ModoLongitud;
  luminancia: ModoLuminancia;
}

export interface InstanciasFlechas {
  /** Flechas dibujadas. */
  n: number;
  /** Cola de cada flecha (3n). */
  cola: Float32Array;
  /** Dirección unitaria (3n). */
  dir: Float32Array;
  /** Longitud total. */
  largo: Float32Array;
  /** Longitud y radio del cono, radio del cilindro. */
  cono: Float32Array;
  radioCono: Float32Array;
  radio: Float32Array;
  /** Gris sRGB en [0, 1]. */
  gris: Float32Array;
  saturada: Uint8Array;
  /** Índice del nodo de origen de cada flecha. */
  nodo: Uint32Array;
  /** Marcas «≈ 0» y «no definido» (posiciones 3m). */
  ceros: Float32Array;
  indefinidos: Float32Array;
  nSaturadas: number;
  /** Anillos de giro de los glifos de rot F (DESIGN §9.7); null con «Glifos: F». */
  anillos: AnillosRotacional | null;
}

/** Anillo alrededor del eje de cada glifo de rot F, con su punta de flecha. */
export interface AnillosRotacional {
  n: number;
  /** Centro del anillo: el nodo (centro de la flecha), 3n. */
  centro: Float32Array;
  /** Radio del anillo. */
  radio: Float32Array;
  /**
   * Dos puntas de flecha por anillo, opuestas (así una queda siempre por delante del eje):
   * punto del anillo (3·2n) y tangente unitaria en el sentido de giro (3·2n).
   */
  punta: Float32Array;
  tangente: Float32Array;
  /** Longitud y radio de la punta del anillo. */
  largoPunta: Float32Array;
  radioPunta: Float32Array;
}

/** Fracciones de ℓmax de la geometría (DESIGN §9.2). */
export const PROPORCION = { cono: 0.3, radioCono: 0.09, radio: 0.025, normalizada: 0.75, anillo: 0.2, puntaAnillo: 0.15, radioPuntaAnillo: 0.065 } as const;

/** u ∈ [0, 1] de la rampa a partir de ‖F‖/F_ref. */
export function fraccionMagnitud(m: number, fRef: number, luminancia: ModoLuminancia): number {
  const r = m / fRef;
  if (!(r > 0)) return 0;
  return luminancia === 'log' ? Math.min(1, Math.log10(1 + 9 * r)) : Math.min(1, r);
}

/** Gris sRGB [0, 1] de la rampa de magnitud para u ∈ [0, 1]. */
export function grisRampaMagnitud(u: number): number {
  const { lMin, lMax } = rampa.magnitud;
  return grisDeLstar(lMin + (lMax - lMin) * Math.min(1, Math.max(0, u))) / 255;
}

export function calcularFlechas(e: EntradaFlechas, o: OpcionesFlechas): InstanciasFlechas {
  const total = e.total;
  const cola = new Float32Array(3 * total);
  const dir = new Float32Array(3 * total);
  const largo = new Float32Array(total);
  const cono = new Float32Array(total);
  const radioCono = new Float32Array(total);
  const radio = new Float32Array(total);
  const gris = new Float32Array(total);
  const saturada = new Uint8Array(total);
  const nodo = new Uint32Array(total);
  const ceros: number[] = [];
  const indefinidos: number[] = [];
  const umbralCero = CERO_VISUAL * o.fRef;
  const conoMax = PROPORCION.cono * o.lMax;
  let n = 0;
  let nSaturadas = 0;
  for (let i = 0; i < total; i++) {
    const c = e.clase[i];
    const px = e.pos[3 * i] as number;
    const py = e.pos[3 * i + 1] as number;
    const pz = e.pos[3 * i + 2] as number;
    if (c === CLASE.NO_DEFINIDO || c === CLASE.SINGULAR) {
      indefinidos.push(px, py, pz);
      continue;
    }
    const m = e.mag[i] as number;
    if (c === CLASE.CERO || m < umbralCero) {
      ceros.push(px, py, pz);
      continue;
    }
    const dx = (e.F[3 * i] as number) / m;
    const dy = (e.F[3 * i + 1] as number) / m;
    const dz = (e.F[3 * i + 2] as number) / m;
    const l = o.modo === 'normalizado' ? PROPORCION.normalizada * o.lMax : o.lMax * Math.min(m / o.fRef, 1);
    // Flechas cortas: se escala la flecha entera para conservar la forma.
    const s = l < 1.5 * conoMax ? l / (1.5 * conoMax) : 1;
    cola[3 * n] = px - (dx * l) / 2;
    cola[3 * n + 1] = py - (dy * l) / 2;
    cola[3 * n + 2] = pz - (dz * l) / 2;
    dir[3 * n] = dx;
    dir[3 * n + 1] = dy;
    dir[3 * n + 2] = dz;
    largo[n] = l;
    cono[n] = conoMax * s;
    radioCono[n] = PROPORCION.radioCono * o.lMax * s;
    radio[n] = PROPORCION.radio * o.lMax * s;
    gris[n] = grisRampaMagnitud(fraccionMagnitud(m, o.fRef, o.luminancia));
    const sat = o.modo === 'proporcional' && m >= o.fRef ? 1 : 0;
    saturada[n] = sat;
    nSaturadas += sat;
    nodo[n] = i;
    n++;
  }
  return {
    n,
    cola,
    dir,
    largo,
    cono,
    radioCono,
    radio,
    gris,
    saturada,
    nodo,
    ceros: Float32Array.from(ceros),
    indefinidos: Float32Array.from(indefinidos),
    nSaturadas,
    anillos: null,
  };
}

/**
 * Puntas de los anillos orientadas hacia la cámara (para dibujarlas): una en el punto del
 * anillo más cercano a la cámara y otra en el opuesto, con la tangente del giro positivo
 * (t = d × e1, regla de la mano derecha). Así la punta delantera se ve siempre de perfil. Si
 * el anillo se ve de frente (cámara casi sobre su eje), se usan las puntas de `anillos`.
 */
export function puntasHaciaCamara(a: AnillosRotacional, dir: ArrayLike<number>, camara: readonly [number, number, number], punta: Float32Array, tangente: Float32Array): void {
  for (let i = 0; i < a.n; i++) {
    const d = [dir[3 * i] as number, dir[3 * i + 1] as number, dir[3 * i + 2] as number];
    const v = [0, 1, 2].map((k) => camara[k]! - (a.centro[3 * i + k] as number));
    const lv = Math.hypot(v[0]!, v[1]!, v[2]!);
    const vd = v[0]! * d[0]! + v[1]! * d[1]! + v[2]! * d[2]!;
    const e = v.map((x, k) => x - vd * d[k]!);
    const le = Math.hypot(e[0]!, e[1]!, e[2]!);
    if (!(le > 0.1 * lv)) {
      punta.set(a.punta.subarray(6 * i, 6 * i + 6), 6 * i);
      tangente.set(a.tangente.subarray(6 * i, 6 * i + 6), 6 * i);
      continue;
    }
    const e1 = e.map((x) => x / le);
    const t = [d[1]! * e1[2]! - d[2]! * e1[1]!, d[2]! * e1[0]! - d[0]! * e1[2]!, d[0]! * e1[1]! - d[1]! * e1[0]!];
    const r = a.radio[i] as number;
    for (let k = 0; k < 3; k++) {
      punta[6 * i + k] = (a.centro[3 * i + k] as number) + r * e1[k]!;
      tangente[6 * i + k] = t[k]!;
      punta[6 * i + 3 + k] = (a.centro[3 * i + k] as number) - r * e1[k]!;
      tangente[6 * i + 3 + k] = -t[k]!;
    }
  }
}

/**
 * Anillos de los glifos de rot F (DESIGN §9.7): en el centro de cada flecha, perpendiculares
 * a su eje, con una punta de flecha cuyo sentido sigue la regla de la mano derecha (con el
 * pulgar en el sentido de ∇×F, los dedos giran como el anillo: antihorario visto desde la
 * punta de la flecha). Radio 0.2·ℓmax, escalado como la flecha si esta es corta.
 */
export function anillosRotacional(inst: InstanciasFlechas, lMax: number): AnillosRotacional {
  const n = inst.n;
  const centro = new Float32Array(3 * n);
  const radio = new Float32Array(n);
  const punta = new Float32Array(6 * n);
  const tangente = new Float32Array(6 * n);
  const largoPunta = new Float32Array(n);
  const radioPunta = new Float32Array(n);
  const conoMax = PROPORCION.cono * lMax;
  for (let i = 0; i < n; i++) {
    const d = [inst.dir[3 * i] as number, inst.dir[3 * i + 1] as number, inst.dir[3 * i + 2] as number] as const;
    const l = inst.largo[i] as number;
    const s = conoMax > 0 ? (inst.cono[i] as number) / conoMax : 1;
    const c = [0, 1, 2].map((k) => (inst.cola[3 * i + k] as number) + (d[k] * l) / 2);
    // e1 ⊥ d, construido con el eje coordenado menos alineado con d; t = d × e1 (giro positivo).
    const k = [0, 1, 2].reduce((m, j) => (Math.abs(d[j]!) < Math.abs(d[m]!) ? j : m), 0);
    const a = [0, 0, 0];
    a[k] = 1;
    const e = [d[1] * a[2]! - d[2] * a[1]!, d[2] * a[0]! - d[0] * a[2]!, d[0] * a[1]! - d[1] * a[0]!];
    const le = Math.hypot(e[0]!, e[1]!, e[2]!);
    const e1 = e.map((x) => x / le);
    const t = [d[1] * e1[2]! - d[2] * e1[1]!, d[2] * e1[0]! - d[0] * e1[2]!, d[0] * e1[1]! - d[1] * e1[0]!];
    const r = PROPORCION.anillo * lMax * s;
    for (let j = 0; j < 3; j++) {
      centro[3 * i + j] = c[j]!;
      // En c + r·e1 el giro positivo va según t = d × e1; en el punto opuesto, según −t.
      punta[6 * i + j] = c[j]! + r * e1[j]!;
      tangente[6 * i + j] = t[j]!;
      punta[6 * i + 3 + j] = c[j]! - r * e1[j]!;
      tangente[6 * i + 3 + j] = -t[j]!;
    }
    radio[i] = r;
    largoPunta[i] = PROPORCION.puntaAnillo * lMax * s;
    radioPunta[i] = PROPORCION.radioPuntaAnillo * lMax * s;
  }
  return { n, centro, radio, punta, tangente, largoPunta, radioPunta };
}
