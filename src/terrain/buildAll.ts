/**
 * Preparación completa del terreno a partir de los PNG descargados. La ejecuta el
 * Web Worker; si el navegador o su política de seguridad no permiten workers, la
 * aplicación la ejecuta en el hilo principal como alternativa.
 */
import { decodeHeights, decodePng } from '../data/png.ts';
import { dilateGrid, HeightGrid } from '../geo/heightfield.ts';
import { buildRing, normalTexture, toRGBA, type RingGeometry } from './build.ts';
import type { BuildRequest, BuildResult } from './protocol.ts';

export function buildTerrainData(req: BuildRequest, progress: (stage: string, fraction: number) => void = () => {}): BuildResult {
  const t0 = performance.now();
  const timings: Record<string, number> = {};
  const heights = {} as BuildResult['heights'];
  const normals = {} as BuildResult['normals'];
  const masks = {} as BuildResult['masks'];
  const rings: RingGeometry[] = [];
  const total = req.rings.length;
  req.rings.forEach((spec, r) => {
    const png = decodePng(req.files.heights[spec.name]);
    if (png.width !== spec.n || png.height !== spec.n) throw new Error(`${spec.name}: PNG ${png.width}×${png.height}, esperado ${spec.n}`);
    const h = decodeHeights(png, req.heightOffset, req.heightScale);
    heights[spec.name] = h;
    const inner = spec.skipInnerHalf;
    // bloques contenidos en el anillo interior (hueco): no se construyen
    const skipInside = (cells: number) =>
      inner
        ? (ci: number, cj: number) => {
            const x0 = -spec.half + cj * cells * spec.spacing;
            const x1 = x0 + cells * spec.spacing;
            const z0 = -spec.half + ci * cells * spec.spacing;
            const z1 = z0 + cells * spec.spacing;
            return x0 >= -inner - 1e-6 && x1 <= inner + 1e-6 && z0 >= -inner - 1e-6 && z1 <= inner + 1e-6;
          }
        : undefined;
    const cells = (spec.n - 1) / spec.chunksPerSide;
    const share = spec.parents ? 0.7 : 1;
    const geom = buildRing({ ...spec, skip: skipInside(cells) }, h, req.h0, (f) => progress('mallas', (r + f * share) / total));
    if (spec.parents) {
      if (spec.chunksPerSide % 2) throw new Error(`${spec.name}: los padres 2×2 necesitan un número par de bloques por lado`);
      // el cambio hijo ↔ padre es exacto solo si cada nivel dobla el paso del anterior
      if (spec.steps.some((s, i) => i > 0 && s !== 2 * spec.steps[i - 1])) throw new Error(`${spec.name}: los pasos deben doblarse por nivel`);
      const parents = buildRing(
        { ...spec, chunksPerSide: spec.chunksPerSide / 2, steps: spec.steps.map((s) => 2 * s), skip: skipInside(2 * cells) },
        h,
        req.h0,
        (f) => progress('mallas', (r + share + f * (1 - share)) / total),
      );
      geom.parents = { chunks: parents.chunks, indices: parents.indices };
    }
    rings.push(geom);
    normals[spec.name] = { data: normalTexture(h, spec.n, spec.spacing), size: spec.n };
    const m = decodePng(req.files.masks[spec.name]);
    masks[spec.name] = { data: toRGBA(m.data as Uint8Array, m.channels, m.width * m.height), width: m.width, height: m.height };
    timings[spec.name] = performance.now() - t0;
  });
  const auxPng = decodePng(req.files.aux);
  const aux = { data: toRGBA(auxPng.data as Uint8Array, auxPng.channels, auxPng.width * auxPng.height), size: auxPng.width };
  progress('holgura', 1);
  const dilated = {} as BuildResult['dilated'];
  for (const name of ['core', 'context'] as const) {
    const spec = req.rings.find((s) => s.name === name)!;
    dilated[name] = dilateGrid(new HeightGrid(spec.n, spec.spacing, spec.half, heights[name]), req.dilationRadius).data;
  }
  timings.total = performance.now() - t0;
  return { type: 'done', heights, dilated, normals, masks, aux, rings, timings };
}

/** Buffers transferibles del resultado (para postMessage sin copia). */
export function transferables(res: BuildResult): Transferable[] {
  const t: Transferable[] = [];
  for (const g of res.rings) {
    for (const set of g.parents ? [g, g.parents] : [g]) {
      for (const c of set.chunks) for (const l of c.levels) t.push(l.positions.buffer, l.morph.buffer);
      for (const ix of set.indices) t.push(ix.buffer);
    }
  }
  for (const name of Object.keys(res.heights) as (keyof typeof res.heights)[]) t.push(res.heights[name].buffer, res.normals[name].data.buffer, res.masks[name].data.buffer);
  t.push(res.dilated.core.buffer, res.dilated.context.buffer, res.aux.data.buffer);
  return t;
}
