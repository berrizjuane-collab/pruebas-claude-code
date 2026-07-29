/**
 * Camera rig.
 *
 * One orbital state — azimuth, elevation, radius — shared by both camera modes,
 * which is what makes the angle presets and the mode switch compose instead of
 * fighting each other:
 *
 *  - `free`  : the pointer drives azimuth/elevation, the wheel (or a pinch)
 *              drives radius, with inertia and exponential damping.
 *  - `fixed` : input is ignored outright. The rig eases to the selected pose and
 *              then holds it exactly, so the star rotates within a locked frame.
 *
 * Choosing an angle sets the target pose in either mode: in `free` you land there
 * and can keep moving; in `fixed` you land there and stay. There is no separate
 * "mode" per angle, so no combination can leave the camera in a state where the
 * controls appear dead.
 *
 * OrbitControls is deliberately not used. Its `enabled` flag still mutates the
 * camera through damping for a frame or two after being switched off, which is
 * exactly the class of bug that makes a locked shot drift.
 */

import * as THREE from 'three';
import { clamp, damp } from '../utils/math.ts';

export type CameraMode = 'free' | 'fixed';
export type ViewAngle = 'threeQuarter' | 'equatorial' | 'polar' | 'wide';

export interface Pose {
  azimuth: number;
  elevation: number;
  radius: number;
}

/** The four framings offered in the UI. All static, so `fixed` is truly fixed. */
export const POSES: Record<ViewAngle, Pose> = {
  threeQuarter: { azimuth: 0.60, elevation: 0.28, radius: 5.6 },
  equatorial: { azimuth: 1.28, elevation: 0.02, radius: 4.9 },
  polar: { azimuth: 0.45, elevation: 1.34, radius: 6.4 },
  wide: { azimuth: 0.95, elevation: 0.18, radius: 14.0 },
};

export const ANGLE_LABELS: Record<ViewAngle, string> = {
  threeQuarter: 'Three-quarter',
  equatorial: 'Equatorial',
  polar: 'Polar',
  wide: 'Wide',
};

const MIN_ELEVATION = -1.45;
const MAX_ELEVATION = 1.45;
const MIN_RADIUS = 1.55;
const MAX_RADIUS = 90;

export interface CameraContext {
  starRadius: number;
}

export class CameraRig {
  private mode: CameraMode = 'free';
  private angle: ViewAngle = 'threeQuarter';

  // Current (rendered) and target (desired) orbital state.
  private azimuth: number;
  private elevation: number;
  private radius: number;
  private tAzimuth: number;
  private tElevation: number;
  private tRadius: number;

  // Drag inertia, in radians per second.
  private velAzimuth = 0;
  private velElevation = 0;

  /** Seconds left of the slow opening push-in; 0 once the intro is over. */
  private introT = 0;

  // Pointer bookkeeping. A Map keyed by pointerId so a pinch cannot be confused
  // by a stray pointer that never fired its up event.
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchDist = 0;
  private target = new THREE.Vector3(0, 0, 0);

  constructor(
    private camera: THREE.PerspectiveCamera,
    private dom: HTMLElement,
  ) {
    const p = POSES.threeQuarter;
    this.azimuth = this.tAzimuth = p.azimuth;
    this.elevation = this.tElevation = p.elevation;
    this.radius = this.tRadius = p.radius;
    this.applyToCamera();

    dom.addEventListener('pointerdown', this.onPointerDown);
    dom.addEventListener('pointermove', this.onPointerMove);
    dom.addEventListener('pointerup', this.onPointerUp);
    dom.addEventListener('pointercancel', this.onPointerUp);
    dom.addEventListener('pointerleave', this.onPointerUp);
    dom.addEventListener('wheel', this.onWheel, { passive: false });
  }

  getMode(): CameraMode {
    return this.mode;
  }

  getAngle(): ViewAngle {
    return this.angle;
  }

  setMode(mode: CameraMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    // Leaving free mode must not carry drag inertia into the locked shot, and
    // the pose is re-asserted so `fixed` always converges on the exact framing
    // even if the user had dragged away from it.
    this.velAzimuth = 0;
    this.velElevation = 0;
    this.pointers.clear();
    if (mode === 'fixed') this.applyPose(this.angle);
    this.dom.style.cursor = mode === 'free' ? 'grab' : 'default';
  }

  /** Select a framing. Applies in both modes. */
  setAngle(angle: ViewAngle): void {
    this.angle = angle;
    this.applyPose(angle);
  }

  private applyPose(angle: ViewAngle): void {
    const p = POSES[angle];
    this.tRadius = p.radius;
    this.tElevation = p.elevation;
    // Approach the target azimuth by the short way round, so a preset never
    // sends the camera the long way about the star.
    this.tAzimuth = this.azimuth + shortestAngle(this.azimuth, p.azimuth);
    this.velAzimuth = 0;
    this.velElevation = 0;
  }

  /**
   * Start far out and low, so the opening is a slow push-in toward the selected
   * pose. Only the *current* state is moved — the target is already the pose, so
   * the existing damping does the whole move with no separate animation path to
   * get out of sync with the controls.
   */
  beginIntro(seconds = 7): void {
    this.radius = Math.max(this.tRadius * 4.5, 34);
    this.elevation = this.tElevation * 0.25 - 0.06;
    this.azimuth = this.tAzimuth - 0.5;
    this.introT = seconds;
    this.applyToCamera();
  }

  /** True once the rig has essentially reached its target pose. */
  get settled(): boolean {
    return (
      Math.abs(this.azimuth - this.tAzimuth) < 1e-4 &&
      Math.abs(this.elevation - this.tElevation) < 1e-4 &&
      Math.abs(this.radius - this.tRadius) < 1e-3
    );
  }

