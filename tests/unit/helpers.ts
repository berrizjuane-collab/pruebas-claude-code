import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { decodeHeights, decodePng } from '../../src/data/png.ts';
import { HeightGrid, TerrainSampler } from '../../src/geo/heightfield.ts';
import type { AtlasData, Manifest, RingName } from '../../src/data/types.ts';

const root = resolve(__dirname, '../..');
export const readJson = <T>(rel: string): T => JSON.parse(readFileSync(resolve(root, rel), 'utf8')) as T;

export function loadData(): AtlasData {
  return {
    manifest: readJson('public/data/manifest.json'),
    routes: readJson('public/data/routes.json'),
    pois: readJson('public/data/pois.json'),
    serac: readJson('public/data/serac.json'),
  };
}

const cache = new Map<RingName, HeightGrid>();
export function loadGrid(ring: RingName, m: Manifest = loadData().manifest): HeightGrid {
  if (!cache.has(ring)) {
    const spec = m.rejillas[ring];
    const png = decodePng(readFileSync(resolve(root, 'public/data', spec.archivo)));
    cache.set(ring, new HeightGrid(spec.muestras, spec.espaciado, spec.semilado, decodeHeights(png, m.alturas.offset, m.alturas.escala)));
  }
  return cache.get(ring)!;
}

export function realSampler(): TerrainSampler {
  return new TerrainSampler([loadGrid('core'), loadGrid('context'), loadGrid('far')]);
}

/** Terreno sintético: llanura a 5000 m con una arista gaussiana N–S de 2000 m en x = 0. */
export function ridgeGrid(): HeightGrid {
  const n = 201;
  const spacing = 50;
  const half = 5000;
  const data = new Float32Array(n * n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const x = -half + j * spacing;
      data[i * n + j] = 5000 + 2000 * Math.exp(-(x * x) / (2 * 600 * 600));
    }
  return new HeightGrid(n, spacing, half, data);
}
