/**
 * The light cylinder: the surface where strict co-rotation with the star would
 * reach the speed of light (radius R_lc = c/Ω), aligned with the SPIN axis.
 *
 * The real R_lc is enormous compared with the star (thousands of stellar radii),
 * so it is drawn at a VISUALLY COMPRESSED radius that still shrinks as the spin
 * rises. The label always shows the true value in km, and the UI flags the
 * compression — we never present the compressed size as literal.
 *
 * Rendered as a grazing-angle shell rather than a flat translucent tube: it is
 * brightest where the surface turns edge-on to the camera, which is how a real
 * transparent surface reads, and it carries a co-rotating scan so the direction
 * of rotation is legible on the boundary itself.
 */

import * as THREE from 'three';
import { makeLabel, type LabelHandle } from './labels.ts';
import { clamp, mapLog } from '../utils/math.ts';
import type { AppState } from '../state/types.ts';
import { sci } from '../physics/units.ts';
import type { ResourceTracker } from '../core/Disposable.ts';

const HEIGHT = 8;

const VERT = /* glsl */ `
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying float vY;
varying float vAzim;
void main() {
  vY = position.y / ${(HEIGHT / 2).toFixed(1)};
  vAzim = atan(position.z, position.x);
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
precision mediump float;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying float vY;
varying float vAzim;
uniform vec3 uColor;
uniform float uTime;
uniform float uOpacity;

void main() {
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  // Grazing incidence: the shell is only really visible where it turns edge-on,
  // which is what keeps it from reading as a solid frosted tube.
  float graze = 1.0 - abs(dot(normalize(vWorldNormal), viewDir));
  float edge = pow(clamp(graze, 0.0, 1.0), 2.2);

  // Fade out toward the open ends so the cylinder has no hard rim.
  float capFade = smoothstep(1.0, 0.45, abs(vY));

  // Co-rotating scan lines: a slow sweep in azimuth plus a faint ladder in
  // height, so the boundary shows which way the star is turning.
  float scan = pow(0.5 + 0.5 * sin(vAzim * 3.0 - uTime * 1.2), 8.0);
  float rungs = pow(0.5 + 0.5 * sin(vY * 22.0), 14.0) * 0.18;

  float a = (edge * 0.42 + 0.035 + scan * 0.28 + rungs) * capFade * uOpacity;
  gl_FragColor = vec4(uColor * a, a);
}
`;

export class LightCylinder {
  readonly group = new THREE.Group();
  private mesh: THREE.Mesh;
  private label: LabelHandle;
  private uniforms: { uColor: { value: THREE.Color }; uTime: { value: number }; uOpacity: { value: number } };

  constructor(tracker: ResourceTracker) {
    const geom = new THREE.CylinderGeometry(1, 1, HEIGHT, 96, 24, true);
    this.uniforms = {
      uColor: { value: new THREE.Color(0x6ad0ff) },
      uTime: { value: 0 },
      uOpacity: { value: 0.6 },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: this.uniforms,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geom, mat);

    this.label = makeLabel('Light cylinder', '#9fe0ff', 0.2);
    this.group.add(this.mesh, this.label.sprite);

    tracker.trackMany(geom, mat, this.label);
  }

  update(state: AppState): void {
    // Visual radius shrinks with spin but stays viewable (2.6 .. 6.5 units).
    const f = state.params.spinFrequency;
    const visualR = clamp(mapLog(f, 0.1, 700, 6.5, 2.6), 2.6, 6.5);
    this.mesh.scale.set(visualR, 1, visualR);
    this.uniforms.uTime.value = state.reducedMotion
      ? performance.now() * 0.0003
      : performance.now() * 0.001;

    const km = state.derived.lightCylinderRadius / 1e3;
    this.label.setText(`R_lc ≈ ${sci(km)} km (compressed)`);
    this.label.sprite.position.set(visualR + 0.15, 0, 0);
  }

  setVisible(v: boolean): void {
    this.group.visible = v;
  }

  dispose(): void {
    this.label.dispose();
  }
}
