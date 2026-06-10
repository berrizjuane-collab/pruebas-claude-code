import { describe, expect, it } from 'vitest';
import {
  apply,
  columnI,
  columnJ,
  det,
  IDENTITY,
  inverse,
  isSingular,
  mat2,
  matApproxEquals,
  multiply,
  sanitizeMat,
  transpose,
  vec2,
} from './mat2';
import { rotation, shear } from './presets';
import { expectMatClose, expectVecClose } from './testUtils';

describe('mat2 basics', () => {
  it('applies a matrix to a vector', () => {
    const m = mat2(1, 2, 3, 4); // [[1,2],[3,4]]
    expectVecClose(apply(m, vec2(5, 6)), vec2(1 * 5 + 2 * 6, 3 * 5 + 4 * 6));
  });

  it('columns are exactly the images of the basis vectors (the core idea)', () => {
    const m = mat2(2, -1, 0.5, 3);
    expectVecClose(apply(m, vec2(1, 0)), columnI(m));
    expectVecClose(apply(m, vec2(0, 1)), columnJ(m));
  });

  it('multiplies with textbook numbers', () => {
    const a = mat2(1, 2, 3, 4);
    const b = mat2(5, 6, 7, 8);
    expectMatClose(multiply(a, b), mat2(19, 22, 43, 50));
  });

  it('multiply(B, A) means "A acts first": (B·A)v = B(Av)', () => {
    const a = shear(1);
    const b = rotation(Math.PI / 3);
    const v = vec2(0.3, -1.7);
    expectVecClose(apply(multiply(b, a), v), apply(b, apply(a, v)));
  });

  it('is associative but NOT commutative', () => {
    const a = mat2(1, 2, 3, 4);
    const b = mat2(0, 1, -1, 0);
    const c = mat2(2, 0, 1, 1);
    expectMatClose(multiply(multiply(a, b), c), multiply(a, multiply(b, c)));

    const ab = multiply(rotation(Math.PI / 2), shear(1));
    const ba = multiply(shear(1), rotation(Math.PI / 2));
    expect(matApproxEquals(ab, ba, 1e-12)).toBe(false);
  });

  it('determinant is multiplicative and detects orientation', () => {
    const a = mat2(2, 1, 0, 3);
    const b = mat2(1, -1, 2, 0.5);
    expect(det(multiply(a, b))).toBeCloseTo(det(a) * det(b), 10);
    expect(det(rotation(1.23))).toBeCloseTo(1, 12); // rotations preserve area
    expect(det(mat2(0, 1, 1, 0))).toBeCloseTo(-1, 12); // reflections flip orientation
  });

  it('inverse round-trips and refuses singular matrices', () => {
    const m = mat2(2, 1, 1, 3);
    const inv = inverse(m);
    expect(inv).not.toBeNull();
    expectMatClose(multiply(m, inv!), IDENTITY, 1e-12);
    expectMatClose(multiply(inv!, m), IDENTITY, 1e-12);

    expect(inverse(mat2(1, 2, 2, 4))).toBeNull(); // collinear columns
    expect(inverse(mat2(0, 0, 0, 0))).toBeNull();
  });

  it('singularity test is scale invariant', () => {
    expect(isSingular(mat2(1e-8, 0, 0, 1e-8))).toBe(false); // tiny but invertible
    expect(isSingular(mat2(1e8, 2e8, 2e8, 4e8))).toBe(true); // huge but rank 1
  });

  it('transposes', () => {
    expectMatClose(transpose(mat2(1, 2, 3, 4)), mat2(1, 3, 2, 4));
  });

  it('sanitizes pathological input', () => {
    const m = sanitizeMat(mat2(NaN, Infinity, -Infinity, 1e12));
    expect(m.a).toBe(0);
    expect(m.b).toBe(1e6);
    expect(m.c).toBe(-1e6);
    expect(m.d).toBe(1e6);
  });
});
