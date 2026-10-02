import { describe, expect, it } from 'vitest';
import { CATALOGO, campoPorId, valoresParametros } from './index';
import { AUXILIARES } from './auxiliares';
import { autovalores3, divergencia, rotacional } from '../derivadas';
import { mulberry32 } from '../aleatorio';

/** V-MAT-01: J, div y rot del catálogo frente a las tablas de SPEC §4 (T-02). */
const T02 = (v: number) => 1e-12 * (1 + Math.abs(v));

const tablas: Record<string, { div: (p: number[]) => number; rot: (p: number[]) => [number, number, number] }> = {
  uniforme: { div: () => 0, rot: () => [0, 0, 0] },
  'radial-saliente': { div: (p) => 3 * (p[0] as number), rot: () => [0, 0, 0] },
  'radial-entrante': { div: (p) => -3 * (p[0] as number), rot: () => [0, 0, 0] },
  rotacional: { div: () => 0, rot: (p) => [0, 0, 2 * (p[0] as number)] },
  helicoidal: { div: () => 0, rot: () => [0, 0, 2] },
  silla: { div: () => 0, rot: () => [0, 0, 0] },
};

describe('catálogo nativo (V-MAT-01)', () => {
  const azar = mulberry32(20261002);
  for (const campo of CATALOGO) {
    it(`${campo.nombre}: div y rot coinciden con la tabla en 1000 puntos y parámetros aleatorios`, () => {
      const J = new Float64Array(9);
      for (let i = 0; i < 1000; i++) {
        const p = campo.parametros.map((d) => d.min + (d.max - d.min) * azar());
        const pv = Float64Array.from(p);
        const [x, y, z] = [azar() * 4 - 2, azar() * 4 - 2, azar() * 4 - 2];
        campo.J(x, y, z, pv, J, 0);
        const div = divergencia(J);
        const rot = rotacional(J);
        const tabla = tablas[campo.id];
        if (!tabla) throw new Error(campo.id);
        expect(Math.abs(div - tabla.div(p))).toBeLessThanOrEqual(T02(tabla.div(p)));
        tabla.rot(p).forEach((v, k) => expect(Math.abs((rot[k] as number) - v)).toBeLessThanOrEqual(T02(v)));
      }
    });

    it(`${campo.nombre}: la jacobiana nativa coincide con diferencias centradas de F`, () => {
      const p = valoresParametros(campo.parametros);
      const J = new Float64Array(9);
      const fm = new Float64Array(3);
      const fp = new Float64Array(3);
      for (let i = 0; i < 200; i++) {
        const q = [azar() * 4 - 2, azar() * 4 - 2, azar() * 4 - 2];
        campo.J(q[0] as number, q[1] as number, q[2] as number, p, J, 0);
        for (let j = 0; j < 3; j++) {
          const h = 1e-5;
          const a = [...q];
          const b = [...q];
          (a[j] as number) += h;
          (b[j] as number) -= h;
          campo.F(a[0] as number, a[1] as number, a[2] as number, p, fp, 0);
          campo.F(b[0] as number, b[1] as number, b[2] as number, p, fm, 0);
          for (let k = 0; k < 3; k++) {
            const fd = ((fp[k] as number) - (fm[k] as number)) / (2 * h);
            expect(Math.abs(fd - (J[3 * k + j] as number))).toBeLessThan(1e-8);
          }
        }
      }
    });
  }

  it('los equilibrios analíticos anulan el campo', () => {
    const f = new Float64Array(3);
    for (const campo of CATALOGO) {
      const p = valoresParametros(campo.parametros);
      for (const m of campo.equilibrios(p)) {
        const puntos =
          m.tipo === 'punto' ? [m.p] : m.tipo === 'recta' ? [-2, -0.5, 0, 1.3].map((t) => m.punto.map((c, k) => c + t * (m.dir[k] as number))) : [];
        for (const q of puntos) {
          campo.F(q[0] as number, q[1] as number, q[2] as number, p, f, 0);
          expect(Math.hypot(f[0] as number, f[1] as number, f[2] as number)).toBe(0);
        }
      }
    }
  });

  it('helicoidal sin equilibrios con a ≠ 0 y con el eje z si a = 0', () => {
    const h = campoPorId('helicoidal');
    expect(h.equilibrios(Float64Array.of(0.25))).toEqual([]);
    expect(h.equilibrios(Float64Array.of(0))[0]?.tipo).toBe('recta');
  });
});

