import { describe, expect, it } from 'vitest';
import { CLASE, clasificarCeros, crearMalla, escalaAutomatica, muestrearMalla } from './grid';
import { percentil, redondeoLegible } from './stats';
import { formatear, formatearCorto, formatearVector } from './format';
import { campoPorId, valoresParametros } from '../math/catalog';
import { AUXILIARES } from '../math/catalog/auxiliares';
import type { Dominio } from '../math/tipos';

const OMEGA: Dominio = { min: [-2, -2, -2], max: [2, 2, 2] };

describe('malla (V-NUM-10)', () => {
  it('coordenadas exactas de los nodos; el origen es nodo con N impar y Ω simétrico', () => {
    const m = crearMalla(OMEGA, [9, 9, 9]);
    expect(Array.from(m.ejes[0])).toEqual([-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2]);
    expect(m.total).toBe(729);
    expect(m.deltaRef).toBe(0.5);
  });

  it('centros de celda', () => {
    const m = crearMalla(OMEGA, [4, 4, 4], 'centros');
    expect(Array.from(m.ejes[0])).toEqual([-1.5, -0.5, 0.5, 1.5]);
    expect(m.deltaRef).toBe(1);
  });

  it('N distinto por eje y Δ = mínimo', () => {
    const m = crearMalla({ min: [0, 0, 0], max: [1, 2, 4] }, [3, 5, 9]);
    expect(m.delta).toEqual([0.5, 0.5, 0.5]);
    expect(m.total).toBe(135);
  });
});

describe('muestreo y clasificación (V-NUM-15)', () => {
  it('T2 con un nodo en el origen: no definido y excluido de F_ref', () => {
    const t2 = AUXILIARES.find((t) => t.id === 'T2');
    if (!t2) throw new Error('T2');
    const m = muestrearMalla(t2.F, new Float64Array(0), crearMalla(OMEGA, [5, 5, 5]));
    const centro = 62; // i=j=k=2 → 2 + 5·(2 + 5·2)
    expect(m.clase[centro]).toBe(CLASE.NO_DEFINIDO);
    expect(m.recuento.noDefinidos).toBe(1);
    const esc = escalaAutomatica(m.mag, m.clase);
    expect(Number.isFinite(esc.ref)).toBe(true);
  });

  it('T3 (√x): nodos con x < 0 no definidos', () => {
    const t3 = AUXILIARES.find((t) => t.id === 'T3');
    if (!t3) throw new Error('T3');
    const m = muestrearMalla(t3.F, new Float64Array(0), crearMalla(OMEGA, [9, 9, 9]));
    expect(m.recuento.noDefinidos).toBe(4 * 81);
  });

  it('magnitud excesiva → singular', () => {
    const m = muestrearMalla((x, _y, _z, _p, out, o) => {
      out[o] = x === 0 ? 1e13 : 1;
      out[o + 1] = 0;
      out[o + 2] = 0;
    }, new Float64Array(0), crearMalla(OMEGA, [3, 3, 3]));
    expect(m.recuento.singulares).toBe(9);
  });

  it('rotacional: los ceros caen exactamente en los nodos del eje z', () => {
    const c = campoPorId('rotacional');
    const m = muestrearMalla(c.F, valoresParametros(c.parametros), crearMalla(OMEGA, [9, 9, 9]));
    clasificarCeros(m, escalaAutomatica(m.mag, m.clase).ref);
    expect(m.recuento.ceros).toBe(9);
    for (let i = 0; i < m.malla.total; i++) {
      if (m.clase[i] === CLASE.CERO) {
        expect(m.pos[3 * i]).toBe(0);
        expect(m.pos[3 * i + 1]).toBe(0);
      }
    }
  });

  it('helicoidal con a = 0.25: ningún cero', () => {
    const c = campoPorId('helicoidal');
    const m = muestrearMalla(c.F, valoresParametros(c.parametros), crearMalla(OMEGA, [9, 9, 9]));
    clasificarCeros(m, escalaAutomatica(m.mag, m.clase).ref);
    expect(m.recuento.ceros).toBe(0);
  });
});

describe('escala de referencia (V-NUM-11)', () => {
  it('percentil por rango más cercano', () => {
    expect(percentil([5, 1, 4, 2, 3], 0.95)).toBe(5);
    expect(percentil(Array.from({ length: 100 }, (_, i) => i + 1), 0.95)).toBe(95);
    expect(percentil([7], 0.5)).toBe(7);
  });

  it('redondeo legible hacia arriba', () => {
    const casos: [number, number][] = [
      [0.9, 1], [1, 1], [1.01, 1.5], [2.5, 2.5], [2.6, 3], [3.46, 4], [4.2, 5], [5.5, 6], [6.1, 8], [8.2, 10],
      [0.0123, 0.015], [123, 150], [0.26, 0.3], [9999, 10000],
    ];
    for (const [v, esperado] of casos) expect(redondeoLegible(v), String(v)).toBe(esperado);
    expect(redondeoLegible(0)).toBe(1);
    expect(redondeoLegible(NaN)).toBe(1);
  });

  it('radial saliente k = 1 en [−2,2]³ con N = 9: P95 de ‖r‖ redondeado', () => {
    const c = campoPorId('radial-saliente');
    const m = muestrearMalla(c.F, valoresParametros(c.parametros), crearMalla(OMEGA, [9, 9, 9]));
    const mags = Array.from(m.mag);
    // P95 exacto = ‖(2, 2, 1)‖ = 3 (693.º de 729 valores ordenados)
    expect(percentil(mags, 0.95)).toBe(3);
    expect(escalaAutomatica(m.mag, m.clase).ref).toBe(3);
  });

  it('campo nulo → F_ref = 1 y aviso', () => {
    const m = muestrearMalla((_x, _y, _z, _p, out, o) => {
      out[o] = 0;
      out[o + 1] = 0;
      out[o + 2] = 0;
    }, new Float64Array(0), crearMalla(OMEGA, [3, 3, 3]));
    expect(escalaAutomatica(m.mag, m.clase)).toEqual({ ref: 1, origen: 'auto', nulo: true });
  });
});

describe('formato numérico (V-MAT-10)', () => {
  const casos: [number, string, object?][] = [
    [1, '1.000'], [0.25, '0.2500'], [1.0307764, '1.031'], [-2.5, '−2.500'], [12345, '12345'],
    [123456, '1.235 × 10⁵'], [0.000123456, '1.235 × 10⁻⁴'], [0, '0'], [1e-13, '0'],
    [-1e-13, '0'], [NaN, 'no definido'], [Infinity, '∞'], [-Infinity, '−∞'], [2, '2.0', { cifras: 2 }],
    [3.14159265, '3.141593', { cifras: 7 }], [1e-10, '1.000 × 10⁻¹⁰', { escala: 1e-6 }],
  ];
  for (const [v, esperado, op] of casos) {
    it(`${v} → ${esperado}`, () => expect(formatear(v, op)).toBe(esperado));
  }
  it('vectores', () => expect(formatearVector([0, 1, 0.25])).toBe('(0, 1.000, 0.2500)'));
  it('formato corto para marcas', () => {
    expect(formatearCorto(-1.5)).toBe('−1.5');
    expect(formatearCorto(2)).toBe('2');
    expect(formatearCorto(0.30000000000000004)).toBe('0.3');
  });
});
