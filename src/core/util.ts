/** Small math / geometry helpers shared by every system. */

export const TAU = Math.PI * 2;

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Frame-rate independent exponential approach. `rate` = fraction closed per second. */
export const damp = (a: number, b: number, rate: number, dt: number): number =>
  lerp(a, b, 1 - Math.exp(-rate * dt));

export const sign = Math.sign;

export const dist2 = (ax: number, ay: number, bx: number, by: number): number => {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
};

export const dist = (ax: number, ay: number, bx: number, by: number): number =>
  Math.sqrt(dist2(ax, ay, bx, by));

/** Shortest signed delta between two angles, in (-PI, PI]. */
export function angleDelta(from: number, to: number): number {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export function approachAngle(from: number, to: number, maxStep: number): number {
  const d = angleDelta(from, to);
  if (Math.abs(d) <= maxStep) return to;
  return from + Math.sign(d) * maxStep;
}

export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t: number): number => t * t * t;
export const easeOutBack = (t: number): number => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
export const easeInOutQuad = (t: number): number =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

/** Mulberry32 — tiny deterministic PRNG so effects can be reproducible when needed. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ambient/visual randomness. Gameplay uses the same source; nothing here needs replay determinism. */
export const rand = (min = 0, max = 1): number => min + Math.random() * (max - min);
export const randInt = (min: number, max: number): number =>
  Math.floor(min + Math.random() * (max - min + 1));
export const pick = <T>(arr: readonly T[]): T => arr[(Math.random() * arr.length) | 0];
export const chance = (p: number): boolean => Math.random() < p;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const rectsOverlap = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export const pointInRect = (px: number, py: number, r: Rect): boolean =>
  px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;

/** Circle vs circle. Cheap and forgiving — the shape most hitboxes use. */
export const circlesOverlap = (
  ax: number,
  ay: number,
  ar: number,
  bx: number,
  by: number,
  br: number,
): boolean => dist2(ax, ay, bx, by) <= (ar + br) * (ar + br);

/** Circle vs axis-aligned rect (used for body-vs-wall and cone-vs-body checks). */
export function circleRectOverlap(cx: number, cy: number, r: number, rect: Rect): boolean {
  const nx = clamp(cx, rect.x, rect.x + rect.w);
  const ny = clamp(cy, rect.y, rect.y + rect.h);
  return dist2(cx, cy, nx, ny) <= r * r;
}

/**
 * Circle vs an arc/cone centred on `ox,oy`. Used by every melee swing so that
 * "what can I hit" matches the arc the player actually sees on screen.
 */
export function circleInArc(
  ox: number,
  oy: number,
  facing: number,
  halfAngle: number,
  reach: number,
  cx: number,
  cy: number,
  cr: number,
): boolean {
  const d = dist(ox, oy, cx, cy);
  if (d > reach + cr) return false;
  // Anything overlapping the origin always counts (avoids blind spots at point blank).
  if (d <= cr) return true;
  const a = Math.atan2(cy - oy, cx - ox);
  // Widen the cone by the angular radius of the target so big enemies are not clipped.
  const slack = Math.atan2(cr, Math.max(d, 1));
  return Math.abs(angleDelta(facing, a)) <= halfAngle + slack;
}

/** Distance from point to segment — the whip / spear / laser hit test. */
export function pointSegmentDist(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return dist(px, py, ax, ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = clamp(t, 0, 1);
  return dist(px, py, ax + t * dx, ay + t * dy);
}

/** Convert an 8-direction input vector into a normalized {x,y} (no diagonal speed boost). */
export function normalize(x: number, y: number): { x: number; y: number; len: number } {
  const len = Math.hypot(x, y);
  if (len < 1e-6) return { x: 0, y: 0, len: 0 };
  return { x: x / len, y: y / len, len };
}

/** Snap an angle to the nearest of 8 compass directions. */
export function snap8(angle: number): number {
  const step = TAU / 8;
  return Math.round(angle / step) * step;
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
