/**
 * Vista previa giratoria del objeto seleccionado en el catálogo (lienzo pequeño propio).
 * Arrastrar con el ratón o el dedo lo gira; si no se toca, rota despacio.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildModel, type ObjectModel } from './models';
import type { ObjectKind } from '../../simulation/types';

export class Preview {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1, 0.01, 1e7);
  private model: ObjectModel | null = null;
  private pivot = new THREE.Group();
  private yaw = 0.6;
  private pitch = -0.35;
  private vYaw = 0.35;
  private dragging = false;
  private raf = 0;
  private last = 0;
  private kind: ObjectKind | null = null;
  private cleanup: () => void;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.65;
    const key = new THREE.DirectionalLight('#ffd7a0', 2.4);
    key.position.set(-2, 1.5, 2);
    this.scene.add(key, new THREE.AmbientLight('#5a6878', 0.6), this.pivot);
    let lx = 0;
    let ly = 0;
    const down = (e: PointerEvent) => {
      this.dragging = true;
      lx = e.clientX;
      ly = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!this.dragging) return;
      this.yaw += (e.clientX - lx) * 0.012;
      this.pitch = Math.max(-1.3, Math.min(1.3, this.pitch + (e.clientY - ly) * 0.012));
      this.vYaw = (e.clientX - lx) * 0.6;
      lx = e.clientX;
      ly = e.clientY;
    };
    const up = () => {
      this.dragging = false;
    };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    this.cleanup = () => {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
    };
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      if (!this.dragging) {
        this.vYaw += (0.35 - this.vYaw) * Math.min(1, dt * 1.5);
        this.yaw += this.vYaw * dt;
      }
      this.draw();
    };
    this.raf = requestAnimationFrame(loop);
  }

  setKind(kind: ObjectKind): void {
    if (kind === this.kind) return;
    this.kind = kind;
    if (this.model) {
      this.pivot.remove(this.model.group);
      this.model.dispose();
    }
    this.model = buildModel(kind);
    const box = new THREE.Box3().setFromObject(this.model.group);
    const c = box.getCenter(new THREE.Vector3());
    this.model.group.position.sub(c);
    this.pivot.add(this.model.group);
    const r = box.getSize(new THREE.Vector3()).length() / 2;
    this.camera.position.set(0, 0, (r / Math.tan((16 * Math.PI) / 180)) * 1.05);
    this.camera.near = r * 0.01;
    this.camera.far = r * 100;
    this.camera.updateProjectionMatrix();
  }

  private draw(): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w === 0 || h === 0) return;
    const dpr = this.renderer.getPixelRatio();
    if (this.canvas.width !== Math.floor(w * dpr) || this.canvas.height !== Math.floor(h * dpr)) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    this.pivot.rotation.set(this.pitch, this.yaw, 0, 'XYZ');
    this.model?.update?.({ tau: (performance.now() / 1000) * 19.7, t: 0 });
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.cleanup();
    this.model?.dispose();
    this.renderer.dispose();
  }
}
