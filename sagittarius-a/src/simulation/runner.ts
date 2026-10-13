/**
 * Ejecución de un experimento (en el trabajador de física): integra las geodésicas y produce
 * muestras uniformes en el tiempo coordenado de Kerr–Schild (Δt = 0,25 M), eventos y el modelo
 * del cuerpo extenso.
 *
 * Cuerpo extenso: el centro de masas sigue una geodésica; el marco del cuerpo (e₁, e₂, e₃) se
 * transporta en paralelo (giróscopos); el tensor de marea E_ij se evalúa con el Riemann numérico
 * en ese marco; las piezas obedecen la ecuación de desviación geodésica linealizada
 *   d²ξⁱ/dτ² = −Eⁱ_j ξʲ        (ξ en metros, τ en segundos, E en s⁻²)
 * y se parten en cascada cuando el estiramiento supera su gradiente crítico (catalog.ts).
 * La linealización es válida mientras |ξ| ≪ radio de curvatura; se avisa si deja de serlo.
 */
import { GeodesicIntegrator, type GeodesicEvent } from '../physics/geodesics/geodesic';
import { KerrSchild } from '../physics/metrics/kerrSchild';
import { ergosphereRadius, horizons, iscoRadius, kretschmann } from '../physics/metrics/kerr';
import { spheroidalFromCartesian } from '../physics/metrics/coordinates';
import { constantsOfMotion, type Constants } from '../physics/geodesics/conserved';
import { symmetricEigen3, tidalTensor } from '../physics/tidal/riemann';
import { C_SI } from '../physics/constants';
import { CATALOG, criticalTidalGradient, tidalStress } from './catalog';
import { buildLaunch, type BuiltLaunch } from './initial';
import {
  PARTICLE_SIZE,
  SAMPLE_SIZE,
  S_DRIFT,
  S_E1,
  S_FLAGS,
  S_K,
  S_P,
  S_R,
  S_STRESS,
  S_T,
  S_TAU,
  S_TID,
  S_U,
  S_X,
  type ExperimentStatus,
  type LaunchConfig,
  type PhysEvent,
} from './types';

export const DT_SAMPLE = 0.25;
export const MAX_PIECES = 48;

export interface Piece {
  x: [number, number, number];
  v: [number, number, number];
  s: number;
}

export interface PhotonSummary {
  b: number;
  status: 'en vuelo' | 'capturado' | 'escapado';
  rMin: number;
  windings: number;
  deflectionDeg: number | null;
}

export interface ChunkOut {
  id: string;
  type: 'body' | 'cloud' | 'beam';
  k0: number;
  n: number;
  body: Float64Array | null;
  /** Por muestra: [n_piezas, (x, y, z, s) × n_piezas] (cuerpo extenso). */
  pieces: Float32Array | null;
  particles: Float32Array | null;
  nParticles: number;
  photons: Float32Array | null;
  nPhotons: number;
  photonSummary: PhotonSummary[] | null;
  events: PhysEvent[];
  done: boolean;
  tComputed: number;
  status: ExperimentStatus;
}

export interface Scales {
  rg: number;
  tg: number;
}

export class ExperimentRunner {
  readonly id: string;
  readonly ks: KerrSchild;
  readonly cfg: LaunchConfig;
  readonly built: BuiltLaunch;
  readonly tLaunch: number;
  readonly type: 'body' | 'cloud' | 'beam';
  private readonly bodyGI: GeodesicIntegrator | null;
  private readonly partGI: GeodesicIntegrator[];
  private readonly photGI: GeodesicIntegrator[];
  private readonly c0: Constants | null;
  private readonly tidalSI: number;
  private readonly tg: number;
  private readonly rgM: number;
  private readonly rPlus: number;
  private readonly rIsco: number;
  private next = 0;
  private pieces: Piece[] = [{ x: [0, 0, 0], v: [0, 0, 0], s: 1 }];
  private lastTauS = 0;
  private lastE: Float64Array | null = null;
  private fractured = false;
  private warnedNonlinear = false;
  private photonState: PhotonSummary[] = [];
  private photonInitDir: Array<[number, number, number]> = [];
  private photonPhi: number[] = [];
  private photonLastPhi: number[] = [];
  status: ExperimentStatus = 'en curso';
  done = false;
  /** Eventos pendientes de enviar. */
  private pending: PhysEvent[] = [];

