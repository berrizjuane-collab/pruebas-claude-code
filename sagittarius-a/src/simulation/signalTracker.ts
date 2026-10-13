/**
 * Problema emisor–observador: ¿qué recibe la cámara del objeto en cada instante de RECEPCIÓN?
 *
 * Para cada t_r se busca la geodésica nula pasada que sale de la cámara y corta la línea de
 * universo del emisor (imagen primaria). Disparo con dos ángulos de la dirección en el marco de la
 * cámara y Newton con jacobiano por diferencias; el rayo se integra con Dormand–Prince
 * (tolerancia 1e-11) y la línea de universo del emisor se interpola con Hermite cúbico usando su
 * 4-velocidad. Resultado: g = ν_obs/ν_emit = 1/(q·u_emit), el tiempo propio del emisor en la
 * emisión y el tiempo coordenado de emisión. Cuando el emisor cruza el horizonte, las soluciones
 * se acercan exponencialmente a r₊ (g → 0): la señal se enrojece, se ralentiza y se apaga.
 */
import { Dopri5 } from '../physics/integrators/dopri5';
import { KerrSchild } from '../physics/metrics/kerrSchild';
import { horizons } from '../physics/metrics/kerr';

export interface TrackRequest {
  a: number;
  /** Filas [t, x, y, z, uᵗ, uˣ, uʸ, uᶻ, τ] del emisor a Δt uniforme. */
  emitter: Float64Array;
  stride: number;
  camera: { pos: [number, number, number]; e: number[][] };
  tFrom: number;
  tTo: number;
  n: number;
}

export interface TrackResult {
  tRec: number[];
  g: number[];
  tauEmit: number[];
  tEmit: number[];
  rEmit: number[];
  found: boolean[];
  dirCam: Array<[number, number, number]>;
}

class Emitter {
  constructor(
    private readonly d: Float64Array,
    private readonly stride: number,
  ) {}
  get n() {
    return Math.floor(this.d.length / this.stride);
  }
  get t0() {
    return this.d[0];
  }
  get dt() {
    return this.d[this.stride] - this.d[0];
  }
  get tEnd() {
    return this.d[(this.n - 1) * this.stride];
  }
  /** Posición, 4-velocidad y τ en t (Hermite cúbico con dx/dt = uⁱ/uᵗ). */
  at(t: number): { x: [number, number, number]; u: [number, number, number, number]; tau: number } | null {
    const s = this.stride;
    const f = (t - this.t0) / this.dt;
    const k = Math.floor(f);
    if (k < 0 || k + 1 >= this.n) return null;
    const h = this.dt;
    const th = f - k;
    const A = k * s;
    const B = (k + 1) * s;
    const d = this.d;
    const h00 = 2 * th ** 3 - 3 * th ** 2 + 1;
    const h10 = th ** 3 - 2 * th ** 2 + th;
    const h01 = -2 * th ** 3 + 3 * th ** 2;
    const h11 = th ** 3 - th ** 2;
    const x: [number, number, number] = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      const vA = d[A + 5 + i] / d[A + 4];
      const vB = d[B + 5 + i] / d[B + 4];
      x[i] = h00 * d[A + 1 + i] + h10 * h * vA + h01 * d[B + 1 + i] + h11 * h * vB;
    }
    // 4-velocidad: Catmull–Rom (O(Δt⁴)) cuando hay vecinos, lineal en los extremos
    const u: [number, number, number, number] = [0, 0, 0, 0];
    const hasN = k - 1 >= 0 && k + 2 < this.n;
    for (let i = 0; i < 4; i++) {
      const p1 = d[A + 4 + i];
      const p2 = d[B + 4 + i];
      if (!hasN) {
        u[i] = p1 * (1 - th) + p2 * th;
        continue;
      }
      const p0 = d[(k - 1) * s + 4 + i];
      const p3 = d[(k + 2) * s + 4 + i];
      u[i] = 0.5 * (2 * p1 + (-p0 + p2) * th + (2 * p0 - 5 * p1 + 4 * p2 - p3) * th * th + (-p0 + 3 * p1 - 3 * p2 + p3) * th * th * th);
    }
    const tau = d[A + 8] * (1 - th) + d[B + 8] * th;
    return { x, u, tau };
  }
}

interface RayHit {
  miss: [number, number, number];
  dist: number;
  g: number;
  tEmit: number;
  tauEmit: number;
  rEmit: number;
  ok: boolean;
}

