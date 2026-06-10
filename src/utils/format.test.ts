import { describe, expect, it } from 'vitest';
import { fmt, parseNumeric, texNum } from './format';

describe('fmt', () => {
  it('formats plain numbers without trailing zeros', () => {
    expect(fmt(2)).toBe('2');
    expect(fmt(2.5)).toBe('2.5');
    expect(fmt(-0.25)).toBe('-0.25');
    expect(fmt(1 / 3)).toBe('0.33');
  });

  it('snaps floating-point dust to zero (cos 90° ≈ 6e-17)', () => {
    expect(fmt(Math.cos(Math.PI / 2))).toBe('0');
    expect(fmt(-0)).toBe('0');
  });

  it('uses scientific notation for extreme magnitudes', () => {
    expect(fmt(1.23e7)).toBe('1.23e7');
    expect(fmt(0.00012)).toBe('1.2e-4');
  });

  it('survives non-finite input', () => {
    expect(fmt(NaN)).toBe('NaN');
    expect(fmt(Infinity)).toBe('∞');
  });
});

describe('texNum', () => {
  it('renders scientific notation as m×10^k', () => {
    expect(texNum(6.12e-17)).toBe('0'); // dust → 0
    expect(texNum(4.2e8)).toBe('4.2 \\times 10^{8}');
  });
});

describe('parseNumeric', () => {
  it('parses decimals, tolerating comma separators', () => {
    expect(parseNumeric(' -1.5 ')).toBe(-1.5);
    expect(parseNumeric('2,5')).toBe(2.5);
  });

  it('parses simple fractions', () => {
    expect(parseNumeric('3/4')).toBe(0.75);
    expect(parseNumeric('-1/3')).toBeCloseTo(-1 / 3, 12);
    expect(parseNumeric('1/0')).toBeNull();
  });

  it('rejects incomplete or non-numeric text', () => {
    expect(parseNumeric('')).toBeNull();
    expect(parseNumeric('-')).toBeNull();
    expect(parseNumeric('1.')).toBe(1); // trailing dot is already a number
    expect(parseNumeric('abc')).toBeNull();
  });
});
