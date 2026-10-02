/**
 * Huella exacta de un resultado de malla (CMP-01): cada array tipado en hexadecimal y los
 * escalares tal cual. Dos huellas iguales significan resultados idénticos bit a bit; la
 * usan el gancho de pruebas (navegador) y las pruebas e2e (Node) con el mismo código.
 */
import type { ResultadoMalla } from './protocol';

const hex = (v: ArrayBufferView) =>
  Array.from(new Uint8Array(v.buffer, v.byteOffset, v.byteLength), (b) => b.toString(16).padStart(2, '0')).join('');

export interface HuellaMalla {
  escala: ResultadoMalla['escala'];
  lMax: number;
  deltaRef: number;
  recuento: ResultadoMalla['recuento'];
  arrays: Record<string, string>;
  escalares: Record<string, number>;
}

export function huellaMalla(r: ResultadoMalla): HuellaMalla {
  const entradas: [string, unknown][] = Object.entries({ pos: r.pos, F: r.F, mag: r.mag, clase: r.clase, ...r.instancias });
  return {
    escala: r.escala,
    lMax: r.lMax,
    deltaRef: r.deltaRef,
    recuento: r.recuento,
    arrays: Object.fromEntries(entradas.flatMap(([k, v]) => (ArrayBuffer.isView(v) ? [[k, hex(v)]] : []))),
    escalares: Object.fromEntries(entradas.flatMap(([k, v]) => (typeof v === 'number' ? [[k, v]] : []))),
  };
}
