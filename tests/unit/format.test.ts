import { describe, expect, it } from 'vitest';
import { formatAltitudeRef, formatMeters, groupThousands } from '../../src/ui/format.ts';

describe('formato en español', () => {
  it('separa millares con espacio fino', () => {
    expect(groupThousands(8611)).toBe('8 611');
    expect(groupThousands(950)).toBe('950');
    expect(formatMeters(8611)).toBe('8 611 m');
  });
  it('distingue altitud exacta, aproximada y rango', () => {
    expect(formatAltitudeRef({ valor: 8611, exacta: true })).toBe('8 611 m');
    expect(formatAltitudeRef({ valor: 6050 })).toBe('≈ 6 050 m');
    expect(formatAltitudeRef({ valor: 7800, min: 7600, max: 8000 })).toContain('7 600–8 000');
  });
});
