/**
 * Familias de geodésicas calculadas para el módulo SPACE-TIME GEOMETRY (todas son soluciones
 * numéricas de las ecuaciones geodésicas, no curvas dibujadas a mano):
 *  - Abanico de fotones ecuatoriales con parámetro de impacto creciente (lente, captura).
 *  - Fotones casi críticos (b ≈ b_c): giran cerca de la órbita fotónica antes de escapar o caer.
 *  - Órbitas masivas: circulares en el ISCO (prógrada y retrógrada), excéntrica con precesión y
 *    «zoom-whirl» cerca de la separatriz.
 *  - Capturas: caídas radiales y espiral de inmersión desde el ISCO.
 */
import { GeodesicIntegrator, type GeodesicEvent } from '../physics/geodesics/geodesic';
import { KerrSchild } from '../physics/metrics/kerrSchild';
import { criticalImpactParameter, horizons, iscoRadius, marginallyBoundRadius } from '../physics/metrics/kerr';
import { circularOrbitConstants, circularOrbitState, eccentricOrbitState, infallingState } from '../physics/geodesics/orbits';
import { staticObserver } from '../physics/observers/observers';
import { cartesianFromSpheroidal } from '../physics/metrics/coordinates';

export type CurveType = 'photon' | 'critical' | 'massive' | 'capture';

export interface Curve {
  type: CurveType;
  label: string;
  points: Float32Array;
  captured: boolean;
}

export interface FamilyRequest {
  a: number;
  photons: boolean;
  critical: boolean;
  massive: boolean;
  capture: boolean;
}

function trace(gi: GeodesicIntegrator, tMax: number, dt: number, maxPts = 8000): { pts: number[]; captured: boolean } {
  const pts: number[] = [gi.y[0], gi.y[1], gi.y[2]];
  const buf = new Float64Array(gi.n);
  let tNext = gi.t + dt;
  let captured = false;
  while (!gi.terminated && gi.t < tMax && pts.length < 3 * maxPts) {
    for (const e of gi.step()) if (e.kind === 'horizon') captured = true;
    const term = gi.terminated as GeodesicEvent | null;
    const tEnd = term ? term.t : gi.t;
    while (tNext <= tEnd && pts.length < 3 * maxPts) {
      const y = gi.denseAt(tNext, buf);
      pts.push(y[0], y[1], y[2]);
      tNext += dt;
    }
  }
  if (gi.terminated) pts.push(gi.terminated.state[0], gi.terminated.state[1], gi.terminated.state[2]);
  return { pts, captured };
}

/** Fotón ecuatorial que llega desde x = −X moviéndose en +x con parámetro de impacto y = b. */
function photonFrom(ks: KerrSchild, b: number, X = 60): GeodesicIntegrator {
  const pos: [number, number, number] = [-X, b, 0];
  const gi0 = ks.inverseMetric(pos[0], pos[1], pos[2]);
  const p = Float64Array.of(-1, 1, 0, 0);
  const A = gi0[0];
  const B = 2 * (gi0[1] * p[1] + gi0[2] * p[2] + gi0[3] * p[3]);
  let C = 0;
  for (let i = 1; i < 4; i++) for (let j = 1; j < 4; j++) C += gi0[4 * i + j] * p[i] * p[j];
  const disc = Math.sqrt(B * B - 4 * A * C);
  let pt = (-B - disc) / (2 * A);
  if (pt > 0) pt = (-B + disc) / (2 * A);
  p[0] = pt;
  const gi = new GeodesicIntegrator(ks, 'null', { rtol: 1e-10, atol: 1e-12 });
  gi.rEscape = 90;
  gi.reset(0, pos, p);
  return gi;
}

