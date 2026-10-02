import { useEffect } from 'react';
import type { Vista } from '../render/camara';

/** ¿El foco está en un campo de texto? Allí no se activan los atajos de una letra (WCAG 2.1.4). */
export function enCampoDeTexto(objetivo: EventTarget | null): boolean {
  const el = objetivo as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';
}

/** Atajos globales (PLAN §3.1). H1: encuadre y vistas. */
export function useAtajos(encuadrar: () => void, vista: (v: Vista) => void): void {
  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || enCampoDeTexto(e.target)) return;
      const vistas: Record<string, Vista> = { '1': 'XY', '2': 'XZ', '3': 'YZ', '4': 'iso' };
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        encuadrar();
      } else if (vistas[e.key]) {
        e.preventDefault();
        vista(vistas[e.key] as Vista);
      }
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [encuadrar, vista]);
}
