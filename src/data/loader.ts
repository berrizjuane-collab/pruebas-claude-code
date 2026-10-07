/**
 * Carga de datos con progreso real (bytes recibidos por recurso). Si un recurso
 * falla, se lanza un error con su nombre para que la UI ofrezca reintentar.
 */
import type { AtlasData, Manifest, PoisFile, RingName, RoutesFile, SeracFile } from './types.ts';

export interface RawAssets {
  data: AtlasData;
  heights: Record<RingName, ArrayBuffer>;
  masks: Record<RingName, ArrayBuffer>;
  aux: ArrayBuffer;
  albedo: Record<RingName, ImageBitmap | HTMLImageElement>;
  bytes: number;
}

export type ProgressFn = (loaded: number, total: number, label: string) => void;

export class AssetError extends Error {
  constructor(readonly asset: string, cause: string) {
    super(`No se pudo cargar ${asset}: ${cause}`);
  }
}

async function fetchBuffer(url: string, onChunk: (n: number, len: number) => void, signal?: AbortSignal): Promise<ArrayBuffer> {
  let res: Response;
  try {
    res = await fetch(url, { signal });
  } catch (e) {
    throw new AssetError(url, e instanceof Error ? e.message : 'red no disponible');
  }
  if (!res.ok) throw new AssetError(url, `HTTP ${res.status}`);
  const len = Number(res.headers.get('content-length')) || 0;
  if (!res.body) {
    const b = await res.arrayBuffer();
    onChunk(b.byteLength, len || b.byteLength);
    return b;
  }
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    got += value.length;
    onChunk(value.length, len);
  }
  const out = new Uint8Array(got);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out.buffer;
}

async function decodeImage(buf: ArrayBuffer, type: string): Promise<ImageBitmap | HTMLImageElement> {
  const blob = new Blob([buf], { type });
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob, { imageOrientation: 'none', premultiplyAlpha: 'none' });
    } catch {
      /* Safari antiguo: se cae al <img> */
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function loadAtlas(base: string, onProgress: ProgressFn, signal?: AbortSignal): Promise<RawAssets> {
  const u = (f: string) => `${base}${f}`;
  const manifestBuf = await fetchBuffer(u('manifest.json'), () => {}, signal);
  const manifest = JSON.parse(new TextDecoder().decode(manifestBuf)) as Manifest;
  const rings: RingName[] = ['core', 'context', 'far'];
  const files: { key: string; file: string; estimate: number }[] = [
    { key: 'routes', file: manifest.rutas.archivo, estimate: 90e3 },
    { key: 'pois', file: manifest.poi.archivo, estimate: 20e3 },
    { key: 'serac', file: manifest.serac.archivo, estimate: 3e3 },
    { key: 'aux', file: manifest.aux.archivo, estimate: 210e3 },
    ...rings.map((r) => ({ key: `h-${r}`, file: manifest.rejillas[r].archivo, estimate: r === 'core' ? 460e3 : r === 'context' ? 300e3 : 60e3 })),
    ...rings.map((r) => ({ key: `m-${r}`, file: manifest.imagen.niveles[r].mascaras, estimate: r === 'core' ? 165e3 : 100e3 })),
    ...rings.map((r) => ({ key: `a-${r}`, file: manifest.imagen.niveles[r].albedo, estimate: r === 'core' ? 580e3 : r === 'context' ? 330e3 : 65e3 })),
  ];
  const totals = new Map(files.map((f) => [f.key, f.estimate]));
  const loaded = new Map(files.map((f) => [f.key, 0]));
  const report = (label: string) => {
    let l = 0;
    let t = 0;
    for (const f of files) {
      l += loaded.get(f.key)!;
      t += Math.max(totals.get(f.key)!, loaded.get(f.key)!);
    }
    onProgress(l, t, label);
  };
  const bufs = await Promise.all(
    files.map((f) =>
      fetchBuffer(
        u(f.file),
        (n, len) => {
          if (len) totals.set(f.key, len);
          loaded.set(f.key, loaded.get(f.key)! + n);
          report(f.file);
        },
        signal,
      ).then((b) => [f.key, b] as const),
    ),
  );
  const by = new Map(bufs);
  const json = <T>(k: string) => JSON.parse(new TextDecoder().decode(by.get(k)!)) as T;
  const albedo = {} as RawAssets['albedo'];
  await Promise.all(
    rings.map(async (r) => {
      albedo[r] = await decodeImage(by.get(`a-${r}`)!, 'image/webp');
    }),
  );
  const data: AtlasData = { manifest, routes: json<RoutesFile>('routes'), pois: json<PoisFile>('pois'), serac: json<SeracFile>('serac') };
  let bytes = manifestBuf.byteLength;
  for (const b of by.values()) bytes += b.byteLength;
  return {
    data,
    heights: Object.fromEntries(rings.map((r) => [r, by.get(`h-${r}`)!])) as Record<RingName, ArrayBuffer>,
    masks: Object.fromEntries(rings.map((r) => [r, by.get(`m-${r}`)!])) as Record<RingName, ArrayBuffer>,
    aux: by.get('aux')!,
    albedo,
    bytes,
  };
}
