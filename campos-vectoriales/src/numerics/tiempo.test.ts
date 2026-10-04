import { describe, expect, it } from 'vitest';
import { campoPorId, valoresParametros, type CampoCatalogo } from '../math/catalog';
import { compilarCampo, vectorEvaluacion } from '../math/field';
import type { Dominio, Vec3 } from '../math/tipos';
import { crearMalla, escalaAutomatica, escalaEnVentana, instantesVentana, muestrearMalla } from './grid';
import { pasoRK4Tiempo, SistemaParticulas } from './particles';
import { integrarLinea, opcionesPorDefecto } from './streamlines';

/** Registra un error medido (VALIDATION §2.2). */
const medida = (t: string, que: string, valor: string) => console.log(`MEDIDA ${t} · ${que}: ${valor}`);
const OMEGA: Dominio = { min: [-2, -2, -2], max: [2, 2, 2] };
const GRANDE: Dominio = { min: [-50, -50, -50], max: [50, 50, 50] };

/** Integra la trayectoria de (r0, t0) hasta t1 con pasos δt (RK4 no autónomo, SPEC §5.11). */
function integrar(c: CampoCatalogo, valores: number[], r0: Vec3, t0: number, t1: number, dt: number): Float64Array {
  const p = vectorEvaluacion(valores, t0);
  const r = Float64Array.from(r0);
  const n = Math.round((t1 - t0) / dt);
  const k = new Float64Array(12);
  for (let i = 0; i < n; i++) pasoRK4Tiempo(c.F, p, r, dt, k, t0 + i * dt);
  return r;
}

const errorRelativo = (a: ArrayLike<number>, b: ArrayLike<number>) =>
  Math.hypot((a[0] as number) - (b[0] as number), (a[1] as number) - (b[1] as number), (a[2] as number) - (b[2] as number)) /
  Math.max(1, Math.hypot(b[0] as number, b[1] as number, b[2] as number));

/** Casos de V-NUM-17: los tres campos de SPEC §4.9 (silla giratoria con ω > k, ω < k y ω = k). */
const CASOS: { nombre: string; id: Parameters<typeof campoPorId>[0]; valores?: number[] }[] = [
  { nombre: 'viento giratorio', id: 'viento-giratorio' },
  { nombre: 'lluvia con ráfagas', id: 'lluvia' },
  { nombre: 'silla giratoria ω > k (atrapada)', id: 'silla-giratoria', valores: [1, 1.5] },
  { nombre: 'silla giratoria ω < k (escapa)', id: 'silla-giratoria', valores: [1, 0.6] },
  { nombre: 'silla giratoria ω = k', id: 'silla-giratoria', valores: [1, 1] },
];

