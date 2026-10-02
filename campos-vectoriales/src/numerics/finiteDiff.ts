/**
 * Diferencias finitas y derivadas en un punto (NUM-02, SPEC §5.4).
 *
 * - Paso centrado h_j = ε^{1/3}·max(|x_j|, L) con pasos efectivos h⁺ = (x+h) − x y
 *   h⁻ = x − (x−h): se divide por el incremento realmente aplicado.
 * - Si un lado no está definido: fórmula de Lagrange de 3 puntos (segundo orden) hacia el
 *   lado válido; si tampoco, la derivada es «no definida».
 * - `derivadasEnPunto` combina la jacobiana simbólica con el respaldo numérico: finita →
 *   analítica; ±∞ → no acotada; NaN → numérica; punto anguloso → no diferenciable.
 */
import type { EvaluadorCampo, EvaluadorJacobiana } from '../math/tipos';

export const EPS_MAQUINA = 2 ** -52;
export const RAIZ_CUBICA_EPS = Math.cbrt(EPS_MAQUINA);

export type MetodoColumna = 'central' | 'adelante' | 'atras' | 'no-definida';
export type EstadoDerivada = 'analitica' | 'numerica' | 'no-acotada' | 'no-definida';

/** Paso centrado para la coordenada x_j con escala de longitud L. */
export function pasoCentrado(xj: number, L: number): number {
  return RAIZ_CUBICA_EPS * Math.max(Math.abs(xj), L);
}

const finitos3 = (v: Float64Array, o: number) =>
  Number.isFinite(v[o]) && Number.isFinite(v[o + 1]) && Number.isFinite(v[o + 2]);

/**
 * Jacobiana numérica en orden de filas (J[3i+j] = ∂F_i/∂x_j). Devuelve el método de cada
 * columna. Requiere que F esté definido en el punto.
 */
export function jacobianaNumerica(
  F: EvaluadorCampo,
  x: number,
  y: number,
  z: number,
  p: Float64Array,
  L: number,
  J: Float64Array = new Float64Array(9),
): { J: Float64Array; metodos: MetodoColumna[] } {
  const q = [x, y, z];
  const f0 = new Float64Array(3);
  const f1 = new Float64Array(3);
  const f2 = new Float64Array(3);
  F(x, y, z, p, f0, 0);
  const metodos: MetodoColumna[] = [];
  for (let j = 0; j < 3; j++) {
    const xj = q[j] as number;
    const h = pasoCentrado(xj, L);
    const evaluar = (t: number, out: Float64Array) => {
      const r = [x, y, z];
      r[j] = t;
      F(r[0] as number, r[1] as number, r[2] as number, p, out, 0);
    };
    const xp = xj + h;
    const xm = xj - h;
    evaluar(xp, f1);
    evaluar(xm, f2);
    if (finitos3(f1, 0) && finitos3(f2, 0)) {
      const d = xp - xm; // = h⁺ + h⁻
      for (let i = 0; i < 3; i++) J[3 * i + j] = ((f1[i] as number) - (f2[i] as number)) / d;
      metodos.push('central');
      continue;
    }
    // Unilateral de 3 puntos: x0, x0 + a, x0 + b (b ≈ 2a), con a, b efectivos.
    let hecho = false;
    for (const signo of [1, -1] as const) {
      const t1 = xj + signo * h;
      const t2 = xj + 2 * signo * h;
      evaluar(t1, f1);
      evaluar(t2, f2);
      if (!finitos3(f1, 0) || !finitos3(f2, 0) || !finitos3(f0, 0)) continue;
      const a = t1 - xj;
      const b = t2 - xj;
      const c0 = -(a + b) / (a * b);
      const c1 = b / (a * (b - a));
      const c2 = -a / (b * (b - a));
      for (let i = 0; i < 3; i++) J[3 * i + j] = c0 * (f0[i] as number) + c1 * (f1[i] as number) + c2 * (f2[i] as number);
      metodos.push(signo === 1 ? 'adelante' : 'atras');
      hecho = true;
      break;
    }
    if (!hecho) {
      for (let i = 0; i < 3; i++) J[3 * i + j] = NaN;
      metodos.push('no-definida');
    }
  }
  return { J, metodos };
}

export interface CampoDerivable {
  F: EvaluadorCampo;
  J: EvaluadorJacobiana | null;
  enAngulo?: (x: number, y: number, z: number, p: Float64Array) => boolean;
}

export interface DerivadasPunto {
  /** F está definido (finito) en el punto. */
  definido: boolean;
  F: Float64Array;
  J: Float64Array;
  /** Estado de cada una de las 9 derivadas. */
  estados: EstadoDerivada[];
  /** El punto es anguloso (abs, min, max, atan2, hypot): derivadas no definidas. */
  anguloso: boolean;
  /** Paso usado si alguna derivada es numérica (máximo de las tres columnas). */
  paso: number | null;
}

/** Derivadas de F en un punto con la política de SPEC §5.4. */
export function derivadasEnPunto(c: CampoDerivable, x: number, y: number, z: number, p: Float64Array, L: number): DerivadasPunto {
  const F = new Float64Array(3);
  c.F(x, y, z, p, F, 0);
  const J = new Float64Array(9);
  const estados: EstadoDerivada[] = new Array(9).fill('no-definida');
  if (!finitos3(F, 0)) return { definido: false, F, J: J.fill(NaN), estados, anguloso: false, paso: null };
  if (c.enAngulo?.(x, y, z, p)) return { definido: true, F, J: J.fill(NaN), estados, anguloso: true, paso: null };
  let numerica: { J: Float64Array; metodos: MetodoColumna[] } | null = null;
  const respaldo = () => (numerica ??= jacobianaNumerica(c.F, x, y, z, p, L));
  if (c.J) c.J(x, y, z, p, J, 0);
  for (let k = 0; k < 9; k++) {
    const v = c.J ? (J[k] as number) : NaN;
    if (c.J && Number.isFinite(v)) {
      estados[k] = 'analitica';
    } else if (c.J && (v === Infinity || v === -Infinity)) {
      estados[k] = 'no-acotada';
    } else {
      const n = respaldo();
      const columna = k % 3;
      const valor = n.J[k] as number;
      J[k] = valor;
      estados[k] = n.metodos[columna] !== 'no-definida' && Number.isFinite(valor) ? 'numerica' : 'no-definida';
    }
  }
  const paso = estados.includes('numerica') ? Math.max(pasoCentrado(x, L), pasoCentrado(y, L), pasoCentrado(z, L)) : null;
  return { definido: true, F, J, estados, anguloso: false, paso };
}

/** Diferencia centrada con paso fijo (para medir el orden de convergencia, V-NUM-02). */
export function diferenciaCentrada(f: (t: number) => number, t: number, h: number): number {
  return (f(t + h) - f(t - h)) / (2 * h);
}
