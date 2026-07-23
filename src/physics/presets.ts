/**
 * Scientific presets: representative neutron-star classes with realistic
 * parameters and a short educational description. Values are order-of-magnitude
 * representative of each class rather than tied to one specific catalogued object.
 */

import { fromKm, fromSolarMasses } from './units';
import type { StarParams } from './NeutronStarModel';

export interface Preset {
  id: string;
  name: string;
  tagline: string;
  description: string;
  params: StarParams;
}

const deg = (d: number): number => (d * Math.PI) / 180;

export const PRESETS: Preset[] = [
  {
    id: 'canonical',
    name: 'Canonical neutron star',
    tagline: '1.4 M☉ · 12 km · slow rotator',
    description:
      'The textbook neutron star: ~1.4 solar masses packed into a 12 km sphere, spinning a few times per second with a "normal" 10⁸ T (10¹² G) field. Densities in the core exceed that of an atomic nucleus.',
    params: {
      mass: fromSolarMasses(1.4),
      radius: fromKm(12),
      spinFrequency: 2.0,
      temperature: 8e5,
      magneticField: 1e8,
      magneticInclination: deg(30),
      inertiaFactor: 0.4,
    },
  },
  {
    id: 'young-pulsar',
    name: 'Young pulsar',
    tagline: 'Fast spin · bright beams · Crab-like',
    description:
      'A hot, energetic young pulsar (think Crab). It spins tens of times per second, drives a bright magnetosphere, and loses rotational energy rapidly to magnetic-dipole radiation and a surrounding wind nebula.',
    params: {
      mass: fromSolarMasses(1.4),
      radius: fromKm(12),
      spinFrequency: 30,
      temperature: 1.5e6,
      magneticField: 4e8,
      magneticInclination: deg(55),
      inertiaFactor: 0.4,
    },
  },
  {
    id: 'millisecond',
    name: 'Millisecond pulsar',
    tagline: 'Hundreds of Hz · recycled · low field',
    description:
      'A "recycled" pulsar spun up by accretion from a companion to hundreds of rotations per second, with a comparatively weak field (~10⁴–10⁵ T). Its spin is so fast that direct real-time viewing needs the educational slow-motion mode.',
    params: {
      mass: fromSolarMasses(1.6),
      radius: fromKm(11),
      spinFrequency: 320,
      temperature: 5e5,
      magneticField: 1e5,
      magneticInclination: deg(20),
      inertiaFactor: 0.4,
    },
  },
  {
    id: 'magnetar',
    name: 'Magnetar',
    tagline: 'Extreme field · slow spin · active crust',
    description:
      'A neutron star with an almost unimaginable magnetic field (10¹⁰–10¹¹ T / 10¹⁴–10¹⁵ G). Field decay powers X-ray and gamma-ray bursts, and the twisting field can fracture the crust in "starquakes". It rotates relatively slowly.',
    params: {
      mass: fromSolarMasses(1.5),
      radius: fromKm(12),
      spinFrequency: 0.15,
      temperature: 5e6,
      magneticField: 5e10,
      magneticInclination: deg(15),
      inertiaFactor: 0.4,
    },
  },
  {
    id: 'massive',
    name: 'Massive neutron star',
    tagline: '2.1 M☉ · compact · strong lensing',
    description:
      'Near the upper mass limit for neutron stars (~2.1–2.3 M☉). Its high compactness produces a large gravitational redshift and pronounced light bending — you can see well past its "horizon-less" limb. It sits uncomfortably close to the boundary with a black hole.',
    params: {
      mass: fromSolarMasses(2.1),
      radius: fromKm(11),
      spinFrequency: 5,
      temperature: 9e5,
      magneticField: 2e8,
      magneticInclination: deg(40),
      inertiaFactor: 0.42,
    },
  },
];

export const DEFAULT_PRESET_ID = 'canonical';

export function getPreset(id: string): Preset {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[0];
}
