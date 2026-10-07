/** Conversión rumbo/elevación/distancia → pose (pura, sin three.js). */
import type { Vec3 } from './constraints.ts';
import type { Pose } from './transitions.ts';

export interface PoseSpec {
  target: Vec3;
  /** rumbo geográfico desde el objetivo hacia la cámara (0 = norte, 90 = este) */
  bearingDeg: number;
  elevationDeg: number;
  distance: number;
}

export function poseFromSpecPure(s: PoseSpec): Pose {
  const b = (s.bearingDeg * Math.PI) / 180;
  const e = (s.elevationDeg * Math.PI) / 180;
  const h = s.distance * Math.cos(e);
  return {
    target: { ...s.target },
    position: { x: s.target.x + h * Math.sin(b), y: s.target.y + s.distance * Math.sin(e), z: s.target.z - h * Math.cos(b) },
  };
}
