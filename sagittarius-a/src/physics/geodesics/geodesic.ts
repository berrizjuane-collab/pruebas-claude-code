/**
 * Integración de geodésicas (masivas y nulas) en Kerr–Schild con Dormand–Prince 5(4).
 *
 * Variable independiente: el tiempo coordenado t de Kerr–Schild. Es una función temporal global
 * (g^tt = −1 − f < 0 para r > 0), así que dt/dλ > 0 a lo largo de cualquier curva causal futura,
 * también dentro del horizonte: el horizonte se cruza en t finito y sin singularidades.
 *
 * Estado: y = [x, y, z, p_t, p_x, p_y, p_z, λ, (e₁, e₂, e₃)ᵘ…]
 *   - λ es el tiempo propio τ para cuerpos masivos (g^μν p_μ p_ν = −1) o el parámetro afín.
 *   - Opcionalmente se transportan en paralelo tres vectores espaciales (marco giroscópico):
 *     de^μ/dt = −Γ^μ_αβ (dx^α/dt) e^β.
 */
import { Dopri5, findRoot } from '../integrators/dopri5';
import { KerrSchild } from '../metrics/kerrSchild';
import { ergosphereRadius, horizons } from '../metrics/kerr';

export type GeodesicKind = 'massive' | 'null';

export interface GeodesicOptions {
  rtol?: number;
  atol?: number;
  transportFrame?: boolean;
  /** Paso máximo en t. */
  hMax?: number;
}

export type GeodesicEventKind =
  | 'horizon' // cruce de r = r₊ hacia dentro
  | 'innerHorizon' // fin del dominio: horizonte interior (Cauchy) r₋
  | 'singularity' // fin del dominio: r < r_cut (a ≈ 0)
  | 'escape' // r > r_escape alejándose
  | 'periapsis'
  | 'apoapsis'
  | 'isco'
  | 'ergosphere';

export interface GeodesicEvent {
  kind: GeodesicEventKind;
  t: number;
  lambda: number;
  r: number;
  state: Float64Array;
}

/** Radio de corte del dominio clásico integrado (ver docs/MATEMATICAS.md §cortes). */
export function domainCutoffRadius(a: number): { r: number; kind: 'innerHorizon' | 'singularity' } {
  const { rMinus } = horizons(a);
  if (rMinus > 2e-3) return { r: rMinus * 1.02 + 2e-3, kind: 'innerHorizon' };
  return { r: 2e-3, kind: 'singularity' };
}

export const STATE_BASE = 8;
export const STATE_WITH_FRAME = STATE_BASE + 12;

export class GeodesicIntegrator {
  readonly ks: KerrSchild;
  readonly kind: GeodesicKind;
  readonly transportFrame: boolean;
  readonly solver: Dopri5;
  readonly n: number;
  readonly rPlus: number;
  readonly rCut: number;
  readonly cutKind: 'innerHorizon' | 'singularity';
  rEscape = 4000;
  private readonly ham = new Float64Array(8);
  private readonly dham = new Float64Array(8);
  private readonly gamma = new Float64Array(64);
  private readonly dense = new Float64Array(STATE_WITH_FRAME);
  terminated: GeodesicEvent | null = null;
  crossedHorizon: GeodesicEvent | null = null;

  constructor(ks: KerrSchild, kind: GeodesicKind, opts: GeodesicOptions = {}) {
    this.ks = ks;
    this.kind = kind;
    this.transportFrame = !!opts.transportFrame;
    this.n = this.transportFrame ? STATE_WITH_FRAME : STATE_BASE;
    const { rPlus } = horizons(ks.a);
    this.rPlus = rPlus;
    const cut = domainCutoffRadius(ks.a);
    this.rCut = cut.r;
    this.cutKind = cut.kind;
    this.solver = new Dopri5(this.n, (t, y, dy) => this.rhs(t, y, dy), {
      rtol: opts.rtol ?? 1e-10,
      atol: opts.atol ?? 1e-12,
      hMax: opts.hMax ?? 50,
      // Escala física: el paso en t no supera una fracción de la distancia al origen.
      hLimit: (_t, y) => {
        const r = this.ks.geometry(y[0], y[1], y[2]).r;
        return 0.25 * Math.max(r, 1e-3);
      },
    });
  }