describe('V-NUM-17 · trayectorias no autónomas frente a las soluciones exactas', () => {
  const r0: Vec3 = [0.6, -0.4, 0.3];
  const t0 = 0.3;
  for (const caso of CASOS) {
    const c = campoPorId(caso.id);
    const valores = caso.valores ?? Array.from(valoresParametros(c.parametros));
    it(`${caso.nombre}: δt = 0.01 hasta t₀ + 2π, error relativo ≤ 10⁻⁷ (T-22)`, () => {
      const t1 = t0 + 2 * Math.PI;
      const r = integrar(c, valores, r0, t0, t1, 0.01);
      const exacta = c.tiempo!.trayectoria(r0, t0, t0 + Math.round((t1 - t0) / 0.01) * 0.01, vectorEvaluacion(valores, 0));
      const e = errorRelativo(r, exacta);
      medida('T-22', `${caso.nombre}, δt = 0.01, t₀ + 2π`, e.toExponential(2));
      expect(e).toBeLessThanOrEqual(1e-7);
    });

    it(`${caso.nombre}: orden de convergencia p ∈ [3.8, 4.2] (T-23)`, () => {
      const errores = [0.1, 0.05, 0.025].map((dt) => errorRelativo(integrar(c, valores, r0, t0, t0 + 1, dt), c.tiempo!.trayectoria(r0, t0, t0 + 1, vectorEvaluacion(valores, 0))));
      const ordenes = errores.slice(1).map((e, i) => Math.log2((errores[i] as number) / e));
      medida('T-23', `orden en t, ${caso.nombre}`, ordenes.map((o) => o.toFixed(3)).join(' / '));
      for (const o of ordenes) {
        expect(o).toBeGreaterThanOrEqual(3.8);
        expect(o).toBeLessThanOrEqual(4.2);
      }
    });
  }

  it('el sistema de partículas sigue la trayectoria exacta con el reloj (viento giratorio, 4 s reales)', () => {
    const c = campoPorId('viento-giratorio');
    const valores = [1, 1];
    const sis = new SistemaParticulas({ n: 5, semilla: 3, dominio: GRANDE, vidaMax: 1e9 });
    const inicio = Array.from(sis.pos);
    const p = vectorEvaluacion(valores, 0);
    let t = 0.4;
    const t0 = t;
    const tau = 0.75;
    for (let k = 0; k < 240; k++) {
      sis.avanzar(c.F, p, 1 / 60, tau, 1, 0.5, t);
      t += tau / 60;
    }
    expect(p[2]).toBe(0); // la ranura de t vuelve a su valor
    for (let i = 0; i < 5; i++) {
      const r0: Vec3 = [inicio[3 * i] as number, inicio[3 * i + 1] as number, inicio[3 * i + 2] as number];
      const e = errorRelativo(sis.pos.subarray(3 * i, 3 * i + 3), c.tiempo!.trayectoria(r0, t0, t, p));
      expect(e).toBeLessThan(1e-9);
    }
  });

  it('un paso con t restaura la ranura del instante y sin t es el RK4 autónomo de siempre', () => {
    const c = campoPorId('silla');
    const p = vectorEvaluacion([1], 7);
    const a = Float64Array.of(0.3, 1.2, 0);
    const b = Float64Array.of(0.3, 1.2, 0);
    pasoRK4Tiempo(c.F, p, a, 0.01, undefined, 2.5);
    pasoRK4Tiempo(c.F, Float64Array.of(1), b, 0.01);
    expect(p[1]).toBe(7);
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});

describe('V-NUM-18 · líneas de corriente instantáneas', () => {
  it('con t = t*, iguales bit a bit a las del campo «congelado» (t sustituido por el número)', () => {
    const tEstrella = 0.75;
    const viva = compilarCampo({ P: 'V*cos(w*t) - 0.3*y', Q: 'V*sin(w*t) + 0.3*x', R: '0.1*t' }, ['V', 'w']);
    const congelada = compilarCampo({ P: 'V*cos(w*0.75) - 0.3*y', Q: 'V*sin(w*0.75) + 0.3*x', R: '0.1*0.75' }, ['V', 'w']);
    if (!viva.ok || !congelada.ok) throw new Error('no compila');
    const o = opcionesPorDefecto(OMEGA, 0.5, 2);
    for (const s of [[0.5, 0, 0], [-1, 1, 0.2], [0, -1.5, -1]] as Vec3[]) {
      const a = integrarLinea(viva.campo.F, vectorEvaluacion([1.2, 0.9], tEstrella), s, o);
      const b = integrarLinea(congelada.campo.F, Float64Array.of(1.2, 0.9), s, o);
      if ('descartada' in a || 'descartada' in b) throw new Error('descartada');
      expect(Array.from(a.puntos)).toEqual(Array.from(b.puntos));
    }
  });

  it('viento giratorio: rectas de dirección (cos ωt*, sin ωt*, 0)', () => {
    const c = campoPorId('viento-giratorio');
    const t = 1.1;
    const linea = integrarLinea(c.F, vectorEvaluacion([1, 1], t), [0, 0, 0.5], opcionesPorDefecto(OMEGA, 0.5, 1));
    if ('descartada' in linea) throw new Error('descartada');
    const d = [Math.cos(t), Math.sin(t)];
    for (let i = 0; i < linea.n; i++) {
      const [x, y, z] = [linea.puntos[3 * i] as number, linea.puntos[3 * i + 1] as number, linea.puntos[3 * i + 2] as number];
      expect(Math.abs(x * (d[1] as number) - y * (d[0] as number))).toBeLessThan(1e-12); // sobre la recta
      expect(z).toBe(0.5);
    }
  });
});

describe('V-NUM-19 · F_ref en la ventana temporal', () => {
  it('instantes: 9 equiespaciados con el último exactamente t₁', () => {
    const t = instantesVentana(0, 4 * Math.PI);
    expect(t).toHaveLength(9);
    expect(t[0]).toBe(0);
    expect(t[8]).toBe(4 * Math.PI);
    expect(t[4]).toBeCloseTo(2 * Math.PI, 14);
  });

  it('P95 sobre nodos e instantes, independiente del t mostrado; t·(x, y, z) conserva la escala y crece', () => {
    const r = compilarCampo({ P: 't*x', Q: 't*y', R: 't*z' }, []);
    if (!r.ok) throw new Error('no compila');
    const malla = crearMalla(OMEGA, [9, 9, 9]);
    const escalas = [0, 0.5, 2].map((t) => escalaEnVentana(r.campo.F, vectorEvaluacion([], t), malla, 0, 2));
    expect(new Set(escalas.map((e) => e.ref)).size).toBe(1);
    expect(escalas[0]!.ventana).toEqual([0, 2]);
    // A mano: P95 de la unión de ‖t_j·r_i‖ = la de 9 copias escaladas de las normas de la malla.
    const normas = muestrearMalla(r.campo.F, vectorEvaluacion([], 1), malla);
    const union = new Float64Array(9 * normas.total);
    const clase = new Uint8Array(9 * normas.total);
    instantesVentana(0, 2).forEach((tj, j) => normas.mag.forEach((m, i) => (union[j * normas.total + i] = tj * m)));
    expect(escalas[0]!.ref).toBe(escalaAutomatica(union, clase).ref);
    // Las flechas crecen con t: la magnitud en un nodo es proporcional a t.
    const m1 = muestrearMalla(r.campo.F, vectorEvaluacion([], 0.5), malla).mag[100] as number;
    const m2 = muestrearMalla(r.campo.F, vectorEvaluacion([], 1.5), malla).mag[100] as number;
    expect(m2 / m1).toBeCloseTo(3, 12);
  });
});

describe('V-NUM-20 · líneas de traza (emisión desde semillas)', () => {
  it('viento giratorio: las partículas de una semilla están sobre el arco exacto (T-26) y salen escalonadas', () => {
    const c = campoPorId('viento-giratorio');
    const semilla: Vec3 = [0.2, -0.1, 0.4];
    const S = Float64Array.from(semilla);
    const vida = 4;
    const sis = new SistemaParticulas({ n: 8, semilla: 1, dominio: GRANDE, semillas: S, vidaMax: vida });
    expect(Array.from(sis.espera)).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]);
    const p = vectorEvaluacion([1, 1], 0);
    const tau = 1;
    let t = 0;
    for (let k = 0; k < 155; k++) {
      sis.avanzar(c.F, p, 1 / 60, tau, 1, 0.5, t);
      t += tau / 60;
    }
    // La línea de traza en t: arco de la circunferencia de radio V/ω centrada en p + (V/ω)(sin ωt, −cos ωt, 0).
    const centro = [semilla[0] + Math.sin(t), semilla[1] - Math.cos(t)];
    let enVuelo = 0;
    for (let i = 0; i < sis.n; i++) {
      if (!sis.enVuelo(i)) continue;
      enVuelo++;
      const d = Math.hypot((sis.pos[3 * i] as number) - (centro[0] as number), (sis.pos[3 * i + 1] as number) - (centro[1] as number));
      expect(Math.abs(d - 1), `partícula ${i}`).toBeLessThan(1e-6);
      expect(sis.pos[3 * i + 2]).toBe(semilla[2]);
    }
    // 155 fotogramas ≈ 2.58 s: han salido las de espera 0, 0.5, 1, 1.5, 2 y 2.5 (6 de 8).
    expect(enVuelo).toBe(6);
  });
});
