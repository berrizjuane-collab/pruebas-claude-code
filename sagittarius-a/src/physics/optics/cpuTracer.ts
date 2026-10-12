/**
 * Trazador de rayos relativista de REFERENCIA (CPU, doble precisión).
 *
 * Para cada dirección de la cámara se integra hacia el pasado la geodésica nula con el
 * hamiltoniano de Kerr–Schild y Dormand–Prince 5(4), junto con la transferencia radiativa:
 *   q = −e₀ + nⁱ eᵢ  (pasado, frecuencia unidad en la cámara),  k = −q,  g = ν_obs/ν_fluido = 1/(q·u)
 *   dτ_ν/dλ = (α_ν(ν/g)/g) r_g,     dI_ν/dλ = g² j_ν(ν/g) r_g e^{−τ_ν}
 * Clasificación: escape (r > R_esc alejándose), captura (r → r₊ desde fuera), región pasada
 * (cámara interior: el rayo se pega a r₊ por dentro con t → −∞) u ópticamente grueso.
 *
 * Es lento (milisegundos por rayo): se usa para validar el trazador de la GPU y para imágenes
 * de referencia de baja resolución.
 */
import { Dopri5 } from '../integrators/dopri5';
import { KerrSchild } from '../metrics/kerrSchild';
import { horizons } from '../metrics/kerr';
import type { Tetrad } from '../observers/observers';
import { RiafModel } from '../emission/riaf';
import { thermalSynchrotronAlpha, thermalSynchrotronJ } from '../emission/synchrotron';

export type RayStatus = 'escape' | 'capture' | 'past' | 'opaque' | 'maxsteps';

export interface RayResult {
  status: RayStatus;
  /** Dirección asintótica (unitaria) de la que procede la luz, si escapa. */
  dir: [number, number, number] | null;
  /** q_t conservado (= E_∞ del fotón con frecuencia unidad en la cámara): g_estrellas = 1/q_t. */
  qt: number;
  /** Intensidades específicas observadas [erg s⁻¹ cm⁻² Hz⁻¹ sr⁻¹] por frecuencia. */
  I: number[];
  tau: number[];
  steps: number;
  /** Radio mínimo alcanzado. */
  rMin: number;
}

export interface TraceSettings {
  rEscape: number;
  rtol: number;
  atol: number;
  maxSteps: number;
  /** Frecuencias observadas [Hz] para la transferencia (vacío = sin plasma). */
  nus: number[];
  /** r_g en cm (para la transferencia radiativa). */
  rgCm: number;
  /** Radio de captura relativo: r < r₊ + ε. */
  horizonEps: number;
  /** Δt máximo hacia el pasado dentro del horizonte antes de declarar «región pasada». */
  pastT: number;
}

export const DEFAULT_TRACE: TraceSettings = {
  rEscape: 1000,
  rtol: 1e-9,
  atol: 1e-11,
  maxSteps: 20000,
  nus: [],
  rgCm: 5.9065e11,
  horizonEps: 1e-3,
  pastT: 300,
};

export interface CameraState {
  /** Evento de la cámara (t, x, y, z). */
  t: number;
  pos: [number, number, number];
  /** Tétrada: e[0] = u, e[1] = derecha, e[2] = arriba, e[3] = hacia delante. */
  tetrad: Tetrad;
}

/** Momento covariante inicial del rayo hacia atrás para la dirección (nx, ny, nz) del marco de la cámara. */
export function initialRayMomentum(ks: KerrSchild, cam: CameraState, n: [number, number, number]): Float64Array {
  const e = cam.tetrad.e;
  const nn = Math.hypot(n[0], n[1], n[2]);
  const q = new Float64Array(4);
  for (let i = 0; i < 4; i++) q[i] = -e[0][i] + (n[0] * e[1][i] + n[1] * e[2][i] + n[2] * e[3][i]) / nn;
  return ks.lower(cam.pos[0], cam.pos[1], cam.pos[2], q);
}

export class CpuTracer {
  readonly ks: KerrSchild;
  readonly riaf: RiafModel | null;
  readonly s: TraceSettings;
  readonly rPlus: number;
  private readonly dham = new Float64Array(8);
  private readonly solver: Dopri5;
  private readonly nf: number;

  constructor(ks: KerrSchild, riaf: RiafModel | null, settings: Partial<TraceSettings> = {}) {
    this.ks = ks;
    this.riaf = riaf;
    this.s = { ...DEFAULT_TRACE, ...settings };
    this.rPlus = horizons(ks.a).rPlus;
    this.nf = riaf ? this.s.nus.length : 0;
    const n = 8 + 2 * this.nf;
    this.solver = new Dopri5(n, (_l, y, dy) => this.rhs(y, dy), {
      rtol: this.s.rtol,
      atol: this.s.atol,
      hLimit: (_l, y) => this.stepLimit(y),
    });
  }

