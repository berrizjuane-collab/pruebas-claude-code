/**
 * Dipole magnetic-field visualization.
 *
 * Closed field lines follow the exact dipole relation r = L·sin²θ (in the
 * magnetic frame), drawn as glowing arcs from pole to pole. Open field lines
 * near the polar caps (whose apex lies beyond the light cylinder) stream outward
 * instead of closing — the region that channels the pulsar wind. The whole group
 * is oriented to the magnetic axis, so it co-rotates and tilts correctly.
 *
 * The distinction between the (physically-motivated) closed geometry and the
 * schematic open lines is surfaced in the UI's magnetosphere panel.
 */

import * as THREE from 'three';
import { createFieldLineMaterial, type FieldLineUniforms } from '../shaders/field.ts';
import { magneticAxis } from '../physics/pulsar.ts';
import { clamp, mapLog } from '../utils/math.ts';
import type { AppState } from '../state/types.ts';
import type { ResourceTracker } from '../core/Disposable.ts';

const CLOSED_COLOR = new THREE.Color(0x2f6ed8);
const CLOSED_HOT = new THREE.Color(0x9fd8ff);
const OPEN_COLOR = new THREE.Color(0x3fb6e8);
const OPEN_HOT = new THREE.Color(0xdcf4ff);

export class MagneticField {
  readonly group = new THREE.Group();
  private closed: THREE.LineSegments;
  private open: THREE.LineSegments;
  private closedUniforms: FieldLineUniforms;
  private openUniforms: FieldLineUniforms;
  private builtLines = -1;
  private builtDensity = -1;
  private _up = new THREE.Vector3(0, 1, 0);
  private q = new THREE.Quaternion();

  constructor(tracker: ResourceTracker) {
    this.closedUniforms = {
      uColor: { value: CLOSED_COLOR.clone() },
      uHotColor: { value: CLOSED_HOT.clone() },
      uOpacity: { value: 0.55 },
      uPulse: { value: 0 },
      uTime: { value: 0 },
      uFlow: { value: 0.9 },
    };
    this.openUniforms = {
      uColor: { value: OPEN_COLOR.clone() },
      uHotColor: { value: OPEN_HOT.clone() },
      uOpacity: { value: 0.7 },
      uPulse: { value: 0 },
      uTime: { value: 0 },
      // Open lines channel the wind outward, so their packets run visibly faster.
      uFlow: { value: 2.2 },
    };
    const closedMat = createFieldLineMaterial(this.closedUniforms);
    const openMat = createFieldLineMaterial(this.openUniforms);
    this.closed = new THREE.LineSegments(new THREE.BufferGeometry(), closedMat);
    this.open = new THREE.LineSegments(new THREE.BufferGeometry(), openMat);
    this.group.add(this.closed, this.open);
    tracker.trackMany(closedMat, openMat);
    this.rebuild(14, 0.6);
  }

  /** Rebuild the line geometry for a given count / density. */
  private rebuild(lineCount: number, density: number): void {
    const azimuths = Math.max(3, Math.round(lineCount * (0.5 + density)));
    const shells = Math.max(2, Math.round(lineCount / 3));

    const closedPts: number[] = [];
    const closedFade: number[] = [];
    const closedArc: number[] = [];
    const openPts: number[] = [];
    const openFade: number[] = [];
    const openArc: number[] = [];

    // Closed loops: shells of increasing L, each drawn at several azimuths.
    for (let s = 0; s < shells; s++) {
      const L = 1.5 + (s / Math.max(1, shells - 1)) * 2.4; // 1.5R .. 3.9R
      for (let ai = 0; ai < azimuths; ai++) {
        // Offset every other shell in azimuth so the shells interleave instead of
        // stacking into visible "walls" of coincident lines.
        const phi = ((ai + (s % 2) * 0.5) / azimuths) * Math.PI * 2;
        pushDipoleLoop(closedPts, closedFade, closedArc, L, phi, 64);
      }
    }

    // Open polar lines: a fan from each cap streaming outward (large L, truncated).
    const openAz = Math.max(4, Math.round(azimuths * 0.8));
    for (let ai = 0; ai < openAz; ai++) {
      const phi = (ai / openAz) * Math.PI * 2;
      pushOpenLine(openPts, openFade, openArc, phi, 1, 40); // north cap
      pushOpenLine(openPts, openFade, openArc, phi, -1, 40); // south cap
    }

    setLineGeometry(this.closed.geometry, closedPts, closedFade, closedArc);
    setLineGeometry(this.open.geometry, openPts, openFade, openArc);
    this.builtLines = lineCount;
    this.builtDensity = density;
  }

