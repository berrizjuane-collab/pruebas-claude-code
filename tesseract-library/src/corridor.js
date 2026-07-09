// ============================================================================
// Recursión escénica: el ÁRBOL de líneas temporales (efecto Droste ramificado).
//
// renderRoom(depth, transform) emite UNA habitación y se llama a sí misma con
// branching factor VARIABLE: los instantes donde el usuario perturbó el polvo
// de forma significativa (una intervención de Cooper) se vuelven nodos de
// bifurcación con 2-3 hijos — líneas de tiempo alternativas que divergen
// lateralmente en Y/Z además de avanzar en W. Los instantes sin intervención
// siguen siendo lineales. Hacia el pasado se recorre la cadena de padres, y en
// cada bifurcación ya existente los caminos no tomados también se despliegan.
//
// Identidad de nodos: (t, tag) — t es el instante absoluto (entero) y tag la
// historia de bifurcaciones "τ:j;τ:j;…" (en τ se tomó la alternativa j). La
// clave `${t}|${tag}` es única en todo el árbol, lo que garantiza la propiedad
// de árbol (aristas = nodos − 1) verificada al arrancar.
//
// Casos base explícitos, lo que ocurra primero:
//   1) profundidad máxima del árbol
//   2) umbral de escala proyectada (= distancia a la cámara 4D)
//   3) presupuesto total de nodos (tope de recursos, no de forma)
// ============================================================================

import * as THREE from 'three';
import { w4PerspectiveScale } from './math.js';

// ── Identidad y geometría del árbol ─────────────────────────────────────────

export const nodeKey = (t, tag) => `${t}|${tag}`;

export function parseTag(tag) {
  if (!tag) return [];
  return tag.slice(0, -1).split(';').map((s) => {
    const [a, b] = s.split(':');
    return [+a, +b];
  });
}

export function prettyTag(tag) {
  const segs = parseTag(tag);
  return segs.length ? '⌁' + segs.map(([, j]) => j).join('·') : '';
}

const lastForkTime = (tag) => {
  const segs = parseTag(tag);
  return segs.length ? segs[segs.length - 1][0] : -Infinity;
};

const stripLastSeg = (tag) => {
  const i = tag.lastIndexOf(';', tag.length - 2);
  return i === -1 ? '' : tag.slice(0, i + 1);
};

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// direcciones laterales de divergencia (x = 0: el eje X ya carga la
// proyección del tiempo con XW; las ramas se abren en Y/Z)
const DIRS = [
  [0, 1, 0], [0, -1, 0],
  [0, 0.62, 0.79], [0, -0.62, -0.79],
  [0, 0.62, -0.79], [0, -0.62, 0.79],
];
const LAMBDA = 0.42; // paso lateral por instante de rama
const SAT = 3;       // la divergencia satura a los 3 instantes

/**
 * Desplazamiento lateral 3D absoluto de un nodo — función pura de (t, tag):
 * cada segmento de bifurcación empuja en su dirección propia, creciendo con
 * la edad de la rama hasta saturar. El motor lo resta contra el del ancla,
 * así el re-anclaje es una traslación rígida (sin costuras).
 */
export function offsetOf(t, tag) {
  const o = [0, 0, 0];
  let prefix = '';
  for (const [tau, j] of parseTag(tag)) {
    const d = DIRS[hashStr(prefix + tau + ':' + j) % DIRS.length];
    const m = LAMBDA * Math.min(Math.max(t - tau, 0), SAT);
    o[0] += d[0] * m;
    o[1] += d[1] * m;
    o[2] += d[2] * m;
    prefix += tau + ':' + j + ';';
  }
  return o;
}

// ── La recursión ────────────────────────────────────────────────────────────

function nodeTransform(t, tag, ctx, extra) {
  const timeIndex = t - ctx.anchorT;
  return { t, tag, key: nodeKey(t, tag), timeIndex, w: timeIndex * ctx.deltaW, ...extra };
}

/** Hijo temporal: j = 0 continúa la misma línea; j ≥ 1 abre una alternativa. */
function futureChild(tr, meRoom, j, ctx) {
  const tag = j === 0 ? tr.tag : tr.tag + tr.t + ':' + j + ';';
  return nodeTransform(tr.t + 1, tag, ctx, { dir: +1, mirror: !tr.mirror, parentRoom: meRoom });
}

function parentTransform(tr, meRoom, ctx) {
  const pt = tr.t - 1;
  const tag = lastForkTime(tr.tag) === pt ? stripLastSeg(tr.tag) : tr.tag;
  return nodeTransform(pt, tag, ctx, {
    dir: -1, mirror: !tr.mirror, childRoom: meRoom, cameFromKey: tr.key,
  });
}

export function renderRoom(depth, tr, ctx) {
  if (depth > ctx.maxDepth) return;                    // caso base 1: profundidad
  if (ctx.count() >= ctx.nodeBudget) return;           // caso base 3: presupuesto
  const scale = w4PerspectiveScale(tr.w, ctx.d4);
  if (!(scale >= ctx.minScale && scale <= ctx.maxScale)) return; // caso base 2: escala 4D

  const me = ctx.emit({ depth, scale, ...tr });

  if (tr.dir >= 0) {
    // FUTURO: branching factor variable — la intervención abre k hijos
    const arms = ctx.forkArms(tr.t, tr.tag);
    renderRoom(depth + 1, futureChild(tr, me, 0, ctx), ctx);
    for (let j = 1; j <= arms; j++) {
      renderRoom(depth + 1, futureChild(tr, me, j, ctx), ctx);
    }
  } else {
    // PASADO: cadena de padres; los desvíos no tomados también se abren
    renderRoom(depth + 1, parentTransform(tr, me, ctx), ctx);
    const arms = ctx.forkArms(tr.t, tr.tag);
    if (arms > 0) {
      for (let j = 0; j <= arms; j++) {
        const child = futureChild(tr, me, j, ctx);
        if (child.key !== tr.cameFromKey) renderRoom(depth + 1, child, ctx);
      }
    }
  }
}

