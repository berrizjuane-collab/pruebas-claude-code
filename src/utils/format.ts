/** Number formatting for readouts and KaTeX. Pure string helpers. */

function trimZeros(s: string): string {
  if (!s.includes('.')) return s;
  const t = s.replace(/0+$/, '').replace(/\.$/, '');
  return t === '-0' ? '0' : t;
}

/** Plain-text formatting: short decimals, scientific for extreme magnitudes. */
export function fmt(x: number, digits = 2): string {
  if (Number.isNaN(x)) return 'NaN';
  if (!Number.isFinite(x)) return x > 0 ? '∞' : '−∞';
  const ax = Math.abs(x);
  if (ax !== 0 && (ax >= 1e5 || ax < 10 ** -(digits + 1))) {
    return trimZeros(x.toExponential(2)).replace(/e\+?(-?\d+)/, 'e$1');
  }
  return trimZeros(x.toFixed(digits));
}

/** Same idea, but producing TeX (scientific notation as m×10^k). */
export function texNum(x: number, digits = 2): string {
  if (Number.isNaN(x)) return '\\mathrm{NaN}';
  if (!Number.isFinite(x)) return x > 0 ? '\\infty' : '-\\infty';
  const ax = Math.abs(x);
  if (ax !== 0 && (ax >= 1e5 || ax < 10 ** -(digits + 1))) {
    const [mant, exp] = x.toExponential(2).split('e');
    return `${trimZeros(mant)} \\times 10^{${Number(exp)}}`;
  }
  return trimZeros(x.toFixed(digits));
}

/**
 * Parse user numeric input. Tolerates a comma decimal separator and simple
 * fractions like "3/4". Returns null when the text is not (yet) a number.
 */
export function parseNumeric(text: string): number | null {
  const s = text.trim().replace(',', '.');
  if (s === '') return null;
  const frac = s.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)$/);
  if (frac) {
    const den = Number(frac[2]);
    if (den === 0) return null;
    return Number(frac[1]) / den;
  }
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}
