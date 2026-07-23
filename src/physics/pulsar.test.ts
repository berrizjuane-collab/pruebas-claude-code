import { describe, it, expect } from 'vitest';
import {
  magneticAxis,
  observerDirection,
  beamAngle,
  lightCurveIntensity,
  sampleLightCurve,
  countPeaks,
} from './pulsar';

const len = (v: readonly number[]) => Math.hypot(v[0], v[1], v[2]);

describe('pulsar geometry', () => {
  it('magnetic axis is a unit vector at angle α from the spin axis', () => {
    const alpha = 0.5;
    for (let p = 0; p < 6; p++) {
      const axis = magneticAxis(p, alpha);
      expect(len(axis)).toBeCloseTo(1, 10);
      // dot with +Y is cos α, independent of phase.
      expect(axis[1]).toBeCloseTo(Math.cos(alpha), 10);
    }
  });

  it('observer direction is a unit vector', () => {
    expect(len(observerDirection(1.1))).toBeCloseTo(1, 10);
  });

  it('an aligned beam and observer have zero angular gap', () => {
    const obs = observerDirection(0); // straight up
    const beam = magneticAxis(0, 0); // aligned rotator, straight up
    expect(beamAngle(beam, obs)).toBeCloseTo(0, 10);
  });
});

describe('light curve', () => {
  it('peaks near intensity 1 when a beam sweeps through the line of sight', () => {
    // Obliquity = inclination → the beam passes exactly through the observer.
    const curve = sampleLightCurve(0.6, 0.6, 0.2, 512);
    expect(Math.max(...curve)).toBeGreaterThan(0.9);
    expect(Math.min(...curve)).toBeLessThan(0.2);
  });

  it('is essentially flat/dark when no beam ever reaches the observer', () => {
    // Small obliquity, large inclination → beams never sweep near the observer.
    const curve = sampleLightCurve(0.05, 1.4, 0.15, 512);
    expect(Math.max(...curve)).toBeLessThan(0.1);
  });

  it('yields two peaks per rotation when both poles are visible', () => {
    // With i ≈ 90° and α ≈ 90°, both the north and south beams cross the LOS.
    const curve = sampleLightCurve(Math.PI / 2 - 0.05, Math.PI / 2, 0.18, 720);
    expect(countPeaks(curve)).toBe(2);
  });

  it('intensity is bounded to [0,1]', () => {
    for (let i = 0; i < 100; i++) {
      const v = lightCurveIntensity(i * 0.13, 0.7, 0.5, 0.2);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
