/**
 * Parámetros de Sagittarius A* y escalas derivadas.
 *
 * Política: solo se usan valores publicados; lo que no está medido (espín, orientación,
 * propiedades del flujo de acreción) se declara explícitamente como HIPÓTESIS DE MODELADO.
 */
import { C_SI, GM_SUN_SI, MUAS_PER_RAD, PC_SI } from './constants';

export interface ParameterSet {
  id: string;
  /** Masa en masas solares. */
  massSolar: number;
  /** Incertidumbre 1σ de la masa (estadística ⊕ sistemática, aprox.) en masas solares. */
  massSigma: number;
  /** Distancia en kpc. */
  distanceKpc: number;
  distanceSigmaKpc: number;
  label: string;
  source: string;
}

export const PARAMETER_SETS: readonly ParameterSet[] = [
  {
    id: 'nominal',
    massSolar: 4.0e6,
    massSigma: 0.3e6,
    distanceKpc: 8.2,
    distanceSigmaKpc: 0.1,
    label: 'Nominal (4,0 × 10⁶ M☉, 8,2 kpc)',
    source:
      'Valores redondeados de consenso: masa ≈ 4 × 10⁶ M☉ (EHT 2022, Paper I, a partir de órbitas estelares y del anillo) y R₀ ≈ 8,2 kpc.',
  },
  {
    id: 'gravity2022',
    massSolar: 4.297e6,
    massSigma: 0.042e6,
    distanceKpc: 8.277,
    distanceSigmaKpc: 0.034,
    label: 'GRAVITY 2022 (4,297 × 10⁶ M☉, 8,277 kpc)',
    source:
      'GRAVITY Collaboration 2022, A&A 657, L12: M = (4,297 ± 0,012 ± 0,040) × 10⁶ M☉, R₀ = 8277 ± 9 ± 33 pc.',
  },
];

/** Observaciones de referencia del EHT y otras, usadas para comparar (no como parámetros del modelo). */
export const OBSERVATIONS = {
  ehtRingDiameterMuas: { value: 51.8, sigma: 2.3, source: 'EHT Collaboration 2022, ApJL 930, L12 (Paper I): anillo de 51,8 ± 2,3 μas (68 %).' },
  ehtShadowDiameterMuas: { value: 48.7, sigma: 7.0, source: 'EHT Collaboration 2022 (Papers I y VI): diámetro de la sombra 48,7 ± 7,0 μas con priors de M y D.' },
  flux230GHzJy: { value: 2.35, sigma: 0.15, source: 'Wielgus et al. 2022, ApJL 930, L19: ≈ 2,35 Jy a 227–229 GHz (ALMA, 7 de abril de 2017); varía con la época.' },
  gravityFlares: { radiusRg: [6, 10] as const, periodMin: 45, periodSigmaMin: 15, source: 'GRAVITY Collaboration 2018, A&A 618, L10: puntos calientes a ~6–10 r_g, período 45 ± 15 min, órbita casi de cara.' },
} as const;

/** Hipótesis de modelado por defecto (NO son mediciones). */
export const MODEL_HYPOTHESES = {
  spin: 0.5,
  spinNote:
    'Hipótesis de modelado: el espín de Sgr A* no está medido. En EHT 2022 (Paper V) los modelos que superan más pruebas tienen espín prógrado (a* = 0,5 o 0,94) e inclinación ≤ 30°, pero es una inferencia dependiente de modelos GRMHD.',
  inclinationDeg: 30,
  inclinationNote:
    'Hipótesis: inclinación baja (≤ 30°) favorecida por EHT 2022 (Paper V) y compatible con la órbita casi de cara de los destellos de GRAVITY 2018.',
} as const;

/** Escalas físicas derivadas de la masa (todas en SI salvo indicación). */
export interface BlackHoleScales {
  massSolar: number;
  distanceKpc: number;
  /** 𝒢M [m³/s²]. */
  gm: number;
  /** Radio gravitacional r_g = GM/c² [m]. */
  rg: number;
  /** Radio de Schwarzschild r_s = 2GM/c² [m]. */
  rs: number;
  /** Tiempo gravitacional t_g = GM/c³ [s]. */
  tg: number;
  /** Distancia [m]. */
  distance: number;
  /** Ángulo subtendido por r_g a la distancia D [μas]. */
  thetaGMuas: number;
}

export function blackHoleScales(massSolar: number, distanceKpc: number): BlackHoleScales {
  const gm = massSolar * GM_SUN_SI;
  const rg = gm / (C_SI * C_SI);
  const distance = distanceKpc * 1e3 * PC_SI;
  return {
    massSolar,
    distanceKpc,
    gm,
    rg,
    rs: 2 * rg,
    tg: rg / C_SI,
    distance,
    thetaGMuas: (rg / distance) * MUAS_PER_RAD,
  };
}
