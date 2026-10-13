/**
 * Informe cuantitativo de validación del núcleo físico (CPU, doble precisión).
 *
 * A diferencia de los tests (que solo comprueban umbrales), este guion MIDE y publica el error de
 * cada caso frente a su solución exacta o analítica, y lo guarda en docs/validacion/fisica.json.
 * También resume la validación del trazador de la GPU (docs/validacion/gpu.json, generado por
 * scripts/validar-gpu.mjs en un navegador real).
 *
 *   npm run validar
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KerrSchild } from '../src/physics/metrics/kerrSchild';
import { horizons, iscoRadius, kretschmann, photonOrbitRadius, criticalImpactParameter } from '../src/physics/metrics/kerr';
import { cartesianFromSpheroidal } from '../src/physics/metrics/coordinates';
import { GeodesicIntegrator, integrateSampled, type GeodesicEvent } from '../src/physics/geodesics/geodesic';
import { constantsOfMotion } from '../src/physics/geodesics/conserved';
import { circularOrbitState, eccentricOrbitState, infallingState, schwarzschildDeflection, schwarzschildPrecession } from '../src/physics/geodesics/orbits';
import { photonFromLocal, rainObserver, sphericalTetrad, staticObserver, zamoObserver } from '../src/physics/observers/observers';
import { kretschmannNumeric, tidalTensor } from '../src/physics/tidal/riemann';
import { Dopri5, rk4Step } from '../src/physics/integrators/dopri5';
import { mulberry32 } from '../src/physics/random';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

interface Fila {
  grupo: string;
  caso: string;
  referencia: string;
  medida: string;
  error: number;
  tipoError: 'relativo' | 'absoluto' | 'razón';
  umbralTest?: number;
}
const filas: Fila[] = [];
const add = (f: Fila) => {
  filas.push(f);
  console.log(`· ${f.grupo} · ${f.caso}: ${f.tipoError} ${f.error.toExponential(2)}`);
};
const radius = (ks: KerrSchild, y: ArrayLike<number>) => ks.geometry(y[0], y[1], y[2]).r;

// ---------------------------------------------------------------- Integradores
{
  const f = (_t: number, y: Float64Array, dy: Float64Array) => {
    dy[0] = y[1];
    dy[1] = -y[0];
  };
  for (const tol of [1e-6, 1e-9, 1e-12]) {
    const s = new Dopri5(2, f, { rtol: tol, atol: tol });
    s.reset(0, [1, 0]);
    let n = 0;
    while (s.t < 20) {
      s.step();
      n++;
    }
    add({ grupo: 'Integradores', caso: `Dormand–Prince 5(4), oscilador armónico, tol = ${tol.toExponential(0)} (${n} pasos)`, referencia: 'cos t', medida: `y(${s.t.toFixed(2)})`, error: Math.abs(s.y[0] - Math.cos(s.t)), tipoError: 'absoluto' });
  }
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
  const ratio = run(0.1) / run(0.05);
  const orden = Math.log2(ratio);
  add({ grupo: 'Integradores', caso: 'RK4 (el de la GPU): orden de convergencia medido log₂(e(h)/e(h/2)), h = 0,1', referencia: '4', medida: orden.toFixed(3), error: Math.abs(orden - 4) / 4, tipoError: 'relativo' });
}

// ---------------------------------------------------------------- Caída radial (Schwarzschild)
{
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
      maxH = Math.max(maxH, Math.abs(ks.hamiltonian([t, y[0], y[1], y[2], y[3], y[4], y[5], y[6]]) + 0.5));
    },
    (e) => events.push(e),
  );
  const cyc = (r: number) => {
    const eta = Math.acos((2 * r) / r0 - 1);
    return Math.sqrt((r0 * r0 * r0) / 8) * (eta + Math.sin(eta));
  };
  const hor = events.find((e) => e.kind === 'horizon')!;
  const end = events.find((e) => e.kind === 'singularity')!;
  add({ grupo: 'Caída radial', caso: 'τ al cruzar r = 2M desde el reposo en r₀ = 10M', referencia: `cicloide ${cyc(2).toFixed(10)} M`, medida: `${hor.lambda.toFixed(10)} M`, error: Math.abs(hor.lambda - cyc(2)) / cyc(2), tipoError: 'relativo', umbralTest: 1e-9 });
  add({ grupo: 'Caída radial', caso: `τ al final del dominio (r = ${end.r.toExponential(1)} M)`, referencia: `cicloide ${cyc(end.r).toFixed(10)} M`, medida: `${end.lambda.toFixed(10)} M`, error: Math.abs(end.lambda - cyc(end.r)) / cyc(end.r), tipoError: 'relativo', umbralTest: 1e-8 });
  add({ grupo: 'Caída radial', caso: 'Ligadura hamiltoniana |H + ½| máxima (incluido el interior)', referencia: '0', medida: maxH.toExponential(2), error: maxH, tipoError: 'absoluto', umbralTest: 1e-9 });
  add({ grupo: 'Caída radial', caso: 't de Kerr–Schild en el cruce del horizonte (finito)', referencia: 'finito', medida: `${hor.t.toFixed(4)} M`, error: Number.isFinite(hor.t) ? 0 : 1, tipoError: 'absoluto' });
}

// ---------------------------------------------------------------- Kerr: constantes de Carter
{
  const a = 0.9;
  const ks = new KerrSchild(a);
  const st = infallingState(ks, 12, 1.0, 0.3, 1, 1.5, 0.4);
  const gi = new GeodesicIntegrator(ks, 'massive', { rtol: 1e-11, atol: 1e-13 });
  gi.reset(0, st.pos, st.p);
  const c0 = constantsOfMotion(ks, st.pos, st.p);
  while (!gi.terminated) gi.step();
  const c1 = constantsOfMotion(ks, [gi.y[0], gi.y[1], gi.y[2]], [gi.y[3], gi.y[4], gi.y[5], gi.y[6]]);
  add({ grupo: 'Kerr a = 0,9', caso: 'Caída oblicua hasta r₋: deriva de E', referencia: c0.E.toPrecision(12), medida: c1.E.toPrecision(12), error: Math.abs(c1.E - c0.E), tipoError: 'absoluto', umbralTest: 1e-12 });
  add({ grupo: 'Kerr a = 0,9', caso: 'Caída oblicua hasta r₋: deriva de L_z', referencia: c0.Lz.toPrecision(12), medida: c1.Lz.toPrecision(12), error: Math.abs(c1.Lz - c0.Lz) / Math.abs(c0.Lz), tipoError: 'relativo', umbralTest: 1e-8 });
  add({ grupo: 'Kerr a = 0,9', caso: 'Caída oblicua hasta r₋: deriva de Q (Carter)', referencia: c0.Q.toPrecision(12), medida: c1.Q.toPrecision(12), error: Math.abs(c1.Q - c0.Q) / Math.max(1, Math.abs(c0.Q)), tipoError: 'relativo', umbralTest: 1e-7 });
  add({ grupo: 'Kerr a = 0,9', caso: 'Caída oblicua hasta r₋: ligadura de masa |μ² − 1|', referencia: '1', medida: c1.mu2.toPrecision(12), error: Math.abs(c1.mu2 - 1), tipoError: 'absoluto', umbralTest: 1e-8 });

  const pos = cartesianFromSpheroidal(10, 1.0, 0, a);
  const zamo = zamoObserver(ks, pos[0], pos[1], pos[2])!;
  const tet = sphericalTetrad(ks, pos[0], pos[1], pos[2], zamo);
  const v = [0.05, 0.12, 0.3];
  const g = 1 / Math.sqrt(1 - (v[0] ** 2 + v[1] ** 2 + v[2] ** 2));
  const u = new Float64Array(4);
  for (let i = 0; i < 4; i++) u[i] = g * (tet.e[0][i] + v[0] * tet.e[1][i] + v[1] * tet.e[2][i] + v[2] * tet.e[3][i]);
  const p = ks.lower(pos[0], pos[1], pos[2], u);
  const k0 = constantsOfMotion(ks, pos, p);
  const g2 = new GeodesicIntegrator(ks, 'massive', { rtol: 1e-12, atol: 1e-14 });
  g2.reset(0, pos, p);
  let worst = 0;
  integrateSampled(g2, 3000, 10, (_t, y) => {
    const c = constantsOfMotion(ks, [y[0], y[1], y[2]], [y[3], y[4], y[5], y[6]]);
    worst = Math.max(worst, Math.abs(c.Lz - k0.Lz) / Math.abs(k0.Lz), Math.abs(c.Q - k0.Q) / Math.abs(k0.Q), Math.abs(c.mu2 - 1));
  });
  add({ grupo: 'Kerr a = 0,9', caso: 'Órbita inclinada y excéntrica, 3000 M: máx. deriva relativa de L_z, Q y μ²', referencia: 'constantes', medida: worst.toExponential(2), error: worst, tipoError: 'relativo', umbralTest: 1e-8 });
}

// ---------------------------------------------------------------- Órbitas
{
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
    add({ grupo: 'Órbitas', caso: `Circular prógrada en r_ISCO + 1 (a = ${a}), 10 vueltas: máx. |Δr|/r`, referencia: `${r.toFixed(6)} M`, medida: `máx. |Δr| = ${maxDev.toExponential(2)} M`, error: maxDev / r, tipoError: 'relativo', umbralTest: 1e-7 / r });
  }
  const ks = new KerrSchild(0);
  const pp = 40;
  const e = 0.4;
  const st = eccentricOrbitState(ks, pp / (1 + e), pp / (1 - e), true);
  const gi = new GeodesicIntegrator(ks, 'massive', { rtol: 1e-12, atol: 1e-14 });
  gi.reset(0, st.pos, st.p);
  const apo: GeodesicEvent[] = [];
  while (apo.length < 3) for (const ev of gi.step()) if (ev.kind === 'apoapsis') apo.push(ev);
  const ang = (ev: GeodesicEvent) => Math.atan2(ev.state[1], ev.state[0]);
  let d = ang(apo[1]) - ang(apo[0]);
  while (d < 0) d += 2 * Math.PI;
  const exact = schwarzschildPrecession(pp, e);
  add({ grupo: 'Órbitas', caso: 'Precesión del periastro (Schwarzschild, p = 40M, e = 0,4)', referencia: `${((exact * 180) / Math.PI).toFixed(8)}° (integral elíptica)`, medida: `${((d * 180) / Math.PI).toFixed(8)}°`, error: Math.abs(d - exact) / exact, tipoError: 'relativo', umbralTest: 1e-6 });
}

// ---------------------------------------------------------------- Fotones
{
  const ks = new KerrSchild(0);
  const u = staticObserver(ks, 3, 0, 0)!;
  const tet = sphericalTetrad(ks, 3, 0, 0, u);
  const p = ks.lower(3, 0, 0, photonFromLocal(tet, [0, 0, 1]));
  const gi = new GeodesicIntegrator(ks, 'null', { rtol: 1e-13, atol: 1e-15 });
  gi.reset(0, [3, 0, 0], p);
  let maxDev = 0;
  const T = 2 * Math.PI * Math.sqrt(27);
  integrateSampled(gi, 2 * T, 0.5, (_t, y) => {
    maxDev = Math.max(maxDev, Math.abs(radius(ks, y) - 3));
  });
  add({ grupo: 'Fotones', caso: 'Órbita fotónica r = 3M (inestable), 2 vueltas: máx. |Δr|', referencia: '3 M', medida: `${maxDev.toExponential(2)} M`, error: maxDev / 3, tipoError: 'relativo', umbralTest: 1e-4 / 3 });

  const a = 0.7;
  const kk = new KerrSchild(a);
  for (const pro of [true, false]) {
    const r = photonOrbitRadius(a, pro);
    const pos = cartesianFromSpheroidal(r, Math.PI / 2, 0, a);
    const z = zamoObserver(kk, pos[0], pos[1], pos[2])!;
    const tt = sphericalTetrad(kk, pos[0], pos[1], pos[2], z);
    const pk = kk.lower(pos[0], pos[1], pos[2], photonFromLocal(tt, [0, 0, pro ? 1 : -1]));
    const g2 = new GeodesicIntegrator(kk, 'null', { rtol: 1e-13, atol: 1e-15 });
    g2.reset(0, pos, pk);
    let dev = 0;
    integrateSampled(g2, 30, 0.2, (_t, y) => {
      dev = Math.max(dev, Math.abs(radius(kk, y) - r));
    });
    add({ grupo: 'Fotones', caso: `Órbita fotónica ecuatorial ${pro ? 'prógrada' : 'retrógrada'} (a = 0,7), 30 M`, referencia: `${r.toFixed(8)} M (Bardeen et al. 1972)`, medida: `máx. |Δr| = ${dev.toExponential(2)} M`, error: dev / r, tipoError: 'relativo', umbralTest: 1e-5 / r });
  }

  for (const b of [20, 100, 1000]) {
    const X = 1e6;
    const pv = Float64Array.of(-1, 1, 0, 0);
    const pos = [-X, b, 0];
    const gi0 = ks.inverseMetric(pos[0], pos[1], pos[2]);
    const A = gi0[0];
    const B = 2 * (gi0[1] * pv[1] + gi0[2] * pv[2] + gi0[3] * pv[3]);
    let C = 0;
    for (let i = 1; i < 4; i++) for (let j = 1; j < 4; j++) C += gi0[4 * i + j] * pv[i] * pv[j];
    pv[0] = (-B - Math.sqrt(B * B - 4 * A * C)) / (2 * A);
    if (pv[0] > 0) pv[0] = (-B + Math.sqrt(B * B - 4 * A * C)) / (2 * A);
    const g3 = new GeodesicIntegrator(ks, 'null', { rtol: 1e-13, atol: 1e-13, hMax: 1e5 });
    g3.rEscape = 2 * X;
    g3.reset(0, pos, pv);
    const d0 = new Float64Array(8);
    g3.rhs(0, g3.y, d0);
    while (!g3.terminated && g3.y[0] < X) g3.step();
    const d1 = new Float64Array(8);
    g3.rhs(g3.t, g3.y, d1);
    const defl = -(Math.atan2(d1[1], d1[0]) - Math.atan2(d0[1], d0[0]));
    const ex = schwarzschildDeflection(b);
    add({ grupo: 'Fotones', caso: `Deflexión de la luz, b = ${b} M (truncada en ±10⁶ M)`, referencia: `${ex.toExponential(8)} rad (integral exacta)`, medida: `${defl.toExponential(8)} rad`, error: Math.abs(defl - ex) / ex, tipoError: 'relativo' });
  }

  // Retardo de Shapiro radial
  const r1 = 10;
  const r2 = 100;
  const us = staticObserver(ks, r1, 0, 0)!;
  const ts = sphericalTetrad(ks, r1, 0, 0, us);
  const ps = ks.lower(r1, 0, 0, photonFromLocal(ts, [1, 0, 0]));
  const g4 = new GeodesicIntegrator(ks, 'null', { rtol: 1e-13, atol: 1e-14 });
  g4.reset(0, [r1, 0, 0], ps);
  let tCross = NaN;
  const buf = new Float64Array(8);
  while (Number.isNaN(tCross)) {
    g4.step();
    if (radius(ks, g4.y) >= r2) {
      let lo = g4.solver.tPrev;
      let hi = g4.t;
      for (let k = 0; k < 80; k++) {
        const mid = 0.5 * (lo + hi);
        if (radius(ks, g4.denseAt(mid, buf)) < r2) lo = mid;
        else hi = mid;
      }
      tCross = 0.5 * (lo + hi);
    }
  }
  const expected = r2 - r1 + 4 * Math.log((r2 - 2) / (r1 - 2));
  add({ grupo: 'Fotones', caso: 'Tiempo de vuelo radial 10M → 100M (retardo de Shapiro)', referencia: `${expected.toFixed(10)} M`, medida: `${tCross.toFixed(10)} M`, error: Math.abs(tCross - expected) / expected, tipoError: 'relativo', umbralTest: 1e-8 / expected });
  add({ grupo: 'Fotones', caso: 'Parámetro de impacto crítico b_c (a = 0) = 3√3 M', referencia: (3 * Math.sqrt(3)).toFixed(12), medida: criticalImpactParameter(0, true).toFixed(12), error: Math.abs(criticalImpactParameter(0, true) - 3 * Math.sqrt(3)) / (3 * Math.sqrt(3)), tipoError: 'relativo' });
}

// ---------------------------------------------------------------- Curvatura y marea
{
  const rng = mulberry32(11);
  let worst = 0;
  let n = 0;
  for (const a of [0, 0.5, 0.9]) {
    const ks = new KerrSchild(a);
    const { rMinus } = horizons(a);
    for (let k = 0; k < 12; k++) {
      const r = Math.max(rMinus + 0.15, 0.4) + 12 * rng() ** 2;
      const th = 0.2 + (Math.PI - 0.4) * rng();
      const [x, y, z] = cartesianFromSpheroidal(r, th, 6.28 * rng(), a);
      worst = Math.max(worst, Math.abs(kretschmannNumeric(ks, x, y, z) - kretschmann(r, th, a)) / Math.abs(kretschmann(r, th, a)));
      n++;
    }
  }
  add({ grupo: 'Curvatura', caso: `Kretschmann numérico (Riemann por diferencias de Richardson) frente al analítico, ${n} puntos dentro y fuera del horizonte`, referencia: 'fórmula cerrada', medida: `peor caso ${worst.toExponential(2)}`, error: worst, tipoError: 'relativo', umbralTest: 1e-6 });
  const ks = new KerrSchild(0);
  let wt = 0;
  for (const r of [3, 6, 20]) {
    const p = cartesianFromSpheroidal(r, 1.1, 0.7, 0);
    const u = staticObserver(ks, p[0], p[1], p[2])!;
    const tet = sphericalTetrad(ks, p[0], p[1], p[2], u);
    const E = tidalTensor(ks, p[0], p[1], p[2], u, [tet.e[1], tet.e[2], tet.e[3]]);
    const s = 1 / r ** 3;
    wt = Math.max(wt, Math.abs(E[0] / s + 2) / 2, Math.abs(E[4] / s - 1), Math.abs(E[8] / s - 1));
  }
  add({ grupo: 'Curvatura', caso: 'Tensor de marea, observador estático en Schwarzschild: diag(−2, 1, 1)·M/r³', referencia: 'exacto', medida: `peor caso ${wt.toExponential(2)}`, error: wt, tipoError: 'relativo', umbralTest: 1e-6 });
  let wr = 0;
  for (const r of [6, 2, 1.2]) {
    const p = cartesianFromSpheroidal(r, 0.9, 2.0, 0);
    const u = rainObserver(ks, p[0], p[1], p[2]);
    const tet = sphericalTetrad(ks, p[0], p[1], p[2], u);
    const E = tidalTensor(ks, p[0], p[1], p[2], u, [tet.e[1], tet.e[2], tet.e[3]]);
    const s = 1 / r ** 3;
    wr = Math.max(wr, Math.abs(E[0] / s + 2) / 2, Math.abs(E[4] / s - 1), Math.abs(E[8] / s - 1));
  }
  add({ grupo: 'Curvatura', caso: 'Marea del observador en caída (también dentro del horizonte, r = 1,2M)', referencia: 'diag(−2, 1, 1)·M/r³', medida: `peor caso ${wr.toExponential(2)}`, error: wr, tipoError: 'relativo', umbralTest: 1e-5 });
}

// ---------------------------------------------------------------- Convergencia de una trayectoria
{
  // Órbita ligada, inclinada y excéntrica en Kerr (a = 0,9): posición tras 1000 M (≈ 5 periastros)
  const a = 0.9;
  const ks = new KerrSchild(a);
  const pos = cartesianFromSpheroidal(10, 1.0, 0, a);
  const zamo = zamoObserver(ks, pos[0], pos[1], pos[2])!;
  const tet = sphericalTetrad(ks, pos[0], pos[1], pos[2], zamo);
  const v = [0.05, 0.12, 0.3];
  const g = 1 / Math.sqrt(1 - (v[0] ** 2 + v[1] ** 2 + v[2] ** 2));
  const u = new Float64Array(4);
  for (let i = 0; i < 4; i++) u[i] = g * (tet.e[0][i] + v[0] * tet.e[1][i] + v[1] * tet.e[2][i] + v[2] * tet.e[3][i]);
  const p = ks.lower(pos[0], pos[1], pos[2], u);
  const tEnd = 1000;
  const final = (tol: number) => {
    const gi = new GeodesicIntegrator(ks, 'massive', { rtol: tol, atol: tol * 1e-2 });
    gi.reset(0, pos, p);
    while (!gi.terminated && gi.t < tEnd) gi.step();
    if (gi.terminated) throw new Error('la órbita de convergencia terminó antes de tiempo');
    return { y: Float64Array.from(gi.denseAt(tEnd, new Float64Array(gi.n))), n: gi.solver.nAccepted };
  };
  const ref = final(1e-13).y;
  let prev = NaN;
  for (const tol of [1e-6, 1e-8, 1e-10, 1e-12]) {
    const { y } = final(tol);
    const e = Math.hypot(y[0] - ref[0], y[1] - ref[1], y[2] - ref[2]);
    add({ grupo: 'Convergencia', caso: `Órbita inclinada y excéntrica (a = 0,9): posición en t = ${tEnd} M con rtol = ${tol.toExponential(0)}${Number.isFinite(prev) ? ` (mejora ×${(prev / e).toFixed(0)} por cada ×100 de tolerancia)` : ''}`, referencia: 'rtol = 1e-13', medida: `|Δx| = ${e.toExponential(2)} M`, error: e, tipoError: 'absoluto' });
    prev = e;
  }
}

// ---------------------------------------------------------------- GPU
const gpuPath = join(raiz, 'docs/validacion/gpu.json');
if (existsSync(gpuPath)) {
  const gpu = JSON.parse(readFileSync(gpuPath, 'utf8')) as { results: Array<Record<string, number | string>> };
  const res = gpu.results;
  for (const r of res) {
    if (typeof r.errRelIMediano === 'number')
      console.log(`· GPU · ${r.caso}: clasificación ${(Number(r.acuerdoClasificacion) * 100).toFixed(1)} %, error relativo de I₂₃₀ mediano ${(Number(r.errRelIMediano) * 100).toFixed(2)} %, p95 ${(Number(r.errRelIP95) * 100).toFixed(2)} %, flujo GPU/CPU ${Number(r.flujoRelGpuCpu).toFixed(4)}`);
    else
      console.log(`· GPU · ${r.caso}: clasificación ${(Number(r.acuerdoClasificacion) * 100).toFixed(1)} %, error angular mediano ${Number(r.errAngMedianoRad).toExponential(2)} rad, p95 ${Number(r.errAngP95Rad).toExponential(2)} rad, máx. ${Number(r.errAngMaxRad).toExponential(2)} rad`);
  }
}

mkdirSync(join(raiz, 'docs/validacion'), { recursive: true });
writeFileSync(join(raiz, 'docs/validacion/fisica.json'), JSON.stringify({ generado: new Date().toISOString(), node: process.version, filas }, null, 2));
console.log(`\n${filas.length} medidas guardadas en docs/validacion/fisica.json`);
const md = ['| Grupo | Caso | Referencia | Medida | Error |', '|---|---|---|---|---|', ...filas.map((f) => `| ${f.grupo} | ${f.caso} | ${f.referencia} | ${f.medida} | ${f.error.toExponential(1)} (${f.tipoError}) |`)].join('\n');
writeFileSync(join(raiz, 'docs/validacion/fisica.md'), `${md}\n`);
