import { describe, expect, it } from 'vitest';
import { KerrSchild } from '../metrics/kerrSchild';
import { ergosphereRadius, horizons, iscoRadius, photonOrbitRadius, zamoOmega } from '../metrics/kerr';
import { GeodesicIntegrator, integrateSampled, type GeodesicEvent } from './geodesic';
import { constantsOfMotion } from './conserved';
import {
  circularOrbitState,
  criticalAngularMomentum,
  eccentricOrbitState,
  infallingState,
  schwarzschildDeflection,
  schwarzschildPrecession,
} from './orbits';
import { photonFromLocal, sphericalTetrad, staticObserver, zamoObserver } from '../observers/observers';
import { cartesianFromSpheroidal, spheroidalFromCartesian } from '../metrics/coordinates';
import { Dopri5, rk4Step } from '../integrators/dopri5';

function radius(ks: KerrSchild, y: ArrayLike<number>) {
  return ks.geometry(y[0], y[1], y[2]).r;
}

describe('Integradores', () => {
  it('Dopri5: el error global escala con la tolerancia y la salida densa es de 4º orden', () => {
    // y'' = −y  →  y = cos t
    const f = (_t: number, y: Float64Array, dy: Float64Array) => {
      dy[0] = y[1];
      dy[1] = -y[0];
    };
    const errs: number[] = [];
    for (const tol of [1e-6, 1e-9, 1e-12]) {
      const s = new Dopri5(2, f, { rtol: tol, atol: tol });
      s.reset(0, [1, 0]);
      let maxDense = 0;
      const out = new Float64Array(2);
      while (s.t < 20) {
        s.step();
        for (let k = 1; k < 4; k++) {
          const t = s.tPrev + (k / 4) * (s.t - s.tPrev);
          s.dense(t, out);
          maxDense = Math.max(maxDense, Math.abs(out[0] - Math.cos(t)));
        }
      }
      errs.push(Math.abs(s.y[0] - Math.cos(s.t)));
      expect(maxDense).toBeLessThan(200 * tol);
    }
    expect(errs[1]).toBeLessThan(errs[0] / 50);
    expect(errs[2]).toBeLessThan(errs[1] / 50);
  });

  it('RK4: convergencia de 4º orden (razón ≈ 16 al dividir el paso)', () => {
    const f = (_t: number, y: Float64Array, dy: Float64Array) => {
      dy[0] = y[1];
      dy[1] = -y[0];
    };
    const run = (h: number) => {
      let y = Float64Array.of(1, 0);
      const out = new Float64Array(2);
      let t = 0;
      while (t < 10 - 1e-12) {
        rk4Step(f, t, y, h, out);
        y = Float64Array.from(out);
        t += h;
      }
      return Math.abs(y[0] - Math.cos(10));
    };
    const e1 = run(0.1);
    const e2 = run(0.05);
    expect(e1 / e2).toBeGreaterThan(14);
    expect(e1 / e2).toBeLessThan(18);
  });
});