export function computeSignalTrack(req: TrackRequest): TrackResult {
  const ks = new KerrSchild(req.a);
  const { rPlus } = horizons(req.a);
  const em = new Emitter(req.emitter, req.stride);
  const cam = req.camera;
  const res: TrackResult = { tRec: [], g: [], tauEmit: [], tEmit: [], rEmit: [], found: [], dirCam: [] };
  const solver = new Dopri5(8, (_l, y, dy) => ks.hamiltonianRHS(y, dy), {
    rtol: 1e-11,
    atol: 1e-13,
    hLimit: (_l, y) => {
      const g = ks.geometry(y[1], y[2], y[3]);
      const dd = new Float64Array(8);
      ks.hamiltonianRHS(y, dd);
      const v = Math.hypot(dd[1], dd[2], dd[3]) + 1e-12;
      return (0.08 * Math.max(Math.min(g.r, 4 * Math.abs(g.r - rPlus)), 1e-9)) / v;
    },
  });
  const buf = new Float64Array(8);

  const shoot = (tr: number, n: [number, number, number]): RayHit => {
    const e = cam.e;
    const nn = Math.hypot(n[0], n[1], n[2]);
    const q = [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) q[i] = -e[0][i] + (n[0] * e[1][i] + n[1] * e[2][i] + n[2] * e[3][i]) / nn;
    const ql = ks.lower(cam.pos[0], cam.pos[1], cam.pos[2], q);
    const y0 = Float64Array.of(tr, cam.pos[0], cam.pos[1], cam.pos[2], ql[0], ql[1], ql[2], ql[3]);
    solver.reset(0, y0, 1e-3);
    let best: RayHit = { miss: [0, 0, 0], dist: Infinity, g: 0, tEmit: 0, tauEmit: 0, rEmit: 0, ok: false };
    let prevD = Infinity;
    let rising = 0;
    const evalAt = (y: Float64Array): { d: number; m: [number, number, number]; g: number; tau: number; r: number } | null => {
      const st = em.at(y[0]);
      if (!st) return null;
      const m: [number, number, number] = [y[1] - st.x[0], y[2] - st.x[1], y[3] - st.x[2]];
      const qu = y[4] * st.u[0] + y[5] * st.u[1] + y[6] * st.u[2] + y[7] * st.u[3];
      return { d: Math.hypot(m[0], m[1], m[2]), m, g: qu > 0 ? 1 / qu : 0, tau: st.tau, r: ks.geometry(st.x[0], st.x[1], st.x[2]).r };
    };
    for (let it = 0; it < 30000; it++) {
      try {
        solver.step();
      } catch {
        break;
      }
      const y = solver.y;
      if (y[0] < em.t0) break;
      const ev = evalAt(y);
      const r = ks.geometry(y[1], y[2], y[3]).r;
      if (ev) {
        if (ev.d < prevD) rising = 0;
        else rising++;
        // Mínimo dentro del paso: muestreo interior con la salida densa y refinamiento áureo
        let bestIn = Infinity;
        let bestS = 1;
        for (let k = 1; k <= 6; k++) {
          const sl = solver.tPrev + ((solver.t - solver.tPrev) * k) / 6;
          const e1 = evalAt(Float64Array.from(solver.dense(sl, buf)));
          if (e1 && e1.d < bestIn) {
            bestIn = e1.d;
            bestS = k;
          }
        }
        if (bestIn < best.dist) {
          const hstep = (solver.t - solver.tPrev) / 6;
          let lo = Math.max(solver.tPrev, solver.tPrev + (bestS - 1) * hstep);
          let hi = Math.min(solver.t, solver.tPrev + (bestS + 1) * hstep);
          for (let k = 0; k < 48; k++) {
            const m1 = lo + (hi - lo) * 0.382;
            const m2 = lo + (hi - lo) * 0.618;
            const e1 = evalAt(Float64Array.from(solver.dense(m1, buf)));
            const e2 = evalAt(Float64Array.from(solver.dense(m2, buf)));
            if (!e1 || !e2) break;
            if (e1.d < e2.d) hi = m2;
            else lo = m1;
          }
          const ys = Float64Array.from(solver.dense(0.5 * (lo + hi), buf));
          const eb = evalAt(ys);
          if (eb && eb.d < best.dist) best = { miss: eb.m, dist: eb.d, g: eb.g, tEmit: ys[0], tauEmit: eb.tau, rEmit: eb.r, ok: true };
        }
        prevD = ev.d;
        if (rising > 40 && best.dist < 5) break;
      }
      const dy = new Float64Array(8);
      ks.hamiltonianRHS(y, dy);
      const g = ks.geometry(y[1], y[2], y[3]);
      const drdl = g.dr[0] * dy[1] + g.dr[1] * dy[2] + g.dr[2] * dy[3];
      if (r > 3000 && drdl > 0) break;
      if (r > rPlus && r < rPlus * (1 + 1e-11) && drdl < 0) break;
    }
    return best;
  };

  // Base ortonormal transversal a la dirección n (en el marco de la cámara)
  const basis = (n: [number, number, number]) => {
    const a: [number, number, number] = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const t1: [number, number, number] = [n[1] * a[2] - n[2] * a[1], n[2] * a[0] - n[0] * a[2], n[0] * a[1] - n[1] * a[0]];
    const l1 = Math.hypot(...t1);
    t1[0] /= l1;
    t1[1] /= l1;
    t1[2] /= l1;
    const t2: [number, number, number] = [n[1] * t1[2] - n[2] * t1[1], n[2] * t1[0] - n[0] * t1[2], n[0] * t1[1] - n[1] * t1[0]];
    return [t1, t2];
  };

  // Estimación inicial: dirección coordenada hacia la posición retardada en línea recta
  const coordDirToCam = (D: [number, number, number]): [number, number, number] => {
    const Dv = Float64Array.of(0, D[0], D[1], D[2]);
    const p = cam.pos;
    const comps = [1, 2, 3].map((k) => ks.dot(p[0], p[1], p[2], Dv, cam.e[k]));
    const l = Math.hypot(comps[0], comps[1], comps[2]);
    return [comps[0] / l, comps[1] / l, comps[2] / l];
  };

  let guess: [number, number, number] | null = null;
  for (let s = 0; s < req.n; s++) {
    const tr = req.tFrom + ((req.tTo - req.tFrom) * s) / Math.max(1, req.n - 1);
    if (!guess) {
      let te = tr;
      for (let k = 0; k < 20; k++) {
        const st = em.at(te);
        if (!st) break;
        const D = Math.hypot(cam.pos[0] - st.x[0], cam.pos[1] - st.x[1], cam.pos[2] - st.x[2]);
        te = tr - D;
      }
      const st = em.at(Math.max(te, em.t0 + 1e-6));
      if (!st) {
        res.tRec.push(tr);
        res.g.push(NaN);
        res.tauEmit.push(NaN);
        res.tEmit.push(NaN);
        res.rEmit.push(NaN);
        res.found.push(false);
        res.dirCam.push([0, 0, 1]);
        continue;
      }
      guess = coordDirToCam([st.x[0] - cam.pos[0], st.x[1] - cam.pos[1], st.x[2] - cam.pos[2]]);
    }
    let n: [number, number, number] = guess;
    let hit = shoot(tr, n);
    for (let it = 0; it < 14 && hit.ok && hit.dist > 1e-7; it++) {
      const [t1, t2] = basis(n);
      const eps = Math.max(1e-9, Math.min(1e-5, hit.dist * 1e-3));
      const mk = (da: number, db: number): [number, number, number] => [n[0] + da * t1[0] + db * t2[0], n[1] + da * t1[1] + db * t2[1], n[2] + da * t1[2] + db * t2[2]];
      const hA = shoot(tr, mk(eps, 0));
      const hB = shoot(tr, mk(0, eps));
      // Proyección de la discrepancia sobre dos ejes fijos perpendiculares a la discrepancia media
      const m0 = hit.miss;
      const ax1 = hA.miss.map((v, i) => (v - m0[i]) / eps) as [number, number, number];
      const ax2 = hB.miss.map((v, i) => (v - m0[i]) / eps) as [number, number, number];
      // Mínimos cuadrados: [ax1 ax2] δ = −m0
      const a11 = ax1[0] ** 2 + ax1[1] ** 2 + ax1[2] ** 2;
      const a12 = ax1[0] * ax2[0] + ax1[1] * ax2[1] + ax1[2] * ax2[2];
      const a22 = ax2[0] ** 2 + ax2[1] ** 2 + ax2[2] ** 2;
      const b1 = -(ax1[0] * m0[0] + ax1[1] * m0[1] + ax1[2] * m0[2]);
      const b2 = -(ax2[0] * m0[0] + ax2[1] * m0[1] + ax2[2] * m0[2]);
      const det = a11 * a22 - a12 * a12;
      if (!(Math.abs(det) > 0)) break;
      let da = (b1 * a22 - b2 * a12) / det;
      let db = (a11 * b2 - a12 * b1) / det;
      const step = Math.hypot(da, db);
      if (step > 0.2) {
        da *= 0.2 / step;
        db *= 0.2 / step;
      }
      let nNew = mk(da, db);
      const l = Math.hypot(...nNew);
      nNew = [nNew[0] / l, nNew[1] / l, nNew[2] / l];
      const hNew = shoot(tr, nNew);
      if (hNew.ok && hNew.dist < hit.dist) {
        n = nNew;
        hit = hNew;
      } else break;
    }
    const ok = hit.ok && hit.dist < 1e-4;
    if (ok) guess = n;
    res.tRec.push(tr);
    res.g.push(ok ? hit.g : NaN);
    res.tauEmit.push(ok ? hit.tauEmit : NaN);
    res.tEmit.push(ok ? hit.tEmit : NaN);
    res.rEmit.push(ok ? hit.rEmit : NaN);
    res.found.push(ok);
    res.dirCam.push(n);
  }
  return res;
}
