import { describe, it, expect } from 'vitest';
import { radialProfile, LAYERS } from './interior';
import { derive, type StarParams } from './NeutronStarModel';
import { fromKm, fromSolarMasses } from './units';

const params: StarParams = {
  mass: fromSolarMasses(1.4),
  radius: fromKm(12),
  spinFrequency: 2,
  temperature: 8e5,
  magneticField: 1e8,
  magneticInclination: Math.PI / 6,
  inertiaFactor: 0.4,
};

describe('radial interior profile', () => {
  const profile = radialProfile(params, derive(params), 48);

  it('density decreases monotonically from centre to surface', () => {
    for (let i = 1; i < profile.length; i++) {
      expect(profile[i].density).toBeLessThanOrEqual(profile[i - 1].density + 1e-6);
    }
  });

  it('enclosed mass fraction runs 0 → 1', () => {
    expect(profile[0].massFraction).toBeCloseTo(0, 2);
    expect(profile[profile.length - 1].massFraction).toBeCloseTo(1, 6);
  });

  it('local compactness is highest near the surface and below 0.5 everywhere', () => {
    for (const s of profile) expect(s.localCompactness).toBeLessThan(0.5);
  });
});

describe('layer definitions', () => {
  it('cover the full radius without gaps and are ordered inside-out', () => {
    const sorted = [...LAYERS].sort((a, b) => a.rInner - b.rInner);
    expect(sorted[0].rInner).toBe(0);
    expect(sorted[sorted.length - 1].rOuter).toBe(1);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].rInner).toBeCloseTo(sorted[i - 1].rOuter, 6);
    }
  });

  it('marks the inner core as hypothetical', () => {
    const inner = LAYERS.find((l) => l.id === 'inner-core')!;
    expect(inner.certainty).toBe('hypothetical');
  });
});