  constructor(id: string, a: number, cfg: LaunchConfig, tLaunch: number, scales: Scales) {
    this.id = id;
    this.ks = new KerrSchild(a);
    this.cfg = cfg;
    this.tLaunch = tLaunch;
    this.built = buildLaunch(a, cfg);
    this.type = this.built.type;
    this.tg = scales.tg;
    this.rgM = scales.rg;
    this.tidalSI = (C_SI * C_SI) / (scales.rg * scales.rg);
    this.rPlus = horizons(a).rPlus;
    this.rIsco = iscoRadius(a, true);
    const opts = { rtol: 1e-10, atol: 1e-12 };
    if (this.type === 'body') {
      const b = this.built.body!;
      this.bodyGI = new GeodesicIntegrator(this.ks, 'massive', { ...opts, transportFrame: true });
      this.bodyGI.reset(tLaunch, b.pos, b.p, b.frame);
      this.c0 = constantsOfMotion(this.ks, b.pos, b.p);
    } else {
      this.bodyGI = null;
      this.c0 = this.built.body ? constantsOfMotion(this.ks, this.built.body.pos, this.built.body.p) : null;
    }
    this.partGI = this.built.particles.map((pc) => {
      const gi = new GeodesicIntegrator(this.ks, 'massive', { rtol: 1e-9, atol: 1e-11 });
      gi.reset(tLaunch, pc.pos, pc.p);
      return gi;
    });
    this.photGI = this.built.photons.map((ph) => {
      const gi = new GeodesicIntegrator(this.ks, 'null', { rtol: 1e-10, atol: 1e-12 });
      gi.rEscape = 400;
      gi.reset(tLaunch, ph.pos, ph.p);
      return gi;
    });
    this.built.photons.forEach((ph, j) => {
      const d = new Float64Array(8);
      const gi = this.photGI[j];
      gi.rhs(tLaunch, gi.y, d);
      const nn = Math.hypot(d[0], d[1], d[2]);
      this.photonInitDir.push([d[0] / nn, d[1] / nn, d[2] / nn]);
      this.photonState.push({ b: ph.b, status: 'en vuelo', rMin: Infinity, windings: 0, deflectionDeg: null });
      const phi = Math.atan2(ph.pos[1], ph.pos[0]);
      this.photonPhi.push(0);
      this.photonLastPhi.push(phi);
    });
    const r0 = this.built.body ? this.ks.geometry(...this.built.body.pos).r : Number(this.built.info.r0 ?? 0);
    this.pending.push({ kind: 'lanzamiento', t: tLaunch, tau: 0, r: r0, text: `Lanzamiento desde r = ${r0.toFixed(2)} M` });
    for (const w of this.built.warnings) this.pending.push({ kind: 'aviso', t: tLaunch, tau: 0, r: r0, text: w });
  }

  sampleTime(k: number): number {
    return this.tLaunch + k * DT_SAMPLE;
  }

  private ev(kind: PhysEvent['kind'], e: { t: number; lambda: number; r: number }, text: string): void {
    this.pending.push({ kind, t: e.t, tau: e.lambda * this.tg, r: e.r, text });
  }