  update(phase: number, state: AppState): void {
    const lineCount = Math.round(6 + state.fieldLineDensity * 18);
    if (lineCount !== this.builtLines || Math.abs(state.fieldLineDensity - this.builtDensity) > 0.05) {
      this.rebuild(lineCount, state.fieldLineDensity);
    }

    // Orient the whole magnetosphere to the current magnetic axis.
    const a = magneticAxis(phase, state.params.magneticInclination);
    this.q.setFromUnitVectors(this._up, new THREE.Vector3(a[0], a[1], a[2]));
    this.group.quaternion.copy(this.q);

    // Magnetar tension: stronger, more agitated lines for extreme fields.
    const activity = clamp(mapLog(state.params.magneticField, 5e9, 5e10, 0, 1), 0, 1);
    const t = performance.now() * 0.001;
    const pulse = 0.5 + 0.5 * Math.sin(t * 2);
    const flowScale = state.reducedMotion ? 0.3 : 1;
    this.closedUniforms.uPulse.value = activity * pulse;
    this.openUniforms.uPulse.value = activity * pulse;
    this.closedUniforms.uOpacity.value = 0.5 + activity * 0.45;
    this.openUniforms.uOpacity.value = 0.68 + activity * 0.45;
    this.closedUniforms.uTime.value = t;
    this.openUniforms.uTime.value = t;
    this.closedUniforms.uFlow.value = (0.9 + activity * 1.4) * flowScale;
    this.openUniforms.uFlow.value = (2.2 + activity * 2.6) * flowScale;
  }

  setVisible(v: boolean): void {
    this.group.visible = v;
  }

  dispose(): void {
    this.closed.geometry.dispose();
    this.open.geometry.dispose();
  }
}

/** Append a full closed dipole loop (pole→equator→pole) as line segments. */
function pushDipoleLoop(
  pts: number[],
  fade: number[],
  arc: number[],
  L: number,
  phi: number,
  steps: number,
): void {
  const cosP = Math.cos(phi);
  const sinP = Math.sin(phi);
  // θ from just off the north pole to just off the south pole.
  const thetaMin = Math.asin(Math.min(1, Math.sqrt(1 / L))); // where r = 1 (surface)
  let prev: [number, number, number] | null = null;
  let prevFade = 0;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const theta = thetaMin + t * (Math.PI - 2 * thetaMin);
    const r = L * Math.sin(theta) * Math.sin(theta);
    const x = r * Math.sin(theta) * cosP;
    const y = r * Math.cos(theta);
    const z = r * Math.sin(theta) * sinP;
    // Brightest where the line leaves and re-enters the crust, dimmest at the
    // apex — the field is strongest close to the surface.
    const f = 0.28 + 0.72 * Math.pow(1 - Math.min(1, (r - 1) / (L - 1 + 1e-3)), 0.8);
    const cur: [number, number, number] = [x, y, z];
    if (prev) {
      pts.push(prev[0], prev[1], prev[2], cur[0], cur[1], cur[2]);
      fade.push(prevFade, f);
      arc.push(t - 1 / steps, t);
    }
    prev = cur;
    prevFade = f;
  }
}

/** Append an open polar field line streaming outward from a cap (sign = ±1). */
function pushOpenLine(
  pts: number[],
  fade: number[],
  arc: number[],
  phi: number,
  sign: number,
  steps: number,
): void {
  const capAngle = 0.28; // radians from the pole
  const cosP = Math.cos(phi);
  const sinP = Math.sin(phi);
  let prev: [number, number, number] | null = null;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // Start at the cap on the surface, flare outward and slightly away from axis.
    const r = 1 + t * 3.6;
    const theta = capAngle * (0.6 + 0.8 * t); // opens up with distance
    const x = r * Math.sin(theta) * cosP;
    const y = sign * r * Math.cos(theta);
    const z = r * Math.sin(theta) * sinP;
    const cur: [number, number, number] = [x, y, z];
    const f = 0.85 * (1 - t) + 0.15;
    if (prev) {
      pts.push(prev[0], prev[1], prev[2], cur[0], cur[1], cur[2]);
      fade.push(0.95 * (1 - (t - 1 / steps)) + 0.12, f);
      arc.push(t - 1 / steps, t);
    }
    prev = cur;
  }
}

function setLineGeometry(
  geom: THREE.BufferGeometry,
  pts: number[],
  fade: number[],
  arc: number[],
): void {
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  geom.setAttribute('aFade', new THREE.Float32BufferAttribute(fade, 1));
  geom.setAttribute('aArc', new THREE.Float32BufferAttribute(arc, 1));
  geom.computeBoundingSphere();
}
