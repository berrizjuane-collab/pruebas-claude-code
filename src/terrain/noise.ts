/**
 * Textura de microdetalle teselable y determinista (sin descargas).
 *  R, G: perturbación de normal (derivadas de un fBm) codificada en [0, 1]
 *  B: variación de albedo (fBm de baja frecuencia)
 *  A: patrón alargado en horizontal para la estratificación de la roca
 * El ruido está subordinado al relieve real: solo modula sombreado y tono a escala
 * de metros, nunca la geometría.
 */
function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

/** Ruido de valor periódico con periodos enteros (px, py) en celdas. */
function valueNoise(x: number, y: number, px: number, py: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const wx = (a: number) => ((a % px) + px) % px;
  const wy = (a: number) => ((a % py) + py) % py;
  const a = hash(wx(xi), wy(yi), seed);
  const b = hash(wx(xi + 1), wy(yi), seed);
  const c = hash(wx(xi), wy(yi + 1), seed);
  const d = hash(wx(xi + 1), wy(yi + 1), seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** fBm teselable: frecuencias base enteras por eje, que se duplican por octava. */
function fbm(x: number, y: number, size: number, baseX: number, baseY: number, octaves: number, seed: number): number {
  let amp = 0.5;
  let sum = 0;
  let norm = 0;
  let fx = baseX;
  let fy = baseY;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise((x / size) * fx, (y / size) * fy, fx, fy, seed + o * 17);
    norm += amp;
    amp *= 0.5;
    fx *= 2;
    fy *= 2;
  }
  return sum / norm;
}

export function makeDetailTexture(size = 256, seed = 2008): Uint8Array {
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) h[y * size + x] = fbm(x, y, size, 8, 8, 5, seed);
  const out = new Uint8Array(size * size * 4);
  const at = (x: number, y: number) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 4;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 4;
      const k = (y * size + x) * 4;
      out[k] = Math.round(Math.min(1, Math.max(0, dx * 0.5 + 0.5)) * 255);
      out[k + 1] = Math.round(Math.min(1, Math.max(0, dy * 0.5 + 0.5)) * 255);
      out[k + 2] = Math.round(fbm(x, y, size, 4, 4, 4, seed + 101) * 255);
      out[k + 3] = Math.round(fbm(x, y, size, 2, 16, 4, seed + 202) * 255);
    }
  return out;
}
