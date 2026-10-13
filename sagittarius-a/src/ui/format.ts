/**
 * Formato de magnitudes físicas para la interfaz (coma decimal española, espacios finos y
 * unidades explícitas; nunca se muestra un número sin su unidad o su significado).
 */
import type { Units } from '../app/store';
import type { BlackHoleScales } from '../physics/sgra';

const nf = (d: number) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: d, minimumFractionDigits: d });

export function fmt(x: number, digits = 2): string {
  if (!Number.isFinite(x)) return '—';
  return nf(digits).format(x);
}

/** Notación científica compacta: 4,30 × 10⁶ */
export function sci(x: number, digits = 2): string {
  if (!Number.isFinite(x)) return '—';
  if (x === 0) return '0';
  const e = Math.floor(Math.log10(Math.abs(x)));
  if (e >= -2 && e <= 4) return fmt(x, Math.max(0, digits - Math.max(0, e)));
  const m = x / Math.pow(10, e);
  return `${fmt(m, digits)} × 10${sup(e)}`;
}

const SUP: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
export function sup(n: number): string {
  return String(n)
    .split('')
    .map((c) => SUP[c] ?? c)
    .join('');
}

/** Distancia en la unidad elegida a partir de un valor en M (= r_g). */
export function dist(rM: number, units: Units, sc: BlackHoleScales, digits = 2): string {
  if (!Number.isFinite(rM)) return '—';
  switch (units) {
    case 'rg':
      return `${fmt(rM, digits)} r_g`;
    case 'rs':
      return `${fmt(rM / 2, digits)} r_s`;
    case 'km': {
      const km = (rM * sc.rg) / 1000;
      return km >= 1e6 ? `${fmt(km / 1e6, digits)} millones de km` : `${fmt(km, 0)} km`;
    }
  }
}

/** Tiempo en s → texto legible (s, min, h, días). */
export function duration(s: number): string {
  if (!Number.isFinite(s)) return '—';
  const a = Math.abs(s);
  if (a < 120) return `${fmt(s, a < 10 ? 2 : 1)} s`;
  if (a < 7200) return `${fmt(s / 60, 1)} min`;
  if (a < 172800) return `${fmt(s / 3600, 2)} h`;
  return `${fmt(s / 86400, 2)} días`;
}

export function pct(x: number): string {
  return `${fmt(100 * x, 1)} %`;
}

export function speedC(v: number): string {
  if (!Number.isFinite(v)) return '—';
  return `${fmt(v, 3)} c`;
}
