/**
 * Generadores pseudoaleatorios deterministas (reproducibilidad de experimentos).
 * mulberry32: 32 bits de estado, periodo 2³², suficiente para semillas de visualización.
 */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Normal estándar por Box–Muller a partir de un generador uniforme. */
export function gaussian(rng: () => number): number {
  let u = 0;
  while (u <= 1e-300) u = rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Punto uniforme en la bola unidad. */
export function uniformInBall(rng: () => number): [number, number, number] {
  for (;;) {
    const x = 2 * rng() - 1;
    const y = 2 * rng() - 1;
    const z = 2 * rng() - 1;
    if (x * x + y * y + z * z <= 1) return [x, y, z];
  }
}

/** Hash entero → [0, 1) (para patrones procedurales deterministas). */
export function hash01(n: number): number {
  let h = n | 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
