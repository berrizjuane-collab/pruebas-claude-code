/**
 * The rendering engine: owns the WebGL renderer, the post-processing composer,
 * the perspective camera, the resize handling and the RAF loop.
 *
 * Design choices for stability & close-ups:
 *  - logarithmic depth buffer to fight z-fighting across the huge dynamic range
 *    of scales (surface millimetres of relief vs. a light-cylinder decades away);
 *  - dynamic near/far planes updated by the camera rig for extreme zoom;
 *  - pauses simulation when the tab is hidden (visibilitychange) to save power;
 *  - post chain rebuilt cheaply when the quality tier changes.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { LensingShader } from '../shaders/lensing.ts';
import type { QualitySettings } from './QualityManager.ts';

export type UpdateFn = (dt: number, elapsed: number) => void;

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly composer: EffectComposer;

  private bloomPass: UnrealBloomPass;
  private lensingPass: ShaderPass;
  private outputPass: OutputPass;
  private renderPass: RenderPass;

  private clock = new THREE.Clock();
  private updaters: UpdateFn[] = [];
  private rafId = 0;
  private running = false;
  private hidden = false;
  private settings: QualitySettings;
  private onResizeCbs: Array<(w: number, h: number) => void> = [];
  private pendingCapture: ((dataUrl: string) => void) | null = null;

  constructor(canvas: HTMLCanvasElement, settings: QualitySettings) {
    this.settings = settings;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: settings.msaa > 0,
      powerPreference: 'high-performance',
      logarithmicDepthBuffer: true,
      stencil: false,
      // Needed so the screenshot capture can read back a valid frame buffer.
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, settings.pixelRatio));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x02030a);

    this.camera = new THREE.PerspectiveCamera(
      55,
      window.innerWidth / window.innerHeight,
      0.01,
      5000,
    );
    this.camera.position.set(0, 2.5, 7);

    // Post-processing chain.
    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    this.lensingPass = new ShaderPass(LensingShader);
    this.composer.addPass(this.lensingPass);

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.55, // strength — deliberately restrained
      0.7, // radius
      0.85, // threshold (only genuinely bright things bloom)
    );
    this.composer.addPass(this.bloomPass);

    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);

    this.applySettings(settings);

    window.addEventListener('resize', this.handleResize);
    document.addEventListener('visibilitychange', this.handleVisibility);
    this.handleResize();
  }

  /** Register a per-frame update callback. */
  addUpdater(fn: UpdateFn): void {
    this.updaters.push(fn);
  }

  onResize(cb: (w: number, h: number) => void): void {
    this.onResizeCbs.push(cb);
  }

  /** Reconfigure the passes for a new quality tier. */
  applySettings(settings: QualitySettings): void {
    this.settings = settings;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, settings.pixelRatio));
    this.bloomPass.enabled = settings.bloom;
    this.lensingPass.enabled = settings.lensing;
    // Keep composer buffers in step with the pixel ratio.
    this.handleResize();
  }

  setBloom(strength: number, radius: number, threshold: number): void {
    this.bloomPass.strength = strength;
    this.bloomPass.radius = radius;
    this.bloomPass.threshold = threshold;
  }

  setLensingEnabled(on: boolean): void {
    this.lensingPass.enabled = on && this.settings.lensing;
  }

  /** Update the lensing uniforms (called by the world each frame). */
  updateLensing(screen: THREE.Vector2, radius: number, strength: number, active: boolean): void {
    const u = this.lensingPass.uniforms;
    u.uStarScreen.value.copy(screen);
    u.uStarRadius.value = radius;
    u.uStrength.value = strength;
    u.uAspect.value = this.camera.aspect;
    u.uActive.value = active ? 1 : 0;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    this.loop();
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private loop = (): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.loop);
    // When hidden, throttle hard: skip work entirely.
    if (this.hidden) return;
    const dt = Math.min(this.clock.getDelta(), 0.1); // clamp huge deltas
    const elapsed = this.clock.elapsedTime;
    for (const fn of this.updaters) fn(dt, elapsed);
    this.composer.render();
    // Capture within the same frame so the drawing buffer is still valid.
    if (this.pendingCapture) {
      const cb = this.pendingCapture;
      this.pendingCapture = null;
      cb(this.renderer.domElement.toDataURL('image/png'));
    }
  };

  /** Grab a PNG data URL of the next rendered frame (for screenshots). */
  requestCapture(cb: (dataUrl: string) => void): void {
    this.pendingCapture = cb;
  }

  private handleResize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.settings.pixelRatio));
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.bloomPass.resolution.set(w, h);
    for (const cb of this.onResizeCbs) cb(w, h);
  };

  private handleVisibility = (): void => {
    this.hidden = document.hidden;
    if (!this.hidden) this.clock.getDelta(); // discard the long gap
  };

  dispose(): void {
    this.stop();
    window.removeEventListener('resize', this.handleResize);
    document.removeEventListener('visibilitychange', this.handleVisibility);
    this.composer.dispose();
    this.renderer.dispose();
  }
}
