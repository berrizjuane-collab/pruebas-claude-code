/**
 * Cliente del worker de cálculo. El worker va incrustado (`?worker&inline`) para que el
 * HTML final sea autocontenido (RNF-14). Si el navegador no permite crearlo (p. ej. alguna
 * política de `file://`), se devuelve `null` y el cálculo se hará en el hilo principal
 * con el mismo código (D-22).
 */
import TrabajadorCalculo from './worker.ts?worker&inline';

export type ModoCalculo = 'worker' | 'hilo-principal';

export function crearTrabajador(): Worker | null {
  try {
    return new TrabajadorCalculo();
  } catch {
    return null;
  }
}

/** Comprueba que el worker responde; si no lo hace en `msMax`, se usa el hilo principal. */
export function sondearTrabajador(trabajador: Worker | null, msMax = 2000): Promise<ModoCalculo> {
  if (!trabajador) return Promise.resolve('hilo-principal');
  return new Promise((resolver) => {
    const temporizador = setTimeout(() => resolver('hilo-principal'), msMax);
    const alResponder = (e: MessageEvent) => {
      if ((e.data as { tipo?: string })?.tipo === 'pong') {
        clearTimeout(temporizador);
        trabajador.removeEventListener('message', alResponder);
        resolver('worker');
      }
    };
    trabajador.addEventListener('message', alResponder);
    trabajador.addEventListener('error', () => {
      clearTimeout(temporizador);
      resolver('hilo-principal');
    });
    trabajador.postMessage({ tipo: 'ping', id: 0 });
  });
}
