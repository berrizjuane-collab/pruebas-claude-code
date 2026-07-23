/**
 * Physical model of a (slowly-rotating, non-magnetic-back-reaction) neutron star.
 *
 * This module turns a small set of *fundamental* parameters into the full set of
 * *derived* physical quantities, all in SI units. Every function here is pure and
 * unit-tested (see NeutronStarModel.test.ts).
 *
 * IMPORTANT — scope of the model:
 *  - Gravity uses the exterior Schwarzschild metric for a static, spherical mass.
 *    This is an excellent approximation for the *exterior* of a slowly rotating
 *    neutron star, and gives an honest gravitational redshift / time dilation.
 *  - Rotation is treated at the Newtonian level for J, E_rot, oblateness and the
 *    light cylinder. For millisecond pulsars this is a documented approximation
 *    (a full treatment needs Hartle–Thorne / numerical relativity).
 *  - The interior structure (density/pressure profiles) shown elsewhere is a
 *    schematic parametrisation, NOT a solution of the Tolman–Oppenheimer–Volkoff
 *    equation for a specific nuclear equation of state. See interior.ts.
 */

import { C, C2, G, SIGMA_SB } from './constants';

/** The fundamental, user-controllable parameters of the star (SI units). */
export interface StarParams {
  /** Gravitational mass [kg]. */
  mass: number;
  /** Circumferential radius [m]. */
  radius: number;
  /** Spin frequency [Hz] (rotations per second). */
  spinFrequency: number;
  /** Surface (effective) temperature [K]. */
  temperature: number;
  /** Polar dipole magnetic field strength [T]. */
  magneticField: number;
  /** Magnetic obliquity: angle between spin and magnetic axes [radians]. */
  magneticInclination: number;
  /**
   * Dimensionless moment-of-inertia factor k in I = k M R².
   * k = 0.4 for a uniform sphere; realistic neutron stars sit around 0.35–0.45
   * depending on the equation of state.
   */
  inertiaFactor: number;
}

/** All quantities derived from {@link StarParams}. Everything SI. */
export interface DerivedQuantities {
  /** Compactness C = GM / (R c²), dimensionless. */
  compactness: number;
  /** Schwarzschild radius r_s = 2GM/c² [m]. */
  schwarzschildRadius: number;
  /** r_s / R, dimensionless (how close to a black hole; must be < 1). */
  schwarzschildRatio: number;
  /** Gravitational redshift z at the surface, dimensionless. */
  gravitationalRedshift: number;
  /** Time-dilation factor dτ/dt = sqrt(1 - r_s/R), dimensionless (0..1). */
  timeDilation: number;
  /** Angular velocity Ω = 2πf [rad/s]. */
  angularVelocity: number;
  /** Rotation period P = 1/f [s]. */
  period: number;
  /** Equatorial tangential velocity v = ΩR [m/s]. */
  equatorialVelocity: number;
  /** Equatorial velocity as a fraction of c, dimensionless. */
  equatorialBeta: number;
  /** Light-cylinder radius R_lc = c/Ω [m]. */
  lightCylinderRadius: number;
  /** Moment of inertia I ≈ k M R² [kg m²]. */
  momentOfInertia: number;
  /** Angular momentum J = IΩ [kg m²/s]. */
  angularMomentum: number;
  /** Rotational kinetic energy E_rot = ½ I Ω² [J]. */
  rotationalEnergy: number;
  /** Mean density ρ = M / (4/3 π R³) [kg/m³]. */
  meanDensity: number;
  /** Newtonian surface gravity g = GM/R² [m/s²]. */
  surfaceGravityNewtonian: number;
  /** GR-corrected surface gravity g_r = GM / (R² sqrt(1 - r_s/R)) [m/s²]. */
  surfaceGravityRelativistic: number;
  /** Magnetic-dipole spin-down luminosity Ė [W] (α = magnetic inclination). */
  spinDownLuminosity: number;
  /** Implied Ṗ from magnetic-dipole braking [s/s], dimensionless. */
  periodDerivative: number;
  /** Characteristic age τ_c = P / (2 Ṗ) [s]. */
  characteristicAge: number;
  /** Thermal (black-body) luminosity L = 4π R² σ T⁴ [W]. */
  thermalLuminosity: number;
  /** Oblateness (equatorial-polar flattening), dimensionless approximation. */
  oblateness: number;
  /** Whether the equatorial velocity exceeds a physically sane fraction of c. */
  superluminalWarning: boolean;
  /** Whether compactness approaches the Buchdahl limit (4/9 ≈ 0.444). */
  buchdahlWarning: boolean;
}

/** The Buchdahl bound on compactness for any static, causal fluid sphere. */
export const BUCHDAHL_COMPACTNESS = 4 / 9;

/**
 * Compute all derived quantities from the fundamental parameters.
 * Pure function — no side effects, safe to call every time parameters change.
 */
