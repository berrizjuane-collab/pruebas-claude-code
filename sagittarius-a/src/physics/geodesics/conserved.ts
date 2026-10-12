/**
 * Constantes del movimiento geodésico en Kerr (Carter 1968):
 *   E = −p_t,   L_z = p_φ = x p_y − y p_x,   μ² = −g^μν p_μ p_ν,
 *   Q = p_θ² + cos²θ [a² (μ² − E²) + L_z² / sin²θ]   (constante de Carter)
 * con p_θ evaluado en las coordenadas de Kerr entrantes (idéntico a Boyer–Lindquist).
 */
import { KerrSchild } from '../metrics/kerrSchild';
import { covectorCartesianToSpheroidal, spheroidalFromCartesian } from '../metrics/coordinates';

export interface Constants {
  E: number;
  Lz: number;
  Q: number;
  mu2: number;
}

export function constantsOfMotion(ks: KerrSchild, pos: ArrayLike<number>, p: ArrayLike<number>): Constants {
  const [x, y, z] = [pos[0], pos[1], pos[2]];
  const E = -p[0];
  const Lz = x * p[2] - y * p[1];
  const H = ks.hamiltonian([0, x, y, z, p[0], p[1], p[2], p[3]]);
  const mu2 = -2 * H;
  const { r, theta, phi } = spheroidalFromCartesian(x, y, z, ks.a);
  const [, , pth] = covectorCartesianToSpheroidal(r, theta, phi, ks.a, p);
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const Q = pth * pth + c * c * (ks.a * ks.a * (mu2 - E * E) + (s > 1e-12 ? (Lz * Lz) / (s * s) : 0));
  return { E, Lz, Q, mu2 };
}

/** Desviación relativa máxima entre dos conjuntos de constantes (escala absoluta mínima 1e-12·escala). */
export function constantsDrift(c0: Constants, c1: Constants): { dE: number; dL: number; dQ: number; dMu2: number } {
  const rel = (a: number, b: number, scale: number) => Math.abs(b - a) / Math.max(Math.abs(a), scale);
  return {
    dE: rel(c0.E, c1.E, 1e-3),
    dL: rel(c0.Lz, c1.Lz, 1e-3),
    dQ: rel(c0.Q, c1.Q, 1e-3),
    dMu2: Math.abs(c1.mu2 - c0.mu2),
  };
}
