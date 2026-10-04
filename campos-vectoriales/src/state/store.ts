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

/**
 * Almacén derivado de otros (solo lectura): recalcula `calcular()` cuando cambia alguna fuente
 * y avisa solo si el resultado es otro objeto. `calcular` debe devolver el mismo objeto cuando
 * nada relevante cambia (así el orquestador no se despierta en cada fotograma).
 */
export function derivarAlmacen<T>(fuentes: readonly Pick<Almacen<unknown>, 'suscribir'>[], calcular: () => T): Almacen<T> & { desconectar(): void } {
  const interno = crearAlmacen(calcular());
  const bajas = fuentes.map((f) => f.suscribir(() => interno.fijar(calcular())));
  return {
    obtener: interno.obtener,
    suscribir: interno.suscribir,
    fijar() {
      throw new Error('Un almacén derivado es de solo lectura');
    },
    desconectar: () => bajas.forEach((b) => b()),
  };
}
