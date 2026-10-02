/**
 * Cantidades derivadas de la jacobiana J (orden de filas, J[3i+j] = ∂F_i/∂x_j):
 * divergencia, rotacional, partes simétrica y antisimétrica, autovalores y helicidad.
 */
import type { Vec3 } from './tipos';

export const divergencia = (j: ArrayLike<number>, o = 0): number =>
  (j[o] as number) + (j[o + 4] as number) + (j[o + 8] as number);

/** ∇×F = (∂R/∂y − ∂Q/∂z, ∂P/∂z − ∂R/∂x, ∂Q/∂x − ∂P/∂y). */
export const rotacional = (j: ArrayLike<number>, o = 0): Vec3 => [
  (j[o + 7] as number) - (j[o + 5] as number),
  (j[o + 2] as number) - (j[o + 6] as number),
  (j[o + 3] as number) - (j[o + 1] as number),
];

/** Helicidad local F·(∇×F). */
export const helicidad = (f: Vec3, rot: Vec3): number => f[0] * rot[0] + f[1] * rot[1] + f[2] * rot[2];

export interface Autovalor {
  re: number;
  im: number;
}

/**
 * Autovalores de una matriz real 3×3 (orden de filas) a partir del polinomio
 * característico λ³ − tr λ² + c₂ λ − det = 0, resuelto por el método trigonométrico o de
 * Cardano según el discriminante. Precisión suficiente para clasificar el flujo local; no
 * se usa en verificaciones de alta precisión.
 */
export function autovalores3(j: ArrayLike<number>, o = 0): Autovalor[] {
  const a = (i: number) => j[o + i] as number;
  const tr = a(0) + a(4) + a(8);
  const c2 = a(0) * a(4) - a(1) * a(3) + a(0) * a(8) - a(2) * a(6) + a(4) * a(8) - a(5) * a(7);
  const det =
    a(0) * (a(4) * a(8) - a(5) * a(7)) - a(1) * (a(3) * a(8) - a(5) * a(6)) + a(2) * (a(3) * a(7) - a(4) * a(6));
  // λ = t + tr/3 → t³ + p t + q = 0
  const s = tr / 3;
  const p = c2 - tr * s;
  const q = -(2 * s * s * s) + c2 * s - det;
  const escala = Math.max(1, Math.abs(tr), Math.abs(c2), Math.abs(det));
  const disc = (q * q) / 4 + (p * p * p) / 27;
  const eps = 1e-14 * escala * escala;
  if (Math.abs(p) <= 1e-14 * escala && Math.abs(q) <= 1e-14 * escala) {
    return [
      { re: s, im: 0 },
      { re: s, im: 0 },
      { re: s, im: 0 },
    ];
  }
  if (disc > eps) {
    const sq = Math.sqrt(disc);
    const u = Math.cbrt(-q / 2 + sq);
    const v = Math.cbrt(-q / 2 - sq);
    const real = u + v + s;
    const re = -(u + v) / 2 + s;
    const im = (Math.sqrt(3) / 2) * Math.abs(u - v);
    return [
      { re: real, im: 0 },
      { re, im },
      { re, im: -im },
    ];
  }
  // Tres raíces reales (método trigonométrico).
  const m = 2 * Math.sqrt(Math.max(0, -p / 3));
  if (m === 0) return [0, 0, 0].map(() => ({ re: s, im: 0 }));
  const arg = Math.min(1, Math.max(-1, (3 * q) / (p * m)));
  const theta = Math.acos(arg) / 3;
  const raices = [0, 1, 2].map((k) => m * Math.cos(theta - (2 * Math.PI * k) / 3) + s);
  raices.sort((x, y) => y - x);
  return raices.map((re) => ({ re, im: 0 }));
}
