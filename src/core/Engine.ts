/**
 * The rendering engine: owns the WebGL renderer, the post-processing composer,
 * the perspective camera, resize handling and the RAF loop.
 *
 * Post chain, in order:
 *   render → lensing → starburst → bloom → grade → output
 *
 * Starburst sits *before* bloom deliberately: the spikes and the anamorphic
 * streak are light, so bloom should bleed off them the same way it bleeds off the
 * star. Putting it after bloom gives hard-edged decals pasted over the frame.
 *
 * Design choices for stability & close-ups:
 *  - logarithmic depth buffer to fight z-fighting across the huge dynamic range
 *    of scales (surface relief vs. a star field decades away);
 *  - dynamic near/far planes updated by the camera rig for extreme zoom;
 *  - half-float render targets, so the HDR values the star shader emits survive
 *    the chain instead of clipping at 1.0 before tone mapping;
 *  - pauses simulation when the tab is hidden (visibilitychange) to save power.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { LensingShader } from '../shaders/lensing.ts';
import { StarburstShader } from '../shaders/starburst.ts';
import { GradeShader } from '../shaders/grade.ts';
import type { QualitySettings } from './QualityManager.ts';

export type UpdateFn = (dt: number, elapsed: number) => void;

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly composer: EffectComposer;

  private bloomPass: UnrealBloomPass;
  private lensingPass: ShaderPass;
  private starburstPass: ShaderPass;
  private gradePass: ShaderPass;
  private outputPass: OutputPass;
  private renderPass: RenderPass;

  private clock = new THREE.Clock();
  private updaters: UpdateFn[] = [];
  private rafId = 0;
  private running = false;
  private hidden = false;
  private settings: QualitySettings;
  private onResizeCbs: Array<(w: number, h: number) => void> = [];

  constructor(canvas: HTMLCanvasElement, settings: QualitySettings) {
    this.settings = settings;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: settings.msaa > 0,
      powerPreference: 'high-performance',
      logarithmicDepthBuffer: true,
      stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, settings.pixelRatio));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    // Khronos PBR Neutral: rolls highlights cleanly to white while preserving
    // hue, which is what this frame needs — ACES shears bright blues toward cyan
    // and AgX desaturates the midtones so far that the star reads as grey.
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    // Pure black. The galactic dome supplies every non-zero pixel of the sky.
    this.scene.background = new THREE.Color(0x000000);

    this.camera = new THREE.PerspectiveCamera(
      48, // slightly long lens: less wide-angle distortion, more cinematic
      window.innerWidth / window.innerHeight,
      0.01,
      8000,
    );
    this.camera.position.set(0, 2.5, 7);

    // ── post chain ──────────────────────────────────────────────────────────
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: settings.msaa,
      colorSpace: THREE.LinearSRGBColorSpace,
    });
    this.composer = new EffectComposer(this.renderer, rt);

    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    this.lensingPass = new ShaderPass(LensingShader);
    this.composer.addPass(this.lensingPass);

    this.starburstPass = new ShaderPass(StarburstShader);
    this.composer.addPass(this.starburstPass);

    // Threshold sits just under 1: the star shader keeps the crust below that and
    // lets only caps, seams, rim, corona and beams overshoot, so bloom picks out
    // the emissive features and leaves the crust crisp.
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      1.15, // strength
      0.85, // radius
      0.78, // threshold
    );
    this.composer.addPass(this.bloomPass);

    this.gradePass = new ShaderPass(GradeShader);
    this.composer.addPass(this.gradePass);

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
    this.starburstPass.enabled = settings.starburst;
    this.handleResize();
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

  /** Point the aperture starburst at the star. */
  updateStarburst(screen: THREE.Vector2, radius: number): void {
    const u = this.starburstPass.uniforms;
    u.uStarScreen.value.copy(screen);
    u.uStarRadius.value = radius;
    u.uAspect.value = this.camera.aspect;
  }

  /** Pulse the flare when a beam sweeps the observer. */
  setStarburstFlare(flare: number): void {
    this.starburstPass.uniforms.uFlare.value = flare;
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
    this.gradePass.uniforms.uTime.value = elapsed;
    this.starburstPass.uniforms.uTime.value = elapsed;
    for (const fn of this.updaters) fn(dt, elapsed);
    this.composer.render();
  };

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
