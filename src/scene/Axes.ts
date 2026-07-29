/**
 * The two distinguished axes of the star:
 *  - spin (rotation) axis, fixed along world +Y (cyan);
 *  - magnetic axis, tilted by the obliquity α and sweeping with the rotation
 *    (warm amber), making the misalignment that drives pulsar behaviour visible.
 *
 * Kept deliberately thin and labelled so they read clearly without cluttering.
 */

import * as THREE from 'three';
import { makeLabel, type LabelHandle } from './labels.ts';
import { magneticAxis } from '../physics/pulsar.ts';
import type { ResourceTracker } from '../core/Disposable.ts';

const SPIN_COLOR = 0x59d8ff;
const MAG_COLOR = 0xffb15a;
const AXIS_LEN = 2.4;

export class Axes {
  readonly group = new THREE.Group();
  private spinLine: THREE.Line;
  private magLine: THREE.Line;
  private spinLabel: LabelHandle;
  private magLabel: LabelHandle;
  private magGeom: THREE.BufferGeometry;

  constructor(tracker: ResourceTracker) {
    // Spin axis: static vertical line through the poles.
    const spinGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -AXIS_LEN, 0),
      new THREE.Vector3(0, AXIS_LEN, 0),
    ]);
    const spinMat = new THREE.LineBasicMaterial({
      color: SPIN_COLOR,
      transparent: true,
      opacity: 0.85,
    });
    this.spinLine = new THREE.Line(spinGeom, spinMat);

    // Magnetic axis: rebuilt each frame from its current direction.
    this.magGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -AXIS_LEN, 0),
      new THREE.Vector3(0, AXIS_LEN, 0),
    ]);
    const magMat = new THREE.LineBasicMaterial({
      color: MAG_COLOR,
      transparent: true,
      opacity: 0.9,
    });
    this.magLine = new THREE.Line(this.magGeom, magMat);

    this.spinLabel = makeLabel('Spin axis Ω', '#8fe6ff', 0.2);
    this.magLabel = makeLabel('Magnetic axis', '#ffcf9a', 0.2);

    this.group.add(this.spinLine, this.magLine, this.spinLabel.sprite, this.magLabel.sprite);
    this.spinLabel.sprite.position.set(0, AXIS_LEN + 0.25, 0);

    tracker.trackMany(spinGeom, spinMat, this.magGeom, magMat, this.spinLabel, this.magLabel);
  }

  update(phase: number, obliquity: number): void {
    const a = magneticAxis(phase, obliquity);
    const dir = new THREE.Vector3(a[0], a[1], a[2]);
    const p0 = dir.clone().multiplyScalar(-AXIS_LEN);
    const p1 = dir.clone().multiplyScalar(AXIS_LEN);
    const pos = this.magGeom.getAttribute('position') as THREE.BufferAttribute;
    pos.setXYZ(0, p0.x, p0.y, p0.z);
    pos.setXYZ(1, p1.x, p1.y, p1.z);
    pos.needsUpdate = true;
    // Pushed further out than the spin label so the two don't collide when the
    // magnetic axis swings close to the spin axis.
    this.magLabel.sprite.position.copy(p1).multiplyScalar(1.22);
  }

  setVisible(v: boolean): void {
    this.group.visible = v;
  }

  dispose(): void {
    this.spinLabel.dispose();
    this.magLabel.dispose();
  }
}
