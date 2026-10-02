/**
 * Muestreo sobre un plano de corte (NUM-06, SPEC §3.7): F en una malla M×M del plano,
 * proyección tangencial F∥ = F − (F·n)n (exacta: n es un eje), componente normal F·n, y un
 * escalar en una malla (2M)×(2M): ‖F‖, div F, (rot F)·n o F·n, con su escala V_ref.
 */
import { divergencia, rotacional } from '../math/derivadas';
import { EJES_PLANO, type Dominio, type Plano } from '../math/tipos';
import { derivadasEnPunto, type CampoDerivable } from './finiteDiff';
import { CLASE, F_MAX } from './grid';
import { percentil, redondeoLegible } from './stats';

export type TipoEscalar = 'magnitud' | 'divergencia' | 'rotacional' | 'normal';

export interface EspecCorte {
  plano: Plano;
  c: number;
  M: number;
  dominio: Dominio;
  escalar: TipoEscalar | null;
}

export interface EscalarCorte {
  tipo: TipoEscalar;
  /** Lado de la malla del escalar (2M). */
  lado: number;
  valores: Float64Array;
  /** 0 definido, 1 no definido, 2 no diferenciable. */
  estado: Uint8Array;
  vRef: number;
  /** P95 de |escalar| ≈ 0: el escalar es nulo en todo el corte (V_ref = 1 solo por convención). */
  nulo: boolean;
}

export interface MuestraCorte {
  plano: Plano;
  c: number;
  M: number;
  pos: Float64Array;
  F: Float64Array;
  Fpar: Float64Array;
  Fn: Float64Array;
  mag: Float64Array;
  clase: Uint8Array;
  total: number;
  escalar: EscalarCorte | null;
}

const coordenada = (a: number, b: number, n: number, i: number) => (n === 1 ? (a + b) / 2 : a + ((b - a) * i) / (n - 1));

export function muestrearCorte(campo: CampoDerivable, p: Float64Array, esp: EspecCorte, L: number): MuestraCorte {
  const { u, v, n } = EJES_PLANO[esp.plano];
  const d = esp.dominio;
  const M = esp.M;
  const total = M * M;
  const pos = new Float64Array(3 * total);
  const F = new Float64Array(3 * total);
  const Fpar = new Float64Array(3 * total);
  const Fn = new Float64Array(total);
  const mag = new Float64Array(total);
  const clase = new Uint8Array(total);
  const c = Math.min(d.max[n] as number, Math.max(d.min[n] as number, esp.c));
  let idx = 0;
  for (let j = 0; j < M; j++) {
    for (let i = 0; i < M; i++) {
      const q = [0, 0, 0];
      q[u] = coordenada(d.min[u] as number, d.max[u] as number, M, i);
      q[v] = coordenada(d.min[v] as number, d.max[v] as number, M, j);
      q[n] = c;
      pos.set(q, 3 * idx);
      campo.F(q[0] as number, q[1] as number, q[2] as number, p, F, 3 * idx);
      const f = [F[3 * idx] as number, F[3 * idx + 1] as number, F[3 * idx + 2] as number];
      if (!f.every(Number.isFinite)) {
        clase[idx] = CLASE.NO_DEFINIDO;
        mag[idx] = NaN;
        Fn[idx] = NaN;
        Fpar.fill(NaN, 3 * idx, 3 * idx + 3);
      } else {
        const m = Math.hypot(f[0] as number, f[1] as number, f[2] as number);
        mag[idx] = m;
        clase[idx] = m > F_MAX ? CLASE.SINGULAR : CLASE.VALIDO;
        Fn[idx] = f[n] as number;
        Fpar.set(f, 3 * idx);
        Fpar[3 * idx + n] = 0; // proyección tangencial exacta: se anula la componente normal
      }
      idx++;
    }
  }
  let escalar: EscalarCorte | null = null;
  if (esp.escalar) {
    const lado = 2 * M;
    const valores = new Float64Array(lado * lado);
    const estado = new Uint8Array(lado * lado);
    let k = 0;
    for (let j = 0; j < lado; j++) {
      for (let i = 0; i < lado; i++) {
        const q = [0, 0, 0];
        q[u] = coordenada(d.min[u] as number, d.max[u] as number, lado, i);
        q[v] = coordenada(d.min[v] as number, d.max[v] as number, lado, j);
        q[n] = c;
        valores[k] = NaN;
        if (esp.escalar === 'magnitud' || esp.escalar === 'normal') {
          const f = new Float64Array(3);
          campo.F(q[0] as number, q[1] as number, q[2] as number, p, f, 0);
          const val = esp.escalar === 'magnitud' ? Math.hypot(f[0] as number, f[1] as number, f[2] as number) : (f[n] as number);
          if (Number.isFinite(val) && Math.abs(val) <= F_MAX) valores[k] = val;
          else estado[k] = 1;
        } else {
          const der = derivadasEnPunto(campo, q[0] as number, q[1] as number, q[2] as number, p, L);
          if (!der.definido) estado[k] = 1;
          else if (der.anguloso) estado[k] = 2;
          else {
            const val = esp.escalar === 'divergencia' ? divergencia(der.J) : rotacional(der.J)[n];
            if (Number.isFinite(val)) valores[k] = val as number;
            else estado[k] = 1;
          }
        }
        k++;
      }
    }
    const absolutos: number[] = [];
    for (const val of valores) if (Number.isFinite(val)) absolutos.push(Math.abs(val));
    const p95 = absolutos.length ? percentil(absolutos, 0.95) : 0;
    escalar = { tipo: esp.escalar, lado, valores, estado, vRef: p95 > 1e-12 ? redondeoLegible(p95) : 1, nulo: !(p95 > 1e-12) };
  }
  return { plano: esp.plano, c, M, pos, F, Fpar, Fn, mag, clase, total, escalar };
}
