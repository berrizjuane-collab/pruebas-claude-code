import { describe, expect, it } from 'vitest';
import { besselK2, planck, thermalSynchrotronAlpha, thermalSynchrotronJ, thetaE } from './synchrotron';
import { hash3, valueNoise3 } from './riaf';

/** K_ν(x) = ∫₀^∞ exp(−x cosh t) cosh(ν t) dt (cuadratura de referencia). */
function besselKQuad(nu: number, x: number): number {
  const T = Math.acosh(60 / x + 1);
  const N = 20000;
  let s = 0;
  for (let k = 0; k <= N; k++) {
    const t = (T * k) / N;
    const w = k === 0 || k === N ? 0.5 : 1;
    s += w * Math.exp(-x * Math.cosh(t)) * Math.cosh(nu * t);
  }
  return (s * T) / N;
}

describe('Funciones especiales y radiación', () => {
  it('K₂(x) por polinomios de Abramowitz–Stegun: error relativo < 1e-6 en [0,05, 20]', () => {
    for (const x of [0.05, 0.1, 0.5, 1, 1.9, 2, 2.1, 5, 10, 20]) {
      const ref = besselKQuad(2, x);
      expect(Math.abs(besselK2(x) - ref) / ref).toBeLessThan(1e-6);
    }
  });

  it('Planck: límite de Rayleigh–Jeans a 230 GHz y 10¹⁰ K', () => {
    const nu = 230e9;
    const T = 1e10;
    const rj = (2 * nu * nu * 1.380649e-16 * T) / 2.99792458e10 ** 2;
    expect(planck(nu, T) / rj).toBeCloseTo(1, 4);
  });

  it('emisividad sincrotrón: positiva, ∝ n_e y creciente con B a 230 GHz en el régimen de Sgr A*', () => {
    const j1 = thermalSynchrotronJ(230e9, 1e6, 5e10, 20, 0.8);
    const j2 = thermalSynchrotronJ(230e9, 2e6, 5e10, 20, 0.8);
    const j3 = thermalSynchrotronJ(230e9, 1e6, 5e10, 40, 0.8);
    expect(j1).toBeGreaterThan(0);
    expect(j2 / j1).toBeCloseTo(2, 12);
    expect(j3).toBeGreaterThan(j1);
    const a = thermalSynchrotronAlpha(230e9, j1, 5e10);
    expect(a).toBeGreaterThan(0);
    expect(thetaE(5.93e9)).toBeCloseTo(1, 2);
  });

  it('ruido determinista: valores reproducibles y en [0, 1)', () => {
    expect(hash3(1, 2, 3, 7)).toBe(hash3(1, 2, 3, 7));
    expect(hash3(-1, 2, 3, 7)).not.toBe(hash3(1, 2, 3, 7));
    for (let k = 0; k < 100; k++) {
      const v = valueNoise3(k * 0.37, -k * 0.11, k * 0.05, 3);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
