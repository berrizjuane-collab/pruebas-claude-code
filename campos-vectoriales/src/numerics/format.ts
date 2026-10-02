/**
 * Formato numérico de la interfaz (DESIGN §3.3): cifras significativas, punto decimal,
 * signo menos tipográfico (U+2212) y notación científica con superíndices.
 */

const MENOS = '−';
const SUPER: Record<string, string> = {
  '-': '⁻',
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
};

export interface OpcionesFormato {
  /** Cifras significativas (2–8). */
  cifras?: number;
  /** Escala de referencia para decidir cuándo un valor es 0 (|v| ≤ 10⁻¹²·max(1, escala)). */
  escala?: number;
}

const superindice = (n: number) => String(n).split('').map((c) => SUPER[c] ?? c).join('');

/** Formatea un número para mostrarlo. */
export function formatear(v: number, opciones: OpcionesFormato = {}): string {
  const cifras = Math.min(8, Math.max(2, Math.round(opciones.cifras ?? 4)));
  if (Number.isNaN(v)) return 'no definido';
  if (v === Infinity) return '∞';
  if (v === -Infinity) return `${MENOS}∞`;
  const umbralCero = 1e-12 * Math.max(1, Math.abs(opciones.escala ?? 1));
  if (Math.abs(v) <= umbralCero) return '0';
  const signo = v < 0 ? MENOS : '';
  const a = Math.abs(v);
  if (a < 1e-3 || a >= 1e5) {
    const [mant, exp] = a.toExponential(cifras - 1).split('e');
    return `${signo}${mant} × 10${superindice(Number(exp))}`;
  }
  let texto = a.toPrecision(cifras);
  if (texto.includes('e')) texto = a.toFixed(0);
  return signo + texto;
}

/** Vector «(a, b, c)» con el mismo formato en cada componente. */
export function formatearVector(v: ArrayLike<number>, opciones: OpcionesFormato = {}): string {
  return `(${Array.from(v, (c) => formatear(c, opciones)).join(', ')})`;
}

/** Formato corto para marcas de ejes y leyendas: sin ceros finales superfluos. */
export function formatearCorto(v: number): string {
  if (!Number.isFinite(v)) return formatear(v);
  if (Math.abs(v) < 1e-12) return '0';
  const a = Math.abs(v);
  let texto: string;
  if (a >= 1e5 || a < 1e-3) texto = formatear(a, { cifras: 3 });
  else texto = String(Number(a.toPrecision(6)));
  return (v < 0 ? MENOS : '') + texto;
}
