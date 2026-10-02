import { describe, expect, it } from 'vitest';
import { CLASE } from '../numerics/grid';
import { experimentoDesdeCatalogo, type EstadoExperimento } from '../state/schema';
import { peticionMalla } from './peticiones';
import { trabajoMalla } from './trabajos';

/** Malla con «Glifos: rot F» para un estado. */
const mallaRot = (e: EstadoExperimento) => trabajoMalla({ ...peticionMalla({ ...e, capas: { ...e.capas, glifos: 'rotacional' } }), id: 1 });

const conOmega = (omega: number): EstadoExperimento => {
  const e = experimentoDesdeCatalogo('rotacional');
  return { ...e, parametros: e.parametros.map((p) => (p.nombre === 'omega' ? { ...p, valor: omega } : p)) };
};

/** (punta − centro) × tangente de la punta j (0 o 1) del anillo i: su sentido de giro (mano derecha). */
function giro(a: NonNullable<ReturnType<typeof mallaRot>['instancias']['anillos']>, i: number, j = 0): number[] {
  const k = 2 * i + j;
  const e = [0, 1, 2].map((q) => (a.punta[3 * k + q] as number) - (a.centro[3 * i + q] as number));
  const t = [0, 1, 2].map((q) => a.tangente[3 * k + q] as number);
  return [e[1]! * t[2]! - e[2]! * t[1]!, e[2]! * t[0]! - e[0]! * t[2]!, e[0]! * t[1]! - e[1]! * t[0]!];
}

describe('REN-07 · glifos de rot F', () => {
  it('rotacional con ω = 1: todos apuntan a +z y el anillo gira en sentido antihorario visto desde arriba; con ω = −1, al revés', () => {
    for (const [omega, sentido] of [
      [1, 1],
      [-1, -1],
    ] as const) {
      const r = mallaRot(conOmega(omega));
      expect(r.glifos).toBe('rotacional');
      // ∇×F = (0, 0, 2ω): C_ref = 2, independiente de F_ref.
      expect(r.escalaGlifos).toMatchObject({ ref: 2, origen: 'auto' });
      const inst = r.instancias;
      const a = inst.anillos!;
      expect(inst.n).toBe(729);
      expect(a.n).toBe(inst.n);
      for (let i = 0; i < inst.n; i++) {
        expect(inst.dir[3 * i + 2]).toBeCloseTo(sentido, 6);
        for (const j of [0, 1]) {
          const g = giro(a, i, j);
          // Visto desde +z, antihorario ⇔ componente z del giro > 0 (en las dos puntas).
          expect(Math.sign(g[2]!)).toBe(sentido);
          // Y siempre según la mano derecha respecto al propio eje de la flecha.
          expect(g[0]! * inst.dir[3 * i]! + g[1]! * inst.dir[3 * i + 1]! + g[2]! * inst.dir[3 * i + 2]!).toBeGreaterThan(0);
        }
      }
    }
  });

  it('el anillo rodea el eje en el centro de la flecha, perpendicular a ella, con la punta tangente', () => {
    // Campo con rotacional de dirección variable: F = (y z, −x z, x y) → ∇×F = (2x, 0, −2z).
    const e = experimentoDesdeCatalogo('helicoidal');
    const r = mallaRot({ ...e, campo: { P: 'y*z', Q: '-x*z', R: 'x*y' }, parametros: [] });
    const inst = r.instancias;
    const a = inst.anillos!;
    expect(inst.n).toBeGreaterThan(500);
    for (let i = 0; i < inst.n; i++) {
      const d = [0, 1, 2].map((k) => inst.dir[3 * i + k]!);
      const e1 = [0, 1, 2].map((k) => (a.punta[6 * i + k]! - a.centro[3 * i + k]!) / a.radio[i]!);
      const t = [0, 1, 2].map((k) => a.tangente[6 * i + k]!);
      // La segunda punta, en el punto opuesto con la tangente opuesta.
      for (let k = 0; k < 3; k++) {
        expect(a.punta[6 * i + 3 + k]! - a.centro[3 * i + k]!).toBeCloseTo(-e1[k]! * a.radio[i]!, 5);
        expect(a.tangente[6 * i + 3 + k]).toBeCloseTo(-t[k]!, 6);
      }
      const punto = (u: number[], v: number[]) => u[0]! * v[0]! + u[1]! * v[1]! + u[2]! * v[2]!;
      expect(punto(e1, d)).toBeCloseTo(0, 5);
      expect(punto(t, d)).toBeCloseTo(0, 5);
      expect(punto(t, e1)).toBeCloseTo(0, 5);
      expect(punto(t, t)).toBeCloseTo(1, 5);
      // Centro = nodo de la flecha.
      const nodo = inst.nodo[i]!;
      for (let k = 0; k < 3; k++) expect(a.centro[3 * i + k]).toBeCloseTo(r.pos[3 * nodo + k]!, 5);
      // Dirección = ∇×F normalizado.
      const c = [2 * r.pos[3 * nodo]!, 0, -2 * r.pos[3 * nodo + 2]!];
      const m = Math.hypot(c[0]!, c[1]!, c[2]!);
      for (let k = 0; k < 3; k++) expect(d[k]).toBeCloseTo(c[k]! / m, 5);
    }
  });

  it('T5 (|x|, 0, 0): rotacional nulo (◇) salvo en x = 0, donde no es diferenciable (×)', () => {
    const e = experimentoDesdeCatalogo('helicoidal');
    const r = mallaRot({ ...e, campo: { P: 'abs(x)', Q: '0', R: '0' }, parametros: [] });
    expect(r.escalaGlifos.nulo).toBe(true);
    expect(r.instancias.n).toBe(0);
    for (let i = 0; i < r.total; i++) {
      const x = r.pos[3 * i]!;
      expect(r.rot!.clase[i]).toBe(x === 0 ? CLASE.NO_DEFINIDO : CLASE.CERO);
    }
    expect(r.instancias.indefinidos.length / 3).toBe(81);
    expect(r.instancias.ceros.length / 3).toBe(729 - 81);
  });

  it('las flechas «solo corte» también dibujan rot F, con su proyección tangencial', () => {
    const e = experimentoDesdeCatalogo('helicoidal');
    const base = { ...e, campo: { P: 'y*z', Q: '-x*z', R: 'x*y' }, parametros: [] };
    const corte = (vector: 'completo' | 'tangencial') =>
      mallaRot({ ...base, corte: { ...base.corte, activo: true, plano: 'XY' as const, c: 1, flechas: 'corte' as const, vector } }).corte!.instancias;
    const completo = corte('completo');
    expect(completo.anillos?.n).toBe(completo.n);
    // En z = 1: ∇×F = (2x, 0, −2) → componente z de la dirección no nula; tangencial: (2x, 0, 0).
    expect(Math.max(...Array.from({ length: completo.n }, (_, i) => Math.abs(completo.dir[3 * i + 2]!)))).toBeGreaterThan(0.4);
    const tang = corte('tangencial');
    for (let i = 0; i < tang.n; i++) expect(Math.abs(tang.dir[3 * i + 2]!)).toBeLessThan(1e-9);
  });
});
