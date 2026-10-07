/**
 * Planificador de transiciones de cámara. Interpolar dos poses válidas no garantiza
 * un trayecto válido (el arco puede cruzar una arista), así que se muestrea el
 * camino, se mide el déficit de holgura y se añade una elevación suave que se anula
 * en los extremos. En ejecución, cada fotograma pasa además por constrainCamera.
 */
import { clearanceFor, type CameraLimits, type TerrainQueries, type Vec3 } from './constraints.ts';

export interface Pose {
  target: Vec3;
  position: Vec3;
}

export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

interface Sph {
  r: number;
  polar: number;
  azim: number;
}

function toSph(p: Vec3, t: Vec3): Sph {
  const dx = p.x - t.x;
  const dy = p.y - t.y;
  const dz = p.z - t.z;
  const r = Math.hypot(dx, dy, dz) || 1;
  return { r, polar: Math.acos(Math.min(1, Math.max(-1, dy / r))), azim: Math.atan2(dx, dz) };
}

function shortestDelta(a: number, b: number): number {
  let d = (b - a) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

export interface TransitionPlan {
  /** pose para u ∈ [0, 1] (u ya suavizado o no, según se quiera) */
  poseAt(u: number): Pose;
  /** elevación máxima añadida (m) */
  maxLift: number;
  /** muestras con déficit residual tras la planificación (debería ser 0) */
  residualViolations: number;
}

export function planTransition(from: Pose, to: Pose, limits: CameraLimits, terrain: TerrainQueries, samples = 64): TransitionPlan {
  const a = toSph(from.position, from.target);
  const b = toSph(to.position, to.target);
  const dAz = shortestDelta(a.azim, b.azim);
  const lnA = Math.log(a.r);
  const lnB = Math.log(b.r);

  const raw = (u: number): Pose => {
    const target = {
      x: from.target.x + (to.target.x - from.target.x) * u,
      y: from.target.y + (to.target.y - from.target.y) * u,
      z: from.target.z + (to.target.z - from.target.z) * u,
    };
    const r = Math.exp(lnA + (lnB - lnA) * u);
    const polar = a.polar + (b.polar - a.polar) * u;
    const azim = a.azim + dAz * u;
    return {
      target,
      position: {
        x: target.x + r * Math.sin(polar) * Math.sin(azim),
        y: target.y + r * Math.cos(polar),
        z: target.z + r * Math.sin(polar) * Math.cos(azim),
      },
    };
  };

  // déficits de holgura a lo largo del camino
  const us: number[] = [];
  const deficit: number[] = [];
  for (let k = 0; k <= samples; k++) {
    const u = k / samples;
    const p = raw(u);
    const need = terrain.clearanceY(p.position.x, p.position.z) + clearanceFor(p.target, limits);
    us.push(u);
    deficit.push(Math.max(0, need - p.position.y));
  }
  const bumps: { u: number; amp: number }[] = [];
  const width = 0.28;
  const window = (u: number) => {
    // nulo en los extremos para respetar las poses inicial y final exactas
    const edge = Math.min(1, Math.sin(Math.PI * Math.min(1, Math.max(0, u))) * 3);
    let lift = 0;
    for (const bump of bumps) {
      const d = Math.abs(u - bump.u) / width;
      if (d < 1) lift = Math.max(lift, bump.amp * Math.cos((d * Math.PI) / 2) ** 2);
    }
    return lift * edge;
  };
  for (let iter = 0; iter < 4; iter++) {
    let added = false;
    for (let k = 0; k < us.length; k++) {
      const p = raw(us[k]);
      const need = terrain.clearanceY(p.position.x, p.position.z) + clearanceFor(p.target, limits);
      const res = need - (p.position.y + window(us[k]));
      if (res > 0.5 && us[k] > 0 && us[k] < 1) {
        bumps.push({ u: us[k], amp: window(us[k]) + res * 1.15 + 5 });
        added = true;
      }
    }
    if (!added) break;
  }
  let residual = 0;
  let maxLift = 0;
  for (const u of us) {
    const p = raw(u);
    const lift = window(u);
    maxLift = Math.max(maxLift, lift);
    const need = terrain.clearanceY(p.position.x, p.position.z) + clearanceFor(p.target, limits);
    if (u > 0 && u < 1 && p.position.y + lift < need - 0.5) residual++;
  }
  return {
    poseAt(u: number) {
      const p = raw(u);
      p.position.y += window(u);
      return p;
    },
    maxLift,
    residualViolations: residual,
  };
}
