/**
 * Graphics-quality tiers and adaptive scaling.
 *
 * Each named tier maps to a concrete {@link QualitySettings} block that the
 * scene reads (particle counts, field-line counts, whether bloom/lensing run,
 * pixel-ratio ceiling…). In "adaptive" mode a running FPS estimate nudges an
 * internal scale up or down to hold a target frame rate without thrashing.
 */

import type { QualityLevel } from '../state/types';
import type { Capabilities } from './capabilities';
import { clamp } from '../utils/math';

export interface QualitySettings {
  /** Upper bound on renderer pixel ratio. */
  pixelRatio: number;
  /** Number of magnetosphere particles. */
  particleCount: number;
  /** Number of magnetic field lines per hemisphere family. */
  fieldLines: number;
  /** Samples along each field line. */
  fieldLineSegments: number;
  /** Surface sphere subdivisions (icosphere detail). */
  surfaceDetail: number;
  /** Enable post-processing bloom. */
  bloom: boolean;
  /** Enable gravitational-lensing post pass. */
  lensing: boolean;
  /** Enable the aperture starburst / anamorphic flare pass. */
  starburst: boolean;
  /** Number of stars in the procedural background. */
  backgroundStars: number;
  /** Enable soft shadows / extra lights. */
  richLighting: boolean;
  /** MSAA sample count target (0 = rely on post AA). */
  msaa: number;
}

/**
 * Tiers are pitched higher than in the earlier build: this is a piece meant to be
 * looked at, so bloom and the starburst survive even on `low` (they are cheap
 * screen-space passes and they are most of the look), and the things that
 * actually cost frames — pixel ratio, particle count, star count — carry the
 * scaling instead.
 */
const TIERS: Record<Exclude<QualityLevel, 'adaptive'>, QualitySettings> = {
  low: {
    pixelRatio: 1,
    particleCount: 2500,
    fieldLines: 8,
    fieldLineSegments: 56,
    surfaceDetail: 6,
    bloom: true,
    lensing: false,
    starburst: true,
    backgroundStars: 8000,
    richLighting: false,
    msaa: 0,
  },
  medium: {
    pixelRatio: 1.5,
    particleCount: 7000,
    fieldLines: 12,
    fieldLineSegments: 80,
    surfaceDetail: 7,
    bloom: true,
    lensing: true,
    starburst: true,
    backgroundStars: 16000,
    richLighting: true,
    msaa: 4,
  },
  high: {
    pixelRatio: 2,
    particleCount: 14000,
    fieldLines: 18,
    fieldLineSegments: 112,
    surfaceDetail: 8,
    bloom: true,
    lensing: true,
    starburst: true,
    backgroundStars: 30000,
    richLighting: true,
    msaa: 4,
  },
  ultra: {
    pixelRatio: 2.5,
    particleCount: 24000,
    fieldLines: 24,
    fieldLineSegments: 144,
    surfaceDetail: 8,
    bloom: true,
    lensing: true,
    starburst: true,
    backgroundStars: 45000,
    richLighting: true,
    msaa: 8,
  },
};

export class QualityManager {
  private level: QualityLevel;
  private adaptiveScale = 1;
  private fpsAvg = 60;
  private readonly targetFps = 55;
  private cooldown = 0;
  private baseTierForAdaptive: Exclude<QualityLevel, 'adaptive'>;
  private onChange?: (s: QualitySettings) => void;

  constructor(
    initial: QualityLevel,
    private caps: Capabilities,
  ) {
    this.level = initial;
    this.baseTierForAdaptive =
      caps.tier === 'high' ? 'high' : caps.tier === 'low' ? 'low' : 'medium';
  }

  setLevel(level: QualityLevel): void {
    this.level = level;
    this.adaptiveScale = 1;
    this.onChange?.(this.settings());
  }

  getLevel(): QualityLevel {
    return this.level;
  }

  onSettingsChange(cb: (s: QualitySettings) => void): void {
    this.onChange = cb;
  }

  /** Resolve the current concrete settings, applying the adaptive scale. */
  settings(): QualitySettings {
    const base =
      this.level === 'adaptive' ? TIERS[this.baseTierForAdaptive] : TIERS[this.level];
    if (this.level !== 'adaptive') return { ...base };

    // Scale the expensive knobs by the adaptive factor. Bloom and the starburst
    // are never dropped — they carry the look, and they are screen-space passes
    // whose cost does not grow with the scene.
    const s = clamp(this.adaptiveScale, 0.4, 1);
    return {
      ...base,
      pixelRatio: clamp(base.pixelRatio * s, 0.75, base.pixelRatio),
      particleCount: Math.round(base.particleCount * s),
      fieldLines: Math.max(8, Math.round(base.fieldLines * s)),
      backgroundStars: Math.round(base.backgroundStars * (0.6 + 0.4 * s)),
      lensing: base.lensing && s > 0.65,
    };
  }

  /**
   * Feed a frame delta (seconds) to the adaptive controller. Returns true when
   * the effective settings changed enough to warrant a renderer reconfigure.
   */
  update(dt: number): boolean {
    if (this.level !== 'adaptive' || dt <= 0) return false;
    const fps = 1 / dt;
    // Exponential moving average, ignoring pathological spikes (tab switches).
    if (fps > 5 && fps < 240) this.fpsAvg = this.fpsAvg * 0.9 + fps * 0.1;

    this.cooldown -= dt;
    if (this.cooldown > 0) return false;

    const prev = this.adaptiveScale;
    if (this.fpsAvg < this.targetFps - 6) {
      this.adaptiveScale = clamp(this.adaptiveScale - 0.1, 0.4, 1);
      this.cooldown = 1.5;
    } else if (this.fpsAvg > this.targetFps + 8 && this.adaptiveScale < 1) {
      this.adaptiveScale = clamp(this.adaptiveScale + 0.05, 0.4, 1);
      this.cooldown = 2.5;
    }
    if (this.adaptiveScale !== prev) {
      this.onChange?.(this.settings());
      return true;
    }
    return false;
  }

  get fps(): number {
    return this.fpsAvg;
  }

  get capabilities(): Capabilities {
    return this.caps;
  }
}
