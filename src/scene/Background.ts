/**
 * Galactic background: a layered, procedurally-generated deep-space backdrop.
 *
 *  - a large nebula/dust dome (subtle, low-saturation — never competes with the
 *    star), driven by the nebula shader;
 *  - a soft star field of thousands of points across several depth shells, with
 *    realistic magnitude/colour scatter and gentle parallax as the camera moves;
 *  - an optional educational reference grid.
 *
 * Four modes: cinematic, scientific (sober), lab (black), grid.
 */

import * as THREE from 'three';
import {
  createNebulaMaterial,
  STAR_POINT_VERT,
  STAR_POINT_FRAG,
  type NebulaUniforms,
} from '../shaders/background.ts';
import type { BackgroundMode } from '../state/types.ts';
import type { ResourceTracker } from '../core/Disposable.ts';

const DOME_RADIUS = 600;

export class Background {
  readonly group = new THREE.Group();
  private dome: THREE.Mesh;
  private nebulaU: NebulaUniforms;
  private starsGroup = new THREE.Group();
  private starMaterial: THREE.ShaderMaterial;
  private grid: THREE.LineSegments;
  private builtStars = -1;

  constructor(private tracker: ResourceTracker) {
    // Nebula dome.
    this.nebulaU = { uTime: { value: 0 }, uMode: { value: 0 }, uIntensity: { value: 0.9 } };
    const domeGeom = new THREE.SphereGeometry(DOME_RADIUS, 32, 24);
    const domeMat = createNebulaMaterial(this.nebulaU);
    this.dome = new THREE.Mesh(domeGeom, domeMat);
    this.dome.frustumCulled = false;

    // Star points.
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

    // Reference grid (hidden unless grid mode).
    const gridHelper = new THREE.GridHelper(40, 40, 0x22436b, 0x14263f);
    (gridHelper.material as THREE.Material).transparent = true;
    (gridHelper.material as THREE.Material).opacity = 0.35;
    this.grid = gridHelper as unknown as THREE.LineSegments;
    this.grid.visible = false;

    this.group.add(this.dome, this.starsGroup, this.grid);
    tracker.trackMany(domeGeom, domeMat, this.starMaterial, gridHelper.geometry as THREE.BufferGeometry);
    this.buildStars(10000);
  }

  private buildStars(count: number): void {
    // Clear any previous shells.
    this.starsGroup.clear();

    // Three depth shells for parallax: near, mid, far.
    const shells = [
      { radius: 120, frac: 0.25, sizeScale: 1.6 },
      { radius: 300, frac: 0.35, sizeScale: 1.1 },
      { radius: 560, frac: 0.4, sizeScale: 0.8 },
    ];

    for (const shell of shells) {
      const n = Math.max(1, Math.floor(count * shell.frac));
      const pos = new Float32Array(n * 3);
      const col = new Float32Array(n * 3);
      const size = new Float32Array(n);
      const tw = new Float32Array(n);

      for (let i = 0; i < n; i++) {
        // Non-uniform distribution: cluster along a faint galactic band (y small).
        const u = Math.random();
        const v = Math.random();
        const theta = 2 * Math.PI * u;
        // Bias latitude toward the plane for a Milky-Way-like band.
        const lat = (Math.acos(2 * v - 1) - Math.PI / 2) * (0.55 + 0.45 * Math.random());
        const r = shell.radius * (0.85 + Math.random() * 0.3);
        const cx = r * Math.cos(lat) * Math.cos(theta);
        const cy = r * Math.sin(lat);
        const cz = r * Math.cos(lat) * Math.sin(theta);
        pos[i * 3] = cx;
        pos[i * 3 + 1] = cy;
        pos[i * 3 + 2] = cz;

        // Magnitude distribution: many faint, few bright (power-law-ish).
        const bright = Math.pow(Math.random(), 3.0);
        const baseSize = (0.6 + bright * 3.2) * shell.sizeScale;
        size[i] = baseSize;
        tw[i] = Math.random();

        // Colour by a pseudo temperature: mostly white/blue, some warm.
        const t = Math.random();
        const c = starColor(t);
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
      // Slight per-shell parallax factor stored on userData.
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

  setMode(mode: BackgroundMode): void {
    const modeIndex = { cinematic: 0, scientific: 1, lab: 2, grid: 3 }[mode];
    this.nebulaU.uMode.value = modeIndex;
    this.dome.visible = mode === 'cinematic' || mode === 'scientific';
    this.starsGroup.visible = mode !== 'lab';
    this.grid.visible = mode === 'grid';
    this.nebulaU.uIntensity.value = mode === 'scientific' ? 0.5 : 0.9;
  }

  update(elapsed: number, camera: THREE.Camera, pixelRatio: number): void {
    this.nebulaU.uTime.value = elapsed;
    (this.starMaterial.uniforms.uTime as THREE.IUniform).value = elapsed;
    (this.starMaterial.uniforms.uPixelRatio as THREE.IUniform).value = pixelRatio;

    // Parallax: shift each shell slightly opposite to camera motion. The dome and
    // far stars stay put; near stars drift for depth.
    const cam = camera.position;
    for (const child of this.starsGroup.children) {
      const p = (child.userData.parallax as number) || 0;
      child.position.set(-cam.x * p * 0.04, -cam.y * p * 0.04, -cam.z * p * 0.04);
    }
  }

  dispose(): void {
    // geometries/materials tracked by ResourceTracker
  }
}

/** Map a 0..1 "temperature" to a star colour (mostly cool white/blue). */
function starColor(t: number): THREE.Color {
  if (t < 0.7) return new THREE.Color(0.85, 0.9, 1.0); // blue-white majority
  if (t < 0.9) return new THREE.Color(1.0, 0.98, 0.92); // white
  return new THREE.Color(1.0, 0.85, 0.7); // warm minority
}
