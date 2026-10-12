/**
 * Observadores físicos y tétradas ortonormales en Kerr–Schild cartesianas.
 *
 * Familias:
 *  - Estático (u ∝ ∂_t): solo existe fuera de la ergosfera (g_tt < 0).
 *  - ZAMO (momento angular nulo, u_μ ∝ −∇_μ t_BL): existe fuera del horizonte, también en la
 *    ergosfera; gira con ω = 2ar/A (arrastre de marcos).
 *  - Órbita circular (u ∝ ∂_t + Ω ∂_φ): temporal solo si g_tt + 2Ω g_tφ + Ω² g_φφ < 0.
 *  - «Lluvia» (Doran / río de Hamilton–Lisle): caída libre desde el reposo en el infinito con
 *    E = 1, L = 0, Q = 0. Existe en todo r > 0 y atraviesa el horizonte con suavidad.
 *
 * Las tétradas se construyen por Gram–Schmidt con la métrica g a partir de direcciones
 * coordenadas «semilla», de modo que e₀ = u y g(e_a, e_b) = η_ab.
 */
import { KerrSchild } from '../metrics/kerrSchild';
import { horizons } from '../metrics/kerr';
import {
  cartesianFromSpheroidal,
  jacobianCartesianSpheroidal,
  regularInfallUr,
  spheroidalFromCartesian,
  spheroidalGradients,
} from '../metrics/coordinates';

export type Vec4 = Float64Array;

export type ObserverKind = 'static' | 'zamo' | 'circular' | 'rain';

export const OBSERVER_LABELS: Record<ObserverKind, string> = {
  static: 'Estático',
  zamo: 'ZAMO',
  circular: 'En órbita circular',
  rain: 'Caída libre (lluvia)',
};

/** Vector de Killing axial ∂_φ en cartesianas: (0, −y, x, 0). */
export function axialKilling(x: number, y: number): Vec4 {
  return Float64Array.of(0, -y, x, 0);
}

/** Observador estático: u = ∂_t/√(−g_tt). Devuelve null dentro de la ergosfera. */
export function staticObserver(ks: KerrSchild, x: number, y: number, z: number): Vec4 | null {
  const g = ks.geometry(x, y, z);
  const gtt = -1 + g.f;
  if (gtt >= -1e-12) return null;
  return Float64Array.of(1 / Math.sqrt(-gtt), 0, 0, 0);
}

/** ZAMO: u_μ = −α ∇_μ t_BL con t_BL = t − h(r), h' = 2r/Δ. Null dentro del horizonte. */
export function zamoObserver(ks: KerrSchild, x: number, y: number, z: number): Vec4 | null {
  const g = ks.geometry(x, y, z);
  const r = g.r;
  const D = r * r - 2 * r + ks.a * ks.a;
  if (D <= 1e-12) return null;
  const hp = (2 * r) / D;
  const n = Float64Array.of(1, -hp * g.dr[0], -hp * g.dr[1], -hp * g.dr[2]);
  const nu = ks.raise(x, y, z, n);
  const N = n[0] * nu[0] + n[1] * nu[1] + n[2] * nu[2] + n[3] * nu[3];
  if (!(N < 0)) return null;
  const s = 1 / Math.sqrt(-N);
  // u^μ = −g^μν n_ν / √(−N)  (futuro: u^t > 0)
  const u = Float64Array.of(-nu[0] * s, -nu[1] * s, -nu[2] * s, -nu[3] * s);
  if (u[0] < 0) for (let i = 0; i < 4; i++) u[i] = -u[i];
  return u;
}

/** Observador que gira con velocidad angular Ω (= dφ/dt): u = (∂_t + Ω ∂_φ)/N. Null si no es temporal. */
export function circularObserver(ks: KerrSchild, x: number, y: number, z: number, omega: number): Vec4 | null {
  const v = Float64Array.of(1, -omega * y, omega * x, 0);
  const n2 = ks.dot(x, y, z, v, v);
  if (!(n2 < -1e-14)) return null;
  const s = 1 / Math.sqrt(-n2);
  for (let i = 0; i < 4; i++) v[i] *= s;
  return v;
}

