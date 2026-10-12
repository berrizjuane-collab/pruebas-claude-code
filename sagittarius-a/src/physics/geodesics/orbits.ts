/**
 * Condiciones iniciales de órbitas y trayectorias de referencia, y resultados analíticos de
 * comparación (precesión del periastro y deflexión de la luz en Schwarzschild).
 */
import { KerrSchild } from '../metrics/kerrSchild';
import { circularObserver, rainObserver, sphericalTetrad, staticObserver, zamoObserver, type Vec4 } from '../observers/observers';
import { circularOrbitConstants, circularOrbitExists, horizons, iscoRadius, keplerOmega, radialPotential } from '../metrics/kerr';
import { cartesianFromSpheroidal, covectorSpheroidalToCartesian, regularInfallUr } from '../metrics/coordinates';

export interface InitialState {
  pos: [number, number, number];
  /** Momento covariante p_μ (por unidad de masa para cuerpos masivos). */
  p: Float64Array;
  /** 4-velocidad (contravariante) para masivos, o p^μ para fotones. */
  u: Float64Array;
}

/** Órbita circular ecuatorial (geodésica) en r. Lanza si no existe. */
export function circularOrbitState(ks: KerrSchild, r: number, prograde: boolean, phi0 = 0): InitialState {
  const a = ks.a;
  if (!circularOrbitExists(r, a, prograde)) {
    throw new RangeError(`No existe órbita circular en r = ${r.toFixed(3)} M (por debajo de la órbita fotónica).`);
  }
  const omega = keplerOmega(r, a, prograde);
  const pos = cartesianFromSpheroidal(r, Math.PI / 2, phi0, a);
  const u = circularObserver(ks, pos[0], pos[1], pos[2], omega);
  if (!u) throw new RangeError('Órbita circular no temporal');
  const p = ks.lower(pos[0], pos[1], pos[2], u);
  return { pos, p, u };
}

/** Clasificación de estabilidad de una órbita circular. */
export function circularOrbitStability(a: number, r: number, prograde: boolean): 'estable' | 'inestable' | 'inexistente' {
  if (!circularOrbitExists(r, a, prograde)) return 'inexistente';
  return r >= iscoRadius(a, prograde) ? 'estable' : 'inestable';
}

/**
 * Constantes (E, L) de una órbita ecuatorial ligada con periastro rp y apoastro ra (Q = 0, μ = 1):
 * R(rp) = R(ra) = 0, resuelto por Newton a partir de la solución de Schwarzschild.
 */
export function eccentricOrbitConstants(a: number, rp: number, ra: number, prograde: boolean): { E: number; L: number } {
  if (!(ra > rp)) throw new RangeError('Se requiere ra > rp');
  const p = (2 * ra * rp) / (ra + rp);
  const e = (ra - rp) / (ra + rp);
  const den = p - 3 - e * e;
  if (!(den > 0)) throw new RangeError('Órbita no ligada/estable para esos radios');
  let L = Math.sqrt((p * p) / den) * (prograde ? 1 : -1);
  let E = Math.sqrt(((p - 2 - 2 * e) * (p - 2 + 2 * e)) / (p * den));
  for (let it = 0; it < 60; it++) {
    const F1 = radialPotential(rp, a, E, L, 0, 1);
    const F2 = radialPotential(ra, a, E, L, 0, 1);
    const h = 1e-7;
    const J11 = (radialPotential(rp, a, E + h, L, 0, 1) - radialPotential(rp, a, E - h, L, 0, 1)) / (2 * h);
    const J12 = (radialPotential(rp, a, E, L + h, 0, 1) - radialPotential(rp, a, E, L - h, 0, 1)) / (2 * h);
    const J21 = (radialPotential(ra, a, E + h, L, 0, 1) - radialPotential(ra, a, E - h, L, 0, 1)) / (2 * h);
    const J22 = (radialPotential(ra, a, E, L + h, 0, 1) - radialPotential(ra, a, E, L - h, 0, 1)) / (2 * h);
    const det = J11 * J22 - J12 * J21;
    const dE = (F1 * J22 - F2 * J12) / det;
    const dL = (J11 * F2 - J21 * F1) / det;
    E -= dE;
    L -= dL;
    if (Math.abs(dE) < 1e-14 && Math.abs(dL) < 1e-13) break;
  }
  // Comprobación: R > 0 entre rp y ra (órbita realizable)
  for (let k = 1; k < 20; k++) {
    const r = rp + ((ra - rp) * k) / 20;
    if (radialPotential(r, a, E, L, 0, 1) <= 0) throw new RangeError('Esos radios no definen una órbita ligada realizable');
  }
  return { E, L };
}

