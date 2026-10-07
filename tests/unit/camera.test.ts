import { describe, expect, it } from 'vitest';
import { clampTarget, constrainCamera, isCameraValid, minDistanceFor, type CameraLimits, type TerrainQueries } from '../../src/camera/constraints.ts';
import { planTransition } from '../../src/camera/transitions.ts';
import { dilateGrid } from '../../src/geo/heightfield.ts';
import { ridgeGrid } from './helpers.ts';

const g = ridgeGrid();
const dil = dilateGrid(g, 75);
const H0 = 6000;
const terrain: TerrainQueries = { heightY: (x, z) => g.sample(x, -z) - H0, clearanceY: (x, z) => dil.sample(x, -z) - H0 };
const limits: CameraLimits = {
  minDistance: 1000,
  focalMinDistance: 350,
  maxDistance: 24000,
  focalZones: [{ x: 0, y: 7000 - H0, z: 0, radius: 600 }],
  minPolar: 0.07,
  maxPolar: 1.52,
  targetBounds: { minX: -4500, maxX: 4500, minZ: -4500, maxZ: 4500, minY: -1000, maxY: 2700 },
  cameraBounds: { minX: -20000, maxX: 20000, minZ: -20000, maxZ: 20000, maxY: 15000 },
  clearance: 70,
  focalClearance: 40,
  targetLift: 5,
};

describe('restricciones de cámara', () => {
  it('nunca deja la cámara bajo el terreno ni dentro de la arista', () => {
    for (let k = 0; k < 400; k++) {
      const t = clampTarget({ x: (k * 37) % 9000 - 4500, y: 0, z: (k * 53) % 9000 - 4500 }, limits, terrain);
      const p = { x: t.x + Math.sin(k) * 3000, y: t.y - 1500 + (k % 7) * 300, z: t.z + Math.cos(k) * 3000 };
      const c = constrainCamera(p, t, limits, terrain);
      expect(c.y).toBeGreaterThanOrEqual(terrain.clearanceY(c.x, c.z) + 40 - 1e-6);
      expect(c.y).toBeGreaterThan(terrain.heightY(c.x, c.z) + 39);
    }
  });
  it('el objetivo queda dentro del área y sobre el relieve', () => {
    const t = clampTarget({ x: 99999, y: -5000, z: -99999 }, limits, terrain);
    expect(t.x).toBe(4500);
    expect(t.z).toBe(-4500);
    expect(t.y).toBeGreaterThanOrEqual(terrain.heightY(t.x, t.z) + 5);
  });
  it('distancia mínima general 1000 m y focal 350 m junto a la zona focal', () => {
    expect(minDistanceFor({ x: 4000, y: 0, z: 4000 }, limits)).toBe(1000);
    expect(minDistanceFor({ x: 0, y: 1000, z: 0 }, limits)).toBe(350);
    const t = { x: 4000, y: terrain.heightY(4000, 4000) + 5, z: 4000 };
    const c = constrainCamera({ x: t.x + 10, y: t.y + 200, z: t.z }, t, limits, terrain);
    expect(Math.hypot(c.x - t.x, c.y - t.y, c.z - t.z)).toBeGreaterThanOrEqual(999);
  });
  it('limita la distancia máxima', () => {
    const t = { x: 0, y: 1000, z: 0 };
    const c = constrainCamera({ x: 0, y: 1000, z: 90000 }, t, limits, terrain);
    expect(Math.hypot(c.x, c.y - 1000, c.z)).toBeLessThanOrEqual(24000 + 1);
  });
});

describe('transiciones planificadas', () => {
  it('cruzar la arista de lado a lado no atraviesa el relieve', () => {
    const tA = { x: -2500, y: terrain.heightY(-2500, 0) + 5, z: 0 };
    const tB = { x: 2500, y: terrain.heightY(2500, 0) + 5, z: 0 };
    const from = { target: tA, position: constrainCamera({ x: -3800, y: tA.y + 300, z: 200 }, tA, limits, terrain) };
    const to = { target: tB, position: constrainCamera({ x: 3800, y: tB.y + 300, z: -200 }, tB, limits, terrain) };
    expect(isCameraValid(from.position, from.target, limits, terrain)).toBe(true);
    const plan = planTransition(from, to, limits, terrain, 96);
    expect(plan.residualViolations).toBe(0);
    expect(plan.maxLift).toBeGreaterThan(0);
    for (let u = 0; u <= 1.0001; u += 1 / 300) {
      const p = plan.poseAt(u).position;
      expect(p.y).toBeGreaterThan(terrain.heightY(p.x, p.z) + 30);
    }
    const end = plan.poseAt(1).position;
    expect(Math.hypot(end.x - to.position.x, end.y - to.position.y, end.z - to.position.z)).toBeLessThan(1e-6);
  });
});
