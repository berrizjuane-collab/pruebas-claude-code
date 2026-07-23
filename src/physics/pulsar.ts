/**
 * Pulsar viewing geometry: where the magnetic beams point, where the distant
 * observer sits, and the resulting light curve. Pure functions (no THREE types)
 * so they are unit-tested and reused by the renderer, the chart and the audio.
 *
 * Convention: the spin axis is +Y. The magnetic axis makes angle α (obliquity)
 * with the spin axis and sweeps around it with the rotation phase φ. The observer
 * lies at inclination i from the spin axis, in the x–y plane.
 */

export type Vec3 = readonly [number, number, number];

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Unit magnetic-axis direction at rotation phase φ for obliquity α. */
export function magneticAxis(phase: number, obliquity: number): Vec3 {
  const s = Math.sin(obliquity);
  const c = Math.cos(obliquity);
  // Base vector (s, c, 0) at φ = 0, rotated around +Y by φ.
  return [s * Math.cos(phase), c, s * Math.sin(phase)];
}

/** Unit line-of-sight direction to a distant observer at inclination i. */
export function observerDirection(inclination: number): Vec3 {
  return [Math.sin(inclination), Math.cos(inclination), 0];
}

/** Angular gap (radians) between a beam axis and the observer direction. */
export function beamAngle(beam: Vec3, observer: Vec3): number {
  return Math.acos(Math.max(-1, Math.min(1, dot(beam, observer))));
}

/**
 * Observed intensity 0..1 as the two opposite beams sweep past the observer.
 * Each beam contributes a smooth (Gaussian) pulse of half-width `beamWidth`.
 */
export function lightCurveIntensity(
  phase: number,
  obliquity: number,
  inclination: number,
  beamWidth: number,
): number {
  const observer = observerDirection(inclination);
  const axis = magneticAxis(phase, obliquity);
  const opposite: Vec3 = [-axis[0], -axis[1], -axis[2]];

  const w = Math.max(0.02, beamWidth);
  const pulse = (beam: Vec3): number => {
    const a = beamAngle(beam, observer);
    const x = a / w;
    return Math.exp(-x * x);
  };
  return Math.min(1, pulse(axis) + pulse(opposite));
}

/**
 * Sample one full rotation of the light curve into `n` points (phase 0..2π).
 * Used to draw the curve and to detect single- vs double-peaked profiles.
 */
export function sampleLightCurve(
  obliquity: number,
  inclination: number,
  beamWidth: number,
  n = 256,
): number[] {
  const out: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const phase = (i / n) * Math.PI * 2;
    out[i] = lightCurveIntensity(phase, obliquity, inclination, beamWidth);
  }
  return out;
}

/** Count the significant peaks per rotation (1, 2, or 0 if never in view). */
export function countPeaks(curve: number[], threshold = 0.15): number {
  let peaks = 0;
  const n = curve.length;
  for (let i = 0; i < n; i++) {
    const prev = curve[(i - 1 + n) % n];
    const cur = curve[i];
    const next = curve[(i + 1) % n];
    if (cur > threshold && cur >= prev && cur > next) peaks++;
  }
  return peaks;
}
