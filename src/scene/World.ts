/**
 * The World ties the scene modules to the simulation.
 *
 * It advances the *visual* rotation phase (real Ω in physical mode; capped to a
 * viewable rate in educational mode, while the UI keeps showing the real spin),
 * updates every scene module from the current state, detects beam-crossing pulse
 * events to drive the audio, feeds the gravitational-lensing post pass, and keeps
 * a live intensity history for the light-curve charts.
 */

import * as THREE from 'three';
import type { Engine } from '../core/Engine.ts';
import type { AudioEngine } from '../audio/AudioEngine.ts';
import type { QualitySettings } from '../core/QualityManager.ts';
import { ResourceTracker } from '../core/Disposable.ts';
import type { AppState } from '../state/types.ts';
import {
  lightCurveIntensity,
  magneticAxis,
  observerDirection,
  sampleLightCurve,
} from '../physics/pulsar.ts';
import { clamp } from '../utils/math.ts';

import { NeutronStar } from './NeutronStar.ts';
import { Axes } from './Axes.ts';
import { MagneticField } from './MagneticField.ts';
import { Magnetosphere } from './Magnetosphere.ts';
import { PulsarBeams } from './PulsarBeams.ts';
import { LightCylinder } from './LightCylinder.ts';
import { Background } from './Background.ts';
import { Interior } from './Interior.ts';

/** Angular-velocity cap for educational mode (~0.4 Hz → a ~2.5 s period). */
const VIEW_CAP_OMEGA = 2.6;
const HISTORY = 512;

export class World {
  private tracker = new ResourceTracker();
  readonly star: NeutronStar;
  readonly axes: Axes;
  readonly field: MagneticField;
  readonly magnetosphere: Magnetosphere;
  readonly beams: PulsarBeams;
  readonly lightCylinder: LightCylinder;
  readonly background: Background;
  readonly interior: Interior;

  private liveGroup = new THREE.Group(); // everything except interior + background

  private _phase = 0;
  private prevIntensity = 0;
  private _intensity = 0;
  private history = new Float32Array(HISTORY);
  private historyIdx = 0;
  private pixelRatio = 1;

  // Scratch vectors reused each frame (no per-frame allocation).
  private vCenter = new THREE.Vector3();
  private vTmp = new THREE.Vector3();
  private vUp = new THREE.Vector3();
  private screen = new THREE.Vector2();

  constructor(
    private engine: Engine,
    private audio: AudioEngine,
  ) {
    this.star = new NeutronStar(this.tracker);
    this.axes = new Axes(this.tracker);
    this.field = new MagneticField(this.tracker);
    this.magnetosphere = new Magnetosphere(this.tracker);
    this.beams = new PulsarBeams(this.tracker);
    this.lightCylinder = new LightCylinder(this.tracker);
    this.background = new Background(this.tracker);
    this.interior = new Interior(this.tracker);

    this.liveGroup.add(
      this.star.group,
      this.axes.group,
      this.field.group,
      this.magnetosphere.group,
      this.beams.group,
      this.lightCylinder.group,
    );

    engine.scene.add(this.background.group);
    engine.scene.add(this.liveGroup);
    engine.scene.add(this.interior.group);
  }

  /** Reset the rotation phase to zero (transport "restart"). */
  resetPhase(): void {
    this._phase = 0;
    this.prevIntensity = 0;
    this.history.fill(0);
  }

  get phase(): number {
    return this._phase;
  }
  get intensity(): number {
    return this._intensity;
  }
  get intensityHistory(): Float32Array {
    return this.history;
  }
  get historyHead(): number {
    return this.historyIdx;
  }

  /** One full-rotation light-curve shape (for the static chart). */
  lightCurveShape(state: AppState): number[] {
    return sampleLightCurve(
      state.params.magneticInclination,
      state.observerInclination,
      state.beamWidth,
      180,
    );
  }

  /** Current magnetic-axis direction as a THREE vector (for the camera rig). */
  magneticAxisVec(state: AppState, out: THREE.Vector3): THREE.Vector3 {
    const a = magneticAxis(this._phase, state.params.magneticInclination);
    return out.set(a[0], a[1], a[2]);
  }
  observerDirVec(state: AppState, out: THREE.Vector3): THREE.Vector3 {
    const o = observerDirection(state.observerInclination);
    return out.set(o[0], o[1], o[2]);
  }

