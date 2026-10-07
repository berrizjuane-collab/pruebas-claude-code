/**
 * Construcción de geometría del terreno (pura, se ejecuta en un Web Worker).
 *
 * Cada anillo se divide en bloques cuadrados; cada bloque tiene varios niveles de
 * detalle (paso 1, 2, 4, 8 celdas). Por vértice se guarda la altura propia y la
 * altura que tendría en el nivel siguiente (más grueso) para poder transformar la
 * forma suavemente (geomorphing) al cambiar de nivel. Faldones verticales en los
 * bordes ocultan grietas entre bloques de distinto nivel y entre anillos.
 */
export interface RingBuildSpec {
  name: 'core' | 'context' | 'far';
  n: number;
  spacing: number;
  half: number;
  chunksPerSide: number;
  /** pasos de cada nivel, del más fino al más grueso */
  steps: number[];
  /** índice [ci, cj] de bloques que no se construyen (hueco del anillo interior) */
  skip?: (ci: number, cj: number) => boolean;
}

export interface ChunkLevel {
  positions: Float32Array;
  morph: Float32Array;
  /** error vertical máximo respecto a la malla completa (m) */
  error: number;
  triangles: number;
}

export interface ChunkData {
  ring: RingBuildSpec['name'];
  ci: number;
  cj: number;
  min: [number, number, number];
  max: [number, number, number];
  skirt: number;
  levels: ChunkLevel[];
}

export interface RingGeometry {
  ring: RingBuildSpec['name'];
  chunks: ChunkData[];
  /** índices compartidos por nivel (misma topología en todos los bloques del anillo) */
  indices: Uint32Array[];
  /**
   * Padres 2×2 opcionales: cada uno cubre cuatro bloques con pasos dobles, así que su
   * nivel p tiene exactamente los vértices del nivel p + 1 de sus hijos.
   */
  parents?: { chunks: ChunkData[]; indices: Uint32Array[] };
}

/** Índices de una rejilla k×k (diagonal NO→SE) + faldones con ambas orientaciones. */
export function gridIndices(k: number): Uint32Array {
  const v = k + 1;
  const skirtBase = v * v;
  const out: number[] = [];
  for (let r = 0; r < k; r++)
    for (let c = 0; c < k; c++) {
      const tl = r * v + c;
      const tr = tl + 1;
      const bl = tl + v;
      const br = bl + 1;
      out.push(tl, bl, br, tl, br, tr);
    }
  // faldones: 4 bordes × (k+1) vértices duplicados por debajo
  const edges: number[][] = [
    Array.from({ length: v }, (_, c) => c), // norte
    Array.from({ length: v }, (_, c) => k * v + c), // sur
    Array.from({ length: v }, (_, r) => r * v), // oeste
    Array.from({ length: v }, (_, r) => r * v + k), // este
  ];
  edges.forEach((edge, e) => {
    for (let q = 0; q < k; q++) {
      const a = edge[q];
      const b = edge[q + 1];
      const a2 = skirtBase + e * v + q;
      const b2 = a2 + 1;
      out.push(a, b, a2, b, b2, a2, a, a2, b, b, a2, b2);
    }
  });
  return Uint32Array.from(out);
}

function triInterp(h00: number, h01: number, h10: number, h11: number, u: number, w: number): number {
  return u >= w ? h00 + u * (h01 - h00) + w * (h11 - h01) : h00 + u * (h11 - h10) + w * (h10 - h00);
}

/**
 * Altura de la malla de paso `step` en el vértice fino (i, j) (índices de la
 * rejilla completa), con la misma triangulación que gridIndices.
 */
function levelHeight(h: Float32Array, n: number, i0: number, j0: number, step: number, i: number, j: number): number {
  const ri = (i - i0) / step;
  const rj = (j - j0) / step;
  const r = Math.min(Math.floor(ri), Math.max(0, Math.floor(ri - 1e-9)));
  const c = Math.min(Math.floor(rj), Math.max(0, Math.floor(rj - 1e-9)));
  const a = i0 + r * step;
  const b = j0 + c * step;
  const a2 = Math.min(a + step, n - 1);
  const b2 = Math.min(b + step, n - 1);
  const w = ri - r;
  const u = rj - c;
  return triInterp(h[a * n + b], h[a * n + b2], h[a2 * n + b], h[a2 * n + b2], u, w);
}

