/**
 * Vistas predefinidas. El objetivo se define por un POI o por coordenadas locales;
 * la cámara por rumbo (desde el objetivo hacia la cámara, 0 = norte), elevación
 * sobre la horizontal y distancia. Todas se validan en los tests contra el DEM
 * (holgura y línea de visión libre hasta el objetivo).
 */
export interface ViewPreset {
  id: string;
  label: string;
  /** un POI, o un punto (x este, y norte) sobre la superficie + `above` metros */
  target: { poi: string } | { x: number; y: number; above: number };
  bearingDeg: number;
  elevationDeg: number;
  distance: number;
}

export const VIEWS: ViewPreset[] = [
  { id: 'general', label: 'Vista general', target: { x: 300, y: -2600, above: 30 }, bearingDeg: 165, elevationDeg: 9, distance: 11500 },
  { id: 'abruzzi', label: 'Abruzzi', target: { x: 2050, y: -940, above: 30 }, bearingDeg: 125, elevationDeg: 12, distance: 5800 },
  { id: 'hombro', label: 'Hombro y Campo IV', target: { poi: 'c4' }, bearingDeg: 140, elevationDeg: 14, distance: 2300 },
  { id: 'bottleneck', label: 'Bottleneck y serac', target: { poi: 'travesia' }, bearingDeg: 158, elevationDeg: 10, distance: 1150 },
  { id: 'cumbre', label: 'Cumbre', target: { poi: 'cumbre' }, bearingDeg: 152, elevationDeg: 9, distance: 1050 },
  { id: 'norte', label: 'Cara norte', target: { x: -300, y: 900, above: 30 }, bearingDeg: 352, elevationDeg: 10, distance: 11000 },
];

export const DEFAULT_VIEW = 'general';
