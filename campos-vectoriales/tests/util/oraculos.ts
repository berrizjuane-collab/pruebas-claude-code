/**
 * Oráculos independientes para las pruebas de navegador: reimplementan la conversión
 * L* ↔ sRGB y la geometría esperada sin importar código de la aplicación.
 */
export function lstarDeGris255(v: number): number {
  const c = v / 255;
  const y = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  const f = y > 216 / 24389 ? Math.cbrt(y) : ((24389 / 27) * y + 16) / 116;
  return 116 * f - 16;
}

/** L* esperada de una flecha con ‖F‖ = m y escala F_ref (DESIGN §9.3, rampa lineal). */
export const lstarEsperada = (m: number, fRef: number) => 45.2 + 51.3 * Math.min(1, m / fRef);

/** Ángulo entre dos vectores, estable (atan2 de |a×b| y a·b). */
export function angulo(a: number[], b: number[]): number {
  const [ax, ay, az] = a as [number, number, number];
  const [bx, by, bz] = b as [number, number, number];
  const c = Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
  return Math.atan2(c, ax * bx + ay * by + az * bz);
}
