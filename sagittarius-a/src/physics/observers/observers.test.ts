import { describe, expect, it } from 'vitest';
import { KerrSchild } from '../metrics/kerrSchild';
import { ergosphereRadius, horizons, lapse, zamoOmega } from '../metrics/kerr';
import { cartesianFromSpheroidal } from '../metrics/coordinates';
import {
  circularObserver,
  frameComponents,
  gramSchmidtTetrad,
  observerAvailability,
  photonFromLocal,
  rainObserver,
  relativeVelocity,
  sphericalTetrad,
  staticObserver,
  velocityFromLocal,
  zamoObserver,
} from './observers';
import { mulberry32 } from '../random';

function checkTetrad(ks: KerrSchild, p: number[], e: Float64Array[]) {
  for (let a = 0; a < 4; a++)
    for (let b = 0; b < 4; b++) {
      const v = ks.dot(p[0], p[1], p[2], e[a], e[b]);
      const eta = a === b ? (a === 0 ? -1 : 1) : 0;
      expect(Math.abs(v - eta)).toBeLessThan(1e-10);
    }
}

describe('Observadores', () => {
  it('todas las familias dan tétradas ortonormales donde existen', () => {
    const rng = mulberry32(21);
    for (const a of [0, 0.5, 0.95]) {
      const ks = new KerrSchild(a);
      const { rPlus } = horizons(a);
      for (let k = 0; k < 40; k++) {
        const r = rPlus * 0.5 + 20 * rng();
        const th = 0.15 + 2.8 * rng();
        const p = cartesianFromSpheroidal(r, th, 6.28 * rng(), a);
        const cands = [staticObserver(ks, p[0], p[1], p[2]), zamoObserver(ks, p[0], p[1], p[2]), rainObserver(ks, p[0], p[1], p[2])];
        for (const u of cands) {
          if (!u) continue;
          expect(u[0]).toBeGreaterThan(0);
          const tet = sphericalTetrad(ks, p[0], p[1], p[2], u);
          checkTetrad(ks, p, tet.e);
        }
      }
    }
  });

  it('el observador estático deja de existir exactamente en la ergosfera', () => {
    const a = 0.9;
    const ks = new KerrSchild(a);
    for (const th of [0.3, 1.0, Math.PI / 2]) {
      const rE = ergosphereRadius(a, th);
      const out = cartesianFromSpheroidal(rE * 1.001, th, 0, a);
      const inn = cartesianFromSpheroidal(rE * 0.999, th, 0, a);
      expect(staticObserver(ks, out[0], out[1], out[2])).not.toBeNull();
      expect(staticObserver(ks, inn[0], inn[1], inn[2])).toBeNull();
      expect(observerAvailability('static', ks, inn[0], inn[1], inn[2])).toMatch(/ergosfera/);
      // El ZAMO sí existe dentro de la ergosfera
      expect(zamoObserver(ks, inn[0], inn[1], inn[2])).not.toBeNull();
    }
  });

  it('ZAMO: u^t = 1/α y gira con ω', () => {
    const a = 0.7;
    const ks = new KerrSchild(a);
    const r = 3.3;
    const th = 1.0;
    const p = cartesianFromSpheroidal(r, th, 0.2, a);
    const u = zamoObserver(ks, p[0], p[1], p[2])!;
    expect(u[0]).toBeCloseTo(1 / lapse(r, th, a), 9);
    const w = zamoOmega(r, th, a);
    const v = circularObserver(ks, p[0], p[1], p[2], w)!;
    for (let i = 0; i < 4; i++) expect(v[i]).toBeCloseTo(u[i], 9);
  });

  it('observador de lluvia normalizado y E = 1 en todo r > 0 (incluido el interior)', () => {
    const a = 0.6;
    const ks = new KerrSchild(a);
    for (const r of [20, 3, horizons(a).rPlus, 1.0]) {
      const p = cartesianFromSpheroidal(r, 0.8, 1.3, a);
      const u = rainObserver(ks, p[0], p[1], p[2]);
      expect(ks.dot(p[0], p[1], p[2], u, u)).toBeCloseTo(-1, 10);
      const ul = ks.lower(p[0], p[1], p[2], u);
      expect(-ul[0]).toBeCloseTo(1, 10);
    }
  });

  it('velocidades locales y relativas: el boost conserva la norma y se recupera la velocidad', () => {
    const ks = new KerrSchild(0.5);
    const p = cartesianFromSpheroidal(8, 1.2, 0, 0.5);
    const u0 = zamoObserver(ks, p[0], p[1], p[2])!;
    const tet = sphericalTetrad(ks, p[0], p[1], p[2], u0);
    const v: [number, number, number] = [0.3, -0.2, 0.5];
    const u = velocityFromLocal(tet, v);
    expect(ks.dot(p[0], p[1], p[2], u, u)).toBeCloseTo(-1, 12);
    const rel = relativeVelocity(ks, p[0], p[1], p[2], u, tet);
    expect(rel.speed).toBeCloseTo(Math.hypot(...v), 12);
    expect(rel.v[2]).toBeCloseTo(0.5, 12);
    expect(() => velocityFromLocal(tet, [0.8, 0.7, 0])).toThrow();
    const k = photonFromLocal(tet, [0, 1, 0], 2);
    expect(ks.dot(p[0], p[1], p[2], k, k)).toBeCloseTo(0, 12);
    expect(frameComponents(ks, p[0], p[1], p[2], tet, k)[0]).toBeCloseTo(2, 12);
  });

  it('Gram–Schmidt con semillas arbitrarias produce una tétrada de cámara orientada', () => {
    const ks = new KerrSchild(0.9);
    const p = cartesianFromSpheroidal(15, 1.3, 0.5, 0.9);
    const u = zamoObserver(ks, p[0], p[1], p[2])!;
    const fwd = [0, -p[0], -p[1], -p[2]];
    const up = [0, 0, 0, 1];
    const right = [0, fwd[2] * up[3] - fwd[3] * up[2], fwd[3] * up[1] - fwd[1] * up[3], fwd[1] * up[2] - fwd[2] * up[1]];
    const tet = gramSchmidtTetrad(ks, p[0], p[1], p[2], u, [fwd, up, right]);
    checkTetrad(ks, p, tet.e);
  });
});
