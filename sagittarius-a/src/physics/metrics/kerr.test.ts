import { describe, expect, it } from 'vitest';
import {
  circularOrbitConstants,
  criticalImpactParameter,
  ergosphereRadius,
  horizons,
  iscoRadius,
  keplerOmega,
  kretschmann,
  marginallyBoundRadius,
  photonOrbitRadius,
  psi2,
  radialPotential,
  shadowBoundary,
  surfaceGravity,
  zamoOmega,
} from './kerr';

describe('Radios característicos', () => {
  it('Schwarzschild: horizonte 2M, fotón 3M, ISCO 6M, marginalmente ligada 4M', () => {
    expect(horizons(0).rPlus).toBe(2);
    expect(photonOrbitRadius(0, true)).toBeCloseTo(3, 12);
    expect(iscoRadius(0, true)).toBeCloseTo(6, 12);
    expect(iscoRadius(0, false)).toBeCloseTo(6, 12);
    expect(marginallyBoundRadius(0, true)).toBeCloseTo(4, 12);
    expect(criticalImpactParameter(0, true)).toBeCloseTo(Math.sqrt(27), 12);
    expect(surfaceGravity(0)).toBeCloseTo(0.25, 12);
  });

  it('límite extremo a → 1: ISCO prógrada → M, retrógrada → 9M; fotón → M y 4M', () => {
    const a = 1 - 1e-9;
    expect(iscoRadius(a, true)).toBeCloseTo(1, 2);
    expect(iscoRadius(a, false)).toBeCloseTo(9, 6);
    expect(photonOrbitRadius(a, true)).toBeCloseTo(1, 3);
    expect(photonOrbitRadius(a, false)).toBeCloseTo(4, 6);
    expect(criticalImpactParameter(a, true)).toBeCloseTo(2, 3);
    expect(criticalImpactParameter(a, false)).toBeCloseTo(7, 6);
  });

  it('valores tabulados (BPT 1972) para a = 0,5 y 0,9', () => {
    // Referencias calculadas con la fórmula cerrada de BPT y comprobadas abajo con el potencial efectivo
    expect(iscoRadius(0.5, true)).toBeCloseTo(4.233, 3);
    expect(iscoRadius(0.5, false)).toBeCloseTo(7.555, 3);
    expect(iscoRadius(0.9, true)).toBeCloseTo(2.321, 3);
    expect(iscoRadius(0.9, false)).toBeCloseTo(8.717, 3);
  });

  it('el ISCO es el mínimo de E(r) de las órbitas circulares (dE/dr = 0)', () => {
    for (const a of [0, 0.5, 0.9, 0.998]) {
      for (const pro of [true, false]) {
        const ri = iscoRadius(a, pro);
        const h = 1e-4;
        const dE = (circularOrbitConstants(ri + h, a, pro).E - circularOrbitConstants(ri - h, a, pro).E) / (2 * h);
        expect(Math.abs(dE)).toBeLessThan(1e-6);
        // E(r) crece a ambos lados del ISCO
        expect(circularOrbitConstants(ri * 1.2, a, pro).E).toBeGreaterThan(circularOrbitConstants(ri, a, pro).E);
      }
    }
  });

  it('las órbitas circulares tienen R(r) = R\'(r) = 0 (raíz doble del potencial radial)', () => {
    for (const a of [0, 0.5, 0.9]) {
      for (const pro of [true, false]) {
        for (const r of [iscoRadius(a, pro) + 0.5, 12, 30]) {
          const { E, L } = circularOrbitConstants(r, a, pro);
          const R = radialPotential(r, a, E, L, 0, 1);
          const h = 1e-5;
          const dR = (radialPotential(r + h, a, E, L, 0, 1) - radialPotential(r - h, a, E, L, 0, 1)) / (2 * h);
          expect(Math.abs(R)).toBeLessThan(1e-8 * r ** 4);
          expect(Math.abs(dR)).toBeLessThan(1e-6 * r ** 3);
        }
      }
    }
  });

  it('marginalmente ligada: E = 1', () => {
    for (const a of [0, 0.5, 0.9]) {
      for (const pro of [true, false]) {
        const { E } = circularOrbitConstants(marginallyBoundRadius(a, pro), a, pro);
        expect(E).toBeCloseTo(1, 10);
      }
    }
  });

  it('ergosfera: r_E(polo) = r₊, r_E(ecuador) = 2M', () => {
    for (const a of [0.3, 0.9]) {
      expect(ergosphereRadius(a, 0)).toBeCloseTo(horizons(a).rPlus, 12);
      expect(ergosphereRadius(a, Math.PI / 2)).toBeCloseTo(2, 12);
    }
  });
});

describe('Invariantes y arrastre', () => {
  it('Kretschmann: 48M²/r⁶ en Schwarzschild y 48 Re(Ψ₂²) en Kerr', () => {
    expect(kretschmann(2, 1, 0)).toBeCloseTo(48 / 64, 12);
    for (const [r, th, a] of [
      [1.7, 0.4, 0.9],
      [3, 1.2, 0.5],
      [0.8, 0.1, 0.99],
    ]) {
      const [re, im] = psi2(r, th, a);
      expect(kretschmann(r, th, a)).toBeCloseTo(48 * (re * re - im * im), 9);
    }
  });

  it('ω_ZAMO → 2J/r³ lejos (Lense–Thirring) y Ω_H en el horizonte', () => {
    const a = 0.7;
    const r = 1e4;
    expect(zamoOmega(r, Math.PI / 2, a) / ((2 * a) / r ** 3)).toBeCloseTo(1, 3);
    const { rPlus } = horizons(a);
    expect(zamoOmega(rPlus, 0.7, a)).toBeCloseTo(a / (rPlus * rPlus + a * a), 10);
  });

  it('Ω kepleriana prógrada < 1/r^{3/2} cuando a > 0', () => {
    expect(keplerOmega(6, 0, true)).toBeCloseTo(6 ** -1.5, 12);
    expect(keplerOmega(6, 0.5, true)).toBeLessThan(6 ** -1.5);
  });

  it('la sombra de Schwarzschild es un círculo de radio √27', () => {
    const pts = shadowBoundary(0, 1);
    for (const [x, y] of pts) expect(Math.hypot(x, y)).toBeCloseTo(Math.sqrt(27), 10);
  });

  it('la sombra de Kerr vista de canto está desplazada y aplanada en el lado prógrado', () => {
    const pts = shadowBoundary(0.9, Math.PI / 2, 2000);
    const xs = pts.map((p) => p[0]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    // α = −ξ/sinθ_o: los fotones prógrados (ξ > 0) quedan en α < 0, a ≈ −2 + … del centro
    expect(minX).toBeGreaterThan(-5.196);
    expect(maxX).toBeGreaterThan(5.196);
    expect(Math.abs(maxX - criticalImpactParameter(0.9, false))).toBeLessThan(1e-3);
    expect(Math.abs(-minX - criticalImpactParameter(0.9, true))).toBeLessThan(1e-3);
  });
});
