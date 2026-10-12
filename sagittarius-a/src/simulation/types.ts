/**
 * Tipos compartidos de la simulación (hilo principal ↔ trabajador de física).
 */

export type ObjectKind = 'esfera' | 'reloj' | 'sonda' | 'capsula' | 'asteroide' | 'cometa' | 'agua' | 'cubo' | 'nube' | 'fotones';

export const OBJECT_ORDER: ObjectKind[] = ['esfera', 'reloj', 'sonda', 'capsula', 'asteroide', 'cometa', 'agua', 'cubo', 'nube', 'fotones'];

export type Scenario = 'radial' | 'orbita' | 'sobrevuelo' | 'captura' | 'critica' | 'personalizado';

export const SCENARIO_LABELS: Record<Scenario, string> = {
  radial: 'Caída radial',
  orbita: 'Órbita',
  sobrevuelo: 'Sobrevuelo',
  captura: 'Captura',
  critica: 'Trayectoria crítica',
  personalizado: 'Personalizado',
};

export type LaunchObserver = 'static' | 'zamo';

export interface LaunchConfig {
  object: ObjectKind;
  scenario: Scenario;
  /** Radio de lanzamiento [M]. */
  r0: number;
  /** Ángulo polar del punto de lanzamiento [°] (90 = plano ecuatorial). */
  theta0Deg: number;
  /** Acimut φ̃ del punto de lanzamiento [°]. */
  phi0Deg: number;
  /** Observador cuyo marco ortonormal define la velocidad local inicial. */
  observer: LaunchObserver;
  /** Componente radial de la velocidad local (unidades de c; < 0 hacia dentro). */
  vRadial: number;
  /** Componente tangencial (≥ 0, unidades de c). */
  vTangential: number;
  /** Orientación de la componente tangencial en el plano (e_θ, e_φ): 0° = prógrado (+e_φ), 90° = hacia el polo norte. */
  tangentAngleDeg: number;
  /** Actitud inicial del cuerpo en el marco local (guiñada, cabeceo, alabeo) [°]. */
  attitudeDeg: [number, number, number];
  prograde: boolean;
  orbitType: 'circular' | 'excentrica';
  rp: number;
  ra: number;
  /** Escenario crítico: lado del separador (ligeramente por encima → escapa tras girar). */
  criticalSide: 'escape' | 'captura';
  seed: number;
  cloudRadius: number;
  cloudCount: number;
  beamCount: number;
  /** Parámetro de impacto central del haz [M] (NaN → crítico). */
  beamCenterB: number;
  beamSpread: number;
  rubblePile: boolean;
}

export const DEFAULT_LAUNCH: LaunchConfig = {
  object: 'sonda',
  scenario: 'radial',
  r0: 18,
  theta0Deg: 80,
  phi0Deg: -55,
  observer: 'static',
  vRadial: 0,
  vTangential: 0,
  tangentAngleDeg: 0,
  attitudeDeg: [0, 0, 0],
  prograde: true,
  orbitType: 'circular',
  rp: 8,
  ra: 20,
  criticalSide: 'escape',
  seed: 20240512,
  cloudRadius: 0.8,
  cloudCount: 32,
  beamCount: 17,
  beamCenterB: NaN,
  beamSpread: 3,
  rubblePile: false,
};

export type ExperimentStatus = 'calculando' | 'en curso' | 'ligado' | 'capturado' | 'escapado' | 'fin del dominio' | 'error';

export interface PhysEvent {
  kind:
    | 'lanzamiento'
    | 'horizonte'
    | 'ergosfera'
    | 'isco'
    | 'periastro'
    | 'apoastro'
    | 'fractura'
    | 'escape'
    | 'fin'
    | 'aviso';
  t: number;
  tau: number;
  r: number;
  text: string;
}

export interface ExperimentSummary {
  id: string;
  label: string;
  object: ObjectKind;
  scenario: Scenario;
  color: string;
  status: ExperimentStatus;
  tLaunch: number;
  spin: number;
  events: PhysEvent[];
  /** Parámetros físicos derivados (E, L, Q, velocidad local…) para el registro. */
  info: Record<string, number | string>;
  slot: 'A' | 'B' | null;
  config: LaunchConfig;
  /** Último t calculado por el trabajador. */
  tComputed: number;
}

/** Disposición de una muestra de trayectoria de cuerpo (Float64Array, ver SAMPLE_*). */
export const S_T = 0;
export const S_X = 1; // x, y, z
export const S_U = 4; // u^t, u^x, u^y, u^z
export const S_TAU = 8;
export const S_P = 9; // p_t, p_x, p_y, p_z
export const S_E1 = 13; // e1^μ (4), e2^μ (4), e3^μ (4): marco giroscópico transportado en paralelo
export const S_TID = 25; // E_ij en el marco del cuerpo: xx, xy, xz, yy, yz, zz
export const S_K = 31; // Kretschmann
export const S_DRIFT = 32; // |Δμ²|, ΔE rel, ΔL rel, ΔQ rel
export const S_R = 36;
export const S_STRESS = 37; // tensión de marea estimada [Pa]
export const S_FLAGS = 38; // bits: 1 dentro del horizonte, 2 fracturado, 4 dentro de la ergosfera
export const SAMPLE_SIZE = 40;

/** Muestra de partícula de nube / fragmento (Float32Array): x, y, z, τ, uᵗ, uˣ, uʸ, uᶻ */
export const PARTICLE_SIZE = 8;
