/**
 * The sky: a resolved star field plus the unresolved Milky Way glow.
 *
 *  - `dome` renders the integrated starlight of the galactic band (shader in
 *    shaders/background.ts). Away from the band it is exactly black.
 *  - the star field is built as several depth shells so the camera gets real
 *    parallax when it moves. Stars are distributed by galactic latitude (heavily
 *    concentrated in the band, thinning into the halo) and coloured from a
 *    stellar-type distribution weighted the way a naked-eye sky is: mostly
 *    white and blue-white, a solid minority of yellow and orange, a few red.
 *  - a handful of "bright" stars are seeded far above the magnitude power law,
 *    because a real sky has a dozen or so standouts and an otherwise correct
 *    distribution looks flat without them.
 */

import * as THREE from 'three';
import {
  createNebulaMaterial,
  STAR_POINT_VERT,
  STAR_POINT_FRAG,
  type NebulaUniforms,
} from '../shaders/background.ts';
import type { ResourceTracker } from '../core/Disposable.ts';

const DOME_RADIUS = 900;

/** Galactic plane normal. Kept in sync with GAL_NORMAL in the dome shader. */
const GAL_NORMAL = new THREE.Vector3(0.3237, 0.8188, -0.4750).normalize();
/** Direction of the galactic bulge. Kept in sync with GAL_CORE in the shader. */
const GAL_CORE = new THREE.Vector3(-0.7107, -0.1579, 0.6712).normalize();

export class Background {
  readonly group = new THREE.Group();
  private dome: THREE.Mesh;
  private nebulaU: NebulaUniforms;
  private starsGroup = new THREE.Group();
  private starMaterial: THREE.ShaderMaterial;
  private builtStars = -1;

