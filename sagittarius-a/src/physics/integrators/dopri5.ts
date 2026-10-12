/**
 * Integradores de EDO.
 *
 * - `rk4Step`: Runge–Kutta clásico de 4º orden y paso fijo (pruebas de convergencia).
 * - `Dopri5`: Dormand–Prince 5(4) con control de error local, paso adaptativo, propiedad FSAL
 *   y salida densa de 4º orden (Dormand & Prince 1980; Hairer, Nørsett & Wanner, «Solving ODE I»,
 *   §II.4–II.6; coeficientes de salida densa de Shampine 1986 tal como aparecen en DOPRI5).
 *
 * El error local se mide con la norma RMS ponderada
 *   err = √( (1/n) Σ_i [ e_i / (atol + rtol · max(|y_i|, |ŷ_i|)) ]² )
 * y el paso se ajusta con h ← h · min(5, max(0.2, 0.9 · err^(−1/5))).
 */

export type RHS = (t: number, y: Float64Array, dy: Float64Array) => void;

export function rk4Step(f: RHS, t: number, y: Float64Array, h: number, out: Float64Array, work?: Float64Array[]): void {
  const n = y.length;
  const [k1, k2, k3, k4, tmp] = work ?? [0, 0, 0, 0, 0].map(() => new Float64Array(n));
  f(t, y, k1);
  for (let i = 0; i < n; i++) tmp[i] = y[i] + 0.5 * h * k1[i];
  f(t + 0.5 * h, tmp, k2);
  for (let i = 0; i < n; i++) tmp[i] = y[i] + 0.5 * h * k2[i];
  f(t + 0.5 * h, tmp, k3);
  for (let i = 0; i < n; i++) tmp[i] = y[i] + h * k3[i];
  f(t + h, tmp, k4);
  for (let i = 0; i < n; i++) out[i] = y[i] + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
}

// Tabla de Butcher de Dormand–Prince 5(4)
const C2 = 1 / 5, C3 = 3 / 10, C4 = 4 / 5, C5 = 8 / 9;
const A21 = 1 / 5;
const A31 = 3 / 40, A32 = 9 / 40;
const A41 = 44 / 45, A42 = -56 / 15, A43 = 32 / 9;
const A51 = 19372 / 6561, A52 = -25360 / 2187, A53 = 64448 / 6561, A54 = -212 / 729;
const A61 = 9017 / 3168, A62 = -355 / 33, A63 = 46732 / 5247, A64 = 49 / 176, A65 = -5103 / 18656;
const A71 = 35 / 384, A73 = 500 / 1113, A74 = 125 / 192, A75 = -2187 / 6784, A76 = 11 / 84;
// Coeficientes del estimador de error (b − b*)
const E1 = 71 / 57600, E3 = -71 / 16695, E4 = 71 / 1920, E5 = -17253 / 339200, E6 = 22 / 525, E7 = -1 / 40;
// Salida densa (Shampine)
const D1 = -12715105075 / 11282082432, D3 = 87487479700 / 32700410799, D4 = -10690763975 / 1880347072;
const D5 = 701980252875 / 199316789632, D6 = -1453857185 / 822651844, D7 = 69997945 / 29380423;

export interface Dopri5Options {
  rtol: number;
  atol: number;
  hInit?: number;
  hMax?: number;
  hMin?: number;
  /** Límite superior de |h| impuesto por el problema en cada paso (p. ej. escala espacial). */
  hLimit?: (t: number, y: Float64Array) => number;
}

export interface StepResult {
  /** Instante al inicio y al final del paso aceptado. */
  t0: number;
  t1: number;
  /** Estimación del error local normalizado (≤ 1 en un paso aceptado). */
  err: number;
  /** Pasos rechazados antes de aceptar este. */
  rejected: number;
}

/**
 * Integrador adaptativo con estado interno. Uso típico:
 *   const s = new Dopri5(n, f, opts); s.reset(t0, y0);
 *   while (...) { s.step(); s.dense(θ-time, out) ... }
 */
