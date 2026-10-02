import { useEffect } from 'react';
import type { Vista } from '../render/camara';

/** ¿El foco está en un campo de texto? Allí no se activan los atajos de una letra (WCAG 2.1.4). */
export function enCampoDeTexto(objetivo: EventTarget | null): boolean {
  const el = objetivo as HTMLElement | null;
  if (!el) return false;
  // También listas y menús, que usan las letras para buscar opciones.
  const rol = el.getAttribute?.('role');
  if (rol === 'combobox' || rol === 'listbox' || rol === 'menu' || rol === 'menuitem') return true;
  return el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';
}

/**
 * Atajos globales (PLAN §3.1): encuadre, vistas y, en `letras`, las acciones de una letra
 * (F, L, P, G…). No se activan dentro de campos de texto ni con modificadores, ni cuando la
 * tecla llega a un botón o a un control que ya la usa (Espacio en un interruptor).
 */
export function useAtajos(encuadrar: () => void, vista: (v: Vista) => void, letras: Record<string, () => void> = {}): void {
  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || enCampoDeTexto(e.target)) return;
      const vistas: Record<string, Vista> = { '1': 'XY', '2': 'XZ', '3': 'YZ', '4': 'iso' };
      const letra = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (letra === 'r') {
        e.preventDefault();
        encuadrar();
      } else if (vistas[e.key]) {
        e.preventDefault();
        vista(vistas[e.key] as Vista);
      } else if (letras[letra]) {
        e.preventDefault();
        letras[letra]();
      }
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [encuadrar, vista, letras]);
}
