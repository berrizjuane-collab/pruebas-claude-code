import { describe, expect, it } from 'vitest';
import { eigen2 } from './eigen';
import { apply, mat2, scale } from './mat2';
import { projection, rotation, shear } from './presets';
import { expectVecClose } from './testUtils';

const SQ2 = Math.SQRT1_2;

describe('eigen2', () => {
  it('diagonal matrix: eigenvalues on the diagonal, axes as eigenvectors', () => {
    const r = eigen2(mat2(2, 0, 0, 3));
    expect(r.kind).toBe('realDistinct');
    if (r.kind !== 'realDistinct') return;
    const [hi, lo] = r.pairs;
    expect(hi.value).toBeCloseTo(3, 12);
    expectVecClose(hi.vector, { x: 0, y: 1 });
    expect(lo.value).toBeCloseTo(2, 12);
    expectVecClose(lo.vector, { x: 1, y: 0 });
  });

  it('symmetric matrix: known eigenpairs along the diagonals', () => {
    const r = eigen2(mat2(2, 1, 1, 2));
    expect(r.kind).toBe('realDistinct');
    if (r.kind !== 'realDistinct') return;
    expect(r.pairs[0].value).toBeCloseTo(3, 12);
    expectVecClose(r.pairs[0].vector, { x: SQ2, y: SQ2 }, 1e-9);
    expect(r.pairs[1].value).toBeCloseTo(1, 12);
    expectVecClose(r.pairs[1].vector, { x: SQ2, y: -SQ2 }, 1e-9);
  });

  it('every reported real eigenpair actually satisfies M·v = λ·v', () => {
    const samples = [mat2(2, 1, 1, 3), mat2(1, 4, 2, -1), mat2(-3, 0.5, 2, 2), mat2(5, -2, -2, 1)];
    for (const m of samples) {
      const r = eigen2(m);
      expect(r.kind).toBe('realDistinct');
      if (r.kind !== 'realDistinct') continue;
      for (const { value, vector } of r.pairs) {
        expectVecClose(apply(m, vector), scale(vector, value), 1e-8);
      }
    }
  });

  it('rotation: complex pair, no real eigenvectors, modulus 1', () => {
    const r = eigen2(rotation(Math.PI / 2));
    expect(r.kind).toBe('complex');
    if (r.kind !== 'complex') return;
    expect(r.re).toBeCloseTo(0, 12);
    expect(r.im).toBeCloseTo(1, 12);
    expect(r.modulus).toBeCloseTo(1, 12);
    expect(r.angle).toBeCloseTo(Math.PI / 2, 12);
  });

  it('rotation+scaling: modulus reflects the scale factor', () => {
    // 2·R(60°) has eigenvalues 2·e^{±i60°}.
    const m = mat2(2 * Math.cos(Math.PI / 3), -2 * Math.sin(Math.PI / 3), 2 * Math.sin(Math.PI / 3), 2 * Math.cos(Math.PI / 3));
    const r = eigen2(m);
    expect(r.kind).toBe('complex');
    if (r.kind !== 'complex') return;
    expect(r.modulus).toBeCloseTo(2, 12);
    expect(r.angle).toBeCloseTo(Math.PI / 3, 12);
  });

  it('shear: repeated defective eigenvalue 1 with the single invariant line x-axis', () => {
    const r = eigen2(shear(1));
    expect(r.kind).toBe('repeatedDefective');
    if (r.kind !== 'repeatedDefective') return;
    expect(r.value).toBeCloseTo(1, 12);
    expectVecClose(r.vector, { x: 1, y: 0 });
  });

  it('identity and -I: repeated scalar — every direction is an eigendirection', () => {
    const id = eigen2(mat2(1, 0, 0, 1));
    expect(id.kind).toBe('repeatedScalar');
    if (id.kind === 'repeatedScalar') expect(id.value).toBeCloseTo(1, 12);

    const neg = eigen2(mat2(-1, 0, 0, -1));
    expect(neg.kind).toBe('repeatedScalar');
    if (neg.kind === 'repeatedScalar') expect(neg.value).toBeCloseTo(-1, 12);
  });

  it('projection: eigenvalues 1 (along the line) and 0 (perpendicular, the kernel)', () => {
    const theta = Math.PI / 6;
    const r = eigen2(projection(theta));
    expect(r.kind).toBe('realDistinct');
    if (r.kind !== 'realDistinct') return;
    expect(r.pairs[0].value).toBeCloseTo(1, 12);
    expectVecClose(r.pairs[0].vector, { x: Math.cos(theta), y: Math.sin(theta) }, 1e-9);
    expect(r.pairs[1].value).toBeCloseTo(0, 12);
    expectVecClose(r.pairs[1].vector, { x: Math.sin(theta), y: -Math.cos(theta) }, 1e-9);
  });
});
