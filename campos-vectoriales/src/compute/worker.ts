/**
 * Entrada del Web Worker de cálculo (CMP-01): recibe peticiones tipadas, ejecuta los
 * trabajos y devuelve resultados con transferencia de buffers. Las líneas se calculan
 * troceadas y pueden cancelarse.
 */
import { transferibles, type Peticion, type Respuesta } from './protocol';
import { crearCeder, trabajoCorte, trabajoLineas, trabajoMalla } from './trabajos';

interface AmbitoTrabajador {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage(mensaje: unknown, transferibles?: Transferable[]): void;
}

const ambito = globalThis as unknown as AmbitoTrabajador;
/** Trabajos troceados en curso y los que se han pedido cancelar (solo estos se recuerdan). */
const enCurso = new Set<number>();
const cancelados = new Set<number>();
const cederBase = crearCeder();

const enviar = (r: Respuesta) => ambito.postMessage(r, transferibles(r));

ambito.onmessage = (e: MessageEvent) => {
  const pet = e.data as Peticion;
  if (pet.tipo === 'cancelar') {
    // Un trabajo no troceado ya ha terminado cuando llega su cancelación: no hay nada que parar.
    if (enCurso.has(pet.id)) cancelados.add(pet.id);
    return;
  }
  void atender(pet);
};

async function atender(pet: Exclude<Peticion, { tipo: 'cancelar' }>): Promise<void> {
  try {
    switch (pet.tipo) {
      case 'ping':
        enviar({ tipo: 'pong', id: pet.id });
        return;
      case 'malla':
        enviar({ tipo: 'malla', id: pet.id, resultado: trabajoMalla(pet) });
        return;
      case 'corte':
        enviar({ tipo: 'corte', id: pet.id, resultado: trabajoCorte(pet) });
        return;
      case 'lineas': {
        enCurso.add(pet.id);
        const resultado = await trabajoLineas(
          pet,
          async () => {
            await cederBase();
            return cancelados.has(pet.id);
          },
          (fraccion) => enviar({ tipo: 'progreso', id: pet.id, fraccion }),
        );
        enviar(resultado ? { tipo: 'lineas', id: pet.id, resultado } : { tipo: 'cancelado', id: pet.id });
        return;
      }
    }
  } catch (e) {
    enviar({ tipo: 'error', id: pet.id, mensaje: e instanceof Error ? e.message : String(e) });
  } finally {
    enCurso.delete(pet.id);
    cancelados.delete(pet.id);
  }
}
