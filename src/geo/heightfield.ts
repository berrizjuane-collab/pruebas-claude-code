/**
 * Rejillas de alturas en el sistema local (x este, y norte) y consultas sobre ellas.
 * Convención (igual que el pipeline): vértice (i, j) en x = −half + j·spacing,
 * y = half − i·spacing; la fila 0 es el norte. Valores = altitud geográfica (m).
 */
export class HeightGrid {
  constructor(
    readonly n: number,
    readonly spacing: number,
    readonly half: number,
    readonly data: Float32Array,
  ) {
    if (data.length !== n * n) throw new Error(`rejilla ${n}×${n} con ${data.length} valores`);
  }

  contains(x: number, y: number, margin = 0): boolean {
    return Math.abs(x) <= this.half - margin && Math.abs(y) <= this.half - margin;
  }

  at(i: number, j: number): number {
    return this.data[i * this.n + j];
  }

  /** Interpolación bilineal; fuera de la rejilla se usa el borde. */
  sample(x: number, y: number): number {
    const n = this.n;
    let fx = (x + this.half) / this.spacing;
    let fy = (this.half - y) / this.spacing;
    fx = Math.min(Math.max(fx, 0), n - 1.000001);
    fy = Math.min(Math.max(fy, 0), n - 1.000001);
    const j = Math.floor(fx);
    const i = Math.floor(fy);
    const tx = fx - j;
    const ty = fy - i;
    const d = this.data;
    const k = i * n + j;
    const a = d[k] * (1 - tx) + d[k + 1] * tx;
    const b = d[k + n] * (1 - tx) + d[k + n + 1] * tx;
    return a * (1 - ty) + b * ty;
  }

  heightAt(x: number, y: number): number {
    return this.sample(x, y);
  }

  /** Pendiente (∂h/∂x, ∂h/∂y) por diferencias centradas. */
  gradient(x: number, y: number): [number, number] {
    const s = this.spacing;
    return [(this.sample(x + s, y) - this.sample(x - s, y)) / (2 * s), (this.sample(x, y + s) - this.sample(x, y - s)) / (2 * s)];
  }

  max(): number {
    let m = -Infinity;
    for (let k = 0; k < this.data.length; k++) if (this.data[k] > m) m = this.data[k];
    return m;
  }
}

/** Combina anillos de detalle decreciente: usa la rejilla más fina que contiene el punto. */
export class TerrainSampler {
  constructor(readonly grids: HeightGrid[]) {}

  heightAt(x: number, y: number): number {
    for (const g of this.grids) if (g.contains(x, y)) return g.sample(x, y);
    return this.grids[this.grids.length - 1].sample(x, y);
  }

  gridAt(x: number, y: number): HeightGrid {
    for (const g of this.grids) if (g.contains(x, y)) return g;
    return this.grids[this.grids.length - 1];
  }
}

/**
 * Filtro de máximo con ventana cuadrada de radio `radius` (superconjunto conservador
 * del disco). Sirve para la holgura de cámara: si la cámara está por encima del
 * máximo dilatado + h, dista al menos min(radius, h) del terreno.
 */
export function dilateGrid(g: HeightGrid, radius: number): HeightGrid {
  const n = g.n;
  const k = Math.max(1, Math.ceil(radius / g.spacing));
  const tmp = new Float32Array(n * n);
  const out = new Float32Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let m = -Infinity;
      const j0 = Math.max(0, j - k);
      const j1 = Math.min(n - 1, j + k);
      for (let jj = j0; jj <= j1; jj++) m = Math.max(m, g.data[i * n + jj]);
      tmp[i * n + j] = m;
    }
  }
  for (let i = 0; i < n; i++) {
    const i0 = Math.max(0, i - k);
    const i1 = Math.min(n - 1, i + k);
    for (let j = 0; j < n; j++) {
      let m = -Infinity;
      for (let ii = i0; ii <= i1; ii++) m = Math.max(m, tmp[ii * n + j]);
      out[i * n + j] = m;
    }
  }
  return new HeightGrid(n, g.spacing, g.half, out);
}

export interface HeightQuery {
  heightAt(x: number, y: number): number;
}

/**
 * ¿Corta el relieve el segmento A→B? Avance tipo "sphere tracing" sobre el campo de
 * alturas: el paso es proporcional a la altura del rayo sobre el terreno (pendientes
 * de hasta ~70° → factor 1/3). Se ignoran los últimos `endTolerance` metros porque
 * el ancla de una etiqueta está apoyada en la propia superficie.
 */
export function rayBlocked(
  terrain: HeightQuery,
  ax: number,
  ay: number,
  aAlt: number,
  bx: number,
  by: number,
  bAlt: number,
  endTolerance = 40,
  minStep = 8,
): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bAlt - aAlt;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return false;
  const stop = len - endTolerance;
  let t = 0;
  let guard = 0;
  while (t < stop && guard++ < 4000) {
    const f = t / len;
    const x = ax + dx * f;
    const y = ay + dy * f;
    const z = aAlt + dz * f;
    const h = terrain.heightAt(x, y);
    const above = z - h;
    if (above < 0) return true;
    t += Math.max(minStep, above / 3);
  }
  return false;
}