describe('Caída radial y cruce del horizonte (Schwarzschild)', () => {
  it('reproduce la cicloide τ(r) y atraviesa r = 2M sin singularidad de coordenadas', () => {
    const ks = new KerrSchild(0);
    const r0 = 10;
    const u = staticObserver(ks, r0, 0, 0)!;
    const p = ks.lower(r0, 0, 0, u);
    const gi = new GeodesicIntegrator(ks, 'massive', { rtol: 1e-12, atol: 1e-14 });
    gi.reset(0, [r0, 0, 0], p);
    const events: GeodesicEvent[] = [];
    let maxH = 0;
    integrateSampled(
      gi,
      1e4,
      0.5,
      (t, y) => {
        const H = ks.hamiltonian([t, y[0], y[1], y[2], y[3], y[4], y[5], y[6]]);
        maxH = Math.max(maxH, Math.abs(H + 0.5));
      },
      (e) => events.push(e),
    );
    const cyc = (r: number) => {
      const eta = Math.acos((2 * r) / r0 - 1);
      return Math.sqrt((r0 * r0 * r0) / 8) * (eta + Math.sin(eta));
    };
    const hor = events.find((e) => e.kind === 'horizon')!;
    expect(hor).toBeTruthy();
    expect(Math.abs(hor.lambda - cyc(2)) / cyc(2)).toBeLessThan(1e-9);
    const end = events.find((e) => e.kind === 'singularity')!;
    expect(end).toBeTruthy();
    expect(Math.abs(end.lambda - cyc(end.r)) / cyc(end.r)).toBeLessThan(1e-8);
    // Tiempo propio del horizonte a la singularidad: finito (≈ π M para caída desde el reposo en r₀ → ∞ es 4M/3)
    expect(end.lambda - hor.lambda).toBeGreaterThan(0);
    expect(maxH).toBeLessThan(1e-9);
    // t de Kerr–Schild del cruce es finito
    expect(Number.isFinite(hor.t)).toBe(true);
  });

  it('la energía E = √(1 − 2M/r₀) se conserva a través del horizonte', () => {
    const ks = new KerrSchild(0);
    const r0 = 6;
    const u = staticObserver(ks, r0, 0, 0)!;
    const p = ks.lower(r0, 0, 0, u);
    expect(-p[0]).toBeCloseTo(Math.sqrt(1 - 2 / r0), 12);
    const gi = new GeodesicIntegrator(ks, 'massive');
    gi.reset(0, [r0, 0, 0], p);
    while (!gi.terminated) gi.step();
    expect(gi.y[3]).toBe(p[0]);
  });
});

describe('Kerr: cruce del horizonte y fin del dominio en el horizonte de Cauchy', () => {
  it('una partícula en caída cruza r₊ en t finito y se detiene en r₋', () => {
    const a = 0.9;
    const ks = new KerrSchild(a);
    const st = infallingState(ks, 12, 1.0, 0.3, 1, 1.5, 0.4);
    const gi = new GeodesicIntegrator(ks, 'massive', { rtol: 1e-11, atol: 1e-13 });
    gi.reset(0, st.pos, st.p);
    const c0 = constantsOfMotion(ks, st.pos, st.p);
    const evs: GeodesicEvent[] = [];
    while (!gi.terminated) evs.push(...gi.step());
    const hor = evs.find((e) => e.kind === 'horizon');
    expect(hor).toBeTruthy();
    expect(gi.terminated!.kind).toBe('innerHorizon');
    const c1 = constantsOfMotion(ks, [gi.y[0], gi.y[1], gi.y[2]], [gi.y[3], gi.y[4], gi.y[5], gi.y[6]]);
    expect(Math.abs(c1.E - c0.E)).toBeLessThan(1e-12);
    expect(Math.abs(c1.Lz - c0.Lz)).toBeLessThan(1e-8);
    expect(Math.abs(c1.Q - c0.Q) / Math.max(1, c0.Q)).toBeLessThan(1e-7);
    expect(Math.abs(c1.mu2 - 1)).toBeLessThan(1e-8);
  });
});

describe('Ergosfera', () => {
  it('la entrada en la ergosfera se localiza en r = r_E(θ) y ocurre antes del cruce del horizonte', () => {
    const a = 0.9;
    const ks = new KerrSchild(a);
    const st = infallingState(ks, 12, 1.2, 0.3, 1, 0.5, 0);
    const gi = new GeodesicIntegrator(ks, 'massive', { rtol: 1e-11, atol: 1e-13 });
    gi.reset(0, st.pos, st.p);
    const evs: GeodesicEvent[] = [];
    while (!gi.terminated) evs.push(...gi.step({ ergosphere: true }));
    const ie = evs.findIndex((e) => e.kind === 'ergosphere');
    const ih = evs.findIndex((e) => e.kind === 'horizon');
    expect(ie).toBeGreaterThanOrEqual(0);
    expect(ih).toBeGreaterThan(ie);
    const e = evs[ie];
    const th = Math.acos(e.state[2] / e.r);
    expect(Math.abs(e.r - ergosphereRadius(a, th))).toBeLessThan(1e-9);
    expect(evs[ih].t).toBeGreaterThan(e.t);
  });
});

