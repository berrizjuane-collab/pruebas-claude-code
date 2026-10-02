import { describe, expect, it } from 'vitest';
import { CATALOGO } from './index';
import { AUXILIARES } from './auxiliares';
import { compilarCampo } from '../field';
import { mulberry32 } from '../aleatorio';

/**
 * MAT-05: cada campo del catálogo y T1–T6, definidos por expresiones del lenguaje, frente
 * a sus oráculos nativos independientes.
 *   V-MAT-05: evaluación (T-01) y mismo patrón de valores no finitos.
 *   V-MAT-07: jacobiana simbólica frente a la analítica (T-02).
 */
const T01 = (a: number, b: number) => 1e-14 * Math.max(1, Math.abs(a), Math.abs(b));
const T02 = (v: number) => 1e-12 * (1 + Math.abs(v));

function mismoValor(a: number, b: number): boolean {
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.isNaN(a) && Number.isNaN(b);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return a === b;
  return Math.abs(a - b) <= T01(a, b);
}

/** Punto aleatorio lejos de las singularidades de cada campo auxiliar. */
function puntoSeguro(id: string, azar: () => number): [number, number, number] {
  for (;;) {
    const q: [number, number, number] = [azar() * 4 - 2, azar() * 4 - 2, azar() * 4 - 2];
    if (id === 'T2' && Math.hypot(...q) < 0.2) continue;
    if (id === 'T3' && q[0] < 0.1) continue;
    if (id === 'T4' && Math.hypot(q[0], q[1]) < 0.2) continue;
    if (id === 'T5' && Math.abs(q[0]) < 1e-3) continue;
    return q;
  }
}

const casos = [
  ...CATALOGO.map((c) => ({ id: c.id, expr: c.expresiones, decl: c.parametros, F: c.F, J: c.J })),
  ...AUXILIARES.map((t) => ({ id: t.id, expr: t.expresiones, decl: [], F: t.F, J: t.J })),
];

describe('V-MAT-05 · expresiones compiladas frente a oráculos nativos', () => {
  for (const caso of casos) {
    it(`${caso.id}: 1000 puntos (y parámetros aleatorios en su rango)`, () => {
      const r = compilarCampo(caso.expr, caso.decl.map((d) => d.nombre));
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const azar = mulberry32(caso.id.length * 97 + 5);
      const a = new Float64Array(3);
      const b = new Float64Array(3);
      for (let i = 0; i < 1000; i++) {
        const p = Float64Array.from(caso.decl.map((d) => d.min + (d.max - d.min) * azar()));
        const [x, y, z] = [azar() * 4 - 2, azar() * 4 - 2, azar() * 4 - 2];
        r.campo.F(x, y, z, p, a, 0);
        caso.F(x, y, z, p, b, 0);
        for (let k = 0; k < 3; k++) expect(mismoValor(a[k] as number, b[k] as number), `${caso.id} F${k} en (${x}, ${y}, ${z})`).toBe(true);
      }
    });
  }

  it('mismo patrón de no finitos en las singularidades (T2 en el origen, T3 con x < 0, T4 sobre el eje)', () => {
    const p = new Float64Array(0);
    const puntos: Record<string, [number, number, number][]> = {
      T2: [[0, 0, 0]],
      T3: [[-1, 0.5, 0.5], [-0.001, 0, 0]],
      T4: [[0, 0, 1], [0, 0, -2]],
    };
    for (const [id, lista] of Object.entries(puntos)) {
      const t = AUXILIARES.find((x) => x.id === id);
      if (!t) throw new Error(id);
      const r = compilarCampo(t.expresiones, []);
      if (!r.ok) throw new Error(id);
      const a = new Float64Array(3);
      const b = new Float64Array(3);
      for (const q of lista) {
        r.campo.F(...q, p, a, 0);
        t.F(...q, p, b, 0);
        for (let k = 0; k < 3; k++) expect(mismoValor(a[k] as number, b[k] as number), `${id} en ${q}`).toBe(true);
        expect(Number.isFinite(a[0])).toBe(false);
      }
    }
  });
});

describe('V-MAT-07 · jacobiana simbólica frente a la analítica', () => {
  for (const caso of casos.filter((c) => c.id !== 'T5')) {
    it(`${caso.id}: 9 derivadas en 500 puntos (T-02)`, () => {
      const r = compilarCampo(caso.expr, caso.decl.map((d) => d.nombre));
      if (!r.ok || !r.campo.J) throw new Error(`${caso.id} sin jacobiana simbólica`);
      const azar = mulberry32(caso.id.length * 31 + 11);
      const js = new Float64Array(9);
      const ja = new Float64Array(9);
      for (let i = 0; i < 500; i++) {
        const p = Float64Array.from(caso.decl.map((d) => d.min + (d.max - d.min) * azar()));
        const q = puntoSeguro(caso.id, azar);
        r.campo.J(...q, p, js, 0);
        caso.J(...q, p, ja, 0);
        for (let k = 0; k < 9; k++) {
          expect(Math.abs((js[k] as number) - (ja[k] as number)), `${caso.id} J[${k}] en ${q}`).toBeLessThanOrEqual(T02(ja[k] as number));
        }
      }
    });
  }

  it('T5 (|x|): la derivada simbólica coincide lejos de x = 0 y el punto anguloso se detecta', () => {
    const t5 = AUXILIARES.find((t) => t.id === 'T5');
    if (!t5) throw new Error('T5');
    const r = compilarCampo(t5.expresiones, []);
    if (!r.ok || !r.campo.J) throw new Error('T5');
    const js = new Float64Array(9);
    r.campo.J(-0.7, 0, 0, new Float64Array(0), js, 0);
    expect(js[0]).toBe(-1);
    expect(r.campo.enAngulo(0, 1, 1, new Float64Array(0))).toBe(true);
    expect(r.campo.enAngulo(0.2, 1, 1, new Float64Array(0))).toBe(false);
  });
});
