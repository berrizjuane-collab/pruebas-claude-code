/**
 * Valores del inspector en un punto P (INS-02, SPEC RF-08 y §3.4): F, ‖F‖, F̂, la jacobiana y
 * sus autovalores, div F, rot F, la helicidad F·(∇×F), la rueda de paletas (ω = ½‖∇×F‖) y el
 * método de derivación. Función pura: la usan el inspector y las pruebas de coherencia.
 */
import { autovalores3, divergencia, helicidad, rotacional, type Autovalor } from '../math/derivadas';
import type { Vec3 } from '../math/tipos';
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
}

export function inspeccionar(campo: CampoDerivable, p: Float64Array, P: Vec3, L: number): Inspeccion {
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
