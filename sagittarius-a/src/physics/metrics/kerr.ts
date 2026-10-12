/**
 * Magnitudes analíticas de la solución de Kerr (unidades G = c = M = 1; a = a* ∈ [0, 1)).
 *
 * Coordenadas de Boyer–Lindquist (t, r, θ, φ):
 *   Σ = r² + a² cos²θ,  Δ = r² − 2r + a²,  A = (r² + a²)² − a² Δ sin²θ
 *   ds² = −(1 − 2r/Σ) dt² − (4 a r sin²θ/Σ) dt dφ + (Σ/Δ) dr² + Σ dθ² + (A sin²θ/Σ) dφ²
 *
 * Referencias: Boyer & Lindquist 1967; Bardeen, Press & Teukolsky 1972 (BPT, órbitas circulares,
 * ISCO, ZAMO); Bardeen 1973 (sombra); Chandrasekhar 1983; Teo 2003 (órbitas fotónicas esféricas).
 */

export interface Horizons {
  rPlus: number;
  rMinus: number;
}

export function horizons(a: number): Horizons {
  const s = Math.sqrt(Math.max(0, 1 - a * a));
  return { rPlus: 1 + s, rMinus: 1 - s };
}

/** Velocidad angular del horizonte Ω_H = a / (r₊² + a²). */
export function horizonAngularVelocity(a: number): number {
  const { rPlus } = horizons(a);
  return a / (rPlus * rPlus + a * a);
}

/** Gravedad superficial κ = (r₊ − r₋) / (2 (r₊² + a²)). Para a = 0, κ = 1/4. */
export function surfaceGravity(a: number): number {
  const { rPlus, rMinus } = horizons(a);
  return (rPlus - rMinus) / (2 * (rPlus * rPlus + a * a));
}

/** Límite estático (frontera exterior de la ergosfera): r_E(θ) = 1 + √(1 − a² cos²θ). */
export function ergosphereRadius(a: number, theta: number): number {
  const c = Math.cos(theta);
  return 1 + Math.sqrt(Math.max(0, 1 - a * a * c * c));
}

/** Órbita circular fotónica ecuatorial (BPT): r = 2[1 + cos(⅔ arccos(∓a))], signo superior prógrado. */
export function photonOrbitRadius(a: number, prograde: boolean): number {
  const s = prograde ? -a : a;
  return 2 * (1 + Math.cos((2 / 3) * Math.acos(s)));
}

/** Parámetro de impacto crítico de fotones ecuatoriales |L/E| (captura si b < b_c). */
export function criticalImpactParameter(a: number, prograde: boolean): number {
  return prograde ? -a + 6 * Math.cos(Math.acos(-a) / 3) : a + 6 * Math.cos(Math.acos(a) / 3);
}

/** ISCO (Bardeen, Press & Teukolsky 1972). Signo superior prógrado. */
export function iscoRadius(a: number, prograde: boolean): number {
  const z1 = 1 + Math.cbrt(1 - a * a) * (Math.cbrt(1 + a) + Math.cbrt(1 - a));
  const z2 = Math.sqrt(3 * a * a + z1 * z1);
  const root = Math.sqrt((3 - z1) * (3 + z1 + 2 * z2));
  return prograde ? 3 + z2 - root : 3 + z2 + root;
}

/** Órbita circular marginalmente ligada (E = 1): r_mb = 2 ∓ a + 2√(1 ∓ a). */
export function marginallyBoundRadius(a: number, prograde: boolean): number {
  const s = prograde ? a : -a;
  return 2 - s + 2 * Math.sqrt(1 - s);
}

/** Velocidad angular kepleriana ecuatorial dφ/dt = ±1/(r^{3/2} ± a). */
export function keplerOmega(r: number, a: number, prograde: boolean): number {
  const r32 = r * Math.sqrt(r);
  return prograde ? 1 / (r32 + a) : -1 / (r32 - a);
}

