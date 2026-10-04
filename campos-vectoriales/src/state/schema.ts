/**
 * Estado del experimento (PLAN §1.7): serializable, inmutable y equivalente al JSON v1 de
 * SPEC §7.2 sin `formato` ni `version`.
 */
import { campoPorId, type IdCampo } from '../math/catalog';
import type { DeclParametro, Dominio, EspecSemillas, Plano, Vec3 } from '../math/tipos';

export type EscalarCorte = 'ninguno' | 'magnitud' | 'divergencia' | 'rotacional' | 'normal';
export type ModoGlifos = 'campo' | 'rotacional';

export interface EstadoExperimento {
  nombre: string;
  /** Campo del catálogo del que procede (o null si es completamente propio). */
  base: IdCampo | null;
  modificado: boolean;
  campo: { P: string; Q: string; R: string };
  parametros: DeclParametro[];
  dominio: Dominio;
  muestreo: {
    n: [number, number, number];
    posicion: 'nodos' | 'centros';
    corteResolucion: number;
  };
  capas: { flechas: boolean; lineas: boolean; particulas: boolean; glifos: ModoGlifos };
  flechas: {
    modo: 'proporcional' | 'normalizado';
    escala: { tipo: 'auto' } | { tipo: 'fija'; valor: number; /** Δ de la malla al fijarla (DESIGN §9.10). */ delta?: number };
    /** C_ref de los glifos de rot F (DESIGN §9.7 y §9.10): independiente de F_ref. */
    escalaRot: { tipo: 'auto' } | { tipo: 'fija'; valor: number; delta?: number };
    luminancia: 'lineal' | 'log';
  };
  lineas: {
    semillas: EspecSemillas;
    /** Paso de integración; null = Δ/8. */
    paso: number | null;
    /** Longitud máxima por rama; null = 4 × diagonal de Ω. */
    longitudMax: number | null;
  };
  particulas: {
    n: number;
    tau: number | null;
    semilla: number;
    /** Dónde nacen: en todo Ω (1.0) o emitidas desde las semillas de las líneas (líneas de traza, RF-25). */
    nacimiento: 'dominio' | 'semillas';
  };
  /**
   * Tiempo del experimento (SPEC §3.10, RF-24): instante mostrado t y ventana [inicio, fin] del
   * reloj, con o sin bucle. Un campo estacionario lo ignora.
   */
  tiempo: { t: number; inicio: number; fin: number; bucle: boolean };
  /** Vista libre (RF-20 … RF-23): dilatación λ, multiplicador de velocidad y espacio sin límites. */
  exploracion: { escala: number; velocidad: number; ilimitado: boolean };
  corte: {
    activo: boolean;
    plano: Plano;
    c: number;
    flechas: 'todas' | 'corte';
    vector: 'completo' | 'tangencial';
    escalar: EscalarCorte;
    /** V_ref del mapa escalar: P95 del corte o fijada desde la leyenda (DESIGN §9.6). */
    escala: { tipo: 'auto' } | { tipo: 'fija'; valor: number };
  };
  camara: { tipo: 'perspectiva' | 'ortografica'; posicion: Vec3; objetivo: Vec3 } | null;
  punto: Vec3 | null;
  cifras: number;
}

export const DOMINIO_POR_DEFECTO: Dominio = { min: [-2, -2, -2], max: [2, 2, 2] };
/** Ventana temporal por defecto: [0, 4π] con bucle (SPEC §4.9). */
export const TIEMPO_POR_DEFECTO: EstadoExperimento['tiempo'] = { t: 0, inicio: 0, fin: 4 * Math.PI, bucle: true };
export const EXPLORACION_POR_DEFECTO: EstadoExperimento['exploracion'] = { escala: 1, velocidad: 1, ilimitado: false };

export const LIMITES = {
  nMin: 3,
  nMax: 21,
  corteMin: 5,
  corteMax: 61,
  semillasMax: 256,
  pasosMax: 4000,
  particulasMax: 2000,
  parametrosMax: 8,
  ladoMin: 0.1,
  ladoMax: 1000,
  /** Dilatación λ de la vista libre (RF-23). */
  escalaMin: 1 / 8,
  escalaMax: 64,
  /** Multiplicador de la velocidad de vuelo (SPEC §5.11). */
  velocidadMin: 1 / 16,
  velocidadMax: 16,
  /** |t| y amplitud de la ventana temporal. */
  tiempoMax: 1e6,
} as const;

/** Nuevo experimento a partir de un campo del catálogo (conserva la vista si se da). */
export function experimentoDesdeCatalogo(id: IdCampo, previo?: EstadoExperimento): EstadoExperimento {
  const c = campoPorId(id);
  const base: EstadoExperimento = previo ?? {
    nombre: c.nombre,
    base: id,
    modificado: false,
    campo: { ...c.expresiones },
    parametros: [],
    dominio: DOMINIO_POR_DEFECTO,
    muestreo: { n: [9, 9, 9], posicion: 'nodos', corteResolucion: 21 },
    capas: { flechas: true, lineas: true, particulas: false, glifos: 'campo' },
    flechas: { modo: 'proporcional', escala: { tipo: 'auto' }, escalaRot: { tipo: 'auto' }, luminancia: 'lineal' },
    lineas: { semillas: c.semillas, paso: null, longitudMax: null },
    particulas: { n: 400, tau: null, semilla: 1, nacimiento: 'dominio' },
    corte: { activo: false, plano: 'XY', c: 0, flechas: 'todas', vector: 'completo', escalar: 'ninguno', escala: { tipo: 'auto' } },
    camara: null,
    punto: null,
    cifras: 4,
    tiempo: TIEMPO_POR_DEFECTO,
    exploracion: EXPLORACION_POR_DEFECTO,
  };
  // Campos temporales (SPEC §4.9): su ventana, el reloj al inicio y las partículas activas (D-68).
  const temporal = c.tiempo ?? null;
  return {
    ...base,
    nombre: c.nombre,
    base: id,
    modificado: false,
    campo: { ...c.expresiones },
    parametros: c.parametros.map((p) => ({ ...p })),
    lineas: { ...base.lineas, semillas: c.semillas },
    ...(temporal
      ? {
          tiempo: { t: temporal.inicio, inicio: temporal.inicio, fin: temporal.fin, bucle: true },
          capas: { ...base.capas, particulas: true },
        }
      : {}),
  };
}

export const EXPERIMENTO_INICIAL: EstadoExperimento = experimentoDesdeCatalogo('helicoidal');
