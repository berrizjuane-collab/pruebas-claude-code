/**
 * Estadística para escalas visuales (SPEC §5.1): percentil por rango más cercano y
 * redondeo «legible» hacia arriba.
 */

/** Percentil q ∈ [0, 1] por rango más cercano: el menor valor con al menos q·n datos ≤ él. */
export function percentil(valores: ArrayLike<number>, q: number): number {
  const n = valores.length;
  if (n === 0) return NaN;
  const orden = Float64Array.from(valores).sort();
  const k = Math.min(n - 1, Math.max(0, Math.ceil(q * n) - 1));
  return orden[k] as number;
}

/** Pasos legibles por década (D-26): la pérdida máxima frente al valor exacto es ×1.33. */
export const PASOS_LEGIBLES = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10] as const;

/** Menor valor de {1, 1.5, 2, 2.5, 3, 4, 5, 6, 8}·10ᵏ mayor o igual que v (> 0). */
export function redondeoLegible(v: number): number {
  if (!(v > 0) || !Number.isFinite(v)) return 1;
  const exponente = Math.floor(Math.log10(v));
  const decada = 10 ** exponente;
  for (const paso of PASOS_LEGIBLES) {
    const candidato = paso * decada;
    // tolerancia relativa para valores que ya son legibles (p. ej. 2.5 exacto)
    if (candidato >= v * (1 - 1e-12)) return Number(candidato.toPrecision(12));
  }
  return 10 * decada;
}
