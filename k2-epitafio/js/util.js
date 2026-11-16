// Utilidades pequeñas y sin estado.

export const acotar = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const mezclar = (a, b, t) => a + (b - a) * t;

/** Rampa lineal acotada: 0 antes de `a`, 1 después de `b`. */
export const rampa = (a, b, v) => acotar((v - a) / (b - a));

export const suave = (t) => t * t * (3 - 2 * t);
export const entraYSale = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const sale = (t) => 1 - Math.pow(1 - t, 3);

/** Interpolación lineal por tramos: xs creciente, ys del mismo tamaño. */
export function porTramos(xs, ys, x) {
  if (x <= xs[0]) return ys[0];
  const n = xs.length - 1;
  if (x >= xs[n]) return ys[n];
  let i = 1;
  while (xs[i] < x) i++;
  return mezclar(ys[i - 1], ys[i], (x - xs[i - 1]) / (xs[i] - xs[i - 1]));
}

/** Cifras con espacio fino de miles, como pide la identidad: 8 611. */
export const miles = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => Array.from(raiz.querySelectorAll(sel));
