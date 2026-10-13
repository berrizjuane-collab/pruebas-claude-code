/**
 * Condiciones iniciales de los lanzamientos.
 *
 * Toda velocidad inicial se define en el MARCO ORTONORMAL LOCAL del observador de lanzamiento
 * (estático o ZAMO) en el punto de partida: v = v_r e_r + v_t (cosψ e_φ − sinψ e_θ), |v| < c.
 * Después se transforma a Kerr–Schild: u = γ (e₀ + vⁱ eᵢ), p_μ = g_μν uᵛ.
 * Los escenarios rápidos fijan (v_r, v_t) a partir de magnitudes conservadas:
 *  - Caída radial: v = 0 (reposo respecto del observador).
 *  - Órbita: geodésica circular ecuatorial (solo si r > r_ph; inestable si r < r_ISCO) o excéntrica (r_p, r_a).
 *  - Sobrevuelo / captura / crítica: dirección elegida para que L = f·L_c(E), con L_c el momento
 *    angular crítico de captura (R(r) con raíz doble). Nunca se usa la velocidad de escape newtoniana.
 */
import { KerrSchild } from '../physics/metrics/kerrSchild';
import { cartesianFromSpheroidal } from '../physics/metrics/coordinates';
import { criticalImpactParameter, ergosphereRadius, horizons, iscoRadius, photonOrbitRadius } from '../physics/metrics/kerr';
import { circularOrbitState, criticalAngularMomentum, eccentricOrbitState } from '../physics/geodesics/orbits';
import { constantsOfMotion } from '../physics/geodesics/conserved';
import {
  frameComponents,
  gramSchmidtTetrad,
  relativeVelocity,
  sphericalTetrad,
  staticObserver,
  zamoObserver,
  type Tetrad,
  type Vec4,
} from '../physics/observers/observers';
import { mulberry32, uniformInBall } from '../physics/random';
import type { LaunchConfig } from './types';
import { CATALOG } from './catalog';

export interface BodyIC {
  pos: [number, number, number];
  p: Float64Array;
  u: Float64Array;
  /** Marco del cuerpo (tres vectores espaciales ortonormales, ortogonales a u). */
  frame: [Float64Array, Float64Array, Float64Array];
}

export interface PhotonIC {
  pos: [number, number, number];
  p: Float64Array;
  /** Parámetro de impacto exacto b = L_z/E. */
  b: number;
}

export interface BuiltLaunch {
  type: 'body' | 'cloud' | 'beam';
  body: BodyIC | null;
  particles: BodyIC[];
  photons: PhotonIC[];
  info: Record<string, number | string>;
  warnings: string[];
}

export class LaunchError extends Error {}

const DEG = Math.PI / 180;

function observerAt(ks: KerrSchild, pos: [number, number, number], wanted: 'static' | 'zamo', warnings: string[]): { u: Vec4; tet: Tetrad; kind: 'static' | 'zamo' } {
  const [x, y, z] = pos;
  let kind = wanted;
  let u = wanted === 'static' ? staticObserver(ks, x, y, z) : zamoObserver(ks, x, y, z);
  if (!u && wanted === 'static') {
    u = zamoObserver(ks, x, y, z);
    kind = 'zamo';
    warnings.push('Dentro de la ergosfera no existe observador estático: las velocidades se miden respecto de un ZAMO.');
  }
  if (!u) throw new LaunchError('El punto de lanzamiento debe estar fuera del horizonte.');
  return { u, tet: sphericalTetrad(ks, x, y, z, u), kind };
}

function fromLocal(tet: Tetrad, v: [number, number, number]): Vec4 {
  const v2 = v[0] ** 2 + v[1] ** 2 + v[2] ** 2;
  if (!(v2 < 1)) throw new LaunchError('La velocidad local de un cuerpo masivo debe ser menor que c.');
  const g = 1 / Math.sqrt(1 - v2);
  const u = new Float64Array(4);
  for (let i = 0; i < 4; i++) u[i] = g * (tet.e[0][i] + v[0] * tet.e[1][i] + v[1] * tet.e[2][i] + v[2] * tet.e[3][i]);
  return u;
}

