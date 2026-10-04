/**
 * Tipos compartidos y serializables (forman parte del JSON de configuración, SPEC §7.2).
 * Viven en math/ porque los usan tanto el catálogo como los métodos numéricos.
 */

export type Vec3 = readonly [number, number, number];
export type Plano = 'XY' | 'XZ' | 'YZ';

export interface Dominio {
  min: Vec3;
  max: Vec3;
}

/** Estrategias de semillas para las líneas de corriente (SPEC §5.6). */
export type EspecSemillas =
  | {
      tipo: 'rejilla';
      plano: Plano;
      /** Coordenada del plano (z para XY, y para XZ, x para YZ). */
      c: number;
      /** Rango en la primera coordenada del plano; por defecto, toda la sección de Ω. */
      u?: readonly [number, number];
      /** Rango en la segunda coordenada del plano; por defecto, toda la sección de Ω. */
      v?: readonly [number, number];
      nu: number;
      nv: number;
    }
  | { tipo: 'aleatoria'; n: number; semilla: number }
  | { tipo: 'punto' }
  /**
   * Ancladas a una red gruesa de lado D alineada con `ancla` (espacio sin límites, SPEC §3.11 y
   * §5.11). Solo existe en el estado que ve el cálculo: nunca se guarda ni se exporta.
   */
  | { tipo: 'red'; D: number; ancla: Vec3; semilla: number };

export interface DeclParametro {
  nombre: string;
  valor: number;
  min: number;
  max: number;
  paso: number;
  porDefecto: number;
}

/**
 * Evaluador de un campo: escribe F(x, y, z) en out[o], out[o+1], out[o+2]. Un valor no
 * finito indica que el campo no está definido en ese punto. `p` son los valores de los
 * parámetros en el orden de su declaración.
 */
export type EvaluadorCampo = (x: number, y: number, z: number, p: Float64Array, out: Float64Array, o: number) => void;

/**
 * Evaluador de la jacobiana: escribe J en orden de filas, J[3i + j] = ∂F_i/∂x_j, en
 * out[o … o+8].
 */
export type EvaluadorJacobiana = (x: number, y: number, z: number, p: Float64Array, out: Float64Array, o: number) => void;

/** Ejes de las coordenadas (u, v) de cada plano y de su normal. */
export const EJES_PLANO: Record<Plano, { u: 0 | 1 | 2; v: 0 | 1 | 2; n: 0 | 1 | 2 }> = {
  XY: { u: 0, v: 1, n: 2 },
  XZ: { u: 0, v: 2, n: 1 },
  YZ: { u: 1, v: 2, n: 0 },
};

export const NOMBRE_EJE = ['x', 'y', 'z'] as const;