  /** dy/dt a partir del flujo hamiltoniano. */
  rhs(t: number, y: Float64Array, dy: Float64Array): void {
    const h = this.ham;
    h[0] = t;
    h[1] = y[0];
    h[2] = y[1];
    h[3] = y[2];
    h[4] = y[3];
    h[5] = y[4];
    h[6] = y[5];
    h[7] = y[6];
    const d = this.dham;
    this.ks.hamiltonianRHS(h, d);
    const inv = 1 / d[0]; // dλ/dt
    dy[0] = d[1] * inv;
    dy[1] = d[2] * inv;
    dy[2] = d[3] * inv;
    dy[3] = 0;
    dy[4] = d[5] * inv;
    dy[5] = d[6] * inv;
    dy[6] = d[7] * inv;
    dy[7] = inv;
    if (this.transportFrame) {
      const G = this.ks.christoffel(y[0], y[1], y[2], this.gamma);
      const v0 = 1;
      const v1 = dy[0];
      const v2 = dy[1];
      const v3 = dy[2];
      for (let k = 0; k < 3; k++) {
        const o = STATE_BASE + 4 * k;
        const e0 = y[o];
        const e1 = y[o + 1];
        const e2 = y[o + 2];
        const e3 = y[o + 3];
        for (let m = 0; m < 4; m++) {
          const b = 16 * m;
          // Γ^m_αβ v^α e^β
          const s =
            v0 * (G[b] * e0 + G[b + 1] * e1 + G[b + 2] * e2 + G[b + 3] * e3) +
            v1 * (G[b + 4] * e0 + G[b + 5] * e1 + G[b + 6] * e2 + G[b + 7] * e3) +
            v2 * (G[b + 8] * e0 + G[b + 9] * e1 + G[b + 10] * e2 + G[b + 11] * e3) +
            v3 * (G[b + 12] * e0 + G[b + 13] * e1 + G[b + 14] * e2 + G[b + 15] * e3);
          dy[o + m] = -s;
        }
      }
    }
  }

  /**
   * Inicia la integración en t0 con posición (x, y, z) y momento covariante p_μ.
   * frame: tres vectores espaciales (contravariantes) a transportar, si procede.
   */
  reset(t0: number, pos: ArrayLike<number>, p: ArrayLike<number>, frame?: ArrayLike<number>[], h0?: number): void {
    const y0 = new Float64Array(this.n);
    y0[0] = pos[0];
    y0[1] = pos[1];
    y0[2] = pos[2];
    y0[3] = p[0];
    y0[4] = p[1];
    y0[5] = p[2];
    y0[6] = p[3];
    y0[7] = 0;
    if (this.transportFrame) {
      if (!frame) throw new Error('Falta el marco a transportar');
      for (let k = 0; k < 3; k++) for (let m = 0; m < 4; m++) y0[STATE_BASE + 4 * k + m] = frame[k][m];
    }
    const r0 = this.ks.geometry(pos[0], pos[1], pos[2]).r;
    this.solver.reset(t0, y0, h0 ?? Math.min(0.05 * r0, 1));
    this.terminated = null;
    this.crossedHorizon = null;
  }

  get t(): number {
    return this.solver.t;
  }

  get y(): Float64Array {
    return this.solver.y;
  }

  radius(y: ArrayLike<number>): number {
    return this.ks.geometry(y[0], y[1], y[2]).r;
  }

  /** dr/dt = ∂_i r · dxⁱ/dt (solo necesita el flujo hamiltoniano, no el transporte). */
  radialRate(y: Float64Array): number {
    const h = this.ham;
    h[0] = 0;
    h[1] = y[0];
    h[2] = y[1];
    h[3] = y[2];
    h[4] = y[3];
    h[5] = y[4];
    h[6] = y[5];
    h[7] = y[6];
    const d = this.dham;
    this.ks.hamiltonianRHS(h, d);
    const g = this.ks.geometry(y[0], y[1], y[2]);
    return (g.dr[0] * d[1] + g.dr[1] * d[2] + g.dr[2] * d[3]) / d[0];
  }

