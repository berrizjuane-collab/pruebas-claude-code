import { describe, it, expect } from 'vitest';
import { FORMULAS } from './formulas';
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

describe('formula catalogue', () => {
  const ctx = { params, derived: derive(params) };

  it('every formula evaluates to a finite/defined display string with a unit field', () => {
    for (const f of FORMULAS) {
      const r = f.evaluate(ctx);
      expect(typeof r.value).toBe('string');
      expect(r.value.length).toBeGreaterThan(0);
      expect(typeof r.unit).toBe('string');
    }
  });

  it('has unique ids and non-empty latex/meaning', () => {
    const ids = new Set<string>();
    for (const f of FORMULAS) {
      expect(ids.has(f.id)).toBe(false);
      ids.add(f.id);
      expect(f.latex.length).toBeGreaterThan(0);
      expect(f.meaning.length).toBeGreaterThan(0);
      expect(f.variables.length).toBeGreaterThan(0);
    }
  });

  it('marks the TOV equation as an approximation and not solved live', () => {
    const tov = FORMULAS.find((f) => f.id === 'tov')!;
    expect(tov.approximation).toBe(true);
    expect(tov.evaluate(ctx).value).toBe('—');
  });
});