describe('campos auxiliares T1–T6', () => {
  it('la jacobiana analítica coincide con diferencias centradas (lejos de singularidades)', () => {
    const azar = mulberry32(7);
    const J = new Float64Array(9);
    const fp = new Float64Array(3);
    const fm = new Float64Array(3);
    const p = new Float64Array(0);
    for (const t of AUXILIARES) {
      for (let i = 0; i < 200; i++) {
        const q = [azar() * 3 + 0.5, azar() * 3 - 1.5, azar() * 3 - 1.5];
        if (t.id === 'T5' && Math.abs(q[0] as number) < 1e-3) continue;
        t.J(q[0] as number, q[1] as number, q[2] as number, p, J, 0);
        for (let j = 0; j < 3; j++) {
          const h = 1e-6;
          const a = [...q];
          const b = [...q];
          (a[j] as number) += h;
          (b[j] as number) -= h;
          t.F(a[0] as number, a[1] as number, a[2] as number, p, fp, 0);
          t.F(b[0] as number, b[1] as number, b[2] as number, p, fm, 0);
          for (let k = 0; k < 3; k++) {
            const fd = ((fp[k] as number) - (fm[k] as number)) / (2 * h);
            const v = J[3 * k + j] as number;
            expect(Math.abs(fd - v), `${t.id} ∂F${k}/∂x${j}`).toBeLessThan(1e-5 * (1 + Math.abs(v)));
          }
        }
      }
    }
  });

  it('T2 y T4 no están definidos en sus singularidades', () => {
    const f = new Float64Array(3);
    const p = new Float64Array(0);
    AUXILIARES.find((t) => t.id === 'T2')?.F(0, 0, 0, p, f, 0);
    expect(Number.isFinite(f[0])).toBe(false);
    AUXILIARES.find((t) => t.id === 'T4')?.F(0, 0, 1, p, f, 0);
    expect(Number.isFinite(f[0])).toBe(false);
  });
});

describe('autovalores de J', () => {
  it('silla: k, −k, 0; rotacional: ±iω y 0; radial: k triple', () => {
    const ordenar = (v: { re: number; im: number }[]) => v.map((a) => [a.re, a.im]).sort((a, b) => (b[0] as number) - (a[0] as number) || (b[1] as number) - (a[1] as number));
    const J = new Float64Array(9);
    campoPorId('silla').J(0, 0, 0, Float64Array.of(2), J, 0);
    ordenar(autovalores3(J)).forEach((v, i) => expect(v[0]).toBeCloseTo([2, 0, -2][i] as number, 12));
    campoPorId('rotacional').J(0, 0, 0, Float64Array.of(1.5), J, 0);
    const r = ordenar(autovalores3(J));
    expect(r.map((v) => v[0])).toEqual([expect.closeTo(0, 12), expect.closeTo(0, 12), expect.closeTo(0, 12)]);
    expect(r.map((v) => Math.abs(v[1] as number)).sort()).toEqual([expect.closeTo(0, 12), expect.closeTo(1.5, 12), expect.closeTo(1.5, 12)]);
    campoPorId('radial-saliente').J(0, 0, 0, Float64Array.of(0.7), J, 0);
    autovalores3(J).forEach((v) => {
      expect(v.re).toBeCloseTo(0.7, 12);
      expect(v.im).toBeCloseTo(0, 12);
    });
  });
});