export function buildRing(spec: RingBuildSpec, heights: Float32Array, h0: number, onProgress?: (f: number) => void): RingGeometry {
  const { n, spacing, half, chunksPerSide, steps } = spec;
  const cells = (n - 1) / chunksPerSide;
  if (!Number.isInteger(cells)) throw new Error(`${spec.name}: ${n - 1} celdas no divisibles en ${chunksPerSide} bloques`);
  for (const s of steps) if (cells % s) throw new Error(`${spec.name}: paso ${s} no divide ${cells}`);
  const indices = steps.map((s) => gridIndices(cells / s));
  const chunks: ChunkData[] = [];
  const total = chunksPerSide * chunksPerSide;
  let done = 0;
  for (let ci = 0; ci < chunksPerSide; ci++)
    for (let cj = 0; cj < chunksPerSide; cj++) {
      done++;
      if (spec.skip?.(ci, cj)) continue;
      const i0 = ci * cells;
      const j0 = cj * cells;
      let hmin = Infinity;
      let hmax = -Infinity;
      for (let i = i0; i <= i0 + cells; i++)
        for (let j = j0; j <= j0 + cells; j++) {
          const v = heights[i * n + j];
          if (v < hmin) hmin = v;
          if (v > hmax) hmax = v;
        }
      // errores por nivel
      const errors = steps.map((s) => {
        if (s === 1) return 0;
        let e = 0;
        for (let i = i0; i <= i0 + cells; i++)
          for (let j = j0; j <= j0 + cells; j++) e = Math.max(e, Math.abs(heights[i * n + j] - levelHeight(heights, n, i0, j0, s, i, j)));
        return e;
      });
      const skirt = Math.max(15, errors[errors.length - 1] * 1.2 + 10, spacing * 0.6);
      const levels: ChunkLevel[] = steps.map((s, l) => {
        const k = cells / s;
        const v = k + 1;
        const vCount = v * v + 4 * v;
        const positions = new Float32Array(vCount * 3);
        const morph = new Float32Array(vCount);
        const coarse = steps[l + 1];
        const put = (idx: number, i: number, j: number, drop: number) => {
          const x = -half + j * spacing;
          const yN = half - i * spacing;
          const hh = heights[i * n + j];
          positions[idx * 3] = x;
          positions[idx * 3 + 1] = hh - h0 - drop;
          positions[idx * 3 + 2] = -yN;
          const hc = coarse ? levelHeight(heights, n, i0, j0, coarse, i, j) : hh;
          morph[idx] = hc - h0 - drop;
        };
        for (let r = 0; r < v; r++) for (let c = 0; c < v; c++) put(r * v + c, i0 + r * s, j0 + c * s, 0);
        const base = v * v;
        for (let q = 0; q < v; q++) {
          put(base + q, i0, j0 + q * s, skirt);
          put(base + v + q, i0 + k * s, j0 + q * s, skirt);
          put(base + 2 * v + q, i0 + q * s, j0, skirt);
          put(base + 3 * v + q, i0 + q * s, j0 + k * s, skirt);
        }
        return { positions, morph, error: errors[l], triangles: indices[l].length / 3 };
      });
      chunks.push({
        ring: spec.name,
        ci,
        cj,
        // escena: Z = −norte; la fila i0 (más al norte) tiene la Z menor
        min: [-half + j0 * spacing, hmin - h0 - skirt, -half + i0 * spacing],
        max: [-half + (j0 + cells) * spacing, hmax - h0, -half + (i0 + cells) * spacing],
        skirt,
        levels,
      });
      onProgress?.(done / total);
    }
  return { ring: spec.name, chunks, indices };
}

/** Normales de escena (X este, Y arriba, Z sur) codificadas en RGBA8. */
export function normalTexture(heights: Float32Array, n: number, spacing: number): Uint8Array {
  const out = new Uint8Array(n * n * 4);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const jl = Math.max(0, j - 1);
      const jr = Math.min(n - 1, j + 1);
      const iu = Math.max(0, i - 1);
      const id = Math.min(n - 1, i + 1);
      const dX = (heights[i * n + jr] - heights[i * n + jl]) / ((jr - jl) * spacing);
      const dZ = (heights[id * n + j] - heights[iu * n + j]) / ((id - iu) * spacing);
      let nx = -dX;
      let ny = 1;
      let nz = -dZ;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      nz /= len;
      const k = (i * n + j) * 4;
      out[k] = Math.round((nx * 0.5 + 0.5) * 255);
      out[k + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      out[k + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      out[k + 3] = 255;
    }
  return out;
}

/** RGB/RGBA/gris 8 bits → RGBA8 (las texturas de datos se suben en RGBA). */
export function toRGBA(data: Uint8Array, channels: number, count: number): Uint8Array {
  if (channels === 4) return data;
  const out = new Uint8Array(count * 4);
  for (let k = 0; k < count; k++) {
    out[4 * k] = data[channels * k];
    out[4 * k + 1] = channels > 1 ? data[channels * k + 1] : data[k];
    out[4 * k + 2] = channels > 2 ? data[channels * k + 2] : data[k];
    out[4 * k + 3] = 255;
  }
  return out;
}
