import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { decodePng } from '../../src/data/png.ts';
import { loadData, loadGrid, readJson } from './helpers.ts';

describe('lector PNG de datos', () => {
  it('decodifica las alturas de 16 bits del núcleo igual que el pipeline', () => {
    const fx = readJson<{ muestras: { x: number; y: number; h: number }[] }>('tests/fixtures/heights.json');
    const g = loadGrid('core');
    for (const s of fx.muestras) expect(Math.abs(g.sample(s.x, s.y) - s.h)).toBeLessThan(0.02);
  });
  it('la cumbre del modelo vale 8611 m tras la corrección local', () => {
    const { manifest } = loadData();
    const g = loadGrid('core');
    expect(g.sample(manifest.cumbre.modelo.x, manifest.cumbre.modelo.y)).toBeCloseTo(8611, 0);
    expect(g.max()).toBeLessThan(8611.6);
  });
  it('lee PNG RGB de 8 bits (máscara auxiliar con clases FLM válidas)', () => {
    const png = decodePng(readFileSync(resolve(__dirname, '../../public/data/aux_core.png')));
    expect(png.channels).toBe(3);
    expect(png.depth).toBe(8);
    const classes = new Set<number>();
    for (let k = 0; k < png.width * png.height; k++) classes.add(png.data[3 * k]);
    for (const c of classes) expect([1, 2, 3, 4, 5, 6, 7, 8, 9]).toContain(c);
  });
  it('rechaza archivos que no son PNG', () => {
    expect(() => decodePng(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]))).toThrow();
  });
});