  applyQuality(q: QualitySettings, pixelRatio: number): void {
    this.pixelRatio = pixelRatio;
    this.star.setDetail(q.surfaceDetail);
    this.magnetosphere.setCount(q.particleCount);
    this.background.setStarCount(q.backgroundStars);
  }

  update(dt: number, elapsed: number, state: AppState): void {
    // ── advance the visual rotation phase ──────────────────────────────────
    const physOmega = state.derived.angularVelocity;
    const visOmega =
      state.rotationMode === 'educational' ? Math.min(physOmega, VIEW_CAP_OMEGA) : physOmega;
    if (state.playing) {
      this._phase += visOmega * state.timeScale * dt;
      if (this._phase > Math.PI * 2) this._phase -= Math.PI * 2;
    }

    // ── layer visibility & interior mode ───────────────────────────────────
    const interior = state.layers.interior;
    this.liveGroup.visible = !interior;
    this.interior.setVisible(interior);
    this.axes.setVisible(state.layers.axes && !interior);
    this.field.setVisible(state.layers.magneticField && !interior);
    this.magnetosphere.setVisible(state.layers.magnetosphere && !interior);
    this.beams.setVisible(state.layers.beams && !interior);
    this.lightCylinder.setVisible(state.layers.lightCylinder && !interior);

    // ── update scene modules ───────────────────────────────────────────────
    this.background.setMode(state.backgroundMode);
    this.background.update(elapsed, this.engine.camera, this.pixelRatio);

    if (interior) {
      this.interior.update(elapsed);
    } else {
      this.star.update(this._phase, state, elapsed);
      if (state.layers.axes) this.axes.update(this._phase, state.params.magneticInclination);
      if (state.layers.magneticField) this.field.update(this._phase, state);
      if (state.layers.magnetosphere)
        this.magnetosphere.update(this._phase, state, dt, this.pixelRatio);
      if (state.layers.beams) this.beams.update(this._phase, state, elapsed);
      if (state.layers.lightCylinder) this.lightCylinder.update(state);
    }

    // ── pulse detection → audio + intensity history ────────────────────────
    this._intensity = lightCurveIntensity(
      this._phase,
      state.params.magneticInclination,
      state.observerInclination,
      state.beamWidth,
    );
    const threshold = 0.5;
    if (
      this.prevIntensity < threshold &&
      this._intensity >= threshold &&
      state.audio.syncRotation
    ) {
      this.audio.triggerPulse(this._intensity, state.params.spinFrequency);
    }
    this.prevIntensity = this._intensity;
    this.history[this.historyIdx] = this._intensity;
    this.historyIdx = (this.historyIdx + 1) % HISTORY;

    // ── gravitational lensing uniforms ─────────────────────────────────────
    this.updateLensing(state, interior);
  }

  private updateLensing(state: AppState, interior: boolean): void {
    const active = state.layers.lensing && !interior;
    if (!active) {
      this.engine.setLensingEnabled(false);
      this.engine.updateLensing(this.screen, 0.15, 0, false);
      return;
    }
    this.engine.setLensingEnabled(true);

    const cam = this.engine.camera;
    // Star centre → screen uv.
    this.vCenter.set(0, 0, 0).project(cam);
    const cx = this.vCenter.x * 0.5 + 0.5;
    const cy = this.vCenter.y * 0.5 + 0.5;
    this.screen.set(cx, cy);

    // A point on the limb (camera-up * R) → screen, to measure projected radius.
    this.vUp.setFromMatrixColumn(cam.matrixWorld, 1).multiplyScalar(this.star.worldRadius);
    this.vTmp.copy(this.vUp).project(cam);
    const ty = this.vTmp.y * 0.5 + 0.5;
    const radius = clamp(Math.abs(ty - cy), 0.02, 0.9);

    // Strength ∝ r_s / R (compactness) — real, from the model.
    const strength = clamp(state.derived.schwarzschildRatio * 1.6, 0, 0.9);
    this.engine.updateLensing(this.screen, radius, strength, true);
  }

  dispose(): void {
    this.star.dispose();
    this.axes.dispose();
    this.field.dispose();
    this.magnetosphere.dispose();
    this.beams.dispose();
    this.lightCylinder.dispose();
    this.background.dispose();
    this.interior.dispose();
    this.tracker.disposeAll();
    this.engine.scene.remove(this.liveGroup, this.background.group, this.interior.group);
  }
}
