import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Almacen } from '../state/store';

/** Suscribe un componente a una parte del almacén (el selector debe devolver referencias estables). */
export function useAlmacen<T, S>(almacen: Almacen<T>, selector: (estado: T) => S): S {
  return useSyncExternalStore(almacen.suscribir, () => selector(almacen.obtener()));
}

/** Preferencia de movimiento reducido del sistema (RNF-09), reactiva. */
export function usePrefiereMovimientoReducido(): boolean {
  const consulta = '(prefers-reduced-motion: reduce)';
  const [reducido, setReducido] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(consulta).matches);
  useEffect(() => {
    const mq = matchMedia(consulta);
    const alCambiar = () => setReducido(mq.matches);
    mq.addEventListener('change', alCambiar);
    return () => mq.removeEventListener('change', alCambiar);
  }, []);
  return reducido;
}

/**
 * Nivel de la composición según el ancho (DESIGN §5.4, SPEC §9): amplio ≥ 1600; referencia
 * 1280–1599; cajón 1024–1279 (panel superpuesto, barra solo con iconos); compacto 768–1023
 * (además, inspector de 256 px y leyenda plegada); consulta < 768 (panel en hoja inferior).
 */
export type NivelPantalla = 'amplio' | 'referencia' | 'cajon' | 'compacto' | 'consulta';

const LIMITES_NIVEL: [NivelPantalla, string][] = [
  ['consulta', '(max-width: 767.98px)'],
  ['compacto', '(max-width: 1023.98px)'],
  ['cajon', '(max-width: 1279.98px)'],
  ['referencia', '(max-width: 1599.98px)'],
];

export function nivelPantalla(): NivelPantalla {
  if (typeof matchMedia === 'undefined') return 'referencia';
  for (const [nivel, consulta] of LIMITES_NIVEL) if (matchMedia(consulta).matches) return nivel;
  return 'amplio';
}

function suscribirNivel(aviso: () => void): () => void {
  const mqs = LIMITES_NIVEL.map(([, c]) => matchMedia(c));
  for (const mq of mqs) mq.addEventListener('change', aviso);
  return () => {
    for (const mq of mqs) mq.removeEventListener('change', aviso);
  };
}

export function useNivelPantalla(): NivelPantalla {
  return useSyncExternalStore(suscribirNivel, nivelPantalla, () => 'referencia');
}

/** ¿El panel lateral es un cajón superpuesto o una hoja inferior en este nivel? */
export const panelFlotante = (n: NivelPantalla) => n === 'cajon' || n === 'compacto' || n === 'consulta';
