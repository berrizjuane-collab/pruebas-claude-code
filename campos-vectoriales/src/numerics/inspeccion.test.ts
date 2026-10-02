import { describe, expect, it } from 'vitest';
import { campoPorId, valoresParametros } from '../math/catalog';
import { compilarCampo } from '../math/field';
import type { Vec3 } from '../math/tipos';
import { conDerivadas, inspeccionar } from './inspeccion';

function en(campo: { P: string; Q: string; R: string }, nombres: string[], valores: number[], P: Vec3) {
  const r = compilarCampo(campo, nombres);
  if (!r.ok) throw new Error('no compila');
  return inspeccionar(r.campo, Float64Array.from(valores), P, 2);
}
const delCatalogo = (id: Parameters<typeof campoPorId>[0], P: Vec3) => {
  const c = campoPorId(id);
  return en(c.expresiones, c.parametros.map((p) => p.nombre), Array.from(valoresParametros(c.parametros)), P);
};

describe('INS-02 · valores del inspector en puntos de tabla (SPEC §4.8, V-FUN-06)', () => {
  it('rotacional ω = 1 en (1, 0, 0): F = (0, 1, 0), ‖F‖ = 1, div = 0, rot = (0, 0, 2), ω = 1, analíticas', () => {
    const i = delCatalogo('rotacional', [1, 0, 0]);
    expect(i.F).toEqual([-0, 1, 0]);
    expect(i.mag).toBe(1);
    expect(i.unitario).toEqual([-0, 1, 0]);
    if (!conDerivadas(i)) throw new Error('sin derivadas');
    expect(i.derivadas).toMatchObject({ metodo: 'analiticas', div: 0, rot: [0, 0, 2], magRot: 2, helicidad: 0 });
  });

  it('radial saliente k = 1 en (1, 2, 2): ‖F‖ = 3 y div = 3; autovalores 1, 1, 1', () => {
    const i = delCatalogo('radial-saliente', [1, 2, 2]);
    expect(i.mag).toBe(3);
    if (!conDerivadas(i)) throw new Error('sin derivadas');
    expect(i.derivadas.div).toBe(3);
    expect(i.derivadas.rot).toEqual([0, 0, 0]);
    for (const a of i.derivadas.autovalores) expect(a).toEqual({ re: 1, im: 0 });
  });

  it('silla: autovalores ±k (punto de silla en cada plano horizontal)', () => {
    const i = delCatalogo('silla', [0.5, 0.5, 0]);
    if (!conDerivadas(i)) throw new Error('sin derivadas');
    const re = i.derivadas.autovalores.map((a) => a.re).sort((a, b) => a - b);
    expect(re[0]).toBeCloseTo(-1, 12);
    expect(re[2]).toBeCloseTo(1, 12);
  });

  it('P fuera del dominio de definición: F no definido; punto anguloso: derivadas no diferenciables', () => {
    expect(en({ P: 'sqrt(x)', Q: '0', R: '0' }, [], [], [-1, 0, 0])).toMatchObject({ definido: false, derivadas: { motivo: 'no-definidas' } });
    expect(en({ P: 'abs(x)', Q: '0', R: '0' }, [], [], [0, 1, 0])).toMatchObject({ definido: true, derivadas: { motivo: 'no-diferenciable' } });
  });

  it('T6 en (1, 0, 0): div = 2x + 1 = 3', () => {
    const i = en({ P: 'x^2', Q: 'y', R: '0' }, [], [], [1, 0, 0]);
    if (!conDerivadas(i)) throw new Error('sin derivadas');
    expect(i.derivadas.div).toBe(3);
  });
});
