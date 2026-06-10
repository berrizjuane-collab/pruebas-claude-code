import type { Mat2, Vec2 } from './types';
import { canonicalDirection, columnI, columnJ, isSingular, length, maxAbs, normalize, vec2 } from './mat2';

/**
 * Rank classification of a 2×2 matrix, with the geometric data the visualizer
 * needs in the degenerate cases:
 *
 *  - rank 2: the map is invertible — the plane stays a plane;
 *  - rank 1: the plane is flattened onto a line.
 *      · `image`  — unit direction of that line (the column space),
 *      · `kernel` — unit direction sent to the origin (the null space);
 *  - rank 0: the zero matrix — everything collapses to the origin
 *    (kernel = whole plane, image = {0}).
 */
export type RankInfo =
  | { rank: 2 }
  | { rank: 1; kernel: Vec2; image: Vec2 }
  | { rank: 0 };

export function rankInfo(m: Mat2, tol = 1e-9): RankInfo {
  if (!isSingular(m, tol)) return { rank: 2 };
  if (maxAbs(m) <= 1e-12) return { rank: 0 };

  // Rank 1. The image is spanned by the columns (which are collinear here);
  // pick the longer one for stability. The kernel is orthogonal to the row
  // space, so take the perpendicular of the longer row.
  const c1 = columnI(m);
  const c2 = columnJ(m);
  const imageDir = length(c1) >= length(c2) ? c1 : c2;

  const r1 = vec2(m.a, m.b);
  const r2 = vec2(m.c, m.d);
  const row = length(r1) >= length(r2) ? r1 : r2;
  const kernelDir = vec2(-row.y, row.x);

  // maxAbs > 0 guarantees the chosen row/column are nonzero, so normalize succeeds.
  return {
    rank: 1,
    kernel: canonicalDirection(normalize(kernelDir)!),
    image: canonicalDirection(normalize(imageDir)!),
  };
}
