// ============================================================================
// Recursión escénica: el pasillo infinito de habitaciones (efecto Droste).
//
// renderRoom(depth, transform) emite UNA habitación y se llama a sí misma
// para la siguiente a lo largo del eje temporal W. No hay bucle disfrazado:
// la cadena es una recursión real con DOBLE caso base explícito —
//   1) profundidad máxima del árbol,
//   2) umbral de escala proyectada (= distancia a la cámara 4D),
// lo que ocurra primero. La escala NO es un factor artístico: sale de la
// perspectiva 4D real, s = d4/(d4 − w). El pasado (w<0) se anida hacia
// adentro encogiéndose; el futuro (w>0) envuelve hacia afuera creciendo:
// exactamente el efecto de espejos enfrentados de la película.
// ============================================================================

import * as THREE from 'three';
import { w4PerspectiveScale } from './math.js';

// ── La recursión ────────────────────────────────────────────────────────────

export function renderRoom(depth, transform, ctx) {
  if (depth > ctx.maxDepth) return; // caso base 1: profundidad máxima

  const scale = w4PerspectiveScale(transform.w, ctx.d4);
  // caso base 2: umbral de escala/distancia 4D (cubre también s ≤ 0 e ∞,
  // es decir instantes en o detrás de la cámara-W)
  if (!(scale >= ctx.minScale && scale <= ctx.maxScale)) return;

  ctx.emit({ depth, scale, ...transform });

  renderRoom(depth + 1, {
    w: transform.w + transform.dir * ctx.deltaW,
    dir: transform.dir,
    mirror: !transform.mirror, // habitaciones adyacentes especulares
    timeIndex: transform.timeIndex + transform.dir,
  }, ctx);
}

/** Raíz del árbol: la habitación ancla (T+0) y las dos ramas ±W. */
export function buildCorridorTree(ctx) {
  ctx.emit({ depth: 0, scale: 1, w: 0, dir: 0, mirror: false, timeIndex: 0 });
  renderRoom(1, { w: +ctx.deltaW, dir: +1, mirror: true, timeIndex: +1 }, ctx);
  renderRoom(1, { w: -ctx.deltaW, dir: -1, mirror: true, timeIndex: -1 }, ctx);
}

/**
 * Corrida en seco para validación: recorre EXACTAMENTE la misma recursión
 * con un emisor contador (sin crear objetos). Permite verificar terminación
 * por ambos casos base y ausencia de desborde de pila.
 */
export function simulateCorridor(params) {
  let rooms = 0, maxDepthSeen = 0, overflow = false;
  const ctx = {
    ...params,
    emit: (r) => { rooms++; maxDepthSeen = Math.max(maxDepthSeen, r.depth); },
  };
  try {
    buildCorridorTree(ctx);
  } catch (err) {
    if (err instanceof RangeError) overflow = true; else throw err;
  }
  return { rooms, maxDepthSeen, overflow };
}

// ── Niveles de detalle ──────────────────────────────────────────────────────
// A mayor |índice temporal|, menos vértices y materiales más simples.

export const LODS = [
  { maxIndex: 2, shelves: 4, booksPerShelf: 13, furniture: true, pendulum: true },
  { maxIndex: 5, shelves: 3, booksPerShelf: 0, furniture: false, pendulum: false },
  { maxIndex: 9, shelves: 1, booksPerShelf: 0, furniture: false, pendulum: false },
  { maxIndex: Infinity, shelves: 0, booksPerShelf: 0, furniture: false, pendulum: false },
];

export const lodForIndex = (t) => LODS.findIndex((l) => Math.abs(t) <= l.maxIndex);

// ── Construcción de geometría compartida ────────────────────────────────────
// Espacio local de la habitación: caja [−1, 1]³. Piso en y = −1.
// Una sola geometría de líneas por LOD con brillo por vértice
// (un draw call por habitación para toda su estructura).

