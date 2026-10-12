import { describe, expect, it } from 'vitest';
import { KerrSchild } from '../metrics/kerrSchild';
import { criticalImpactParameter, shadowBoundary } from '../metrics/kerr';
import { gramSchmidtTetrad, staticObserver } from '../observers/observers';
import { CpuTracer, type CameraState } from './cpuTracer';
import { RiafModel, DEFAULT_RIAF } from '../emission/riaf';

/** Cámara estática en (D, 0, 0) mirando hacia −x con «arriba» = +z (eje de espín). */
function distantCamera(ks: KerrSchild, D: number): CameraState {
  const u = staticObserver(ks, D, 0, 0)!;
  const tet = gramSchmidtTetrad(ks, D, 0, 0, u, [
    [0, -1, 0, 0], // adelante
    [0, 0, 0, 1], // arriba
    [0, 0, 1, 0], // derecha = adelante × arriba = +y
  ]);
  // Reordenar a (u, derecha, arriba, adelante)
  return { t: 0, pos: [D, 0, 0], tetrad: { e: [tet.e[0], tet.e[3], tet.e[2], tet.e[1]] } };
}

/** Bisección del ángulo crítico (captura ↔ escape) a lo largo de una dirección del plano imagen. */
function criticalAngle(tr: CpuTracer, cam: CameraState, ux: number, uy: number, lo: number, hi: number): number {
  for (let k = 0; k < 40; k++) {
    const mid = 0.5 * (lo + hi);
    const t = Math.tan(mid);
    const res = tr.trace(cam, [ux * t, uy * t, 1]);
    if (res.status === 'capture') lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}

describe('Trazador de referencia (CPU)', () => {
  it('sombra de Schwarzschild: parámetro de impacto crítico √27 M', () => {
    const ks = new KerrSchild(0);
    const D = 1000;
    const tr = new CpuTracer(ks, null, { rEscape: 2 * D, rtol: 1e-11, atol: 1e-13 });
    const cam = distantCamera(ks, D);
    const psi = criticalAngle(tr, cam, 1, 0, 0.001, 0.02);
    // Observador estático en D: sinψ = (b/D)·√(1 − 2M/D)
    const b = (D * Math.sin(psi)) / Math.sqrt(1 - 2 / D);
    expect(Math.abs(b - Math.sqrt(27)) / Math.sqrt(27)).toBeLessThan(2e-5);
  });

  it('sombra de Kerr (a = 0,9, vista ecuatorial): bordes en −b_c⁺ y +b_c⁻ (lado prógrado a la izquierda)', () => {
    const a = 0.9;
    const ks = new KerrSchild(a);
    const D = 1e4;
    const tr = new CpuTracer(ks, null, { rEscape: 2 * D, rtol: 1e-11, atol: 1e-13 });
    const cam = distantCamera(ks, D);
    const right = (D * Math.tan(criticalAngle(tr, cam, 1, 0, 1e-5, 2e-3))) / Math.sqrt(1 - 2 / D);
    const left = (D * Math.tan(criticalAngle(tr, cam, -1, 0, 1e-5, 2e-3))) / Math.sqrt(1 - 2 / D);
    expect(Math.abs(right - criticalImpactParameter(a, false)) / right).toBeLessThan(5e-4);
    expect(Math.abs(left - criticalImpactParameter(a, true)) / left).toBeLessThan(5e-4);
    // Borde superior: comparar con el contorno de Bardeen en α = 0
    const top = (D * Math.tan(criticalAngle(tr, cam, 0, 1, 1e-5, 2e-3))) / Math.sqrt(1 - 2 / D);
    const pts = shadowBoundary(a, Math.PI / 2, 4000);
    // α del contorno con signo de Bardeen: α<0 prógrado; buscamos β en α ≈ 0
    let best = pts[0];
    for (const p of pts) if (p[1] > 0 && Math.abs(p[0]) < Math.abs(best[0])) best = p;
    expect(Math.abs(top - best[1]) / best[1]).toBeLessThan(2e-3);
  });

  it('desplazamiento al rojo de las estrellas: una cámara estática ve el cielo azulado por 1/√(1−2M/r)', () => {
    const ks = new KerrSchild(0);
    const r = 8;
    const tr = new CpuTracer(ks, null, { rEscape: 2000 });
    const cam = distantCamera(ks, r);
    const res = tr.trace(cam, [0, 0, -1]); // mirando hacia fuera
    expect(res.status).toBe('escape');
    expect(1 / res.qt).toBeCloseTo(1 / Math.sqrt(1 - 2 / r), 8);
  });

  it('con plasma: intensidad finita y positiva en el anillo, nula fuera de la región emisora', () => {
    const ks = new KerrSchild(0.5);
    const riaf = new RiafModel(ks, { ...DEFAULT_RIAF, turbulence: 0 });
    const tr = new CpuTracer(ks, riaf, { rEscape: 600, nus: [230e9], rtol: 1e-7, atol: 1e-9 });
    const cam = distantCamera(ks, 300);
    const ring = tr.trace(cam, [Math.tan(5.5 / 300), 0, 1]);
    expect(ring.I[0]).toBeGreaterThan(0);
    expect(Number.isFinite(ring.I[0])).toBe(true);
    const far = tr.trace(cam, [Math.tan(0.4), 0, 1]);
    expect(far.I[0]).toBe(0);
  });
});
