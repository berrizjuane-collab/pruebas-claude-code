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
}

/** Fracciones de ℓmax de la geometría (DESIGN §9.2). */
export const PROPORCION = { cono: 0.3, radioCono: 0.09, radio: 0.025, normalizada: 0.75 } as const;

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
  };
}
