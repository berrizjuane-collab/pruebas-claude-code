import { describe, expect, it } from 'vitest';
import { nombreArchivo, nombreSeguro } from './json';

describe('EXP-01 · nombre del archivo (SPEC §7.1)', () => {
  it('campo-<nombre>-AAAAMMDD-HHMM con la hora local', () => {
    expect(nombreArchivo('Helicoidal', new Date(2026, 9, 2, 15, 30), 'json')).toBe('campo-helicoidal-20261002-1530.json');
    expect(nombreArchivo('Radial +', new Date(2026, 0, 5, 9, 7), 'png')).toBe('campo-radial-20260105-0907.png');
  });

  it('sin acentos, sin símbolos y nunca vacío', () => {
    expect(nombreSeguro('Personalizado (desde Radial saliente)')).toBe('personalizado-desde-radial-saliente');
    expect(nombreSeguro('Campo «ñandú» × 2')).toBe('campo-nandu-2');
    expect(nombreSeguro('∇ × F')).toBe('f');
    expect(nombreSeguro('«»')).toBe('experimento');
    expect(nombreSeguro('a'.repeat(80)).length).toBe(48);
  });
});
