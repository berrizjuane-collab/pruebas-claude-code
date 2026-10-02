/**
 * Rotacional en un conjunto de puntos (REN-07, «Glifos: rot F»; SPEC §3.4 y §5.4): ∇×F con
 * la jacobiana simbólica o, si no está, con diferencias finitas. Un punto queda como no
 * definido si F o alguna derivada no lo están, o si es anguloso (abs, min, max…); como
 * singular, si el rotacional no está acotado.
 */
import { rotacional } from '../math/derivadas';
import { derivadasEnPunto, type CampoDerivable } from './finiteDiff';
import { CLASE, F_MAX } from './grid';

export interface MuestraRotacional {
  total: number;
  /** ∇×F por punto (3 por punto; NaN si no está definido). */
  C: Float64Array;
  /** ‖∇×F‖ por punto (NaN si no está definido). */
  mag: Float64Array;
  clase: Uint8Array;
  recuento: { validos: number; ceros: number; noDefinidos: number; singulares: number };
}

/**
 * ∇×F en las posiciones `pos` (3 por punto). Con `claseF`, los puntos donde F no está
 * definido se descartan sin derivar. L: escala de longitud del paso numérico (SPEC §5.4).
 */
export function muestrearRotacional(campo: CampoDerivable, p: Float64Array, pos: ArrayLike<number>, claseF: ArrayLike<number> | null, L: number): MuestraRotacional {
  const total = Math.floor(pos.length / 3);
  const C = new Float64Array(3 * total);
  const mag = new Float64Array(total);
  const clase = new Uint8Array(total);
  const recuento = { validos: 0, ceros: 0, noDefinidos: 0, singulares: 0 };
  for (let i = 0; i < total; i++) {
    const cF = claseF ? claseF[i] : CLASE.VALIDO;
    let c: number = CLASE.NO_DEFINIDO;
    if (cF === CLASE.VALIDO || cF === CLASE.CERO) {
      const d = derivadasEnPunto(campo, pos[3 * i] as number, pos[3 * i + 1] as number, pos[3 * i + 2] as number, p, L);
      if (d.definido && !d.anguloso) {
        const r = rotacional(d.J);
        const m = Math.hypot(r[0], r[1], r[2]);
        if (r.some((x) => Number.isNaN(x))) c = CLASE.NO_DEFINIDO;
        else if (!Number.isFinite(m) || m > F_MAX) c = CLASE.SINGULAR;
        else {
          c = CLASE.VALIDO;
          C[3 * i] = r[0];
          C[3 * i + 1] = r[1];
          C[3 * i + 2] = r[2];
          mag[i] = m;
        }
      }
    }
    clase[i] = c;
    if (c !== CLASE.VALIDO) {
      C.fill(NaN, 3 * i, 3 * i + 3);
      mag[i] = NaN;
      if (c === CLASE.NO_DEFINIDO) recuento.noDefinidos++;
      else recuento.singulares++;
    } else recuento.validos++;
  }
  return { total, C, mag, clase, recuento };
}