  constructor(private tracker: ResourceTracker) {
    // Very low: the band should sit just above black and be something you notice
    // rather than something you look at. Anything higher competes with the star.
    this.nebulaU = { uTime: { value: 0 }, uIntensity: { value: 0.062 } };
    const domeGeom = new THREE.SphereGeometry(DOME_RADIUS, 96, 64);
    const domeMat = createNebulaMaterial(this.nebulaU);
    this.dome = new THREE.Mesh(domeGeom, domeMat);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -10;

    this.starMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        uTime: { value: 0 },
      },
      vertexShader: STAR_POINT_VERT,
      fragmentShader: STAR_POINT_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.group.add(this.dome, this.starsGroup);
    tracker.trackMany(domeGeom, domeMat, this.starMaterial);
    this.buildStars(26000);
  }

  private buildStars(count: number): void {
    for (const child of this.starsGroup.children) {
      (child as THREE.Points).geometry.dispose();
    }
    this.starsGroup.clear();

    // Four depth shells purely for parallax. Sizes barely vary between them —
    // apparent brightness is a property of the star, not of which shell it was
    // assigned to — with a slight bias toward the near shells so the parallax has
    // something legible to move.
    const shells = [
      { radius: 180, frac: 0.14, sizeScale: 1.12 },
      { radius: 380, frac: 0.24, sizeScale: 1.05 },
      { radius: 620, frac: 0.31, sizeScale: 0.98 },
      { radius: 860, frac: 0.31, sizeScale: 0.94 },
    ];

    // Orthonormal basis with GAL_NORMAL as the pole, so latitude is galactic.
    const e1 = new THREE.Vector3(1, 0, 0).cross(GAL_NORMAL).normalize();
    const e2 = GAL_NORMAL.clone().cross(e1).normalize();
    const v = new THREE.Vector3();

    for (const shell of shells) {
      const n = Math.max(1, Math.floor(count * shell.frac));
      const pos = new Float32Array(n * 3);
      const col = new Float32Array(n * 3);
      const size = new Float32Array(n);
      const tw = new Float32Array(n);

      for (let i = 0; i < n; i++) {
        const theta = 2 * Math.PI * Math.random();
        // Start isotropic, then compress latitude for most stars. Two nested
        // randoms give a steep concentration into the band with a smooth wing,
        // rather than a hard-edged stripe.
        let lat = Math.asin(2 * Math.random() - 1);
        const roll = Math.random();
        if (roll < 0.55) lat *= 0.10 + 0.22 * Math.random() * Math.random();
        else if (roll < 0.82) lat *= 0.34 + 0.4 * Math.random();

        // Bias longitude toward the bulge: more stars looking inward.
        const towardCore = Math.random() < 0.34;
        const r = shell.radius * (0.9 + Math.random() * 0.2);
        const cl = Math.cos(lat) * r;
        v.copy(e1)
          .multiplyScalar(cl * Math.cos(theta))
          .addScaledVector(e2, cl * Math.sin(theta))
          .addScaledVector(GAL_NORMAL, Math.sin(lat) * r);
        if (towardCore) {
          // Pull a third of the stars a little way toward the core direction.
          v.lerp(GAL_CORE.clone().multiplyScalar(r), 0.10 + 0.3 * Math.random()).setLength(r);
        }
        pos[i * 3] = v.x;
        pos[i * 3 + 1] = v.y;
        pos[i * 3 + 2] = v.z;

        // Magnitude: steep power law — overwhelmingly faint, a few bright. Values
        // are in device pixels (see the vertex shader).
        const bright = Math.pow(Math.random(), 4.2);
        let s = (1.15 + bright * 5.0) * shell.sizeScale;
        // ~1 in 900 is a standout, well outside the power law.
        if (Math.random() < 0.0011) s = (7.0 + Math.random() * 3.0) * shell.sizeScale;
        size[i] = s;
        tw[i] = Math.random();

        const c = starColor(Math.random());
        col[i * 3] = c.r;
        col[i * 3 + 1] = c.g;
        col[i * 3 + 2] = c.b;
      }

      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geom.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
      geom.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
      geom.setAttribute('aTwinkle', new THREE.BufferAttribute(tw, 1));
      geom.computeBoundingSphere();
      const pts = new THREE.Points(geom, this.starMaterial);
      pts.frustumCulled = false;
      pts.userData.parallax = 1 - shell.radius / DOME_RADIUS;
      this.starsGroup.add(pts);
      this.tracker.track(geom);
    }
    this.builtStars = count;
  }

  setStarCount(count: number): void {
    if (count === this.builtStars) return;
    this.buildStars(count);
  }

  update(elapsed: number, camera: THREE.Camera, pixelRatio: number): void {
    this.nebulaU.uTime.value = elapsed;
    (this.starMaterial.uniforms.uTime as THREE.IUniform).value = elapsed;
    (this.starMaterial.uniforms.uPixelRatio as THREE.IUniform).value = pixelRatio;

    // Parallax: near shells drift against the far ones as the camera moves.
    const cam = camera.position;
    for (const child of this.starsGroup.children) {
      const p = (child.userData.parallax as number) || 0;
      child.position.set(-cam.x * p * 0.05, -cam.y * p * 0.05, -cam.z * p * 0.05);
    }
  }

  dispose(): void {
    // geometries/materials tracked by ResourceTracker
  }
}

/**
 * Map a uniform 0..1 draw to a stellar colour, weighted the way the naked-eye
 * sky is: blue-white and white dominate, with a real tail of yellow, orange and
 * red. Values are linear RGB at roughly equal luminance.
 */
function starColor(t: number): THREE.Color {
  if (t < 0.10) return new THREE.Color(0.68, 0.79, 1.0); // O/B  blue
  if (t < 0.34) return new THREE.Color(0.82, 0.89, 1.0); // B/A  blue-white
  if (t < 0.60) return new THREE.Color(0.96, 0.97, 1.0); // A/F  white
  if (t < 0.78) return new THREE.Color(1.0, 0.96, 0.87); // F/G  warm white
  if (t < 0.90) return new THREE.Color(1.0, 0.88, 0.70); // G/K  yellow
  if (t < 0.975) return new THREE.Color(1.0, 0.77, 0.55); // K    orange
  return new THREE.Color(1.0, 0.62, 0.46); // M  red
}