export function derive(p: StarParams): DerivedQuantities {
  const { mass: M, radius: R, spinFrequency: f, temperature: T } = p;

  const schwarzschildRadius = (2 * G * M) / C2;
  const compactness = (G * M) / (R * C2);
  const schwarzschildRatio = schwarzschildRadius / R;

  // Time dilation & redshift only real for R > r_s (compactness < 0.5).
  const metricTerm = 1 - schwarzschildRatio; // = 1 - 2GM/Rc²
  const timeDilation = metricTerm > 0 ? Math.sqrt(metricTerm) : 0;
  const gravitationalRedshift = metricTerm > 0 ? 1 / Math.sqrt(metricTerm) - 1 : Infinity;

  const angularVelocity = 2 * Math.PI * f;
  const period = f > 0 ? 1 / f : Infinity;
  const equatorialVelocity = angularVelocity * R;
  const equatorialBeta = equatorialVelocity / C;
  const lightCylinderRadius = angularVelocity > 0 ? C / angularVelocity : Infinity;

  const momentOfInertia = p.inertiaFactor * M * R * R;
  const angularMomentum = momentOfInertia * angularVelocity;
  const rotationalEnergy = 0.5 * momentOfInertia * angularVelocity * angularVelocity;

  const volume = (4 / 3) * Math.PI * R * R * R;
  const meanDensity = M / volume;

  const surfaceGravityNewtonian = (G * M) / (R * R);
  const surfaceGravityRelativistic =
    timeDilation > 0 ? surfaceGravityNewtonian / timeDilation : Infinity;

  // Magnetic-dipole spin-down: Ė ≈ B_p² R⁶ Ω⁴ sin²α / (6 c³)  (vacuum dipole).
  const sinA = Math.sin(p.magneticInclination);
  const spinDownLuminosity =
    (p.magneticField * p.magneticField * Math.pow(R, 6) * Math.pow(angularVelocity, 4) * sinA * sinA) /
    (6 * Math.pow(C, 3));

  // Ė = -Ω dJ/dt = -I Ω Ω̇  →  Ω̇ = -Ė/(IΩ).  Convert to Ṗ = -Ω̇/Ω · P.
  // Ṗ = 2π Ė / (I Ω²) · (1/f)  →  algebra gives Ṗ = Ė P² / (4π² I) · ... keep it simple:
  // From Ė = I Ω |Ω̇| and Ω = 2π/P, Ω̇ = -2π Ṗ / P² ⇒ Ṗ = Ė P³ / (4π² I).
  const periodDerivative =
    momentOfInertia > 0 && isFinite(period)
      ? (spinDownLuminosity * Math.pow(period, 3)) / (4 * Math.PI * Math.PI * momentOfInertia)
      : 0;
  const characteristicAge =
    periodDerivative > 0 && isFinite(period) ? period / (2 * periodDerivative) : Infinity;

  const thermalLuminosity = 4 * Math.PI * R * R * SIGMA_SB * Math.pow(T, 4);

  // Oblateness ≈ (5/4) (Ω²R³)/(GM) · ... use Maclaurin-spheroid small-rotation
  // estimate ε ≈ (Ω² R) / (2 g) — the ratio of centrifugal to gravitational
  // acceleration at the equator. Clamped for display sanity.
  const oblateness = Math.min(
    0.35,
    (angularVelocity * angularVelocity * R) / (2 * surfaceGravityNewtonian),
  );

  return {
    compactness,
    schwarzschildRadius,
    schwarzschildRatio,
    gravitationalRedshift,
    timeDilation,
    angularVelocity,
    period,
    equatorialVelocity,
    equatorialBeta,
    lightCylinderRadius,
    momentOfInertia,
    angularMomentum,
    rotationalEnergy,
    meanDensity,
    surfaceGravityNewtonian,
    surfaceGravityRelativistic,
    spinDownLuminosity,
    periodDerivative,
    characteristicAge,
    thermalLuminosity,
    oblateness,
    superluminalWarning: equatorialBeta > 0.4,
    buchdahlWarning: compactness > 0.9 * BUCHDAHL_COMPACTNESS,
  };
}

/** Hard physical limits used to clamp / warn on user input. */
export const PARAM_LIMITS = {
  mass: { min: 1.0, max: 2.3, unit: 'M☉' }, // solar masses
  radius: { min: 9, max: 15, unit: 'km' },
  spinFrequency: { min: 0.1, max: 750, unit: 'Hz' }, // up to fastest known MSPs
  temperature: { min: 1e5, max: 1e7, unit: 'K' },
  magneticField: { min: 1e6, max: 1e11, unit: 'T' }, // 1e10–1e15 G
  magneticInclination: { min: 0, max: Math.PI / 2, unit: 'rad' },
  inertiaFactor: { min: 0.3, max: 0.45, unit: '' },
} as const;

export type ParamKey = keyof typeof PARAM_LIMITS;

/** A structured warning about a parameter combination. */
export interface PhysicalWarning {
  level: 'info' | 'warn' | 'danger';
  message: string;
}

/**
 * Return human-readable scientific warnings for a parameter set — NOT generic
 * validation errors. The UI surfaces these to keep the user honest.
 */
export function warnings(_p: StarParams, d: DerivedQuantities): PhysicalWarning[] {
  const out: PhysicalWarning[] = [];
  if (d.buchdahlWarning) {
    out.push({
      level: 'danger',
      message: `Compactness ${d.compactness.toFixed(3)} approaches the Buchdahl limit (${BUCHDAHL_COMPACTNESS.toFixed(
        3,
      )}). No static fluid star can be this compact — it would collapse into a black hole.`,
    });
  }
  if (d.equatorialBeta > 0.4) {
    out.push({
      level: 'danger',
      message: `Equatorial velocity is ${(d.equatorialBeta * 100).toFixed(
        1,
      )}% of c. Real neutron stars shed mass (mass-shedding / Keplerian limit) long before this — the sub-ms spin shown is unphysical for this radius.`,
    });
  } else if (d.equatorialBeta > 0.2) {
    out.push({
      level: 'warn',
      message: `Equatorial velocity is ${(d.equatorialBeta * 100).toFixed(
        1,
      )}% of c — strong rotational effects; the slow-rotation approximations used here degrade.`,
    });
  }
  if (d.compactness > 0.3) {
    out.push({
      level: 'info',
      message: `High compactness (${d.compactness.toFixed(
        3,
      )}): light bending is strong enough that more than a full hemisphere of the surface is visible.`,
    });
  }
  return out;
}
