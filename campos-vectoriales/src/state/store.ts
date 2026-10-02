/**
 * Almacén mínimo con suscripción (PLAN §1.7). React lo usa mediante
 * `useSyncExternalStore`; el orquestador, con `suscribir`.
 */
export interface Almacen<T> {
  obtener(): T;
  fijar(cambio: T | ((anterior: T) => T)): void;
  suscribir(escucha: () => void): () => void;
}

export function crearAlmacen<T>(inicial: T): Almacen<T> {
  let estado = inicial;
  const escuchas = new Set<() => void>();
  return {
    obtener: () => estado,
    fijar(cambio) {
      const nuevo = typeof cambio === 'function' ? (cambio as (a: T) => T)(estado) : cambio;
      if (Object.is(nuevo, estado)) return;
      estado = nuevo;
      for (const e of [...escuchas]) e();
    },
    suscribir(escucha) {
      escuchas.add(escucha);
      return () => escuchas.delete(escucha);
    },
  };
}