/** Energía y momento angular específicos de la órbita circular ecuatorial (BPT 1972). */
export function circularOrbitConstants(r: number, a: number, prograde: boolean): { E: number; L: number } {
  const sr = Math.sqrt(r);
  const r32 = r * sr;
  const r34 = Math.sqrt(r32);
  const s = prograde ? 1 : -1;
  const den = r34 * Math.sqrt(r32 - 3 * sr + 2 * s * a);
  const E = (r32 - 2 * sr + s * a) / den;
  const L = (s * (r * r - 2 * s * a * sr + a * a)) / den;
  return { E, L };
}

/** ¿Existe órbita circular (temporal) en r? Requiere r > r_ph. */
export function circularOrbitExists(r: number, a: number, prograde: boolean): boolean {
  return r > photonOrbitRadius(a, prograde) * (1 + 1e-12);
}

export function sigma(r: number, theta: number, a: number): number {
  const c = Math.cos(theta);
  return r * r + a * a * c * c;
}

export function delta(r: number, a: number): number {
  return r * r - 2 * r + a * a;
}

export function bigA(r: number, theta: number, a: number): number {
  const s = Math.sin(theta);
  const r2a2 = r * r + a * a;
  return r2a2 * r2a2 - a * a * delta(r, a) * s * s;
}

/** Componentes covariantes de Boyer–Lindquist no nulas. */
export interface BLMetric {
  tt: number;
  tphi: number;
  phiphi: number;
  rr: number;
  thth: number;
}

export function blMetric(r: number, theta: number, a: number): BLMetric {
  const S = sigma(r, theta, a);
  const D = delta(r, a);
  const s2 = Math.sin(theta) ** 2;
  return {
    tt: -(1 - (2 * r) / S),
    tphi: (-2 * a * r * s2) / S,
    phiphi: (bigA(r, theta, a) * s2) / S,
    rr: S / D,
    thth: S,
  };
}

/** Componentes contravariantes de Boyer–Lindquist no nulas. */
export function blInverseMetric(r: number, theta: number, a: number): BLMetric {
  const S = sigma(r, theta, a);
  const D = delta(r, a);
  const s2 = Math.sin(theta) ** 2;
  const A = bigA(r, theta, a);
  return {
    tt: -A / (S * D),
    tphi: (-2 * a * r) / (S * D),
    phiphi: (D - a * a * s2) / (S * D * s2),
    rr: D / S,
    thth: 1 / S,
  };
}

/** Velocidad angular de arrastre (ZAMO): ω = −g_tφ/g_φφ = 2 a r / A. */
export function zamoOmega(r: number, theta: number, a: number): number {
  return (2 * a * r) / bigA(r, theta, a);
}

/** Función lapso de los ZAMO: α = √(ΣΔ/A) (solo fuera del horizonte). */
export function lapse(r: number, theta: number, a: number): number {
  return Math.sqrt((sigma(r, theta, a) * delta(r, a)) / bigA(r, theta, a));
}

/** Ψ₂ = −1/(r − i a cosθ)³ (tétrada de Kinnersley). Devuelve [Re, Im]. */
export function psi2(r: number, theta: number, a: number): [number, number] {
  // 1/(r − i y)³ con y = a cosθ:  (r + i y)³ / (r² + y²)³
  const y = a * Math.cos(theta);
  const d = r * r + y * y;
  const d3 = d * d * d;
  const re3 = r * r * r - 3 * r * y * y; // Re (r + i y)³
  const im3 = 3 * r * r * y - y * y * y; // Im (r + i y)³
  return [-re3 / d3, -im3 / d3];
}

/**
 * Escalar de Kretschmann K = R_abcd R^abcd = 48 Re(Ψ₂²)
 *   = 48 (r⁶ − 15 r⁴ a²c² + 15 r² a⁴c⁴ − a⁶c⁶) / (r² + a²c²)⁶ (en unidades de M⁻⁴).
 */
export function kretschmann(r: number, theta: number, a: number): number {
  const ac = a * Math.cos(theta);
  const r2 = r * r;
  const y2 = ac * ac;
  const num = r2 * r2 * r2 - 15 * r2 * r2 * y2 + 15 * r2 * y2 * y2 - y2 * y2 * y2;
  const den = (r2 + y2) ** 6;
  return (48 * num) / den;
}

