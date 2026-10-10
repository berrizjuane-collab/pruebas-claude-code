/**
 * Orquestación: escena, cámara, terreno, rutas, marcadores, calidad y UI.
 * Render bajo demanda: solo se dibuja mientras algo se mueve (interacción,
 * amortiguación, transición, geomorphing, autorrotación) o cambia el estado.
 */
import * as THREE from 'three';
import type { AtlasData, Poi, RingName } from './data/types.ts';
import type { BuildResult } from './terrain/protocol.ts';
import { Terrain } from './terrain/terrain.ts';
import { buildSerac } from './terrain/serac.ts';
import { Environment, LIGHT_PRESETS } from './scene/environment.ts';
import { Clouds } from './scene/clouds.ts';
import { Routes } from './routes/routes.ts';
import { PoiMarkers } from './poi/markers.ts';
import { CameraController } from './camera/controller.ts';
import { buildLimits, resolveView } from './camera/limits.ts';
import type { CameraLimits, TerrainQueries } from './camera/constraints.ts';
import { CAMERA } from './config/camera.ts';
import { DEFAULT_VIEW, VIEWS, type ViewPreset } from './config/views.ts';
import { QUALITY, type QualityProfile } from './config/quality.ts';
import { AutoQuality, frameStats, type ProfileId } from './quality/auto.ts';
import { HeightGrid, TerrainSampler } from './geo/heightfield.ts';
import { bearingOf, type Frame } from './geo/frame.ts';
import { Ui, type QualityMode, type UiActions } from './ui/ui.ts';
import { focusPose } from './camera/focus.ts';

export interface AppInit {
  canvas: HTMLCanvasElement;
  renderer: THREE.WebGLRenderer;
  data: AtlasData;
  build: BuildResult;
  albedo: Record<RingName, ImageBitmap | HTMLImageElement>;
  initialProfile: ProfileId;
  reducedMotion: boolean;
  diagnostics: boolean;
  bytesLoaded: number;
}

export class App implements UiActions {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly frame: Frame;
  readonly sampler: TerrainSampler;
  readonly terrain: Terrain;
  readonly env: Environment;
  readonly clouds: Clouds;
  readonly routes: Routes;
  readonly markers: PoiMarkers;
  readonly cam: CameraController;
  readonly ui: Ui;
  readonly limits: CameraLimits;
  readonly queries: TerrainQueries;
  private readonly data: AtlasData;
  private readonly serac: THREE.Mesh;
  /** triángulos fijos del pase principal ajenos al terreno y a las rutas (cielo, serac) */
  private readonly fixedTriangles: number;
  /** geometrías que existen en total (todos los niveles de LOD incluidos): cota de las subidas a GPU */
  private readonly geometryCap: number;
  private readonly canvas: HTMLCanvasElement;
  private readonly resizeObs: ResizeObserver;
  private profile: QualityProfile;
  private mode: QualityMode = 'auto';
  private readonly auto: AutoQuality;
  private raf = 0;
  private needsRender = true;
  private lastRenderAt = 0;
  private continuous = false;
  private frameTimes: number[] = [];
  private cpuTimes: number[] = [];
  private shadowPending = false;
  private readonly fwd = new THREE.Vector3();
  /** cambio de perfil decidido por Auto: se aplica al quedar la cámara quieta (nunca a mitad de un gesto) */
  private pendingProfile: QualityProfile | null = null;
  private width = 1;
  private height = 1;
  private selected: string | null = null;
  private deathZone = true;
  private diagEl: HTMLElement;
  private diagOn: boolean;
  private lastDiag = 0;
  private mainPass = { calls: 0, triangles: 0 };
  private shadowPass = { calls: 0, triangles: 0 };
  private shadowRendering = false;
  private wasMoving = false;
  private contextLost = false;
  private readonly bytesLoaded: number;
  private readonly listeners: [EventTarget, string, EventListener][] = [];
  /** contador de renders (para pruebas de estabilidad) */
  renders = 0;