describe('Órbitas', () => {
  it('órbita circular estable (r > ISCO) permanece circular durante 10 vueltas', () => {
    for (const a of [0, 0.5, 0.9]) {
      const ks = new KerrSchild(a);
      const r = iscoRadius(a, true) + 1;
      const st = circularOrbitState(ks, r, true);
      const gi = new GeodesicIntegrator(ks, 'massive', { rtol: 1e-12, atol: 1e-14 });
      gi.reset(0, st.pos, st.p);
      const T = 2 * Math.PI * (r ** 1.5 + a);
      let maxDev = 0;
      integrateSampled(gi, 10 * T, T / 50, (_t, y) => {
        maxDev = Math.max(maxDev, Math.abs(radius(ks, y) - r));
      });
      expect(maxDev).toBeLessThan(1e-7);
    }
  });

  it('órbita circular entre el fotón y el ISCO es inestable: una perturbación de 1e-8 crece', () => {
    const a = 0.5;
    const ks = new KerrSchild(a);
    const r = 0.5 * (photonOrbitRadius(a, true) + iscoRadius(a, true));
    const st = circularOrbitState(ks, r, true);
    st.p[1] *= 1 + 1e-8;
    const gi = new GeodesicIntegrator(ks, 'massive', { rtol: 1e-12, atol: 1e-14 });
    gi.reset(0, st.pos, st.p);
    let maxDev = 0;
    integrateSampled(gi, 3000, 1, (_t, y) => {
      maxDev = Math.max(maxDev, Math.abs(radius(ks, y) - r));
    });
    expect(maxDev).toBeGreaterThan(0.1);
  });

  it('precesión del periastro en Schwarzschild coincide con la fórmula exacta', () => {
    const ks = new KerrSchild(0);
    const p = 40;
    const e = 0.4;
    const rp = p / (1 + e);
    const ra = p / (1 - e);
    const st = eccentricOrbitState(ks, rp, ra, true);
    const gi = new GeodesicIntegrator(ks, 'massive', { rtol: 1e-12, atol: 1e-14 });
    gi.reset(0, st.pos, st.p);
    const apo: GeodesicEvent[] = [];
    while (apo.length < 3) {
      for (const ev of gi.step()) if (ev.kind === 'apoapsis') apo.push(ev);
    }
    const ang = (ev: GeodesicEvent) => Math.atan2(ev.state[1], ev.state[0]);
    let d = ang(apo[1]) - ang(apo[0]);
    while (d < 0) d += 2 * Math.PI;
    const exact = schwarzschildPrecession(p, e);
    expect(Math.abs(d - exact) / exact).toBeLessThan(1e-6);
  });

  it('constantes de Carter: E, L_z, Q se conservan en una órbita inclinada y excéntrica (a = 0,9)', () => {
    const ks = new KerrSchild(0.9);
    const pos = cartesianFromSpheroidal(10, 1.0, 0, 0.9);
    const zamo = zamoObserver(ks, pos[0], pos[1], pos[2])!;
    const tet = sphericalTetrad(ks, pos[0], pos[1], pos[2], zamo);
    const v = [0.05, 0.12, 0.3];
    const g = 1 / Math.sqrt(1 - (v[0] ** 2 + v[1] ** 2 + v[2] ** 2));
    const u = new Float64Array(4);
    for (let i = 0; i < 4; i++) u[i] = g * (tet.e[0][i] + v[0] * tet.e[1][i] + v[1] * tet.e[2][i] + v[2] * tet.e[3][i]);
    const p = ks.lower(pos[0], pos[1], pos[2], u);
    const c0 = constantsOfMotion(ks, pos, p);
    const gi = new GeodesicIntegrator(ks, 'massive', { rtol: 1e-12, atol: 1e-14 });
    gi.reset(0, pos, p);
    let worst = 0;
    integrateSampled(gi, 3000, 10, (_t, y) => {
      const c = constantsOfMotion(ks, [y[0], y[1], y[2]], [y[3], y[4], y[5], y[6]]);
      worst = Math.max(worst, Math.abs(c.Lz - c0.Lz) / Math.abs(c0.Lz), Math.abs(c.Q - c0.Q) / Math.abs(c0.Q), Math.abs(c.mu2 - 1));
    });
    expect(gi.terminated).toBeNull();
    expect(worst).toBeLessThan(1e-8);
  });

  it('arrastre de marcos: soltado en reposo respecto a un ZAMO, dφ/dt inicial = ω', () => {
    const a = 0.9;
    const ks = new KerrSchild(a);
    const r = 5;
    const th = 1.2;
    const pos = cartesianFromSpheroidal(r, th, 0.4, a);
    const u = zamoObserver(ks, pos[0], pos[1], pos[2])!;
    const sph = spheroidalFromCartesian(pos[0], pos[1], pos[2], a);
    // dφ̃/dt = (x u^y − y u^x)/(x² + y²) para un vector tangente a la órbita de ∂_φ
    const dphidt = (pos[0] * u[2] - pos[1] * u[1]) / (pos[0] ** 2 + pos[1] ** 2) / u[0];
    expect(dphidt).toBeCloseTo(zamoOmega(sph.r, sph.theta, a), 9);
    const p = ks.lower(pos[0], pos[1], pos[2], u);
    expect(Math.abs(pos[0] * p[2] - pos[1] * p[1])).toBeLessThan(1e-12); // L_z = 0
  });

  it('momento angular crítico de captura: L_c = 4M para E = 1 en Schwarzschild', () => {
    const Lc = criticalAngularMomentum(0, 1, true, 200);
    expect(Lc).toBeCloseTo(4, 3);
    // Kerr: prógrado se captura con menos L que retrógrado
    expect(criticalAngularMomentum(0.9, 1, true, 200)).toBeLessThan(criticalAngularMomentum(0.9, 1, false, 200));
  });
});

