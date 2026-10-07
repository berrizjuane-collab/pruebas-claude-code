import { describe, expect, it } from 'vitest';
import { createTMercator } from '../../src/geo/tmerc.ts';
import { readJson } from './helpers.ts';

interface Fixture { muestras: { lon: number; lat: number; x: number; y: number }[] }

describe('Transversa de Mercator local (igual que el pipeline/pyproj)', () => {
  const fx = readJson<Fixture>('tests/fixtures/projection.json');
  const tm = createTMercator(35.8825, 76.5133);
  it('el origen es la coordenada publicada de la cumbre', () => {
    const [x, y] = tm.forward(76.5133, 35.8825);
    expect(Math.abs(x)).toBeLessThan(1e-6);
    expect(Math.abs(y)).toBeLessThan(1e-6);
  });
  it.each(fx.muestras.map((s) => [s]))('directa coincide con pyproj a < 1 mm (%#)', (s) => {
    const [x, y] = tm.forward(s.lon, s.lat);
    expect(Math.abs(x - s.x)).toBeLessThan(1e-3);
    expect(Math.abs(y - s.y)).toBeLessThan(1e-3);
  });
  it('inversa recupera lon/lat a < 1e-9°', () => {
    for (const s of fx.muestras) {
      const [lon, lat] = tm.inverse(s.x, s.y);
      expect(Math.abs(lon - s.lon)).toBeLessThan(1e-9);
      expect(Math.abs(lat - s.lat)).toBeLessThan(1e-9);
    }
  });
  it('es conforme y casi isométrica en el área (escala ≈ 1 a 20 km)', () => {
    const [x1, y1] = tm.forward(76.5133, 35.8825 + 0.18);
    // 0,18° de latitud ≈ 19,97 km en el meridiano central
    expect(Math.abs(Math.hypot(x1, y1) - 19970)).toBeLessThan(30);
  });
});
