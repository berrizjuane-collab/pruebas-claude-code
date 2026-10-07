import { describe, expect, it } from 'vitest';
import { buildRing, gridIndices, normalTexture } from '../../src/terrain/build.ts';
import { ridgeGrid } from './helpers.ts';

describe('construcción de bloques del terreno', () => {
  const g = ridgeGrid();
  const ring = buildRing({ name: 'core', n: g.n, spacing: g.spacing, half: g.half, chunksPerSide: 4, steps: [1, 2, 5, 10] }, g.data, 6000);
  it('cajas envolventes no vacías y con Z = −norte (regresión: cajas invertidas)', () => {
    for (const c of ring.chunks) {
      for (let a = 0; a < 3; a++) expect(c.max[a]).toBeGreaterThan(c.min[a]);
    }
    const nw = ring.chunks.find((c) => c.ci === 0 && c.cj === 0)!;
    expect(nw.min[2]).toBeCloseTo(-g.half); // fila 0 = norte = Z mínima
    expect(nw.min[0]).toBeCloseTo(-g.half);
  });
  it('error nulo en el nivel completo y no decreciente al engrosar', () => {
    for (const c of ring.chunks) {
      expect(c.levels[0].error).toBe(0);
      for (let l = 1; l < c.levels.length; l++) expect(c.levels[l].error + 1e-6).toBeGreaterThanOrEqual(c.levels[l - 1].error * 0.999);
    }
  });
  it('los vértices de la malla completa están sobre el DEM (y = altitud − h0)', () => {
    const c = ring.chunks[5];
    const p = c.levels[0].positions;
    for (let v = 0; v < 50; v++) {
      const x = p[3 * v];
      const y = p[3 * v + 1];
      const z = p[3 * v + 2];
      expect(y + 6000).toBeCloseTo(g.sample(x, -z), 2);
    }
  });
  it('la altura de morph del nivel más grueso es la propia', () => {
    for (const c of ring.chunks) {
      const lv = c.levels[c.levels.length - 1];
      for (let v = 0; v < lv.morph.length; v++) expect(lv.morph[v]).toBeCloseTo(lv.positions[3 * v + 1], 4);
    }
  });
  it('índices: 2 triángulos por celda + faldones con ambas orientaciones', () => {
    const k = 10;
    expect(gridIndices(k).length / 3).toBe(2 * k * k + 4 * k * 4);
  });
  it('las normales apuntan hacia arriba y hacia fuera de la arista', () => {
    const nt = normalTexture(g.data, g.n, g.spacing);
    const at = (i: number, j: number) => [nt[(i * g.n + j) * 4] / 127.5 - 1, nt[(i * g.n + j) * 4 + 1] / 127.5 - 1];
    const mid = Math.floor(g.n / 2);
    expect(at(mid, mid - 10)[1]).toBeGreaterThan(0.3); // ny > 0
    expect(at(mid, mid - 10)[0]).toBeLessThan(0); // ladera oeste: normal hacia −X
    expect(at(mid, mid + 10)[0]).toBeGreaterThan(0);
  });
  it('padres 2×2: su nivel p tiene exactamente los vértices del nivel p + 1 de cada hijo (cambio sin salto)', () => {
    const spec = { name: 'core' as const, n: g.n, spacing: g.spacing, half: g.half, chunksPerSide: 2, steps: [1, 2, 4] };
    const kids = buildRing(spec, g.data, 6000);
    const parents = buildRing({ ...spec, chunksPerSide: 1, steps: spec.steps.map((s) => 2 * s) }, g.data, 6000);
    const parent = parents.chunks[0];
    const cells = (g.n - 1) / 2;
    for (const child of kids.chunks) {
      for (let l = 0; l + 1 < child.levels.length; l++) {
        const step = spec.steps[l + 1];
        const kc = cells / step + 1; // vértices por lado del hijo en ese nivel
        const kp = (2 * cells) / step + 1; // del padre
        const cp = child.levels[l + 1].positions;
        const pp = parent.levels[l].positions;
        for (let r = 0; r < kc; r++)
          for (let c = 0; c < kc; c++) {
            const R = (child.ci * cells) / step + r;
            const C = (child.cj * cells) / step + c;
            for (let a = 0; a < 3; a++) expect(pp[3 * (R * kp + C) + a]).toBeCloseTo(cp[3 * (r * kc + c) + a], 3);
          }
      }
    }
  });
});
