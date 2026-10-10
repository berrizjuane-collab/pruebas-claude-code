/**
 * Cielo, niebla e iluminación. Luz principal lateral (sol) + hemisférica fría.
 * Las sombras se limitan a la zona útil (núcleo y alrededores) y solo se recalculan
 * cuando cambia la luz o la calidad (los proyectores son estáticos, ver Terrain).
 */
import * as THREE from 'three';

export interface LightPreset {
  id: 'manana' | 'tarde';
  label: string;
  azimuthDeg: number;
  elevationDeg: number;
  sunColor: string;
  sunIntensity: number;
  skyColor: string;
  groundColor: string;
  hemiIntensity: number;
  zenith: string;
  horizon: string;
  haze: string;
  exposure: number;
  /** nubes: cara iluminada y sombra propia */
  cloudLit: string;
  cloudShadow: string;
}

export const LIGHT_PRESETS: Record<LightPreset['id'], LightPreset> = {
  manana: {
    id: 'manana',
    label: 'Mañana',
    azimuthDeg: 112,
    elevationDeg: 31,
    sunColor: '#fff3e2',
    sunIntensity: 3.7,
    skyColor: '#a9c8e8',
    groundColor: '#5e5a57',
    hemiIntensity: 0.72,
    zenith: '#123a6e',
    horizon: '#b9cad8',
    haze: '#aebfcd',
    exposure: 1.0,
    cloudLit: '#fff8ee',
    cloudShadow: '#7a8798',
  },
  tarde: {
    id: 'tarde',
    label: 'Tarde',
    azimuthDeg: 252,
    elevationDeg: 17,
    sunColor: '#ffd2a1',
    sunIntensity: 3.4,
    skyColor: '#b6c4dc',
    groundColor: '#62564f',
    hemiIntensity: 0.62,
    zenith: '#1c3563',
    horizon: '#e0c3a6',
    haze: '#c8b8a8',
    exposure: 1.05,
    cloudLit: '#ffe0bd',
    cloudShadow: '#857b88',
  },
};

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w; // siempre en el plano lejano
}`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uHaze;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.55));
  col = mix(uHaze, col, smoothstep(-0.04, 0.06, h));
  float s = max(dot(d, uSunDir), 0.0);
  col += uSunColor * (pow(s, 900.0) * 6.0 + pow(s, 18.0) * 0.18);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Environment {
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly sky: THREE.Mesh;
  readonly fog: THREE.FogExp2;
  private readonly skyMat: THREE.ShaderMaterial;
  preset: LightPreset = LIGHT_PRESETS.manana;
  shadowsDirty = true;

  constructor(private readonly scene: THREE.Scene, private readonly renderer: THREE.WebGLRenderer) {
    this.sun = new THREE.DirectionalLight('#ffffff', 3);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 6;
    const sc = this.sun.shadow.camera;
    sc.left = -11000;
    sc.right = 11000;
    sc.top = 11000;
    sc.bottom = -11000;
    sc.near = 1000;
    sc.far = 70000;
    this.sun.target.position.set(400, 1200, 1200);
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight('#ffffff', '#555555', 1);
    scene.add(this.hemi);
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: {
        uZenith: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uHaze: { value: new THREE.Color() },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunColor: { value: new THREE.Color() },
      },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), this.skyMat);
    this.sky.name = 'cielo';
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    scene.add(this.sky);
    this.fog = new THREE.FogExp2('#aebfcd', 1.25e-5);
    scene.fog = this.fog;
    this.applyPreset(this.preset);
  }

  sunDirection(): THREE.Vector3 {
    const az = (this.preset.azimuthDeg * Math.PI) / 180;
    const el = (this.preset.elevationDeg * Math.PI) / 180;
    // escena: X este, Z sur → el norte es −Z
    return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
  }

  applyPreset(p: LightPreset): void {
    this.preset = p;
    const dir = this.sunDirection();
    this.sun.color.set(p.sunColor);
    this.sun.intensity = p.sunIntensity;
    this.sun.position.copy(this.sun.target.position).addScaledVector(dir, 40000);
    this.sun.updateMatrixWorld();
    this.sun.target.updateMatrixWorld();
    this.hemi.color.set(p.skyColor);
    this.hemi.groundColor.set(p.groundColor);
    this.hemi.intensity = p.hemiIntensity;
    const u = this.skyMat.uniforms;
    (u.uZenith.value as THREE.Color).set(p.zenith);
    (u.uHorizon.value as THREE.Color).set(p.horizon);
    (u.uHaze.value as THREE.Color).set(p.haze);
    (u.uSunDir.value as THREE.Vector3).copy(dir);
    (u.uSunColor.value as THREE.Color).set(p.sunColor);
    this.fog.color.set(p.haze);
    this.renderer.toneMappingExposure = p.exposure;
    this.shadowsDirty = true;
  }

  setShadows(enabled: boolean, mapSize: number): void {
    this.renderer.shadowMap.enabled = enabled;
    this.sun.castShadow = enabled;
    if (enabled && this.sun.shadow.mapSize.x !== mapSize) {
      this.sun.shadow.mapSize.set(mapSize, mapSize);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.shadowsDirty = true;
  }

  /** El cielo sigue a la cámara y se dibuja en el plano lejano. */
  follow(camera: THREE.Camera): void {
    this.sky.position.copy(camera.position);
    this.sky.updateMatrixWorld();
  }

  dispose(): void {
    this.sky.geometry.dispose();
    this.skyMat.dispose();
    this.sun.shadow.map?.dispose();
    this.scene.remove(this.sun, this.sun.target, this.hemi, this.sky);
  }
}
