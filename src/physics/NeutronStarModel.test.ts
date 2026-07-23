import { describe, it, expect } from 'vitest';
import { C, G, M_SUN } from './constants';
import { derive, warnings, BUCHDAHL_COMPACTNESS, type StarParams } from './NeutronStarModel';
import { fromKm, fromSolarMasses } from './units';

/** A canonical 1.4 M☉ / 12 km / 2 Hz star used across the tests. */
const canonical: StarParams = {
  mass: fromSolarMasses(1.4),
  radius: fromKm(12),
  spinFrequency: 2,
  temperature: 8e5,
  magneticField: 1e8,
  magneticInclination: Math.PI / 6,
  inertiaFactor: 0.4,
};

const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

describe('unit conversions', () => {
  it('round-trips solar masses and kilometres', () => {
    expect(rel(fromSolarMasses(1.4), 1.4 * M_SUN)).toBeLessThan(1e-12);
    expect(fromKm(12)).toBe(12000);
  });
});

describe('frequency and period', () => {
  it('P = 1/f and Ω = 2πf are consistent', () => {
    const d = derive(canonical);
    expect(rel(d.period, 0.5)).toBeLessThan(1e-12); // 1/2 Hz
    expect(rel(d.angularVelocity, 2 * Math.PI * 2)).toBeLessThan(1e-12);
  });

  it('a millisecond pulsar has a sub-ms-to-few-ms period', () => {
    const d = derive({ ...canonical, spinFrequency: 500 });
    expect(rel(d.period, 1 / 500)).toBeLessThan(1e-12);
    expect(d.period * 1e3).toBeCloseTo(2.0, 3);
  });
});

describe('Schwarzschild radius', () => {
  it('matches r_s = 2GM/c² for one solar mass (~2.95 km)', () => {
    const d = derive({ ...canonical, mass: M_SUN });
    expect(rel(d.schwarzschildRadius, (2 * G * M_SUN) / (C * C))).toBeLessThan(1e-12);
    expect(d.schwarzschildRadius / 1e3).toBeCloseTo(2.95, 1);
  });
});

describe('compactness', () => {
  it('equals GM/(Rc²) and stays below the Buchdahl limit for realistic stars', () => {
    const d = derive(canonical);
    expect(rel(d.compactness, (G * canonical.mass) / (canonical.radius * C * C))).toBeLessThan(1e-12);
    expect(d.compactness).toBeLessThan(BUCHDAHL_COMPACTNESS);
    expect(d.compactness).toBeGreaterThan(0.1); // meaningfully relativistic
  });
});

describe('gravitational redshift & time dilation', () => {
  it('are mutually consistent: (1+z) = 1/(dτ/dt)', () => {
    const d = derive(canonical);
    expect(rel(1 + d.gravitationalRedshift, 1 / d.timeDilation)).toBeLessThan(1e-10);
  });

  it('redshift increases with compactness', () => {
    const light = derive({ ...canonical, mass: fromSolarMasses(1.2) });
    const heavy = derive({ ...canonical, mass: fromSolarMasses(2.1) });
    expect(heavy.gravitationalRedshift).toBeGreaterThan(light.gravitationalRedshift);
  });
});

describe('rotational energy and angular momentum', () => {
  it('E_rot = ½ I Ω² and J = I Ω', () => {
    const d = derive(canonical);
    const I = 0.4 * canonical.mass * canonical.radius ** 2;
    expect(rel(d.momentOfInertia, I)).toBeLessThan(1e-12);
    expect(rel(d.angularMomentum, I * d.angularVelocity)).toBeLessThan(1e-12);
    expect(rel(d.rotationalEnergy, 0.5 * I * d.angularVelocity ** 2)).toBeLessThan(1e-12);
  });

  it('rotational energy scales as f² (quadruple f → 16×)', () => {
    const slow = derive({ ...canonical, spinFrequency: 5 });
    const fast = derive({ ...canonical, spinFrequency: 20 });
    expect(rel(fast.rotationalEnergy / slow.rotationalEnergy, 16)).toBeLessThan(1e-9);
  });
});

describe('light-cylinder radius', () => {
  it('equals c/Ω and shrinks as spin rises', () => {
    const d = derive(canonical);
    expect(rel(d.lightCylinderRadius, C / d.angularVelocity)).toBeLessThan(1e-12);
    const faster = derive({ ...canonical, spinFrequency: 20 });
    expect(faster.lightCylinderRadius).toBeLessThan(d.lightCylinderRadius);
  });
});

describe('equatorial velocity', () => {
  it('equals ΩR and its β is v/c', () => {
    const d = derive(canonical);
    expect(rel(d.equatorialVelocity, d.angularVelocity * canonical.radius)).toBeLessThan(1e-12);
    expect(rel(d.equatorialBeta, d.equatorialVelocity / C)).toBeLessThan(1e-12);
  });
});

describe('surface gravity', () => {
  it('GR-corrected gravity exceeds the Newtonian value', () => {
    const d = derive(canonical);
    expect(d.surfaceGravityRelativistic).toBeGreaterThan(d.surfaceGravityNewtonian);
    expect(rel(d.surfaceGravityNewtonian, (G * canonical.mass) / canonical.radius ** 2)).toBeLessThan(1e-12);
  });
});

describe('parameter-limit warnings', () => {
  it('flags a super-fast, over-compact star', () => {
    // Absurd spin to force the mass-shedding warning.
    const d = derive({ ...canonical, spinFrequency: 5000 });
    const w = warnings({ ...canonical, spinFrequency: 5000 }, d);
    expect(w.some((x) => x.level === 'danger')).toBe(true);
    expect(d.superluminalWarning).toBe(true);
  });

  it('a canonical star raises no danger warnings', () => {
    const d = derive(canonical);
    const w = warnings(canonical, d);
    expect(w.some((x) => x.level === 'danger')).toBe(false);
  });
});