  /** Límite del paso afín: fracción de la escala espacial (r o distancia al horizonte) y de la región emisora. */
  private stepLimit(y: Float64Array): number {
    const g = this.ks.geometry(y[1], y[2], y[3]);
    this.ks.hamiltonianRHS(y, this.dham);
    const v = Math.hypot(this.dham[1], this.dham[2], this.dham[3]) + 1e-12;
    let hc = 0.1 * Math.max(g.r, 0.05);
    if (this.riaf && g.r < this.riaf.p.rOut * 1.25) hc = Math.min(hc, 0.25);
    return hc / v;
  }

  private rhs(y: Float64Array, dy: Float64Array): void {
    this.ks.hamiltonianRHS(y, dy);
    const nf = this.nf;
    if (!nf || !this.riaf) return;
    for (let k = 0; k < nf; k++) {
      dy[8 + k] = 0;
      dy[8 + nf + k] = 0;
    }
    const st = this.riaf.state(y[1], y[2], y[3], y[0]);
    if (!st) return;
    // dx^μ/dλ de q (pasado) = −k^μ;  q·u = q_μ u^μ
    const qu = y[4] * st.u[0] + y[5] * st.u[1] + y[6] * st.u[2] + y[7] * st.u[3];
    if (!(qu > 0)) return;
    const g = 1 / qu;
    // Ángulo con el campo toroidal: cosθ_B = [k_φ + u_φ (k·u)] / [|b| (−k·u)], k = −q
    const kphi = -(y[1] * y[6] - y[2] * y[5]);
    const ku = -qu;
    const bn = Math.sqrt(Math.max(st.gPhiPhi + st.uPhi * st.uPhi, 1e-30));
    const cosB = (kphi + st.uPhi * ku) / (bn * -ku);
    const sinB = Math.sqrt(Math.max(0, 1 - cosB * cosB));
    const rg = this.s.rgCm;
    for (let k = 0; k < nf; k++) {
      const nuF = this.s.nus[k] / g;
      const j = thermalSynchrotronJ(nuF, st.ne, st.te, st.B, sinB);
      const al = thermalSynchrotronAlpha(nuF, j, st.te);
      const tau = y[8 + k];
      dy[8 + k] = (al / g) * rg;
      dy[8 + nf + k] = g * g * j * rg * Math.exp(-tau);
    }
  }

  trace(cam: CameraState, n: [number, number, number]): RayResult {
    const ks = this.ks;
    const nf = this.nf;
    const y0 = new Float64Array(8 + 2 * nf);
    y0[0] = cam.t;
    y0[1] = cam.pos[0];
    y0[2] = cam.pos[1];
    y0[3] = cam.pos[2];
    const q = initialRayMomentum(ks, cam, n);
    y0.set(q, 4);
    const s = this.solver;
    const r0 = ks.geometry(cam.pos[0], cam.pos[1], cam.pos[2]).r;
    s.reset(0, y0, 0.01 * Math.max(r0, 0.1));
    const inside0 = r0 < this.rPlus;
    let status: RayStatus = 'maxsteps';
    let rMin = r0;
    let steps = 0;
    const dy = new Float64Array(8);
    for (; steps < this.s.maxSteps; steps++) {
      try {
        s.step();
      } catch {
        status = 'maxsteps';
        break;
      }
      const y = s.y;
      const g = ks.geometry(y[1], y[2], y[3]);
      const r = g.r;
      rMin = Math.min(rMin, r);
      ks.hamiltonianRHS(y, dy);
      const drdl = g.dr[0] * dy[1] + g.dr[1] * dy[2] + g.dr[2] * dy[3];
      if (r > this.s.rEscape && drdl > 0) {
        status = 'escape';
        break;
      }
      if (r > this.rPlus && r < this.rPlus * (1 + this.s.horizonEps) + 1e-4 && drdl < 0) {
        status = 'capture';
        break;
      }
      if (r < this.rPlus && (inside0 || r < this.rPlus * 0.999) && cam.t - y[0] > this.s.pastT) {
        status = 'past';
        break;
      }
      if (r < 0.02) {
        status = 'past';
        break;
      }
      if (nf) {
        let minTau = Infinity;
        for (let k = 0; k < nf; k++) minTau = Math.min(minTau, y[8 + k]);
        if (minTau > 30) {
          status = 'opaque';
          break;
        }
      }
    }
    const y = s.y;
    let dir: [number, number, number] | null = null;
    if (status === 'escape') {
      ks.hamiltonianRHS(y, dy);
      const nn = Math.hypot(dy[1], dy[2], dy[3]);
      dir = [dy[1] / nn, dy[2] / nn, dy[3] / nn];
    }
    const I: number[] = [];
    const tau: number[] = [];
    for (let k = 0; k < nf; k++) {
      tau.push(y[8 + k]);
      I.push(y[8 + nf + k]);
    }
    return { status, dir, qt: y[4], I, tau, steps, rMin };
  }
}

/** Dirección en el marco de la cámara para el píxel (i, j) de una imagen w×h con campo vertical fovY. */
export function pixelDirection(i: number, j: number, w: number, h: number, fovY: number): [number, number, number] {
  const t = Math.tan(fovY / 2);
  const x = ((2 * (i + 0.5)) / w - 1) * t * (w / h);
  const y = (1 - (2 * (j + 0.5)) / h) * t;
  return [x, y, 1];
}