/**
 * Estado inicial en el apoastro de una órbita ecuatorial excéntrica (u_r^BL = 0, u_θ = 0).
 * En KS: u_r = (2 r E − a L)/Δ (de u_r^BL = u_r^KS + (2r u_t + a u_φ)/Δ con u_t = −E).
 */
export function eccentricOrbitState(ks: KerrSchild, rp: number, ra: number, prograde: boolean, phi0 = 0): InitialState {
  const a = ks.a;
  const { E, L } = eccentricOrbitConstants(a, rp, ra, prograde);
  const r = ra;
  const D = r * r - 2 * r + a * a;
  const urKS = (2 * r * E - a * L) / D;
  const pos = cartesianFromSpheroidal(r, Math.PI / 2, phi0, a);
  const p = covectorSpheroidalToCartesian(pos[0], pos[1], pos[2], a, -E, urKS, 0, L);
  const u = ks.raise(pos[0], pos[1], pos[2], p);
  return { pos, p, u };
}

/** Geodésica entrante con constantes (E, L, Q) desde (r, θ, φ̃), usando la raíz regular en el horizonte. */
export function infallingState(ks: KerrSchild, r: number, theta: number, phi: number, E: number, L: number, pth: number, mu2 = 1): InitialState {
  const a = ks.a;
  const ur = regularInfallUr(r, theta, a, -E, pth, L, mu2);
  if (!Number.isFinite(ur)) throw new RangeError('No existe ese movimiento en ese punto (potencial prohibido).');
  const pos = cartesianFromSpheroidal(r, theta, phi, a);
  const p = covectorSpheroidalToCartesian(pos[0], pos[1], pos[2], a, -E, ur, pth, L);
  const u = ks.raise(pos[0], pos[1], pos[2], p);
  return { pos, p, u };
}

/**
 * Momento angular crítico de captura en el plano ecuatorial para una partícula de energía E que
 * parte de r₀ hacia dentro: el mayor |L| para el que R(r) > 0 en todo (r₊, r₀), es decir, sin
 * punto de retorno antes del horizonte. |L| < L_c ⇒ captura; |L| > L_c ⇒ rebota (sobrevuelo).
 * En el valor crítico la partícula se aproxima asintóticamente a una órbita circular inestable.
 */
