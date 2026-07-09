// ============================================================================
// Ruido de gradiente 3D compacto (Perlin simplificado) + pseudo-curl.
// Lattice entera, hash determinista de 32 bits, 12 gradientes, fade quíntico.
// Puro y sin estado: apto para validación y para el hilo principal.
// ============================================================================

const GRAD = new Float32Array([
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0,
  1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1,
  0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
]);

function hash3(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 1440662683) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + (b - a) * t;

function gdot(ix, iy, iz, fx, fy, fz) {
  const g = (hash3(ix, iy, iz) % 12) * 3;
  return GRAD[g] * fx + GRAD[g + 1] * fy + GRAD[g + 2] * fz;
}

/** Ruido de gradiente 3D, salida aproximadamente en [−1, 1]. */
export function noise3(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const u = fade(fx), v = fade(fy), w = fade(fz);

  const n000 = gdot(ix, iy, iz, fx, fy, fz);
  const n100 = gdot(ix + 1, iy, iz, fx - 1, fy, fz);
  const n010 = gdot(ix, iy + 1, iz, fx, fy - 1, fz);
  const n110 = gdot(ix + 1, iy + 1, iz, fx - 1, fy - 1, fz);
  const n001 = gdot(ix, iy, iz + 1, fx, fy, fz - 1);
  const n101 = gdot(ix + 1, iy, iz + 1, fx - 1, fy, fz - 1);
  const n011 = gdot(ix, iy + 1, iz + 1, fx, fy - 1, fz - 1);
  const n111 = gdot(ix + 1, iy + 1, iz + 1, fx - 1, fy - 1, fz - 1);

  return lerp(
    lerp(lerp(n000, n100, u), lerp(n010, n110, u), v),
    lerp(lerp(n001, n101, u), lerp(n011, n111, u), v),
    w
  ) * 1.9;
}

/**
 * Pseudo-curl en el plano XZ del campo escalar de ruido: el rotor de un
 * potencial escalar da un campo con divergencia ~0 (el polvo se arremolina
 * en vez de acumularse). La componente Y se maneja aparte (térmica lenta).
 */
export function curlXZ(x, y, z, out = [0, 0, 0]) {
  const e = 0.35, inv = 1 / (2 * e);
  out[0] = (noise3(x, y, z + e) - noise3(x, y, z - e)) * inv;
  out[1] = 0;
  out[2] = -(noise3(x + e, y, z) - noise3(x - e, y, z)) * inv;
  return out;
}
