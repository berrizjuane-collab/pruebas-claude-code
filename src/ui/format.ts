/** Formato numérico en español (separador de millares: espacio fino no separable). */
const NNBSP = ' ';

export function groupThousands(n: number): string {
  const s = Math.round(Math.abs(n)).toString();
  const out = s.replace(/\B(?=(\d{3})+(?!\d))/g, NNBSP);
  return n < 0 ? `−${out}` : out;
}

export function formatMeters(n: number): string {
  return `${groupThousands(n)}${NNBSP}m`;
}

export function formatAltitudeRef(ref: { valor: number; min?: number; max?: number; exacta?: boolean } | undefined): string {
  if (!ref) return '—';
  if (ref.exacta) return formatMeters(ref.valor);
  if (ref.min !== undefined && ref.max !== undefined && ref.min !== ref.max)
    return `≈${NNBSP}${formatMeters(ref.valor)} (${groupThousands(ref.min)}–${formatMeters(ref.max)})`;
  return `≈${NNBSP}${formatMeters(ref.valor)}`;
}

export function formatShortAltitude(ref: { valor: number; exacta?: boolean } | undefined): string {
  if (!ref) return '';
  return ref.exacta ? formatMeters(ref.valor) : `≈${NNBSP}${formatMeters(ref.valor)}`;
}

export function formatDegrees(v: number, pos: string, neg: string, digits = 4): string {
  return `${Math.abs(v).toFixed(digits).replace('.', ',')}°${NNBSP}${v >= 0 ? pos : neg}`;
}

export function formatKm(m: number): string {
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0).replace('.', ',')}${NNBSP}km`;
}

export const CERTAINTY_LABEL: Record<string, string> = {
  documentado: 'Documentado',
  aproximado: 'Aproximado',
  reconstruido: 'Reconstruido',
};

export const CATEGORY_LABEL: Record<string, string> = {
  campamento: 'Campamentos',
  hito: 'Hitos del Abruzzi',
  sector: 'Sectores',
  umbral: 'Umbrales',
  cumbre: 'Cumbre',
  geografia: 'Geografía',
};