export function criticalAngularMomentum(a: number, E: number, prograde: boolean, r0: number, mu2 = 1): number {
  const { rPlus } = horizons(a);
  const sgn = prograde ? 1 : -1;
  const N = 1500;
  const span = r0 - rPlus;
  const captured = (L: number) => {
    for (let k = 1; k < N; k++) {
      const r = rPlus + span * Math.pow(k / N, 2.5);
      if (radialPotential(r, a, E, sgn * L, 0, mu2) <= 0) return false;
    }
    return true;
  };
  // |L| máximo compatible con estar en r₀: R(r₀) ≥ 0
  let hi = 0.5;
  while (radialPotential(r0, a, E, sgn * hi, 0, mu2) > 0 && hi < 1e4) hi *= 2;
  if (!captured(0)) return 0;
  let lo = 0;
  for (let it = 0; it < 70; it++) {
    const mid = 0.5 * (lo + hi);
    if (captured(mid)) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}

/** Integral elíptica completa de primera especie K(m) (m = k²) por la media aritmético-geométrica. */
export function ellipticK(m: number): number {
  let a = 1;
  let b = Math.sqrt(1 - m);
  for (let i = 0; i < 40; i++) {
    const an = 0.5 * (a + b);
    b = Math.sqrt(a * b);
    a = an;
    if (Math.abs(a - b) < 1e-16 * a) break;
  }
  return Math.PI / (2 * a);
}

/**
 * Avance exacto del periastro por órbita radial en Schwarzschild (Cutler, Kennefick & Poisson 1994):
 *   Δφ = 4 √(p/(p − 6 + 2e)) K(4e/(p − 6 + 2e)) − 2π.
 */
export function schwarzschildPrecession(p: number, e: number): number {
  const d = p - 6 + 2 * e;
  return 4 * Math.sqrt(p / d) * ellipticK((4 * e) / d) - 2 * Math.PI;
}

/**
 * Deflexión exacta de la luz en Schwarzschild para parámetro de impacto b > √27:
 *   α = 2 ∫₀^{u₀} du / √(1/b² − u² + 2u³) − π,  con u₀ la menor raíz positiva.
 * Se usa u = u₀ (1 − s²) para eliminar la singularidad integrable y Gauss–Legendre compuesto.
 */
export function schwarzschildDeflection(b: number): number {
  // Raíz u₀: 2u³ − u² + 1/b² = 0 (la menor positiva) por Newton desde 1/b.
  let u0 = 1 / b;
  for (let i = 0; i < 100; i++) {
    const F = 2 * u0 ** 3 - u0 * u0 + 1 / (b * b);
    const dF = 6 * u0 * u0 - 2 * u0;
    const du = F / dF;
    u0 -= du;
    if (Math.abs(du) < 1e-17) break;
  }
  const G = (u: number) => 1 / (b * b) - u * u + 2 * u * u * u;
  // ∫₀^{u₀} du/√G(u) con u = u₀(1 − s²), du = −2u₀ s ds, s ∈ [0, 1]
  const xg = [-0.9739065285171717, -0.8650633666889845, -0.6794095682990244, -0.4333953941292472, -0.1488743389816312, 0.1488743389816312, 0.4333953941292472, 0.6794095682990244, 0.8650633666889845, 0.9739065285171717];
  const wg = [0.0666713443086881, 0.1494513491505806, 0.219086362515982, 0.2692667193099963, 0.2955242247147529, 0.2955242247147529, 0.2692667193099963, 0.219086362515982, 0.1494513491505806, 0.0666713443086881];
  const N = 200;
  let I = 0;
  for (let k = 0; k < N; k++) {
    const s0 = k / N;
    const s1 = (k + 1) / N;
    for (let j = 0; j < 10; j++) {
      const s = 0.5 * (s0 + s1) + 0.5 * (s1 - s0) * xg[j];
      const u = u0 * (1 - s * s);
      const g = G(u);
      I += 0.5 * (s1 - s0) * wg[j] * ((2 * u0 * s) / Math.sqrt(Math.max(g, 1e-300)));
    }
  }
  return 2 * I - Math.PI;
}

/** 4-velocidad del observador de lanzamiento elegido y su marco esférico local. */
export function launchFrame(ks: KerrSchild, pos: ArrayLike<number>, observer: 'static' | 'zamo' | 'rain' | 'circular', omega = 0) {
  const [x, y, z] = [pos[0], pos[1], pos[2]];
  let u: Vec4 | null;
  if (observer === 'static') u = staticObserver(ks, x, y, z);
  else if (observer === 'zamo') u = zamoObserver(ks, x, y, z);
  else if (observer === 'rain') u = rainObserver(ks, x, y, z);
  else u = circularObserver(ks, x, y, z, omega);
  if (!u) return null;
  return { u, tetrad: sphericalTetrad(ks, x, y, z, u) };
}

export { circularOrbitConstants };