/** Potencial radial R(r) = [E(r²+a²) − aL]² − Δ[μ² r² + (L − aE)² + Q]. */
export function radialPotential(r: number, a: number, E: number, L: number, Q: number, mu2: number): number {
  const P = E * (r * r + a * a) - a * L;
  const lae = L - a * E;
  return P * P - delta(r, a) * (mu2 * r * r + lae * lae + Q);
}

/** Potencial polar Θ(θ) = Q − cos²θ [a²(μ² − E²) + L²/sin²θ]. */
export function polarPotential(theta: number, a: number, E: number, L: number, Q: number, mu2: number): number {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return Q - c * c * (a * a * (mu2 - E * E) + (L * L) / (s * s));
}

/**
 * Órbitas fotónicas esféricas (Teo 2003): para r ∈ [r_ph⁺, r_ph⁻],
 *   ξ = L/E = −(r³ − 3r² + a²r + a²)/(a(r − 1)),  η = Q/E² = −r³(r³ − 6r² + 9r − 4a²)/(a²(r − 1)²).
 */
export function sphericalPhotonOrbit(r: number, a: number): { xi: number; eta: number } {
  const xi = -(r * r * r - 3 * r * r + a * a * r + a * a) / (a * (r - 1));
  const eta = -(r * r * r * (r * r * r - 6 * r * r + 9 * r - 4 * a * a)) / (a * a * (r - 1) * (r - 1));
  return { xi, eta };
}

/**
 * Contorno de la sombra (Bardeen 1973) para un observador lejano a inclinación θ_o (desde el eje
 * de espín). Coordenadas de impacto en el cielo: α perpendicular a la proyección del eje, β paralela.
 * Para a → 0 se usa el círculo de radio √27.
 */
export function shadowBoundary(a: number, thetaObs: number, samples = 720): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  if (a < 1e-6) {
    const R = Math.sqrt(27);
    for (let i = 0; i < samples; i++) {
      const ph = (2 * Math.PI * i) / samples;
      pts.push([R * Math.cos(ph), R * Math.sin(ph)]);
    }
    return pts;
  }
  const r1 = photonOrbitRadius(a, true);
  const r2 = photonOrbitRadius(a, false);
  const so = Math.sin(thetaObs);
  const co = Math.cos(thetaObs);
  const upper: Array<[number, number]> = [];
  const lower: Array<[number, number]> = [];
  const n = Math.floor(samples / 2);
  for (let i = 0; i <= n; i++) {
    // Muestreo denso cerca de los extremos (donde β → 0).
    const u = 0.5 - 0.5 * Math.cos((Math.PI * i) / n);
    const r = r1 + (r2 - r1) * u;
    const { xi, eta } = sphericalPhotonOrbit(r, a);
    const b2 = eta + a * a * co * co - (xi * xi * co * co) / (so * so);
    if (b2 < 0) continue;
    const alpha = -xi / so;
    const beta = Math.sqrt(b2);
    upper.push([alpha, beta]);
    lower.push([alpha, -beta]);
  }
  for (const p of upper) pts.push(p);
  for (let i = lower.length - 1; i >= 0; i--) pts.push(lower[i]);
  return pts;
}

/**
 * Diferencias de coordenadas Kerr–Schild entrantes − Boyer–Lindquist (fuera del horizonte):
 *   t_KS = t_BL + h(r),  h'(r) = 2r/Δ;   φ̃ = φ_BL + k(r),  k'(r) = a/Δ.
 */
export function ksMinusBL(r: number, a: number): { h: number; k: number } {
  if (a < 1e-12) {
    return { h: 2 * Math.log(Math.abs(r / 2 - 1)), k: 0 };
  }
  const { rPlus, rMinus } = horizons(a);
  const dr = rPlus - rMinus;
  const h = ((2 * rPlus) / dr) * Math.log(Math.abs(r - rPlus)) - ((2 * rMinus) / dr) * Math.log(Math.abs(r - rMinus));
  const k = (a / dr) * Math.log(Math.abs((r - rPlus) / (r - rMinus)));
  return { h, k };
}
