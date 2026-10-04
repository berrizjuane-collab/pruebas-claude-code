/**
 * Vuelo en primera persona de la vista libre (VL-01, SPEC §3.11 y §5.11). Geometría pura, sin
 * three.js: la usan el controlador de la escena y las pruebas.
 *
 * - La cámara es una posición y dos ángulos: azimut ψ (alrededor de +z, desde +x) y elevación
 *   θ ∈ [−89°, 89°]; dirección (cos θ cos ψ, cos θ sin ψ, sin θ). Nunca se alcanza el polo,
 *   así que «arriba» (+z) está siempre definido.
 * - W/S avanzan según la dirección de la vista; A/D, según la derecha horizontal
 *   (sin ψ, −cos ψ, 0); E/Q, según ±z.
 * - La dilatación λ es la escala del explorador (SPEC §3.11): la velocidad en coordenadas del
 *   campo es v/λ y, al cambiar λ alrededor de un centro c, la posición pasa a
 *   c + (r − c)·λ_antes/λ_después, que es exactamente la imagen del mundo dilatado.
 */
import type { Vec3 } from '../math/tipos';

export const ELEVACION_MAX = (89 * Math.PI) / 180;
/** Constante de tiempo de la respuesta de la velocidad (s). */
export const CONSTANTE_TIEMPO = 0.12;
/** Multiplicador con Mayús. */
export const FACTOR_RAPIDO = 4;
/** Cambio de velocidad por paso de la rueda y de λ por pulsación de + o −. */
export const FACTOR_PASO = 1.25;
/** Giro con las flechas del teclado (rad/s). */
export const GIRO_TECLADO = Math.PI / 2;
/** Giro por píxel arrastrado (rad). */
export const GIRO_PIXEL = (0.25 * Math.PI) / 180;

export interface Angulos {
  azimut: number;
  elevacion: number;
}

export const acotarElevacion = (e: number) => Math.min(ELEVACION_MAX, Math.max(-ELEVACION_MAX, e));

export function direccion({ azimut, elevacion }: Angulos): Vec3 {
  const c = Math.cos(elevacion);
  return [c * Math.cos(azimut), c * Math.sin(azimut), Math.sin(elevacion)];
}

/** Ángulos de una dirección (no nula); la elevación queda acotada a ±89°. */
export function angulosDesdeDireccion(d: Vec3): Angulos {
  const m = Math.hypot(d[0], d[1], d[2]);
  const horizontal = Math.hypot(d[0], d[1]);
  return { azimut: horizontal > 1e-12 ? Math.atan2(d[1], d[0]) : 0, elevacion: acotarElevacion(Math.asin(Math.max(-1, Math.min(1, d[2] / m)))) };
}

/** Derecha horizontal de la vista. */
export const derecha = ({ azimut }: Angulos): Vec3 => [Math.sin(azimut), -Math.cos(azimut), 0];

/** Teclas de movimiento pulsadas: cada eje en {−1, 0, 1}. */
export interface Mando {
  adelante: number;
  lado: number;
  vertical: number;
  rapido: boolean;
}

/** Velocidad objetivo en coordenadas del campo: rapidez v (unidades de escena por s) dividida por λ. */
export function velocidadObjetivo(m: Mando, a: Angulos, rapidez: number, lambda: number): Vec3 {
  const f = direccion(a);
  const r = derecha(a);
  const v: [number, number, number] = [0, 0, 0];
  for (let k = 0; k < 3; k++) v[k] = m.adelante * (f[k] as number) + m.lado * (r[k] as number) + (k === 2 ? m.vertical : 0);
  const n = Math.hypot(v[0], v[1], v[2]);
  if (n === 0) return [0, 0, 0];
  // Las diagonales no son más rápidas: la dirección se normaliza.
  const s = (rapidez * (m.rapido ? FACTOR_RAPIDO : 1)) / lambda / n;
  return [v[0] * s, v[1] * s, v[2] * s];
}

/** Respuesta de primer orden de la velocidad hacia la objetivo (inmediata con movimiento reducido). */
export function suavizarVelocidad(v: Vec3, objetivo: Vec3, dt: number, inmediata: boolean): Vec3 {
  if (inmediata) return objetivo;
  const a = 1 - Math.exp(-dt / CONSTANTE_TIEMPO);
  return [v[0] + (objetivo[0] - v[0]) * a, v[1] + (objetivo[1] - v[1]) * a, v[2] + (objetivo[2] - v[2]) * a];
}

/** Posición de la cámara tras dilatar el espacio de λ_antes a λ_después alrededor de c (SPEC §3.11). */
export function dilatar(r: Vec3, c: Vec3, lambdaAntes: number, lambdaDespues: number): Vec3 {
  const f = lambdaAntes / lambdaDespues;
  return [c[0] + (r[0] - c[0]) * f, c[1] + (r[1] - c[1]) * f, c[2] + (r[2] - c[2]) * f];
}
