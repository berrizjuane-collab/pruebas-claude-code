import { describe, expect, it } from 'vitest';
import { distanciaEncuadre, esfericaDesdePosicion, interpolarEsferica, marcasEje, posicionDesdeEsferica, VISTAS } from './camara';

describe('cámara (z hacia arriba)', () => {
  it('ida y vuelta esférica ↔ cartesiana', () => {
    const e = { radio: 7, polar: 1.1, azimut: -2.3 };
    const p = posicionDesdeEsferica([1, 2, 3], e);
    const r = esfericaDesdePosicion([1, 2, 3], p);
    expect(r.radio).toBeCloseTo(7, 12);
    expect(r.polar).toBeCloseTo(1.1, 12);
    expect(r.azimut).toBeCloseTo(-2.3, 12);
  });

  it('vistas: XZ mira desde −y, YZ desde +x, XY desde +z', () => {
    const xz = posicionDesdeEsferica([0, 0, 0], { radio: 1, ...VISTAS.XZ });
    expect(xz[1]).toBeCloseTo(-1, 12);
    const yz = posicionDesdeEsferica([0, 0, 0], { radio: 1, ...VISTAS.YZ });
    expect(yz[0]).toBeCloseTo(1, 12);
    const xy = posicionDesdeEsferica([0, 0, 0], { radio: 1, ...VISTAS.XY });
    expect(xy[2]).toBeCloseTo(1, 6);
  });

  it('interpola el azimut por el camino más corto', () => {
    const m = interpolarEsferica({ radio: 1, polar: 1, azimut: 3 }, { radio: 1, polar: 1, azimut: -3 }, 0.5);
    expect(Math.abs(Math.abs(m.azimut) - Math.PI)).toBeLessThan(0.3);
  });

  it('encuadre: la esfera de Ω cabe en el campo de visión', () => {
    const d = distanciaEncuadre({ min: [-2, -2, -2], max: [2, 2, 2] }, 35, 16 / 9);
    expect(d).toBeGreaterThan(Math.sqrt(12));
    expect(d).toBeLessThan(15);
  });
});

describe('marcas de los ejes', () => {
  it('[−2, 2] → −2 … 2', () => expect(marcasEje(-2, 2)).toEqual([-2, -1, 0, 1, 2]));
  it('[0, 10] → pasos de 2.5', () => expect(marcasEje(0, 10)).toEqual([0, 2.5, 5, 7.5, 10]));
  it('[−0.3, 0.7] → pasos de 0.25', () => expect(marcasEje(-0.3, 0.7)).toEqual([-0.25, 0, 0.25, 0.5]));
});
