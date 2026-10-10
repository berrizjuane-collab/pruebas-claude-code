/**
 * Perfiles de calidad y presupuestos. Los números de geometría y draw calls son
 * del pase principal (renderer.info tras renderizar la escena, sin sombras);
 * las sombras y el posproceso se cuentan aparte en el diagnóstico.
 */
import type { ProfileId } from '../quality/auto.ts';

export interface QualityProfile {
  id: ProfileId;
  label: string;
  /** objetivo de interacción, fotogramas por segundo */
  targetFps: number;
  dprMax: number;
  /** tope de píxeles del lienzo (ancho·alto físico) */
  maxPixels: number;
  /** error geométrico máximo tolerado en pantalla (px) para el LOD */
  lodPixelError: number;
  triangleBudget: number;
  drawCallBudget: number;
  shadows: boolean;
  shadowMapSize: number;
  /** 0: sin microdetalle; 1: una escala; 2: dos escalas + triplanar en roca */
  detail: 0 | 1 | 2;
  anisotropy: number;
  /** estimación de memoria de texturas residentes (MiB) */
  textureBudgetMiB: number;
  labelsMax: number;
  /** contorno oscuro bajo las rutas (un draw call más por tramo) */
  routeCasing: boolean;
  /** copos de nube dibujados (la nube de bandera de la cumbre siempre entra) */
  cloudPuffs: number;
}

export const QUALITY: Record<ProfileId, QualityProfile> = {
  baja: {
    id: 'baja',
    label: 'Baja',
    targetFps: 30,
    dprMax: 1.0,
    maxPixels: 1.6e6,
    lodPixelError: 5,
    triangleBudget: 250_000,
    drawCallBudget: 70,
    shadows: false,
    shadowMapSize: 0,
    detail: 0,
    anisotropy: 2,
    textureBudgetMiB: 48,
    labelsMax: 9,
    routeCasing: false,
    cloudPuffs: 30,
  },
  media: {
    id: 'media',
    label: 'Media',
    targetFps: 30,
    dprMax: 1.5,
    maxPixels: 2.8e6,
    lodPixelError: 2.5,
    triangleBudget: 500_000,
    drawCallBudget: 100,
    shadows: true,
    shadowMapSize: 2048,
    detail: 1,
    anisotropy: 4,
    textureBudgetMiB: 80,
    labelsMax: 14,
    routeCasing: true,
    cloudPuffs: 56,
  },
  alta: {
    id: 'alta',
    label: 'Alta',
    targetFps: 60,
    dprMax: 2.0,
    maxPixels: 4.2e6,
    lodPixelError: 1.25,
    triangleBudget: 1_200_000,
    drawCallBudget: 150,
    shadows: true,
    shadowMapSize: 4096,
    detail: 2,
    anisotropy: 8,
    textureBudgetMiB: 160,
    labelsMax: 22,
    routeCasing: true,
    cloudPuffs: 99,
  },
};
