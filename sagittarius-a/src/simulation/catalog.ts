/**
 * Catálogo de los diez objetos arrojables.
 *
 * Los parámetros de materiales son VALORES DE INGENIERÍA TÍPICOS (orden de magnitud), no datos de
 * objetos reales concretos; las fuentes y supuestos se documentan en docs/OBJETOS.md.
 *
 * Criterio de rotura por marea (modelo cuasiestático, docs/MATEMATICAS.md §mareas):
 *  - Monolito o agregado autogravitante de radio R: se rompe si
 *      λ > λ_c = (4π/3) G ρ + 2 σ_t / (ρ R²)
 *    (tensión central ≈ ρ λ R²/2 frente a resistencia + autogravedad).
 *  - Estructura esbelta de masa m y longitud L con sección resistente A:
 *      λ > λ_c = 8 σ_t A / (m L)   (tracción máxima T = m λ L / 8 en la sección media).
 * λ es el mayor autovalor de estiramiento del tensor de marea (−E) en s⁻². Cada fragmento resultante
 * vuelve a evaluarse con su propio tamaño (L/2 ⇒ λ_c ×4): fragmentación en cascada.
 */
import type { ObjectKind, Scenario } from './types';

export const G_SI = 6.6743e-11;

export interface Material {
  name: string;
  density: number;
  tensile: number;
  young: number;
  note: string;
}

export type BreakModel =
  | { type: 'monolith'; radius: number; density: number; tensile: number; selfGravity: boolean }
  | { type: 'slender'; mass: number; length: number; area: number; tensile: number }
  | { type: 'none' };

export interface ObjectSpec {
  kind: ObjectKind;
  name: string;
  description: string;
  demonstrates: string;
  class: 'cuerpo' | 'nube' | 'fotones';
  /** Dimensiones reales [m] (largo, ancho, alto). */
  dims: [number, number, number];
  massKg: number;
  material: Material;
  breakModel: BreakModel;
  /** Baliza óptica de la vista exterior: temperatura de cuerpo negro [K], brillo relativo, parpadeo (periodo en τ [M]). */
  beacon: { tempK: number; brightness: number; blinkPeriodM: number };
  /** Radio visual de la baliza ampliada en la vista exterior [M]. */
  markerRadiusM: number;
  defaultScenario: Scenario;
  color: string;
}

const STEEL: Material = { name: 'Acero estructural', density: 7850, tensile: 4.0e8, young: 2.0e11, note: 'Resistencia a tracción típica 400–550 MPa.' };
const ALUMINIUM: Material = { name: 'Aleación de aluminio 6061-T6', density: 2700, tensile: 3.1e8, young: 6.9e10, note: 'σ_t ≈ 310 MPa.' };
const ALLI: Material = { name: 'Aleación Al–Li (casco)', density: 2700, tensile: 4.5e8, young: 7.8e10, note: 'Casco de 5 mm de espesor.' };
const ROCK: Material = { name: 'Roca silicatada fracturada', density: 2600, tensile: 1.0e5, young: 1.0e10, note: 'Resistencia a gran escala (km) muy inferior a la de un meteorito (1–50 MPa): ~10⁵ Pa (incierta).' };
const ICE: Material = { name: 'Hielo poroso y polvo', density: 530, tensile: 10, young: 1.0e7, note: 'Como el núcleo de 67P: ρ ≈ 533 kg/m³, tracción ≈ 3–15 Pa (compresión 30–150 Pa).' };
const TANK: Material = { name: 'Depósito de acero inoxidable + agua', density: 1000, tensile: 2.5e8, young: 1.9e11, note: 'Pared de 4 mm; el agua no tiene resistencia a tracción.' };

