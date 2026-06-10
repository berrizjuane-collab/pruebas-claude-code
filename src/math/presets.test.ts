import { describe, expect, it } from 'vitest';
import { apply, det, IDENTITY, mat2, multiply, trace, vec2 } from './mat2';
import { projection, reflection, rotation, scaling, shear } from './presets';
import { expectMatClose, expectVecClose } from './testUtils';

describe('presets', () => {
  it('rotation(90°) sends î→ĵ and ĵ→−î', () => {
    const r = rotation(Math.PI / 2);
    expectMatClose(r, mat2(0, -1, 1, 0), 1e-12);
    expectVecClose(apply(r, vec2(1, 0)), vec2(0, 1), 1e-12);
    expect(det(r)).toBeCloseTo(1, 12);
  });

  it('rotations compose by adding angles', () => {
    expectMatClose(multiply(rotation(0.5), rotation(0.8)), rotation(1.3), 1e-12);
  });

  it('scaling scales the area by sx·sy', () => {
    expect(det(scaling(2, 3))).toBeCloseTo(6, 12);
    expect(det(scaling(2, -3))).toBeCloseTo(-6, 12); // negative scale flips orientation
  });

  it('shear preserves area exactly', () => {
    expect(det(shear(123.45))).toBeCloseTo(1, 12);
  });

  it('reflection: det −1, self-inverse, and reflection(45°) swaps the axes', () => {
    for (const th of [0, 0.3, Math.PI / 4, 1.1]) {
      const r = reflection(th);
      expect(det(r)).toBeCloseTo(-1, 12);
      expectMatClose(multiply(r, r), IDENTITY, 1e-12); // reflecting twice = identity
    }
    expectMatClose(reflection(Math.PI / 4), mat2(0, 1, 1, 0), 1e-12);
    expectMatClose(reflection(0), mat2(1, 0, 0, -1), 1e-12); // across the x-axis
  });

  it('projection: idempotent, singular, trace 1', () => {
    for (const th of [0, 0.4, Math.PI / 3]) {
      const p = projection(th);
      expectMatClose(multiply(p, p), p, 1e-12); // projecting twice changes nothing
      expect(det(p)).toBeCloseTo(0, 12);
      expect(trace(p)).toBeCloseTo(1, 12);
    }
    // Points already on the line stay put.
    const th = 0.4;
    const onLine = vec2(Math.cos(th) * 2, Math.sin(th) * 2);
    expectVecClose(apply(projection(th), onLine), onLine, 1e-12);
  });
});
