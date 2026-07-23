/**
 * Human-facing unit conversions and value formatting.
 *
 * The physics layer stores everything in SI. The UI wants solar masses,
 * kilometres, milliseconds, Gauss, etc. Keeping the conversions in one place
 * makes it trivial to audit that the numbers shown carry the right units.
 */

import { GAUSS_PER_TESLA, KM, M_SUN } from './constants';

export const toSolarMasses = (kg: number): number => kg / M_SUN;
export const fromSolarMasses = (msun: number): number => msun * M_SUN;

export const toKm = (m: number): number => m / KM;
export const fromKm = (km: number): number => km * KM;

export const toGauss = (tesla: number): number => tesla * GAUSS_PER_TESLA;
export const fromGauss = (gauss: number): number => gauss / GAUSS_PER_TESLA;

/**
 * Format a number in scientific notation with a fixed number of significant
 * figures, e.g. 1.23e14. Used for magnetic fields, luminosities, densities.
 */
export function sci(value: number, sig = 3): string {
  if (value === 0) return '0';
  if (!isFinite(value)) return value > 0 ? '∞' : '−∞';
  const exp = Math.floor(Math.log10(Math.abs(value)));
  const mantissa = value / Math.pow(10, exp);
  const m = mantissa.toFixed(Math.max(0, sig - 1));
  return `${m}×10^${exp}`;
}

/**
 * Format with a sensible number of significant figures without forcing
 * scientific notation for "everyday" magnitudes.
 */
export function fmt(value: number, sig = 4): string {
  if (!isFinite(value)) return value > 0 ? '∞' : '−∞';
  if (value === 0) return '0';
  const abs = Math.abs(value);
  if (abs >= 1e5 || abs < 1e-3) return sci(value, sig);
  // Choose decimals so we keep ~sig significant figures.
  const digitsBeforePoint = Math.max(1, Math.floor(Math.log10(abs)) + 1);
  const decimals = Math.max(0, sig - digitsBeforePoint);
  const out = value.toFixed(decimals);
  // Trim trailing zeros but keep at least the integer part.
  return out.replace(/\.?0+$/, '');
}
