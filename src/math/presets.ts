import type { Mat2 } from './types';

/*
 * Builders for the classic transformations. Angles are in radians.
 */

/** Counter-clockwise rotation by θ. */
export function rotation(theta: number): Mat2 {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return { a: c, b: -s, c: s, d: c };
}

/** Scaling: sx along x, sy along y (uniform when sx = sy). */
export function scaling(sx: number, sy: number): Mat2 {
  return { a: sx, b: 0, c: 0, d: sy };
}

/** Horizontal shear: ĵ leans sideways by k while î stays put. det = 1. */
export function shear(k: number): Mat2 {
  return { a: 1, b: k, c: 0, d: 1 };
}

/**
 * Reflection across the line through the origin at angle θ:
 * R = [[cos 2θ, sin 2θ], [sin 2θ, −cos 2θ]]. Always det = −1.
 */
export function reflection(theta: number): Mat2 {
  const c = Math.cos(2 * theta);
  const s = Math.sin(2 * theta);
  return { a: c, b: s, c: s, d: -c };
}

/**
 * Orthogonal projection onto the line at angle θ: P = u·uᵀ with
 * u = (cos θ, sin θ). Singular by construction (det = 0) — the canonical
 * "space gets flattened" example.
 */
export function projection(theta: number): Mat2 {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return { a: c * c, b: c * s, c: c * s, d: s * s };
}
