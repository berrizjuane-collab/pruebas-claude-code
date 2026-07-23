/**
 * The light cylinder: the surface where strict co-rotation with the star would
 * reach the speed of light (radius R_lc = c/Ω), aligned with the SPIN axis.
 *
 * The real R_lc is enormous compared with the star (thousands of stellar radii),
 * so it is drawn at a VISUALLY COMPRESSED radius that still shrinks as the spin
 * rises. The label always shows the true value in km, and the UI flags the
 * compression — we never present the compressed size as literal.
 */

import * as THREE from 'three';
import { makeLabel, type LabelHandle } from './labels.ts';
import { clamp, mapLog } from '../utils/math.ts';
import type { AppState } from '../state/types.ts';
import { sci } from '../physics/units.ts';
import type { ResourceTracker } from '../core/Disposable.ts';

export class LightCylinder {
  readonly group = new THREE.Group();
  private mesh: THREE.Mesh;
  private label: LabelHandle;

  constructor(tracker: ResourceTracker) {
    const geom = new THREE.CylinderGeometry(1, 1, 8, 48, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x6ad0ff,
      transparent: true,
      opacity: 0.08,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(geom, mat);

    // A brighter wire outline at the rim for definition.
    const edgeGeom = new THREE.EdgesGeometry(new THREE.CylinderGeometry(1, 1, 8, 48, 1, true));
    const edgeMat = new THREE.LineBasicMaterial({
      color: 0x6ad0ff,
      transparent: true,
      opacity: 0.22,
    });
    const edges = new THREE.LineSegments(edgeGeom, edgeMat);
    this.mesh.add(edges);

    this.label = makeLabel('Light cylinder', '#9fe0ff', 0.36);
    this.group.add(this.mesh, this.label.sprite);

    tracker.trackMany(geom, mat, edgeGeom, edgeMat, this.label);
  }

  update(state: AppState): void {
    // Visual radius shrinks with spin but stays viewable (2.6 .. 6.5 units).
    const f = state.params.spinFrequency;
    const visualR = clamp(mapLog(f, 0.1, 700, 6.5, 2.6), 2.6, 6.5);
    this.mesh.scale.set(visualR, 1, visualR);

    const km = state.derived.lightCylinderRadius / 1e3;
    this.label.setText(`R_lc ≈ ${sci(km)} km (compressed)`);
    this.label.sprite.position.set(visualR + 0.3, 0, 0);
  }

  setVisible(v: boolean): void {
    this.group.visible = v;
  }

  dispose(): void {
    this.label.dispose();
  }
}