  constructor(init: AppInit) {
    this.canvas = init.canvas;
    this.renderer = init.renderer;
    this.data = init.data;
    this.bytesLoaded = init.bytesLoaded;
    const m = init.data.manifest;
    this.frame = { h0: m.sistema.h0 };
    const grid = (r: RingName) => new HeightGrid(m.rejillas[r].muestras, m.rejillas[r].espaciado, m.rejillas[r].semilado, init.build.heights[r]);
    const core = grid('core');
    const context = grid('context');
    this.sampler = new TerrainSampler([core, context, grid('far')]);
    const dilCore = new HeightGrid(core.n, core.spacing, core.half, init.build.dilated.core);
    const dilCtx = new HeightGrid(context.n, context.spacing, context.half, init.build.dilated.context);

    this.camera = new THREE.PerspectiveCamera(CAMERA.fovDeg, 1, 10, 130000);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.AgXToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    // mide aparte el coste del pase de sombras envolviendo su render
    const sm = this.renderer.shadowMap as THREE.WebGLShadowMap & { render: (...a: unknown[]) => void };
    const original = sm.render.bind(sm);
    sm.render = (...args: unknown[]) => {
      // el pase principal recorta bloques por caja; las sombras necesitan también los de fuera del encuadre
      const active = sm.enabled && (sm.autoUpdate || sm.needsUpdate);
      if (active) this.terrain.setShadowPass(true);
      const before = { calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles };
      original(...args);
      if (active) this.terrain.setShadowPass(false);
      if (sm.needsUpdate || this.shadowRendering) {
        this.shadowPass = { calls: this.renderer.info.render.calls - before.calls, triangles: this.renderer.info.render.triangles - before.triangles };
      }
    };

    this.profile = QUALITY[init.initialProfile];
    this.auto = new AutoQuality(init.initialProfile);
    this.env = new Environment(this.scene, this.renderer);
    this.terrain = new Terrain(init.build, m, init.albedo as Record<RingName, ImageBitmap>, this.profile.anisotropy);
    this.scene.add(this.terrain.group);

    const serac = buildSerac(init.data.serac, this.frame, core);
    this.serac = serac.mesh;
    this.scene.add(this.serac);
    const summit = m.cumbre.modelo;
    this.clouds = new Clouds(this.frame, (x, y) => this.sampler.heightAt(x, y), { x: summit.x, y: summit.y }, this.env.fog, {
      data: context.data,
      n: context.n,
      half: context.half,
    });
    this.clouds.setLight(this.env.preset.cloudLit, this.env.preset.cloudShadow);
    this.scene.add(this.clouds.mesh);
    // el serac sobresale del DEM: se incorpora a la rejilla de holgura de la cámara
    for (const f of serac.footprint) {
      const j = Math.round((f.x + dilCore.half) / dilCore.spacing);
      const i = Math.round((dilCore.half - f.y) / dilCore.spacing);
      for (let di = -4; di <= 4; di++)
        for (let dj = -4; dj <= 4; dj++) {
          const ii = i + di;
          const jj = j + dj;
          if (ii >= 0 && jj >= 0 && ii < dilCore.n && jj < dilCore.n) dilCore.data[ii * dilCore.n + jj] = Math.max(dilCore.data[ii * dilCore.n + jj], f.top);
        }
    }
    const dilated = new TerrainSampler([dilCore, dilCtx]);
    const h0 = this.frame.h0;
    this.queries = {
      heightY: (x, z) => this.sampler.heightAt(x, -z) - h0,
      clearanceY: (x, z) => dilated.heightAt(x, -z) - h0,
    };

    this.routes = new Routes(init.data.routes, this.frame, core);
    this.scene.add(this.routes.group);
    let fixed = 0;
    const others = new Set<THREE.BufferGeometry>();
    this.scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || o.parent === this.terrain.group) return;
      others.add(o.geometry as THREE.BufferGeometry);
      if (o.parent === this.routes.group) return;
      const g = o.geometry as THREE.BufferGeometry;
      fixed += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
    });
    this.fixedTriangles = fixed;
    this.geometryCap = this.terrain.geometryCount + others.size;

    const pois = init.data.pois.poi;
    this.limits = buildLimits(pois, h0);
    this.cam = new CameraController(this.camera, this.canvas, this.limits, this.queries);
    this.cam.reducedMotion = init.reducedMotion;
    this.cam.onUserInteraction = () => this.request();
    this.cam.controls.addEventListener('change', () => this.request());

    const markerLayer = document.getElementById('markers')!;
    this.markers = new PoiMarkers(markerLayer, pois, this.frame, { heightAt: (x, y) => this.sampler.heightAt(x, y) }, (id) => this.selectPoi(id));
    this.ui = new Ui(init.data, this);
    if (init.reducedMotion) this.ui.disableAutoRotate('Desactivada: el sistema pide movimiento reducido');

    this.diagEl = document.getElementById('diag')!;
    this.diagOn = init.diagnostics;
    this.diagEl.hidden = !this.diagOn;

    // estado inicial
    this.terrain.setDeathZone(1);
    this.syncMarkerFilters();
    this.applyProfile(this.profile, true);
    this.setPoseFromView(VIEWS.find((v) => v.id === DEFAULT_VIEW)!, false);

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(this.canvas);
    this.resize();
    const on = (t: EventTarget, ev: string, fn: EventListener, opts?: AddEventListenerOptions) => {
      t.addEventListener(ev, fn, opts);
      this.listeners.push([t, ev, fn]);
    };
    for (const ev of ['pointerdown', 'pointermove', 'wheel', 'touchstart', 'touchmove', 'keydown']) on(this.canvas, ev, () => this.request(), { passive: true });
    on(document, 'visibilitychange', () => {
      if (!document.hidden) {
        this.continuous = false; // sin salto de tiempo al volver
        this.request();
      }
    });
    on(this.canvas, 'webglcontextlost', ((e: Event) => {
      e.preventDefault();
      this.contextLost = true;
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.showContextMessage(true);
    }) as EventListener);
    on(this.canvas, 'webglcontextrestored', () => {
      this.contextLost = false;
      this.env.shadowsDirty = true;
      this.showContextMessage(false);
      this.request();
    });
    if (document.fonts?.ready) void document.fonts.ready.then(() => this.markers.measure());
  }

  // ------------------------------------------------------------------ bucle
  request(): void {
    this.needsRender = true;
    if (!this.raf && !this.contextLost && !document.hidden) this.raf = requestAnimationFrame(this.tick);
  }

  private tick = (now: number): void => {
    this.raf = 0;
    if (document.hidden || this.contextLost) return;
    const cpu0 = performance.now();
    const moved = this.cam.update(now);
    const lodAnim = this.terrain.update(this.camera, this.height, now, this.profile.lodPixelError, this.terrainTriangleBudget(), !this.cam.reducedMotion);
    const moving = moved || lodAnim || this.cam.animating;
    if (moving || this.needsRender) {
      this.renderFrame(now, moved);
      this.needsRender = false;
      // coste en el hilo principal (JS + envío de comandos), sin esperar a la GPU
      this.cpuTimes.push(performance.now() - cpu0);
      if (this.cpuTimes.length > 600) this.cpuTimes.shift();
    }
    if (this.wasMoving && !moving) {
      // al detenerse: oclusión exacta de etiquetas
      this.markers.invalidate();
      this.needsRender = true;
    }
    if (!moving && this.pendingProfile) {
      const p = this.pendingProfile;
      this.pendingProfile = null;
      this.applyProfile(p);
    }
    this.wasMoving = moving;
    if (moving || this.needsRender || this.shadowPending) this.raf = requestAnimationFrame(this.tick);
    else this.continuous = false;
  };

  private renderFrame(now: number, moved: boolean): void {
    // muestras de tiempo de fotograma solo con render continuo
    const sinceLast = now - this.lastRenderAt;
    if (this.continuous) {
      const dt = sinceLast;
      this.frameTimes.push(dt);
      if (this.frameTimes.length > 240) this.frameTimes.shift();
      if (this.mode === 'auto') {
        const next = this.auto.addFrame(dt, now);
        if (next) this.pendingProfile = QUALITY[next];
      }
    }
    this.continuous = true;
    this.lastRenderAt = now;

    // plano cercano: el relieve más próximo puede estar al lado (pared) y no debajo, así que se
    // acota por la distancia al objetivo (que está sobre la superficie) y por la holgura vertical
    const target = this.cam.controls.target;
    const dist = this.camera.position.distanceTo(target);
    const clr = Math.max(1, this.cam.clearanceNow());
    this.camera.near = Math.min(250, Math.max(3, Math.min(dist * 0.05, clr * 0.5)));
    this.camera.far = 130000;
    this.camera.updateProjectionMatrix();
    this.terrain.cull(this.camera);
    this.env.follow(this.camera);

    const k = this.height / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    this.routes.updateDashes(dist / k);
    this.terrain.setDeathTintForDistance(dist);

    // sombras: proyectores estáticos, así que solo se rehacen si cambia la luz o la calidad
    if (this.profile.shadows && (this.env.shadowsDirty || this.shadowPending)) {
      this.renderer.shadowMap.needsUpdate = true;
      this.env.shadowsDirty = false;
      this.shadowPending = false;
    } else if (!this.profile.shadows) this.shadowPending = false;
    // nubes: el viento avanza solo en fotogramas que ya se dibujan (paso acotado: sin saltos)
    this.clouds.update(this.camera, target, sinceLast, !this.cam.reducedMotion);
    this.shadowRendering = this.renderer.shadowMap.needsUpdate && this.profile.shadows;
    const prevShadow = this.shadowPass;
    this.renderer.render(this.scene, this.camera);
    this.renders++;
    const info = this.renderer.info.render;
    const sp = this.shadowRendering ? this.shadowPass : { calls: 0, triangles: 0 };
    this.mainPass = { calls: info.calls - sp.calls, triangles: info.triangles - sp.triangles };
    if (!this.shadowRendering) this.shadowPass = prevShadow;
    this.shadowRendering = false;

    const insets = this.markerInsets();
    this.markers.update(this.camera, this.width, this.height, now, moved, insets);
    this.camera.getWorldDirection(this.fwd);
    this.ui.setCompass(bearingOf(this.fwd.x, this.fwd.z));
    if (this.diagOn && now - this.lastDiag > 400) this.updateDiagnostics(now);
  }

  private markerInsets() {
    const mobile = this.width <= 760;
    // en móvil la ficha abierta ocupa la parte baja: las etiquetas se colocan por encima
    const card = mobile && this.ui.cardHeight ? this.ui.cardHeight + 24 : 0;
    return mobile ? { top: 64, bottom: Math.max(60, card), left: 6, right: 62 } : { top: 70, bottom: 8, left: 70, right: 346 };
  }

  // --------------------------------------------------------------- tamaño
  private resize(): void {
    const w = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, this.canvas.clientHeight);
    this.width = w;
    this.height = h;
    const dpr = this.effectiveDpr();
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.routes.setResolution(w, h, w <= 760, dpr);
    this.markers.measure();
    this.request();
  }

  /** Presupuesto de triángulos del terreno: el del perfil menos la reserva de rutas, serac y cielo. */
  private terrainTriangleBudget(): number {
    const p = this.profile.triangleBudget;
    return Math.max(0.6 * p, p - this.routes.reservedTriangles() - this.fixedTriangles);
  }

  private effectiveDpr(): number {
    const dev = window.devicePixelRatio || 1;
    let dpr = Math.min(dev, this.profile.dprMax);
    const px = this.width * this.height * dpr * dpr;
    if (px > this.profile.maxPixels) dpr = Math.sqrt(this.profile.maxPixels / (this.width * this.height));
    return Math.max(0.5, dpr);
  }

  private applyProfile(p: QualityProfile, initial = false): void {
    this.profile = p;
    this.env.setShadows(p.shadows, p.shadowMapSize);
    this.terrain.setDetailLevel(p.detail);
    // la anisotropía se fija al cargar: cambiarla obligaría a volver a subir todas las texturas
    this.clouds.setCount(p.cloudPuffs);
    this.shadowPending = p.shadows;
    this.markers.setFilters({ labelsMax: p.labelsMax });
    this.routes.setCasing(p.routeCasing);
    if (!initial) this.resize();
    this.updateQualityNote();
    this.request();
  }

  private updateQualityNote(): void {
    const s = frameStats(this.frameTimes.slice(-90));
    const fps = s.median ? ` · mediana ${s.median.toFixed(1).replace('.', ',')} ms` : '';
    this.ui.setQualityNote(this.mode === 'auto' ? `Automática: perfil ${this.profile.label}${fps}. Ajusta según el tiempo de fotograma medido.` : `Perfil fijo: ${this.profile.label}.`);
  }

  // ------------------------------------------------------------ acciones UI
  setRoutesMaster(on: boolean): void {
    this.routes.setVisibility({ master: on });
    this.syncMarkerFilters();
    this.request();
  }
  setRoute(id: string, on: boolean): void {
    this.routes.setVisibility({ routes: { [id]: on } });
    this.syncMarkerFilters();
    this.request();
  }
  setHighlight(id: string | null): void {
    this.routes.setVisibility({ highlight: id });
    this.syncMarkerFilters();
    this.request();
  }
  setLabels(on: boolean): void {
    this.markers.setFilters({ showLabels: on });
    this.request();
  }
  setCamps(on: boolean): void {
    this.markers.setFilters({ showCamps: on });
    this.request();
  }
  setDeathZone(on: boolean): void {
    this.deathZone = on;
    this.terrain.setDeathZone(on ? 1 : 0);
    this.markers.setFilters({ deathZone: on });
    this.request();
  }
  setDemOverlay(on: boolean): void {
    this.terrain.setDemOverlay(on ? 1 : 0);
    this.request();
  }
  setLight(id: 'manana' | 'tarde'): void {
    const p = LIGHT_PRESETS[id];
    this.env.applyPreset(p);
    this.clouds.setLight(p.cloudLit, p.cloudShadow);
    this.request();
  }
  setClouds(on: boolean): void {
    this.clouds.setVisible(on);
    this.request();
  }
  goToView(id: string): void {
    const v = VIEWS.find((x) => x.id === id);
    if (v) this.setPoseFromView(v, true);
    this.ui.collapsePanelOnMobile();
  }
  resetView(): void {
    this.goToView(DEFAULT_VIEW);
  }
  selectPoi(id: string | null, focus = false): void {
    this.selected = id;
    const p = (id ? this.poi(id) : null) ?? null;
    this.markers.setFilters({ selected: id });
    this.ui.showPoi(p);
    if (p && focus) this.focusPoi(p.id);
    this.request();
  }
  focusPoi(id: string): void {
    const p = this.poi(id);
    if (!p) return;
    void this.cam.flyTo(focusPose(p, this.frame, this.limits, this.queries, this.sampler));
    this.ui.collapsePanelOnMobile();
    this.request();
  }
  setQuality(mode: QualityMode): void {
    this.mode = mode;
    if (mode === 'auto') {
      this.auto.reset(this.profile.id, performance.now());
      this.updateQualityNote();
    } else this.applyProfile(QUALITY[mode]);
  }
  zoom(factor: number): void {
    this.cam.dolly(factor);
    this.request();
  }
  orientNorth(): void {
    this.cam.orientNorth();
    this.request();
  }
  setAutoRotate(on: boolean): void {
    this.cam.setAutoRotate(on);
    this.request();
  }
  orbit(dAz: number, dPolar: number): void {
    this.cam.orbit(dAz, dPolar);
    this.request();
  }
  toggleDiagnostics(): void {
    this.diagOn = !this.diagOn;
    this.diagEl.hidden = !this.diagOn;
    this.request();
  }

  // ---------------------------------------------------------------- utilidades
  poi(id: string): Poi | undefined {
    return this.data.pois.poi.find((p) => p.id === id);
  }

  private syncMarkerFilters(): void {
    this.markers.setFilters({ visibleRoutes: this.routes.visibleRoutes(), highlight: this.routes.visibility.highlight, deathZone: this.deathZone });
  }

  viewPose(v: ViewPreset) {
    return resolveView(v, this.data.pois.poi, this.frame.h0, (x, y) => this.sampler.heightAt(x, y));
  }

  private setPoseFromView(v: ViewPreset, animate: boolean): void {
    const pose = this.viewPose(v);
    if (animate) void this.cam.flyTo(pose);
    else this.cam.setPose(pose);
    this.request();
  }

  private showContextMessage(on: boolean): void {
    const l = document.getElementById('loading')!;
    const stage = document.getElementById('loading-stage')!;
    if (on) {
      l.classList.remove('is-done');
      stage.textContent = 'Se perdió el contexto gráfico; esperando a que el navegador lo restaure…';
    } else l.classList.add('is-done');
  }

  private updateDiagnostics(now: number): void {
    this.lastDiag = now;
    const s = frameStats(this.frameTimes.slice(-120));
    const r = this.renderer;
    const ts = this.terrain.stats;
    const db = r.getDrawingBufferSize(new THREE.Vector2());
    const camAlt = this.camera.position.y + this.frame.h0;
    const texMiB = this.terrain.textureBytesEstimate() / 1048576;
    const shadowMiB = this.profile.shadows ? (this.profile.shadowMapSize ** 2 * 4) / 1048576 : 0;
    this.diagEl.textContent = [
      `perfil      ${this.profile.label}${this.mode === 'auto' ? ' (auto)' : ''}`,
      `fotograma   med ${s.median.toFixed(1)} ms · p95 ${s.p95.toFixed(1)} ms · ${s.median ? (1000 / s.median).toFixed(0) : '–'} fps`,
      `lienzo      ${db.x}×${db.y} px · DPR ${r.getPixelRatio().toFixed(2)}`,
      `pase ppal.  ${this.mainPass.calls}/${this.profile.drawCallBudget} draw calls · ${(this.mainPass.triangles / 1000).toFixed(0)}/${(this.profile.triangleBudget / 1000).toFixed(0)} k triángulos`,
      `sombras     ${this.profile.shadows ? `${this.shadowPass.calls} calls · ${(this.shadowPass.triangles / 1000).toFixed(0)} k tri (solo al cambiar)` : 'desactivadas'}`,
      `LOD         ${ts.levels.join('/')} bloques (0→3) · τ ${ts.tauUsed.toFixed(2)} px · est. ${(ts.trianglesEstimate / 1000).toFixed(0)} k`,
      `memoria     ${r.info.memory.geometries} geometrías · ${r.info.memory.textures} texturas`,
      `texturas    ≈${texMiB.toFixed(0)} MiB + sombra ${shadowMiB.toFixed(0)} MiB (estimación)`,
      `descarga    ${(this.bytesLoaded / 1048576).toFixed(2)} MiB`,
      `cámara      ${camAlt.toFixed(0)} m · holgura ${this.cam.clearanceNow().toFixed(0)} m · near ${this.camera.near.toFixed(0)} m`,
      `marcadores  ${this.markers.visibleCount()} visibles · renders ${this.renders}`,
    ].join('\n');
  }

  /**
   * Sube a la GPU, tras la pantalla de carga, todo lo que se usará al moverse: cada nivel de
   * LOD de cada bloque y padre, y las texturas. Sin esto, la primera vez que un bloque cambia
   * de nivel se sube su geometría en mitad del gesto (un tirón). Se dibuja todo una vez en un
   * destino de 1×1 píxel: el coste de fragmentos es nulo.
   */
  prewarm(): void {
    const scene = new THREE.Scene();
    const mat = new THREE.MeshBasicMaterial();
    for (const g of this.terrain.allGeometries()) {
      const mesh = new THREE.Mesh(g, mat);
      mesh.frustumCulled = false;
      scene.add(mesh);
    }
    const rt = new THREE.WebGLRenderTarget(1, 1);
    const prev = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(rt);
    this.renderer.render(scene, this.camera);
    this.renderer.setRenderTarget(prev);
    for (const t of [...this.terrain.allTextures(), ...this.clouds.textures()]) this.renderer.initTexture(t);
    rt.dispose();
    mat.dispose();
  }

  /** Recuento del último fotograma, barato de consultar en cada fotograma (medición de rendimiento). */
  passStats(): { calls: number; triangles: number } {
    return { calls: this.mainPass.calls, triangles: this.mainPass.triangles };
  }

  /** Estado expuesto para pruebas automáticas (Playwright). */
  debugState() {
    const p = this.camera.position;
    const t = this.cam.controls.target;
    return {
      camera: { x: p.x, y: p.y, z: p.z },
      target: { x: t.x, y: t.y, z: t.z },
      clearance: this.cam.clearanceNow(),
      terrainY: this.queries.heightY(p.x, p.z),
      profile: this.profile.id,
      mode: this.mode,
      renders: this.renders,
      calls: this.mainPass.calls,
      triangles: this.mainPass.triangles,
      geometries: this.renderer.info.memory.geometries,
      geometryCap: this.geometryCap,
      textures: this.renderer.info.memory.textures,
      selected: this.selected,
      frame: frameStats(this.frameTimes.slice(-240)),
      cpu: frameStats(this.cpuTimes),
      lod: this.terrain.stats,
      routesVisible: this.routes.visibleObjects(),
      cloudsVisible: this.clouds.visible,
      markersVisible: this.markers.visibleCount(),
    };
  }

  resetCpuStats(): void {
    this.cpuTimes = [];
  }

  settleForCapture(): void {
    this.terrain.settle(this.camera, this.height, this.profile.lodPixelError, this.terrainTriangleBudget());
    this.markers.invalidate();
    this.shadowPending = true;
    this.renderer.shadowMap.needsUpdate = this.profile.shadows;
    this.request();
  }

  setLodDebug(on: boolean): void {
    this.terrain.setLodDebug(on);
    this.request();
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.resizeObs.disconnect();
    for (const [t, ev, fn] of this.listeners) t.removeEventListener(ev, fn);
    this.cam.dispose();
    this.markers.dispose();
    this.routes.dispose();
    this.terrain.dispose();
    this.env.dispose();
    this.clouds.dispose();
    this.serac.geometry.dispose();
    (this.serac.material as THREE.Material).dispose();
    this.renderer.dispose();
  }
}
