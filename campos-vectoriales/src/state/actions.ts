/**
 * Acciones puras sobre el estado del experimento: cada una devuelve un estado nuevo.
 */
import type { IdCampo } from '../math/catalog';
import { experimentoDesdeCatalogo, type EstadoExperimento } from './schema';

/** Elegir un campo del catálogo: cambia ecuaciones, parámetros, semillas y nombre; conserva dominio, capas y cámara (F1). */
export function seleccionarCampo(s: EstadoExperimento, id: IdCampo): EstadoExperimento {
  return experimentoDesdeCatalogo(id, s);
}

export function fijarParametro(s: EstadoExperimento, nombre: string, valor: number): EstadoExperimento {
  return {
    ...s,
    parametros: s.parametros.map((p) => (p.nombre === nombre ? { ...p, valor } : p)),
  };
}
