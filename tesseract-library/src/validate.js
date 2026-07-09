// ============================================================================
// Validaciones automáticas (console.assert + reporte para el HUD).
// Corren al arrancar, antes de la capa visual:
//   1 · generador recursivo de hipercubos (conteos exactos n = 0..5)
//   2 · ortogonalidad y determinante de las 6 matrices de rotación
//   3 · corrección del pipeline de proyección 4D→3D→2D
//   4 · terminación de la recursión del pasillo por AMBOS casos base
//   5 · higiene del grafo de escena tras re-anclajes (cero huérfanos)
// ============================================================================

import {
  generateHypercube, ROTATION_PLANES, rotationMatrix4, composeRotations,
  mat4Identity, mat4Multiply, mat4Transpose, mat4MaxDiff, det4, applyMat4,
  project4Dto3D, project3Dto2D, w4PerspectiveScale,
} from './math.js';

export function runValidations(hooks) {
  const results = [];
  const check = (name, ok) => {
    results.push({ name, ok: !!ok });
    console.assert(ok, `[VALIDACIÓN FALLIDA] ${name}`);
  };

  // ── 1 · Hipercubos por recursión ──
  for (let n = 0; n <= 5; n++) {
    const { vertices, edges } = generateHypercube(n);
    check(`${n}-cubo: 2^${n} = ${2 ** n} vértices`, vertices.length === 2 ** n);
    check(`${n}-cubo: n·2^(n−1) = ${n * 2 ** (n - 1)} aristas`, edges.length === n * 2 ** (n - 1));
  }
  const t4 = generateHypercube(4);
  check('teseracto: 16 vértices, 32 aristas', t4.vertices.length === 16 && t4.edges.length === 32);
  check('teseracto: toda arista mide exactamente 2', t4.edges.every(([a, b]) => {
    let d2 = 0;
    for (let i = 0; i < 4; i++) d2 += (t4.vertices[a][i] - t4.vertices[b][i]) ** 2;
    return Math.abs(d2 - 4) < 1e-12;
  }));
  check('teseracto: 32 aristas únicas', new Set(
    t4.edges.map(([a, b]) => (a < b ? `${a}-${b}` : `${b}-${a}`))
  ).size === 32);
  const deg = new Array(16).fill(0);
  t4.edges.forEach(([a, b]) => { deg[a]++; deg[b]++; });
  check('teseracto: grado 4 en cada vértice', deg.every((d) => d === 4));

  // ── 2 · Rotaciones ──
  const I = mat4Identity();
  for (const { key, a, b } of ROTATION_PLANES) {
    const M = rotationMatrix4(a, b, 0.947 + a * 0.31 + b * 0.173);
    check(`R_${key}: ortogonal (M·Mᵀ = I)`, mat4MaxDiff(mat4Multiply(M, mat4Transpose(M)), I) < 1e-12);
    check(`R_${key}: det = +1`, Math.abs(det4(M) - 1) < 1e-12);
  }
  const R = composeRotations({ xy: 0.4, xz: -1.1, xw: 0.83, yz: 2.4, yw: -0.31, zw: 1.57 });
  check('composición de las 6: ortogonal', mat4MaxDiff(mat4Multiply(R, mat4Transpose(R)), I) < 1e-10);
  const v = [0.3, -1.2, 2.1, -0.7];
  const rv = applyMat4(R, v);
  const norm = (u) => Math.hypot(u[0], u[1], u[2], u[3]);
  check('composición: preserva la norma 4D', Math.abs(norm(rv) - norm(v)) < 1e-10);

  // ── 3 · Pipeline de proyección ──
  check('4D→3D: el hiperplano w=0 proyecta a escala 1', w4PerspectiveScale(0, 3.2) === 1);
  const p = project4Dto3D([2, -4, 6, 1.6], 3.2); // s = 3.2/(3.2−1.6) = 2
  check('4D→3D: s = d₄/(d₄−w) exacto', Math.abs(p[0] - 4) < 1e-12 && Math.abs(p[1] + 8) < 1e-12 && Math.abs(p[2] - 12) < 1e-12);
  const q = project3Dto2D([3, -2, -5], 10); // k = 10/5 = 2
  check('3D→2D: pinhole exacto', q !== null && Math.abs(q[0] - 6) < 1e-12 && Math.abs(q[1] + 4) < 1e-12);
  check('3D→2D: rechaza puntos detrás de la cámara', project3Dto2D([1, 1, 0.5], 10) === null);

  // ── 4 · Terminación de la recursión y estructura de árbol ──
  if (hooks?.simulateCorridor) {
    const byDepth = hooks.simulateCorridor({ maxDepth: 9, minScale: 1e-9, maxScale: 1e9, deltaW: 0.001, d4: 3.2 });
    check('recursión: corta por profundidad (1 + 2·9 nodos sin intervenciones)', byDepth.rooms === 19 && byDepth.maxDepthSeen === 9 && !byDepth.overflow);
    const byScale = hooks.simulateCorridor({ maxDepth: 100000, minScale: 0.3, maxScale: 2.0, deltaW: 0.5, d4: 3.2 });
    check('recursión: corta por escala mucho antes del tope (18 nodos)', byScale.rooms === 18 && !byScale.overflow);
    const deep = hooks.simulateCorridor({ maxDepth: 3000, minScale: 0, maxScale: Infinity, deltaW: 1e-7, d4: 3.2 });
    check('recursión: 3000 niveles por rama sin desbordar la pila', deep.rooms === 6001 && !deep.overflow);

    // branching factor variable: una intervención de 3 ramas en el ancla
    const base = { maxDepth: 4, minScale: 1e-9, maxScale: 1e9, deltaW: 0.001, d4: 3.2 };
    const tree = hooks.simulateCorridor({ ...base, interventions: { '0|': 3 } });
    check('árbol: intervención ×3 en el ancla → 17 nodos (4 pasado + 3 subárboles de 4)', tree.rooms === 17 && !tree.overflow);
    check('árbol: propiedad de árbol (aristas = nodos − 1)', tree.edges === tree.rooms - 1);
    check('árbol: claves de nodo únicas en todo el árbol', tree.uniqueKeys);
    check('árbol: el nodo intervenido tiene 3 hijos (continuación + 2 alternativas)',
      ['1|', '1|0:1;', '1|0:2;'].every((k) => tree.keys.includes(k)));

    // bifurcación en el PASADO: el camino no tomado también se despliega
    const past = hooks.simulateCorridor({ ...base, interventions: { '-2|': 2 } });
    check('árbol: bifurcación pasada → la rama no tomada existe (11 nodos)',
      past.rooms === 11 && past.keys.includes('-1|-2:1;') && past.edges === past.rooms - 1);

    // caso base por presupuesto de nodos
    const budget = hooks.simulateCorridor({ ...base, maxDepth: 100, interventions: { '0|': 3 }, nodeBudget: 20 });
    check('árbol: el presupuesto de nodos corta la recursión (exactamente 20)', budget.rooms === 20 && budget.edges === 19);
  }

  // ── 5 · Higiene del grafo de escena ──
  if (hooks?.disposalProbe) {
    const d = hooks.disposalProbe();
    check('re-anclaje ×3: cero geometría huérfana en escena', d.orphans === 0);
    check('re-anclaje ×3: creado = destruido + vivo', d.created === d.disposed + d.alive);
    check(`re-anclaje ×3: población estable (${d.alive} habitaciones)`, d.stable && d.alive > 0);
  }

  const passed = results.filter((r) => r.ok).length;
  const summary = { results, passed, total: results.length, ok: passed === results.length };
  console.info(`[TESERACTO] Validaciones: ${passed}/${results.length} ${summary.ok ? 'OK ✓' : '— HAY FALLAS ✗'}`);
  return summary;
}
