/**
 * The World ties the scene modules to the simulation.
 *
 * It advances the visual rotation phase, updates every module from the current
 * state, and feeds the gravitational-lensing post pass. The schematic layers of
 * the earlier build (axes, light cylinder, interior cutaway, labels) are gone —
 * everything that remains is here because it reads as a physical object.
 */

import * as THREE from 'three';
import type { Engine } from '../core/Engine.ts';
import type { QualitySettings } from '../core/QualityManager.ts';
import { ResourceTracker } from '../core/Disposable.ts';
import type { AppState } from '../state/types.ts';
import { magneticAxis } from '../physics/pulsar.ts';
import { clamp } from '../utils/math.ts';

import { NeutronStar } from './NeutronStar.ts';
import { Corona } from './Corona.ts';
import { MagneticField } from './MagneticField.ts';
import { Magnetosphere } from './Magnetosphere.ts';
import { PulsarBeams } from './PulsarBeams.ts';
import { Background } from './Background.ts';

/**
 * Base angular velocity for the visual spin, in rad/s, at speed 1×. The real
 * spin of the canonical preset is 2 Hz, which strobes rather than reads; this is
 * a viewable stand-in that the speed control scales.
 */
const BASE_OMEGA = 0.62;

export class World {
  private tracker = new ResourceTracker();
  readonly star: NeutronStar;
  readonly corona: Corona;
  readonly field: MagneticField;
  readonly magnetosphere: Magnetosphere;
  readonly beams: PulsarBeams;
  readonly background: Background;

  private _phase = 0;
  private pixelRatio = 1;

  // Scratch vectors reused each frame (no per-frame allocation).
  private vCenter = new THREE.Vector3();
  private vTmp = new THREE.Vector3();
  private vUp = new THREE.Vector3();
  private screen = new THREE.Vector2();

  constructor(private engine: Engine) {
    this.star = new NeutronStar(this.tracker);
    this.corona = new Corona(this.tracker);
    this.field = new MagneticField(this.tracker);
    this.magnetosphere = new Magnetosphere(this.tracker);
    this.beams = new PulsarBeams(this.tracker);
    this.background = new Background(this.tracker);

    engine.scene.add(
      this.background.group,
      this.star.group,
      this.corona.group,
      this.field.group,
      this.magnetosphere.group,
      this.beams.group,
    );
  }

  get phase(): number {
    return this._phase;
  }

  /** Current magnetic-axis direction as a THREE vector. */
  magneticAxisVec(state: AppState, out: THREE.Vector3): THREE.Vector3 {
    const a = magneticAxis(this._phase, state.params.magneticInclination);
    return out.set(a[0], a[1], a[2]);
  }

  applyQuality(q: QualitySettings, pixelRatio: number): void {
    this.pixelRatio = pixelRatio;
    this.star.setDetail(q.surfaceDetail);
    this.magnetosphere.setCount(q.particleCount);
    this.background.setStarCount(q.backgroundStars);
    this.field.setDensity(q.fieldLines, q.fieldLineSegments);
  }

  update(dt: number, elapsed: number, state: AppState): void {
    if (state.playing) {
      this._phase += BASE_OMEGA * state.speed * dt;
      if (this._phase > Math.PI * 2) this._phase -= Math.PI * 2;
    }

    this.background.update(elapsed, this.engine.camera, this.pixelRatio);
    this.star.update(this._phase, state, elapsed);
    this.corona.update(state, this.engine.camera, elapsed);
    this.field.update(this._phase, state);
    this.magnetosphere.update(this._phase, state, dt, this.pixelRatio);
    this.beams.update(this._phase, state, elapsed);

    this.updateLensing(state);
  }

  private updateLensing(state: AppState): void {
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
    this.engine.setLensingEnabled(true);
    this.engine.updateLensing(this.screen, radius, strength, true);
    // The starburst pass needs to know where the star is on screen, and how big
    // it looks, so its streaks originate from the source rather than the centre.
    this.engine.updateStarburst(this.screen, radius);
  }

  dispose(): void {
    this.star.dispose();
    this.corona.dispose();
    this.field.dispose();
    this.magnetosphere.dispose();
    this.beams.dispose();
    this.background.dispose();
    this.tracker.disposeAll();
    this.engine.scene.remove(
      this.background.group,
      this.star.group,
      this.corona.group,
      this.field.group,
      this.magnetosphere.group,
      this.beams.group,
    );
  }
}
