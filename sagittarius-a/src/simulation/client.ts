/**
 * Cliente del trabajador de física (hilo principal): lanza experimentos, recibe las muestras,
 * las almacena e interpola para la reproducción a cualquier t.
 */
import PhysicsWorker from './physicsWorker?worker&inline';
import { DT_SAMPLE, type ChunkOut, type PhotonSummary, type Scales } from './runner';
import { PARTICLE_SIZE, SAMPLE_SIZE, type ExperimentStatus, type LaunchConfig, type PhysEvent } from './types';
import type { Curve, FamilyRequest } from './geodesicFamilies';
import type { TrackRequest, TrackResult } from './signalTracker';

class Grow64 {
  data = new Float64Array(4096);
  length = 0;
  push(arr: Float64Array): void {
    if (this.length + arr.length > this.data.length) {
      let n = this.data.length;
      while (this.length + arr.length > n) n *= 2;
      const d = new Float64Array(n);
      d.set(this.data.subarray(0, this.length));
      this.data = d;
    }
    this.data.set(arr, this.length);
    this.length += arr.length;
  }
}

class Grow32 {
  data = new Float32Array(4096);
  length = 0;
  push(arr: Float32Array): void {
    if (this.length + arr.length > this.data.length) {
      let n = this.data.length;
      while (this.length + arr.length > n) n *= 2;
      const d = new Float32Array(n);
      d.set(this.data.subarray(0, this.length));
      this.data = d;
    }
    this.data.set(arr, this.length);
    this.length += arr.length;
  }
}

export interface Experiment {
  id: string;
  cfg: LaunchConfig;
  a: number;
  tLaunch: number;
  type: 'body' | 'cloud' | 'beam' | 'pendiente';
  color: string;
  label: string;
  info: Record<string, number | string>;
  warnings: string[];
  body: Grow64;
  /** Índices de inicio de cada muestra en `pieces` (cuerpo extenso). */
  pieceIndex: number[];
  pieces: Grow32;
  particles: Grow32;
  nParticles: number;
  photons: Grow32;
  nPhotons: number;
  photonB: number[];
  photonSummary: PhotonSummary[];
  events: PhysEvent[];
  status: ExperimentStatus;
  done: boolean;
  tComputed: number;
  nSamples: number;
  error: string | null;
  slot: 'A' | 'B' | null;
  /** Versión: cambia con cada bloque recibido (para refrescar geometrías). */
  version: number;
}

export interface BodyState {
  t: number;
  pos: [number, number, number];
  u: [number, number, number, number];
  tau: number;
  p: [number, number, number, number];
  e: [number[], number[], number[]];
  tidal: number[];
  K: number;
  drift: number[];
  r: number;
  stress: number;
  flags: number;
  k: number;
  frac: number;
}

export const EXPERIMENT_COLORS = ['#e3a54a', '#6cc6d9', '#c48df0', '#8fd18a', '#f07a6a', '#d9d36c'];

export class PhysicsClient {
  private worker: Worker;
  readonly experiments = new Map<string, Experiment>();
  private nextId = 1;
  private reqId = 1;
  private pendingReq = new Map<number, (v: unknown) => void>();
  onChange: (exp: Experiment, newEvents: PhysEvent[]) => void = () => {};
  onLaunched: (exp: Experiment) => void = () => {};
  onError: (exp: Experiment, msg: string) => void = () => {};

  constructor() {
    this.worker = new PhysicsWorker();
    this.worker.onmessage = (ev) => this.onMessage(ev.data);
  }

  private onMessage(m: { type: string; [k: string]: unknown }): void {
    if (m.type === 'chunk') {
      const c = m.chunk as ChunkOut;
      const exp = this.experiments.get(c.id);
      if (!exp) return;
      if (c.body) exp.body.push(c.body);
      if (c.pieces) {
        let off = 0;
        for (let s = 0; s < c.n; s++) {
          exp.pieceIndex.push(exp.pieces.length + off);
          const cnt = c.pieces[off];
          off += 1 + 4 * cnt;
        }
        exp.pieces.push(c.pieces);
      }
      if (c.particles) exp.particles.push(c.particles);
      if (c.photons) exp.photons.push(c.photons);
      if (c.photonSummary) exp.photonSummary = c.photonSummary;
      exp.nSamples += c.n;
      // Los eventos del integrador (exactos) pueden llegar antes que los detectados en las muestras
      // (cada 0,25 M): se ordenan por tiempo coordenado para que el registro sea cronológico.
      exp.events.push(...c.events);
      exp.events.sort((x, y) => x.t - y.t);
      exp.status = c.status;
      exp.done = c.done;
      exp.tComputed = c.tComputed;
      exp.version++;
      this.onChange(exp, c.events);
    } else if (m.type === 'launched') {
      const exp = this.experiments.get(m.id as string);
      if (!exp) return;
      exp.type = m.kind as Experiment['type'];
      exp.info = m.info as Record<string, number | string>;
      exp.warnings = m.warnings as string[];
      exp.nParticles = m.nParticles as number;
      exp.nPhotons = m.nPhotons as number;
      exp.photonB = m.photonB as number[];
      this.onLaunched(exp);
    } else if (m.type === 'error') {
      const exp = this.experiments.get(m.id as string);
      if (!exp) return;
      exp.error = m.message as string;
      exp.status = 'error';
      exp.done = true;
      this.experiments.delete(exp.id);
      this.onError(exp, exp.error);
    } else if (m.type === 'families' || m.type === 'track') {
      const cb = this.pendingReq.get(m.reqId as number);
      if (cb) {
        this.pendingReq.delete(m.reqId as number);
        cb(m.type === 'families' ? m.curves : m.result);
      }
    }
  }

