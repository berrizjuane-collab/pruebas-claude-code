import type { Mat2, Vec2 } from './types';
import { canonicalDirection, det, maxAbs, normalize, trace } from './mat2';

export interface EigenPair {
  value: number;
  /** Unit eigenvector, sign-canonicalized (x > 0, or x = 0 and y > 0). */
  vector: Vec2;
}

/**
 * Full classification of the eigenstructure of a real 2×2 matrix.
 * The characteristic polynomial is λ² − tr·λ + det, so everything hinges on
 * the discriminant Δ = tr² − 4·det:
 *
 *  - Δ > 0  → two distinct real eigenvalues (two invariant lines);
 *  - Δ = 0  → a repeated eigenvalue, which splits into:
 *      · scalar (M = λI): *every* direction is an eigendirection,
 *      · defective (e.g. a shear): only one invariant line exists;
 *  - Δ < 0  → a complex-conjugate pair: **no real invariant line** — the map
 *    rotates every direction. We report modulus and argument because the map
 *    is conjugate to a rotation by `angle` combined with scaling by `modulus`.
 */
export type Eigen2 =
  | { kind: 'realDistinct'; pairs: [EigenPair, EigenPair] }
  | { kind: 'repeatedScalar'; value: number }
  | { kind: 'repeatedDefective'; value: number; vector: Vec2 }
  | { kind: 'complex'; re: number; im: number; modulus: number; angle: number };

export function eigen2(m: Mat2): Eigen2 {
  const tr = trace(m);
  const dt = det(m);
  const disc = tr * tr - 4 * dt;

  // Tolerances must scale with the matrix: disc has units of (entries)².
  const s = Math.max(maxAbs(m), 1);
  const discTol = 1e-9 * s * s;

  if (disc > discTol) {
    const sq = Math.sqrt(disc);
    const l1 = (tr + sq) / 2;
    const l2 = (tr - sq) / 2;
    return {
      kind: 'realDistinct',
      pairs: [
        { value: l1, vector: eigenvectorFor(m, l1) },
        { value: l2, vector: eigenvectorFor(m, l2) },
      ],
    };
  }

  if (disc < -discTol) {
    const re = tr / 2;
    const im = Math.sqrt(-disc) / 2;
    return { kind: 'complex', re, im, modulus: Math.hypot(re, im), angle: Math.atan2(im, re) };
  }

  // Repeated eigenvalue λ = tr/2. Distinguish λI from a defective matrix by
  // the residual ‖M − λI‖: zero residual means every vector is an eigenvector.
  const l = tr / 2;
  const residual = Math.max(Math.abs(m.a - l), Math.abs(m.b), Math.abs(m.c), Math.abs(m.d - l));
  if (residual <= 1e-9 * s) {
    return { kind: 'repeatedScalar', value: l };
  }
  return { kind: 'repeatedDefective', value: l, vector: eigenvectorFor(m, l) };
}

/**
 * Eigenvector for a known real eigenvalue λ: any nonzero vector orthogonal to
 * a row of (M − λI). Using the larger-norm row keeps the result numerically
 * stable when one row has nearly cancelled to zero.
 */
function eigenvectorFor(m: Mat2, lambda: number): Vec2 {
  const r1 = { x: m.a - lambda, y: m.b };
  const r2 = { x: m.c, y: m.d - lambda };
  const useFirst = r1.x * r1.x + r1.y * r1.y >= r2.x * r2.x + r2.y * r2.y;
  const row = useFirst ? r1 : r2;
  const v = normalize({ x: -row.y, y: row.x });
  // Both rows ~zero ⇒ M ≈ λI; any direction works (callers treat this as scalar anyway).
  if (!v) return { x: 1, y: 0 };
  return canonicalDirection(v);
}
