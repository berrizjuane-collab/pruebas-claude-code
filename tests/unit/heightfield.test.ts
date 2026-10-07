import { describe, expect, it } from 'vitest';
import { HeightGrid, dilateGrid, rayBlocked, TerrainSampler } from '../../src/geo/heightfield.ts';
import { ridgeGrid } from './helpers.ts';

describe('campos de altura', () => {
  const g = ridgeGrid();
  it('bilineal reproduce los vértices y fija el borde', () => {
    expect(g.sample(0, 0)).toBeCloseTo(7000, 3);
    expect(g.sample(-1e6, 0)).toBeCloseTo(g.sample(-5000, 0), 6);
  });
  it('el filtro de máximo es ≥ el original en todo punto', () => {
    const d = dilateGrid(g, 120);
    for (let k = 0; k < g.data.length; k += 97) expect(d.data[k]).toBeGreaterThanOrEqual(g.data[k]);
    expect(d.sample(-150, 0)).toBeCloseTo(7000, 0);
  });
  it('la arista bloquea la visual entre dos puntos bajos a ambos lados', () => {
    expect(rayBlocked(g, -3000, 0, 5200, 3000, 0, 5200)).toBe(true);
  });
  it('no bloquea una visual por encima de la arista ni la que llega a un ancla en la ladera', () => {
    expect(rayBlocked(g, -3000, 0, 8000, 3000, 0, 8000)).toBe(false);
    expect(rayBlocked(g, -4000, 0, 7600, -400, 0, g.sample(-400, 0) + 5)).toBe(false);
  });
  it('el muestreador usa el anillo más fino que contiene el punto', () => {
    const fine = new HeightGrid(3, 10, 10, new Float32Array(9).fill(1));
    const coarse = new HeightGrid(3, 100, 100, new Float32Array(9).fill(2));
    const s = new TerrainSampler([fine, coarse]);
    expect(s.heightAt(0, 0)).toBe(1);
    expect(s.heightAt(50, 0)).toBe(2);
  });
});
