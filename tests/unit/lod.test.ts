import { describe, expect, it } from 'vitest';
import { distanceToBox, parentTarget, projectionFactor, screenError, selectLevel } from '../../src/terrain/lod.ts';

describe('LOD por error en pantalla', () => {
  const errors = [0, 4, 12, 30];
  const k = projectionFactor(900, 42);
  it('cerca → nivel fino; lejos → grueso', () => {
    expect(selectLevel(errors, 300, k, 2, -1)).toBe(0);
    expect(selectLevel(errors, 60000, k, 2, -1)).toBe(3);
  });
  it('respeta el umbral τ', () => {
    for (const d of [800, 2000, 5000, 12000, 30000]) {
      const l = selectLevel(errors, d, k, 2, -1);
      expect(screenError(errors[l], d, k)).toBeLessThanOrEqual(2);
    }
  });
  it('histéresis: no oscila en torno al umbral de cambio', () => {
    // distancia exacta del cambio 1→2 para τ = 2
    const dSwitch = (errors[2] * k) / 2;
    let level = 1;
    const seq: number[] = [];
    for (const f of [0.99, 1.01, 0.995, 1.005, 0.99, 1.02, 1.0]) {
      level = selectLevel(errors, dSwitch * f, k, 2, level);
      seq.push(level);
    }
    expect(new Set(seq).size).toBe(1);
  });
  it('distancia a caja: 0 dentro, euclídea fuera', () => {
    expect(distanceToBox(0, 0, 0, -1, -1, -1, 1, 1, 1)).toBe(0);
    expect(distanceToBox(4, 5, 0, -1, -1, -1, 1, 1, 1)).toBeCloseTo(5);
  });
  it('padre 2×2: se usa si todos los hijos visibles admiten nivel ≥ 1, con el nivel del más exigente', () => {
    const vis = [true, true, true, true];
    expect(parentTarget([1, 2, 3, 2], vis, 4)).toBe(0); // hijo más fino en 1 → padre en 0 (mismos vértices)
    expect(parentTarget([3, 3, 2, 3], vis, 4)).toBe(1);
    expect(parentTarget([0, 3, 3, 3], vis, 4)).toBe(-1); // un hijo necesita la resolución completa
    // los hijos fuera del encuadre no imponen detalle; sin ninguno visible, el padre más grueso
    expect(parentTarget([0, 2, 3, 3], [false, true, true, true], 4)).toBe(1);
    expect(parentTarget([0, 0, 0, 0], [false, false, false, false], 4)).toBe(3);
  });
});
