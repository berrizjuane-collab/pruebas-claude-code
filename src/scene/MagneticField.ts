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

const CLOSED_COLOR = new THREE.Color(0x4aa8ff);
const OPEN_COLOR = new THREE.Color(0x7ce6ff);

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

  constructor(private tracker: ResourceTracker) {
    this.closedUniforms = {
      uColor: { value: CLOSED_COLOR.clone() },
      uOpacity: { value: 0.55 },
      uPulse: { value: 0 },
    };
    this.openUniforms = {
      uColor: { value: OPEN_COLOR.clone() },
      uOpacity: { value: 0.7 },
      uPulse: { value: 0 },
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
    const openPts: number[] = [];
    const openFade: number[] = [];

    // Closed loops: shells of increasing L, each drawn at several azimuths.
    for (let s = 0; s < shells; s++) {
      const L = 1.5 + (s / Math.max(1, shells - 1)) * 2.4; // 1.5R .. 3.9R
      for (let ai = 0; ai < azimuths; ai++) {
        const phi = (ai / azimuths) * Math.PI * 2;
        pushDipoleLoop(closedPts, closedFade, L, phi, 64);
      }
    }

    // Open polar lines: a fan from each cap streaming outward (large L, truncated).
    const openAz = Math.max(4, Math.round(azimuths * 0.8));
    for (let ai = 0; ai < openAz; ai++) {
      const phi = (ai / openAz) * Math.PI * 2;
      pushOpenLine(openPts, openFade, phi, 1, 40); // north cap
      pushOpenLine(openPts, openFade, phi, -1, 40); // south cap
    }

    setLineGeometry(this.closed.geometry, closedPts, closedFade, this.tracker);
    setLineGeometry(this.open.geometry, openPts, openFade, this.tracker);
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
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.002);
    this.closedUniforms.uPulse.value = activity * pulse;
    this.openUniforms.uPulse.value = activity * pulse;
    this.closedUniforms.uOpacity.value = 0.4 + activity * 0.4;
    this.openUniforms.uOpacity.value = 0.55 + activity * 0.4;
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
  L: number,
  phi: number,
  steps: number,
): void {
  const cosP = Math.cos(phi);
  const sinP = Math.sin(phi);
  // θ from just off the north pole to just off the south pole.
  const thetaMin = Math.asin(Math.min(1, Math.sqrt(1 / L))); // where r = 1 (surface)
  let prev: [number, number, number] | null = null;
  for (let i = 0; i <= steps; i++) {
    const theta = thetaMin + (i / steps) * (Math.PI - 2 * thetaMin);
    const r = L * Math.sin(theta) * Math.sin(theta);
    const x = r * Math.sin(theta) * cosP;
    const y = r * Math.cos(theta);
    const z = r * Math.sin(theta) * sinP;
    // Fade brighter near the star, dimmer at the apex.
    const f = 0.35 + 0.65 * (1 - Math.min(1, (r - 1) / (L - 1 + 1e-3)));
    const cur: [number, number, number] = [x, y, z];
    if (prev) {
      pts.push(prev[0], prev[1], prev[2], cur[0], cur[1], cur[2]);
      fade.push(fadeAt(prev[1], L), f);
    }
    prev = cur;
  }
}

function fadeAt(_y: number, _L: number): number {
  return 0.6;
}

/** Append an open polar field line streaming outward from a cap (sign = ±1). */
function pushOpenLine(
  pts: number[],
  fade: number[],
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
    const r = 1 + t * 3.0;
    const theta = capAngle * (0.6 + 0.8 * t); // opens up with distance
    const x = r * Math.sin(theta) * cosP;
    const y = sign * r * Math.cos(theta);
    const z = r * Math.sin(theta) * sinP;
    const cur: [number, number, number] = [x, y, z];
    const f = 0.8 * (1 - t) + 0.15;
    if (prev) {
      pts.push(prev[0], prev[1], prev[2], cur[0], cur[1], cur[2]);
      fade.push(0.9 * (1 - t) + 0.1, f);
    }
    prev = cur;
  }
}

function setLineGeometry(
  geom: THREE.BufferGeometry,
  pts: number[],
  fade: number[],
  _tracker: ResourceTracker,
): void {
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  geom.setAttribute('aFade', new THREE.Float32BufferAttribute(fade, 1));
  geom.computeBoundingSphere();
}