/** Observador de «lluvia» (Doran): caída libre radial desde el reposo en el infinito, E = 1, L = Q = 0. */
export function rainObserver(ks: KerrSchild, x: number, y: number, z: number): Vec4 {
  const sph = spheroidalFromCartesian(x, y, z, ks.a);
  const ur = regularInfallUr(sph.r, sph.theta, ks.a, -1, 0, 0, 1);
  const G = spheroidalGradients(x, y, z, ks.a);
  const w = Float64Array.of(-1, ur * G[0], ur * G[1], ur * G[2]);
  return ks.raise(x, y, z, w);
}

export function observerVelocity(
  kind: ObserverKind,
  ks: KerrSchild,
  x: number,
  y: number,
  z: number,
  omega = 0,
): Vec4 | null {
  switch (kind) {
    case 'static':
      return staticObserver(ks, x, y, z);
    case 'zamo':
      return zamoObserver(ks, x, y, z);
    case 'circular':
      return circularObserver(ks, x, y, z, omega);
    case 'rain':
      return rainObserver(ks, x, y, z);
  }
}

/** ¿Puede existir el observador en ese punto? (motivo legible si no) */
export function observerAvailability(kind: ObserverKind, ks: KerrSchild, x: number, y: number, z: number, omega = 0): string | null {
  const r = ks.geometry(x, y, z).r;
  const { rPlus } = horizons(ks.a);
  if (kind === 'static' && !staticObserver(ks, x, y, z))
    return r <= rPlus ? 'Dentro del horizonte ningún observador puede permanecer en reposo.' : 'Dentro de la ergosfera ningún observador puede permanecer estático: el arrastre de marcos obliga a girar.';
  if (kind === 'zamo' && !zamoObserver(ks, x, y, z)) return 'Los ZAMO solo existen fuera del horizonte.';
  if (kind === 'circular' && !circularObserver(ks, x, y, z, omega)) return 'Con esa velocidad angular la trayectoria no sería temporal (iría más rápido que la luz).';
  return null;
}

export interface Tetrad {
  /** e[0] = u; e[1..3] espaciales; cada uno contravariante en KS cartesianas. */
  e: [Vec4, Vec4, Vec4, Vec4];
}

/**
 * Tétrada ortonormal por Gram–Schmidt: e₀ = u y e₁, e₂, e₃ a partir de las semillas s₁, s₂, s₃
 * (vectores contravariantes; solo importa su parte espacial salvo que se indique otra cosa).
 */
export function gramSchmidtTetrad(
  ks: KerrSchild,
  x: number,
  y: number,
  z: number,
  u: Vec4,
  seeds: [ArrayLike<number>, ArrayLike<number>, ArrayLike<number>],
): Tetrad {
  const dot = (p: ArrayLike<number>, q: ArrayLike<number>) => ks.dot(x, y, z, p, q);
  const e0 = Float64Array.from(u);
  const out: Vec4[] = [e0];
  for (let k = 0; k < 3; k++) {
    const v = Float64Array.from(seeds[k]);
    // Proyección ortogonal a u (signo de η_00 = −1)
    const vu = dot(v, e0);
    for (let i = 0; i < 4; i++) v[i] += vu * e0[i];
    for (let j = 1; j < out.length; j++) {
      const vj = dot(v, out[j]);
      for (let i = 0; i < 4; i++) v[i] -= vj * out[j][i];
    }
    const n2 = dot(v, v);
    if (!(n2 > 1e-24)) throw new Error('Tétrada degenerada: semillas paralelas');
    const s = 1 / Math.sqrt(n2);
    for (let i = 0; i < 4; i++) v[i] *= s;
    out.push(v);
  }
  return { e: out as [Vec4, Vec4, Vec4, Vec4] };
}

/**
 * Marco esférico local (e_r, e_θ, e_φ) de un observador con 4-velocidad u.
 *
 * Gram–Schmidt en el orden ∂_φ → ∂_θ → ∂_r: así e_φ ∝ proyección de ∂_φ (vector de Killing axial),
 * e_θ ∝ ∂_θ (idéntico en BL y KS) y e_r queda fijado por ortogonalidad. Es el marco canónico del
 * observador (para un ZAMO coincide con e_r ∝ ∂_r^BL), independiente de que ∂_r^KS no sea
 * ortogonal a ∂_φ (g_rφ ≠ 0 en Kerr–Schild). En el eje (sinθ → 0) se usan semillas cartesianas.
 */