  update(dt: number, ctx: CameraContext): void {
    const R = ctx.starRadius;

    if (this.mode === 'free') {
      // Coast on release, then bleed the velocity off.
      if (this.pointers.size === 0) {
        this.tAzimuth += this.velAzimuth * dt;
        this.tElevation = clamp(
          this.tElevation + this.velElevation * dt,
          MIN_ELEVATION,
          MAX_ELEVATION,
        );
        const decay = Math.exp(-4.5 * dt);
        this.velAzimuth *= decay;
        this.velElevation *= decay;
        if (Math.abs(this.velAzimuth) < 1e-4) this.velAzimuth = 0;
        if (Math.abs(this.velElevation) < 1e-4) this.velElevation = 0;
      }
    }

    // Never let the camera reach the surface, whatever the mode or the preset.
    const minR = Math.max(MIN_RADIUS, R * 1.5);
    this.tRadius = clamp(this.tRadius, minR, MAX_RADIUS);

    // A much softer constant during the opening, so the arrival is a long glide
    // rather than a snap. Any drag or wheel input cancels it immediately.
    if (this.introT > 0) {
      this.introT = Math.max(0, this.introT - dt);
      if (this.pointers.size > 0) this.introT = 0;
    }
    const lambda = this.introT > 0 ? 0.42 : this.mode === 'fixed' ? 2.2 : 7.0;
    this.azimuth = damp(this.azimuth, this.tAzimuth, lambda, dt);
    this.elevation = damp(this.elevation, this.tElevation, lambda, dt);
    this.radius = damp(this.radius, this.tRadius, lambda, dt);

    // Snap once inside a pixel of the target so a locked shot is bit-stable and
    // the star is the only thing moving in frame.
    if (Math.abs(this.azimuth - this.tAzimuth) < 1e-4) this.azimuth = this.tAzimuth;
    if (Math.abs(this.elevation - this.tElevation) < 1e-4) this.elevation = this.tElevation;
    if (Math.abs(this.radius - this.tRadius) < 1e-3) this.radius = this.tRadius;

    this.applyToCamera();
    this.updateNearFar(R);
  }

  private applyToCamera(): void {
    const ce = Math.cos(this.elevation);
    this.camera.position.set(
      this.radius * ce * Math.sin(this.azimuth),
      this.radius * Math.sin(this.elevation),
      this.radius * ce * Math.cos(this.azimuth),
    );
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.target);
  }

  private updateNearFar(R: number): void {
    const surface = Math.max(0.002, this.radius - R);
    this.camera.near = clamp(surface * 0.04, 0.001, 1);
    this.camera.far = Math.max(4000, this.radius * 20);
    this.camera.updateProjectionMatrix();
  }

  getTarget(): THREE.Vector3 {
    return this.target;
  }

  /** Distance from the camera to the star's centre, for the UI and post passes. */
  get distance(): number {
    return this.radius;
  }

  /** Current orbital state. Used by tests to assert that `fixed` really locks. */
  get pose(): Pose {
    return { azimuth: this.azimuth, elevation: this.elevation, radius: this.radius };
  }

  // ── input ─────────────────────────────────────────────────────────────────

  private onPointerDown = (e: PointerEvent): void => {
    if (this.mode !== 'free') return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.velAzimuth = 0;
    this.velElevation = 0;
    if (this.pointers.size === 2) this.pinchDist = this.currentPinchDistance();
    this.dom.style.cursor = 'grabbing';
    this.dom.setPointerCapture?.(e.pointerId);
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (this.mode !== 'free') return;
    const prev = this.pointers.get(e.pointerId);
    if (!prev) return;

    if (this.pointers.size >= 2) {
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const d = this.currentPinchDistance();
      if (this.pinchDist > 0 && d > 0) {
        this.tRadius = clamp(this.tRadius * (this.pinchDist / d), MIN_RADIUS, MAX_RADIUS);
      }
      this.pinchDist = d;
      return;
    }

    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Scale with viewport size so a drag traverses the same arc on any display.
    const k = 2.6 / Math.max(1, this.dom.clientHeight || window.innerHeight);
    const dAz = -dx * k;
    const dEl = dy * k;
    this.tAzimuth += dAz;
    this.tElevation = clamp(this.tElevation + dEl, MIN_ELEVATION, MAX_ELEVATION);
    // Feed inertia from the instantaneous drag rate.
    this.velAzimuth = dAz * 9;
    this.velElevation = dEl * 9;
  };

  private onPointerUp = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinchDist = 0;
    if (this.pointers.size === 0 && this.mode === 'free') this.dom.style.cursor = 'grab';
  };

  private onWheel = (e: WheelEvent): void => {
    if (this.mode !== 'free') return;
    e.preventDefault();
    this.introT = 0; // taking control ends the opening glide
    // Multiplicative so the zoom feels the same near the surface and far out.
    const factor = Math.exp(clamp(e.deltaY, -240, 240) * 0.0013);
    this.tRadius = clamp(this.tRadius * factor, MIN_RADIUS, MAX_RADIUS);
  };

  private currentPinchDistance(): number {
    const pts = [...this.pointers.values()];
    if (pts.length < 2) return 0;
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  dispose(): void {
    this.dom.removeEventListener('pointerdown', this.onPointerDown);
    this.dom.removeEventListener('pointermove', this.onPointerMove);
    this.dom.removeEventListener('pointerup', this.onPointerUp);
    this.dom.removeEventListener('pointercancel', this.onPointerUp);
    this.dom.removeEventListener('pointerleave', this.onPointerUp);
    this.dom.removeEventListener('wheel', this.onWheel);
  }
}

/** Signed smallest rotation from `from` to `to`, in (-π, π]. */
function shortestAngle(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}
