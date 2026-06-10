import type { Mat2, Vec2 } from './types';

/*
 * Pure 2D linear algebra. This module (and the rest of `src/math`) must stay
 * free of DOM/React imports so every function is trivially unit-testable.
 */

export const IDENTITY: Mat2 = Object.freeze({ a: 1, b: 0, c: 0, d: 1 });
export const ZERO_MAT: Mat2 = Object.freeze({ a: 0, b: 0, c: 0, d: 0 });

export function mat2(a: number, b: number, c: number, d: number): Mat2 {
  return { a, b, c, d };
}

export function vec2(x: number, y: number): Vec2 {
  return { x, y };
}

/* ----------------------------- vectors ----------------------------- */

export function add(u: Vec2, v: Vec2): Vec2 {
  return { x: u.x + v.x, y: u.y + v.y };
}

export function sub(u: Vec2, v: Vec2): Vec2 {
  return { x: u.x - v.x, y: u.y - v.y };
}

export function scale(v: Vec2, s: number): Vec2 {
  return { x: v.x * s, y: v.y * s };
}

export function dot(u: Vec2, v: Vec2): number {
  return u.x * v.x + u.y * v.y;
}

/** z-component of the 3D cross product — signed area of the (u, v) parallelogram. */
export function cross(u: Vec2, v: Vec2): number {
  return u.x * v.y - u.y * v.x;
}

export function length(v: Vec2): number {
  return Math.hypot(v.x, v.y);
}

export function distance(u: Vec2, v: Vec2): number {
  return Math.hypot(u.x - v.x, u.y - v.y);
}

/** Rotate 90° counter-clockwise. */
export function perp(v: Vec2): Vec2 {
  return { x: -v.y, y: v.x };
}

/** Unit vector in the direction of v, or null when v is (numerically) zero. */
export function normalize(v: Vec2): Vec2 | null {
  const len = length(v);
  if (len < 1e-12) return null;
  return { x: v.x / len, y: v.y / len };
}

export function lerpVec(u: Vec2, v: Vec2, t: number): Vec2 {
  return { x: u.x + (v.x - u.x) * t, y: u.y + (v.y - u.y) * t };
}

/**
 * Flip a direction vector, if needed, into a canonical half-plane
 * (x > 0, or x = 0 and y > 0). Eigenvectors and kernel directions are only
 * defined up to sign; canonicalizing keeps labels and tests stable.
 */
export function canonicalDirection(v: Vec2): Vec2 {
  if (v.x < -1e-12 || (Math.abs(v.x) <= 1e-12 && v.y < 0)) return { x: -v.x, y: -v.y };
  return v;
}

/* ----------------------------- matrices ----------------------------- */

export function fromColumns(c1: Vec2, c2: Vec2): Mat2 {
  return { a: c1.x, b: c2.x, c: c1.y, d: c2.y };
}

/** First column — the landing spot of î. */
export function columnI(m: Mat2): Vec2 {
  return { x: m.a, y: m.c };
}

/** Second column — the landing spot of ĵ. */
export function columnJ(m: Mat2): Vec2 {
  return { x: m.b, y: m.d };
}

export function apply(m: Mat2, v: Vec2): Vec2 {
  return { x: m.a * v.x + m.b * v.y, y: m.c * v.x + m.d * v.y };
}

/**
 * Matrix product m·n. Mind the order: (m·n)(v) = m(n(v)), so **n acts first**.
 * "Apply A, then B" therefore corresponds to multiply(B, A).
 */
export function multiply(m: Mat2, n: Mat2): Mat2 {
  return {
    a: m.a * n.a + m.b * n.c,
    b: m.a * n.b + m.b * n.d,
    c: m.c * n.a + m.d * n.c,
    d: m.c * n.b + m.d * n.d,
  };
}

export function addMat(m: Mat2, n: Mat2): Mat2 {
  return { a: m.a + n.a, b: m.b + n.b, c: m.c + n.c, d: m.d + n.d };
}

export function scaleMat(m: Mat2, s: number): Mat2 {
  return { a: m.a * s, b: m.b * s, c: m.c * s, d: m.d * s };
}

export function transpose(m: Mat2): Mat2 {
  return { a: m.a, b: m.c, c: m.b, d: m.d };
}

export function det(m: Mat2): number {
  return m.a * m.d - m.b * m.c;
}

export function trace(m: Mat2): number {
  return m.a + m.d;
}

export function maxAbs(m: Mat2): number {
  return Math.max(Math.abs(m.a), Math.abs(m.b), Math.abs(m.c), Math.abs(m.d));
}

/**
 * Scale-invariant singularity test. |det| = ‖col1‖·‖col2‖·|sin θ|, so dividing
 * by the column-norm product tests the *angle* between the columns; a tiny but
 * well-conditioned matrix (e.g. 1e-8·I) is correctly reported as invertible,
 * while any matrix with collinear (or zero) columns is singular.
 */
export function isSingular(m: Mat2, tol = 1e-9): boolean {
  const colProduct = length(columnI(m)) * length(columnJ(m));
  return Math.abs(det(m)) <= tol * colProduct;
}

export function inverse(m: Mat2): Mat2 | null {
  if (isSingular(m)) return null;
  const dInv = 1 / det(m);
  return { a: m.d * dInv, b: -m.b * dInv, c: -m.c * dInv, d: m.a * dInv };
}

export function matApproxEquals(m: Mat2, n: Mat2, tol = 1e-9): boolean {
  return (
    Math.abs(m.a - n.a) <= tol &&
    Math.abs(m.b - n.b) <= tol &&
    Math.abs(m.c - n.c) <= tol &&
    Math.abs(m.d - n.d) <= tol
  );
}

export function vecApproxEquals(u: Vec2, v: Vec2, tol = 1e-9): boolean {
  return Math.abs(u.x - v.x) <= tol && Math.abs(u.y - v.y) <= tol;
}

/** Tame pathological entries so rendering never explodes: NaN becomes 0, and
 * anything beyond ±limit (including ±Infinity) clamps to ±limit. */
export function sanitizeMat(m: Mat2, limit = 1e6): Mat2 {
  const fix = (x: number) => (Number.isNaN(x) ? 0 : Math.max(-limit, Math.min(limit, x)));
  return { a: fix(m.a), b: fix(m.b), c: fix(m.c), d: fix(m.d) };
}
