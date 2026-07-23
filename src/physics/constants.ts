/**
 * Physical constants in SI units (CODATA-2018 rounded to sufficient precision).
 *
 * Everything in the physics layer works in SI (kg, m, s, T, K, W, rad/s).
 * Conversions to "human" units (solar masses, km, ms, Gauss…) live in units.ts.
 * The rendering layer never sees SI directly — it receives a normalized model.
 */

/** Newtonian gravitational constant [m^3 kg^-1 s^-2]. */
export const G = 6.6743e-11;

/** Speed of light in vacuum [m/s]. */
export const C = 2.99792458e8;

/** c squared, precomputed [m^2/s^2]. */
export const C2 = C * C;

/** Solar mass [kg]. */
export const M_SUN = 1.98892e30;

/** Solar radius [m] (for reference only). */
export const R_SUN = 6.957e8;

/** Stefan–Boltzmann constant [W m^-2 K^-4]. */
export const SIGMA_SB = 5.670374419e-8;

/** Boltzmann constant [J/K]. */
export const K_B = 1.380649e-23;

/** 1 Tesla in Gauss. */
export const GAUSS_PER_TESLA = 1e4;

/** Nuclear saturation density (approx.) [kg/m^3] — reference for "densidad nuclear". */
export const RHO_NUCLEAR = 2.7e17;

/** Kilometre in metres. */
export const KM = 1e3;

/** Seconds ↔ milliseconds. */
export const MS = 1e-3;
