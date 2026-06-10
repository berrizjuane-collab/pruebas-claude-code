import { describe, expect, it } from 'vitest';
import { rankInfo } from './kernel';
import { apply, dot, length, mat2 } from './mat2';
import { projection } from './presets';
import { expectVecClose } from './testUtils';

describe('rankInfo', () => {
  it('invertible matrices are rank 2', () => {
    expect(rankInfo(mat2(1, 0, 0, 1)).rank).toBe(2);
    expect(rankInfo(mat2(2, 1, 1, 3)).rank).toBe(2);
  });

  it('the zero matrix is rank 0', () => {
    expect(rankInfo(mat2(0, 0, 0, 0)).rank).toBe(0);
  });

  it('projection onto the x-axis: kernel is the y-axis, image the x-axis', () => {
    const r = rankInfo(mat2(1, 0, 0, 0));
    expect(r.rank).toBe(1);
    if (r.rank !== 1) return;
    expectVecClose(r.kernel, { x: 0, y: 1 });
    expectVecClose(r.image, { x: 1, y: 0 });
  });

  it('rank-1 matrix [[1,1],[1,1]]: kernel ⟂ image diagonal directions', () => {
    const r = rankInfo(mat2(1, 1, 1, 1));
    expect(r.rank).toBe(1);
    if (r.rank !== 1) return;
    expectVecClose(r.kernel, { x: Math.SQRT1_2, y: -Math.SQRT1_2 }, 1e-9);
    expectVecClose(r.image, { x: Math.SQRT1_2, y: Math.SQRT1_2 }, 1e-9);
  });

  it('kernel really dies and image really is the range (projection at any angle)', () => {
    const theta = 0.7;
    const m = projection(theta);
    const r = rankInfo(m);
    expect(r.rank).toBe(1);
    if (r.rank !== 1) return;

    // Kernel direction maps to (numerically) zero.
    expect(length(apply(m, r.kernel))).toBeLessThan(1e-12);
    // Kernel of an orthogonal projection is perpendicular to its image.
    expect(Math.abs(dot(r.kernel, r.image))).toBeLessThan(1e-12);
    // The image direction is fixed by the projection.
    expectVecClose(apply(m, r.image), r.image, 1e-12);
  });
});
