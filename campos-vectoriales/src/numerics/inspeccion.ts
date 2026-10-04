/**
 * Valores del inspector en un punto P (INS-02, SPEC RF-08 y §3.4): F, ‖F‖, F̂, la jacobiana y
 * sus autovalores, div F, rot F, la helicidad F·(∇×F), la rueda de paletas (ω = ½‖∇×F‖) y el
 * método de derivación. Función pura: la usan el inspector y las pruebas de coherencia.
 */
import { autovalores3, divergencia, helicidad, rotacional, type Autovalor } from '../math/derivadas';
import type { EvaluadorCampo, Vec3 } from '../math/tipos';
import { derivadasEnPunto, type CampoDerivable } from './finiteDiff';
import { F_MAX } from './grid';

export type MetodoDerivadas = 'analiticas' | 'numericas' | 'mixtas';

export interface DerivadasInspector {
  /** Analíticas (todas simbólicas), numéricas (todas por diferencias) o mixtas. */
  metodo: MetodoDerivadas;
  /** Paso de las diferencias finitas, si alguna derivada es numérica. */
  paso: number | null;
  /** J en orden de filas (J[3i+j] = ∂F_i/∂x_j). */
  J: number[];
  div: number;
  rot: Vec3;
  magRot: number;
  helicidad: number;
  autovalores: Autovalor[];
}

export interface Inspeccion {
  punto: Vec3;
  /** F es finito (y acotado) en P. */
  definido: boolean;
  F: Vec3;
  mag: number;
  /** F̂ = F/‖F‖ (null si ‖F‖ = 0 o no definido). */
  unitario: Vec3 | null;
  /** Derivadas, o el motivo por el que no las hay. */
  derivadas: DerivadasInspector | { motivo: 'no-diferenciable' | 'no-definidas' | 'no-acotadas' };
  /**
   * Campo dependiente del tiempo (SPEC §3.10): instante, derivada local ∂F/∂t y aceleración de
   * la partícula que pasa por P, DF/Dt = ∂F/∂t + J·F (null si no están definidas).
   */
  temporal?: { t: number; dFdt: Vec3 | null; aceleracion: Vec3 | null; metodo: 'analitica' | 'numerica' };
}

/** Lo que el inspector necesita del campo para las derivadas temporales (campo compilado). */
export interface CampoTemporal {
  dependeDelTiempo: boolean;
  dFdt: EvaluadorCampo | null;
}

/**
 * Valores en P. `p` es el vector de evaluación con el instante en su última ranura (D-63); con
 * un campo dependiente del tiempo se añaden ∂F/∂t y DF/Dt (SPEC §3.10).
 */
export function inspeccionar(campo: CampoDerivable & Partial<CampoTemporal>, p: Float64Array, P: Vec3, L: number): Inspeccion {
  const base = inspeccionarEspacio(campo, p, P, L);
  if (!campo.dependeDelTiempo) return base;
  return { ...base, temporal: derivadasTemporales(campo as CampoDerivable & CampoTemporal, p, base) };
}

/**
 * ∂F/∂t simbólica o, si no la hay, por diferencias centradas en t con el paso de SPEC §5.4
 * (h = ε^(1/3)·max(|t|, 1), pasos efectivos); DF/Dt = ∂F/∂t + J·F con la J del inspector.
 */
function derivadasTemporales(campo: CampoDerivable & CampoTemporal, p: Float64Array, ins: Inspeccion): NonNullable<Inspeccion['temporal']> {
  const it = p.length - 1;
  const t = p[it] as number;
  const [x, y, z] = ins.punto;
  const d = new Float64Array(3);
  let metodo: 'analitica' | 'numerica' = 'analitica';
  if (campo.dFdt) campo.dFdt(x, y, z, p, d, 0);
  else {
    metodo = 'numerica';
    const h = Math.cbrt(2 ** -52) * Math.max(Math.abs(t), 1);
    const q = Float64Array.from(p);
    const a = new Float64Array(3);
    const b = new Float64Array(3);
    q[it] = t + h;
    const tA = q[it] as number;
    campo.F(x, y, z, q, a, 0);
    q[it] = t - h;
    const tB = q[it] as number;
    campo.F(x, y, z, q, b, 0);
    for (let k = 0; k < 3; k++) d[k] = ((a[k] as number) - (b[k] as number)) / (tA - tB);
  }
  const dFdt: Vec3 | null = [0, 1, 2].every((k) => Number.isFinite(d[k])) ? [d[0] as number, d[1] as number, d[2] as number] : null;
  let aceleracion: Vec3 | null = null;
  if (dFdt && ins.definido && conDerivadas(ins)) {
    const J = ins.derivadas.J;
    const F = ins.F;
    aceleracion = [0, 1, 2].map((i) => dFdt[i]! + (J[3 * i] as number) * F[0] + (J[3 * i + 1] as number) * F[1] + (J[3 * i + 2] as number) * F[2]) as unknown as Vec3;
  }
  return { t, dFdt, aceleracion, metodo };
}

function inspeccionarEspacio(campo: CampoDerivable, p: Float64Array, P: Vec3, L: number): Inspeccion {
  const d = derivadasEnPunto(campo, P[0], P[1], P[2], p, L);
  const F: Vec3 = [d.F[0] as number, d.F[1] as number, d.F[2] as number];
  const mag = Math.hypot(F[0], F[1], F[2]);
  const definido = d.definido && Number.isFinite(mag) && mag <= F_MAX;
  if (!definido) return { punto: P, definido: false, F, mag, unitario: null, derivadas: { motivo: 'no-definidas' } };
  const unitario: Vec3 | null = mag > 0 ? [F[0] / mag, F[1] / mag, F[2] / mag] : null;
  if (d.anguloso) return { punto: P, definido, F, mag, unitario, derivadas: { motivo: 'no-diferenciable' } };
  if (d.estados.includes('no-definida')) return { punto: P, definido, F, mag, unitario, derivadas: { motivo: 'no-definidas' } };
  if (d.estados.includes('no-acotada')) return { punto: P, definido, F, mag, unitario, derivadas: { motivo: 'no-acotadas' } };
  const J = Array.from(d.J);
  const rot = rotacional(J);
  const analiticas = d.estados.every((e) => e === 'analitica');
  const numericas = d.estados.every((e) => e === 'numerica');
  return {
    punto: P,
    definido,
    F,
    mag,
    unitario,
    derivadas: {
      metodo: analiticas ? 'analiticas' : numericas ? 'numericas' : 'mixtas',
      paso: d.paso,
      J,
      div: divergencia(J),
      rot,
      magRot: Math.hypot(rot[0], rot[1], rot[2]),
      helicidad: helicidad(F, rot),
      autovalores: autovalores3(J),
    },
  };
}

/** ¿Hay derivadas (y no un motivo)? */
export const conDerivadas = (i: Inspeccion): i is Inspeccion & { derivadas: DerivadasInspector } => 'J' in i.derivadas;
