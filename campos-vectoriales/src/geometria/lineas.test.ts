import { describe, expect, it } from 'vitest';
import { MOTIVOS } from '../numerics/streamlines';
import { FINAL, geometriaLineas } from './lineas';

const M = (nombre: (typeof MOTIVOS)[number]) => MOTIVOS.indexOf(nombre);

describe('REN-03 · geometría de las líneas', () => {
  // Dos líneas: una recta de 4 puntos (x = 0…3) y una de 3 puntos sobre el eje y.
  const posiciones = Float32Array.from([0, 0, 0, 1, 0, 0, 2, 0, 0, 3, 0, 0, 0, 0, 1, 0, 1, 1, 0, 2, 1]);
  const inicio = Uint32Array.from([0, 4, 7]);
  const semilla = Uint32Array.from([1, 0]);
  const motivos = Uint8Array.from([M('CERO'), M('SALE_DOMINIO'), 255, M('NO_DEFINIDO')]);

  it('un segmento por par de puntos consecutivos, sin unir líneas distintas', () => {
    const g = geometriaLineas(posiciones, inicio, semilla, motivos, 2, 1.5);
    expect(g.segmentos.length).toBe(6 * (3 + 2));
    expect(Array.from(g.segmentos.slice(0, 6))).toEqual([0, 0, 0, 1, 0, 0]);
    // El último segmento de la línea 0 termina en (3, 0, 0); el siguiente empieza en (0, 0, 1).
    expect(Array.from(g.segmentos.slice(12, 18))).toEqual([2, 0, 0, 3, 0, 0]);
    expect(Array.from(g.segmentos.slice(18, 24))).toEqual([0, 0, 1, 0, 1, 1]);
  });

  it('cheurones cada 1.5 de longitud de arco, empezando a 0.75, con la tangente en el sentido de +F', () => {
    const g = geometriaLineas(posiciones, inicio, semilla, motivos, 2, 1.5);
    // Línea 0 (longitud 3): σ = 0.75 y 2.25; línea 1 (longitud 2): σ = 0.75.
    expect(Array.from(g.cheurones)).toEqual([0.75, 0, 0, 2.25, 0, 0, 0, 0.75, 1]);
    expect(Array.from(g.tangentes)).toEqual([1, 0, 0, 1, 0, 0, 0, 1, 0]);
  });

  it('semillas y marcas finales según el motivo: ◇ para CERO, × para NO_DEFINIDO, nada al salir de Ω', () => {
    const g = geometriaLineas(posiciones, inicio, semilla, motivos, 2, 1.5);
    expect(Array.from(g.semillas)).toEqual([1, 0, 0, 0, 0, 1]);
    expect(Array.from(g.finales)).toEqual([0, 0, 0, 0, 2, 1]);
    expect(Array.from(g.formasFinales)).toEqual([FINAL.ROMBO, FINAL.ASPA]);
  });
});
