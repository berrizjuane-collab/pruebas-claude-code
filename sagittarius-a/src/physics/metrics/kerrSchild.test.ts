import { describe, expect, it } from 'vitest';
import { KerrSchild, ksRadius } from './kerrSchild';
import { blMetric, horizons, ksMinusBL } from './kerr';
import { cartesianFromSpheroidal, jacobianCartesianSpheroidal, ksSpheroidalInverse, spheroidalFromCartesian } from './coordinates';
import { mulberry32 } from '../random';

const SPINS = [0, 0.3, 0.5, 0.9, 0.998];

function randomPoint(rng: () => number, rMin: number, rMax: number, a: number): [number, number, number] {
  const r = rMin + (rMax - rMin) * rng();
  const th = 0.05 + (Math.PI - 0.1) * rng();
  const ph = 2 * Math.PI * rng();
  return cartesianFromSpheroidal(r, th, ph, a);
}

describe('Kerr–Schild: estructura algebraica', () => {
  it('g_μα g^αν = δ y l es nulo, dentro y fuera del horizonte', () => {
    const rng = mulberry32(1);
    for (const a of SPINS) {
      const ks = new KerrSchild(a);
      for (let k = 0; k < 50; k++) {
        const [x, y, z] = randomPoint(rng, 0.3, 30, a);
        const g = ks.metric(x, y, z);
        const gi = ks.inverseMetric(x, y, z);
        for (let m = 0; m < 4; m++)
          for (let n = 0; n < 4; n++) {
            let s = 0;
            for (let q = 0; q < 4; q++) s += g[4 * m + q] * gi[4 * q + n];
            expect(Math.abs(s - (m === n ? 1 : 0))).toBeLessThan(1e-11);
          }
        const geo = ks.geometry(x, y, z);
        const l2 = geo.l[0] ** 2 + geo.l[1] ** 2 + geo.l[2] ** 2;
        expect(Math.abs(l2 - 1)).toBeLessThan(1e-12);
      }
    }
  });

  it('r(x, y, z) invierte la parametrización esferoidal', () => {
    const rng = mulberry32(2);
    for (const a of SPINS) {
      for (let k = 0; k < 200; k++) {
        const r = 0.05 + 40 * rng();
        const th = Math.PI * rng();
        const ph = 2 * Math.PI * rng();
        const [x, y, z] = cartesianFromSpheroidal(r, th, ph, a);
        expect(Math.abs(ksRadius(x, y, z, a) - r) / r).toBeLessThan(1e-12);
        const s = spheroidalFromCartesian(x, y, z, a);
        expect(Math.abs(s.theta - th)).toBeLessThan(1e-9);
      }
    }
  });

  it('las derivadas analíticas de r, f y l coinciden con diferencias finitas', () => {
    const rng = mulberry32(3);
    const h = 1e-6;
    for (const a of SPINS) {
      const ks = new KerrSchild(a);
      for (let k = 0; k < 40; k++) {
        const p = randomPoint(rng, 0.5, 20, a);
        const geo = ks.geometry(p[0], p[1], p[2]);
        const dr = Array.from(geo.dr);
        const df = Array.from(geo.df);
        const dl = Array.from(geo.dl);
        for (let i = 0; i < 3; i++) {
          const pp = [...p];
          const pm = [...p];
          pp[i] += h;
          pm[i] -= h;
          const gp = ks.geometry(pp[0], pp[1], pp[2]);
          const rp = gp.r;
          const fp = gp.f;
          const lp = Array.from(gp.l);
          const gm = ks.geometry(pm[0], pm[1], pm[2]);
          const fdR = (rp - gm.r) / (2 * h);
          const fdF = (fp - gm.f) / (2 * h);
          expect(Math.abs(fdR - dr[i])).toBeLessThan(1e-7 * (1 + Math.abs(dr[i])));
          expect(Math.abs(fdF - df[i])).toBeLessThan(1e-6 * (1 + Math.abs(df[i])));
          for (let j = 0; j < 3; j++) {
            const fdL = (lp[j] - gm.l[j]) / (2 * h);
            expect(Math.abs(fdL - dl[3 * i + j])).toBeLessThan(1e-6 * (1 + Math.abs(dl[3 * i + j])));
          }
        }
      }
    }
  });

  it('las ecuaciones de Hamilton coinciden con ∂H/∂p y −∂H/∂x numéricos', () => {
    const rng = mulberry32(4);
    const h = 1e-6;
    for (const a of SPINS) {
      const ks = new KerrSchild(a);
      for (let k = 0; k < 30; k++) {
        const p = randomPoint(rng, 0.6, 15, a);
        const y = [0, p[0], p[1], p[2], -1 + 0.3 * rng(), rng() - 0.5, rng() - 0.5, rng() - 0.5];
        const dy = new Float64Array(8);
        ks.hamiltonianRHS(y, dy);
        for (let m = 0; m < 4; m++) {
          const yp = [...y];
          const ym = [...y];
          yp[4 + m] += h;
          ym[4 + m] -= h;
          const dHdp = (ks.hamiltonian(yp) - ks.hamiltonian(ym)) / (2 * h);
          expect(Math.abs(dHdp - dy[m])).toBeLessThan(1e-7 * (1 + Math.abs(dy[m])));
          if (m > 0) {
            const xp = [...y];
            const xm = [...y];
            xp[m] += h;
            xm[m] -= h;
            const dHdx = (ks.hamiltonian(xp) - ks.hamiltonian(xm)) / (2 * h);
            expect(Math.abs(-dHdx - dy[4 + m])).toBeLessThan(1e-6 * (1 + Math.abs(dy[4 + m])));
          }
        }
      }
    }
  });
});

