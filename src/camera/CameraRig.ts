/**
 * Camera system: one perspective camera driven through several distinct modes.
 *
 *  - orbit     : OrbitControls with inertia and a hard minimum distance so you
 *                cannot fly through the star.
 *  - free      : WASD/arrow fly-cam with adjustable speed and an optional lock on
 *                the star.
 *  - fixed     : a stable 3/4 vantage; the star rotates within the frame.
 *  - polar     : looking down the spin axis.
 *  - magnetic  : aligned with the (tilted, heavily-damped) magnetic axis.
 *  - equatorial: side-on in the rotation plane.
 *  - observer  : from the distant-observer line of sight — watch the pulse arrive.
 *  - cinematic : a scripted, eased fly-through that can be paused/resumed.
 *  - closeup   : extreme surface zoom with tightened near/far and reduced motion.
 *
 * Near/far planes are updated every frame from the distance to the surface so
 * close-ups keep depth precision (helped by the renderer's log depth buffer).
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { CameraMode } from '../state/types.ts';
import { damp } from '../utils/math.ts';

export interface CameraContext {
  starRadius: number;
  magneticAxis: THREE.Vector3;
  spinAxis: THREE.Vector3;
  observerDir: THREE.Vector3;
  reducedMotion: boolean;
}

interface Waypoint {
  pos: THREE.Vector3;
  target: THREE.Vector3;
  duration: number;
}

export class CameraRig {
  readonly controls: OrbitControls;
  private mode: CameraMode = 'orbit';
  private desiredPos = new THREE.Vector3(0, 2.5, 7);
  private desiredTarget = new THREE.Vector3(0, 0, 0);
  private currentTarget = new THREE.Vector3(0, 0, 0);
  private freeSpeed = 3;
  private keys = new Set<string>();
  private freeLock = true;

  // Cinematic timeline.
  private waypoints: Waypoint[] = [];
  private cineTime = 0;
  private cinePlaying = true;

  // Pointer look for free mode.
  private yaw = 0;
  private pitch = 0;
  private dragging = false;
  private lastPointer = new THREE.Vector2();

  constructor(
    private camera: THREE.PerspectiveCamera,
    private dom: HTMLElement,
  ) {
    this.controls = new OrbitControls(camera, dom);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 1.6;
    this.controls.maxDistance = 60;
    this.controls.rotateSpeed = 0.7;
    this.controls.zoomSpeed = 0.9;

    this.buildCinematic();

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    dom.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointermove', this.onPointerMove);
  }

  getMode(): CameraMode {
    return this.mode;
  }

  setMode(mode: CameraMode): void {
    this.mode = mode;
    const orbitLike = mode === 'orbit';
    this.controls.enabled = orbitLike;

    if (mode === 'free') {
      // Seed yaw/pitch from the current orientation.
      const dir = new THREE.Vector3();
      this.camera.getWorldDirection(dir);
      this.yaw = Math.atan2(dir.x, dir.z);
      this.pitch = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));
    }
    if (mode === 'cinematic') {
      this.cineTime = 0;
      this.cinePlaying = true;
    }
    if (orbitLike) {
      this.controls.target.copy(this.currentTarget);
      this.controls.update();
    }
  }

  setFreeSpeed(s: number): void {
    this.freeSpeed = s;
  }

  setFreeLock(lock: boolean): void {
    this.freeLock = lock;
  }

  toggleCinematic(): void {
    this.cinePlaying = !this.cinePlaying;
  }

  /** Snap back to a comfortable, safe orbit vantage. */
  resetToSafe(): void {
    this.setMode('orbit');
    this.desiredPos.set(0, 2.5, 7);
    this.desiredTarget.set(0, 0, 0);
    this.camera.position.copy(this.desiredPos);
    this.currentTarget.set(0, 0, 0);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  update(dt: number, ctx: CameraContext): void {
    const R = ctx.starRadius;

    switch (this.mode) {
      case 'orbit':
        this.controls.minDistance = R * 1.5;
        this.controls.update();
        this.currentTarget.copy(this.controls.target);
        break;

      case 'free':
        this.updateFree(dt, R);
        break;

      case 'fixed':
        this.scriptTo(new THREE.Vector3(4.5, 2.2, 5.5), new THREE.Vector3(0, 0, 0), dt, 2.5);
        break;

      case 'polar':
        this.scriptTo(new THREE.Vector3(0, 6.5, 0.001), new THREE.Vector3(0, 0, 0), dt, 2.5);
        break;

      case 'magnetic': {
        const d = ctx.magneticAxis.clone().multiplyScalar(6.5);
        this.scriptTo(d, new THREE.Vector3(0, 0, 0), dt, 1.2); // heavy damping
        break;
      }

      case 'equatorial':
        this.scriptTo(new THREE.Vector3(6.5, 0.0, 0.001), new THREE.Vector3(0, 0, 0), dt, 2.5);
        break;

      case 'observer': {
        const d = ctx.observerDir.clone().multiplyScalar(7.5);
        this.scriptTo(d, new THREE.Vector3(0, 0, 0), dt, 2.0);
        break;
      }

      case 'closeup':
        this.scriptTo(
          new THREE.Vector3(0.15, 0.35, R * 1.35),
          new THREE.Vector3(0, 0.1, 0),
          dt,
          ctx.reducedMotion ? 1.0 : 1.8,
        );
        break;

      case 'cinematic':
        this.updateCinematic(dt);
        break;
    }

    this.updateNearFar(R);
  }

  /** Drive the camera toward a scripted pose with exponential damping. */
  private scriptTo(pos: THREE.Vector3, target: THREE.Vector3, dt: number, lambda: number): void {
    this.desiredPos.copy(pos);
    this.desiredTarget.copy(target);
    this.camera.position.x = damp(this.camera.position.x, pos.x, lambda, dt);
    this.camera.position.y = damp(this.camera.position.y, pos.y, lambda, dt);
    this.camera.position.z = damp(this.camera.position.z, pos.z, lambda, dt);
    this.currentTarget.x = damp(this.currentTarget.x, target.x, lambda, dt);
    this.currentTarget.y = damp(this.currentTarget.y, target.y, lambda, dt);
    this.currentTarget.z = damp(this.currentTarget.z, target.z, lambda, dt);
    this.camera.lookAt(this.currentTarget);
  }

  private updateFree(dt: number, R: number): void {
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    const right = new THREE.Vector3().crossVectors(forward, this.camera.up).normalize();
    const move = new THREE.Vector3();
    const s = this.freeSpeed * dt;
    if (this.keys.has('w') || this.keys.has('arrowup')) move.addScaledVector(forward, s);
    if (this.keys.has('s') || this.keys.has('arrowdown')) move.addScaledVector(forward, -s);
    if (this.keys.has('a') || this.keys.has('arrowleft')) move.addScaledVector(right, -s);
    if (this.keys.has('d') || this.keys.has('arrowright')) move.addScaledVector(right, s);
    if (this.keys.has('q')) move.y -= s;
    if (this.keys.has('e')) move.y += s;
    this.camera.position.add(move);

    // Collision: never enter the star.
    const dist = this.camera.position.length();
    if (dist < R * 1.25) this.camera.position.setLength(R * 1.25);

    if (this.freeLock) {
      this.camera.lookAt(0, 0, 0);
      this.currentTarget.set(0, 0, 0);
    } else {
      const dir = new THREE.Vector3(
        Math.sin(this.yaw) * Math.cos(this.pitch),
        Math.sin(this.pitch),
        Math.cos(this.yaw) * Math.cos(this.pitch),
      );
      this.currentTarget.copy(this.camera.position).add(dir);
      this.camera.lookAt(this.currentTarget);
    }
  }

  private buildCinematic(): void {
    // Approach → orbit → magnetic-axis reveal → pole → pull back to the galaxy.
    this.waypoints = [
      { pos: new THREE.Vector3(0, 1.5, 26), target: new THREE.Vector3(0, 0, 0), duration: 4 },
      { pos: new THREE.Vector3(5, 2.5, 8), target: new THREE.Vector3(0, 0, 0), duration: 5 },
      { pos: new THREE.Vector3(-4, 4.5, 6), target: new THREE.Vector3(0, 0, 0), duration: 5 },
      { pos: new THREE.Vector3(0.4, 0.6, 2.4), target: new THREE.Vector3(0, 0.1, 0), duration: 5 },
      { pos: new THREE.Vector3(0, 7, 3), target: new THREE.Vector3(0, 0, 0), duration: 5 },
      { pos: new THREE.Vector3(2, 3, 18), target: new THREE.Vector3(0, 0, 0), duration: 6 },
    ];
  }

  private updateCinematic(dt: number): void {
    if (this.cinePlaying) this.cineTime += dt;
    const total = this.waypoints.reduce((s, w) => s + w.duration, 0);
    let t = this.cineTime % total;
    let i = 0;
    while (i < this.waypoints.length && t > this.waypoints[i].duration) {
      t -= this.waypoints[i].duration;
      i++;
    }
    const a = this.waypoints[i % this.waypoints.length];
    const b = this.waypoints[(i + 1) % this.waypoints.length];
    const k = smootherstep(t / a.duration);
    this.camera.position.lerpVectors(a.pos, b.pos, k);
    this.currentTarget.lerpVectors(a.target, b.target, k);
    this.camera.lookAt(this.currentTarget);
  }

  private updateNearFar(R: number): void {
    const dist = this.camera.position.distanceTo(this.currentTarget);
    const surface = Math.max(0.002, dist - R);
    this.camera.near = THREE.MathUtils.clamp(surface * 0.05, 0.001, 1);
    this.camera.far = Math.max(2000, dist * 20);
    this.camera.updateProjectionMatrix();
  }

  getTarget(): THREE.Vector3 {
    return this.currentTarget;
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    this.keys.add(e.key.toLowerCase());
  };
  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.key.toLowerCase());
  };
  private onPointerDown = (e: PointerEvent): void => {
    if (this.mode !== 'free' || this.freeLock) return;
    this.dragging = true;
    this.lastPointer.set(e.clientX, e.clientY);
  };
  private onPointerUp = (): void => {
    this.dragging = false;
  };
  private onPointerMove = (e: PointerEvent): void => {
    if (!this.dragging || this.mode !== 'free' || this.freeLock) return;
    const dx = e.clientX - this.lastPointer.x;
    const dy = e.clientY - this.lastPointer.y;
    this.lastPointer.set(e.clientX, e.clientY);
    this.yaw -= dx * 0.005;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * 0.005, -1.4, 1.4);
  };

  dispose(): void {
    this.controls.dispose();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.dom.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointermove', this.onPointerMove);
  }
}

function smootherstep(x: number): number {
  x = THREE.MathUtils.clamp(x, 0, 1);
  return x * x * x * (x * (x * 6 - 15) + 10);
}
