/**
 * Peticiones de cálculo a partir del estado del experimento (CMP-01). Las usan el
 * orquestador y las pruebas, que así calculan exactamente lo mismo que la aplicación.
 */
import { analizarExpresion } from '../math/field';
import { dependeDelTiempo } from '../math/expr/ast';
import type { EstadoExperimento } from '../state/schema';
import type { TipoEscalar } from '../numerics/slice';
import type { DefinicionCampo, PeticionCorte, PeticionLineas, PeticionMalla, ResultadoMalla } from './protocol';

export const definicionCampo = (e: EstadoExperimento): DefinicionCampo => ({
  P: e.campo.P,
  Q: e.campo.Q,
  R: e.campo.R,
  parametros: e.parametros.map((p) => p.nombre),
});

export const valores = (e: EstadoExperimento) => e.parametros.map((p) => p.valor);

let cacheTemporal: { clave: string; temporal: boolean } | null = null;

/**
 * ¿Depende del tiempo el campo del estado? (alguna componente válida contiene t). Se guarda la
 * última respuesta: el orquestador la consulta en cada cambio y el reloj cambia en cada fotograma.
 */
export function campoDependeDelTiempo(e: EstadoExperimento): boolean {
  const nombres = e.parametros.map((p) => p.nombre);
  const clave = `${e.campo.P}\u0000${e.campo.Q}\u0000${e.campo.R}\u0000${nombres.join(',')}`;
  if (cacheTemporal?.clave === clave) return cacheTemporal.temporal;
  const temporal = (['P', 'Q', 'R'] as const).some((c) => {
    const r = analizarExpresion(e.campo[c], nombres);
    return r.ok && dependeDelTiempo(r.arbol);
  });
  cacheTemporal = { clave, temporal };
  return temporal;
}

/** Vector de evaluación de las peticiones (D-63): valores de los parámetros y el instante t. */
export const vector = (e: EstadoExperimento) => [...valores(e), e.tiempo.t];

const ESCALAR: Record<EstadoExperimento['corte']['escalar'], TipoEscalar | null> = {
  ninguno: null,
  magnitud: 'magnitud',
  divergencia: 'divergencia',
  rotacional: 'rotacional',
  normal: 'normal',
};

type SinId<T> = Omit<T, 'id'>;

/** Petición de la malla de flechas para un estado. */
export const peticionMalla = (e: EstadoExperimento): SinId<PeticionMalla> => ({
  tipo: 'malla',
  campo: definicionCampo(e),
  p: vector(e),
  dominio: e.dominio,
  n: e.muestreo.n,
  posicion: e.muestreo.posicion,
  ventana: { inicio: e.tiempo.inicio, fin: e.tiempo.fin },
  escala: e.flechas.escala,
  glifos: e.capas.glifos,
  escalaRot: e.flechas.escalaRot,
  flechas: { modo: e.flechas.modo, luminancia: e.flechas.luminancia },
  corte: corteDeFlechas(e),
});

/** El corte solo entra en la malla cuando sus flechas sustituyen a las del volumen («solo corte»). */
export const corteDeFlechas = (e: EstadoExperimento): PeticionMalla['corte'] =>
  e.corte.activo && e.corte.flechas === 'corte' ? { plano: e.corte.plano, c: e.corte.c, vector: e.corte.vector } : null;

export const peticionCorte = (e: EstadoExperimento): SinId<PeticionCorte> => {
  const lado = Math.min(...[0, 1, 2].map((k) => (e.dominio.max[k] as number) - (e.dominio.min[k] as number)));
  return {
    tipo: 'corte',
    campo: definicionCampo(e),
    p: vector(e),
    dominio: e.dominio,
    plano: e.corte.plano,
    c: e.corte.c,
    M: e.muestreo.corteResolucion,
    escalar: ESCALAR[e.corte.escalar],
    L: lado / 2,
  };
};

export const peticionLineas = (e: EstadoExperimento, malla: ResultadoMalla): SinId<PeticionLineas> => ({
  tipo: 'lineas',
  campo: definicionCampo(e),
  p: vector(e),
  dominio: e.dominio,
  semillas: e.lineas.semillas,
  paso: e.lineas.paso,
  longitudMax: e.lineas.longitudMax,
  fRef: malla.escala.ref,
  deltaRef: malla.deltaRef,
  punto: e.punto,
});
