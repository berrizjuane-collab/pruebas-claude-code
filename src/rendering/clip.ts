import type { Vec2 } from '../math/types';
import type { WorldRect } from './camera';

/**
 * Clip the infinite line { point + s·dir : s ∈ ℝ } to a rectangle using the
 * slab method. Returns the segment endpoints, or null when the line misses
 * the rectangle (or dir ≈ 0).
 */
export function clipLineToRect(point: Vec2, dir: Vec2, rect: WorldRect): [Vec2, Vec2] | null {
  let s0 = -Infinity;
  let s1 = Infinity;

  if (Math.abs(dir.x) < 1e-15) {
    if (point.x < rect.xmin || point.x > rect.xmax) return null;
  } else {
    const a = (rect.xmin - point.x) / dir.x;
    const b = (rect.xmax - point.x) / dir.x;
    s0 = Math.max(s0, Math.min(a, b));
    s1 = Math.min(s1, Math.max(a, b));
  }

  if (Math.abs(dir.y) < 1e-15) {
    if (point.y < rect.ymin || point.y > rect.ymax) return null;
  } else {
    const a = (rect.ymin - point.y) / dir.y;
    const b = (rect.ymax - point.y) / dir.y;
    s0 = Math.max(s0, Math.min(a, b));
    s1 = Math.min(s1, Math.max(a, b));
  }

  if (!(s0 <= s1) || !Number.isFinite(s0) || !Number.isFinite(s1)) return null;
  return [
    { x: point.x + s0 * dir.x, y: point.y + s0 * dir.y },
    { x: point.x + s1 * dir.x, y: point.y + s1 * dir.y },
  ];
}