function makeLatticeGeometry(lod) {
  const pos = [], col = [];
  const seg = (x1, y1, z1, x2, y2, z2, b) => {
    pos.push(x1, y1, z1, x2, y2, z2);
    col.push(b, b * 0.82, b * 0.55, b, b * 0.82, b * 0.55); // rampa ámbar
  };

  // 12 aristas de la caja
  const eB = [1.0, 0.85, 0.62, 0.42][lod];
  const c = [-1, 1];
  for (const y of c) for (const z of c) seg(-1, y, z, 1, y, z, eB);
  for (const x of c) for (const z of c) seg(x, -1, z, x, 1, z, eB);
  for (const x of c) for (const y of c) seg(x, y, -1, x, y, 1, eB);

  const spec = LODS[lod];

  // estanterías en las paredes x = ±1
  const shelfYs = [];
  for (let i = 0; i < spec.shelves; i++) shelfYs.push(-0.62 + i * (1.56 / Math.max(spec.shelves - 1, 1)));
  for (const sx of c) {
    for (const y of shelfYs) seg(sx * 0.985, y, -0.96, sx * 0.985, y, 0.96, 0.5);
    if (lod === 0) {
      for (let j = 0; j <= 4; j++) {
        const z = -0.96 + j * 0.48;
        seg(sx * 0.985, -0.62, z, sx * 0.985, 0.94, z, 0.26);
      }
    }
  }

  if (lod <= 1) {
    // grilla del piso
    const step = lod === 0 ? 0.4 : 0.8;
    for (let v = -0.8; v <= 0.81; v += step) {
      seg(v, -0.998, -0.98, v, -0.998, 0.98, 0.13);
      seg(-0.98, -0.998, v, 0.98, -0.998, v, 0.13);
    }
    // la ventana del cuarto de Murph (pared z = −1)
    const wx0 = 0.12, wx1 = 0.78, wy0 = 0.02, wy1 = 0.82, zc = -0.995;
    seg(wx0, wy0, zc, wx1, wy0, zc, 0.72); seg(wx0, wy1, zc, wx1, wy1, zc, 0.72);
    seg(wx0, wy0, zc, wx0, wy1, zc, 0.72); seg(wx1, wy0, zc, wx1, wy1, zc, 0.72);
    seg((wx0 + wx1) / 2, wy0, zc, (wx0 + wx1) / 2, wy1, zc, 0.5);
    seg(wx0, (wy0 + wy1) / 2, zc, wx1, (wy0 + wy1) / 2, zc, 0.5);
    // marco de la puerta (pared z = +1)
    seg(-0.72, -1, 0.995, -0.72, 0.58, 0.995, 0.4);
    seg(-0.18, -1, 0.995, -0.18, 0.58, 0.995, 0.4);
    seg(-0.72, 0.58, 0.995, -0.18, 0.58, 0.995, 0.4);
  }

  if (spec.furniture) {
    // silueta en aristas: cama contra la pared derecha, escritorio bajo la ventana
    const box = (x0, y0, z0, x1, y1, z1, b) => {
      for (const y of [y0, y1]) for (const z of [z0, z1]) seg(x0, y, z, x1, y, z, b);
      for (const x of [x0, x1]) for (const z of [z0, z1]) seg(x, y0, z, x, y1, z, b);
      for (const x of [x0, x1]) for (const y of [y0, y1]) seg(x, y, z0, x, y, z1, b);
    };
    box(0.28, -1, 0.1, 0.92, -0.6, 0.95, 0.3);     // cama
    seg(0.28, -0.28, 0.97, 0.92, -0.28, 0.97, 0.3); // respaldo
    seg(0.28, -0.6, 0.97, 0.28, -0.28, 0.97, 0.3);
    seg(0.92, -0.6, 0.97, 0.92, -0.28, 0.97, 0.3);
    box(0.2, -1, -0.92, 0.7, -0.42, -0.6, 0.26);   // escritorio
    box(-0.88, -1, -0.5, -0.99, -0.2, 0.2, 0.22);  // biblioteca baja auxiliar
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Activos compartidos entre todas las habitaciones (geometrías y materiales). */
export function createRoomAssets() {
  const lattices = [0, 1, 2, 3].map(makeLatticeGeometry);
  const lineMats = [
    new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
    new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }),
    new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
    new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false }),
  ];
  const bookGeo = new THREE.BoxGeometry(0.14, 1, 1); // se escala por instancia
  const bookMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const pickGeo = new THREE.BoxGeometry(2, 2, 2);
  const pickMat = new THREE.MeshBasicMaterial({
    transparent: true, opacity: 0, depthWrite: false, colorWrite: false, side: THREE.DoubleSide,
  });
  return { lattices, lineMats, bookGeo, bookMat, pickGeo, pickMat };
}