export function sphericalTetrad(ks: KerrSchild, x: number, y: number, z: number, u: Vec4): Tetrad {
  const { r, theta, phi } = spheroidalFromCartesian(x, y, z, ks.a);
  const J = jacobianCartesianSpheroidal(r, theta, phi, ks.a);
  const dr = Float64Array.of(0, J[0], J[3], J[6]);
  const dth = Float64Array.of(0, J[1], J[4], J[7]);
  const dph = Float64Array.of(0, J[2], J[5], J[8]);
  if (Math.sin(theta) < 1e-6) {
    const sgn = Math.cos(theta) >= 0 ? 1 : -1;
    return gramSchmidtTetrad(ks, x, y, z, u, [Float64Array.of(0, 0, 0, sgn), Float64Array.of(0, sgn, 0, 0), Float64Array.of(0, 0, 1, 0)]);
  }
  const t = gramSchmidtTetrad(ks, x, y, z, u, [dph, dth, dr]);
  return { e: [t.e[0], t.e[3], t.e[2], t.e[1]] };
}

/** Componentes de un vector v en la tétrada: v^(a) = η^aa g(v, e_a). */
export function frameComponents(ks: KerrSchild, x: number, y: number, z: number, tet: Tetrad, v: ArrayLike<number>): [number, number, number, number] {
  return [
    -ks.dot(x, y, z, v, tet.e[0]),
    ks.dot(x, y, z, v, tet.e[1]),
    ks.dot(x, y, z, v, tet.e[2]),
    ks.dot(x, y, z, v, tet.e[3]),
  ];
}

/** Vector a partir de sus componentes en la tétrada. */
export function fromFrame(tet: Tetrad, c: ArrayLike<number>): Vec4 {
  const v = new Float64Array(4);
  for (let a = 0; a < 4; a++) for (let i = 0; i < 4; i++) v[i] += c[a] * tet.e[a][i];
  return v;
}

/**
 * 4-velocidad de un cuerpo lanzado con velocidad física local v (|v| < 1, en unidades de c) medida
 * por el observador de la tétrada: u = γ (e₀ + vⁱ eᵢ).
 */
export function velocityFromLocal(tet: Tetrad, v: [number, number, number]): Vec4 {
  const v2 = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
  if (!(v2 < 1)) throw new RangeError('La velocidad local de un cuerpo masivo debe ser menor que c.');
  const gamma = 1 / Math.sqrt(1 - v2);
  return fromFrame(tet, [gamma, gamma * v[0], gamma * v[1], gamma * v[2]]);
}

/** Momento de un fotón de energía local E y dirección unitaria n en el marco: p = E (e₀ + nⁱ eᵢ). */
export function photonFromLocal(tet: Tetrad, n: [number, number, number], energy = 1): Vec4 {
  const nn = Math.hypot(n[0], n[1], n[2]);
  return fromFrame(tet, [energy, (energy * n[0]) / nn, (energy * n[1]) / nn, (energy * n[2]) / nn]);
}

/**
 * Velocidad relativa de un cuerpo (u) respecto de un observador (w):
 * γ = −g(u, w), |v| = √(1 − 1/γ²), y la dirección en el marco del observador.
 */
export function relativeVelocity(ks: KerrSchild, x: number, y: number, z: number, u: ArrayLike<number>, tet: Tetrad): { gamma: number; speed: number; v: [number, number, number] } {
  const c = frameComponents(ks, x, y, z, tet, u);
  const gamma = c[0];
  return {
    gamma,
    speed: Math.sqrt(Math.max(0, 1 - 1 / (gamma * gamma))),
    v: [c[1] / gamma, c[2] / gamma, c[3] / gamma],
  };
}

/** Posición cartesiana a partir de (r, θ, φ̃). Reexportado por conveniencia. */
export { cartesianFromSpheroidal };
