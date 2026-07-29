/**
 * The two pulsar beams: soft volumetric cones emitted along ±magnetic axis.
 * They glow continuously (visible to a free camera) but flare as each cone
 * sweeps across the chosen observer's line of sight, reinforcing the pulse that
 * the light-curve chart and the audio also respond to.
 *
 * Colour is a visual translation — real beams are radio/X-ray/gamma; stated in UI.
 */

import * as THREE from 'three';
import { createBeamMaterial, type BeamUniforms } from '../shaders/beams.ts';
import { magneticAxis, observerDirection, beamAngle } from '../physics/pulsar.ts';
import type { AppState } from '../state/types.ts';
import type { ResourceTracker } from '../core/Disposable.ts';

const BEAM_LENGTH = 5.2;

export class PulsarBeams {
  readonly group = new THREE.Group();
  private north: THREE.Mesh;
  private south: THREE.Mesh;
  private northU: BeamUniforms;
  private southU: BeamUniforms;
  private _up = new THREE.Vector3(0, 1, 0);
  private qN = new THREE.Quaternion();
  private qS = new THREE.Quaternion();

  constructor(tracker: ResourceTracker) {
    // Cone as a truncated cylinder: apex (r=0) at y=0, r=1 at y=1.
    const geom = new THREE.CylinderGeometry(1, 0.001, 1, 40, 24, true);
    geom.translate(0, 0.5, 0);

    this.northU = this.makeUniforms();
    this.southU = this.makeUniforms();
    const matN = createBeamMaterial(this.northU);
    const matS = createBeamMaterial(this.southU);

    this.north = new THREE.Mesh(geom, matN);
    this.south = new THREE.Mesh(geom, matS);
    this.north.frustumCulled = false;
    this.south.frustumCulled = false;
    this.group.add(this.north, this.south);

    tracker.trackMany(geom, matN, matS);
  }

  private makeUniforms(): BeamUniforms {
    return {
      uTime: { value: 0 },
      uIntensity: { value: 0.8 },
      uWidth: { value: 0.22 },
      uColor: { value: new THREE.Color(0x2878ff) },
      uHotColor: { value: new THREE.Color(0xdcefff) },
      uLength: { value: BEAM_LENGTH },
      uFlare: { value: 0 },
      uReducedMotion: { value: 0 },
    };
  }

  update(phase: number, state: AppState, elapsed: number): void {
    const alpha = state.params.magneticInclination;
    const axis = magneticAxis(phase, alpha);
    const dirN = new THREE.Vector3(axis[0], axis[1], axis[2]);
    const dirS = dirN.clone().multiplyScalar(-1);

    // Orient each cone's local +Y along its beam direction.
    this.qN.setFromUnitVectors(this._up, dirN);
    this.qS.setFromUnitVectors(this._up, dirS);
    this.north.quaternion.copy(this.qN);
    this.south.quaternion.copy(this.qS);

    // Length & width from the beam half-angle.
    const halfAngle = state.beamWidth; // radians
    const radius = Math.tan(halfAngle) * BEAM_LENGTH;
    this.north.scale.set(radius, BEAM_LENGTH, radius);
    this.south.scale.set(radius, BEAM_LENGTH, radius);

    // Flare when a beam points at the observer.
    const obs = observerDirection(state.observerInclination);
    const flareN = pulseFlare(beamAngle([dirN.x, dirN.y, dirN.z], obs), halfAngle);
    const flareS = pulseFlare(beamAngle([dirS.x, dirS.y, dirS.z], obs), halfAngle);

    // The beams glow continuously so a free camera always sees the lighthouse,
    // and flare hard on top of that when a cone sweeps the observer.
    const base = 0.55 + state.beamIntensity * 1.05;
    const flashScale = state.reducedFlashing ? 0.4 : 1;
    this.northU.uIntensity.value = base + flareN * 1.6 * flashScale;
    this.southU.uIntensity.value = base + flareS * 1.6 * flashScale;
    this.northU.uFlare.value = flareN;
    this.southU.uFlare.value = flareS;
    this.northU.uWidth.value = this.southU.uWidth.value = state.beamWidth;
    this.northU.uTime.value = this.southU.uTime.value = elapsed;
    const rm = state.reducedMotion ? 1 : 0;
    this.northU.uReducedMotion.value = this.southU.uReducedMotion.value = rm;
  }

  setVisible(v: boolean): void {
    this.group.visible = v;
  }

  dispose(): void {
    // geometry & materials tracked by ResourceTracker
  }
}

/** Smooth flare 0..1 as the beam angle approaches the observer within its width. */
function pulseFlare(angle: number, halfWidth: number): number {
  const x = angle / Math.max(0.02, halfWidth);
  return Math.exp(-x * x);
}
