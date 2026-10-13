/**
 * Pase de trazado relativista sobre un triángulo a pantalla completa (Three.js solo gestiona el
 * estado de WebGL, los objetivos de render y las texturas; la física está en el sombreador).
 */
import * as THREE from 'three';
import { VERTEX_SHADER, buildFragmentShader } from './mainShader';
import { MARKER_TEX_WIDTH, MAX_MARKERS } from './markersGlsl';
import { blackbodyTable } from '../color/blackbody';

export type Profile = 'cinematic' | 'eht' | 'spacetime';

export interface TracerCamera {
  t: number;
  pos: [number, number, number];
  /** e0 = u, e1 = derecha, e2 = arriba, e3 = adelante (contravariantes, KS cartesianas). */
  e: [ArrayLike<number>, ArrayLike<number>, ArrayLike<number>, ArrayLike<number>];
  fovY: number;
}

export interface PlasmaUniforms {
  ne0: number;
  te0: number;
  beta: number;
  h: number;
  kappa: number;
  rOut: number;
  rIsco: number;
  deltaIsco: number;
  Eisco: number;
  Lisco: number;
  turbulence: number;
  seed: number;
  hotspot: [number, number, number, number];
  omegaHs: number;
}

export interface TracerSettings {
  spin: number;
  rPlus: number;
  maxSteps: number;
  eta: number;
  hEmit: number;
  rEscape: number;
  pastT: number;
  profile: Profile;
  outputMode: 0 | 1 | 2;
  plasmaOn: boolean;
  nus: number[];
  intensityScale: number;
  rgCm: number;
  plasma: PlasmaUniforms;
  starsOn: boolean;
  starGain: number;
  bandGain: number;
  gridOn: boolean;
  starSeed: number;
  galNormal: [number, number, number];
  palette: { lo: [number, number, number]; mid: [number, number, number]; hi: [number, number, number] };
}

const fullScreenTriangle = () => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  return g;
};

export class RayTracer {
  readonly material: THREE.RawShaderMaterial;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.Camera();
  readonly markerTex: THREE.DataTexture;
  readonly markerMeta: THREE.DataTexture;
  readonly bbTex: THREE.DataTexture;

