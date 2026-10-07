/** Mensajes entre el hilo principal y el worker del terreno. */
import type { RingGeometry } from './build.ts';
import type { RingName } from '../data/types.ts';

export interface RingRequest {
  name: RingName;
  n: number;
  spacing: number;
  half: number;
  chunksPerSide: number;
  steps: number[];
  /** semilado del anillo interior: los bloques contenidos en él no se construyen */
  skipInnerHalf?: number;
  /** construir también padres 2×2 (pasos dobles) para agrupar bloques gruesos en un solo draw call */
  parents?: boolean;
}

export interface BuildRequest {
  type: 'build';
  h0: number;
  heightOffset: number;
  heightScale: number;
  dilationRadius: number;
  rings: RingRequest[];
  files: {
    heights: Record<RingName, ArrayBuffer>;
    masks: Record<RingName, ArrayBuffer>;
    aux: ArrayBuffer;
  };
}

export interface BuildResult {
  type: 'done';
  heights: Record<RingName, Float32Array>;
  dilated: Record<'core' | 'context', Float32Array>;
  normals: Record<RingName, { data: Uint8Array; size: number }>;
  masks: Record<RingName, { data: Uint8Array; width: number; height: number }>;
  aux: { data: Uint8Array; size: number };
  rings: RingGeometry[];
  timings: Record<string, number>;
}

export type WorkerMessage =
  | BuildResult
  | { type: 'progress'; stage: string; fraction: number }
  | { type: 'error'; message: string };
