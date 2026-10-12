/**
 * Cambios de coordenadas entre Kerr–Schild cartesianas (t, x, y, z), Kerr–Schild esferoidales
 * (t, r, θ, φ̃) — las «coordenadas de Kerr entrantes» con t = v − r — y Boyer–Lindquist.
 *
 *   x = (r cos φ̃ − a sin φ̃) sinθ,   y = (r sin φ̃ + a cos φ̃) sinθ,   z = r cosθ
 *   t_KS = t_BL + h(r),  φ̃ = φ_BL + k(r)   con h' = 2r/Δ, k' = a/Δ.
 *
 * Inversa de la métrica en Kerr–Schild esferoidales (regular en Δ = 0):
 *   g^tt = −(1 + 2r/Σ), g^tr = 2r/Σ, g^rr = Δ/Σ, g^rφ = a/Σ, g^θθ = 1/Σ, g^φφ = 1/(Σ sin²θ).
 */
import { delta, sigma } from './kerr';
import { ksRadius } from './kerrSchild';

export interface Spheroidal {
  r: number;
  theta: number;
  phi: number;
}

export function cartesianFromSpheroidal(r: number, theta: number, phi: number, a: number): [number, number, number] {
  const st = Math.sin(theta);
  const cp = Math.cos(phi);
  const sp = Math.sin(phi);
  return [(r * cp - a * sp) * st, (r * sp + a * cp) * st, r * Math.cos(theta)];
}

export function spheroidalFromCartesian(x: number, y: number, z: number, a: number): Spheroidal {
  const r = ksRadius(x, y, z, a);
  const ct = r > 0 ? Math.max(-1, Math.min(1, z / r)) : 0;
  const theta = Math.acos(ct);
  const phi = Math.atan2(y, x) - Math.atan2(a, r);
  return { r, theta, phi };
}

/**
 * Jacobiano ∂(x, y, z)/∂(r, θ, φ̃) por filas: J[3 i + j] = ∂x_i/∂q_j con q = (r, θ, φ̃).
 */
export function jacobianCartesianSpheroidal(r: number, theta: number, phi: number, a: number): Float64Array {
  const st = Math.sin(theta);
  const ct = Math.cos(theta);
  const cp = Math.cos(phi);
  const sp = Math.sin(phi);
  const J = new Float64Array(9);
  J[0] = cp * st;
  J[1] = (r * cp - a * sp) * ct;
  J[2] = (-r * sp - a * cp) * st;
  J[3] = sp * st;
  J[4] = (r * sp + a * cp) * ct;
  J[5] = (r * cp - a * sp) * st;
  J[6] = ct;
  J[7] = -r * st;
  J[8] = 0;
  return J;
}

/**
 * Gradientes ∂r/∂x_i, ∂θ/∂x_i, ∂φ̃/∂x_i en (x, y, z) (filas de la inversa del jacobiano).
 * Devuelve [dr(3), dθ(3), dφ(3)].
 */
export function spheroidalGradients(x: number, y: number, z: number, a: number): Float64Array {
  const r = ksRadius(x, y, z, a);
  const r2 = r * r;
  const D = r2 * r2 + a * a * z * z;
  const S = r2 + a * a;
  const out = new Float64Array(9);
  const drx = (r2 * r * x) / D;
  const dry = (r2 * r * y) / D;
  const drz = (r * S * z) / D;
  out[0] = drx;
  out[1] = dry;
  out[2] = drz;
  // θ = acos(z/r): ∂θ = −(1/sinθ) (r δ_iz − z r_i)/r²
  const ct = z / r;
  const st = Math.sqrt(Math.max(1e-300, 1 - ct * ct));
  out[3] = (-1 / st) * ((-z * drx) / r2);
  out[4] = (-1 / st) * ((-z * dry) / r2);
  out[5] = (-1 / st) * ((r - z * drz) / r2);
  // φ̃ = atan2(y, x) − atan2(a, r):  ∂φ̃ = ∂atan2(y,x) + a r_i/(r² + a²)
  const rc2 = x * x + y * y;
  out[6] = -y / rc2 + (a * drx) / S;
  out[7] = x / rc2 + (a * dry) / S;
  out[8] = (a * drz) / S;
  return out;
}