  constructor() {
    const bb = blackbodyTable(256);
    const bbHalf = new Uint16Array(bb.length);
    for (let i = 0; i < bb.length; i++) bbHalf[i] = THREE.DataUtils.toHalfFloat(bb[i]);
    this.bbTex = new THREE.DataTexture(bbHalf, 256, 1, THREE.RGBAFormat, THREE.HalfFloatType);
    this.bbTex.minFilter = THREE.LinearFilter;
    this.bbTex.magFilter = THREE.LinearFilter;
    this.bbTex.wrapS = THREE.ClampToEdgeWrapping;
    this.bbTex.needsUpdate = true;

    this.markerTex = new THREE.DataTexture(new Float32Array(MARKER_TEX_WIDTH * 2 * MAX_MARKERS * 4), MARKER_TEX_WIDTH, 2 * MAX_MARKERS, THREE.RGBAFormat, THREE.FloatType);
    this.markerTex.minFilter = THREE.NearestFilter;
    this.markerTex.magFilter = THREE.NearestFilter;
    this.markerTex.needsUpdate = true;
    this.markerMeta = new THREE.DataTexture(new Float32Array(2 * MAX_MARKERS * 4), 2, MAX_MARKERS, THREE.RGBAFormat, THREE.FloatType);
    this.markerMeta.minFilter = THREE.NearestFilter;
    this.markerMeta.magFilter = THREE.NearestFilter;
    this.markerMeta.needsUpdate = true;

    const v4 = () => new THREE.Vector4();
    const uniforms: Record<string, THREE.IUniform> = {
      uResolution: { value: new THREE.Vector2(1, 1) },
      uJitter: { value: new THREE.Vector2(0.5, 0.5) },
      uSpin: { value: 0 },
      uRPlus: { value: 2 },
      uCamPos: { value: new THREE.Vector3() },
      uCamT: { value: 0 },
      uE0: { value: v4() },
      uE1: { value: v4() },
      uE2: { value: v4() },
      uE3: { value: v4() },
      uTanHalfFov: { value: 0.5 },
      uAspect: { value: 1 },
      uMaxSteps: { value: 600 },
      uEta: { value: 0.06 },
      uHEmit: { value: 0.35 },
      uREscape: { value: 500 },
      uPastT: { value: 300 },
      uProfile: { value: 0 },
      uOutputMode: { value: 0 },
      uMaxOut: { value: 3.0e38 },
      uPlasmaOn: { value: 1 },
      uNu: { value: new THREE.Vector3(86e9, 230e9, 690e9) },
      uNBands: { value: 3 },
      uStarsOn: { value: 1 },
      uIntensityScale: { value: 1e3 },
      uPaletteLo: { value: new THREE.Vector3() },
      uPaletteMid: { value: new THREE.Vector3() },
      uPaletteHi: { value: new THREE.Vector3() },
      uNe0: { value: 1e8 },
      uTe0: { value: 1e11 },
      uBeta: { value: 10 },
      uH: { value: 1 },
      uKappa: { value: 1 },
      uROut: { value: 50 },
      uRIsco: { value: 6 },
      uDeltaIsco: { value: 0.3 },
      uEIsco: { value: 0.94 },
      uLIsco: { value: 3.46 },
      uTurb: { value: 0 },
      uSeed: { value: 7 },
      uHotspot: { value: v4() },
      uOmegaHs: { value: 0 },
      uRgCm: { value: 5.9e11 },
      uStarGain: { value: 1 },
      uStarSeed: { value: 3 },
      uBandGain: { value: 1 },
      uGridOn: { value: 0 },
      uGalNormal: { value: new THREE.Vector3(0, 0, 1) },
      uBBTex: { value: this.bbTex },
      uPixelFootprint: { value: 1e-6 },
      uMarkerCount: { value: 0 },
      uMarkerTex: { value: this.markerTex },
      uMarkerMeta: { value: this.markerMeta },
      uMkBound: { value: Array.from({ length: MAX_MARKERS }, v4) },
      uCamInside: { value: 0 },
    };
    this.material = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VERTEX_SHADER.replace(/^#version[^\n]*\n/, ''),
      fragmentShader: buildFragmentShader().replace(/^#version[^\n]*\n/, ''),
      uniforms,
      depthTest: false,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(fullScreenTriangle(), this.material);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
  }

  get uniforms(): Record<string, THREE.IUniform> {
    return this.material.uniforms;
  }

  setCamera(cam: TracerCamera, width: number, height: number, jitter: [number, number]): void {
    const u = this.uniforms;
    u.uResolution.value.set(width, height);
    u.uJitter.value.set(jitter[0], jitter[1]);
    u.uCamPos.value.set(cam.pos[0], cam.pos[1], cam.pos[2]);
    u.uCamT.value = cam.t;
    const E = [u.uE0.value, u.uE1.value, u.uE2.value, u.uE3.value] as THREE.Vector4[];
    for (let a = 0; a < 4; a++) E[a].set(cam.e[a][0], cam.e[a][1], cam.e[a][2], cam.e[a][3]);
    const th = Math.tan(cam.fovY / 2);
    u.uTanHalfFov.value = th;
    u.uAspect.value = width / height;
    u.uPixelFootprint.value = ((2 * th) / height) ** 2;
  }

  setSettings(s: TracerSettings): void {
    const u = this.uniforms;
    u.uSpin.value = s.spin;
    u.uRPlus.value = s.rPlus;
    u.uMaxSteps.value = s.maxSteps;
    u.uEta.value = s.eta;
    u.uHEmit.value = s.hEmit;
    u.uREscape.value = s.rEscape;
    u.uPastT.value = s.pastT;
    u.uProfile.value = s.profile === 'cinematic' ? 0 : s.profile === 'eht' ? 1 : 2;
    u.uOutputMode.value = s.outputMode;
    u.uPlasmaOn.value = s.plasmaOn ? 1 : 0;
    const nb = Math.min(3, s.nus.length);
    u.uNBands.value = s.plasmaOn ? nb : 0;
    u.uNu.value.set(s.nus[0] ?? 230e9, s.nus[1] ?? 230e9, s.nus[2] ?? 230e9);
    u.uIntensityScale.value = s.intensityScale;
    u.uRgCm.value = s.rgCm;
    const p = s.plasma;
    u.uNe0.value = p.ne0;
    u.uTe0.value = p.te0;
    u.uBeta.value = p.beta;
    u.uH.value = p.h;
    u.uKappa.value = p.kappa;
    u.uROut.value = p.rOut;
    u.uRIsco.value = p.rIsco;
    u.uDeltaIsco.value = p.deltaIsco;
    u.uEIsco.value = p.Eisco;
    u.uLIsco.value = p.Lisco;
    u.uTurb.value = p.turbulence;
    u.uSeed.value = p.seed;
    u.uHotspot.value.set(...p.hotspot);
    u.uOmegaHs.value = p.omegaHs;
    u.uStarsOn.value = s.starsOn ? 1 : 0;
    u.uStarGain.value = s.starGain;
    u.uBandGain.value = s.bandGain;
    u.uGridOn.value = s.gridOn ? 1 : 0;
    u.uStarSeed.value = s.starSeed;
    u.uGalNormal.value.set(...s.galNormal);
    u.uPaletteLo.value.set(...s.palette.lo);
    u.uPaletteMid.value.set(...s.palette.mid);
    u.uPaletteHi.value.set(...s.palette.hi);
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget | null): void {
    renderer.setRenderTarget(target);
    renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.material.dispose();
    this.markerTex.dispose();
    this.markerMeta.dispose();
    this.bbTex.dispose();
  }
}
