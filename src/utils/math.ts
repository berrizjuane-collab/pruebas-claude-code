/** Small, dependency-free math helpers shared across the rendering layer. */

export const clamp = (x: number, lo: number, hi: number): number =>
  x < lo ? lo : x > hi ? hi : x;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Map a value from one range to another (no clamping). */
export const mapRange = (
  x: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number => outMin + ((x - inMin) * (outMax - outMin)) / (inMax - inMin);

/** Map a value logarithmically (input assumed > 0). */
export const mapLog = (
  x: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number => {
  const lx = Math.log10(Math.max(1e-30, x));
  return mapRange(lx, Math.log10(inMin), Math.log10(inMax), outMin, outMax);
};

/** Exponential smoothing that is stable regardless of frame time. */
export const damp = (current: number, target: number, lambda: number, dt: number): number =>
  lerp(current, target, 1 - Math.exp(-lambda * dt));

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;
