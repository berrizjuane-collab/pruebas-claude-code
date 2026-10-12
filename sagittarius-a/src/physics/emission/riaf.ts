/**
 * Flujo de acreción caliente, geométricamente grueso y ópticamente delgado (RIAF) PARAMETRIZADO.
 *
 * NO es una simulación GRMHD: es un modelo semianalítico inspirado en Broderick & Loeb 2006
 * (ApJ 636, L109) y Broderick et al. 2011/2016, cuyos perfiles siguen las leyes de potencia
 * promediadas verticalmente de Yuan, Quataert & Narayan 2003:
 *   n_e = n₀ (r/r_g)^(−1,1) exp(−z²/(2 h² ρ²))       (z = r cosθ, ρ = r sinθ)
 *   T_e = T₀ (r/r_g)^(−0,84)
 *   B²/8π = β⁻¹ n_e m_p c² / (6 r)                     (equipartición con presión ~virial)
 * Cinemática: rotación «en capas esféricas» Ω = κ Ω_K(r) fuera del ISCO y caída con (E, L) del
 * ISCO dentro (raíz regular en Kerr–Schild, válida también dentro del horizonte), con una
 * transición suave de anchura δ en torno al ISCO. Campo magnético toroidal para el ángulo de
 * emisión. Variabilidad: punto caliente kepleriano (cf. GRAVITY 2018) y fluctuaciones de densidad
 * log-normales arrastradas por la rotación diferencial (estructura estocástica, semilla fija).
 */
import { C_CGS, MP_CGS } from '../constants';
import { KerrSchild } from '../metrics/kerrSchild';
import { circularOrbitConstants, iscoRadius, keplerOmega, photonOrbitRadius, zamoOmega } from '../metrics/kerr';
import { regularInfallUr, spheroidalFromCartesian, spheroidalGradients } from '../metrics/coordinates';

export interface RiafParams {
  /** Densidad electrónica de normalización n₀ [cm⁻³] (en r = r_g). */
  ne0: number;
  /** Temperatura electrónica de normalización T₀ [K]. */
  te0: number;
  /** Parámetro de plasma β = P_gas/P_mag. */
  beta: number;
  /** Espesor: altura gaussiana relativa al radio cilíndrico. */
  h: number;
  /** Factor sub-kepleriano κ ≤ 1. */
  kappa: number;
  /** Radio exterior de la región emisora [M]. */
  rOut: number;
  /** Punto caliente: amplitud relativa de densidad (0 = sin él). */
  hotspotAmp: number;
  hotspotR: number;
  hotspotSize: number;
  hotspotPhi0: number;
  /** Amplitud σ de las fluctuaciones log-normales de densidad (0 = flujo suave). */
  turbulence: number;
  seed: number;
}

export const DEFAULT_RIAF: RiafParams = {
  ne0: 1.56e7,
  te0: 3.0e11,
  beta: 10,
  h: 1,
  kappa: 1,
  rOut: 50,
  hotspotAmp: 0,
  hotspotR: 8,
  hotspotSize: 1.2,
  hotspotPhi0: 0,
  turbulence: 0.35,
  seed: 7,
};

export interface PlasmaState {
  ne: number;
  te: number;
  B: number;
  /** 4-velocidad contravariante del fluido (KS cartesianas). */
  u: Float64Array;
  /** u_φ covariante del fluido (= g(ξ_φ, u)). */
  uPhi: number;
  /** g(ξ_φ, ξ_φ). */
  gPhiPhi: number;
}

