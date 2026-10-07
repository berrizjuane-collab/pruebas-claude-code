/**
 * Límites de cámara (valores de diseño, no medidas geográficas).
 *
 * Área explorable: el núcleo de 14,4 km; su esfera envolvente tiene R ≈ 10,2 km.
 *  - minDistance general = max(300 m, 0,10·R) ≈ 1 020 m → 1 000 m.
 *  - maxDistance ≈ 2,4·R = 24 km (3R sacaría la cámara del anillo de contexto).
 *  - acercamiento focal (Hombro, Bottleneck, serac, cumbre) hasta 350 m: con celdas
 *    de 25 m, más cerca la malla dejaría ver facetas que el dato no respalda.
 */
export const CAMERA = {
  fovDeg: 42,
  minDistance: 1000,
  focalMinDistance: 350,
  maxDistance: 24000,
  focalRadius: 650,
  minPolarDeg: 4,
  maxPolarDeg: 87,
  /** holgura vertical sobre el terreno dilatado (m) */
  clearance: 70,
  focalClearance: 40,
  /** radio del filtro de máximo usado para la holgura (m) */
  dilationRadius: 75,
  targetLift: 5,
  /** límites del objetivo (dentro del núcleo, m locales) */
  targetHalf: 6900,
  targetAltMin: 4900,
  targetAltMax: 8700,
  /** límites de la cámara (dentro del anillo de contexto) */
  cameraHalf: 20500,
  cameraAltMax: 20500,
  dampingFactor: 0.085,
  transitionMs: 950,
  autoRotateSpeed: 0.35,
} as const;
