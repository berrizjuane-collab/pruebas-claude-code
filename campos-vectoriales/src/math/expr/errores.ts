/** Errores y avisos de las expresiones, con posición y mensaje en español (SPEC §5.3). */

export type CodigoError =
  | 'VACIA'
  | 'INCOMPLETA'
  | 'CARACTER_NO_PERMITIDO'
  | 'NUMERO_MAL_FORMADO'
  | 'SIMBOLO_INESPERADO'
  | 'FALTA_OPERADOR'
  | 'IDENT_DESCONOCIDO'
  | 'FUNCION_NO_PERMITIDA'
  | 'FUNCION_SIN_PARENTESIS'
  | 'NO_ES_FUNCION'
  | 'ARIDAD'
  | 'T_RESERVADA'
  | 'DEMASIADO_LARGA'
  | 'DEMASIADO_PROFUNDA'
  | 'DEMASIADOS_NODOS';

export type Sugerencia = { tipo: 'parametro'; nombre: string } | { tipo: 'reescribir'; texto: string };

export interface ErrorExpresion {
  codigo: CodigoError;
  mensaje: string;
  /** Rango [ini, fin) del texto señalado. */
  ini: number;
  fin: number;
  /** El texto podría ser válido al seguir escribiendo (falta algo al final). */
  incompleta: boolean;
  sugerencias: Sugerencia[];
}

export interface AvisoExpresion {
  codigo: 'DIVISION_IMPLICITA';
  mensaje: string;
  ini: number;
  fin: number;
}

export function crearError(
  codigo: CodigoError,
  mensaje: string,
  ini: number,
  fin: number,
  sugerencias: Sugerencia[] = [],
): ErrorExpresion {
  return { codigo, mensaje, ini, fin, incompleta: codigo === 'INCOMPLETA', sugerencias };
}

/** Error lanzado internamente por el analizador; se captura y se devuelve como valor. */
export class FalloAnalisis extends Error {
  constructor(readonly error: ErrorExpresion) {
    super(error.mensaje);
  }
}

export const LIMITES_EXPRESION = { caracteres: 500, nodos: 1000, profundidad: 64, nodosDerivada: 5000 } as const;