export class Dopri5 {
  readonly n: number;
  t = 0;
  h = 0;
  readonly y: Float64Array;
  /** Estado al comienzo del último paso aceptado (para salida densa). */
  readonly yPrev: Float64Array;
  tPrev = 0;
  nAccepted = 0;
  nRejected = 0;
  nEvals = 0;
  lastErr = 0;
  private readonly f: RHS;
  private readonly opts: Required<Omit<Dopri5Options, 'hLimit'>> & Pick<Dopri5Options, 'hLimit'>;
  private readonly k1: Float64Array;
  private readonly k2: Float64Array;
  private readonly k3: Float64Array;
  private readonly k4: Float64Array;
  private readonly k5: Float64Array;
  private readonly k6: Float64Array;
  private readonly k7: Float64Array;
  private readonly yTmp: Float64Array;
  private readonly yNew: Float64Array;
  // Coeficientes de la salida densa del último paso
  private readonly r1: Float64Array;
  private readonly r2: Float64Array;
  private readonly r3: Float64Array;
  private readonly r4: Float64Array;
  private readonly r5: Float64Array;
  private hPrev = 0;
  private fsalValid = false;

  constructor(n: number, f: RHS, opts: Dopri5Options) {
    this.n = n;
    this.f = (t, y, dy) => {
      this.nEvals++;
      f(t, y, dy);
    };
    this.opts = {
      rtol: opts.rtol,
      atol: opts.atol,
      hInit: opts.hInit ?? 0,
      hMax: opts.hMax ?? Infinity,
      hMin: opts.hMin ?? 1e-14,
      hLimit: opts.hLimit,
    };
    const mk = () => new Float64Array(n);
    this.y = mk();
    this.yPrev = mk();
    this.k1 = mk();
    this.k2 = mk();
    this.k3 = mk();
    this.k4 = mk();
    this.k5 = mk();
    this.k6 = mk();
    this.k7 = mk();
    this.yTmp = mk();
    this.yNew = mk();
    this.r1 = mk();
    this.r2 = mk();
    this.r3 = mk();
    this.r4 = mk();
    this.r5 = mk();
  }

  reset(t0: number, y0: ArrayLike<number>, h0?: number): void {
    this.t = t0;
    this.tPrev = t0;
    for (let i = 0; i < this.n; i++) {
      this.y[i] = y0[i];
      this.yPrev[i] = y0[i];
    }
    this.f(t0, this.y, this.k1);
    this.fsalValid = true;
    this.h = h0 ?? (this.opts.hInit > 0 ? this.opts.hInit : this.initialStep());
    this.nAccepted = 0;
    this.nRejected = 0;
  }

  /** Paso inicial (Hairer et al., algoritmo II.4.14 simplificado). */
  private initialStep(): number {
    const { rtol, atol } = this.opts;
    let d0 = 0;
    let d1 = 0;
    for (let i = 0; i < this.n; i++) {
      const sc = atol + rtol * Math.abs(this.y[i]);
      d0 += (this.y[i] / sc) ** 2;
      d1 += (this.k1[i] / sc) ** 2;
    }
    d0 = Math.sqrt(d0 / this.n);
    d1 = Math.sqrt(d1 / this.n);
    let h = d0 < 1e-5 || d1 < 1e-5 ? 1e-6 : 0.01 * (d0 / d1);
    h = Math.min(h, this.opts.hMax);
    if (this.opts.hLimit) h = Math.min(h, this.opts.hLimit(this.t, this.y));
    return h;
  }

