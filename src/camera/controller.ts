/**
 * Control de cámara: OrbitControls (ratón, táctil, amortiguación) + restricciones
 * propias tras cada actualización + transiciones planificadas e interrumpibles.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CAMERA } from '../config/camera.ts';
import { clampTarget, constrainCamera, minDistanceFor, type CameraLimits, type TerrainQueries } from './constraints.ts';
import { easeInOutCubic, planTransition, type Pose, type TransitionPlan } from './transitions.ts';

export { poseFromSpecPure as poseFromSpec } from './poseMath.ts';

export class CameraController {
  readonly controls: OrbitControls;
  private transition: { plan: TransitionPlan; t0: number; duration: number; resolve: () => void } | null = null;
  private lastTargetXZ = new THREE.Vector2();
  reducedMotion = false;
  onUserInteraction: () => void = () => {};

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    readonly dom: HTMLElement,
    readonly limits: CameraLimits,
    readonly terrain: TerrainQueries,
  ) {
    const c = new OrbitControls(camera, dom);
    c.enableDamping = true;
    c.dampingFactor = CAMERA.dampingFactor;
    c.screenSpacePanning = false;
    c.rotateSpeed = 0.55;
    c.zoomSpeed = 0.9;
    c.panSpeed = 0.8;
    c.minPolarAngle = limits.minPolar;
    c.maxPolarAngle = limits.maxPolar;
    c.minDistance = limits.minDistance;
    c.maxDistance = limits.maxDistance;
    c.autoRotateSpeed = CAMERA.autoRotateSpeed;
    c.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    c.addEventListener('start', () => {
      this.cancelTransition();
      this.onUserInteraction();
    });
    this.controls = c;
    dom.addEventListener('wheel', this.cancelOnInput, { passive: true });
  }

  private cancelOnInput = () => this.cancelTransition();

  get animating(): boolean {
    return this.transition !== null || this.controls.autoRotate;
  }

  setPose(p: Pose): void {
    this.controls.target.set(p.target.x, p.target.y, p.target.z);
    this.camera.position.set(p.position.x, p.position.y, p.position.z);
    this.camera.lookAt(this.controls.target);
    this.lastTargetXZ.set(p.target.x, p.target.z);
    this.applyConstraints();
  }

  currentPose(): Pose {
    const t = this.controls.target;
    const p = this.camera.position;
    return { target: { x: t.x, y: t.y, z: t.z }, position: { x: p.x, y: p.y, z: p.z } };
  }

  /** Vuela a una pose. Respeta prefers-reduced-motion (salto directo). */
  flyTo(to: Pose, duration: number = CAMERA.transitionMs): Promise<void> {
    this.cancelTransition();
    const target = clampTarget(to.target, this.limits, this.terrain);
    const end = { target, position: constrainCamera(to.position, target, this.limits, this.terrain) };
    if (this.reducedMotion || duration <= 0) {
      this.setPose(end);
      return Promise.resolve();
    }
    const plan = planTransition(this.currentPose(), end, this.limits, this.terrain);
    return new Promise((resolve) => {
      this.transition = { plan, t0: performance.now(), duration, resolve };
    });
  }

  cancelTransition(): void {
    if (this.transition) {
      const r = this.transition.resolve;
      this.transition = null;
      r();
    }
  }

  setAutoRotate(on: boolean): void {
    this.controls.autoRotate = on && !this.reducedMotion;
  }

  /** Acercar/alejar con botones o teclado (factor < 1 acerca). */
  dolly(factor: number): void {
    const p = this.currentPose();
    const dir = new THREE.Vector3(p.position.x - p.target.x, p.position.y - p.target.y, p.position.z - p.target.z);
    const d = dir.length();
    const nd = Math.min(this.limits.maxDistance, Math.max(minDistanceFor(p.target, this.limits), d * factor));
    dir.setLength(nd);
    void this.flyTo({ target: p.target, position: { x: p.target.x + dir.x, y: p.target.y + dir.y, z: p.target.z + dir.z } }, 420);
  }

  /** Gira alrededor del objetivo (teclado). */
  orbit(dAzimuthDeg: number, dPolarDeg: number): void {
    const p = this.currentPose();
    const off = new THREE.Vector3(p.position.x - p.target.x, p.position.y - p.target.y, p.position.z - p.target.z);
    const s = new THREE.Spherical().setFromVector3(off);
    s.theta += (dAzimuthDeg * Math.PI) / 180;
    s.phi = Math.min(this.limits.maxPolar, Math.max(this.limits.minPolar, s.phi + (dPolarDeg * Math.PI) / 180));
    off.setFromSpherical(s);
    void this.flyTo({ target: p.target, position: { x: p.target.x + off.x, y: p.target.y + off.y, z: p.target.z + off.z } }, 260);
  }

  /** Orienta la vista al norte geográfico (la cámara se coloca al sur del objetivo). */
  orientNorth(): void {
    const p = this.currentPose();
    const off = new THREE.Vector3(p.position.x - p.target.x, p.position.y - p.target.y, p.position.z - p.target.z);
    const h = Math.hypot(off.x, off.z);
    void this.flyTo({ target: p.target, position: { x: p.target.x, y: p.target.y + off.y, z: p.target.z + h } }, 700);
  }

  /** Actualiza un fotograma. Devuelve true si la cámara se movió. */
  update(now: number): boolean {
    const before = this.camera.position.clone();
    const tBefore = this.controls.target.clone();
    if (this.transition) {
      const { plan, t0, duration } = this.transition;
      const u = Math.min(1, (now - t0) / duration);
      const pose = plan.poseAt(easeInOutCubic(u));
      this.controls.target.set(pose.target.x, pose.target.y, pose.target.z);
      this.camera.position.set(pose.position.x, pose.position.y, pose.position.z);
      this.applyConstraints();
      this.camera.lookAt(this.controls.target);
      if (u >= 1) {
        const r = this.transition.resolve;
        this.transition = null;
        // sincroniza el estado interno de OrbitControls con la pose final
        this.controls.update();
        r();
      }
    } else {
      this.controls.minDistance = minDistanceFor(this.controls.target, this.limits);
      this.controls.update();
      this.followTerrainOnPan();
      this.applyConstraints();
    }
    return before.distanceToSquared(this.camera.position) > 1e-6 || tBefore.distanceToSquared(this.controls.target) > 1e-6;
  }

  /** Al desplazar el objetivo, que se deslice sobre el relieve en vez de flotar. */
  private followTerrainOnPan(): void {
    const t = this.controls.target;
    const moved = Math.hypot(t.x - this.lastTargetXZ.x, t.z - this.lastTargetXZ.y);
    if (moved > 0.5) {
      const ground = this.terrain.heightY(t.x, t.z) + 40;
      const dy = (ground - t.y) * 0.25;
      t.y += dy;
      this.camera.position.y += dy;
    }
    this.lastTargetXZ.set(t.x, t.z);
  }

  private applyConstraints(): void {
    const t = clampTarget(this.controls.target, this.limits, this.terrain);
    const dt = new THREE.Vector3(t.x - this.controls.target.x, t.y - this.controls.target.y, t.z - this.controls.target.z);
    if (dt.lengthSq() > 0) {
      this.controls.target.set(t.x, t.y, t.z);
      this.camera.position.add(dt);
    }
    const c = constrainCamera(this.camera.position, t, this.limits, this.terrain);
    this.camera.position.set(c.x, c.y, c.z);
  }

  /** Altura de la cámara sobre el terreno (m), para planos de recorte y diagnóstico. */
  clearanceNow(): number {
    const p = this.camera.position;
    return p.y - this.terrain.heightY(p.x, p.z);
  }

  dispose(): void {
    this.dom.removeEventListener('wheel', this.cancelOnInput);
    this.controls.dispose();
  }
}
