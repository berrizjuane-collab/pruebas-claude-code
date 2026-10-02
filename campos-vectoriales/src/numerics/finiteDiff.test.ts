import { describe, expect, it } from 'vitest';
import { derivadasEnPunto, diferenciaCentrada, jacobianaNumerica } from './finiteDiff';
import { CATALOGO, valoresParametros } from '../math/catalog';
import { AUXILIARES } from '../math/catalog/auxiliares';
import { compilarCampo } from '../math/field';
import { mulberry32 } from '../math/aleatorio';

const L = 2; // mitad del lado de [−2, 2]³
/** Registra un error medido junto al de la calibración (VALIDATION §2). */
const medida = (t: string, que: string, valor: string, calibracion: string) => console.log(`MEDIDA ${t} · ${que}: ${valor} (calibración: ${calibracion})`);

describe('V-NUM-01 · diferencias finitas frente a valores analíticos', () => {
  it('catálogo (campos afines): T-04, ≤ 10⁻⁸(1 + |v|)', () => {
    const azar = mulberry32(101);
    const ja = new Float64Array(9);
    let maxRel = 0;
    for (const c of CATALOGO) {
      const p = valoresParametros(c.parametros);
      for (let i = 0; i < 300; i++) {
        const q = [azar() * 4 - 2, azar() * 4 - 2, azar() * 4 - 2] as const;
        const { J } = jacobianaNumerica(c.F, ...q, p, L);
        c.J(...q, p, ja, 0);
        for (let k = 0; k < 9; k++) {
          const e = Math.abs((J[k] as number) - (ja[k] as number)) / (1 + Math.abs(ja[k] as number));
          maxRel = Math.max(maxRel, e);
          expect(e).toBeLessThanOrEqual(1e-8);
        }
      }
    }
    medida('T-04', 'catálogo, error máximo relativo', maxRel.toExponential(2), 'exactas salvo redondeo');
  });

  it('T1 en 2000 puntos: T-03, ≤ 10⁻⁷(1 + |v|); se registra el error máximo', () => {
    const t1 = AUXILIARES.find((t) => t.id === 'T1')!;
    const azar = mulberry32(1);
    const ja = new Float64Array(9);
    let maxRel = 0;
    for (let i = 0; i < 2000; i++) {
      const q = [azar() * 4 - 2, azar() * 4 - 2, azar() * 4 - 2] as const;
      const { J } = jacobianaNumerica(t1.F, ...q, new Float64Array(0), L);
      t1.J(...q, new Float64Array(0), ja, 0);
      for (let k = 0; k < 9; k++) {
        const e = Math.abs((J[k] as number) - (ja[k] as number)) / (1 + Math.abs(ja[k] as number));
        maxRel = Math.max(maxRel, e);
      }
    }
    medida('T-03', 'T1 en 2000 puntos, error máximo relativo', maxRel.toExponential(2), '1.5e-10');
    expect(maxRel).toBeLessThanOrEqual(1e-7);
  });
});

describe('V-NUM-02 · orden de convergencia de las diferencias centradas', () => {
  it('T1, ∂Q/∂x − ∂P/∂y en (0.7, −1.1, 0.4) con h = 0.1 → 0.0125: p ∈ [1.9, 2.1] (T-05)', () => {
    const t1 = AUXILIARES.find((t) => t.id === 'T1')!;
    const f = new Float64Array(3);
    const comp = (k: number, q: number[]) => {
      t1.F(q[0] as number, q[1] as number, q[2] as number, new Float64Array(0), f, 0);
      return f[k] as number;
    };
    const q = [0.7, -1.1, 0.4];
    const exacto = 2 * 0.7 * Math.exp(0.4) - 0.4 * Math.cos(-1.1 * 0.4);
    const errores = [0.1, 0.05, 0.025, 0.0125].map((h) => {
      const dQdx = diferenciaCentrada((t) => comp(1, [t, q[1] as number, q[2] as number]), 0.7, h);
      const dPdy = diferenciaCentrada((t) => comp(0, [q[0] as number, t, q[2] as number]), -1.1, h);
      return Math.abs(dQdx - dPdy - exacto);
    });
    const ordenes = errores.slice(1).map((e, i) => Math.log2((errores[i] as number) / e));
    medida('T-05', 'orden de las diferencias centradas', ordenes.map((o) => o.toFixed(3)).join(' / '), '2.000');
    for (const orden of ordenes) {
      expect(orden).toBeGreaterThanOrEqual(1.9);
      expect(orden).toBeLessThanOrEqual(2.1);
    }
  });
});

describe('V-NUM-16 · derivadas no finitas y puntos especiales', () => {
  const campo = (P: string) => {
    const r = compilarCampo({ P, Q: '0', R: '0' }, []);
    if (!r.ok) throw new Error(P);
    return r.campo;
  };
  const p = new Float64Array(0);

  it('√x en x = 0: «no acotada (∞)»', () => {
    const d = derivadasEnPunto(campo('sqrt(x)'), 0, 0.5, 0.5, p, L);
    expect(d.definido).toBe(true);
    expect(d.estados[0]).toBe('no-acotada');
  });

  it('(√x)² en x = 0 (forma 0·∞): diferencia unilateral = 1 ± 10⁻⁶, método «numérica»', () => {
    const d = derivadasEnPunto(campo('sqrt(x)^2'), 0, 0.5, 0.5, p, L);
    expect(d.estados[0]).toBe('numerica');
    expect(Math.abs((d.J[0] as number) - 1)).toBeLessThanOrEqual(1e-6);
    expect(d.paso).not.toBeNull();
  });

  it('√x en x = −1: F no definido', () => {
    expect(derivadasEnPunto(campo('sqrt(x)'), -1, 0, 0, p, L).definido).toBe(false);
  });

  it('|x| en x = 0: no diferenciable', () => {
    const d = derivadasEnPunto(campo('abs(x)'), 0, 1, 1, p, L);
    expect(d.anguloso).toBe(true);
  });

  it('sin jacobiana simbólica: todas las derivadas numéricas', () => {
    const t1 = AUXILIARES.find((t) => t.id === 'T1')!;
    const d = derivadasEnPunto({ F: t1.F, J: null }, 0.3, 0.2, -0.4, p, L);
    expect(d.estados.every((e) => e === 'numerica')).toBe(true);
  });
});
