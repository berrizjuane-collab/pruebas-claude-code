import { describe, expect, it } from 'vitest';
import { layoutLabels, type LabelCandidate } from '../../src/poi/layout.ts';

describe('colocación de etiquetas', () => {
  const vp = { width: 800, height: 600 };
  const cands: LabelCandidate[] = Array.from({ length: 30 }, (_, i) => ({
    id: `p${i}`,
    x: 300 + (i % 6) * 18,
    y: 250 + Math.floor(i / 6) * 14,
    w: 90,
    h: 22,
    priority: i % 4,
  }));
  it('las etiquetas visibles no se solapan y caben en el viewport', () => {
    const out = layoutLabels(cands, vp).filter((p) => p.visible);
    for (let a = 0; a < out.length; a++) {
      expect(out[a].lx).toBeGreaterThanOrEqual(0);
      expect(out[a].lx + 90).toBeLessThanOrEqual(800);
      for (let b = a + 1; b < out.length; b++) {
        const A = out[a];
        const B = out[b];
        const sep = A.lx + 90 <= B.lx || B.lx + 90 <= A.lx || A.ly + 22 <= B.ly || B.ly + 22 <= A.ly;
        expect(sep).toBe(true);
      }
    }
  });
  it('la prioridad alta gana sitio y la selección siempre se muestra', () => {
    const forced = { ...cands[29], forced: true };
    const out = layoutLabels([...cands.slice(0, 29), forced], vp);
    expect(out.find((p) => p.id === forced.id)!.visible).toBe(true);
    const shown = out.filter((p) => p.visible).map((p) => cands.find((c) => c.id === p.id)!.priority);
    const hidden = out.filter((p) => !p.visible).map((p) => cands.find((c) => c.id === p.id)!.priority);
    if (hidden.length) expect(Math.min(...shown)).toBeLessThanOrEqual(Math.min(...hidden));
  });
  it('histéresis: una etiqueta conserva su hueco anterior si sigue libre (sin parpadeos)', () => {
    const vp = { width: 800, height: 600 };
    const base = { id: 'a', x: 400, y: 300, w: 90, h: 20, priority: 1 };
    const first = layoutLabels([base], vp)[0];
    expect(first.slot).toBe(0); // a la derecha por defecto
    // en el fotograma siguiente estaba a la izquierda (hueco 1): se mantiene ahí
    const kept = layoutLabels([{ ...base, x: 402, prevSlot: 1 }], vp)[0];
    expect(kept.slot).toBe(1);
    expect(kept.lx).toBeLessThan(402);
  });
});
