/**
 * Ciencia del color mínima para un sistema monocromo: conversión entre grises sRGB y
 * luminosidad CIELAB L*, luminancia relativa y contraste WCAG 2.x.
 *
 * Todas las rampas de la escena se definen en L* (perceptualmente uniforme) y se
 * convierten aquí a grises sRGB; así un mismo incremento de valor produce el mismo
 * incremento de claridad percibida en toda la rampa.
 */

/** Componente sRGB (0–255) → valor lineal (0–1). */
export function srgbALineal(c255: number): number {
  const c = c255 / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Valor lineal (0–1) → componente sRGB (0–255, sin redondear). */
export function linealASrgb(y: number): number {
  const c = y <= 0.0031308 ? 12.92 * y : 1.055 * y ** (1 / 2.4) - 0.055;
  return c * 255;
}

const EPSILON_LAB = 216 / 24389;
const KAPPA_LAB = 24389 / 27;

/** Luminancia relativa Y (0–1) → L* (0–100). */
export function lstarDeY(y: number): number {
  const f = y > EPSILON_LAB ? Math.cbrt(y) : (KAPPA_LAB * y + 16) / 116;
  return 116 * f - 16;
}

/** L* (0–100) → luminancia relativa Y (0–1). */
export function yDeLstar(l: number): number {
  const fy = (l + 16) / 116;
  const y3 = fy * fy * fy;
  return y3 > EPSILON_LAB ? y3 : l / KAPPA_LAB;
}

/** L* → nivel de gris sRGB (0–255, sin redondear). */
export function grisDeLstar(l: number): number {
  return linealASrgb(yDeLstar(Math.min(100, Math.max(0, l))));
}

/** Nivel de gris sRGB (0–255) → L*. */
export function lstarDeGris(v255: number): number {
  return lstarDeY(srgbALineal(v255));
}

/** '#RRGGBB' → [r, g, b] en 0–255. */
export function hexARgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`Color no válido: ${hex}`);
  const n = parseInt(m[1] as string, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Nivel de gris (0–255) → '#RRGGBB' neutro. */
export function hexGris(v255: number): string {
  const v = Math.round(Math.min(255, Math.max(0, v255)));
  const h = v.toString(16).padStart(2, '0').toUpperCase();
  return `#${h}${h}${h}`;
}

/** ¿Es un gris neutro (R = G = B)? */
export function esGrisNeutro(hex: string): boolean {
  const [r, g, b] = hexARgb(hex);
  return r === g && g === b;
}

/** Luminancia relativa WCAG de un color '#RRGGBB'. */
export function luminanciaRelativa(hex: string): number {
  const [r, g, b] = hexARgb(hex);
  return 0.2126 * srgbALineal(r) + 0.7152 * srgbALineal(g) + 0.0722 * srgbALineal(b);
}

/** Razón de contraste WCAG entre dos colores (≥ 1). */
export function contraste(a: string, b: string): number {
  const la = luminanciaRelativa(a);
  const lb = luminanciaRelativa(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
