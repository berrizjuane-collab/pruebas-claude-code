/**
 * Schematic interior structure of a neutron star.
 *
 * HONEST DISCLAIMER: these radial profiles are *parametrised schematics* chosen
 * to be qualitatively correct (monotonic, right order of magnitude, right layer
 * ordering). They are NOT solutions of the TOV equation for a specific nuclear
 * equation of state. Where the science is genuinely uncertain (inner core), the
 * layer is flagged as hypothetical.
 */

import { G } from './constants';
import type { DerivedQuantities, StarParams } from './NeutronStarModel';

export interface Layer {
  id: string;
  name: string;
  /** Fractional radius where this layer starts (0 = centre) and ends (1 = surface). */
  rInner: number;
  rOuter: number;
  /** Approximate density at the middle of the layer [kg/m³]. */
  density: number;
  composition: string;
  /** How well-established the physics is. */
  certainty: 'established' | 'probable' | 'hypothetical';
  color: string;
}

/**
 * Canonical layer breakdown by fractional radius. Densities are representative
 * order-of-magnitude values quoted widely in the literature.
 */
export const LAYERS: Layer[] = [
  {
    id: 'atmosphere',
    name: 'Atmosphere & envelope',
    rInner: 0.999,
    rOuter: 1.0,
    density: 1e4,
    composition: 'Thin (cm-scale) plasma of H/He/C; sets the emitted spectrum.',
    certainty: 'established',
    color: '#8fd3ff',
  },
  {
    id: 'outer-crust',
    name: 'Outer crust',
    rInner: 0.98,
    rOuter: 0.999,
    density: 1e9,
    composition: 'Lattice of neutron-rich nuclei in a sea of degenerate electrons.',
    certainty: 'established',
    color: '#6fb6e8',
  },
  {
    id: 'inner-crust',
    name: 'Inner crust',
    rInner: 0.9,
    rOuter: 0.98,
    density: 5e16,
    composition: 'Neutron-rich nuclei + free (superfluid) neutrons; "nuclear pasta" near the base.',
    certainty: 'probable',
    color: '#5a86d6',
  },
  {
    id: 'outer-core',
    name: 'Outer core',
    rInner: 0.5,
    rOuter: 0.9,
    density: 5e17,
    composition: 'Superfluid neutrons + superconducting protons + electrons/muons.',
    certainty: 'probable',
    color: '#5a5fd6',
  },
  {
    id: 'inner-core',
    name: 'Inner core (hypothetical)',
    rInner: 0.0,
    rOuter: 0.5,
    density: 1e18,
    composition: 'Uncertain: hyperons, deconfined quark matter, or kaon/pion condensates?',
    certainty: 'hypothetical',
    color: '#7a4fd6',
  },
];

export interface RadialSample {
  /** Fractional radius 0..1. */
  x: number;
  /** Density [kg/m³]. */
  density: number;
  /** Pressure [Pa] (schematic). */
  pressure: number;
  /** Enclosed mass fraction 0..1. */
  massFraction: number;
  /** Local compactness 2Gm(r)/(r c²), dimensionless. */
  localCompactness: number;
}

/**
 * Produce a schematic radial profile with `n` samples from centre to surface.
 * Density falls smoothly from a central value to the surface; pressure follows a
 * polytropic-flavoured P ∝ ρ^Γ scaling; enclosed mass integrates the density.
 */
export function radialProfile(
  params: StarParams,
  derived: DerivedQuantities,
  n = 64,
): RadialSample[] {
  const rhoCentral = 3.5 * derived.meanDensity; // central density > mean
  const rhoSurface = 1e6;
  const gamma = 2.0; // effective adiabatic index for the schematic pressure

  const samples: RadialSample[] = [];
  const densities: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1); // 0 at centre, 1 at surface
    // Smooth density profile: high, roughly flat core; steep drop in the crust.
    const shape = Math.pow(1 - Math.pow(x, 2.2), 1.4);
    const density = rhoSurface + (rhoCentral - rhoSurface) * Math.max(0, shape);
    densities.push(density);
  }

  // Integrate enclosed mass ∝ ∫ ρ r² dr (spherical shells) for the mass fraction.
  let cumulative = 0;
  const shellMass: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1);
    const dm = densities[i] * x * x; // proportional; normalised below
    cumulative += dm;
    shellMass.push(cumulative);
  }
  const totalShell = cumulative || 1;

  const pCentral = 0.6 * G * derived.meanDensity * derived.meanDensity * Math.pow(params.radius, 2);

  for (let i = 0; i < n; i++) {
    const x = i / (n - 1);
    const density = densities[i];
    const massFraction = shellMass[i] / totalShell;
    const pressure = pCentral * Math.pow(density / rhoCentral, gamma);
    const mEnclosed = massFraction * params.mass;
    const rHere = Math.max(1, x * params.radius);
    const localCompactness = (2 * G * mEnclosed) / (rHere * 2.99792458e8 * 2.99792458e8);
    samples.push({ x, density, pressure, massFraction, localCompactness });
  }
  return samples;
}