const BOOK_COLORS = [0xd9995a, 0xb97a3a, 0x8a5a28, 0x6d4520, 0x3a2a18, 0xe8b464, 0x9a6a30];

/**
 * Crea el nodo Three.js de una habitación según su LOD. Los libros se
 * siembran de forma determinista con el índice temporal ABSOLUTO: la misma
 * habitación conserva sus libros al re-anclar el árbol (continuidad causal).
 */
export function createRoomNode(spec, assets, absoluteIndex) {
  const lod = lodForIndex(spec.timeIndex);
  const lodSpec = LODS[lod];
  const group = new THREE.Group();
  group.userData.isRoom = true;

  const lattice = new THREE.LineSegments(assets.lattices[lod], assets.lineMats[lod]);
  group.add(lattice);

  let books = null;
  const bookCount = lodSpec.shelves * lodSpec.booksPerShelf * 2;
  if (bookCount > 0) {
    const rand = mulberry32((absoluteIndex * 2654435761) ^ 0x9e3779b9);
    books = new THREE.InstancedMesh(assets.bookGeo, assets.bookMat, bookCount + 1);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const fallen = Math.floor(rand() * bookCount); // el libro que Murph ve caer
    let idx = 0;
    const shelfYs = [];
    for (let i = 0; i < lodSpec.shelves; i++) {
      shelfYs.push(-0.62 + i * (1.56 / Math.max(lodSpec.shelves - 1, 1)));
    }
    for (const sx of [-1, 1]) {
      for (const y of shelfYs) {
        for (let j = 0; j < lodSpec.booksPerShelf; j++) {
          const h = 0.16 + rand() * 0.12;
          const t = 0.026 + rand() * 0.028;
          dummy.position.set(
            sx * (1 - 0.075),
            y + h / 2 + 0.012,
            -0.86 + (j + 0.5) * (1.72 / lodSpec.booksPerShelf) + (rand() - 0.5) * 0.02
          );
          dummy.rotation.set(0, 0, 0);
          dummy.scale.set(1, h, t * (idx === fallen ? 0.0001 : 1)); // el caído deja un hueco
          if (rand() < 0.12) dummy.rotation.x = (rand() - 0.5) * 0.14; // libros inclinados
          dummy.updateMatrix();
          books.setMatrixAt(idx, dummy.matrix);
          color.setHex(BOOK_COLORS[Math.floor(rand() * BOOK_COLORS.length)]);
          // lomos en penumbra (factores en espacio lineal): solo algún
          // acento suelto se deja rozar por la luz
          color.multiplyScalar(rand() < 0.06 ? 0.5 : 0.07 + rand() * 0.1);
          books.setColorAt(idx, color);
          idx++;
        }
      }
    }
    // el libro caído, tirado en el piso junto a la pared
    dummy.position.set((fallen % 2 ? 1 : -1) * 0.78, -0.983, (rand() - 0.5) * 1.4);
    dummy.rotation.set(0, rand() * Math.PI, Math.PI / 2 * 0.92);
    dummy.scale.set(1, 0.26, 0.05);
    dummy.updateMatrix();
    books.setMatrixAt(idx, dummy.matrix);
    color.setHex(0xd9995a).multiplyScalar(0.12);
    books.setColorAt(idx, color);
    books.instanceMatrix.needsUpdate = true;
    if (books.instanceColor) books.instanceColor.needsUpdate = true;
    group.add(books);
  }

  // péndulo del reloj — el segundero que marca la señal en la película
  let pendulum = null;
  if (lodSpec.pendulum) {
    pendulum = new THREE.Group();
    pendulum.position.set(0.55, 0.98, -0.9);
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, -0.42, 0], 3));
    pg.setAttribute('color', new THREE.Float32BufferAttribute([0.9, 0.74, 0.5, 0.9, 0.74, 0.5], 3));
    pendulum.add(new THREE.Line(pg, assets.lineMats[0]));
    group.add(pendulum);
  }

  // volumen invisible de selección (raycast); colorWrite=false ⇒ no dibuja
  const pick = new THREE.Mesh(assets.pickGeo, assets.pickMat);
  pick.userData.timeIndex = spec.timeIndex;
  group.add(pick);

  return { group, books, pendulum, pick, lod };
}
