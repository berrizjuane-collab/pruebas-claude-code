/**
 * Entrada del Web Worker de cálculo (PLAN §1.5–1.6). En H0 solo responde a `ping`;
 * los trabajos de malla, corte y líneas llegan en H3 (CMP-01).
 */
interface AmbitoTrabajador {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage(mensaje: unknown, transferibles?: Transferable[]): void;
}

const ambito = globalThis as unknown as AmbitoTrabajador;

ambito.onmessage = (e: MessageEvent) => {
  const peticion = e.data as { tipo: string; id: number };
  if (peticion.tipo === 'ping') ambito.postMessage({ tipo: 'pong', id: peticion.id });
};