/** Periodo de renovación del patrón turbulento [M]. */
export const TURB_PERIOD = 150;

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Ruido de valor 3D determinista (idéntico en GLSL: rendering/shaders/noise). */
export function hash3(ix: number, iy: number, iz: number, seed: number): number {
  let h = (Math.imul(ix | 0, 0x8da6b343) ^ Math.imul(iy | 0, 0xd8163841) ^ Math.imul(iz | 0, 0xcb1ab31f) ^ Math.imul(seed | 0, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  return h / 4294967296;
}

export function valueNoise3(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const sz = fz * fz * (3 - 2 * fz);
  const v = (i: number, j: number, k: number) => hash3(ix + i, iy + j, iz + k, seed);
  const x00 = v(0, 0, 0) + (v(1, 0, 0) - v(0, 0, 0)) * sx;
  const x10 = v(0, 1, 0) + (v(1, 1, 0) - v(0, 1, 0)) * sx;
  const x01 = v(0, 0, 1) + (v(1, 0, 1) - v(0, 0, 1)) * sx;
  const x11 = v(0, 1, 1) + (v(1, 1, 1) - v(0, 1, 1)) * sx;
  const y0 = x00 + (x10 - x00) * sy;
  const y1 = x01 + (x11 - x01) * sy;
  return y0 + (y1 - y0) * sz; // [0, 1)
}

export class RiafModel {
  readonly ks: KerrSchild;
  readonly p: RiafParams;
  readonly rIsco: number;
  readonly delta: number;
  readonly Eisco: number;
  readonly Lisco: number;
  readonly omegaHs: number;

  constructor(ks: KerrSchild, p: RiafParams) {
    this.ks = ks;
    this.p = p;
    const a = ks.a;
    this.rIsco = iscoRadius(a, true);
    this.delta = Math.min(0.3, 0.5 * (this.rIsco - photonOrbitRadius(a, true)));
    const c = circularOrbitConstants(this.rIsco, a, true);
    this.Eisco = c.E;
    this.Lisco = c.L;
    this.omegaHs = keplerOmega(p.hotspotR, a, true);
  }

  /**
   * Factor de densidad de las fluctuaciones turbulentas (media ≈ 1) en (r, θ, φ̃, t).
   * Ruido de valor 3D sobre la esfera de radio S(r) = 2,5 ln r + 2 (estructuras que crecen con r),
   * en coordenadas co-rotantes φ_c = φ̃ − Ω(r)·t′. Dos fases de periodo T_c que se funden evitan
   * que la cizalla enrolle el patrón indefinidamente.
   */
  turbulenceFactor(r: number, theta: number, phi: number, t: number): number {
    const s = this.p.turbulence;
    if (s <= 0) return 1;
    const om = this.p.kappa * keplerOmega(Math.max(r, this.rIsco), this.ks.a, true);
    const Tc = TURB_PERIOD;
    const S = 2.5 * Math.log(Math.max(r, 0.5)) + 2;
    const st = Math.sin(theta);
    const ct = Math.cos(theta);
    let acc = 0;
    for (let k = 0; k < 2; k++) {
      const tk = t + (k * Tc) / 2;
      const cyc = Math.floor(tk / Tc);
      const ph = tk - cyc * Tc;
      const w = 1 - Math.abs((2 * ph) / Tc - 1);
      const pc = phi - om * ph;
      const px = S * st * Math.cos(pc) + 31.7 * cyc + 57 * k;
      const py = S * st * Math.sin(pc);
      const pz = S * ct;
      const n = valueNoise3(px, py, pz, this.p.seed) + 0.5 * valueNoise3(2 * px + 19.1, 2 * py, 2 * pz, this.p.seed + 1);
      acc += w * (n / 1.5 - 0.5) * 3.46;
    }
    return Math.exp(s * acc - 0.5 * s * s);
  }

  /** Estado del plasma en (x, y, z) al tiempo coordenado t; null fuera de la región emisora. */
  state(x: number, y: number, z: number, t: number): PlasmaState | null {
    const ks = this.ks;
    const a = ks.a;
    const { r, theta, phi } = spheroidalFromCartesian(x, y, z, a);
    const p = this.p;
    if (r > p.rOut * 1.25 || r < 0.05) return null;
    const st = Math.sin(theta);
    const ct = Math.cos(theta);
    const cot2 = (ct * ct) / Math.max(st * st, 1e-12);
    const vert = Math.exp(-cot2 / (2 * p.h * p.h));
    if (vert < 1e-8) return null;
    const taper = 1 - smoothstep(p.rOut, p.rOut * 1.25, r);
    let ne = p.ne0 * Math.pow(r, -1.1) * vert * taper;
    if (p.hotspotAmp > 0) {
      const ph = p.hotspotPhi0 + this.omegaHs * t;
      const hx = p.hotspotR * Math.cos(ph) - a * Math.sin(ph);
      const hy = p.hotspotR * Math.sin(ph) + a * Math.cos(ph);
      const d2 = (x - hx) ** 2 + (y - hy) ** 2 + z * z;
      ne += p.hotspotAmp * p.ne0 * Math.pow(p.hotspotR, -1.1) * Math.exp(-d2 / (2 * p.hotspotSize ** 2));
    }
    ne *= this.turbulenceFactor(r, theta, phi, t);
    if (ne <= 0) return null;
    const te = p.te0 * Math.pow(r, -0.84);
    const B = Math.sqrt((8 * Math.PI * ne * MP_CGS * C_CGS * C_CGS) / (6 * r * p.beta));
    const u = this.velocity(x, y, z, r, theta);
    const ul = ks.lower(x, y, z, u);
    const uPhi = x * ul[2] - y * ul[1];
    const xi = Float64Array.of(0, -y, x, 0);
    const gPhiPhi = ks.dot(x, y, z, xi, xi);
    return { ne, te, B, u, uPhi, gPhiPhi };
  }

  /** 4-velocidad del fluido (contravariante, KS cartesianas). */
  velocity(x: number, y: number, z: number, r: number, theta: number): Float64Array {
    const ks = this.ks;
    const a = ks.a;
    const s = smoothstep(this.rIsco + this.delta, this.rIsco - this.delta, r);
    let uOut: Float64Array | null = null;
    let uIn: Float64Array | null = null;
    if (s < 1) {
      const rr = Math.max(r, this.rIsco - this.delta);
      let om = this.p.kappa * keplerOmega(rr, a, true);
      let v = Float64Array.of(1, -om * y, om * x, 0);
      let n2 = ks.dot(x, y, z, v, v);
      if (!(n2 < -1e-9)) {
        om = zamoOmega(r, theta, a);
        v = Float64Array.of(1, -om * y, om * x, 0);
        n2 = ks.dot(x, y, z, v, v);
      }
      if (n2 < 0) {
        const k = 1 / Math.sqrt(-n2);
        for (let i = 0; i < 4; i++) v[i] *= k;
        uOut = v;
      }
    }
    if (s > 0 || !uOut) {
      const st = Math.sin(theta);
      let ut = -this.Eisco;
      let L = this.p.kappa * this.Lisco * st * st;
      let ur = regularInfallUr(r, theta, a, ut, 0, L, 1);
      if (!Number.isFinite(ur)) {
        // Sin solución con (E, L) del ISCO en este punto: caída radial de «lluvia» (E = 1, L = 0).
        ut = -1;
        L = 0;
        ur = regularInfallUr(r, theta, a, -1, 0, 0, 1);
      }
      const G = spheroidalGradients(x, y, z, a);
      const w = Float64Array.of(ut, ur * G[0] + L * G[6], ur * G[1] + L * G[7], ur * G[2] + L * G[8]);
      uIn = ks.raise(x, y, z, w);
    }
    if (!uOut) return uIn!;
    if (!uIn || s <= 0) return uOut;
    const v = new Float64Array(4);
    for (let i = 0; i < 4; i++) v[i] = (1 - s) * uOut[i] + s * uIn[i];
    const n2 = ks.dot(x, y, z, v, v);
    const k = 1 / Math.sqrt(-n2);
    for (let i = 0; i < 4; i++) v[i] *= k;
    return v;
  }
}
