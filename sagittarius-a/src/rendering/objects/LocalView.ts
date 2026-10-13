/**
 * Perspectiva B: el objeto visto desde su propio marco de caída libre.
 *
 * La cámara es comóvil con el objeto (misma 4-velocidad u) y su orientación se define en el marco
 * giroscópico (e₁, e₂, e₃) transportado en paralelo. En ese marco localmente inercial el objeto,
 * de metros o kilómetros, se dibuja con geometría euclídea a escala real (principio de
 * equivalencia: las correcciones de curvatura a esa escala son ~ (L/R_curv)² ≪ 10⁻¹⁰); el cielo
 * y el flujo de acreción se trazan con geodésicas nulas desde la posición y la velocidad del objeto.
 * Las piezas tras una rotura se colocan en sus desplazamientos ξ calculados (desviación geodésica).
 */
import * as THREE from 'three';
import { buildModel, type ObjectModel } from './models';
import type { CameraFrame } from '../../camera/RelativisticCamera';
import type { BodyState, Experiment } from '../../simulation/client';
import type { RayTracer } from '../raytracer/RayTracer';
import { CATALOG } from '../../simulation/catalog';
import { mulberry32 } from '../../physics/random';

export class LocalView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.01, 1e8);
  private model: ObjectModel | null = null;
  private modelKind = '';
  private chunks: THREE.InstancedMesh | null = null;
  private pmrem: THREE.PMREMGenerator;
  private cubeRT: THREE.WebGLCubeRenderTarget;
  private envRT: THREE.WebGLRenderTarget | null = null;
  private lastEnv = -1e9;
  private key: THREE.DirectionalLight;
  /** Órbita de la cámara alrededor del objeto (en su marco). */
  yaw = 0.35;
  pitch = 0.22;
  distance = 3.2; // en tamaños del objeto
  version = 0;

  constructor(renderer: THREE.WebGLRenderer) {
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.cubeRT = new THREE.WebGLCubeRenderTarget(64, { type: THREE.HalfFloatType, generateMipmaps: false });
    // Luz de relleno ILUSTRATIVA (como un foco junto a la cámara): la luz real que recibe el objeto
    // es la del cielo trazado (mapa de entorno), muy tenue en óptico salvo cerca de la sombra.
    this.key = new THREE.DirectionalLight('#f4f1ea', 0.75);
    this.scene.add(this.key, this.key.target, new THREE.AmbientLight('#8090a0', 0.12));
  }

  setExperiment(exp: Experiment | null): void {
    const kind = exp ? exp.cfg.object : '';
    if (kind === this.modelKind) return;
    this.modelKind = kind;
    if (this.model) {
      this.scene.remove(this.model.group);
      this.model.dispose();
      this.model = null;
    }
    if (this.chunks) {
      this.scene.remove(this.chunks);
      this.chunks.geometry.dispose();
      this.chunks = null;
    }
    if (!exp) return;
    this.model = buildModel(exp.cfg.object);
    this.scene.add(this.model.group);
    const v = this.model.view ?? { yaw: 0.35, pitch: 0.22, distance: 3.2 };
    this.yaw = v.yaw;
    this.pitch = v.pitch;
    this.distance = v.distance;
    this.model.group.matrixAutoUpdate = false;
    // Fragmentos: rocas irregulares instanciadas (forma ilustrativa, posiciones calculadas)
    const g = new THREE.IcosahedronGeometry(1, 2);
    const rng = mulberry32(77);
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const s = 0.75 + 0.5 * rng();
      pos.setXYZ(i, pos.getX(i) * s, pos.getY(i) * s, pos.getZ(i) * s);
    }
    g.computeVertexNormals();
    const spec = CATALOG[exp.cfg.object];
    this.chunks = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: spec.color, roughness: 0.8, metalness: spec.material.density > 2600 ? 0.6 : 0.05 }), 64);
    this.chunks.visible = false;
    this.scene.add(this.chunks);
    this.version++;
  }

  /** Encuadre inicial del modelo actual. */
  resetView(): void {
    const v = this.model?.view ?? { yaw: 0.35, pitch: 0.22, distance: 3.2 };
    this.yaw = v.yaw;
    this.pitch = v.pitch;
    this.distance = v.distance;
    this.version++;
  }

  get size(): number {
    return this.model?.size ?? 1;
  }

  rotate(dx: number, dy: number): void {
    this.yaw -= dx * 0.006;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch + dy * 0.006));
    this.version++;
  }

  zoom(d: number): void {
    this.distance = Math.max(0.7, Math.min(400, this.distance * Math.exp(d * 0.0012)));
    this.version++;
  }

  /** Dirección de la cámara en el marco del cuerpo: (adelante, arriba, derecha). */
  private axes(): { fwd: THREE.Vector3; up: THREE.Vector3; right: THREE.Vector3; pos: THREE.Vector3 } {
    const dir = new THREE.Vector3(Math.cos(this.pitch) * Math.cos(this.yaw), Math.cos(this.pitch) * Math.sin(this.yaw), Math.sin(this.pitch));
    const pos = dir.clone().multiplyScalar(this.distance * this.size);
    const fwd = dir.clone().negate();
    const worldUp = new THREE.Vector3(0, 0, 1);
    const right = fwd.clone().cross(worldUp).normalize();
    const up = right.clone().cross(fwd).normalize();
    return { fwd, up, right, pos };
  }

  /** Marco de la cámara comóvil para el trazador (e₀ = u del objeto). */
  frame(st: BodyState, inside: boolean): CameraFrame {
    const { fwd, up, right } = this.axes();
    const comb = (v: THREE.Vector3) => {
      const out = new Float64Array(4);
      for (let i = 0; i < 4; i++) out[i] = v.x * st.e[0][i] + v.y * st.e[1][i] + v.z * st.e[2][i];
      return out;
    };
    return {
      t: st.t,
      pos: [st.pos[0], st.pos[1], st.pos[2]],
      u: Float64Array.from(st.u),
      e: [Float64Array.from(st.u), comb(right), comb(up), comb(fwd)],
      observer: 'comoving',
      note: null,
      r: st.r,
      inside,
    };
  }

  /** Mapa de entorno trazado desde la posición del objeto (6 caras de 64²), cada ~0,5 s. */
  updateEnvironment(renderer: THREE.WebGLRenderer, tracer: RayTracer, st: BodyState, now: number, exposure: number): void {
    if (now - this.lastEnv < 500) return;
    this.lastEnv = now;
    const faces: Array<[THREE.Vector3, THREE.Vector3]> = [
      [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, -1, 0)],
      [new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, -1, 0)],
      [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)],
      [new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, -1)],
      [new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, -1, 0)],
      [new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, -1, 0)],
    ];
    const comb = (v: THREE.Vector3) => {
      const out = new Float64Array(4);
      for (let i = 0; i < 4; i++) out[i] = v.x * st.e[0][i] + v.y * st.e[1][i] + v.z * st.e[2][i];
      return out;
    };
    const prevSteps = tracer.uniforms.uMaxSteps.value;
    tracer.uniforms.uMaxSteps.value = Math.min(prevSteps, 400);
    // El cubo es de media precisión (máx. 65 504): se acota la radiancia para no generar infinitos
    tracer.uniforms.uMaxOut.value = 6.0e4;
    faces.forEach(([f, u], i) => {
      const right = f.clone().cross(u).normalize();
      tracer.setCamera({ t: st.t, pos: [st.pos[0], st.pos[1], st.pos[2]], e: [Float64Array.from(st.u), comb(right), comb(u), comb(f)], fovY: Math.PI / 2 }, 64, 64, [0, 0]);
      renderer.setRenderTarget(this.cubeRT, i);
      renderer.render(tracer.scene, tracer.camera);
    });
    tracer.uniforms.uMaxSteps.value = prevSteps;
    tracer.uniforms.uMaxOut.value = 3.0e38;
    renderer.setRenderTarget(null);
    this.envRT?.dispose();
    this.envRT = this.pmrem.fromCubemap(this.cubeRT.texture);
    this.scene.environment = this.envRT.texture;
    // Misma exposición que la imagen trazada del fondo: el modelo se ilumina de forma coherente con el cielo
    this.scene.environmentIntensity = Math.min(1e4, Math.max(1e-3, exposure));
  }

  /**
   * Dibuja el objeto sobre la imagen trazada. strain: tensor de deformación elástica estimada
   * (adimensional) en el marco del cuerpo; exaggeration: ampliación visual declarada.
   */
  render(renderer: THREE.WebGLRenderer, st: BodyState, pieces: Float32Array, fovY: number, strain: number[] | null, exaggeration: number): void {
    if (!this.model) return;
    const w = renderer.domElement.width;
    const h = renderer.domElement.height;
    const { pos } = this.axes();
    this.camera.fov = (fovY * 180) / Math.PI;
    this.camera.aspect = w / h;
    this.camera.near = this.size * 0.01;
    this.camera.far = this.size * 1e4;
    this.camera.position.copy(pos);
    this.camera.up.set(0, 0, 1);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
    this.model.update?.({ tau: st.tau, t: st.t, tidal: st.tidal });
    // Deformación elástica lineal (ampliada a petición): x → (I + k·ε) x aplicada al cuerpo entero
    const M = this.model.group.matrix;
    if (strain && exaggeration > 1) {
      const k = exaggeration;
      M.set(1 + k * strain[0], k * strain[1], k * strain[2], 0, k * strain[1], 1 + k * strain[3], k * strain[4], 0, k * strain[2], k * strain[4], 1 + k * strain[5], 0, 0, 0, 0, 1);
    } else M.identity();
    this.model.group.matrixWorldNeedsUpdate = true;
    const nPieces = pieces.length / 4;
    const broken = nPieces > 1;
    this.model.group.visible = !broken;
    if (this.chunks) {
      this.chunks.visible = broken;
      if (broken) {
        const m = new THREE.Matrix4();
        const base = this.size * 0.42;
        const rng = mulberry32(3);
        for (let i = 0; i < Math.min(64, nPieces); i++) {
          const s = pieces[4 * i + 3] * base;
          const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rng() * 6, rng() * 6, rng() * 6));
          m.compose(new THREE.Vector3(pieces[4 * i], pieces[4 * i + 1], pieces[4 * i + 2]), q, new THREE.Vector3(s, s * (0.7 + 0.5 * rng()), s * (0.6 + 0.4 * rng())));
          this.chunks.setMatrixAt(i, m);
        }
        this.chunks.count = Math.min(64, nPieces);
        this.chunks.instanceMatrix.needsUpdate = true;
      }
    }
    // Relleno ilustrativo desde la cámara
    this.key.position.copy(pos);
    this.key.target.position.set(0, 0, 0);
    renderer.setRenderTarget(null);
    renderer.clearDepth();
    const prevTM = renderer.toneMapping;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.render(this.scene, this.camera);
    renderer.toneMapping = prevTM;
  }

  dispose(): void {
    this.setExperiment(null);
    this.cubeRT.dispose();
    this.envRT?.dispose();
    this.pmrem.dispose();
  }
}
