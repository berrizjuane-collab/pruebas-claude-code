/**
 * Orquestador: conecta el motor de render, el trabajador de física, las balizas, la capa de
 * diagrama y la vista propia del objeto, y publica la telemetría para la interfaz.
 *
 * Relojes:
 *  - Vista exterior / diagrama: el multiplicador avanza el tiempo coordenado t de Kerr–Schild
 *    (en el exterior lejano coincide con el tiempo de un observador estático en el infinito).
 *  - Vista propia del objeto: el multiplicador avanza el TIEMPO PROPIO τ del objeto seguido; t se
 *    obtiene invirtiendo τ(t) en sus muestras (t sigue siendo finito al cruzar el horizonte).
 */
import { Engine } from './Engine';
import { store, toast, type AppState } from './store';
import { ambient } from './audio';
import { PhysicsClient, type BodyState, type Experiment } from '../simulation/client';
import { MarkerManager } from '../rendering/markers/MarkerManager';
import { Overlay } from '../rendering/overlay/Overlay';
import { LocalView } from '../rendering/objects/LocalView';
import { CATALOG, criticalTidalGradient, humanTidalAcceleration, tidalStress } from '../simulation/catalog';
import { SAMPLE_SIZE, S_TAU, type ExperimentSummary, type PhysEvent } from '../simulation/types';
import { DT_SAMPLE } from '../simulation/runner';
import { KerrSchild } from '../physics/metrics/kerrSchild';
import { horizons } from '../physics/metrics/kerr';
import { rainObserver, relativeVelocity, sphericalTetrad, zamoObserver } from '../physics/observers/observers';
import { spheroidalFromCartesian } from '../physics/metrics/coordinates';
import { constantsOfMotion } from '../physics/geodesics/conserved';
import { symmetricEigen3 } from '../physics/tidal/riemann';
import type { Pose } from '../camera/CameraController';

export interface TelemetrySnapshot {
  id: string;
  label: string;
  color: string;
  object: string;
  type: Experiment['type'];
  t: number;
  tau: number;
  r: number;
  thetaDeg: number;
  phiDeg: number;
  vLocal: number;
  vObserver: string;
  dirIn: boolean;
  orbitState: string;
  captureState: string;
  inside: boolean;
  E: number;
  Lz: number;
  Q: number;
  drift: number[];
  lambda: number;
  compression: number;
  stress: number;
  strength: number;
  humanAcc: number;
  K: number;
  pieces: number;
  fractured: boolean;
  pos: number[];
  u: number[];
  p: number[];
  status: string;
  computedAhead: number;
  photons: { total: number; captured: number; escaped: number } | null;
  cloudSpread: number | null;
}

export class Observatory {
  readonly engine: Engine;
  readonly client: PhysicsClient;
  readonly markers = new MarkerManager();
  readonly overlay: Overlay;
  readonly localView: LocalView;
  private lastTelemetry = 0;
  private lastTarget = 0;
  private familiesKey = '';
  private ksCache: KerrSchild | null = null;

  constructor(canvas: HTMLCanvasElement, labelHost: HTMLElement) {
    this.engine = new Engine(canvas);
    this.client = new PhysicsClient();
    this.overlay = new Overlay(labelHost);
    this.localView = new LocalView(this.engine.renderer);
    this.client.onLaunched = (e) => {
      for (const w of e.warnings) toast(w, 'aviso');
      this.publishExperiments();
    };
    this.client.onError = (e, msg) => {
      toast(msg, 'aviso');
      void e;
      this.publishExperiments();
    };
    this.client.onChange = (e, evs) => this.onEvents(e, evs);
    const eng = this.engine;
    eng.hooks = {
      advance: (t, dtM) => this.advance(t, dtM),
      dynamic: () => [...this.client.experiments.values()].some((e) => e.type !== 'beam') && store.get().running,
      followTarget: () => this.followTarget(),
      overrideFrame: (t) => this.objectFrame(t),
      beforeTrace: (frame, tracer) => {
        const s = store.get();
        // En la vista B la cámara ES el objeto: su baliza ampliada (ilustrativa, ~10⁶ km) la
        // envolvería y taparía todo el cielo, así que no se traza.
        const own = s.view === 'object' ? s.followExperiment : null;
        this.markers.sync([...this.client.experiments.values()].filter((e) => e.id !== own), s.spin);
        this.markers.visualScale = store.get().markerScale;
        this.markers.update(tracer, frame.t, performance.now(), eng.scales.tg);
      },
      afterComposite: (frame, pose, renderer) => this.afterComposite(frame.t, pose, renderer),
      cameraVersion: () => (store.get().view === 'object' ? this.localView.version : 0),
    };
    store.subscribe(() => this.onStore(store.get()));
    this.onStore(store.get());
  }