  private onGeoEvent(e: GeodesicEvent): void {
    switch (e.kind) {
      case 'horizon':
        this.ev('horizonte', e, `Cruce del horizonte r₊ = ${this.rPlus.toFixed(3)} M en τ = ${(e.lambda * this.tg).toFixed(1)} s (tiempo propio). Sin manifestación local.`);
        this.status = 'capturado';
        break;
      case 'periapsis':
        this.ev('periastro', e, `Periastro en r = ${e.r.toFixed(3)} M`);
        break;
      case 'apoapsis':
        this.ev('apoastro', e, `Apoastro en r = ${e.r.toFixed(3)} M`);
        break;
      case 'isco':
        this.ev('isco', e, `Cruza el ISCO prógrado (r = ${this.rIsco.toFixed(3)} M)`);
        break;
      case 'ergosphere':
        this.ev('ergosfera', e, `Entra en la ergosfera (r = ${e.r.toFixed(3)} M): ningún observador puede permanecer estático aquí.`);
        break;
      case 'escape':
        this.ev('escape', e, 'Escapa hacia el infinito (r > 4000 M)');
        this.status = 'escapado';
        break;
      case 'innerHorizon':
        this.ev('fin', e, `Fin del dominio: horizonte interior (de Cauchy) r₋ en τ = ${(e.lambda * this.tg).toFixed(1)} s. Más allá la predicción clásica deja de ser fiable (inestabilidad de inflación de masa).`);
        this.status = 'fin del dominio';
        break;
      case 'singularity':
        this.ev('fin', e, `Fin del dominio: r = ${e.r.toFixed(4)} M, a ${(e.lambda * this.tg).toFixed(1)} s de tiempo propio del cruce del horizonte… la geodésica termina en la singularidad en tiempo propio finito; no se extrapola.`);
        this.status = 'fin del dominio';
        break;
    }
  }

  /** Avanza hasta tTarget o hasta agotar budgetMs. */
  advance(tTarget: number, budgetMs: number): ChunkOut {
    const t0 = performance.now();
    const k0 = this.next;
    const bodyRows: number[] = [];
    const pieceRows: number[] = [];
    const partRows: number[] = [];
    const photRows: number[] = [];
    while (!this.done && performance.now() - t0 < budgetMs) {
      const tk = this.sampleTime(this.next);
      if (tk > tTarget) break;
      const ok = this.type === 'body' ? this.sampleBody(tk, bodyRows, pieceRows) : this.type === 'cloud' ? this.sampleCloud(tk, partRows) : this.sampleBeam(tk, photRows);
      if (!ok) {
        this.done = true;
        break;
      }
      this.next++;
    }
    const n = this.next - k0;
    const events = this.pending;
    this.pending = [];
    if (this.status === 'en curso' && this.c0 && this.c0.E < 1 && this.type !== 'beam') this.status = 'ligado';
    return {
      id: this.id,
      type: this.type,
      k0,
      n,
      body: this.type === 'body' ? Float64Array.from(bodyRows) : null,
      pieces: this.type === 'body' ? Float32Array.from(pieceRows) : null,
      particles: this.type === 'cloud' ? Float32Array.from(partRows) : null,
      nParticles: this.partGI.length,
      photons: this.type === 'beam' ? Float32Array.from(photRows) : null,
      nPhotons: this.photGI.length,
      photonSummary: this.type === 'beam' ? this.photonState.map((p) => ({ ...p })) : null,
      events,
      done: this.done,
      tComputed: this.sampleTime(this.next - 1),
      status: this.status,
    };
  }

