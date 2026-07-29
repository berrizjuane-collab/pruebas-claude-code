/**
 * Magnetosphere: charged particles that stream ALONG the dipole field lines
 * (not a random decorative sparkle). Each particle is bound to a specific field
 * line r = L·sin²θ and advances along it, brightening near the magnetic poles
 * where it would radiate. A single Points cloud (one draw call) keeps it cheap;
 * the CPU advances a scalar phase and evaluates the analytic field-line position.
 */

import * as THREE from 'three';
import { createParticleMaterial, type ParticleUniforms } from '../shaders/field.ts';
import { magneticAxis } from '../physics/pulsar.ts';
import type { AppState } from '../state/types.ts';
import type { ResourceTracker } from '../core/Disposable.ts';

interface FieldLineSpec {
  L: number;
  phi: number;
  thetaMin: number;
}

export class Magnetosphere {
  readonly group = new THREE.Group();
  private points: THREE.Points;
  private geometry: THREE.BufferGeometry;
  private uniforms: ParticleUniforms;

  private count = 0;
  private positions!: Float32Array;
  private bright!: Float32Array;
  private lineIndex!: Int32Array;
  private param!: Float32Array; // 0..1 along the line
  private speed!: Float32Array;
  private lines: FieldLineSpec[] = [];
  private builtCount = -1;
  private _up = new THREE.Vector3(0, 1, 0);
  private q = new THREE.Quaternion();

  constructor(tracker: ResourceTracker) {
    this.uniforms = {
      uColor: { value: new THREE.Color(0x4aa6f0) },
      uHotColor: { value: new THREE.Color(0xf0faff) },
      uSize: { value: 2.6 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uOpacity: { value: 0.95 },
    };
    const material = createParticleMaterial(this.uniforms);
    this.geometry = new THREE.BufferGeometry();
    this.points = new THREE.Points(this.geometry, material);
    this.points.frustumCulled = false;
    this.group.add(this.points);
    tracker.trackMany(this.geometry, material);
    this.build(4000);
  }

  private build(count: number): void {
    this.count = count;
    this.positions = new Float32Array(count * 3);
    this.bright = new Float32Array(count);
    this.lineIndex = new Int32Array(count);
    this.param = new Float32Array(count);
    this.speed = new Float32Array(count);

    // A pool of field lines the particles ride.
    const nLines = 160;
    this.lines = [];
    for (let i = 0; i < nLines; i++) {
      const L = 1.3 + Math.random() * 2.6;
      const phi = Math.random() * Math.PI * 2;
      const thetaMin = Math.asin(Math.min(1, Math.sqrt(1 / L)));
      this.lines.push({ L, phi, thetaMin });
    }

    for (let i = 0; i < count; i++) {
      this.lineIndex[i] = (Math.random() * nLines) | 0;
      this.param[i] = Math.random();
      this.speed[i] = 0.05 + Math.random() * 0.12;
    }

    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('aBright', new THREE.BufferAttribute(this.bright, 1));
    this.geometry.computeBoundingSphere();
    this.builtCount = count;
    this.evaluate(0);
  }

  /** Ensure the particle count matches the quality tier. */
  setCount(count: number): void {
    if (count === this.builtCount) return;
    this.build(count);
  }

  private evaluate(dt: number): void {
    const pos = this.positions;
    const br = this.bright;
    for (let i = 0; i < this.count; i++) {
      const line = this.lines[this.lineIndex[i]];
      let u = this.param[i];
      // Advance along the line. The step is scaled by sin²θ so particles race
      // across the equatorial apex and crawl through the polar funnels — which
      // makes them pile up at the caps, where the flux tube is narrowest.
      const s0 = Math.sin(line.thetaMin + u * (Math.PI - 2 * line.thetaMin));
      u += this.speed[i] * dt * (0.18 + 1.6 * s0 * s0);
      if (u > 1) u -= 1;
      this.param[i] = u;

      const theta = line.thetaMin + u * (Math.PI - 2 * line.thetaMin);
      const sinT = Math.sin(theta);
      const r = line.L * sinT * sinT;
      const x = r * sinT * Math.cos(line.phi);
      const y = r * Math.cos(theta);
      const z = r * sinT * Math.sin(line.phi);
      const j = i * 3;
      pos[j] = x;
      pos[j + 1] = y;
      pos[j + 2] = z;
      // Brighter near the poles (|cosθ| → 1) where particles are funnelled and
      // would radiate; the shader turns high brightness into bigger, whiter points.
      br[i] = 0.16 + 0.84 * Math.pow(Math.abs(Math.cos(theta)), 3.0);
    }
    (this.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('aBright') as THREE.BufferAttribute).needsUpdate = true;
  }

  update(phase: number, state: AppState, dt: number, pixelRatio: number): void {
    this.uniforms.uPixelRatio.value = pixelRatio;
    // Orient particles onto the magnetic-axis frame so they co-rotate/tilt.
    const a = magneticAxis(phase, state.params.magneticInclination);
    this.q.setFromUnitVectors(this._up, new THREE.Vector3(a[0], a[1], a[2]));
    this.group.quaternion.copy(this.q);

    const speedScale = state.reducedMotion ? 0.35 : 1;
    this.evaluate(dt * speedScale);
  }

  setVisible(v: boolean): void {
    this.group.visible = v;
  }

  dispose(): void {
    this.geometry.dispose();
  }
}
