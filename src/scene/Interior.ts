/**
 * Interior "cutaway" view: a cross-section of the schematic layer structure.
 *
 * A face of concentric colour-coded annuli (the cut plane) shows the layers from
 * the hypothetical inner core out to the crust; a hemisphere behind gives 3D
 * form; labels call out each layer with its approximate density and certainty.
 *
 * The layer model is schematic (see physics/interior.ts) — this is an
 * educational diagram, NOT a TOV solution, and says so in the panel.
 */

import * as THREE from 'three';
import { LAYERS } from '../physics/interior.ts';
import { makeLabel, type LabelHandle } from './labels.ts';
import type { ResourceTracker } from '../core/Disposable.ts';

const INTERIOR_R = 1.7;

export class Interior {
  readonly group = new THREE.Group();
  private labels: LabelHandle[] = [];

  constructor(tracker: ResourceTracker) {
    // Sort inside-out so outer rings draw first (painter-friendly).
    const layers = [...LAYERS].sort((a, b) => b.rOuter - a.rOuter);

    let labelIdx = 0;
    for (const layer of layers) {
      const inner = layer.rInner * INTERIOR_R;
      const outer = layer.rOuter * INTERIOR_R;

      // Flat cross-section annulus on the z = 0 plane.
      const ringGeom = new THREE.RingGeometry(inner, outer, 96, 1);
      const ringMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(layer.color),
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.95,
      });
      const ring = new THREE.Mesh(ringGeom, ringMat);
      this.group.add(ring);
      tracker.trackMany(ringGeom, ringMat);

      // Back hemisphere shell for 3D context (behind the cut plane, z < 0).
      const domeGeom = new THREE.SphereGeometry(
        outer,
        48,
        32,
        0,
        Math.PI * 2,
        0,
        Math.PI / 2,
      );
      const domeMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(layer.color),
        transparent: true,
        opacity: 0.12,
        roughness: 0.9,
        metalness: 0.0,
        side: THREE.BackSide,
      });
      const dome = new THREE.Mesh(domeGeom, domeMat);
      dome.rotation.x = -Math.PI / 2; // open side toward -z
      this.group.add(dome);
      tracker.trackMany(domeGeom, domeMat);

      // Short name label, stacked on the right so labels never overlap the rings.
      // Full density/certainty detail lives in the Interior tab legend.
      const label = makeLabel(layer.name, certaintyColor(layer.certainty), 0.28);
      const yTop = INTERIOR_R + 0.15;
      const y = yTop - labelIdx * (yTop * 2) / (LAYERS.length - 1);
      label.sprite.position.set(INTERIOR_R + 0.55, y, 0.02);
      labelIdx++;
      this.labels.push(label);
      this.group.add(label.sprite);
      tracker.track(label);
    }

    // Soft fill light so the hemispheres read.
    const light = new THREE.PointLight(0x88bbff, 1.2, 20);
    light.position.set(3, 4, 5);
    this.group.add(light);

    this.group.visible = false;
  }

  update(elapsed: number): void {
    // Slow, gentle presentation spin so the 3D form reads.
    this.group.rotation.y = Math.sin(elapsed * 0.15) * 0.35;
  }

  setVisible(v: boolean): void {
    this.group.visible = v;
  }

  dispose(): void {
    for (const l of this.labels) l.dispose();
  }
}

function certaintyColor(c: string): string {
  if (c === 'established') return '#bfe9ff';
  if (c === 'probable') return '#cfd3ff';
  return '#e6c9ff'; // hypothetical
}