  private sampleBody(tk: number, rows: number[], pieceRows: number[]): boolean {
    const gi = this.bodyGI!;
    while (gi.t < tk && !gi.terminated) for (const e of gi.step({ isco: this.rIsco, ergosphere: true })) this.onGeoEvent(e);
    if (gi.terminated && tk > gi.terminated.t) {
      this.done = true;
      return false;
    }
    const y = tk === gi.t || tk < gi.solver.tPrev ? Float64Array.from(gi.y) : Float64Array.from(gi.denseAt(tk, new Float64Array(gi.n)));
    const ks = this.ks;
    const pos: [number, number, number] = [y[0], y[1], y[2]];
    const p = [y[3], y[4], y[5], y[6]];
    const u = ks.raise(pos[0], pos[1], pos[2], p);
    const e1 = y.subarray(8, 12);
    const e2 = y.subarray(12, 16);
    const e3 = y.subarray(16, 20);
    const sph = spheroidalFromCartesian(pos[0], pos[1], pos[2], ks.a);
    const r = sph.r;
    const E = tidalTensor(ks, pos[0], pos[1], pos[2], u, [e1, e2, e3]);
    const ESI = E.map((v) => v * this.tidalSI);
    const { values, vectors } = symmetricEigen3(ESI);
    const lambda = -values[0]; // estiramiento máximo (s⁻²)
    const spec = CATALOG[this.cfg.object];
    const stress = tidalStress(spec.breakModel, lambda, 1);
    const c = constantsOfMotion(ks, pos, p);
    const row = new Array<number>(SAMPLE_SIZE).fill(0);
    row[S_T] = tk;
    row[S_X] = pos[0];
    row[S_X + 1] = pos[1];
    row[S_X + 2] = pos[2];
    for (let i = 0; i < 4; i++) row[S_U + i] = u[i];
    row[S_TAU] = y[7] * this.tg;
    for (let i = 0; i < 4; i++) row[S_P + i] = p[i];
    for (let i = 0; i < 4; i++) {
      row[S_E1 + i] = e1[i];
      row[S_E1 + 4 + i] = e2[i];
      row[S_E1 + 8 + i] = e3[i];
    }
    row[S_TID] = ESI[0];
    row[S_TID + 1] = ESI[1];
    row[S_TID + 2] = ESI[2];
    row[S_TID + 3] = ESI[4];
    row[S_TID + 4] = ESI[5];
    row[S_TID + 5] = ESI[8];
    row[S_K] = kretschmann(r, sph.theta, ks.a);
    if (this.c0) {
      row[S_DRIFT] = Math.abs(c.mu2 - 1);
      row[S_DRIFT + 1] = Math.abs(c.E - this.c0.E) / Math.max(Math.abs(this.c0.E), 1e-12);
      row[S_DRIFT + 2] = Math.abs(c.Lz - this.c0.Lz) / Math.max(Math.abs(this.c0.Lz), 1e-3);
      row[S_DRIFT + 3] = Math.abs(c.Q - this.c0.Q) / Math.max(Math.abs(this.c0.Q), 1e-3);
    }
    row[S_R] = r;
    row[S_STRESS] = stress;
    const inErgo = r < ergosphereRadius(ks.a, sph.theta) && r > this.rPlus;
    row[S_FLAGS] = (r < this.rPlus ? 1 : 0) | (this.fractured ? 2 : 0) | (inErgo ? 4 : 0);
    rows.push(...row);
    // --- Piezas: desviación geodésica en el marco del cuerpo ---
    const tauS = row[S_TAU];
    if (this.lastE && tauS > this.lastTauS) this.integratePieces(this.lastTauS, tauS, this.lastE, ESI);
    this.lastTauS = tauS;
    this.lastE = ESI;
    this.checkFracture(ESI, lambda, vectors, tk, tauS, r);
    pieceRows.push(this.pieces.length);
    for (const pc of this.pieces) pieceRows.push(pc.x[0], pc.x[1], pc.x[2], pc.s);
    return true;
  }