describe('Fotones', () => {
  it('órbita fotónica circular de Schwarzschild en r = 3M (inestable, sobrevive 2 vueltas)', () => {
    const ks = new KerrSchild(0);
    const pos = [3, 0, 0];
    const u = staticObserver(ks, 3, 0, 0)!;
    const tet = sphericalTetrad(ks, 3, 0, 0, u);
    const p = ks.lower(3, 0, 0, photonFromLocal(tet, [0, 0, 1]));
    const gi = new GeodesicIntegrator(ks, 'null', { rtol: 1e-13, atol: 1e-15 });
    gi.reset(0, pos, p);
    let maxDev = 0;
    const T = 2 * Math.PI * Math.sqrt(27); // periodo coordenado 2π·3√3 M
    integrateSampled(gi, 2 * T, 0.5, (_t, y) => {
      maxDev = Math.max(maxDev, Math.abs(radius(ks, y) - 3));
    });
    expect(maxDev).toBeLessThan(1e-4);
  });

  it('órbitas fotónicas ecuatoriales de Kerr (prógrada y retrógrada) en el radio de BPT', () => {
    const a = 0.7;
    const ks = new KerrSchild(a);
    for (const pro of [true, false]) {
      const r = photonOrbitRadius(a, pro);
      const pos = cartesianFromSpheroidal(r, Math.PI / 2, 0, a);
      const u = zamoObserver(ks, pos[0], pos[1], pos[2])!;
      const tet = sphericalTetrad(ks, pos[0], pos[1], pos[2], u);
      const p = ks.lower(pos[0], pos[1], pos[2], photonFromLocal(tet, [0, 0, pro ? 1 : -1]));
      const gi = new GeodesicIntegrator(ks, 'null', { rtol: 1e-13, atol: 1e-15 });
      gi.reset(0, pos, p);
      let maxDev = 0;
      integrateSampled(gi, 30, 0.2, (_t, y) => {
        maxDev = Math.max(maxDev, Math.abs(radius(ks, y) - r));
      });
      expect(maxDev).toBeLessThan(1e-5);
    }
  });

  it('deflexión débil: coincide con la integral exacta de Schwarzschild y tiende a 4M/b', () => {
    const ks = new KerrSchild(0);
    for (const b of [20, 100, 1000]) {
      const X = 1e6;
      const p = Float64Array.of(-1, 1, 0, 0);
      // Fotón entrante desde x = −X con dirección +x y parámetro de impacto b (corregimos p_t para que sea nulo)
      const pos = [-X, b, 0];
      const gi0 = ks.inverseMetric(pos[0], pos[1], pos[2]);
      // g^μν p_μ p_ν = 0 → resolver p_t
      const A = gi0[0];
      const B = 2 * (gi0[1] * p[1] + gi0[2] * p[2] + gi0[3] * p[3]);
      let C = 0;
      for (let i = 1; i < 4; i++) for (let j = 1; j < 4; j++) C += gi0[4 * i + j] * p[i] * p[j];
      p[0] = (-B - Math.sqrt(B * B - 4 * A * C)) / (2 * A);
      if (p[0] > 0) p[0] = (-B + Math.sqrt(B * B - 4 * A * C)) / (2 * A);
      const gi = new GeodesicIntegrator(ks, 'null', { rtol: 1e-13, atol: 1e-13, hMax: 1e5 });
      gi.rEscape = 2 * X;
      gi.reset(0, pos, p);
      const dir0 = new Float64Array(8);
      gi.rhs(0, gi.y, dir0);
      while (!gi.terminated && gi.y[0] < X) gi.step();
      const d = new Float64Array(8);
      gi.rhs(gi.t, gi.y, d);
      const ang = Math.atan2(d[1], d[0]) - Math.atan2(dir0[1], dir0[0]);
      const defl = -ang;
      const exact = schwarzschildDeflection(b);
      // El error de truncar en ±X es ~ b/X²·M
      expect(Math.abs(defl - exact)).toBeLessThan(5e-6 * exact + 4 * b / (X * X) + 1e-9);
      if (b >= 1000) expect(Math.abs(defl - 4 / b) / (4 / b)).toBeLessThan(0.01);
    }
  });

  it('retardo de Shapiro: tiempo de vuelo radial en KS = Δr + 4M ln((r₂−2M)/(r₁−2M))', () => {
    const ks = new KerrSchild(0);
    const r1 = 10;
    const r2 = 100;
    const u = staticObserver(ks, r1, 0, 0)!;
    const tet = sphericalTetrad(ks, r1, 0, 0, u);
    const p = ks.lower(r1, 0, 0, photonFromLocal(tet, [1, 0, 0]));
    const gi = new GeodesicIntegrator(ks, 'null', { rtol: 1e-13, atol: 1e-14 });
    gi.reset(0, [r1, 0, 0], p);
    let tCross = NaN;
    const buf = new Float64Array(8);
    while (Number.isNaN(tCross)) {
      gi.step();
      if (radius(ks, gi.y) >= r2) {
        // bisección sobre la salida densa
        let lo = gi.solver.tPrev;
        let hi = gi.t;
        for (let k = 0; k < 80; k++) {
          const mid = 0.5 * (lo + hi);
          if (radius(ks, gi.denseAt(mid, buf)) < r2) lo = mid;
          else hi = mid;
        }
        tCross = 0.5 * (lo + hi);
      }
    }
    const expected = r2 - r1 + 4 * Math.log((r2 - 2) / (r1 - 2));
    expect(Math.abs(tCross - expected)).toBeLessThan(1e-8);
  });

  it('horizonte: r₊ = 1 + √(1 − a²) separa fotones salientes que escapan y entrantes', () => {
    const a = 0.6;
    const ks = new KerrSchild(a);
    const { rPlus } = horizons(a);
    // Un fotón radial saliente justo fuera del horizonte escapa (lentamente); justo dentro, cae.
    for (const [r, escapes] of [
      [rPlus + 0.01, true],
      [rPlus - 0.01, false],
    ] as const) {
      const pos = cartesianFromSpheroidal(r, 0.3, 0, a);
      // Fuera: dirección radial del ZAMO (el cono de escape se cierra en torno a ella al acercarse a r₊).
      // Dentro no hay ZAMO: se usa el observador de lluvia; ninguna dirección escapa.
      const obs = zamoObserver(ks, pos[0], pos[1], pos[2]) ?? infallingState(ks, r, 0.3, 0, 1, 0, 0).u;
      const tet = sphericalTetrad(ks, pos[0], pos[1], pos[2], obs);
      const p = ks.lower(pos[0], pos[1], pos[2], photonFromLocal(tet, [1, 0, 0]));
      const gi = new GeodesicIntegrator(ks, 'null', { rtol: 1e-12, atol: 1e-14 });
      gi.rEscape = 50;
      gi.reset(0, pos, p);
      let n = 0;
      while (!gi.terminated && n < 200000) {
        gi.step();
        n++;
      }
      expect(gi.terminated?.kind === 'escape').toBe(escapes);
    }
  });
});
