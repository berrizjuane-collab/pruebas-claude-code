import { describe, expect, it } from 'vitest';
import type { Plano } from '../math/tipos';
import { contornoCero, muestrasGlifos, posicionesEje, puntoRejilla, signoGlifo, type RejillaEscalar } from './escalar';

const DOMINIO = { min: [-2, -2, -2], max: [2, 2, 2] } as const;

/** Rejilla lado×lado de un escalar s(a, b) en coordenadas del plano (a = u, b = v). */
function rejilla(s: (a: number, b: number) => number, lado = 42, plano: Plano = 'XY', c = 0): RejillaEscalar {
  const valores = new Float64Array(lado * lado);
  const estado = new Uint8Array(lado * lado);
  for (let j = 0; j < lado; j++) {
    for (let i = 0; i < lado; i++) {
      const a = -2 + (4 * i) / (lado - 1);
      const b = -2 + (4 * j) / (lado - 1);
      const v = s(a, b);
      valores[j * lado + i] = Number.isFinite(v) ? v : NaN;
      estado[j * lado + i] = Number.isFinite(v) ? 0 : 1;
    }
  }
  return { plano, c, dominio: { min: [...DOMINIO.min], max: [...DOMINIO.max] }, lado, valores, estado };
}

const puntos = (seg: Float32Array) => Array.from({ length: seg.length / 3 }, (_, k) => [seg[3 * k]!, seg[3 * k + 1]!, seg[3 * k + 2]!]);

describe('REN-06 · curva de nivel cero', () => {
  it('T6 (div = 2x + 1): una sola polilínea recta en x = −0.5 que cruza el corte de lado a lado, encadenada', () => {
    const r = rejilla((x) => 2 * x + 1);
    const c = contornoCero(r);
    expect(c.polilineas).toBe(1);
    const p = puntos(c.segmentos);
    for (const q of p) {
      expect(q[0]).toBeCloseTo(-0.5, 6);
      expect(q[2]).toBe(0);
    }
    const ys = p.map((q) => q[1]!);
    expect(Math.min(...ys)).toBe(-2);
    expect(Math.max(...ys)).toBe(2);
    // Encadenada: cada segmento empieza donde acaba el anterior (discontinuidad regular).
    for (let k = 1; k < p.length / 2; k++) expect(p[2 * k]).toEqual(p[2 * k - 1]);
  });

  it('círculo x² + y² = 1: un ciclo cerrado con radio ≈ 1', () => {
    const c = contornoCero(rejilla((x, y) => x * x + y * y - 1));
    expect(c.polilineas).toBe(1);
    const p = puntos(c.segmentos);
    expect(p[0]).toEqual(p[p.length - 1]);
    for (const q of p) expect(Math.abs(Math.hypot(q[0]!, q[1]!) - 1)).toBeLessThan(0.01);
  });

  it('silla x·y: curvas sobre los dos ejes, con los puntos de silla resueltos', () => {
    const p = puntos(contornoCero(rejilla((x, y) => x * y)).segmentos);
    expect(p.length).toBeGreaterThan(0);
    for (const q of p) expect(Math.min(Math.abs(q[0]!), Math.abs(q[1]!))).toBeLessThan(1e-6);
  });

  it('las celdas sin valor no aportan curva', () => {
    const p = puntos(contornoCero(rejilla((x, y) => (y > 0 ? x : NaN))).segmentos);
    expect(p.length).toBeGreaterThan(0);
    for (const q of p) expect(q[1]).toBeGreaterThan(0);
  });

  it('un escalar nulo o con solo ruido de redondeo no dibuja curvas', () => {
    expect(contornoCero(rejilla(() => 0)).polilineas).toBe(0);
    let semilla = 1;
    const ruido = () => ((semilla = (semilla * 16807) % 2147483647) / 2147483647 - 0.5) * 1e-17;
    expect(contornoCero(rejilla(() => ruido())).segmentos.length).toBe(0);
    // Con escala real, el ruido de redondeo junto a un valor grande cuenta como cero.
    expect(contornoCero(rejilla((x) => (x > 1.5 ? 5 : ruido()))).segmentos.length).toBe(0);
  });

  it('planos XZ e YZ: las coordenadas (u, v) de la rejilla van a los ejes del plano', () => {
    const r = rejilla(() => 1, 5, 'XZ', 0.5);
    expect(puntoRejilla(r, 4, 0)).toEqual([2, 0.5, -2]);
    expect(puntoRejilla({ ...r, plano: 'YZ', c: -0.5 }, 0, 4)).toEqual([-0.5, -2, 2]);
  });
});

describe('REN-06 · glifos dispersos', () => {
  it('cuatro por eje, apartados de los nodos de las flechas', () => {
    expect(posicionesEje(-2, 2, 9)).toEqual([-1.25, -0.25, 0.25, 1.25]);
    expect(posicionesEje(-2, 2, 21)).toEqual([-1.5, -0.5, 0.5, 1.5]);
    expect(posicionesEje(-2, 2, 5)).toEqual([-1.5, -0.5, 0.5, 1.5]);
  });

  it('T6: «−» a la izquierda de x = −0.5 y «+» a la derecha; nada por debajo del 2 % de V_ref; × sin valor', () => {
    const r = rejilla((x) => 2 * x + 1);
    const m = muestrasGlifos(r, [9, 9]);
    expect(m.valor.length).toBe(16);
    for (let k = 0; k < 16; k++) {
      const x = m.pos[3 * k]!;
      expect(m.valor[k]).toBeCloseTo(2 * x + 1, 9);
      expect(signoGlifo(m.valor[k]!, 5)).toBe(x < -0.5 ? -1 : 1);
    }
    expect(signoGlifo(0.05, 5)).toBe(0);
    expect(signoGlifo(-0.11, 5)).toBe(-1);
    expect(signoGlifo(NaN, 5)).toBeNaN();
    const sinValor = muestrasGlifos(rejilla((x) => (x > 0 ? x : NaN)), [9, 9]);
    for (let k = 0; k < 16; k++) expect(Number.isNaN(sinValor.valor[k]!)).toBe(sinValor.pos[3 * k]! < 0);
  });
});
