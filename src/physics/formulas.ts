/**
 * The interactive formula catalogue.
 *
 * Each entry pairs a rendered LaTeX expression with an evaluator that reads the
 * *current* model and returns the numeric value + unit. This is what makes the
 * maths panel live: change a parameter, and every derived number updates.
 *
 * `approximation` flags formulas that are deliberately simplified so the UI can
 * mark them honestly.
 */

import { C, G } from './constants';
import { fmt, sci, toGauss } from './units';
import type { DerivedQuantities, StarParams } from './NeutronStarModel';

export interface FormulaContext {
  params: StarParams;
  derived: DerivedQuantities;
}

export interface Formula {
  id: string;
  /** Short human name. */
  name: string;
  /** KaTeX source for the symbolic form. */
  latex: string;
  /** One-line physical meaning. */
  meaning: string;
  /** Variable glossary (symbol → description). */
  variables: Array<{ sym: string; desc: string }>;
  /** Compute the current numeric value + unit for display. */
  evaluate: (ctx: FormulaContext) => { value: string; unit: string; note?: string };
  /** True when the formula is an approximation and should be flagged. */
  approximation?: boolean;
  /** Grouping for the UI. */
  group: 'gravity' | 'rotation' | 'magnetic' | 'structure';
}

export const FORMULAS: Formula[] = [
  // ── Gravity / relativity ──────────────────────────────────────────────
  {
    id: 'compactness',
    name: 'Compactness',
    latex: 'C = \\dfrac{GM}{R c^2}',
    meaning: 'How close the star is to being a black hole (a black hole horizon has C = ½).',
    variables: [
      { sym: 'G', desc: 'gravitational constant' },
      { sym: 'M', desc: 'stellar mass' },
      { sym: 'R', desc: 'stellar radius' },
      { sym: 'c', desc: 'speed of light' },
    ],
    group: 'gravity',
    evaluate: ({ derived }) => ({ value: fmt(derived.compactness), unit: '' }),
  },
  {
    id: 'schwarzschild',
    name: 'Schwarzschild radius',
    latex: 'r_s = \\dfrac{2GM}{c^2}',
    meaning: 'The horizon radius the mass would have if it were a black hole. The star stays above it.',
    variables: [
      { sym: 'M', desc: 'stellar mass' },
      { sym: 'c', desc: 'speed of light' },
    ],
    group: 'gravity',
    evaluate: ({ derived }) => ({ value: fmt(derived.schwarzschildRadius / 1e3), unit: 'km' }),
  },
  {
    id: 'schwarzschild-ratio',
    name: 'Horizon ratio',
    latex: '\\dfrac{r_s}{R}',
    meaning: 'Fraction of the star radius occupied by the would-be horizon. Must stay below 1.',
    variables: [
      { sym: 'r_s', desc: 'Schwarzschild radius' },
      { sym: 'R', desc: 'stellar radius' },
    ],
    group: 'gravity',
    evaluate: ({ derived }) => ({ value: fmt(derived.schwarzschildRatio), unit: '' }),
  },
  {
    id: 'redshift',
    name: 'Gravitational redshift',
    latex: 'z = \\left(1 - \\dfrac{2GM}{Rc^2}\\right)^{-1/2} - 1',
    meaning: 'Light leaving the surface is stretched to longer wavelengths by this factor.',
    variables: [
      { sym: 'M', desc: 'stellar mass' },
      { sym: 'R', desc: 'stellar radius' },
    ],
    group: 'gravity',
    evaluate: ({ derived }) => ({ value: fmt(derived.gravitationalRedshift), unit: '' }),
  },
  {
    id: 'time-dilation',
    name: 'Gravitational time dilation',
    latex: '\\dfrac{d\\tau}{dt} = \\sqrt{1 - \\dfrac{2GM}{Rc^2}}',
    meaning: 'Clocks on the surface tick this much slower than a clock far away.',
    variables: [
      { sym: 'd\\tau', desc: 'proper time at the surface' },
      { sym: 'dt', desc: 'coordinate time far away' },
    ],
    group: 'gravity',
    evaluate: ({ derived }) => ({ value: fmt(derived.timeDilation), unit: '' }),
  },
  {
    id: 'gravity-newton',
    name: 'Surface gravity (Newtonian)',
    latex: 'g = \\dfrac{GM}{R^2}',
    meaning: 'Newtonian surface gravitational acceleration — a lower bound on the real value.',
    variables: [
      { sym: 'M', desc: 'stellar mass' },
      { sym: 'R', desc: 'stellar radius' },
    ],
    group: 'gravity',
    approximation: true,
    evaluate: ({ derived }) => ({ value: sci(derived.surfaceGravityNewtonian), unit: 'm/s²' }),
  },
  {
    id: 'gravity-gr',
    name: 'Surface gravity (GR-corrected)',
    latex: 'g_r = \\dfrac{GM}{R^2\\sqrt{1 - \\dfrac{2GM}{Rc^2}}}',
    meaning: 'The proper surface gravity including the relativistic correction factor.',
    variables: [{ sym: 'g_r', desc: 'locally measured surface gravity' }],
    group: 'gravity',
    evaluate: ({ derived }) => ({ value: sci(derived.surfaceGravityRelativistic), unit: 'm/s²' }),
  },
  // ── Rotation ──────────────────────────────────────────────────────────
  {
    id: 'angular-velocity',
    name: 'Angular velocity',
    latex: '\\Omega = 2\\pi f',
    meaning: 'Rotation rate in radians per second.',
    variables: [{ sym: 'f', desc: 'spin frequency [Hz]' }],
    group: 'rotation',
    evaluate: ({ derived }) => ({ value: fmt(derived.angularVelocity), unit: 'rad/s' }),
  },
  {
    id: 'period',
    name: 'Rotation period',
    latex: 'P = \\dfrac{1}{f}',
    meaning: 'Time for one full rotation.',
    variables: [{ sym: 'f', desc: 'spin frequency [Hz]' }],
    group: 'rotation',
    evaluate: ({ derived }) => {
      const ms = derived.period * 1e3;
      return ms < 1000
        ? { value: fmt(ms), unit: 'ms' }
        : { value: fmt(derived.period), unit: 's' };
    },
  },
  {
    id: 'tangential-velocity',
    name: 'Equatorial velocity',
    latex: 'v = \\Omega R',
    meaning: 'Surface speed at the equator; compared with c it measures rotational extremity.',
    variables: [
      { sym: '\\Omega', desc: 'angular velocity' },
      { sym: 'R', desc: 'stellar radius' },
    ],
    group: 'rotation',
    evaluate: ({ derived }) => ({
      value: sci(derived.equatorialVelocity),
      unit: 'm/s',
      note: `β = v/c = ${fmt(derived.equatorialBeta)}`,
    }),
  },
  {
    id: 'light-cylinder',
    name: 'Light-cylinder radius',
    latex: 'R_{lc} = \\dfrac{c}{\\Omega}',
    meaning: 'Radius where co-rotation would reach light speed; the magnetosphere opens up here.',
    variables: [
      { sym: 'c', desc: 'speed of light' },
      { sym: '\\Omega', desc: 'angular velocity' },
    ],
    group: 'rotation',
    evaluate: ({ derived }) => ({ value: sci(derived.lightCylinderRadius / 1e3), unit: 'km' }),
  },
  {
    id: 'moment-of-inertia',
    name: 'Moment of inertia',
    latex: 'I \\approx k\\, M R^2',
    meaning: 'Resistance to changes in spin. k depends on the internal mass distribution and equation of state.',
    variables: [
      { sym: 'k', desc: 'structure factor (~0.4)' },
      { sym: 'M', desc: 'stellar mass' },
      { sym: 'R', desc: 'stellar radius' },
    ],
    group: 'rotation',
    approximation: true,
    evaluate: ({ params, derived }) => ({
      value: sci(derived.momentOfInertia),
      unit: 'kg·m²',
      note: `k = ${params.inertiaFactor.toFixed(2)}`,
    }),
  },
  {
    id: 'angular-momentum',
    name: 'Angular momentum',
    latex: 'J = I\\Omega',
    meaning: 'Total spin angular momentum stored in the star.',
    variables: [
      { sym: 'I', desc: 'moment of inertia' },
      { sym: '\\Omega', desc: 'angular velocity' },
    ],
    group: 'rotation',
    evaluate: ({ derived }) => ({ value: sci(derived.angularMomentum), unit: 'kg·m²/s' }),
  },
  {
    id: 'rotational-energy',
    name: 'Rotational kinetic energy',
    latex: 'E_{rot} = \\tfrac{1}{2} I \\Omega^2',
    meaning: 'Energy stored in rotation — the reservoir that powers a pulsar as it spins down.',
    variables: [
      { sym: 'I', desc: 'moment of inertia' },
      { sym: '\\Omega', desc: 'angular velocity' },
    ],
    group: 'rotation',
    evaluate: ({ derived }) => ({ value: sci(derived.rotationalEnergy), unit: 'J' }),
  },
  // ── Magnetic ──────────────────────────────────────────────────────────
  {
    id: 'dipole-field',
    name: 'Dipole field magnitude',
    latex: 'B(r,\\theta) \\propto B_p\\left(\\dfrac{R}{r}\\right)^3\\sqrt{1 + 3\\cos^2\\theta}',
    meaning: 'A magnetic dipole falls off as 1/r³ and is twice as strong at the poles as the equator.',
    variables: [
      { sym: 'B_p', desc: 'polar surface field' },
      { sym: 'r', desc: 'distance from centre' },
      { sym: '\\theta', desc: 'magnetic colatitude' },
    ],
    group: 'magnetic',
    evaluate: ({ params }) => ({
      value: sci(toGauss(params.magneticField)),
      unit: 'G',
      note: `${sci(params.magneticField)} T at the pole`,
    }),
  },
  {
    id: 'spin-down',
    name: 'Magnetic-dipole spin-down',
    latex: '\\dot{E} \\approx \\dfrac{B_p^2 R^6 \\Omega^4 \\sin^2\\alpha}{6c^3}',
    meaning: 'A rotating oblique magnet radiates electromagnetic energy, slowing the star down.',
    variables: [
      { sym: 'B_p', desc: 'polar field' },
      { sym: 'R', desc: 'radius' },
      { sym: '\\Omega', desc: 'angular velocity' },
      { sym: '\\alpha', desc: 'magnetic obliquity' },
    ],
    group: 'magnetic',
    approximation: true,
    evaluate: ({ derived }) => ({ value: sci(derived.spinDownLuminosity), unit: 'W' }),
  },
  {
    id: 'characteristic-age',
    name: 'Characteristic age',
    latex: '\\tau_c \\approx \\dfrac{P}{2\\dot{P}}',
    meaning: 'A rough spin-down age of the pulsar, assuming pure magnetic-dipole braking.',
    variables: [
      { sym: 'P', desc: 'period' },
      { sym: '\\dot{P}', desc: 'period derivative' },
    ],
    group: 'magnetic',
    approximation: true,
    evaluate: ({ derived }) => {
      if (!isFinite(derived.characteristicAge)) return { value: '∞', unit: '' };
      const years = derived.characteristicAge / (3.156e7);
      return { value: sci(years), unit: 'yr' };
    },
  },
  // ── Structure ─────────────────────────────────────────────────────────
  {
    id: 'mean-density',
    name: 'Mean density',
    latex: '\\rho = \\dfrac{M}{\\tfrac{4}{3}\\pi R^3}',
    meaning: 'Average density — comparable to or exceeding that of an atomic nucleus (~2.7×10¹⁷ kg/m³).',
    variables: [
      { sym: 'M', desc: 'stellar mass' },
      { sym: 'R', desc: 'stellar radius' },
    ],
    group: 'structure',
    evaluate: ({ derived }) => ({ value: sci(derived.meanDensity), unit: 'kg/m³' }),
  },
  {
    id: 'thermal-luminosity',
    name: 'Thermal luminosity',
    latex: 'L = 4\\pi R^2 \\sigma T^4',
    meaning: 'Black-body luminosity of the hot surface — mostly emitted as soft X-rays.',
    variables: [
      { sym: 'R', desc: 'radius' },
      { sym: '\\sigma', desc: 'Stefan–Boltzmann constant' },
      { sym: 'T', desc: 'surface temperature' },
    ],
    group: 'structure',
    evaluate: ({ derived }) => ({ value: sci(derived.thermalLuminosity), unit: 'W' }),
  },
  {
    id: 'tov',
    name: 'Tolman–Oppenheimer–Volkoff equation',
    latex:
      '\\dfrac{dP}{dr} = -\\dfrac{G\\left(\\rho + \\tfrac{P}{c^2}\\right)\\left(m + 4\\pi r^3 \\tfrac{P}{c^2}\\right)}{r^2\\left(1 - \\tfrac{2Gm}{rc^2}\\right)}',
    meaning:
      'The relativistic equation of hydrostatic equilibrium. Pressure itself gravitates, so a Newtonian model underestimates the pressure needed to support the star. Solving it requires a nuclear equation of state — this app does NOT solve it in real time; the interior view is schematic.',
    variables: [
      { sym: 'P', desc: 'pressure' },
      { sym: 'r', desc: 'radial coordinate' },
      { sym: '\\rho', desc: 'mass-energy density' },
      { sym: 'm', desc: 'mass enclosed within r' },
    ],
    group: 'structure',
    approximation: true,
    evaluate: () => ({ value: '—', unit: '', note: 'not solved in real time' }),
  },
];

/** Group headings for the maths panel. */
export const FORMULA_GROUPS: Record<Formula['group'], string> = {
  gravity: 'Gravity & relativity',
  rotation: 'Rotation',
  magnetic: 'Magnetic field & spin-down',
  structure: 'Structure',
};

// Keep an explicit reference so tree-shaking never drops the raw constants that
// some external tooling (tests, docs) reads via re-export.
export const REFERENCED_CONSTANTS = { C, G } as const;