  /** RK4 de ξ'' = −E(τ) ξ para cada pieza, con E interpolado linealmente entre muestras. */
  private integratePieces(ta: number, tb: number, Ea: Float64Array, Eb: Float64Array): void {
    if (this.pieces.length === 1 && !this.fractured) return;
    const nsub = 16;
    const h = (tb - ta) / nsub;
    const acc = (s: number, x: number[], out: number[]) => {
      for (let i = 0; i < 3; i++) {
        let v = 0;
        for (let j = 0; j < 3; j++) v += (Ea[3 * i + j] * (1 - s) + Eb[3 * i + j] * s) * x[j];
        out[i] = -v;
      }
    };
    const a1 = [0, 0, 0];
    const a2 = [0, 0, 0];
    const a3 = [0, 0, 0];
    const a4 = [0, 0, 0];
    for (const pc of this.pieces) {
      let x = [...pc.x];
      let v = [...pc.v];
      for (let k = 0; k < nsub; k++) {
        const s0 = k / nsub;
        const sm = (k + 0.5) / nsub;
        const s1 = (k + 1) / nsub;
        acc(s0, x, a1);
        const x2 = x.map((q, i) => q + 0.5 * h * v[i]);
        const v2 = v.map((q, i) => q + 0.5 * h * a1[i]);
        acc(sm, x2, a2);
        const x3 = x.map((q, i) => q + 0.5 * h * v2[i]);
        const v3 = v.map((q, i) => q + 0.5 * h * a2[i]);
        acc(sm, x3, a3);
        const x4 = x.map((q, i) => q + h * v3[i]);
        const v4 = v.map((q, i) => q + h * a3[i]);
        acc(s1, x4, a4);
        x = x.map((q, i) => q + (h / 6) * (v[i] + 2 * v2[i] + 2 * v3[i] + v4[i]));
        v = v.map((q, i) => q + (h / 6) * (a1[i] + 2 * a2[i] + 2 * a3[i] + a4[i]));
      }
      pc.x = [x[0], x[1], x[2]];
      pc.v = [v[0], v[1], v[2]];
    }
  }

  private checkFracture(ESI: Float64Array, _lambda: number, vectors: Float64Array, tk: number, tauS: number, r: number): void {
    const spec = CATALOG[this.cfg.object];
    const model = spec.breakModel;
    if (model.type === 'none') return;
    const asteroidRubble = this.cfg.object === 'asteroide' && this.cfg.rubblePile;
    const eff = asteroidRubble && model.type === 'monolith' ? { ...model, tensile: 0 } : model;
    // Dirección de máximo estiramiento (columna 0 de los autovectores ordenados)
    const n: [number, number, number] = [vectors[0], vectors[3], vectors[6]];
    const { values } = symmetricEigen3(ESI);
    const lam = -values[0];
    const out: Piece[] = [];
    let split = 0;
    for (const pc of this.pieces) {
      const lc = criticalTidalGradient(eff, pc.s);
      if (lam > lc && this.pieces.length + split < MAX_PIECES) {
        const half = (model.type === 'monolith' ? model.radius : model.length / 2) * pc.s * 0.5;
        const s2 = pc.s / Math.cbrt(2);
        out.push({ x: [pc.x[0] + half * n[0], pc.x[1] + half * n[1], pc.x[2] + half * n[2]], v: [...pc.v], s: s2 });
        out.push({ x: [pc.x[0] - half * n[0], pc.x[1] - half * n[1], pc.x[2] - half * n[2]], v: [...pc.v], s: s2 });
        split++;
      } else out.push(pc);
    }
    if (split > 0) {
      if (!this.fractured) {
        const stress = tidalStress(eff, lam, 1);
        this.pending.push({
          kind: 'fractura',
          t: tk,
          tau: tauS,
          r,
          text: `Rotura por marea en r = ${r.toFixed(3)} M (${r < this.rPlus ? 'dentro' : 'fuera'} del horizonte): λ = ${lam.toExponential(2)} s⁻², tensión ≈ ${stress.toExponential(2)} Pa > resistencia ${(eff as { tensile: number }).tensile.toExponential(1)} Pa${asteroidRubble ? ' (agregado: solo autogravedad)' : ''}.`,
        });
      }
      this.fractured = true;
      this.pieces = out;
    }
    // Validez de la linealización: separación ≪ radio de curvatura ~ (r³/2M)^{1/2}·r_g
    if (!this.warnedNonlinear && this.fractured) {
      let maxXi = 0;
      for (const pc of this.pieces) maxXi = Math.max(maxXi, Math.hypot(...pc.x));
      const curvRadiusM = Math.sqrt((r * r * r) / 2) * this.rgM;
      if (maxXi > 0.05 * curvRadiusM) {
        this.warnedNonlinear = true;
        this.pending.push({ kind: 'aviso', t: tk, tau: tauS, r, text: 'Los fragmentos se separan más del 5 % del radio de curvatura: la desviación geodésica linealizada pierde precisión.' });
      }
    }
  }

