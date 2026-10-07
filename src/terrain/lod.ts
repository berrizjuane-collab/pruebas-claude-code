/**
 * Selección de nivel de detalle por error geométrico proyectado en pantalla.
 *
 * Cada bloque precalcula, para cada nivel l, el error vertical máximo e_l respecto
 * a la malla completa (e_0 = 0). El error en píxeles a distancia d es
 * ρ = e_l · K / d, con K = alto_viewport / (2·tan(fov/2)). Se elige el nivel más
 * grueso con ρ ≤ τ. Histéresis: para engrosar se exige ρ ≤ τ·h (h < 1), así un
 * bloque en el umbral no oscila entre dos niveles.
 */
export function projectionFactor(viewportHeightPx: number, fovYDeg: number): number {
  return viewportHeightPx / (2 * Math.tan((fovYDeg * Math.PI) / 360));
}

export function screenError(geomError: number, distance: number, k: number): number {
  return (geomError * k) / Math.max(distance, 1);
}

export function selectLevel(errors: ArrayLike<number>, distance: number, k: number, tau: number, current: number, hysteresis = 0.7): number {
  const last = errors.length - 1;
  let target = 0;
  for (let l = last; l >= 0; l--) {
    if (screenError(errors[l], distance, k) <= tau) {
      target = l;
      break;
    }
  }
  if (current < 0 || target <= current) return target;
  // quiere engrosar: solo hasta donde el nivel cumple el umbral estricto
  let l = current;
  while (l < last && screenError(errors[l + 1], distance, k) <= tau * hysteresis) l++;
  return l;
}

/** Distancia de un punto a una caja alineada con los ejes (0 si está dentro). */
export function distanceToBox(
  px: number, py: number, pz: number,
  minX: number, minY: number, minZ: number,
  maxX: number, maxY: number, maxZ: number,
): number {
  const dx = Math.max(minX - px, 0, px - maxX);
  const dy = Math.max(minY - py, 0, py - maxY);
  const dz = Math.max(minZ - pz, 0, pz - maxZ);
  return Math.hypot(dx, dy, dz);
}

/**
 * Quadtree de dos niveles: un «padre» cubre 2×2 bloques con pasos dobles, de modo que
 * su nivel p coincide exactamente con el nivel p + 1 de sus hijos. Devuelve el nivel
 * deseado para el padre o −1 si algún hijo visible necesita la resolución completa
 * (entonces se dibujan los hijos). Los hijos fuera del encuadre no imponen detalle.
 */
export function parentTarget(childDesired: readonly number[], childInFrustum: readonly boolean[], parentLevels: number): number {
  let min = Infinity;
  for (let i = 0; i < childDesired.length; i++) if (childInFrustum[i]) min = Math.min(min, childDesired[i]);
  if (min === Infinity) return parentLevels - 1;
  return min >= 1 ? Math.min(parentLevels - 1, min - 1) : -1;
}