describe('Kerr–Schild ↔ Boyer–Lindquist', () => {
  it('la métrica KS transformada a BL reproduce la forma de Boyer–Lindquist (fuera del horizonte)', () => {
    const rng = mulberry32(5);
    for (const a of SPINS) {
      const ks = new KerrSchild(a);
      const { rPlus } = horizons(a);
      for (let k = 0; k < 40; k++) {
        const r = rPlus + 0.05 + 25 * rng();
        const th = 0.1 + (Math.PI - 0.2) * rng();
        const ph = 2 * Math.PI * rng();
        const [x, y, z] = cartesianFromSpheroidal(r, th, ph, a);
        const g = ks.metric(x, y, z);
        const J = jacobianCartesianSpheroidal(r, th, ph, a);
        const D = r * r - 2 * r + a * a;
        // ∂x_KS/∂x_BL: columnas (t, r, θ, φ) en BL → (t, x, y, z) en KS
        const T: number[][] = [
          [1, (2 * r) / D, 0, 0],
          [0, J[0] + (J[2] * a) / D, J[1], J[2]],
          [0, J[3] + (J[5] * a) / D, J[4], J[5]],
          [0, J[6] + (J[8] * a) / D, J[7], J[8]],
        ];
        const gBL = (m: number, n: number) => {
          let s = 0;
          for (let p = 0; p < 4; p++) for (let q = 0; q < 4; q++) s += T[p][m] * T[q][n] * g[4 * p + q];
          return s;
        };
        const ref = blMetric(r, th, a);
        const tol = (v: number) => 1e-9 * (1 + Math.abs(v));
        expect(Math.abs(gBL(0, 0) - ref.tt)).toBeLessThan(tol(ref.tt));
        expect(Math.abs(gBL(0, 3) - ref.tphi)).toBeLessThan(tol(ref.tphi));
        expect(Math.abs(gBL(3, 3) - ref.phiphi)).toBeLessThan(tol(ref.phiphi));
        expect(Math.abs(gBL(1, 1) - ref.rr)).toBeLessThan(tol(ref.rr));
        expect(Math.abs(gBL(2, 2) - ref.thth)).toBeLessThan(tol(ref.thth));
        expect(Math.abs(gBL(0, 1))).toBeLessThan(1e-9);
        expect(Math.abs(gBL(1, 3))).toBeLessThan(1e-9);
        expect(Math.abs(gBL(1, 2))).toBeLessThan(1e-9);
      }
    }
  });

  it('la inversa en KS esferoidales es regular en el horizonte y consistente con la cartesiana', () => {
    for (const a of SPINS) {
      const { rPlus } = horizons(a);
      const inv = ksSpheroidalInverse(rPlus, 1.1, a);
      for (const v of inv) expect(Number.isFinite(v)).toBe(true);
      expect(inv[2]).toBeCloseTo(0, 12); // g^rr = Δ/Σ = 0 en r₊
    }
  });

  it('para a = 0 se reduce a Eddington–Finkelstein entrante (t = v − r)', () => {
    const ks = new KerrSchild(0);
    for (const r of [0.5, 1.5, 2, 3, 10]) {
      const g = ks.metric(r, 0, 0);
      expect(g[0]).toBeCloseTo(-(1 - 2 / r), 12);
      expect(g[1]).toBeCloseTo(2 / r, 12);
      expect(g[5]).toBeCloseTo(1 + 2 / r, 12);
    }
  });

  it('ksMinusBL integra h\' = 2r/Δ y k\' = a/Δ', () => {
    for (const a of [0, 0.5, 0.9]) {
      const h = 1e-5;
      for (const r of [3, 5, 12]) {
        const D = r * r - 2 * r + a * a;
        const d1 = (ksMinusBL(r + h, a).h - ksMinusBL(r - h, a).h) / (2 * h);
        const d2 = (ksMinusBL(r + h, a).k - ksMinusBL(r - h, a).k) / (2 * h);
        expect(d1).toBeCloseTo((2 * r) / D, 7);
        expect(d2).toBeCloseTo(a / D, 7);
      }
    }
  });
});

describe('Símbolos de Christoffel', () => {
  it('coinciden con las derivadas numéricas de la métrica', () => {
    const rng = mulberry32(6);
    const h = 1e-6;
    for (const a of [0, 0.7]) {
      const ks = new KerrSchild(a);
      for (let k = 0; k < 10; k++) {
        const p = randomPoint(rng, 1, 12, a);
        const G = ks.christoffel(p[0], p[1], p[2]);
        const gi = ks.inverseMetric(p[0], p[1], p[2]);
        const dg: Float64Array[] = [new Float64Array(16)];
        for (let i = 0; i < 3; i++) {
          const pp = [...p];
          const pm = [...p];
          pp[i] += h;
          pm[i] -= h;
          const gp = ks.metric(pp[0], pp[1], pp[2]);
          const gm = ks.metric(pm[0], pm[1], pm[2]);
          const d = new Float64Array(16);
          for (let q = 0; q < 16; q++) d[q] = (gp[q] - gm[q]) / (2 * h);
          dg.push(d);
        }
        for (let m = 0; m < 4; m++)
          for (let al = 0; al < 4; al++)
            for (let be = 0; be < 4; be++) {
              let s = 0;
              for (let n = 0; n < 4; n++)
                s += 0.5 * gi[4 * m + n] * (dg[al][4 * n + be] + dg[be][4 * n + al] - dg[n][4 * al + be]);
              expect(Math.abs(s - G[16 * m + 4 * al + be])).toBeLessThan(1e-6 * (1 + Math.abs(s)));
            }
      }
    }
  });
});
