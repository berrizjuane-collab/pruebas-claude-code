/**
 * Orquestación del cálculo (PLAN §1.6). Desde MAT-05 el campo se evalúa con las
 * expresiones compiladas (los oráculos nativos quedan para las pruebas); la malla se
 * calcula en el hilo principal hasta CMP-01.
 */
import type { CampoCompilado } from '../math/field';
import { calcularFlechas, type InstanciasFlechas } from '../render/flechas';
import { clasificarCeros, crearMalla, escalaAutomatica, muestrearMalla, type Escala, type MuestraMalla } from '../numerics/grid';
import type { EstadoExperimento } from '../state/schema';

export interface ResultadoMalla {
  muestra: MuestraMalla;
  escala: Escala;
  lMax: number;
  instancias: InstanciasFlechas;
  ms: number;
}

export function calcularMalla(estado: EstadoExperimento, campo: CampoCompilado | null): ResultadoMalla | null {
  if (!campo) return null;
  const t0 = performance.now();
  const p = Float64Array.from(estado.parametros.map((d) => d.valor));
  const malla = crearMalla(estado.dominio, estado.muestreo.n, estado.muestreo.posicion);
  const muestra = muestrearMalla(campo.F, p, malla);
  const escala: Escala =
    estado.flechas.escala.tipo === 'fija'
      ? { ref: estado.flechas.escala.valor, origen: 'fija', nulo: false }
      : escalaAutomatica(muestra.mag, muestra.clase);
  clasificarCeros(muestra, escala.ref);
  const lMax = 0.9 * malla.deltaRef;
  const instancias = calcularFlechas(muestra, {
    fRef: escala.ref,
    lMax,
    modo: estado.flechas.modo,
    luminancia: estado.flechas.luminancia,
  });
  return { muestra, escala, lMax, instancias, ms: performance.now() - t0 };
}
