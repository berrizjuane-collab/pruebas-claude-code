/**
 * Trabajador de física: integra los experimentos fuera del hilo de la interfaz y envía las
 * muestras por bloques (con transferencia de buffers). Calcula por delante del reloj de la
 * simulación hasta el objetivo que fija el hilo principal.
 */
import { ExperimentRunner, type ChunkOut, type Scales } from './runner';
import type { LaunchConfig } from './types';
import { computeGeodesicFamilies, type FamilyRequest } from './geodesicFamilies';
import { LaunchError } from './initial';
import { computeSignalTrack, type TrackRequest } from './signalTracker';

type InMsg =
  | { type: 'launch'; id: string; a: number; cfg: LaunchConfig; tLaunch: number; scales: Scales }
  | { type: 'remove'; id: string }
  | { type: 'clear' }
  | { type: 'target'; t: number }
  | { type: 'families'; reqId: number; req: FamilyRequest }
  | { type: 'track'; reqId: number; req: TrackRequest };

const runners = new Map<string, ExperimentRunner>();
let target = 0;
let scheduled = false;

const post = (msg: unknown, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(msg, transfer);

function schedule(): void {
  if (scheduled) return;
  scheduled = true;
  setTimeout(work, 0);
}

function work(): void {
  scheduled = false;
  const t0 = performance.now();
  let pending = false;
  for (const r of runners.values()) {
    if (r.done) continue;
    const chunk: ChunkOut = r.advance(target, 14);
    if (chunk.n > 0 || chunk.events.length || chunk.done) {
      const transfer: Transferable[] = [];
      for (const b of [chunk.body, chunk.pieces, chunk.particles, chunk.photons]) if (b) transfer.push(b.buffer);
      post({ type: 'chunk', chunk }, transfer);
    }
    if (!r.done && chunk.tComputed < target) pending = true;
    if (performance.now() - t0 > 40) {
      pending = true;
      break;
    }
  }
  if (pending) schedule();
}

self.onmessage = (ev: MessageEvent<InMsg>) => {
  const m = ev.data;
  switch (m.type) {
    case 'launch': {
      try {
        const r = new ExperimentRunner(m.id, m.a, m.cfg, m.tLaunch, m.scales);
        runners.set(m.id, r);
        post({ type: 'launched', id: m.id, kind: r.type, info: r.built.info, warnings: r.built.warnings, nParticles: r.built.particles.length, nPhotons: r.built.photons.length, photonB: r.built.photons.map((p) => p.b) });
        schedule();
      } catch (e) {
        post({ type: 'error', id: m.id, message: e instanceof LaunchError ? e.message : `Error interno: ${(e as Error).message}` });
      }
      break;
    }
    case 'remove':
      runners.delete(m.id);
      break;
    case 'clear':
      runners.clear();
      break;
    case 'target':
      target = m.t;
      schedule();
      break;
    case 'families': {
      const curves = computeGeodesicFamilies(m.req);
      const transfer = curves.map((c) => c.points.buffer);
      post({ type: 'families', reqId: m.reqId, curves }, transfer);
      break;
    }
    case 'track': {
      const res = computeSignalTrack(m.req);
      post({ type: 'track', reqId: m.reqId, result: res });
      break;
    }
  }
};
