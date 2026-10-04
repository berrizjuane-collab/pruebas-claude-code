/**
 * Estado que ve el cálculo (orquestador): el experimento con el instante del reloj en marcha
 * (SPEC §3.10, D-70) y, en el espacio sin límites, la ventana que acompaña a la cámara (SPEC
 * §3.11). Con un campo estacionario y sin vista libre es el propio experimento (mismo objeto),
 * de modo que el reloj de las partículas no despierta al orquestador.
 */
import { campoDependeDelTiempo } from '../compute/peticiones';
import type { EstadoExperimento } from '../state/schema';
import { derivarAlmacen, type Almacen } from '../state/store';

/** Sustituciones del espacio sin límites (o null fuera de él). */
export interface Ventana {
  dominio: EstadoExperimento['dominio'];
  flechas: EstadoExperimento['flechas'];
  lineas: EstadoExperimento['lineas'];
  corte: EstadoExperimento['corte'];
}

export function estadoEfectivo(e: EstadoExperimento, t: number, ventana: Ventana | null): EstadoExperimento {
  const conT = campoDependeDelTiempo(e) && t !== e.tiempo.t;
  if (!conT && !ventana) return e;
  return {
    ...e,
    ...(conT ? { tiempo: { ...e.tiempo, t } } : {}),
    ...(ventana ?? {}),
  };
}

/** Almacén de entrada del orquestador: se recalcula con el experimento, el reloj y la ventana. */
export function crearEntradaCalculo(
  experimento: Almacen<EstadoExperimento>,
  reloj: Almacen<number>,
  ventana: Almacen<Ventana | null>,
): Almacen<EstadoExperimento> & { desconectar(): void } {
  let previo: { e: EstadoExperimento; t: number; v: Ventana | null; r: EstadoExperimento } | null = null;
  return derivarAlmacen([experimento, reloj, ventana], () => {
    const e = experimento.obtener();
    const t = reloj.obtener();
    const v = ventana.obtener();
    if (previo && previo.e === e && previo.v === v && (previo.t === t || !campoDependeDelTiempo(e))) return previo.r;
    const r = estadoEfectivo(e, t, v);
    previo = { e, t, v, r };
    return r;
  });
}
