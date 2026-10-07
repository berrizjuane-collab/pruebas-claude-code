import { describe, expect, it } from 'vitest';
import { altToY, bearingOf, localToScene, sceneToLocal, yToAlt } from '../../src/geo/frame.ts';
import { loadData } from './helpers.ts';

describe('marco de la escena y altitudes', () => {
  const { manifest } = loadData();
  const frame = { h0: manifest.sistema.h0 };
  it('el umbral de 8000 m se representa en y = 8000 − h0', () => {
    expect(altToY(frame, 8000)).toBe(8000 - manifest.sistema.h0);
    expect(yToAlt(frame, altToY(frame, 8000))).toBe(8000);
  });
  it('local ↔ escena es reversible y el norte es −Z', () => {
    const [X, Y, Z] = localToScene(frame, 1200, 3400, 7300);
    expect(Z).toBe(-3400);
    expect(Y).toBe(7300 - frame.h0);
    expect(sceneToLocal(frame, X, Y, Z)).toEqual([1200, 3400, 7300]);
  });
  it('rumbos: norte 0°, este 90°, sur 180°, oeste 270°', () => {
    expect(bearingOf(0, -1)).toBeCloseTo(0);
    expect(bearingOf(1, 0)).toBeCloseTo(90);
    expect(bearingOf(0, 1)).toBeCloseTo(180);
    expect(bearingOf(-1, 0)).toBeCloseTo(270);
  });
});
