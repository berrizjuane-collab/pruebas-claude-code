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
