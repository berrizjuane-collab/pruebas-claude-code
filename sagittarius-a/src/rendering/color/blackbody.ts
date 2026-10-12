/**
 * Color de un cuerpo negro: integra la ley de Planck con las funciones de igualación del CIE 1931
 * (aproximación multilóbulo de Wyman, Sloan & Shirley 2013, JCGT 2(2)) y convierte a sRGB lineal.
 *
 * Para cada T se guarda (r, g, b) normalizado a luminancia Y = 1 y la «fracción visible»
 * Y(T)/(σT⁴), normalizada a 1 en 5800 K. Un emisor desplazado por g se observa con
 * cromaticidad de T·g y luminancia ∝ g⁴ · frac(T·g)/frac(T).
 */
export const BB_TMIN = 800;
export const BB_TMAX = 60000;

function lobe(l: number, mu: number, s1: number, s2: number): number {
  const s = l < mu ? s1 : s2;
  const t = (l - mu) / s;
  return Math.exp(-0.5 * t * t);
}

export function cieXYZ(lambdaNm: number): [number, number, number] {
  const l = lambdaNm;
  const x = 1.056 * lobe(l, 599.8, 37.9, 31.0) + 0.362 * lobe(l, 442.0, 16.0, 26.7) - 0.065 * lobe(l, 501.1, 20.4, 26.2);
  const y = 0.821 * lobe(l, 568.8, 46.9, 40.5) + 0.286 * lobe(l, 530.9, 16.3, 31.1);
  const z = 1.217 * lobe(l, 437.0, 11.8, 36.0) + 0.681 * lobe(l, 459.0, 26.0, 13.8);
  return [x, y, z];
}

/** Planck espectral por longitud de onda (unidades arbitrarias coherentes). */
function planckLambda(lambdaNm: number, T: number): number {
  const l = lambdaNm * 1e-9;
  const c2 = 1.438776877e-2; // hc/k [m K]
  const x = c2 / (l * T);
  if (x > 700) return 0;
  return 1 / (l ** 5 * Math.expm1(x));
}

export interface BlackbodyColor {
  rgb: [number, number, number];
  /** Fracción visible relativa (1 en 5800 K). */
  visible: number;
}

let refVisible = 0;

export function blackbodyColor(T: number): BlackbodyColor {
  let X = 0;
  let Y = 0;
  let Z = 0;
  for (let l = 360; l <= 830; l += 2) {
    const B = planckLambda(l, T);
    const [x, y, z] = cieXYZ(l);
    X += B * x;
    Y += B * y;
    Z += B * z;
  }
  const r = 3.2406 * X - 1.5372 * Y - 0.4986 * Z;
  const g = -0.9689 * X + 1.8758 * Y + 0.0415 * Z;
  const b = 0.0557 * X - 0.204 * Y + 1.057 * Z;
  const sigmaT4 = T ** 4;
  if (!refVisible) {
    refVisible = 1; // evita recursión
    const ref = blackbodyColor(5800);
    refVisible = ref.visible;
  }
  const inv = Y > 0 ? 1 / Y : 0;
  const rgb: [number, number, number] = [Math.max(r * inv, 0), Math.max(g * inv, 0), Math.max(b * inv, 0)];
  // Renormaliza la luminancia tras recortar el gamut
  const yl = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  if (yl > 0) for (let i = 0; i < 3; i++) rgb[i] /= yl;
  return { rgb, visible: Y / sigmaT4 / refVisible };
}

/** Tabla logarítmica en T para la textura del sombreador: [r, g, b, visible] × n. */
export function blackbodyTable(n = 256): Float32Array {
  const out = new Float32Array(4 * n);
  for (let i = 0; i < n; i++) {
    const T = BB_TMIN * Math.pow(BB_TMAX / BB_TMIN, i / (n - 1));
    const c = blackbodyColor(T);
    out[4 * i] = c.rgb[0];
    out[4 * i + 1] = c.rgb[1];
    out[4 * i + 2] = c.rgb[2];
    out[4 * i + 3] = c.visible;
  }
  return out;
}