  /** Avanza un paso aceptado. Devuelve el resultado del paso; lanza si el paso cae bajo hMin. */
  step(direction = 1): StepResult {
    const { n, f, k1, k2, k3, k4, k5, k6, k7, y, yTmp, yNew } = this;
    const { rtol, atol, hMax, hMin, hLimit } = this.opts;
    if (!this.fsalValid) {
      f(this.t, y, k1);
      this.fsalValid = true;
    }
    let rejected = 0;
    for (;;) {
      let h = Math.min(Math.abs(this.h), hMax);
      if (hLimit) h = Math.min(h, hLimit(this.t, y));
      if (!(h >= hMin)) {
        throw new Error(`Dopri5: paso por debajo de hMin (${h}) en t=${this.t}`);
      }
      const hs = direction * h;
      const t = this.t;
      for (let i = 0; i < n; i++) yTmp[i] = y[i] + hs * A21 * k1[i];
      f(t + C2 * hs, yTmp, k2);
      for (let i = 0; i < n; i++) yTmp[i] = y[i] + hs * (A31 * k1[i] + A32 * k2[i]);
      f(t + C3 * hs, yTmp, k3);
      for (let i = 0; i < n; i++) yTmp[i] = y[i] + hs * (A41 * k1[i] + A42 * k2[i] + A43 * k3[i]);
      f(t + C4 * hs, yTmp, k4);
      for (let i = 0; i < n; i++) yTmp[i] = y[i] + hs * (A51 * k1[i] + A52 * k2[i] + A53 * k3[i] + A54 * k4[i]);
      f(t + C5 * hs, yTmp, k5);
      for (let i = 0; i < n; i++)
        yTmp[i] = y[i] + hs * (A61 * k1[i] + A62 * k2[i] + A63 * k3[i] + A64 * k4[i] + A65 * k5[i]);
      f(t + hs, yTmp, k6);
      for (let i = 0; i < n; i++)
        yNew[i] = y[i] + hs * (A71 * k1[i] + A73 * k3[i] + A74 * k4[i] + A75 * k5[i] + A76 * k6[i]);
      f(t + hs, yNew, k7);
      let err = 0;
      let finite = true;
      for (let i = 0; i < n; i++) {
        const ei = hs * (E1 * k1[i] + E3 * k3[i] + E4 * k4[i] + E5 * k5[i] + E6 * k6[i] + E7 * k7[i]);
        const sc = atol + rtol * Math.max(Math.abs(y[i]), Math.abs(yNew[i]));
        err += (ei / sc) ** 2;
        if (!Number.isFinite(yNew[i])) finite = false;
      }
      err = Math.sqrt(err / n);
      if (!finite || !Number.isFinite(err)) err = 1e10;
      if (err <= 1) {
        // Aceptado: coeficientes de salida densa
        for (let i = 0; i < n; i++) {
          const ydiff = yNew[i] - y[i];
          const bspl = hs * k1[i] - ydiff;
          this.r1[i] = y[i];
          this.r2[i] = ydiff;
          this.r3[i] = bspl;
          this.r4[i] = ydiff - hs * k7[i] - bspl;
          this.r5[i] = hs * (D1 * k1[i] + D3 * k3[i] + D4 * k4[i] + D5 * k5[i] + D6 * k6[i] + D7 * k7[i]);
          this.yPrev[i] = y[i];
          y[i] = yNew[i];
          k1[i] = k7[i];
        }
        this.tPrev = t;
        this.t = t + hs;
        this.hPrev = hs;
        this.lastErr = err;
        this.nAccepted++;
        const fac = Math.min(5, Math.max(0.2, 0.9 * Math.pow(Math.max(err, 1e-10), -0.2)));
        this.h = h * fac;
        return { t0: t, t1: this.t, err, rejected };
      }
      rejected++;
      this.nRejected++;
      const fac = Math.max(0.1, 0.9 * Math.pow(err, -0.2));
      this.h = h * fac;
    }
  }

  /** Salida densa (4º orden) en t ∈ [tPrev, t] del último paso aceptado. */
  dense(t: number, out: Float64Array): Float64Array {
    const th = this.hPrev === 0 ? 0 : (t - this.tPrev) / this.hPrev;
    const th1 = 1 - th;
    for (let i = 0; i < this.n; i++) {
      out[i] = this.r1[i] + th * (this.r2[i] + th1 * (this.r3[i] + th * (this.r4[i] + th1 * this.r5[i])));
    }
    return out;
  }

  /** Invalida la derivada en caché (tras modificar `y` externamente). */
  invalidate(): void {
    this.fsalValid = false;
  }
}

/**
 * Localiza la raíz de g(θ) en [0, 1] sabiendo que g(0) y g(1) tienen signo distinto
 * (Illinois / regula falsi modificada). Devuelve θ.
 */
export function findRoot(g: (th: number) => number, g0: number, g1: number, tol = 1e-13, maxIt = 80): number {
  let a = 0;
  let b = 1;
  let fa = g0;
  let fb = g1;
  let side = 0;
  let c = 0.5;
  for (let it = 0; it < maxIt; it++) {
    c = (a * fb - b * fa) / (fb - fa);
    if (!Number.isFinite(c) || c <= a || c >= b) c = 0.5 * (a + b);
    const fc = g(c);
    if (Math.abs(fc) === 0 || b - a < tol) return c;
    if (fc * fb > 0) {
      b = c;
      fb = fc;
      if (side === -1) fa *= 0.5;
      side = -1;
    } else {
      a = c;
      fa = fc;
      if (side === 1) fb *= 0.5;
      side = 1;
    }
  }
  return c;
}
