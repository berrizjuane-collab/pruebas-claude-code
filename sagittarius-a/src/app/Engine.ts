/**
 * Motor de la aplicación: bucle de render, tiempo de simulación, cámara relativista,
 * resolución dinámica, acumulación progresiva y composición de capas.
 *
 * Capas por fotograma:
 *  1. Trazado relativista (GPU) → objetivo HDR a escala de render variable.
 *  2. Acumulación (progresiva con cámara quieta; media móvil si el tiempo avanza).
 *  3. Composición: exposición, mapeo tonal / mapa de color del perfil, bloom (estético).
 *  4. Superposiciones de diagrama (Three.js, coordenadas KS) y vista local del objeto.
 */
import * as THREE from 'three';
import { store, toast, type AppState } from './store';
import { RayTracer, type TracerSettings } from '../rendering/raytracer/RayTracer';
import { defaultTracerSettings, plasmaUniformsFor, QUALITY } from '../rendering/raytracer/settings';
import { Post } from '../rendering/postprocessing/Post';
import { CameraController, type Pose } from '../camera/CameraController';
import { RelativisticCamera, type CameraFrame } from '../camera/RelativisticCamera';
import { blackHoleScales, type BlackHoleScales } from '../physics/sgra';
import { DEFAULT_RIAF, type RiafParams } from '../physics/emission/riaf';
import { horizons } from '../physics/metrics/kerr';
import { ksMinusBL } from '../physics/metrics/kerr';

/** Secuencia de Halton (2, 3) para la fluctuación subpíxel. */
function halton(i: number, b: number): number {
  let f = 1;
  let r = 0;
  while (i > 0) {
    f /= b;
    r += f * (i % b);
    i = Math.floor(i / b);
  }
  return r;
}

export interface FrameHooks {
  /** Antes de trazar: permite subir balizas para el instante de la cámara. */
  beforeTrace?: (frame: CameraFrame, tracer: RayTracer) => void;
  /** Tras componer: superposiciones (diagrama, vista local). */
  afterComposite?: (frame: CameraFrame, pose: Pose, renderer: THREE.WebGLRenderer) => void;
  /** Avance del tiempo de simulación (dt en M); devuelve el nuevo t si lo gobierna otro reloj. */
  advance?: (t: number, dtM: number) => number | null;
  /** ¿Cambia la escena con el tiempo (objetos en movimiento)? */
  dynamic?: () => boolean;
  /** Objetivo de seguimiento (posición coordenada) o null. */
  followTarget?: () => [number, number, number] | null;
  /** Cámara impuesta por otra perspectiva (p. ej. comóvil con un objeto). */
  overrideFrame?: (t: number, pose: Pose) => CameraFrame | null;
  /** Versión de una cámara externa (vista B): si cambia, se reinicia la acumulación. */
  cameraVersion?: () => number;
}

export interface BenchmarkResult {
  fps: number;
  msPerFrame: number;
  width: number;
  height: number;
  raysPerSecond: number;
  frames: number;
  gpu: string;
}

