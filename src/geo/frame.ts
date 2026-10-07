/**
 * Marco de la escena. Un único lugar convierte entre:
 *  - coordenadas locales del pipeline: (x este, y norte) en metros + altitud geográfica (m EGM2008)
 *  - coordenadas de three.js: X = este, Y = altitud − h0, Z = sur (el norte es −Z)
 */
export interface Frame {
  readonly h0: number;
}

export function altToY(frame: Frame, altitude: number): number {
  return altitude - frame.h0;
}

export function yToAlt(frame: Frame, y: number): number {
  return y + frame.h0;
}

/** [X, Y, Z] de three.js a partir de (x este, y norte, altitud). */
export function localToScene(frame: Frame, x: number, yNorth: number, altitude: number): [number, number, number] {
  return [x, altitude - frame.h0, -yNorth];
}

/** (x este, y norte, altitud) a partir de un punto de la escena. */
export function sceneToLocal(frame: Frame, X: number, Y: number, Z: number): [number, number, number] {
  return [X, -Z, Y + frame.h0];
}

/** Rumbo geográfico (0 = norte, 90 = este) de un vector horizontal de la escena. */
export function bearingOf(dx: number, dz: number): number {
  const b = (Math.atan2(dx, -dz) * 180) / Math.PI;
  return (b + 360) % 360;
}