export function computeGeodesicFamilies(req: FamilyRequest): Curve[] {
  const ks = new KerrSchild(req.a);
  const a = req.a;
  const out: Curve[] = [];
  const add = (type: CurveType, label: string, r: { pts: number[]; captured: boolean }) =>
    out.push({ type: r.captured && type === 'photon' ? 'capture' : type, label, points: Float32Array.from(r.pts), captured: r.captured });

  if (req.photons) {
    for (let b = -13; b <= 13.01; b += 1.3) {
      if (Math.abs(b) < 0.2) continue;
      add('photon', `fotón b = ${b.toFixed(1)} M`, trace(photonFrom(ks, b), 400, 0.25));
    }
  }
  if (req.critical) {
    // Prógrados (b > 0 con movimiento +x ⇒ L < 0: retrógrado; se usa el signo para cada lado)
    const bcPro = criticalImpactParameter(a, true);
    const bcRet = criticalImpactParameter(a, false);
    for (const [b, lbl] of [
      [-(bcPro + 1e-6), 'crítico prógrado (escapa)'],
      [-(bcPro - 1e-6), 'crítico prógrado (cae)'],
      [bcRet + 1e-6, 'crítico retrógrado (escapa)'],
      [bcRet - 1e-6, 'crítico retrógrado (cae)'],
    ] as Array<[number, string]>) {
      const r = trace(photonFrom(ks, b), 600, 0.2);
      out.push({ type: 'critical', label: lbl, points: Float32Array.from(r.pts), captured: r.captured });
    }
  }
  if (req.massive) {
    for (const pro of [true, false]) {
      const ri = iscoRadius(a, pro);
      const st = circularOrbitState(ks, ri * 1.0005, pro);
      const gi = new GeodesicIntegrator(ks, 'massive');
      gi.reset(0, st.pos, st.p);
      const T = 2 * Math.PI * (ri ** 1.5 + (pro ? a : -a));
      add('massive', `ISCO ${pro ? 'prógrada' : 'retrógrada'} r = ${ri.toFixed(2)} M`, trace(gi, T * 1.02, 0.2));
    }
    try {
      const st = eccentricOrbitState(ks, 8, 18, true);
      const gi = new GeodesicIntegrator(ks, 'massive');
      gi.reset(0, st.pos, st.p);
      add('massive', 'excéntrica r_p = 8, r_a = 18 M (precesión)', trace(gi, 3200, 0.5));
    } catch {
      /* geometría no válida para este espín */
    }
    try {
      const rmb = marginallyBoundRadius(a, true);
      const st = eccentricOrbitState(ks, rmb * 1.04 + 0.05, 30, true);
      const gi = new GeodesicIntegrator(ks, 'massive');
      gi.reset(0, st.pos, st.p);
      add('massive', 'zoom-whirl (cerca de la separatriz)', trace(gi, 2500, 0.3));
    } catch {
      /* puede no existir */
    }
  }
  if (req.capture) {
    const { rPlus } = horizons(a);
    for (const [th, ph] of [
      [Math.PI / 2, 0.6],
      [Math.PI / 4, 2.4],
      [(3 * Math.PI) / 4, 4.2],
    ]) {
      const pos = cartesianFromSpheroidal(22, th, ph, a);
      const u = staticObserver(ks, pos[0], pos[1], pos[2])!;
      const gi = new GeodesicIntegrator(ks, 'massive');
      gi.reset(0, pos, ks.lower(pos[0], pos[1], pos[2], u));
      add('capture', 'caída radial desde el reposo', trace(gi, 400, 0.2));
    }
    // Inmersión desde el ISCO: E del ISCO y un 0,5 % menos de momento angular (raíz entrante regular)
    const ri = iscoRadius(a, true);
    const c = circularOrbitConstants(ri, a, true);
    const st = infallingState(ks, Math.max(ri * 0.999, rPlus * 1.2), Math.PI / 2, 0, c.E, 0.995 * c.L, 0);
    const gi = new GeodesicIntegrator(ks, 'massive');
    gi.reset(0, st.pos, st.p);
    add('capture', 'espiral de inmersión desde el ISCO', trace(gi, 1500, 0.15));
  }
  return out;
}
