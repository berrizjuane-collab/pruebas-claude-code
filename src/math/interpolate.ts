import type { Mat2 } from './types';
import { maxAbs } from './mat2';

export type InterpMode = 'linear' | 'rotational';

export function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** Smooth start/stop easing for animations (no library needed). */
export function easeInOutCubic(t: number): number {
  const u = clamp01(t);
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}

/** Entrywise interpolation: M(t) = (1−t)·from + t·to. */
export function lerpMat(from: Mat2, to: Mat2, t: number): Mat2 {
  return {
    a: from.a + (to.a - from.a) * t,
    b: from.b + (to.b - from.b) * t,
    c: from.c + (to.c - from.c) * t,
    d: from.d + (to.d - from.d) * t,
  };
}

/**
 * A *similarity* is rotation + uniform scaling: the matrices of the form
 *
 *      | a  −c |
 *      | c   a |
 *
 * They behave exactly like the complex number z = a + c·i acting by
 * multiplication, which is what makes a natural rotation animation possible.
 */
export function isSimilarity(m: Mat2, tol = 1e-9): boolean {
  const s = Math.max(maxAbs(m), 1);
  return Math.abs(m.a - m.d) <= tol * s && Math.abs(m.b + m.c) <= tol * s;
}

/** Wrap an angle to (−π, π] so rotations always take the shorter arc. */
function wrapAngle(theta: number): number {
  const tau = 2 * Math.PI;
  let t = ((theta + Math.PI) % tau + tau) % tau - Math.PI;
  if (t === -Math.PI) t = Math.PI;
  return t;
}

/**
 * Geodesic ("log-spiral") interpolation between two similarity matrices.
 *
 * Why this exists: the default entrywise path from I to a 90°-or-more rotation
 * passes through a *singular* matrix (for 180°, the midpoint is the zero
 * matrix), so the animation looks like the plane collapses and re-inflates —
 * mathematically correct for that path, but not what "rotate" should look
 * like. Viewing a similarity as the complex number z = a + c·i, we instead
 * interpolate the modulus geometrically and the argument along the shorter
 * arc — exactly exp(t·log z) when starting from the identity, i.e. the matrix
 * exponential path. A rotation then animates as a rotation.
 */
export function rotationalLerp(from: Mat2, to: Mat2, t: number): Mat2 {
  const r0 = Math.hypot(from.a, from.c);
  const r1 = Math.hypot(to.a, to.c);
  // The spiral is undefined through z = 0 (no angle there): fall back to linear.
  if (r0 < 1e-12 || r1 < 1e-12) return lerpMat(from, to, t);

  const th0 = Math.atan2(from.c, from.a);
  const dth = wrapAngle(Math.atan2(to.c, to.a) - th0);
  const r = Math.exp((1 - t) * Math.log(r0) + t * Math.log(r1));
  const th = th0 + t * dth;
  const a = r * Math.cos(th);
  const c = r * Math.sin(th);
  return { a, b: -c, c, d: a };
}

/**
 * Interpolate with the requested mode. Rotational interpolation only makes
 * sense between similarities; for anything else it silently falls back to the
 * honest entrywise path.
 */
export function interpolateMat(from: Mat2, to: Mat2, t: number, mode: InterpMode): Mat2 {
  if (mode === 'rotational' && isSimilarity(from) && isSimilarity(to)) {
    return rotationalLerp(from, to, t);
  }
  return lerpMat(from, to, t);
}
