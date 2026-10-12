/**
 * Ajustes del trazador: dos niveles de calidad documentados.
 *
 * - Interactivo: RK4 con paso η·escala (η = 0,07) y paso máximo de 0,35 M en el plasma.
 * - Alta fidelidad: η = 0,025, paso máximo de 0,12 M en el plasma y más pasos permitidos.
 * Ambos se contrastan con el trazador de referencia en CPU (docs/VALIDACION.md).
 */
import { horizons } from '../../physics/metrics/kerr';
import { RiafModel, type RiafParams } from '../../physics/emission/riaf';
import { KerrSchild } from '../../physics/metrics/kerrSchild';
import type { PlasmaUniforms, TracerSettings } from './RayTracer';

export type Quality = 'interactive' | 'high';

export const QUALITY: Record<Quality, { eta: number; hEmit: number; maxSteps: number }> = {
  interactive: { eta: 0.07, hEmit: 0.35, maxSteps: 700 },
  high: { eta: 0.025, hEmit: 0.12, maxSteps: 3000 },
};

export function plasmaUniformsFor(a: number, p: RiafParams): PlasmaUniforms {
  const m = new RiafModel(new KerrSchild(a), p);
  return {
    ne0: p.ne0,
    te0: p.te0,
    beta: p.beta,
    h: p.h,
    kappa: p.kappa,
    rOut: p.rOut,
    rIsco: m.rIsco,
    deltaIsco: m.delta,
    Eisco: m.Eisco,
    Lisco: m.Lisco,
    turbulence: p.turbulence,
    seed: p.seed,
    hotspot: [p.hotspotAmp, p.hotspotR, p.hotspotSize, p.hotspotPhi0],
    omegaHs: m.omegaHs,
  };
}

export function defaultTracerSettings(a: number, quality: Quality = 'interactive'): TracerSettings {
  const q = QUALITY[quality];
  return {
    spin: a,
    rPlus: horizons(a).rPlus,
    maxSteps: q.maxSteps,
    eta: q.eta,
    hEmit: q.hEmit,
    rEscape: 1000,
    pastT: 300,
    profile: 'cinematic',
    outputMode: 0,
    plasmaOn: true,
    nus: [86e9, 230e9, 690e9],
    intensityScale: 1e3,
    rgCm: 5.9065e11,
    plasma: {
      ne0: 1.56e7,
      te0: 3e11,
      beta: 10,
      h: 1,
      kappa: 1,
      rOut: 50,
      rIsco: 6,
      deltaIsco: 0.3,
      Eisco: Math.sqrt(8 / 9),
      Lisco: Math.sqrt(12),
      turbulence: 0,
      seed: 7,
      hotspot: [0, 8, 1.2, 0],
      omegaHs: 0,
    },
    starsOn: true,
    starGain: 1,
    bandGain: 1,
    gridOn: false,
    starSeed: 3,
    galNormal: [0.5, -0.35, 0.79],
    palette: { lo: [0.62, 0.11, 0.03], mid: [1.0, 0.5, 0.14], hi: [1.0, 0.86, 0.62] },
  };
}