  launch(cfg: LaunchConfig, a: number, tLaunch: number, scales: Scales, label: string, slot: 'A' | 'B' | null = null): Experiment {
    const id = `exp${this.nextId++}`;
    const exp: Experiment = {
      id,
      cfg: structuredClone(cfg),
      a,
      tLaunch,
      type: 'pendiente',
      color: EXPERIMENT_COLORS[(this.nextId - 2) % EXPERIMENT_COLORS.length],
      label,
      info: {},
      warnings: [],
      body: new Grow64(),
      pieceIndex: [],
      pieces: new Grow32(),
      particles: new Grow32(),
      nParticles: 0,
      photons: new Grow32(),
      nPhotons: 0,
      photonB: [],
      photonSummary: [],
      events: [],
      status: 'calculando',
      done: false,
      tComputed: tLaunch,
      nSamples: 0,
      error: null,
      slot,
      version: 0,
    };
    this.experiments.set(id, exp);
    this.worker.postMessage({ type: 'launch', id, a, cfg, tLaunch, scales });
    return exp;
  }

  remove(id: string): void {
    this.experiments.delete(id);
    this.worker.postMessage({ type: 'remove', id });
  }

  clear(): void {
    this.experiments.clear();
    this.worker.postMessage({ type: 'clear' });
  }

  setTarget(t: number): void {
    this.worker.postMessage({ type: 'target', t });
  }

  families(req: FamilyRequest): Promise<Curve[]> {
    const id = this.reqId++;
    return new Promise((res) => {
      this.pendingReq.set(id, res as (v: unknown) => void);
      this.worker.postMessage({ type: 'families', reqId: id, req });
    });
  }

  track(req: TrackRequest): Promise<TrackResult> {
    const id = this.reqId++;
    return new Promise((res) => {
      this.pendingReq.set(id, res as (v: unknown) => void);
      this.worker.postMessage({ type: 'track', reqId: id, req }, [req.emitter.buffer]);
    });
  }

  /** Índice fraccionario de muestra para el tiempo t (o null si fuera de lo calculado). */
  sampleIndex(exp: Experiment, t: number): number | null {
    if (exp.nSamples === 0) return null;
    const f = (t - exp.tLaunch) / DT_SAMPLE;
    if (f < 0) return null;
    return Math.min(f, exp.nSamples - 1);
  }

  /** Estado interpolado del cuerpo en t (se congela en la última muestra si t la supera). */
  bodyAt(exp: Experiment, t: number): BodyState | null {
    if (exp.type !== 'body' && exp.type !== 'cloud') return null;
    const f = this.sampleIndex(exp, t);
    if (f === null || exp.type !== 'body') return null;
    const k = Math.floor(f);
    const fr = f - k;
    const d = exp.body.data;
    const A = k * SAMPLE_SIZE;
    const B = Math.min(k + 1, exp.nSamples - 1) * SAMPLE_SIZE;
    const L = (i: number) => d[A + i] + (d[B + i] - d[A + i]) * fr;
    return {
      t: L(0),
      pos: [L(1), L(2), L(3)],
      u: [L(4), L(5), L(6), L(7)],
      tau: L(8),
      p: [L(9), L(10), L(11), L(12)],
      e: [
        [L(13), L(14), L(15), L(16)],
        [L(17), L(18), L(19), L(20)],
        [L(21), L(22), L(23), L(24)],
      ],
      tidal: [L(25), L(26), L(27), L(28), L(29), L(30)],
      K: L(31),
      drift: [d[A + 32], d[A + 33], d[A + 34], d[A + 35]],
      r: L(36),
      stress: L(37),
      flags: d[A + 38],
      k,
      frac: fr,
    };
  }

  /** Piezas (x, y, z, s) en metros, marco del cuerpo, en la muestra k. */
  piecesAt(exp: Experiment, k: number): Float32Array {
    if (k < 0 || k >= exp.pieceIndex.length) return new Float32Array(0);
    const off = exp.pieceIndex[k];
    const n = exp.pieces.data[off];
    return exp.pieces.data.subarray(off + 1, off + 1 + 4 * n);
  }

  /** Posiciones de las partículas de la nube en t: Float32Array de (x, y, z, vivo) × n. */
  particlesAt(exp: Experiment, t: number): Float32Array {
    const out = new Float32Array(exp.nParticles * 4);
    const f = this.sampleIndex(exp, t);
    if (f === null) return out;
    const k = Math.floor(f);
    const fr = f - k;
    const N = exp.nParticles;
    const d = exp.particles.data;
    const k1 = Math.min(k + 1, exp.nSamples - 1);
    for (let j = 0; j < N; j++) {
      const A = (k * N + j) * PARTICLE_SIZE;
      const B = (k1 * N + j) * PARTICLE_SIZE;
      for (let i = 0; i < 3; i++) out[4 * j + i] = d[A + i] + (d[B + i] - d[A + i]) * fr;
      out[4 * j + 3] = d[B + 4] !== 0 ? 1 : 0;
    }
    return out;
  }

  /** Trazas de los fotones hasta t: por fotón, array (x, y, z) × m. */
  photonPaths(exp: Experiment, t: number): Float32Array[] {
    const N = exp.nPhotons;
    const f = this.sampleIndex(exp, t);
    if (f === null) return [];
    const kmax = Math.floor(f);
    const d = exp.photons.data;
    const out: Float32Array[] = [];
    for (let j = 0; j < N; j++) {
      const pts: number[] = [];
      for (let k = 0; k <= kmax; k++) {
        const A = (k * N + j) * 4;
        pts.push(d[A], d[A + 1], d[A + 2]);
        if (d[A + 3] === 0) break;
      }
      out.push(Float32Array.from(pts));
    }
    return out;
  }
}