/** Raíz del árbol: la habitación ancla y sus ramas hacia ±W. */
export function buildCorridorTree(ctx) {
  const trA = nodeTransform(ctx.anchorT, ctx.anchorTag, ctx, { dir: 0, mirror: false });
  const anchor = ctx.emit({ depth: 0, scale: 1, ...trA });
  const arms = ctx.forkArms(ctx.anchorT, ctx.anchorTag);
  renderRoom(1, futureChild(trA, anchor, 0, ctx), ctx);
  for (let j = 1; j <= arms; j++) {
    renderRoom(1, futureChild(trA, anchor, j, ctx), ctx);
  }
  renderRoom(1, parentTransform(trA, anchor, ctx), ctx);
}

/**
 * Corrida en seco para validación: la MISMA recursión con un emisor contador.
 * Verifica terminación por los tres casos base, unicidad de claves y la
 * propiedad de árbol (aristas = nodos − 1).
 */
export function simulateCorridor(params) {
  let rooms = 0, edges = 0, maxDepthSeen = 0, overflow = false;
  const keys = new Set();
  const interventions = params.interventions || {};
  const ctx = {
    anchorT: params.anchorT ?? 0,
    anchorTag: params.anchorTag ?? '',
    maxDepth: params.maxDepth,
    minScale: params.minScale,
    maxScale: params.maxScale,
    deltaW: params.deltaW,
    d4: params.d4,
    nodeBudget: params.nodeBudget ?? Infinity,
    count: () => rooms,
    forkArms: (t, tag) => Math.max((interventions[nodeKey(t, tag)] || 1) - 1, 0),
    emit: (spec) => {
      rooms++;
      keys.add(spec.key);
      if (spec.parentRoom || spec.childRoom) edges++;
      maxDepthSeen = Math.max(maxDepthSeen, spec.depth);
      return { key: spec.key };
    },
  };
  try {
    buildCorridorTree(ctx);
  } catch (err) {
    if (err instanceof RangeError) overflow = true; else throw err;
  }
  return { rooms, edges, maxDepthSeen, overflow, uniqueKeys: keys.size === rooms, keys: [...keys] };
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

// estrella de bifurcación: aristas convergiendo al nodo donde el árbol se abre
function makeForkGeometry() {
  const pos = [], col = [];
  const n = 12;
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2;
    const r = i % 2 ? 0.34 : 0.2;
    const dx = Math.cos(th) * r;
    const dy = (i % 3 - 1) * 0.16;
    const dz = Math.sin(th) * r;
    pos.push(0, 0, 0, dx, dy, dz);
    col.push(1.15, 0.95, 0.68, 0.12, 0.09, 0.05);
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
export function createRoomAssets(glowTexture) {
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
  const forkGeo = makeForkGeometry();
  const forkMat = new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const forkSpriteMat = new THREE.SpriteMaterial({
    map: glowTexture, color: 0xffdfae, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  return { lattices, lineMats, bookGeo, bookMat, pickGeo, pickMat, forkGeo, forkMat, forkSpriteMat };
}

const BOOK_COLORS = [0xd9995a, 0xb97a3a, 0x8a5a28, 0x6d4520, 0x3a2a18, 0xe8b464, 0x9a6a30];

/**
 * Crea el nodo Three.js de una habitación según su LOD. Los libros se
 * siembran de forma determinista con la CLAVE del nodo: la misma habitación
 * conserva sus libros al re-anclar, y cada línea temporal alternativa tiene
 * los suyos propios (otro libro caído, otras alturas — otra historia).
 */
export function createRoomNode(spec, assets, isFork) {
  const lod = lodForIndex(spec.timeIndex);
  const lodSpec = LODS[lod];
  const group = new THREE.Group();
  group.userData.isRoom = true;

  const lattice = new THREE.LineSegments(assets.lattices[lod], assets.lineMats[lod]);
  group.add(lattice);

  let books = null;
  const bookCount = lodSpec.shelves * lodSpec.booksPerShelf * 2;
  if (bookCount > 0) {
    const rand = mulberry32(hashStr(spec.key) ^ 0x9e3779b9);
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

  // nodo de bifurcación: estrella de aristas convergentes + halo pulsante
  let forkSprite = null;
  if (isFork) {
    const star = new THREE.LineSegments(assets.forkGeo, assets.forkMat);
    star.position.set(0, 0.99, 0); // en el techo: donde el pasillo se abre
    group.add(star);
    forkSprite = new THREE.Sprite(assets.forkSpriteMat);
    forkSprite.position.set(0, 0.99, 0);
    forkSprite.scale.setScalar(0.55);
    group.add(forkSprite);
  }

  // volumen invisible de selección (raycast); colorWrite=false ⇒ no dibuja
  const pick = new THREE.Mesh(assets.pickGeo, assets.pickMat);
  pick.userData.timeIndex = spec.timeIndex;
  group.add(pick);

  return { group, books, pendulum, pick, lod, forkSprite };
}