  /**
   * Avanza un paso aceptado y detecta eventos en él (localizados con la salida densa).
   * Devuelve los eventos ocurridos (en orden).
   */
  step(trackEvents: { isco?: number; ergosphere?: boolean } = {}): GeodesicEvent[] {
    if (this.terminated) return [];
    const s = this.solver;
    const y0 = Float64Array.from(s.y);
    const r0 = this.radius(y0);
    const dr0 = this.radialRate(y0);
    s.step(1);
    const y1 = s.y;
    const r1 = this.radius(y1);
    const dr1 = this.radialRate(y1);
    const events: GeodesicEvent[] = [];
    const locate = (gfun: (y: Float64Array) => number, g0: number, g1: number, kind: GeodesicEventKind) => {
      const th = findRoot((x) => gfun(s.dense(s.tPrev + x * (s.t - s.tPrev), this.dense)), g0, g1);
      const tt = s.tPrev + th * (s.t - s.tPrev);
      const st = Float64Array.from(s.dense(tt, this.dense));
      events.push({ kind, t: tt, lambda: st[7], r: this.radius(st), state: st });
    };
    const rOf = (y: Float64Array) => this.radius(y);
    // Cruce del horizonte exterior hacia dentro
    if (r0 > this.rPlus && r1 <= this.rPlus) {
      locate((y) => rOf(y) - this.rPlus, r0 - this.rPlus, r1 - this.rPlus, 'horizon');
      this.crossedHorizon = events[events.length - 1];
    }
    if (trackEvents.isco !== undefined) {
      const ri = trackEvents.isco;
      if (r0 > ri && r1 <= ri) locate((y) => rOf(y) - ri, r0 - ri, r1 - ri, 'isco');
    }
    // Entrada en la ergosfera: r = r_E(θ) = M + √(M² − a² cos²θ), con cos θ = z/r
    if (trackEvents.ergosphere && this.ks.a !== 0) {
      const ergo = (y: Float64Array) => {
        const r = rOf(y);
        return r - ergosphereRadius(this.ks.a, Math.acos(Math.max(-1, Math.min(1, y[2] / r))));
      };
      const e0 = ergo(y0);
      const e1 = ergo(y1);
      if (e0 > 0 && e1 <= 0) locate(ergo, e0, e1, 'ergosphere');
    }
    // Pericentro / apocentro (cambio de signo de dr/dt)
    if (dr0 < 0 && dr1 >= 0 && r1 > this.rPlus) {
      const th = findRoot((x) => this.radialRate(s.dense(s.tPrev + x * (s.t - s.tPrev), this.dense)), dr0, dr1);
      const tt = s.tPrev + th * (s.t - s.tPrev);
      const st = Float64Array.from(s.dense(tt, this.dense));
      events.push({ kind: 'periapsis', t: tt, lambda: st[7], r: this.radius(st), state: st });
    } else if (dr0 > 0 && dr1 <= 0) {
      const th = findRoot((x) => this.radialRate(s.dense(s.tPrev + x * (s.t - s.tPrev), this.dense)), dr0, dr1);
      const tt = s.tPrev + th * (s.t - s.tPrev);
      const st = Float64Array.from(s.dense(tt, this.dense));
      events.push({ kind: 'apoapsis', t: tt, lambda: st[7], r: this.radius(st), state: st });
    }
    // Fin del dominio clásico
    if (r1 <= this.rCut) {
      locate((y) => rOf(y) - this.rCut, r0 - this.rCut, r1 - this.rCut, this.cutKind);
      this.terminated = events[events.length - 1];
    } else if (r1 >= this.rEscape && dr1 > 0) {
      events.push({ kind: 'escape', t: s.t, lambda: y1[7], r: r1, state: Float64Array.from(y1) });
      this.terminated = events[events.length - 1];
    }
    events.sort((p, q) => p.t - q.t);
    return events;
  }

  /** Estado interpolado en t dentro del último paso aceptado. */
  denseAt(t: number, out: Float64Array): Float64Array {
    return this.solver.dense(t, out);
  }
}

/**
 * Integra una geodésica hasta tEnd o hasta terminar, muestreando a Δt uniforme.
 * Utilidad de alto nivel para pruebas y para el trabajador de simulación.
 */
export function integrateSampled(
  gi: GeodesicIntegrator,
  tEnd: number,
  dtSample: number,
  onSample: (t: number, y: Float64Array) => void,
  onEvent?: (e: GeodesicEvent) => void,
  track: { isco?: number } = {},
): void {
  const buf = new Float64Array(gi.n);
  let tNext = gi.t;
  onSample(gi.t, Float64Array.from(gi.y));
  tNext += dtSample;
  while (!gi.terminated && gi.t < tEnd) {
    const evs = gi.step(track);
    const term = gi.terminated as GeodesicEvent | null;
    const tStop = term ? term.t : gi.t;
    while (tNext <= Math.min(tStop, tEnd)) {
      onSample(tNext, gi.denseAt(tNext, buf));
      tNext += dtSample;
    }
    if (onEvent) for (const e of evs) onEvent(e);
  }
}
