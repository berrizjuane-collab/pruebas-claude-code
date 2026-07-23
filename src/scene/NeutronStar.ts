/**
 * The neutron star mesh: a high-detail icosphere driven by the procedural
 * surface shader, with rotation, rotation-induced oblateness, hot magnetic caps
 * and magnetar surface activity. Visual radius is fixed at 1 world unit; all
 * other scene distances are expressed relative to it.
 */

import * as THREE from 'three';
import { createStarMaterial, type StarUniforms } from '../shaders/star.ts';
import { mapLog, clamp, DEG } from '../utils/math.ts';
import type { AppState } from '../state/types.ts';
import type { ResourceTracker } from '../core/Disposable.ts';

export const STAR_RADIUS = 1.0; // world units

export class NeutronStar {
  readonly group = new THREE.Group();
  readonly mesh: THREE.Mesh;
  private uniforms: StarUniforms;
  private geometry: THREE.IcosahedronGeometry;
  private material: THREE.ShaderMaterial;
  private currentDetail = 7;

  constructor(private tracker: ResourceTracker) {
    this.uniforms = {
      uTime: { value: 0 },
      uColorTemp: { value: 0.5 },
      uHotCap: { value: 0.5 },
      uMagAxisObject: { value: new THREE.Vector3(0, 1, 0) },
      uSpinAxisWorld: { value: new THREE.Vector3(0, 1, 0) },
      uCenterWorld: { value: new THREE.Vector3(0, 0, 0) },
      uBeta: { value: 0 },
      uRedshift: { value: 0.2 },
      uDetail: { value: 7 },
      uMagnetarActivity: { value: 0 },
      uSeed: { value: Math.random() * 100 },
      uReducedFlashing: { value: 0 },
    };

    this.geometry = new THREE.IcosahedronGeometry(STAR_RADIUS, this.currentDetail);
    this.material = createStarMaterial(this.uniforms);
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.group.add(this.mesh);

    tracker.trackMany(this.geometry, this.material);
  }

  /** Rebuild the sphere at a new tessellation level when quality changes. */
  setDetail(detail: number): void {
    if (detail === this.currentDetail) return;
    this.currentDetail = detail;
    const next = new THREE.IcosahedronGeometry(STAR_RADIUS, detail);
    this.geometry.dispose();
    this.geometry = next;
    this.mesh.geometry = next;
    this.tracker.track(next);
  }

  /**
   * Per-frame update.
   * @param phase   accumulated visual rotation angle (radians)
   * @param state   current app state (parameters + toggles)
   * @param elapsed wall-clock elapsed time (for shader animation)
   */
  update(phase: number, state: AppState, elapsed: number): void {
    const d = state.derived;
    const p = state.params;

    // Rotation about the spin axis (world +Y).
    this.mesh.rotation.y = phase;

    // Oblateness → flatten along the spin axis.
    const eps = d.oblateness;
    this.mesh.scale.set(1, 1 - eps, 1);

    // Magnetic axis in object space: tilt by obliquity from +Y. Because the mesh
    // rotates by `phase`, the world magnetic axis becomes Ry(phase)·(sinα,cosα,0),
    // matching physics/pulsar.magneticAxis().
    const a = p.magneticInclination;
    this.uniforms.uMagAxisObject.value.set(Math.sin(a), Math.cos(a), 0).normalize();

    // Temperature → normalised colour temp (visual translation of ~1e5–1e7 K).
    this.uniforms.uColorTemp.value = clamp(mapLog(p.temperature, 1e5, 1e7, 0.25, 0.95), 0, 1);
    this.uniforms.uHotCap.value = state.beamIntensity * 0.9 + 0.1;
    this.uniforms.uBeta.value = d.equatorialBeta;
    this.uniforms.uRedshift.value = clamp(d.gravitationalRedshift, 0, 2);

    // Magnetar activity ramps in for very strong fields (≳1e10 T / 1e14 G).
    this.uniforms.uMagnetarActivity.value = clamp(
      mapLog(p.magneticField, 5e9, 5e10, 0, 1),
      0,
      1,
    );
    this.uniforms.uReducedFlashing.value = state.reducedFlashing ? 1 : 0;
    this.uniforms.uTime.value = state.reducedMotion ? elapsed * 0.25 : elapsed;

    // Detail follows the quality tier.
    this.uniforms.uDetail.value = this.currentDetail >= 7 ? 6 : this.currentDetail >= 6 ? 5 : 4;
  }

  /** World-space equatorial radius (accounts for scale) for camera/lensing. */
  get worldRadius(): number {
    return STAR_RADIUS;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

/** Convenience: default magnetic inclination in degrees for UI display. */
export const defaultInclinationDeg = 30 * DEG;
