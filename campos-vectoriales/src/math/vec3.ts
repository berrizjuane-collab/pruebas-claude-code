import type { Vec3 } from './tipos';

export const suma = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const resta = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const escala = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const punto = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cruz = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
/** Norma euclídea sin desbordamientos intermedios. */
export const norma = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
export const distancia = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Vector unitario, o `null` si el vector es nulo o no finito (la dirección no existe). */
export function unitario(a: Vec3): Vec3 | null {
  const n = norma(a);
  if (!(n > 0) || !Number.isFinite(n)) return null;
  return [a[0] / n, a[1] / n, a[2] / n];
}

export const esFinito = (a: Vec3): boolean => Number.isFinite(a[0]) && Number.isFinite(a[1]) && Number.isFinite(a[2]);
