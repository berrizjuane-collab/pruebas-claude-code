/**
 * Límites efectivos de la cámara a partir de la configuración y de los datos
 * (zonas focales en los POI cimeros). Compartido por la app y los tests.
 */
import { CAMERA } from '../config/camera.ts';
import type { ViewPreset } from '../config/views.ts';
import type { Poi } from '../data/types.ts';
import type { CameraLimits } from './constraints.ts';
import { poseFromSpecPure } from './poseMath.ts';
import type { Pose } from './transitions.ts';

export const FOCAL_POIS = ['hombro', 'bottleneck', 'serac', 'cumbre', 'travesia', 'c4'];

export function poiScene(p: Poi, h0: number) {
  return { x: p.posicion.x, y: p.posicion.altModelo - h0, z: -p.posicion.y };
}

export function buildLimits(pois: Poi[], h0: number): CameraLimits {
  const half = CAMERA.targetHalf;
  return {
    minDistance: CAMERA.minDistance,
    focalMinDistance: CAMERA.focalMinDistance,
    maxDistance: CAMERA.maxDistance,
    focalZones: FOCAL_POIS.map((id) => pois.find((p) => p.id === id))
      .filter((p): p is Poi => !!p)
      .map((p) => ({ ...poiScene(p, h0), radius: CAMERA.focalRadius })),
    minPolar: (CAMERA.minPolarDeg * Math.PI) / 180,
    maxPolar: (CAMERA.maxPolarDeg * Math.PI) / 180,
    targetBounds: { minX: -half, maxX: half, minZ: -half, maxZ: half, minY: CAMERA.targetAltMin - h0, maxY: CAMERA.targetAltMax - h0 },
    cameraBounds: { minX: -CAMERA.cameraHalf, maxX: CAMERA.cameraHalf, minZ: -CAMERA.cameraHalf, maxZ: CAMERA.cameraHalf, maxY: CAMERA.cameraAltMax - h0 },
    clearance: CAMERA.clearance,
    focalClearance: CAMERA.focalClearance,
    targetLift: CAMERA.targetLift,
  };
}

export function resolveView(v: ViewPreset, pois: Poi[], h0: number, heightAt: (x: number, yNorth: number) => number): Pose {
  let target;
  if ('poi' in v.target) {
    const id = v.target.poi;
    const p = pois.find((q) => q.id === id);
    if (!p) throw new Error(`vista ${v.id}: POI ${id} inexistente`);
    target = poiScene(p, h0);
  } else target = { x: v.target.x, y: heightAt(v.target.x, v.target.y) + v.target.above - h0, z: -v.target.y };
  return poseFromSpecPure({ target, bearingDeg: v.bearingDeg, elevationDeg: v.elevationDeg, distance: v.distance });
}