export const CATALOG: Record<ObjectKind, ObjectSpec> = {
  esfera: {
    kind: 'esfera',
    name: 'Esfera de acero',
    description: 'Esfera maciza de 1 m de diámetro y 4,1 t. Referencia compacta para trayectorias masivas.',
    demonstrates: 'Geodésica temporal casi ideal: su tamaño es despreciable frente a la curvatura.',
    class: 'cuerpo',
    dims: [1, 1, 1],
    massKg: 4110,
    material: STEEL,
    breakModel: { type: 'monolith', radius: 0.5, density: 7850, tensile: 4.0e8, selfGravity: false },
    beacon: { tempK: 6500, brightness: 1, blinkPeriodM: 0 },
    markerRadiusM: 0.22,
    defaultScenario: 'radial',
    color: '#cfd6de',
  },
  reloj: {
    kind: 'reloj',
    name: 'Reloj atómico',
    description: 'Reloj de cesio de 60 × 40 × 30 cm. Su baliza parpadea cada 2 M (≈ 39 s) de tiempo propio.',
    demonstrates: 'Tiempo propio frente a tiempo coordenado y frente a lo que ve un observador exterior.',
    class: 'cuerpo',
    dims: [0.6, 0.4, 0.3],
    massKg: 50,
    material: ALUMINIUM,
    breakModel: { type: 'slender', mass: 50, length: 0.6, area: 4e-3, tensile: 3.1e8 },
    beacon: { tempK: 7500, brightness: 1.2, blinkPeriodM: 2 },
    markerRadiusM: 0.22,
    defaultScenario: 'radial',
    color: '#9fe0d0',
  },
  sonda: {
    kind: 'sonda',
    name: 'Sonda espacial',
    description: 'Sonda de 1,5 t con bus de 2 m, paneles solares de 12 m de envergadura y antena de alta ganancia.',
    demonstrates: 'Telemetría, orientación giroscópica (transporte paralelo) y trayectoria visible.',
    class: 'cuerpo',
    dims: [12, 2.4, 2.2],
    massKg: 1500,
    material: ALUMINIUM,
    breakModel: { type: 'slender', mass: 1500, length: 12, area: 1.2e-3, tensile: 3.1e8 },
    beacon: { tempK: 9000, brightness: 1.1, blinkPeriodM: 0 },
    markerRadiusM: 0.24,
    defaultScenario: 'radial',
    color: '#e3a54a',
  },
  capsula: {
    kind: 'capsula',
    name: 'Cápsula espacial',
    description: 'Cápsula tripulable de 10 m de largo y 4 m de diámetro (12 t). Cabe una persona de pie.',
    demonstrates: 'Gradiente gravitacional entre proa y popa; comparación con la tolerancia humana.',
    class: 'cuerpo',
    dims: [10, 4, 4],
    massKg: 12000,
    material: ALLI,
    breakModel: { type: 'slender', mass: 12000, length: 10, area: 0.063, tensile: 4.5e8 },
    beacon: { tempK: 5200, brightness: 1, blinkPeriodM: 0 },
    markerRadiusM: 0.24,
    defaultScenario: 'radial',
    color: '#d9d2c3',
  },
  asteroide: {
    kind: 'asteroide',
    name: 'Asteroide rocoso',
    description: 'Cuerpo irregular de ~1 km (ρ = 2600 kg/m³). Monolito fracturado o agregado sin cohesión.',
    demonstrates: 'Rotura por marea cerca del horizonte (monolito) o lejos de él (agregado), y dispersión de fragmentos.',
    class: 'cuerpo',
    dims: [1200, 900, 800],
    massKg: 1.1e12,
    material: ROCK,
    breakModel: { type: 'monolith', radius: 500, density: 2600, tensile: 1.0e5, selfGravity: true },
    beacon: { tempK: 4200, brightness: 1, blinkPeriodM: 0 },
    markerRadiusM: 0.3,
    defaultScenario: 'radial',
    color: '#a1866a',
  },
  cometa: {
    kind: 'cometa',
    name: 'Cometa helado',
    description: 'Núcleo de 5 km de hielo poroso (ρ = 530 kg/m³, σ_t ≈ 10 Pa).',
    demonstrates: 'Disrupción por marea fuera del horizonte de Sgr A* (≈ 30 r_g), como un evento de marea en miniatura.',
    class: 'cuerpo',
    dims: [5000, 4200, 3800],
    massKg: 2.6e13,
    material: ICE,
    breakModel: { type: 'monolith', radius: 2500, density: 530, tensile: 10, selfGravity: true },
    beacon: { tempK: 11000, brightness: 1.1, blinkPeriodM: 0 },
    markerRadiusM: 0.34,
    defaultScenario: 'radial',
    color: '#a8d4ff',
  },
  agua: {
    kind: 'agua',
    name: 'Contenedor de agua',
    description: 'Depósito cilíndrico de acero (2 m × 1,2 m) lleno al 80 %: 1,8 m³ de agua (2,1 t en total).',
    demonstrates: 'Marea en un fluido: cerca del horizonte el agua se reparte hacia los dos extremos de la dirección de estiramiento.',
    class: 'cuerpo',
    dims: [2, 1.2, 1.2],
    massKg: 2060,
    material: TANK,
    breakModel: { type: 'slender', mass: 2060, length: 2, area: 0.0151, tensile: 2.5e8 },
    beacon: { tempK: 8000, brightness: 1, blinkPeriodM: 0 },
    markerRadiusM: 0.22,
    defaultScenario: 'radial',
    color: '#5ab0e6',
  },
  cubo: {
    kind: 'cubo',
    name: 'Cubo reticulado',
    description: 'Celosía de aluminio de 20 m de arista: 5 × 5 × 5 nudos y 300 barras tubulares.',
    demonstrates: 'Estiramiento y compresión por marea: deformación elástica de cada barra y rotura en cascada.',
    class: 'cuerpo',
    dims: [20, 20, 20],
    massKg: 3700,
    material: ALUMINIUM,
    breakModel: { type: 'slender', mass: 3700, length: 20, area: 25 * 9.1e-4, tensile: 2.7e8 },
    beacon: { tempK: 6000, brightness: 1, blinkPeriodM: 0 },
    markerRadiusM: 0.26,
    defaultScenario: 'radial',
    color: '#b8c4ff',
  },
  nube: {
    kind: 'nube',
    name: 'Nube de partículas',
    description: 'Partículas trazadoras de prueba (sin interacción) en una bola de radio ajustable (por defecto 0,8 r_g ≈ 4,7 millones de km).',
    demonstrates: 'Evolución colectiva de geodésicas vecinas: estiramiento, enfoque y dispersión por la curvatura.',
    class: 'nube',
    dims: [0, 0, 0],
    massKg: 0,
    material: { name: 'Partículas de prueba', density: 0, tensile: 0, young: 0, note: 'Sin masa propia ni interacción.' },
    breakModel: { type: 'none' },
    beacon: { tempK: 7000, brightness: 0.9, blinkPeriodM: 0 },
    markerRadiusM: 0.07,
    defaultScenario: 'radial',
    color: '#f0c9ff',
  },
  fotones: {
    kind: 'fotones',
    name: 'Haz de fotones',
    description: 'Haz paralelo de fotones con parámetros de impacto en torno al valor crítico.',
    demonstrates: 'Geodésicas nulas: desviación, órbitas casi circulares, captura frente a escape.',
    class: 'fotones',
    dims: [0, 0, 0],
    massKg: 0,
    material: { name: 'Fotones', density: 0, tensile: 0, young: 0, note: 'Partículas sin masa: siguen geodésicas nulas.' },
    breakModel: { type: 'none' },
    beacon: { tempK: 0, brightness: 0, blinkPeriodM: 0 },
    markerRadiusM: 0,
    defaultScenario: 'critica',
    color: '#ffe680',
  },
};

