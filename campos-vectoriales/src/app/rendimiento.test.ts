/**
 * VAL-03: las escenas reproducibles son configuraciones válidas y coinciden con VALIDATION §6.2;
 * los percentiles del informe.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { importarConfiguracion } from '../state/persist';
import { estadistica } from './rendimiento';

const escena = (id: string) => {
  const texto = readFileSync(`tests/fixtures/perf-${id}.json`, 'utf8');
  const r = importarConfiguracion(texto, texto.length);
  if (!r.ok) throw new Error(r.errores.map((e) => `${e.ruta}: ${e.mensaje}`).join('; '));
  expect(r.avisos).toEqual([]);
  return r.estado;
};
const semillas = (s: ReturnType<typeof escena>['lineas']['semillas']) => (s.tipo === 'rejilla' ? s.nu * s.nv : s.tipo === 'aleatoria' ? s.n : 1);

describe('escenas de rendimiento (VALIDATION §6.2)', () => {
  it('PERF-A: helicoidal a = 0.25, Ω = [−2, 2]³, N = 15, 128 semillas en XZ (16 × 8), corte XY z = 0 con M = 41 y div F, 1000 partículas', () => {
    const e = escena('A');
    expect(e.base).toBe('helicoidal');
    expect(e.parametros).toEqual([expect.objectContaining({ nombre: 'a', valor: 0.25 })]);
    expect(e.dominio).toEqual({ min: [-2, -2, -2], max: [2, 2, 2] });
    expect(e.muestreo.n).toEqual([15, 15, 15]);
    expect(e.lineas.semillas).toMatchObject({ tipo: 'rejilla', plano: 'XZ', nu: 16, nv: 8 });
    expect(e.lineas.paso).toBeNull(); // h = Δ/8 por defecto
    expect(e.corte).toMatchObject({ activo: true, plano: 'XY', c: 0, escalar: 'divergencia' });
    expect(e.muestreo.corteResolucion).toBe(41);
    expect(e.capas.particulas).toBe(true);
    expect(e.particulas.n).toBe(1000);
  });

  it('PERF-B: igual con N = 21, 256 semillas, M = 61 y 2000 partículas', () => {
    const a = escena('A');
    const b = escena('B');
    expect(b.muestreo.n).toEqual([21, 21, 21]);
    expect(semillas(b.lineas.semillas)).toBe(256);
    expect(b.muestreo.corteResolucion).toBe(61);
    expect(b.particulas.n).toBe(2000);
    expect(b.campo).toEqual(a.campo);
    expect(b.corte).toEqual(a.corte);
  });

  it('PERF-C: rotacional con flechas y líneas (48 semillas), sin partículas ni corte', () => {
    const c = escena('C');
    expect(c.base).toBe('rotacional');
    expect(c.parametros.map((p) => p.nombre)).toEqual(['omega']);
    expect(semillas(c.lineas.semillas)).toBe(48);
    expect(c.capas).toMatchObject({ flechas: true, lineas: true, particulas: false });
    expect(c.corte.activo).toBe(false);
  });
});

describe('percentiles del informe', () => {
  it('p50, p95, p99 y máximo por rango (sin interpolar)', () => {
    const v = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(estadistica(v)).toEqual({ n: 100, p50: 50, p95: 95, p99: 99, max: 100 });
    expect(estadistica([7])).toEqual({ n: 1, p50: 7, p95: 7, p99: 7, max: 7 });
  });
});
