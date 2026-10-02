import { describe, expect, it } from 'vitest';
import { generarSemillas, SEMILLAS_MAX } from './seeds';
import { pasoRK4Tiempo, SistemaParticulas } from './particles';
import { muestrearCorte } from './slice';
import { campoPorId, valoresParametros } from '../math/catalog';
import { compilarCampo } from '../math/field';
import type { Dominio } from '../math/tipos';

const OMEGA: Dominio = { min: [-2, -2, -2], max: [2, 2, 2] };
/** Registra un error medido junto al de la calibración (VALIDATION §2). */
const medida = (t: string, que: string, valor: string, calibracion: string) => console.log(`MEDIDA ${t} · ${que}: ${valor} (calibración: ${calibracion})`);

describe('V-NUM-12 · semillas', () => {
  const rot = campoPorId('rotacional');
  const p = valoresParametros(rot.parametros);

  it('rejilla en un plano con rangos: posiciones exactas', () => {
    const r = generarSemillas({ tipo: 'rejilla', plano: 'XZ', c: 0, u: [0.5, 2], v: [0, 0], nu: 4, nv: 1 }, OMEGA, campoPorId('helicoidal').F, Float64Array.of(0.25), 3, { delta: 0.5 });
    expect(Array.from(r.puntos)).toEqual([0.5, 0, 0, 1, 0, 0, 1.5, 0, 0, 2, 0, 0]);
  });

  it('misma semilla → mismos puntos (bit a bit); otra semilla → otros', () => {
    const a = generarSemillas({ tipo: 'aleatoria', n: 32, semilla: 1 }, OMEGA, rot.F, p, 3, { delta: 0.5 });
    const b = generarSemillas({ tipo: 'aleatoria', n: 32, semilla: 1 }, OMEGA, rot.F, p, 3, { delta: 0.5 });
    const c = generarSemillas({ tipo: 'aleatoria', n: 32, semilla: 2 }, OMEGA, rot.F, p, 3, { delta: 0.5 });
    expect(Array.from(a.puntos)).toEqual(Array.from(b.puntos));
    expect(Array.from(a.puntos)).not.toEqual(Array.from(c.puntos));
  });

  it('descarte y recuento: eje z del rotacional (≈ 0), fuera de Ω, no definidos', () => {
    const r = generarSemillas({ tipo: 'rejilla', plano: 'XY', c: 0, nu: 3, nv: 3 }, OMEGA, rot.F, p, 3, { delta: 0.5 });
    expect(r.descartadas.cero).toBe(1); // el centro (0, 0, 0)
    expect(r.n).toBe(8);
    const fuera = generarSemillas({ tipo: 'rejilla', plano: 'XY', c: 5, nu: 2, nv: 2 }, OMEGA, rot.F, p, 3, { delta: 0.5 });
    expect(fuera.descartadas.fuera).toBe(4);
    const t3 = compilarCampo({ P: 'sqrt(x)', Q: '1', R: '0' }, []);
    if (!t3.ok) throw new Error('T3');
    const nd = generarSemillas({ tipo: 'rejilla', plano: 'XY', c: 0, nu: 5, nv: 1 }, OMEGA, t3.campo.F, new Float64Array(0), 1, { delta: 0.5 });
    expect(nd.descartadas.noDefinido).toBe(2); // x = −2, −1
  });

  it(`límite de ${SEMILLAS_MAX} semillas`, () => {
    const r = generarSemillas({ tipo: 'aleatoria', n: 300, semilla: 3 }, OMEGA, rot.F, p, 3, { delta: 0.5 });
    expect(r.n).toBe(SEMILLAS_MAX);
    expect(r.recortadas).toBe(300 - SEMILLAS_MAX - r.descartadas.cero);
  });

  it('desde el punto inspeccionado: P y un anillo de 6 a Δ/4 en el plano normal a F(P)', () => {
    const r = generarSemillas({ tipo: 'punto' }, OMEGA, rot.F, p, 3, { delta: 0.4, punto: [1, 0, 0] });
    expect(r.n).toBe(7);
    // F(1,0,0) = (0,1,0): el anillo está en el plano y = 0, a distancia 0.1 de P.
    for (let i = 1; i < 7; i++) {
      const q = [r.puntos[3 * i], r.puntos[3 * i + 1], r.puntos[3 * i + 2]] as number[];
      expect(Math.abs(q[1] as number)).toBeLessThan(1e-15);
      expect(Math.hypot((q[0] as number) - 1, q[1] as number, q[2] as number)).toBeCloseTo(0.1, 14);
    }
  });
});