/** Gradiente de marea crítico λ_c [s⁻²] para una pieza de tamaño relativo `scale` (1 = cuerpo entero). */
export function criticalTidalGradient(model: BreakModel, scale = 1): number {
  switch (model.type) {
    case 'monolith': {
      const R = model.radius * scale;
      const self = model.selfGravity ? ((4 * Math.PI) / 3) * G_SI * model.density : 0;
      return self + (2 * model.tensile) / (model.density * R * R);
    }
    case 'slender': {
      // m ∝ s³ (volumen), L ∝ s, A ∝ s² ⇒ λ_c ∝ 1/s²
      const m = model.mass * scale ** 3;
      const L = model.length * scale;
      const A = model.area * scale ** 2;
      return (8 * model.tensile * A) / (m * L);
    }
    default:
      return Infinity;
  }
}

/** Tensión de marea estimada [Pa] en la sección media para un gradiente λ [s⁻²]. */
export function tidalStress(model: BreakModel, lambda: number, scale = 1): number {
  switch (model.type) {
    case 'monolith': {
      const R = model.radius * scale;
      return 0.5 * model.density * Math.max(lambda, 0) * R * R;
    }
    case 'slender': {
      const m = model.mass * scale ** 3;
      const L = model.length * scale;
      const A = model.area * scale ** 2;
      return (m * Math.max(lambda, 0) * L) / (8 * A);
    }
    default:
      return 0;
  }
}

/** Aceleración de marea entre la cabeza y los pies de una persona de 1,8 m [m/s²] para λ [s⁻²]. */
export function humanTidalAcceleration(lambda: number): number {
  return Math.max(lambda, 0) * 1.8;
}
