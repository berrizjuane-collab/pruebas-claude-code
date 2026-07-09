// ============================================================================
// Núcleo de geometría N-dimensional. Puro: sin Three.js, sin DOM, testeable.
//
// Convenciones:
//   · matrices 4×4 planas row-major (Float64Array de 16)
//   · vectores como arrays [x, y, z, w]  (ejes 0..3)
//   · la cámara 4D vive en w = +d4 mirando hacia −w
// ============================================================================

/**
 * Genera un hipercubo n-dimensional por recursión estructural:
 * un n-cubo son dos (n−1)-cubos desplazados a ∓1 en el eje nuevo y unidos
 * vértice a vértice. Caso base: el 0-cubo es un único punto (vector vacío).
 *
 * Devuelve { vertices: number[][], edges: [number, number][] } con
 * coordenadas en {−1, +1}ⁿ. Propiedades: 2ⁿ vértices, n·2ⁿ⁻¹ aristas.
 */
export function generateHypercube(n) {
  if (!Number.isInteger(n) || n < 0) {
    throw new RangeError('generateHypercube: n debe ser un entero ≥ 0');
  }
  if (n === 0) return { vertices: [[]], edges: [] };

  const prev = generateHypercube(n - 1);
  const half = prev.vertices.length;

  const vertices = [];
  for (const v of prev.vertices) vertices.push([...v, -1]);
  for (const v of prev.vertices) vertices.push([...v, +1]);

  const edges = [];
  for (const [a, b] of prev.edges) edges.push([a, b]);
  for (const [a, b] of prev.edges) edges.push([a + half, b + half]);
  for (let i = 0; i < half; i++) edges.push([i, i + half]);

  return { vertices, edges };
}

// ── Álgebra 4×4 ─────────────────────────────────────────────────────────────

export function mat4Identity() {
  const m = new Float64Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

/** C = A·B */
export function mat4Multiply(A, B) {
  const C = new Float64Array(16);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += A[r * 4 + k] * B[k * 4 + c];
      C[r * 4 + c] = s;
    }
  }
  return C;
}

export function mat4Transpose(M) {
  const T = new Float64Array(16);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) T[c * 4 + r] = M[r * 4 + c];
  return T;
}

/** out = M·v (v de longitud 4) */
export function applyMat4(M, v, out = [0, 0, 0, 0]) {
  const x = v[0], y = v[1], z = v[2], w = v[3];
  out[0] = M[0] * x + M[1] * y + M[2] * z + M[3] * w;
  out[1] = M[4] * x + M[5] * y + M[6] * z + M[7] * w;
  out[2] = M[8] * x + M[9] * y + M[10] * z + M[11] * w;
  out[3] = M[12] * x + M[13] * y + M[14] * z + M[15] * w;
  return out;
}

export function mat4MaxDiff(A, B) {
  let d = 0;
  for (let i = 0; i < 16; i++) d = Math.max(d, Math.abs(A[i] - B[i]));
  return d;
}

/** Determinante por expansión de Laplace — solo para validación. */
export function det4(M) {
  const m = (r, c) => M[r * 4 + c];
  const det3 = (a, b, c, d, e, f, g, h, i) =>
    a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  let det = 0;
  for (let c = 0; c < 4; c++) {
    const rows = [1, 2, 3];
    const cols = [0, 1, 2, 3].filter(k => k !== c);
    const sub = det3(
      m(rows[0], cols[0]), m(rows[0], cols[1]), m(rows[0], cols[2]),
      m(rows[1], cols[0]), m(rows[1], cols[1]), m(rows[1], cols[2]),
      m(rows[2], cols[0]), m(rows[2], cols[1]), m(rows[2], cols[2])
    );
    det += (c % 2 === 0 ? 1 : -1) * m(0, c) * sub;
  }
  return det;
}

// ── Rotaciones de R⁴ ────────────────────────────────────────────────────────
// En 4D no se rota alrededor de un eje sino DENTRO de un plano.
// Hay exactamente 6 planos coordenados: los 3 "espaciales" (XY, XZ, YZ)
// y los 3 que mezclan espacio con tiempo-W (XW, YW, ZW).

export const ROTATION_PLANES = [
  { key: 'xy', a: 0, b: 1 },
  { key: 'xz', a: 0, b: 2 },
  { key: 'xw', a: 0, b: 3 },
  { key: 'yz', a: 1, b: 2 },
  { key: 'yw', a: 1, b: 3 },
  { key: 'zw', a: 2, b: 3 },
];

/** Rotación simple en el plano (a,b). Ortogonal, det = +1. */
export function rotationMatrix4(a, b, theta) {
  const m = mat4Identity();
  const c = Math.cos(theta), s = Math.sin(theta);
  m[a * 4 + a] = c;
  m[a * 4 + b] = -s;
  m[b * 4 + a] = s;
  m[b * 4 + b] = c;
  return m;
}

/**
 * Compone las 6 rotaciones en orden canónico fijo XY·XZ·XW·YZ·YW·ZW.
 * `angles` es { xy, xz, xw, yz, yw, zw } en radianes (faltantes = 0).
 */
export function composeRotations(angles) {
  let R = mat4Identity();
  for (const { key, a, b } of ROTATION_PLANES) {
    const th = angles[key] || 0;
    if (th !== 0) R = mat4Multiply(R, rotationMatrix4(a, b, th));
  }
  return R;
}

// ── Pipeline de proyección ──────────────────────────────────────────────────
// Etapa 1 (4D→3D): perspectiva desde una cámara-W en w = +d4.
// Etapa 2 (3D→2D): pinhole estándar en espacio de cámara (mira hacia −z).
// Ambas son funciones puras; la etapa 2 se usa también para anclar el HUD.

/** Factor de escala de la perspectiva 4D: s = d4 / (d4 − w). */
export function w4PerspectiveScale(w, d4) {
  return d4 / (d4 - w);
}

/** Proyección perspectiva 4D→3D: [x,y,z,w] → [x·s, y·s, z·s]. */
export function project4Dto3D(v4, d4, out = [0, 0, 0]) {
  const s = d4 / (d4 - v4[3]);
  out[0] = v4[0] * s;
  out[1] = v4[1] * s;
  out[2] = v4[2] * s;
  return out;
}

/**
 * Proyección pinhole 3D→2D de un punto YA en espacio de cámara.
 * Devuelve [x', y'] en unidades de `focal`, o null si el punto está
 * en/detrás del plano de la cámara (z ≥ 0).
 */
export function project3Dto2D(vCam, focal) {
  const z = vCam[2];
  if (z >= -1e-9) return null;
  const k = focal / -z;
  return [vCam[0] * k, vCam[1] * k];
}