  private sampleCloud(tk: number, rows: number[]): boolean {
    let alive = 0;
    const ks = this.ks;
    for (const gi of this.partGI) {
      while (gi.t < tk && !gi.terminated) for (const e of gi.step()) if (e.kind === 'horizon' && this.status === 'en curso') this.status = 'capturado';
      let y: Float64Array;
      let live = 1;
      if (gi.terminated && tk > gi.terminated.t) {
        y = gi.terminated.state;
        live = 0;
      } else {
        y = tk === gi.t || tk < gi.solver.tPrev ? gi.y : gi.denseAt(tk, new Float64Array(gi.n));
        alive++;
      }
      const u = ks.raise(y[0], y[1], y[2], [y[3], y[4], y[5], y[6]]);
      rows.push(y[0], y[1], y[2], y[7] * this.tg, live ? u[0] : 0, u[1], u[2], u[3]);
    }
    void PARTICLE_SIZE;
    if (alive === 0) {
      this.status = this.status === 'en curso' ? 'fin del dominio' : this.status;
      this.pending.push({ kind: 'fin', t: tk, tau: 0, r: 0, text: 'Todas las partículas de la nube han terminado su integración.' });
      return false;
    }
    return true;
  }

  private sampleBeam(tk: number, rows: number[]): boolean {
    let alive = 0;
    const ks = this.ks;
    this.photGI.forEach((gi, j) => {
      const st = this.photonState[j];
      while (gi.t < tk && !gi.terminated) {
        for (const e of gi.step()) {
          if (e.kind === 'horizon') st.status = 'capturado';
          if (e.kind === 'escape') st.status = 'escapado';
        }
      }
      let y: Float64Array;
      let live = 1;
      if (gi.terminated && tk > gi.terminated.t) {
        y = gi.terminated.state;
        live = 0;
        if (gi.terminated.kind === 'escape' && st.deflectionDeg === null) {
          const d = new Float64Array(8);
          gi.rhs(gi.terminated.t, gi.terminated.state, d);
          const nn = Math.hypot(d[0], d[1], d[2]);
          const d0 = this.photonInitDir[j];
          const cos = (d[0] * d0[0] + d[1] * d0[1] + d[2] * d0[2]) / nn;
          st.deflectionDeg = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
        }
      } else {
        y = tk === gi.t || tk < gi.solver.tPrev ? gi.y : gi.denseAt(tk, new Float64Array(gi.n));
        alive++;
      }
      const r = ks.geometry(y[0], y[1], y[2]).r;
      st.rMin = Math.min(st.rMin, r);
      const phi = Math.atan2(y[1], y[0]);
      let dphi = phi - this.photonLastPhi[j];
      while (dphi > Math.PI) dphi -= 2 * Math.PI;
      while (dphi < -Math.PI) dphi += 2 * Math.PI;
      this.photonPhi[j] += dphi;
      this.photonLastPhi[j] = phi;
      st.windings = Math.abs(this.photonPhi[j]) / (2 * Math.PI);
      rows.push(y[0], y[1], y[2], live);
    });
    if (alive === 0) {
      const nc = this.photonState.filter((p) => p.status === 'capturado').length;
      this.pending.push({ kind: 'fin', t: tk, tau: 0, r: 0, text: `Haz terminado: ${nc} capturados, ${this.photonState.length - nc} escapados.` });
      this.status = nc === this.photonState.length ? 'capturado' : 'escapado';
      return false;
    }
    return true;
  }
}
