import { describe, expect, it } from 'vitest';
import { KerrSchild } from '../metrics/kerrSchild';
import { kretschmann, horizons } from '../metrics/kerr';
import { cartesianFromSpheroidal } from '../metrics/coordinates';
import { kretschmannNumeric, symmetricEigen3, tidalTensor } from './riemann';
import { rainObserver, sphericalTetrad, staticObserver } from '../observers/observers';
import { GeodesicIntegrator } from '../geodesics/geodesic';
import { mulberry32 } from '../random';

describe('Riemann numérico', () => {
  it('el escalar de Kretschmann coincide con la fórmula analítica (fuera y dentro del horizonte)', () => {
    const rng = mulberry32(11);
    for (const a of [0, 0.5, 0.9]) {
      const ks = new KerrSchild(a);
      const { rMinus } = horizons(a);
      for (let k = 0; k < 12; k++) {
        const r = Math.max(rMinus + 0.15, 0.4) + 12 * rng() ** 2;
        const th = 0.2 + (Math.PI - 0.4) * rng();
        const [x, y, z] = cartesianFromSpheroidal(r, th, 6.28 * rng(), a);
        const Kn = kretschmannNumeric(ks, x, y, z);
        const Ka = kretschmann(r, th, a);
        expect(Math.abs(Kn - Ka) / Math.abs(Ka)).toBeLessThan(1e-6);
      }
    }
  });

  it('marea en Schwarzschild (observador estático): diag(−2M/r³, M/r³, M/r³)', () => {
    const ks = new KerrSchild(0);
    for (const r of [3, 6, 20]) {
      const p = cartesianFromSpheroidal(r, 1.1, 0.7, 0);
      const u = staticObserver(ks, p[0], p[1], p[2])!;
      const tet = sphericalTetrad(ks, p[0], p[1], p[2], u);
      const E = tidalTensor(ks, p[0], p[1], p[2], u, [tet.e[1], tet.e[2], tet.e[3]]);
      const s = 1 / r ** 3;
      expect(E[0] / s).toBeCloseTo(-2, 6);
      expect(E[4] / s).toBeCloseTo(1, 6);
      expect(E[8] / s).toBeCloseTo(1, 6);
      expect(Math.abs(E[1]) / s).toBeLessThan(1e-6);
    }
  });

  it('la marea radial es invariante bajo el impulso radial: el observador en caída ve lo mismo, también dentro del horizonte', () => {
    const ks = new KerrSchild(0);
    for (const r of [6, 2, 1.2]) {
      const p = cartesianFromSpheroidal(r, 0.9, 2.0, 0);
      const u = rainObserver(ks, p[0], p[1], p[2]);
      const tet = sphericalTetrad(ks, p[0], p[1], p[2], u);
      const E = tidalTensor(ks, p[0], p[1], p[2], u, [tet.e[1], tet.e[2], tet.e[3]]);
      const s = 1 / r ** 3;
      expect(E[0] / s).toBeCloseTo(-2, 5);
      expect(E[4] / s).toBeCloseTo(1, 5);
      expect(E[8] / s).toBeCloseTo(1, 5);
    }
  });

  it('traza nula del tensor de marea en vacío (R_00 = 0) para observadores arbitrarios en Kerr', () => {
    const ks = new KerrSchild(0.8);
    const p = cartesianFromSpheroidal(4, 0.7, 1, 0.8);
    const u = rainObserver(ks, p[0], p[1], p[2]);
    const tet = sphericalTetrad(ks, p[0], p[1], p[2], u);
    const E = tidalTensor(ks, p[0], p[1], p[2], u, [tet.e[1], tet.e[2], tet.e[3]]);
    const { values } = symmetricEigen3(E);
    expect(Math.abs(E[0] + E[4] + E[8]) / Math.abs(values[0])).toBeLessThan(1e-6);
  });

  it('desviación geodésica: la separación de dos geodésicas vecinas obedece d²ξ/dτ² = −E ξ', () => {
    // Dos partículas en caída radial (Schwarzschild) separadas δ en la dirección radial.
    const ks = new KerrSchild(0);
    const r0 = 12;
    const d = 1e-4;
    const make = (r: number) => {
      const u = staticObserver(ks, r, 0, 0)!;
      return ks.lower(r, 0, 0, u);
    };
    const A = new GeodesicIntegrator(ks, 'massive', { rtol: 1e-13, atol: 1e-16 });
    const B = new GeodesicIntegrator(ks, 'massive', { rtol: 1e-13, atol: 1e-16 });
    A.reset(0, [r0, 0, 0], make(r0));
    B.reset(0, [r0 + d, 0, 0], make(r0 + d));
    const buf = new Float64Array(8);
    // Muestras finas de A: (τ, r) para integrar la ecuación de Jacobi con r(τ) interpolado
    const dts = 0.02;
    const samplesA: Float64Array[] = [];
    const samplesB: Float64Array[] = [];
    for (let t = 0; t < 34; t += dts) {
      while (A.t < t) A.step();
      while (B.t < t) B.step();
      samplesA.push(Float64Array.from(t === 0 ? A.y : A.denseAt(t, buf)));
      samplesB.push(Float64Array.from(t === 0 ? B.y : B.denseAt(t, buf)));
    }
    const rA = samplesA.map((y) => ks.geometry(y[0], y[1], y[2]).r);
    const tauA = samplesA.map((y) => y[7]);
    // Separación propia en el espacio en reposo de A: Δx⊥ = Δx + g(Δx, u) u  (válido a primer orden en d)
    const sepAt = (k: number) => {
      const ya = samplesA[k];
      const yb = samplesB[k];
      const u = ks.raise(ya[0], ya[1], ya[2], [ya[3], ya[4], ya[5], ya[6]]);
      const dx = Float64Array.of(0, yb[0] - ya[0], yb[1] - ya[1], yb[2] - ya[2]);
      const gu = ks.dot(ya[0], ya[1], ya[2], dx, u);
      for (let i = 0; i < 4; i++) dx[i] += gu * u[i];
      return Math.sqrt(ks.dot(ya[0], ya[1], ya[2], dx, dx));
    };
    // Jacobi: ξ'' = (2/r³) ξ con RK4 en τ sobre la malla de A.
    // Condiciones iniciales medidas sobre las geodésicas: soltar ambas en el mismo t de KS no es
    // simultáneo para A (Δt_BL = h'(r) d), así que ξ'(0) ≠ 0 es de primer orden en d.
    let xi = sepAt(0);
    const h0 = tauA[1] - tauA[0];
    let v = (-3 * sepAt(0) + 4 * sepAt(1) - sepAt(2)) / (2 * h0);
    let maxRel = 0;
    for (let k = 0; k + 1 < samplesA.length; k++) {
      const h = tauA[k + 1] - tauA[k];
      const r0k = rA[k];
      const r1k = rA[k + 1];
      const rm = 0.5 * (r0k + r1k);
      const acc = (r: number, x: number) => (2 / r ** 3) * x;
      const k1x = v;
      const k1v = acc(r0k, xi);
      const k2x = v + 0.5 * h * k1v;
      const k2v = acc(rm, xi + 0.5 * h * k1x);
      const k3x = v + 0.5 * h * k2v;
      const k3v = acc(rm, xi + 0.5 * h * k2x);
      const k4x = v + h * k3v;
      const k4v = acc(r1k, xi + h * k3x);
      xi += (h / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
      v += (h / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);
      if (rA[k + 1] < 2.5) break;
      maxRel = Math.max(maxRel, Math.abs(sepAt(k + 1) - xi) / xi);
    }
    // Error esperado O(d/r) ≈ 1e-5 más el de interpolar r(τ) linealmente
    expect(maxRel).toBeLessThan(2e-4);
  });
});

describe('Autovalores simétricos', () => {
  it('Jacobi 3×3 recupera autovalores conocidos', () => {
    const { values } = symmetricEigen3([2, 1, 0, 1, 2, 0, 0, 0, 5]);
    expect(values[0]).toBeCloseTo(1, 12);
    expect(values[1]).toBeCloseTo(3, 12);
    expect(values[2]).toBeCloseTo(5, 12);
  });
});