/** Marco del cuerpo: ejes (radial, prógrado, norte) del observador rotados por la actitud y ortogonalizados respecto de u. */
function bodyFrame(ks: KerrSchild, pos: [number, number, number], u: Vec4, tet: Tetrad, attitudeDeg: [number, number, number]): [Float64Array, Float64Array, Float64Array] {
  const [yaw, pitch, roll] = attitudeDeg.map((d) => d * DEG);
  // Ejes base en el marco del observador: X = e_r, Y = e_φ, Z = −e_θ (norte)
  const base = [
    [1, 0, 0],
    [0, 0, 1],
    [0, -1, 0],
  ];
  const Rz = [
    [Math.cos(yaw), -Math.sin(yaw), 0],
    [Math.sin(yaw), Math.cos(yaw), 0],
    [0, 0, 1],
  ];
  const Ry = [
    [Math.cos(pitch), 0, Math.sin(pitch)],
    [0, 1, 0],
    [-Math.sin(pitch), 0, Math.cos(pitch)],
  ];
  const Rx = [
    [1, 0, 0],
    [0, Math.cos(roll), -Math.sin(roll)],
    [0, Math.sin(roll), Math.cos(roll)],
  ];
  const mul = (A: number[][], B: number[][]) => A.map((r) => [0, 1, 2].map((j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
  const R = mul(mul(Rz, Ry), Rx);
  const axes: Vec4[] = [];
  for (let k = 0; k < 3; k++) {
    // columna k de R expresada en (X, Y, Z) → en la base (e_r, e_θ, e_φ) del observador
    const c = [R[0][k], R[1][k], R[2][k]];
    const loc = [0, 0, 0];
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) loc[i] += c[j] * base[j][i];
    const v = new Float64Array(4);
    for (let m = 0; m < 4; m++) v[m] = loc[0] * tet.e[1][m] + loc[1] * tet.e[2][m] + loc[2] * tet.e[3][m];
    axes.push(v);
  }
  const t = gramSchmidtTetrad(ks, pos[0], pos[1], pos[2], u, [axes[0], axes[1], axes[2]]);
  return [t.e[1], t.e[2], t.e[3]];
}

/** Velocidad local para el escenario y la geometría dados. */
function scenarioVelocity(
  ks: KerrSchild,
  cfg: LaunchConfig,
  r0: number,
  tet: Tetrad,
  pos: [number, number, number],
  info: Record<string, number | string>,
  warnings: string[],
): [number, number, number] {
  const a = ks.a;
  const sign = cfg.prograde ? 1 : -1;
  switch (cfg.scenario) {
    case 'radial':
      return [0, 0, 0];
    case 'personalizado': {
      const psi = cfg.tangentAngleDeg * DEG;
      return [cfg.vRadial, -cfg.vTangential * Math.sin(psi), cfg.vTangential * Math.cos(psi)];
    }
    case 'sobrevuelo':
    case 'captura':
    case 'critica': {
      const speed = Math.hypot(cfg.vRadial, cfg.vTangential) || 0.4;
      // L(θ_dir) con dirección entre −e_r (θ_dir = 0) y ±e_φ (θ_dir = π/2)
      const Lof = (th: number) => {
        const v: [number, number, number] = [-speed * Math.cos(th), 0, sign * speed * Math.sin(th)];
        const u = fromLocal(tet, v);
        const p = ks.lower(pos[0], pos[1], pos[2], u);
        return { E: -p[0], L: pos[0] * p[2] - pos[1] * p[1], v };
      };
      const tang = Lof(Math.PI / 2);
      const E = tang.E;
      const Lc = criticalAngularMomentum(a, E, cfg.prograde, r0);
      info.E = E;
      info.Lcrit = Lc;
      const f = cfg.scenario === 'sobrevuelo' ? 1.35 : cfg.scenario === 'captura' ? 0.55 : cfg.criticalSide === 'escape' ? 1 + 2e-7 : 1 - 2e-7;
      const Lwant = f * Lc;
      if (Math.abs(tang.L) < Lwant) {
        if (cfg.scenario === 'captura') return tang.v;
        warnings.push('Ni siquiera un lanzamiento tangencial alcanza el momento angular pedido: aumenta la velocidad o el radio.');
        return tang.v;
      }
      // Bisección en el ángulo (|L| crece monótonamente con la componente tangencial)
      let lo = 0;
      let hi = Math.PI / 2;
      for (let it = 0; it < 80; it++) {
        const mid = 0.5 * (lo + hi);
        if (Math.abs(Lof(mid).L) < Lwant) lo = mid;
        else hi = mid;
      }
      const res = Lof(0.5 * (lo + hi));
      info.L = res.L;
      info.LsobreLc = Math.abs(res.L) / Lc;
      return res.v;
    }
    case 'orbita':
      return [0, 0, 0]; // se trata aparte
  }
}

export function buildLaunch(a: number, cfg: LaunchConfig): BuiltLaunch {
  const ks = new KerrSchild(a);
  const { rPlus } = horizons(a);
  const spec = CATALOG[cfg.object];
  const warnings: string[] = [];
  const info: Record<string, number | string> = {};
  const equatorial = cfg.scenario !== 'radial' && cfg.scenario !== 'personalizado';
  const theta0 = equatorial ? Math.PI / 2 : cfg.theta0Deg * DEG;
  const phi0 = cfg.phi0Deg * DEG;
  if (equatorial && Math.abs(cfg.theta0Deg - 90) > 0.01) warnings.push('Este escenario se define en el plano ecuatorial (θ = 90°).');
  let r0 = cfg.r0;
  if (!(r0 > rPlus * 1.05)) throw new LaunchError(`El lanzamiento debe partir fuera del horizonte (r₀ > ${(rPlus * 1.05).toFixed(2)} M).`);

  // --- Fotones ---
  if (spec.class === 'fotones') {
    const pos = cartesianFromSpheroidal(r0, Math.PI / 2, phi0, a);
    const obs = observerAt(ks, pos, cfg.observer, warnings);
    const bc = criticalImpactParameter(a, cfg.prograde);
    const b0 = Number.isFinite(cfg.beamCenterB) ? cfg.beamCenterB : bc * (cfg.prograde ? 1 : -1);
    const N = Math.max(1, Math.min(64, Math.round(cfg.beamCount)));
    const D = [-pos[0], -pos[1], -pos[2]];
    const dn = Math.hypot(D[0], D[1], D[2]);
    // Desplazamiento lateral en la dirección e_φ coordenada (perpendicular a D en el plano ecuatorial)
    const side = [-pos[1] / Math.hypot(pos[0], pos[1]), pos[0] / Math.hypot(pos[0], pos[1]), 0];
    const photons: PhotonIC[] = [];
    for (let k = 0; k < N; k++) {
      const s = N === 1 ? b0 : b0 + cfg.beamSpread * ((2 * k) / (N - 1) - 1);
      const pk: [number, number, number] = [pos[0] + s * side[0], pos[1] + s * side[1], pos[2]];
      const o = observerAt(ks, pk, cfg.observer, []);
      // dirección espacial D proyectada en el espacio en reposo del observador
      const Dv = Float64Array.of(0, D[0] / dn, D[1] / dn, D[2] / dn);
      const du = ks.dot(pk[0], pk[1], pk[2], Dv, o.u);
      for (let i = 0; i < 4; i++) Dv[i] += du * o.u[i];
      const nn = Math.sqrt(ks.dot(pk[0], pk[1], pk[2], Dv, Dv));
      const kv = new Float64Array(4);
      for (let i = 0; i < 4; i++) kv[i] = o.u[i] + Dv[i] / nn;
      const p = ks.lower(pk[0], pk[1], pk[2], kv);
      const b = (pk[0] * p[2] - pk[1] * p[1]) / -p[0];
      photons.push({ pos: pk, p, b });
    }
    info.bCritico = bc;
    info.bCentral = b0;
    info.observador = obs.kind;
    return { type: 'beam', body: null, particles: [], photons, info, warnings };
  }

  // --- Cuerpos y nubes ---
  let center: BodyIC;
  if (cfg.scenario === 'orbita') {
    let st;
    if (cfg.orbitType === 'circular') {
      const rph = photonOrbitRadius(a, cfg.prograde);
      const risco = iscoRadius(a, cfg.prograde);
      if (r0 <= rph * 1.001)
        throw new LaunchError(`No existen órbitas circulares en r ≤ r_ph = ${rph.toFixed(3)} M (${cfg.prograde ? 'prógradas' : 'retrógradas'}): incluso la luz necesita más velocidad que c.`);
      if (r0 < risco) warnings.push(`r₀ < r_ISCO = ${risco.toFixed(3)} M: la órbita circular existe pero es INESTABLE; cualquier perturbación la hará caer o escapar.`);
      st = circularOrbitState(ks, r0, cfg.prograde, phi0);
      info.periodoCoordM = 2 * Math.PI * (r0 ** 1.5 + (cfg.prograde ? a : -a));
      info.estabilidad = r0 >= risco ? 'estable' : 'inestable';
    } else {
      try {
        st = eccentricOrbitState(ks, cfg.rp, cfg.ra, cfg.prograde, phi0);
      } catch (e) {
        throw new LaunchError(`Órbita excéntrica imposible con r_p = ${cfg.rp} y r_a = ${cfg.ra}: ${(e as Error).message}`);
      }
      r0 = cfg.ra;
      info.rp = cfg.rp;
      info.ra = cfg.ra;
    }
    const obs = observerAt(ks, st.pos, cfg.observer, warnings);
    const rel = relativeVelocity(ks, st.pos[0], st.pos[1], st.pos[2], st.u, obs.tet);
    info.velocidadLocal = rel.speed;
    info.observador = obs.kind;
    center = { pos: st.pos, p: st.p, u: st.u, frame: bodyFrame(ks, st.pos, st.u, obs.tet, cfg.attitudeDeg) };
  } else {
    const pos = cartesianFromSpheroidal(r0, theta0, phi0, a);
    const obs = observerAt(ks, pos, cfg.observer, warnings);
    const v = scenarioVelocity(ks, cfg, r0, obs.tet, pos, info, warnings);
    const u = fromLocal(obs.tet, v);
    const p = ks.lower(pos[0], pos[1], pos[2], u);
    info.velocidadLocal = Math.hypot(v[0], v[1], v[2]);
    info.vRadial = v[0];
    info.vTangencial = Math.hypot(v[1], v[2]);
    info.observador = obs.kind;
    center = { pos, p, u, frame: bodyFrame(ks, pos, u, obs.tet, cfg.attitudeDeg) };
  }
  const c = constantsOfMotion(ks, center.pos, center.p);
  info.E = c.E;
  info.Lz = c.Lz;
  info.Q = c.Q;
  info.r0 = r0;
  info.ligado = c.E < 1 ? 'sí (E < 1)' : 'no (E ≥ 1)';
  const thE = Math.acos(center.pos[2] / Math.hypot(...center.pos));
  if (r0 < ergosphereRadius(a, thE)) warnings.push('El lanzamiento parte dentro de la ergosfera.');

  if (spec.class === 'nube') {
    const rng = mulberry32(cfg.seed);
    const N = Math.max(2, Math.min(64, Math.round(cfg.cloudCount)));
    const Rc = cfg.cloudRadius;
    // Marco local del observador en el centro: desplazamientos espaciales (aprox. de primer orden)
    const obs = observerAt(ks, center.pos, cfg.observer, warnings);
    const vLocal = frameComponents(ks, center.pos[0], center.pos[1], center.pos[2], obs.tet, center.u);
    const v: [number, number, number] = [vLocal[1] / vLocal[0], vLocal[2] / vLocal[0], vLocal[3] / vLocal[0]];
    const particles: BodyIC[] = [];
    for (let k = 0; k < N; k++) {
      const d = k === 0 ? [0, 0, 0] : uniformInBall(rng).map((q) => q * Rc);
      const ppos: [number, number, number] = [0, 0, 0];
      for (let i = 0; i < 3; i++) ppos[i] = center.pos[i] + d[0] * obs.tet.e[1][i + 1] + d[1] * obs.tet.e[2][i + 1] + d[2] * obs.tet.e[3][i + 1];
      const rr = ks.geometry(ppos[0], ppos[1], ppos[2]).r;
      if (rr < rPlus * 1.05) continue;
      const o = observerAt(ks, ppos, obs.kind, []);
      const u = fromLocal(o.tet, v);
      const p = ks.lower(ppos[0], ppos[1], ppos[2], u);
      particles.push({ pos: ppos, p, u, frame: center.frame });
    }
    info.particulas = particles.length;
    info.semilla = cfg.seed;
    return { type: 'cloud', body: center, particles, photons: [], info, warnings };
  }
  return { type: 'body', body: center, particles: [], photons: [], info, warnings };
}