  private onStore(s: AppState): void {
    this.overlay.setSpin(s.spin);
    this.overlay.setToggles(s.overlay);
    const fk = JSON.stringify([s.spin, s.overlay.geoPhotons, s.overlay.geoMassive, s.overlay.geoCapture, s.overlay.geoCritical]);
    if (fk !== this.familiesKey) {
      this.familiesKey = fk;
      const o = s.overlay;
      if (o.geoPhotons || o.geoMassive || o.geoCapture || o.geoCritical) {
        store.set({ busy: 'Calculando familias de geodésicas…' });
        this.client.families({ a: s.spin, photons: o.geoPhotons, massive: o.geoMassive, capture: o.geoCapture, critical: o.geoCritical }).then((curves) => {
          this.overlay.setFamilies(curves);
          store.set({ busy: null });
        });
      } else this.overlay.setFamilies([]);
    }
    const f = s.followExperiment ? this.client.experiments.get(s.followExperiment) ?? null : null;
    this.localView.setExperiment(s.view === 'object' ? f : null);
  }

  get ks(): KerrSchild {
    const a = store.get().spin;
    if (!this.ksCache || this.ksCache.a !== a) this.ksCache = new KerrSchild(a);
    return this.ksCache;
  }

  /** Experimento seguido (vista propia y seguimiento exterior). */
  followed(): Experiment | null {
    const id = store.get().followExperiment;
    return id ? this.client.experiments.get(id) ?? null : null;
  }

  selected(): Experiment | null {
    const s = store.get();
    const id = s.selectedExperiment ?? s.followExperiment;
    return id ? this.client.experiments.get(id) ?? null : null;
  }