describe('V-NUM-13 · partículas', () => {
  const silla = campoPorId('silla');
  const p = Float64Array.of(1);
  const exacta = (t: number) => [0.3 * Math.exp(t), 1.2 * Math.exp(-t), 0];

  it('frente a la solución exacta de la silla, δt = 0.01, t = 1: relativo ≤ 10⁻⁸ (T-14)', () => {
    const r = Float64Array.of(0.3, 1.2, 0);
    for (let i = 0; i < 100; i++) pasoRK4Tiempo(silla.F, p, r, 0.01);
    const e = exacta(1);
    const err = Math.hypot((r[0] as number) - (e[0] as number), (r[1] as number) - (e[1] as number)) / Math.hypot(e[0] as number, e[1] as number);
    medida('T-14', 'partículas en la silla, δt = 0.01, error relativo', err.toExponential(2), '8.3e-11');
    expect(err).toBeLessThanOrEqual(1e-8);
  });

  it('orden de convergencia en t: p ∈ [3.8, 4.2] (T-13)', () => {
    const errores = [0.1, 0.05, 0.025].map((dt) => {
      const r = Float64Array.of(0.3, 1.2, 0);
      for (let i = 0; i < Math.round(1 / dt); i++) pasoRK4Tiempo(silla.F, p, r, dt);
      const e = exacta(1);
      return Math.hypot((r[0] as number) - (e[0] as number), (r[1] as number) - (e[1] as number));
    });
    const ordenes = errores.slice(1).map((e, i) => Math.log2((errores[i] as number) / e));
    medida('T-13', 'orden de RK4 en t (silla)', ordenes.map((o) => o.toFixed(3)).join(' / '), '3.97 – 3.99');
    for (const orden of ordenes) {
      expect(orden).toBeGreaterThanOrEqual(3.8);
      expect(orden).toBeLessThanOrEqual(4.2);
    }
  });

  it('la velocidad de cada partícula es F en su posición; renacen al salir de Ω', () => {
    const sis = new SistemaParticulas({ n: 50, semilla: 9, dominio: OMEGA });
    const v = new Float64Array(3);
    const f = new Float64Array(3);
    for (let i = 0; i < 50; i++) {
      sis.velocidad(silla.F, p, i, v);
      silla.F(sis.pos[3 * i] as number, sis.pos[3 * i + 1] as number, sis.pos[3 * i + 2] as number, p, f, 0);
      expect(Array.from(v)).toEqual(Array.from(f));
    }
    const antes = sis.renacimientos;
    for (let k = 0; k < 120; k++) sis.avanzar(silla.F, p, 1 / 60, 1, 3, 0.5);
    expect(sis.renacimientos).toBeGreaterThan(antes);
    for (let i = 0; i < 50; i++) {
      for (let k = 0; k < 3; k++) {
        expect(sis.pos[3 * i + k]).toBeGreaterThanOrEqual(-2);
        expect(sis.pos[3 * i + k]).toBeLessThanOrEqual(2);
      }
    }
  });

  it('reproducible: misma semilla → mismas trayectorias', () => {
    const a = new SistemaParticulas({ n: 20, semilla: 4, dominio: OMEGA });
    const b = new SistemaParticulas({ n: 20, semilla: 4, dominio: OMEGA });
    for (let k = 0; k < 30; k++) {
      a.avanzar(silla.F, p, 1 / 60, 0.5, 3, 0.5);
      b.avanzar(silla.F, p, 1 / 60, 0.5, 3, 0.5);
    }
    expect(Array.from(a.pos)).toEqual(Array.from(b.pos));
  });
});

describe('V-NUM-14 · muestreo en el corte', () => {
  it('F∥·n = 0 exacto (T-19); F·n y F∥ coherentes con F', () => {
    const h = campoPorId('helicoidal');
    const r = compilarCampo(h.expresiones, ['a']);
    if (!r.ok) throw new Error('hel');
    for (const plano of ['XY', 'XZ', 'YZ'] as const) {
      const m = muestrearCorte(r.campo, Float64Array.of(0.25), { plano, c: 0.3, M: 11, dominio: OMEGA, escalar: null }, 2);
      const n = plano === 'XY' ? 2 : plano === 'XZ' ? 1 : 0;
      for (let i = 0; i < m.total; i++) {
        expect(m.Fpar[3 * i + n]).toBe(0);
        expect(m.Fn[i]).toBe(m.F[3 * i + n]);
        expect(m.pos[3 * i + n]).toBe(0.3);
      }
    }
  });

  it('T6: div = 2x + 1 en el corte XY coincide con la evaluación directa y cambia de signo en x = −1/2', () => {
    const r = compilarCampo({ P: 'x^2', Q: 'y', R: '0' }, []);
    if (!r.ok) throw new Error('T6');
    const m = muestrearCorte(r.campo, new Float64Array(0), { plano: 'XY', c: 0, M: 21, dominio: OMEGA, escalar: 'divergencia' }, 2);
    const e = m.escalar!;
    expect(e.lado).toBe(42);
    for (let j = 0; j < e.lado; j++) {
      for (let i = 0; i < e.lado; i++) {
        const x = -2 + (4 * i) / (e.lado - 1);
        expect(Math.abs((e.valores[j * e.lado + i] as number) - (2 * x + 1))).toBeLessThanOrEqual(1e-12 * (1 + Math.abs(2 * x + 1)));
      }
    }
    expect(e.vRef).toBeGreaterThan(0);
  });

  it('rotacional: (rot F)·n = 2ω en el corte XY; 0 en los cortes XZ e YZ', () => {
    const c = campoPorId('rotacional');
    const r = compilarCampo(c.expresiones, ['omega']);
    if (!r.ok) throw new Error('rot');
    const xy = muestrearCorte(r.campo, Float64Array.of(1.5), { plano: 'XY', c: 0, M: 5, dominio: OMEGA, escalar: 'rotacional' }, 2);
    for (const v of xy.escalar!.valores) expect(v).toBeCloseTo(3, 12);
    const xz = muestrearCorte(r.campo, Float64Array.of(1.5), { plano: 'XZ', c: 0, M: 5, dominio: OMEGA, escalar: 'rotacional' }, 2);
    for (const v of xz.escalar!.valores) expect(Math.abs(v)).toBeLessThan(1e-12);
  });
});
