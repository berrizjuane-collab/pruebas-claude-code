/**
 * Restricciones de cámara (lógica pura en coordenadas de escena: X este, Y altura
 * de render, Z sur). Los límites de distancia al objetivo NO impiden atravesar la
 * montaña; por eso hay además una holgura vertical sobre el terreno dilatado.
 */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface FocalZone {
  /** centro en escena */
  x: number;
  y: number;
  z: number;
  /** radio dentro del cual se permite el acercamiento focal */
  radius: number;
}

export interface CameraLimits {
  minDistance: number;
  focalMinDistance: number;
  maxDistance: number;
  focalZones: FocalZone[];
  /** ángulo polar desde +Y, en radianes */
  minPolar: number;
  maxPolar: number;
  targetBounds: { minX: number; maxX: number; minZ: number; maxZ: number; minY: number; maxY: number };
  cameraBounds: { minX: number; maxX: number; minZ: number; maxZ: number; maxY: number };
  /** holgura sobre el terreno dilatado (m) */
  clearance: number;
  focalClearance: number;
  /** altura mínima del objetivo sobre el terreno */
  targetLift: number;
}

export interface TerrainQueries {
  /** Y de escena del terreno */
  heightY(x: number, z: number): number;
  /** Y de escena del terreno dilatado (máximo en un radio) */
  clearanceY(x: number, z: number): number;
}

const smooth = (e0: number, e1: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** 0 lejos de toda zona focal, 1 dentro de alguna. */
export function focalWeight(target: Vec3, limits: CameraLimits): number {
  let w = 0;
  for (const z of limits.focalZones) {
    const d = Math.hypot(target.x - z.x, target.y - z.y, target.z - z.z);
    w = Math.max(w, 1 - smooth(z.radius, z.radius * 2, d));
  }
  return w;
}

export function minDistanceFor(target: Vec3, limits: CameraLimits): number {
  const w = focalWeight(target, limits);
  return limits.minDistance + (limits.focalMinDistance - limits.minDistance) * w;
}

export function clearanceFor(target: Vec3, limits: CameraLimits): number {
  const w = focalWeight(target, limits);
  return limits.clearance + (limits.focalClearance - limits.clearance) * w;
}

export function clampTarget(target: Vec3, limits: CameraLimits, terrain: TerrainQueries): Vec3 {
  const b = limits.targetBounds;
  const x = Math.min(b.maxX, Math.max(b.minX, target.x));
  const z = Math.min(b.maxZ, Math.max(b.minZ, target.z));
  const floor = terrain.heightY(x, z) + limits.targetLift;
  const y = Math.min(b.maxY, Math.max(b.minY, floor, target.y));
  return { x, y, z };
}

/**
 * Corrige la posición de la cámara para un objetivo dado: distancia, ángulo polar,
 * límites horizontales y holgura sobre el terreno. Devuelve la posición válida.
 */
export function constrainCamera(position: Vec3, target: Vec3, limits: CameraLimits, terrain: TerrainQueries): Vec3 {
  let dx = position.x - target.x;
  let dy = position.y - target.y;
  let dz = position.z - target.z;
  let r = Math.hypot(dx, dy, dz) || 1;
  const rMin = minDistanceFor(target, limits);
  const rc = Math.min(limits.maxDistance, Math.max(rMin, r));
  // ángulo polar
  let polar = Math.acos(Math.min(1, Math.max(-1, dy / r)));
  const azim = Math.atan2(dx, dz);
  polar = Math.min(limits.maxPolar, Math.max(limits.minPolar, polar));
  r = rc;
  dx = r * Math.sin(polar) * Math.sin(azim);
  dy = r * Math.cos(polar);
  dz = r * Math.sin(polar) * Math.cos(azim);
  let x = target.x + dx;
  let y = target.y + dy;
  let z = target.z + dz;
  const cb = limits.cameraBounds;
  x = Math.min(cb.maxX, Math.max(cb.minX, x));
  z = Math.min(cb.maxZ, Math.max(cb.minZ, z));
  const floor = terrain.clearanceY(x, z) + clearanceFor(target, limits);
  y = Math.min(cb.maxY, Math.max(floor, y));
  return { x, y, z };
}

/** ¿Es válida una posición de cámara (con tolerancia)? Útil para tests y diagnósticos. */
export function isCameraValid(position: Vec3, target: Vec3, limits: CameraLimits, terrain: TerrainQueries, tol = 0.5): boolean {
  const c = constrainCamera(position, target, limits, terrain);
  return Math.hypot(c.x - position.x, c.y - position.y, c.z - position.z) <= tol;
}
