import { describe, expect, it } from 'vitest';
import { color, escena, rampa, variablesCss } from './tokens';
import { contraste, esGrisNeutro, grisDeLstar, hexGris, lstarDeGris } from './color';

/**
 * VIS-01: tabla de contrastes de los tokens frente a DESIGN.md §2.1 y criterios WCAG 2.2
 * (texto ≥ 4.5:1; contornos de controles y gráficos esenciales ≥ 3:1).
 */
const superficies = [color.fondo0, color.fondo1, color.fondo2] as const;

describe('tokens de color', () => {
  it('todos los colores de interfaz y escena son grises neutros (R = G = B)', () => {
    for (const hex of [...Object.values(color), ...Object.values(escena)]) {
      expect(esGrisNeutro(hex), hex).toBe(true);
    }
  });

  it('reproduce la tabla de contrastes de DESIGN §2.1 (±0.01)', () => {
    const tabla: Record<string, [number, number, number]> = {
      [color.borde]: [1.84, 1.71, 1.5],
      [color.control]: [4.13, 3.85, 3.37],
      [color.texto3]: [5.66, 5.28, 4.62],
      [color.texto2]: [8.77, 8.19, 7.16],
      [color.texto1]: [17.45, 16.29, 14.24],
    };
    for (const [hex, esperados] of Object.entries(tabla)) {
      superficies.forEach((sup, i) => {
        expect(contraste(hex, sup), `${hex} sobre ${sup}`).toBeCloseTo(esperados[i] as number, 2);
      });
    }
  });

  it('todo texto cumple ≥ 4.5:1 sobre las tres superficies', () => {
    for (const texto of [color.texto1, color.texto2, color.texto3]) {
      for (const sup of superficies) expect(contraste(texto, sup)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('el contorno de los controles cumple ≥ 3:1 sobre las tres superficies (WCAG 1.4.11)', () => {
    for (const sup of superficies) expect(contraste(color.control, sup)).toBeGreaterThanOrEqual(3);
  });

  it('el anillo de foco (texto-1) cumple ≥ 3:1 sobre cualquier superficie, incluido el pulsado', () => {
    for (const sup of [...superficies, color.fondo3, color.pulsado]) {
      expect(contraste(color.texto1, sup)).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('rampas de la escena', () => {
  it('la flecha más débil (L* 45.2) cumple ≥ 3:1 frente al fondo y al halo', () => {
    const minimo = hexGris(grisDeLstar(rampa.magnitud.lMin));
    expect(minimo).toBe('#6B6B6B');
    expect(contraste(minimo, escena.fondo)).toBeGreaterThanOrEqual(3);
    expect(contraste(minimo, escena.halo)).toBeGreaterThanOrEqual(3);
  });

  it('la rampa de magnitud termina en el texto principal (#F5F5F5)', () => {
    expect(hexGris(grisDeLstar(rampa.magnitud.lMax))).toBe('#F5F5F5');
  });

  it('las bandas de magnitud y del escalar son disjuntas', () => {
    expect(rampa.escalar.lMax + rampa.patronDeltaL).toBeLessThan(rampa.magnitud.lMin);
  });

  it('L* ↔ gris es una ida y vuelta exacta a 8 bits', () => {
    for (let v = 0; v <= 255; v++) expect(Math.round(grisDeLstar(lstarDeGris(v)))).toBe(v);
  });
});

describe('variables CSS', () => {
  it('genera variables para color, espacio, radios y tipografía', () => {
    const v = variablesCss();
    expect(v['--fondo-0']).toBe('#101010');
    expect(v['--texto-1']).toBe('#F5F5F5');
    expect(v['--control']).toBe('#757575');
    expect(v['--e-4']).toBe('16px');
    expect(v['--r-2']).toBe('6px');
    expect(v['--t-micro']).toBe('11px');
    expect(v['--m-panel']).toBe('320px');
  });
});
