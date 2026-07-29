/**
 * The star's corona: a camera-facing billboard carrying the limb ring and halo
 * (see shaders/corona.ts for what it stands in for physically).
 *
 * A billboard rather than a shell mesh, because a quad of fixed world size keeps
 * an exact constant ratio to the star's apparent radius at every distance — the
 * halo scales with the star automatically, from a wide establishing shot down to
 * a surface close-up, with no per-distance tuning.
 */

import * as THREE from 'three';
import { createCoronaMaterial, type CoronaUniforms } from '../shaders/corona.ts';
import { clamp, mapLog } from '../utils/math.ts';
import { STAR_RADIUS } from './NeutronStar.ts';
import type { AppState } from '../state/types.ts';
import type { ResourceTracker } from '../core/Disposable.ts';

/** Billboard half-size, in stellar radii. The halo tail dies out well inside it. */
const EXTENT = 4.0;

export class Corona {
  readonly group = new THREE.Group();
  private mesh: THREE.Mesh;
  private uniforms: CoronaUniforms;

  constructor(tracker: ResourceTracker) {
    this.uniforms = {
      uTime: { value: 0 },
      uInner: { value: 1 / EXTENT },
      uColor: { value: new THREE.Color(0x2f6fd0) },
      uHotColor: { value: new THREE.Color(0xbfe4ff) },
      uIntensity: { value: 1.0 },
      uRing: { value: 0.4 },
      uActivity: { value: 0 },
      uReducedMotion: { value: 0 },
    };

    const geom = new THREE.PlaneGeometry(
      STAR_RADIUS * EXTENT * 2,
      STAR_RADIUS * EXTENT * 2,
    );
    const mat = createCoronaMaterial(this.uniforms);
    this.mesh = new THREE.Mesh(geom, mat);
    this.mesh.frustumCulled = false;
    // Draw after the opaque star so its depth is already in the buffer.
    this.mesh.renderOrder = 5;
    this.group.add(this.mesh);

    tracker.trackMany(geom, mat);
  }

  update(state: AppState, camera: THREE.Camera, elapsed: number): void {
    // Face the camera exactly (billboard).
    this.mesh.quaternion.copy(camera.quaternion);

    const u = this.uniforms;
    u.uTime.value = elapsed;
    u.uReducedMotion.value = state.reducedMotion ? 1 : 0;

    // Hotter surfaces push the halo from deep blue toward white-blue.
    const temp = clamp(mapLog(state.params.temperature, 1e5, 1e7, 0, 1), 0, 1);
    u.uColor.value.setRGB(0.10 + 0.06 * temp, 0.26 + 0.12 * temp, 0.62 + 0.22 * temp);
    u.uHotColor.value.setRGB(0.62 + 0.30 * temp, 0.80 + 0.18 * temp, 1.0);

    // The limb ring is the visible signature of compactness: the more compact the
    // star, the more light from the far side is bent into view around the edge.
    u.uRing.value = clamp(state.derived.schwarzschildRatio * 1.35, 0.05, 0.85);

    // Magnetar-class fields agitate the halo and brighten it.
    const activity = clamp(mapLog(state.params.magneticField, 5e9, 5e10, 0, 1), 0, 1);
    u.uActivity.value = activity;
    // Intentionally NOT tied to beamIntensity: the halo is thermal emission from
    // the surface, so it stays even when the beams are dialled down or hidden.
    u.uIntensity.value = 0.85 + 0.55 * temp + 0.35 * activity;
  }

  setVisible(v: boolean): void {
    this.group.visible = v;
  }

  dispose(): void {
    // geometry & material tracked by ResourceTracker
  }
}