export class Engine {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: THREE.WebGLRenderer;
  readonly tracer: RayTracer;
  readonly post: Post;
  readonly nav = new CameraController();
  readonly relCam: RelativisticCamera;
  hooks: FrameHooks = {};
  /** Tiempo coordenado de Kerr–Schild de la simulación [M]. */
  t = 0;
  scales: BlackHoleScales;
  /** Últimos ajustes aplicados al trazador (para consultas externas). */
  settings: TracerSettings;
  private settingsKey = '';
  private lastNavVersion = -1;
  private lastFovDeg = NaN;
  private bench: { frames: number; t0: number } | null = null;
  private frameIndex = 0;
  private sampleIndex = 0;
  private lastTime = 0;
  private renderScale = 0.6;
  private frameTimes: number[] = [];
  private exposure = 1;
  private white = 1;
  private ehtMax = 1;
  private ehtFlux: number | null = null;
  private ehtRing: number | null = null;
  private lastPublish = 0;
  private gpuName = '';
  private running = false;
  private idle = false;
  /** Fotogramas totales acumulados en la imagen actual. */
  get samples(): number {
    return this.post.samples;
  }
  /** Forzar captura de alta calidad (resolución completa y N muestras). */
  captureRequest: { samples: number; scale: number; resolve: (c: HTMLCanvasElement) => void } | null = null;
  fixedScale: number | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    this.renderer.autoClear = false;
    this.renderer.setPixelRatio(1);
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    this.gpuName = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
    this.tracer = new RayTracer();
    this.post = new Post(this.renderer);
    const s = store.get();
    this.scales = blackHoleScales(s.massSolar, s.distanceKpc);
    this.relCam = new RelativisticCamera(s.spin);
    this.relCam.observer = s.observer;
    this.nav.limits = { minRadius: (dir) => this.relCam.minRadius(dir), maxRadius: 2e4 };
    this.settings = defaultTracerSettings(s.spin, s.quality);
    this.nav.autoOrbit = 0.012;
    store.subscribe(() => this.onStore(store.get()));
    this.onStore(s);
  }

  private onStore(s: AppState): void {
    if (Math.abs(this.relCam.ks.a - s.spin) > 1e-12) {
      this.relCam.setSpin(s.spin);
      this.nav.version++;
    }
    if (this.relCam.observer !== s.observer) {
      this.relCam.observer = s.observer;
      this.nav.version++;
    }
    this.nav.settings = { rotateSensitivity: s.sensitivity, zoomSensitivity: s.sensitivity, moveSpeed: s.moveSpeed, inertia: s.inertia };
    if (this.nav.mode !== s.navMode) this.nav.setMode(s.navMode);
    this.fixedScale = s.fixedScale;
    const sc = this.scales;
    if (sc.massSolar !== s.massSolar || sc.distanceKpc !== s.distanceKpc) this.scales = blackHoleScales(s.massSolar, s.distanceKpc);
    this.idle = false;
  }

  riafParams(s: AppState): RiafParams {
    return { ...DEFAULT_RIAF, ...s.riaf, turbulence: s.turbulence, hotspotAmp: s.hotspot ? 2.5 : 0 };
  }

  /** Ajustes del trazador para el estado actual. */
  private buildSettings(s: AppState, frame: CameraFrame): TracerSettings {
    const st = defaultTracerSettings(s.spin, s.quality);
    st.profile = s.profile;
    st.plasmaOn = s.plasmaOn && s.profile !== 'spacetime';
    st.starsOn = s.starsOn && s.profile !== 'eht';
    st.gridOn = s.gridOn && s.profile === 'spacetime';
    st.nus = s.profile === 'eht' ? [230e9] : [86e9, 230e9, 690e9];
    st.rgCm = this.scales.rg * 100;
    st.plasma = plasmaUniformsFor(s.spin, this.riafParams(s));
    st.rEscape = Math.max(1000, 1.5 * frame.r);
    st.intensityScale = 1e3;
    st.starGain = s.profile === 'spacetime' ? 1.6 : 0.006;
    st.bandGain = s.profile === 'spacetime' ? 0.9 : 0.006;
    const q = QUALITY[s.quality];
    st.maxSteps = q.maxSteps;
    return st;
  }

  /** Cámara del perfil EHT: observador estático lejano (r = 10⁴ M) en la dirección de la vista. */
  private ehtFrame(s: AppState, pose: Pose, t: number): CameraFrame {
    const R = 1e4;
    const n = Math.hypot(...pose.pos);
    const dir: [number, number, number] = [pose.pos[0] / n, pose.pos[1] / n, pose.pos[2] / n];
    const pos: [number, number, number] = [dir[0] * R, dir[1] * R, dir[2] * R];
    const fwd: [number, number, number] = [-dir[0], -dir[1], -dir[2]];
    // arriba: proyección del eje de espín (z) sobre el plano del cielo
    let up: [number, number, number] = [-dir[2] * dir[0], -dir[2] * dir[1], 1 - dir[2] * dir[2]];
    const un = Math.hypot(...up);
    up = un > 1e-6 ? [up[0] / un, up[1] / un, up[2] / un] : [0, 1, 0];
    const obs = this.relCam.observer;
    this.relCam.observer = 'static';
    // Retardo de la luz desde la región central hasta el observador lejano: la imagen muestra el «ahora»
    const delay = R + ksMinusBL(R, s.spin).h;
    const f = this.relCam.frame({ pos, fwd, up }, t + delay);
    this.relCam.observer = obs;
    return f;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      this.frame(now);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
  }

  /** Fotogramas presentados desde el arranque. */
  get frames(): number {
    return this.frameIndex;
  }

  get gpu(): string {
    return this.gpuName;
  }

  /**
   * Banco de pruebas honesto: durante `seconds` se traza un fotograma completo en cada vuelta
   * (sin reutilizar la acumulación) a la escala de render indicada, y se mide el tiempo real.
   */
  async benchmark(seconds = 5, scale = 1): Promise<BenchmarkResult> {
    // La escala se fija en el estado (el motor la relee en cada cambio del almacén)
    const prev = store.get().fixedScale;
    store.set({ fixedScale: scale });
    // medio segundo de calentamiento (compilación, tamaños de los objetivos)
    this.bench = { frames: 0, t0: performance.now() };
    await new Promise((r) => setTimeout(r, 500));
    this.bench = { frames: 0, t0: performance.now() };
    await new Promise((r) => setTimeout(r, seconds * 1000));
    const b = this.bench;
    this.bench = null;
    store.set({ fixedScale: prev });
    const dt = (performance.now() - b.t0) / 1000;
    const w = Math.round(this.canvas.width * scale);
    const h = Math.round(this.canvas.height * scale);
    const fps = b.frames / dt;
    return { fps, msPerFrame: (1000 * dt) / Math.max(1, b.frames), width: w, height: h, raysPerSecond: fps * w * h, frames: b.frames, gpu: this.gpuName };
  }

  /** Solicita una captura con n muestras acumuladas (por defecto a resolución completa). */
  capture(samples = 32, scale = 1): Promise<HTMLCanvasElement> {
    return new Promise((resolve) => {
      this.captureRequest = { samples, scale, resolve };
      this.post.resetAccumulation();
      this.idle = false;
    });
  }

  private resize(): { w: number; h: number } {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.renderer.setSize(w, h, false);
      this.post.resetAccumulation();
    }
    return { w, h };
  }

  /**
   * Estado efectivo del fotograma. En la vista B la cámara viaja con el objeto: por defecto se
   * muestra la luz ÓPTICA, en la que el flujo de Sgr A* es transparente y casi no emite (su
   * sincrotrón cae como exp(−(ν/ν_s)^⅓) muy por debajo del visible), es decir, el perfil
   * «espacio-tiempo»; en banda milimétrica se usa el cinematográfico (el EHT es un observador terrestre).
   */
  private effectiveState(s0: AppState): AppState {
    if (s0.view !== 'object') return s0;
    const profile = s0.objectBand === 'optico' ? 'spacetime' : s0.profile === 'eht' ? 'cinematic' : s0.profile;
    return profile === s0.profile ? s0 : { ...s0, profile };
  }

  /** Exposición lineal aplicada en la composición (para iluminar coherentemente los modelos 3D). */
  get currentExposure(): number {
    return this.exposure;
  }

  frame(now: number): void {
    const dtReal = Math.min(0.1, Math.max(0, (now - this.lastTime) / 1000));
    this.lastTime = now;
    const s = this.effectiveState(store.get());
    const { w, h } = this.resize();

    // --- Tiempo de simulación ---
    const prevT = this.t;
    if (s.running) {
      const dtM = (dtReal * s.timeScale) / this.scales.tg;
      const tNew = this.hooks.advance?.(this.t, dtM);
      this.t = tNew ?? this.t + dtM;
    }

    // --- Cámara ---
    if (s.fovDeg !== this.lastFovDeg) {
      // El campo de visión lo fija la interfaz; el zoom óptico (Alt + rueda) lo devuelve al estado
      this.lastFovDeg = s.fovDeg;
      this.nav.fovY = (s.fovDeg * Math.PI) / 180;
    }
    this.nav.update(dtReal, this.hooks.followTarget?.() ?? null);
    const pose = this.nav.pose();
    let frame: CameraFrame;
    if (this.relCam.dive) {
      if (s.running) {
        const dTau = (dtReal * s.timeScale) / this.scales.tg;
        this.t = this.relCam.stepDive(dTau);
      }
      frame = this.relCam.frame(pose, this.t);
    } else {
      frame = this.hooks.overrideFrame?.(this.t, pose) ?? (s.profile === 'eht' ? this.ehtFrame(s, pose, this.t) : this.relCam.frame(pose, this.t));
    }

    // --- Ajustes y detección de cambios ---
    const settings = this.buildSettings(s, frame);
    const key = JSON.stringify([settings, s.exposureEV, s.autoExposure, s.bloom, s.ehtBeam, s.beamFwhmMuas, s.ehtFovM]);
    const camVersion = this.nav.version + (this.hooks.cameraVersion?.() ?? 0);
    const camMoved = camVersion !== this.lastNavVersion;
    const settingsChanged = key !== this.settingsKey;
    const timeMoved = this.t !== prevT;
    const dynamic = timeMoved && ((settings.plasmaOn && settings.plasma.turbulence + settings.plasma.hotspot[0] > 0) || !!this.hooks.dynamic?.() || !!this.relCam.dive);
    if (camMoved || settingsChanged || (timeMoved && !!this.relCam.dive)) {
      this.post.resetAccumulation();
      this.sampleIndex = 0;
      this.idle = false;
    }
    this.lastNavVersion = camVersion;
    this.settingsKey = key;
    this.settings = settings;

    const maxSamples = this.captureRequest ? this.captureRequest.samples : s.quality === 'high' ? 256 : 48;
    if (this.idle && !dynamic && !this.captureRequest && !this.hooks.afterComposite) {
      this.publish(now, s, frame);
      return;
    }

    // --- Resolución dinámica ---
    const moving = camMoved || this.nav.autoOrbit !== 0;
    let scale = this.renderScale;
    if (this.captureRequest) scale = this.captureRequest.scale;
    else if (this.fixedScale) scale = this.fixedScale;
    const rw = Math.max(16, Math.round(w * scale));
    const rh = Math.max(16, Math.round(h * scale));
    this.post.setSize(rw, rh);

    // --- Trazado ---
    const accumulateMore = this.post.samples < maxSamples || dynamic || !!this.bench;
    if (accumulateMore) {
      const j = this.sampleIndex++;
      const jitter: [number, number] = this.post.samples === 0 ? [0, 0] : [halton(j + 1, 2) - 0.5, halton(j + 1, 3) - 0.5];
      this.tracer.setSettings(settings);
      this.tracer.uniforms.uCamInside.value = frame.inside ? 1 : 0;
      // Balizas (ilustrativas): con g = 1 brillan como el punto blanco de la imagen, de modo que se
      // distinguen sobre el plasma; el factor g⁴ conserva el enrojecimiento y el apagado físicos.
      this.tracer.uniforms.uMarkerGain.value = s.profile === 'cinematic' ? Math.max(this.white, 1e-6) : s.profile === 'spacetime' ? 0.85 / Math.max(this.exposure, 1e-12) : 1;
      this.tracer.setCamera({ t: frame.t, pos: frame.pos, e: frame.e, fovY: s.profile === 'eht' ? 2 * Math.atan(s.ehtFovM / 1e4) : this.nav.fovY }, rw, rh, jitter);
      this.hooks.beforeTrace?.(frame, this.tracer);
      const t0 = performance.now();
      this.tracer.render(this.renderer, this.post.trace);
      this.post.accumulate(this.renderer, maxSamples, dynamic ? (this.hooks.dynamic?.() ? 0.6 : 0.3) : this.bench ? 0.5 : 0);
      const gl = this.renderer.getContext();
      if (this.frameIndex % 30 === 0 || this.bench) gl.finish();
      if (this.bench) this.bench.frames++;
      const traceMs = performance.now() - t0;
      void traceMs;
    } else {
      this.idle = !dynamic;
    }

    // --- Estadísticas para exposición y normalización EHT ---
    const src = this.post.source(this.renderer, { profile: this.profileIndex(s), exposure: this.exposure, bloom: s.bloom, ehtMax: this.ehtMax, beamSigmaPx: this.beamSigmaPx(s, rh) });
    if (this.frameIndex % 12 === 0 || this.post.samples <= 2) this.updateStats(s, src, rh);

    // --- Composición a pantalla ---
    this.renderer.setRenderTarget(null);
    this.renderer.setViewport(0, 0, w, h);
    this.post.composite(this.renderer, src, { profile: this.profileIndex(s), exposure: this.exposure, bloom: s.profile === 'cinematic' ? s.bloom : 0, ehtMax: this.ehtMax, beamSigmaPx: 0, white: this.white, contrast: 14 }, this.frameIndex);
    this.hooks.afterComposite?.(frame, pose, this.renderer);

    // --- Resolución dinámica: medir y adaptar ---
    this.frameTimes.push(dtReal * 1000);
    if (this.frameTimes.length > 20) this.frameTimes.shift();
    if (!this.captureRequest && !this.fixedScale && this.frameTimes.length >= 6) {
      const avg = this.frameTimes.reduce((p, q) => p + q, 0) / this.frameTimes.length;
      const target = moving || dynamic ? 30 : 45;
      if (avg > target * 1.25) this.renderScale = Math.max(0.3, this.renderScale * 0.92);
      else if (avg < target * 0.7) this.renderScale = Math.min(s.quality === 'high' ? 1 : 0.85, this.renderScale * 1.04);
    }

    if (this.captureRequest && this.post.samples >= this.captureRequest.samples) {
      const req = this.captureRequest;
      this.captureRequest = null;
      req.resolve(this.canvas);
    }
    this.frameIndex++;
    this.publish(now, s, frame);
  }

  private profileIndex(s: AppState): 0 | 1 | 2 {
    return s.profile === 'cinematic' ? 0 : s.profile === 'eht' ? 1 : 2;
  }

  /** σ del haz gaussiano del EHT en píxeles de la imagen trazada. */
  private beamSigmaPx(s: AppState, rh: number): number {
    if (s.profile !== 'eht' || !s.ehtBeam) return 0;
    const fwhmM = s.beamFwhmMuas / this.scales.thetaGMuas;
    const pxPerM = rh / (2 * s.ehtFovM);
    return (fwhmM / 2.3548) * pxPerM;
  }

  private updateStats(s: AppState, src: THREE.WebGLRenderTarget, rh: number): void {
    const px = this.post.readStats(this.renderer, src);
    const n = px.length / 4;
    if (s.profile === 'eht') {
      let mx = 0;
      for (let i = 0; i < n; i++) mx = Math.max(mx, px[4 * i]);
      if (mx > 0) this.ehtMax = this.ehtMax > 0 && this.post.samples > 3 ? 0.7 * this.ehtMax + 0.3 * mx : mx;
      // Flujo total: suma de I × ángulo sólido (impacto en M → rad con θ_g), sobre la imagen completa
      this.computeEhtMetrics(s, rh);
      return;
    }
    const lum: number[] = [];
    for (let i = 0; i < n; i++) lum.push(0.2126 * px[4 * i] + 0.7152 * px[4 * i + 1] + 0.0722 * px[4 * i + 2]);
    lum.sort((a, b) => a - b);
    const p995 = lum[Math.floor(0.995 * (n - 1))];
    const p999 = lum[Math.floor(0.999 * (n - 1))];
    const ev = Math.pow(2, s.exposureEV);
    if (s.profile === 'cinematic') {
      // Exposición fija (1) y blanco de referencia en el percentil 99,9: la curva logarítmica hace el resto
      const wantW = s.autoExposure ? Math.max(p999, 1e-9) : 30;
      this.white = this.post.samples <= 2 ? wantW : this.white * 0.75 + wantW * 0.25;
      this.exposure = ev;
      return;
    }
    const target = s.autoExposure ? (p995 > 1e-9 ? 0.85 / p995 : this.exposure) : 1;
    const want = target * ev;
    this.exposure = this.post.samples <= 2 ? want : this.exposure * 0.75 + want * 0.25;
  }

  /** Lectura completa (no reducida) para flujo total y diámetro del anillo en el perfil EHT. */
  private computeEhtMetrics(s: AppState, _rh: number): void {
    if (this.frameIndex % 60 !== 0 && this.post.samples > 3) return;
    const rt = this.post.current;
    const W = rt.width;
    const H = rt.height;
    const px = new Float32Array(W * H * 4);
    this.renderer.readRenderTargetPixels(rt, 0, 0, W, H, px);
    const pixM = (2 * s.ehtFovM) / H;
    const thetaG = this.scales.thetaGMuas / (206264.80624709636 * 1e6);
    let sum = 0;
    const nb = 80;
    const prof = new Float64Array(nb);
    const cnt = new Float64Array(nb);
    const maxR = s.ehtFovM;
    for (let j = 0; j < H; j++)
      for (let i = 0; i < W; i++) {
        const I = px[4 * (j * W + i)] / 1e3; // uIntensityScale = 1e3
        sum += I;
        const ax = (i + 0.5 - W / 2) * pixM;
        const by = (j + 0.5 - H / 2) * pixM;
        const rr = Math.hypot(ax, by);
        const k = Math.floor((rr / maxR) * nb);
        if (k < nb) {
          prof[k] += I;
          cnt[k]++;
        }
      }
    this.ehtFlux = 1e23 * sum * pixM * pixM * thetaG * thetaG;
    let kmax = 0;
    for (let k = 0; k < nb; k++) {
      prof[k] /= Math.max(1, cnt[k]);
      if (prof[k] > prof[kmax]) kmax = k;
    }
    this.ehtRing = 2 * ((kmax + 0.5) / nb) * maxR * this.scales.thetaGMuas;
  }

  private publish(now: number, s: AppState, frame: CameraFrame): void {
    if (now - this.lastPublish < 120) return;
    const dt = now - this.lastPublish;
    this.lastPublish = now;
    const fps = this.frameTimes.length ? 1000 / (this.frameTimes.reduce((p, q) => p + q, 0) / this.frameTimes.length) : 0;
    void dt;
    const { rPlus } = horizons(s.spin);
    const d = this.relCam.dive;
    // Mantener la interfaz al día con los cambios hechos desde la propia navegación
    const fovDeg = Math.round(((this.nav.fovY * 180) / Math.PI) * 100) / 100;
    if (Math.abs(fovDeg - s.fovDeg) > 0.01) {
      this.lastFovDeg = fovDeg;
      store.set({ fovDeg });
    }
    if (this.nav.mode !== s.navMode) store.set({ navMode: this.nav.mode });
    const th = Math.acos(Math.max(-1, Math.min(1, frame.pos[2] / Math.max(1e-9, Math.hypot(...frame.pos)))));
    store.set({
      live: {
        t: this.t,
        camR: frame.r,
        camTheta: (th * 180) / Math.PI,
        camObserver: frame.observer,
        camNote: frame.note,
        camInside: frame.r < rPlus,
        camTau: d ? d.tau : 0,
        fps,
        frameMs: fps > 0 ? 1000 / fps : 0,
        renderScale: this.renderScale,
        samples: this.post.samples,
        steps: QUALITY[s.quality].maxSteps,
        rayRate: 0,
        gpu: this.gpuName,
        ehtFluxJy: s.profile === 'eht' ? this.ehtFlux : null,
        ehtRingMuas: s.profile === 'eht' ? this.ehtRing : null,
        diving: !!d,
        diveInfo: d ? (d.ended ? `Fin del dominio clásico en r = ${d.ended.r.toFixed(3)} M` : d.horizon ? 'Dentro del horizonte' : 'En caída libre') : null,
      },
    });
  }

  startDive(): void {
    if (this.relCam.dive) return;
    this.relCam.startDive(this.nav.pose(), this.t);
    toast('Caída libre: la cámara sigue ahora una geodésica temporal. No podrá volver a salir del horizonte.', 'evento');
    this.post.resetAccumulation();
  }

  endDive(): void {
    const start = this.relCam.endDive();
    if (start) toast('Reinicio de software: la cámara vuelve a su posición previa (no es un movimiento físico).', 'info');
    this.nav.version++;
  }
}
