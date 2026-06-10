import { describe, expect, it } from 'vitest';
import { easeInOutCubic, interpolateMat, isSimilarity, lerpMat, rotationalLerp } from './interpolate';
import { det, IDENTITY, mat2, scaleMat } from './mat2';
import { rotation, shear } from './presets';
import { expectMatClose } from './testUtils';

describe('interpolation', () => {
  it('hits both endpoints exactly (linear and rotational)', () => {
    const a = mat2(2, 1, -0.5, 0.3);
    expectMatClose(lerpMat(IDENTITY, a, 0), IDENTITY, 1e-12);
    expectMatClose(lerpMat(IDENTITY, a, 1), a, 1e-12);

    const r = rotation(2.1);
    expectMatClose(rotationalLerp(IDENTITY, r, 0), IDENTITY, 1e-12);
    expectMatClose(rotationalLerp(IDENTITY, r, 1), r, 1e-12);
  });

  it('linear midpoint is the entrywise average', () => {
    const a = mat2(3, -1, 2, 5);
    expectMatClose(lerpMat(IDENTITY, a, 0.5), scaleMat(mat2(1 + 3, -1, 2, 1 + 5), 0.5), 1e-12);
  });

  it('rotational path through a 90° rotation passes through R(45°)', () => {
    expectMatClose(rotationalLerp(IDENTITY, rotation(Math.PI / 2), 0.5), rotation(Math.PI / 4), 1e-12);
  });

  it('rotational path never degenerates: det stays 1 for pure rotations', () => {
    // The linear path to R(180°) collapses to the zero matrix at t = 1/2;
    // the rotational path must keep |det| = 1 the whole way.
    const target = rotation(Math.PI);
    expect(det(lerpMat(IDENTITY, target, 0.5))).toBeCloseTo(0, 12); // documents the problem
    for (const t of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      expect(det(rotationalLerp(IDENTITY, target, t))).toBeCloseTo(1, 10);
    }
  });

  it('rotational path interpolates scale geometrically (log-spiral)', () => {
    // I → 4·R(90°): at the midpoint, modulus should be √4 = 2 and angle 45°.
    const target = scaleMat(rotation(Math.PI / 2), 4);
    expectMatClose(rotationalLerp(IDENTITY, target, 0.5), scaleMat(rotation(Math.PI / 4), 2), 1e-10);
  });

  it('takes the shorter arc', () => {
    // I → R(-90°) should rotate clockwise, i.e. pass through R(-45°).
    expectMatClose(rotationalLerp(IDENTITY, rotation(-Math.PI / 2), 0.5), rotation(-Math.PI / 4), 1e-12);
  });

  it('recognizes similarities and falls back to linear otherwise', () => {
    expect(isSimilarity(rotation(1))).toBe(true);
    expect(isSimilarity(scaleMat(rotation(0.4), 3))).toBe(true);
    expect(isSimilarity(shear(1))).toBe(false);
    expect(isSimilarity(mat2(1, 0, 0, -1))).toBe(false); // reflection

    const sh = shear(1.5);
    expectMatClose(interpolateMat(IDENTITY, sh, 0.3, 'rotational'), lerpMat(IDENTITY, sh, 0.3), 1e-12);
  });

  it('easing is a proper easing function', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 12);
    let prev = 0;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const v = easeInOutCubic(t);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-12); // monotone
      prev = v;
    }
  });
});
