import { describe, expect, it } from 'vitest';
import { compilarCampo } from '../field';
import { campoPorId } from '../catalog';
import { AUXILIARES } from '../catalog/auxiliares';
import type { EvaluadorCampo } from '../tipos';

/**
 * V-PERF-05 (informativo): evaluación de F con cierres compilados frente a funciones
 * nativas. Solo se ejecuta con MEDIR=1: `MEDIR=1 npx vitest run evaluacion.medida`.
 */
const N = 200_000;
const salida = new Float64Array(3);
const q = Float64Array.from({ length: 3 * N }, (_, i) => Math.sin(i * 12.9898) * 2);

function medir(f: EvaluadorCampo, p: Float64Array): number {
  const tiempos: number[] = [];
  for (let rep = 0; rep < 18; rep++) {
    const t0 = performance.now();
    for (let i = 0; i < N; i++) f(q[3 * i] as number, q[3 * i + 1] as number, q[3 * i + 2] as number, p, salida, 0);
    if (rep >= 3) tiempos.push(performance.now() - t0); // 3 de calentamiento
  }
  tiempos.sort((a, b) => a - b);
  return tiempos[Math.floor(tiempos.length / 2)] as number;
}

describe.skipIf(!process.env.MEDIR)('V-PERF-05 · cierres compilados frente a nativo', () => {
  const casos = [
    { nombre: 'helicoidal', nativo: campoPorId('helicoidal').F, expr: campoPorId('helicoidal').expresiones, params: ['a'], p: Float64Array.of(0.25) },
    { nombre: 'T1 sin/exp/cos', nativo: AUXILIARES[0]!.F, expr: AUXILIARES[0]!.expresiones, params: [], p: new Float64Array(0) },
    { nombre: 'T2 x/r^3', nativo: AUXILIARES[1]!.F, expr: AUXILIARES[1]!.expresiones, params: [], p: new Float64Array(0) },
  ];
  for (const c of casos) {
    it(c.nombre, () => {
      const r = compilarCampo(c.expr, c.params);
      if (!r.ok) throw new Error(c.nombre);
      const tn = medir(c.nativo, c.p);
      const tc = medir(r.campo.F, c.p);
      const ns = (t: number) => ((t * 1e6) / N).toFixed(1);
      console.log(`${c.nombre}: nativo ${ns(tn)} ns/eval · compilado ${ns(tc)} ns/eval · proporción ${(tc / tn).toFixed(2)}×`);
      expect(tc).toBeGreaterThan(0);
    });
  }
});
