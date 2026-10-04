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

describe('TMP-05 · ∂F/∂t y DF/Dt en el inspector (SPEC §3.10)', () => {
  /** Inspección en el instante t: t va en la última ranura del vector de evaluación (D-63). */
  function enInstante(id: Parameters<typeof campoPorId>[0], P: Vec3, t: number, simbolica = true) {
    const c = campoPorId(id);
    const r = compilarCampo(c.expresiones, c.parametros.map((p) => p.nombre));
    if (!r.ok) throw new Error('no compila');
    const campo = simbolica ? r.campo : { ...r.campo, dFdt: null };
    return { c, i: inspeccionar(campo, Float64Array.from([...valoresParametros(c.parametros), t]), P, 2) };
  }
  const cerca = (a: readonly number[] | null | undefined, b: readonly number[], tol: number) => {
    expect(a).not.toBeNull();
    for (let k = 0; k < 3; k++) expect(Math.abs((a as number[])[k]! - b[k]!)).toBeLessThanOrEqual(tol * (1 + Math.abs(b[k]!)));
  };

  it('un campo estacionario no lleva datos temporales', () => {
    expect(delCatalogo('rotacional', [1, 0, 0]).temporal).toBeUndefined();
  });

  it('viento giratorio: J = 0, así que DF/Dt = ∂F/∂t = Vω(−sin ωt, cos ωt, 0)', () => {
    const t = 0.7;
    const { i } = enInstante('viento-giratorio', [0.3, -1, 0.5], t);
    expect(i.temporal).toMatchObject({ t, metodo: 'analitica' });
    cerca(i.temporal?.dFdt, [-Math.sin(t), Math.cos(t), 0], 1e-14);
    cerca(i.temporal?.aceleracion, [-Math.sin(t), Math.cos(t), 0], 1e-14);
  });

  it('silla giratoria: DF/Dt = 2kω(−x s + y c, x c + y s, 0) + k²(x, y, 0), con c = cos 2ωt y s = sin 2ωt', () => {
    const [x, y, t] = [0.8, -0.4, 1.3];
    const { c, i } = enInstante('silla-giratoria', [x, y, 0.2], t);
    const [k, w] = Array.from(valoresParametros(c.parametros)) as [number, number];
    const [co, si] = [Math.cos(2 * w * t), Math.sin(2 * w * t)];
    const dFdt = [2 * k * w * (-x * si + y * co), 2 * k * w * (x * co + y * si), 0];
    cerca(i.temporal?.dFdt, dFdt, 1e-13);
    cerca(i.temporal?.aceleracion, [dFdt[0]! + k * k * x, dFdt[1]! + k * k * y, 0], 1e-13);
  });

  it('sin ∂F/∂t simbólica, diferencias centradas en t (T-03: 10⁻⁷(1 + |v|))', () => {
    for (const id of ['viento-giratorio', 'lluvia', 'silla-giratoria'] as const) {
      const P: Vec3 = [0.4, 1.1, -0.6];
      const exacta = enInstante(id, P, 2.5).i.temporal;
      const numerica = enInstante(id, P, 2.5, false).i.temporal;
      expect(numerica?.metodo).toBe('numerica');
      cerca(numerica?.dFdt, exacta?.dFdt as Vec3, 1e-7);
      cerca(numerica?.aceleracion, exacta?.aceleracion as Vec3, 1e-7);
    }
  });

  it('sin derivadas espaciales en P, ∂F/∂t sí y DF/Dt no', () => {
    const r = compilarCampo({ P: 't*abs(x)', Q: '0', R: '0' }, []);
    if (!r.ok) throw new Error('no compila');
    const i = inspeccionar(r.campo, Float64Array.from([2]), [0, 1, 0], 2);
    expect(i.derivadas).toEqual({ motivo: 'no-diferenciable' });
    expect(i.temporal?.dFdt).toEqual([0, 0, 0]);
    expect(i.temporal?.aceleracion).toBeNull();
  });
});
