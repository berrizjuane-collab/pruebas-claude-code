/**
 * Encuadre automático de un punto: la cámara se coloca pendiente abajo mirando
 * hacia la ladera (así el punto queda en la cara visible) y se busca un rumbo y
 * elevación con línea de visión libre y holgura válida.
 */
import type { Poi } from '../data/types.ts';
import type { Frame } from '../geo/frame.ts';
import { rayBlocked, type HeightQuery } from '../geo/heightfield.ts';
import { constrainCamera, type CameraLimits, type TerrainQueries } from './constraints.ts';
import { poseFromSpecPure } from './poseMath.ts';
import type { Pose } from './transitions.ts';

const DISTANCE: Record<Poi['categoria'], number> = {
  cumbre: 1300,
  sector: 950,
  campamento: 1500,
  hito: 1400,
  umbral: 1600,
  geografia: 7000,
};

export function focusPose(p: Poi, frame: Frame, limits: CameraLimits, terrain: TerrainQueries, local: HeightQuery & { gridAt(x: number, y: number): { gradient(x: number, y: number): [number, number] } }): Pose {
  const { x, y, altModelo } = p.posicion;
  const [gx, gy] = local.gridAt(x, y).gradient(x, y);
  // rumbo de la pendiente abajo (0 = norte)
  let base = (Math.atan2(-gx, -gy) * 180) / Math.PI;
  if (!Number.isFinite(base) || Math.hypot(gx, gy) < 0.05) base = 160; // terreno llano: vista desde el sur-sureste
  const dist = p.id === 'broad-peak' ? 9000 : DISTANCE[p.categoria];
  const target = { x, y: altModelo - frame.h0, z: -y };
  const candidates: [number, number][] = [];
  for (const elev of [20, 30, 42])
    for (const d of [0, 20, -20, 40, -40, 70, -70, 110, -110, 150, -150, 180]) candidates.push([base + d, elev]);
  let fallback: Pose | null = null;
  for (const [bearing, elev] of candidates) {
    const raw = poseFromSpecPure({ target, bearingDeg: bearing, elevationDeg: elev, distance: dist });
    const pos = constrainCamera(raw.position, target, limits, terrain);
    const pose = { target, position: pos };
    fallback ??= pose;
    const blocked = rayBlocked(local, pos.x, -pos.z, pos.y + frame.h0, x, y, altModelo + 8, 45);
    if (!blocked) return pose;
  }
  return fallback!;
}