/** Covector en KS esferoidales (p_t, p_r, p_θ, p_φ) → cartesianas (p_t, p_x, p_y, p_z). */
export function covectorSpheroidalToCartesian(
  x: number,
  y: number,
  z: number,
  a: number,
  pt: number,
  pr: number,
  pth: number,
  pph: number,
): Float64Array {
  const G = spheroidalGradients(x, y, z, a);
  const out = new Float64Array(4);
  out[0] = pt;
  for (let i = 0; i < 3; i++) out[1 + i] = pr * G[i] + pth * G[3 + i] + pph * G[6 + i];
  return out;
}

/** Covector cartesiano (p_t, p_x, p_y, p_z) → KS esferoidales (p_t, p_r, p_θ, p_φ̃). */
export function covectorCartesianToSpheroidal(
  r: number,
  theta: number,
  phi: number,
  a: number,
  p: ArrayLike<number>,
): [number, number, number, number] {
  const J = jacobianCartesianSpheroidal(r, theta, phi, a);
  const pr = p[1] * J[0] + p[2] * J[3] + p[3] * J[6];
  const pth = p[1] * J[1] + p[2] * J[4] + p[3] * J[7];
  const pph = p[1] * J[2] + p[2] * J[5] + p[3] * J[8];
  return [p[0], pr, pth, pph];
}

/** Vector contravariante en KS esferoidales (u^t, u^r, u^θ, u^φ̃) → cartesianas. */
export function vectorSpheroidalToCartesian(
  r: number,
  theta: number,
  phi: number,
  a: number,
  ut: number,
  ur: number,
  uth: number,
  uph: number,
): Float64Array {
  const J = jacobianCartesianSpheroidal(r, theta, phi, a);
  const out = new Float64Array(4);
  out[0] = ut;
  for (let i = 0; i < 3; i++) out[1 + i] = J[3 * i] * ur + J[3 * i + 1] * uth + J[3 * i + 2] * uph;
  return out;
}

/**
 * Componente radial covariante en KS de una geodésica entrante (o de un campo de velocidades)
 * con u_t, u_θ, u_φ dados, resolviendo g^μν u_μ u_ν = −μ² con la raíz regular en Δ = 0:
 *   Δ u_r² + 2B u_r + C = 0,  B = 2r u_t + a u_φ,  C = μ²Σ − (Σ + 2r) u_t² + u_θ² + u_φ²/sin²θ
 *   u_r = C / (√(B² − ΔC) − B)
 * Devuelve NaN si no hay solución real (no existe tal movimiento en ese punto).
 */
export function regularInfallUr(
  r: number,
  theta: number,
  a: number,
  ut: number,
  uth: number,
  uph: number,
  mu2: number,
): number {
  const S = sigma(r, theta, a);
  const D = delta(r, a);
  const s = Math.sin(theta);
  const B = 2 * r * ut + a * uph;
  const C = mu2 * S - (S + 2 * r) * ut * ut + uth * uth + (uph * uph) / (s * s);
  const disc = B * B - D * C;
  if (disc < 0) return NaN;
  const den = Math.sqrt(disc) - B;
  return C / den;
}

/** Inversa de la métrica en KS esferoidales: [tt, tr, rr, rφ, θθ, φφ]. */
export function ksSpheroidalInverse(r: number, theta: number, a: number): Float64Array {
  const S = sigma(r, theta, a);
  const s = Math.sin(theta);
  return Float64Array.of(-(1 + (2 * r) / S), (2 * r) / S, delta(r, a) / S, a / S, 1 / S, 1 / (S * s * s));
}
