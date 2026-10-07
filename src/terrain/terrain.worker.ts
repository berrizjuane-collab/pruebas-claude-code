/// <reference lib="webworker" />
/**
 * Web Worker del terreno: decodifica los PNG de datos, construye las mallas por
 * bloques y niveles, las normales y la rejilla dilatada para la holgura de cámara.
 * Todo lo pesado ocurre aquí; el hilo principal solo crea los objetos de three.js.
 */
import { buildTerrainData, transferables } from './buildAll.ts';
import type { BuildRequest, WorkerMessage } from './protocol.ts';

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (ev: MessageEvent<BuildRequest>) => {
  const req = ev.data;
  if (req.type !== 'build') return;
  try {
    const result = buildTerrainData(req, (stage, fraction) => self.postMessage({ type: 'progress', stage, fraction } satisfies WorkerMessage));
    self.postMessage(result, transferables(result));
  } catch (e) {
    self.postMessage({ type: 'error', message: e instanceof Error ? e.message : String(e) } satisfies WorkerMessage);
  }
};