  private advance(t: number, dtM: number): number | null {
    const s = store.get();
    const f = this.followed();
    if (s.view === 'object' && f && f.type === 'body') {
      // Avanzar en tiempo propio del objeto: τ(t) es monótona en las muestras
      const st = this.client.bodyAt(f, t);
      if (!st) return t + dtM;
      const tauTarget = st.tau + dtM * this.engine.scales.tg;
      const d = f.body.data;
      const n = f.nSamples;
      if (d[(n - 1) * SAMPLE_SIZE + S_TAU] <= tauTarget) {
        if (f.done) return d[(n - 1) * SAMPLE_SIZE];
        return Math.min(f.tComputed, t + dtM);
      }
      let lo = Math.max(0, st.k);
      let hi = n - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (d[mid * SAMPLE_SIZE + S_TAU] < tauTarget) lo = mid;
        else hi = mid;
      }
      const ta = d[lo * SAMPLE_SIZE + S_TAU];
      const tb = d[hi * SAMPLE_SIZE + S_TAU];
      const fr = tb > ta ? (tauTarget - ta) / (tb - ta) : 0;
      return f.tLaunch + (lo + fr) * DT_SAMPLE;
    }
    return t + dtM;
  }

  private followTarget(): [number, number, number] | null {
    const s = store.get();
    if (s.navMode !== 'follow') return null;
    const f = this.followed();
    if (!f) return null;
    const st = this.client.bodyAt(f, this.engine.t);
    if (st) return st.pos;
    if (f.type === 'cloud') {
      const p = this.client.particlesAt(f, this.engine.t);
      return [p[0], p[1], p[2]];
    }
    return null;
  }

  private objectFrame(t: number) {
    const s = store.get();
    if (s.view !== 'object') return null;
    const f = this.followed();
    if (!f || f.type !== 'body') return null;
    const st = this.client.bodyAt(f, t);
    if (!st) return null;
    return this.localView.frame(st, st.r < horizons(s.spin).rPlus);
  }

  private afterComposite(t: number, pose: Pose, renderer: import('three').WebGLRenderer): void {
    const s = store.get();
    const list = [...this.client.experiments.values()];
    // Calcular por delante del reloj
    const now = performance.now();
    if (now - this.lastTarget > 200) {
      this.lastTarget = now;
      const ahead = Math.max(80, (8 * s.timeScale) / this.engine.scales.tg);
      this.client.setTarget(t + ahead);
    }
    if (s.view === 'object') {
      const f = this.followed();
      const st = f ? this.client.bodyAt(f, t) : null;
      this.overlay.hideLabels();
      if (f && st) {
        this.localView.updateEnvironment(renderer, this.engine.tracer, st, now, this.engine.currentExposure);
        const pieces = this.client.piecesAt(f, st.k);
        this.localView.render(renderer, st, pieces, this.engine.nav.fovY, this.strainFor(f, st), s.deformExaggeration);
      }
    } else {
      this.overlay.updateExperiments(list, this.client, t);
      this.overlay.render(renderer, pose, this.engine.nav.fovY, list);
    }
    if (now - this.lastTelemetry > 100) {
      this.lastTelemetry = now;
      this.publishTelemetry(t);
    }
  }

  /** Deformación elástica estimada ε ≈ −(ρ L²/(c·Y)) E (adimensional) en el marco del cuerpo. */
  private strainFor(f: Experiment, st: BodyState): number[] | null {
    const spec = CATALOG[f.cfg.object];
    if (spec.class !== 'cuerpo' || spec.material.young <= 0) return null;
    const L = Math.max(...spec.dims);
    const k = (spec.material.density * L * L) / (8 * spec.material.young);
    return st.tidal.map((v) => -k * v);
  }

  launch(): Experiment | null {
    const s = store.get();
    const spec = CATALOG[s.launch.object];
    const n = [...this.client.experiments.values()].filter((e) => e.cfg.object === s.launch.object).length + 1;
    const label = `${spec.name}${n > 1 ? ` ${n}` : ''}`;
    const exp = this.client.launch(s.launch, s.spin, this.engine.t, { rg: this.engine.scales.rg, tg: this.engine.scales.tg }, label);
    // La vista propia solo existe para cuerpos: con una nube o un haz se vuelve a la exterior
    store.set({ selectedExperiment: exp.id, followExperiment: exp.id, view: s.view === 'object' && exp.type !== 'body' ? 'exterior' : s.view });
    ambient.click('launch');
    this.publishExperiments();
    return exp;
  }

  /** Asigna un experimento al hueco A o B de la comparación (el hueco queda libre en el otro). */
  assignSlot(id: string, slot: 'A' | 'B'): void {
    for (const e of this.client.experiments.values()) {
      if (e.id === id) e.slot = slot;
      else if (e.slot === slot) e.slot = null;
    }
    this.publishExperiments();
  }

  /** Vuelve a colocar la cámara comóvil de la vista B en su encuadre inicial. */
  resetLocalView(): void {
    this.localView.resetView();
  }

  removeExperiment(id: string): void {
    this.client.remove(id);
    const s = store.get();
    store.set({ selectedExperiment: s.selectedExperiment === id ? null : s.selectedExperiment, followExperiment: s.followExperiment === id ? null : s.followExperiment });
    this.publishExperiments();
  }

  clearExperiments(): void {
    this.client.clear();
    store.set({ selectedExperiment: null, followExperiment: null, view: store.get().view === 'object' ? 'exterior' : store.get().view });
    this.publishExperiments();
  }

  /** Reinicio exacto: vuelve a lanzar con la configuración registrada (determinista). */
  restartExperiment(id: string): void {
    const e = this.client.experiments.get(id);
    if (!e) return;
    this.client.remove(id);
    this.engine.t = e.tLaunch;
    const exp = this.client.launch(e.cfg, e.a, e.tLaunch, { rg: this.engine.scales.rg, tg: this.engine.scales.tg }, e.label, e.slot);
    store.set({ selectedExperiment: exp.id, followExperiment: exp.id });
    this.publishExperiments();
  }

  private onEvents(e: Experiment, evs: PhysEvent[]): void {
    for (const ev of evs) {
      if (ev.kind === 'horizonte' || ev.kind === 'fractura' || ev.kind === 'fin' || ev.kind === 'escape') {
        toast(`${e.label}: ${ev.text}`, 'evento');
        ambient.click('event');
      }
    }
    if (evs.length || e.done) this.publishExperiments();
  }

  publishExperiments(): void {
    const list: ExperimentSummary[] = [...this.client.experiments.values()].map((e) => ({
      id: e.id,
      label: e.label,
      object: e.cfg.object,
      scenario: e.cfg.scenario,
      color: e.color,
      status: e.status,
      tLaunch: e.tLaunch,
      spin: e.a,
      events: e.events.slice(),
      info: e.info,
      slot: e.slot,
      config: e.cfg,
      tComputed: e.tComputed,
    }));
    store.set({ experiments: list });
  }

  private publishTelemetry(t: number): void {
    const e = this.selected();
    if (!e) {
      if (store.get().telemetry) store.set({ telemetry: null });
      return;
    }
    const ks = this.ks;
    const { rPlus } = horizons(ks.a);
    const snap: TelemetrySnapshot = {
      id: e.id,
      label: e.label,
      color: e.color,
      object: e.cfg.object,
      type: e.type,
      t,
      tau: 0,
      r: NaN,
      thetaDeg: NaN,
      phiDeg: NaN,
      vLocal: NaN,
      vObserver: '',
      dirIn: false,
      orbitState: '',
      captureState: '',
      inside: false,
      E: NaN,
      Lz: NaN,
      Q: NaN,
      drift: [0, 0, 0, 0],
      lambda: NaN,
      compression: NaN,
      stress: NaN,
      strength: NaN,
      humanAcc: NaN,
      K: NaN,
      pieces: 1,
      fractured: false,
      pos: [],
      u: [],
      p: [],
      status: e.status,
      computedAhead: e.tComputed - t,
      photons: null,
      cloudSpread: null,
    };
    if (e.type === 'beam') {
      const s = e.photonSummary;
      snap.photons = { total: e.nPhotons, captured: s.filter((p) => p.status === 'capturado').length, escaped: s.filter((p) => p.status === 'escapado').length };
    }
    if (e.type === 'cloud') {
      const p = this.client.particlesAt(e, t);
      let cx = 0, cy = 0, cz = 0, n = 0;
      for (let j = 0; j < e.nParticles; j++) {
        cx += p[4 * j];
        cy += p[4 * j + 1];
        cz += p[4 * j + 2];
        n++;
      }
      cx /= n;
      cy /= n;
      cz /= n;
      let mx = 0;
      for (let j = 0; j < e.nParticles; j++) mx = Math.max(mx, Math.hypot(p[4 * j] - cx, p[4 * j + 1] - cy, p[4 * j + 2] - cz));
      snap.cloudSpread = mx;
      const sph = spheroidalFromCartesian(cx, cy, cz, ks.a);
      snap.r = sph.r;
      snap.inside = sph.r < rPlus;
    }
    const st = this.client.bodyAt(e, t);
    if (st) {
      const sph = spheroidalFromCartesian(st.pos[0], st.pos[1], st.pos[2], ks.a);
      snap.tau = st.tau;
      snap.r = st.r;
      snap.thetaDeg = (sph.theta * 180) / Math.PI;
      snap.phiDeg = (((sph.phi * 180) / Math.PI) % 360 + 360) % 360;
      snap.inside = st.r < rPlus;
      snap.pos = st.pos;
      snap.u = st.u;
      snap.p = st.p;
      const z = zamoObserver(ks, st.pos[0], st.pos[1], st.pos[2]);
      const obs = z ?? rainObserver(ks, st.pos[0], st.pos[1], st.pos[2]);
      const tet = sphericalTetrad(ks, st.pos[0], st.pos[1], st.pos[2], obs);
      const rel = relativeVelocity(ks, st.pos[0], st.pos[1], st.pos[2], st.u, tet);
      snap.vLocal = rel.speed;
      snap.vObserver = z ? 'ZAMO local' : 'observador en caída libre («lluvia»)';
      snap.dirIn = rel.v[0] < 0;
      const c = constantsOfMotion(ks, st.pos, st.p);
      snap.E = c.E;
      snap.Lz = c.Lz;
      snap.Q = c.Q;
      snap.drift = st.drift;
      const { values } = symmetricEigen3([st.tidal[0], st.tidal[1], st.tidal[2], st.tidal[1], st.tidal[3], st.tidal[4], st.tidal[2], st.tidal[4], st.tidal[5]]);
      snap.lambda = -values[0];
      snap.compression = values[2];
      const spec = CATALOG[e.cfg.object];
      snap.stress = tidalStress(spec.breakModel, snap.lambda, 1);
      snap.strength = spec.breakModel.type === 'none' ? NaN : criticalTidalGradient(spec.breakModel, 1);
      snap.humanAcc = humanTidalAcceleration(snap.lambda);
      snap.K = st.K;
      const pieces = this.client.piecesAt(e, st.k);
      snap.pieces = Math.max(1, pieces.length / 4);
      snap.fractured = (st.flags & 2) !== 0;
      const hor = e.events.find((ev) => ev.kind === 'horizonte');
      const fin = e.events.find((ev) => ev.kind === 'fin');
      if (fin && t >= fin.t) snap.captureState = 'Fin del dominio clásico integrado';
      else if (snap.inside) snap.captureState = hor ? `Dentro del horizonte · cruzó en τ = ${hor.tau.toFixed(1)} s` : 'Dentro del horizonte';
      else snap.captureState = e.events.some((ev) => ev.kind === 'escape') ? 'Escapó' : 'Fuera del horizonte';
      snap.orbitState = snap.inside ? 'Capturado: todo futuro lleva a r menor' : c.E < 1 ? `Ligado (E = ${c.E.toFixed(4)} < 1)` : `No ligado (E = ${c.E.toFixed(4)} ≥ 1)`;
    }
    void SAMPLE_SIZE;
    store.set({ telemetry: snap });
  }
}
