// ============================================================================
// Motor de la biblioteca tesseráctica.
//
// Pipeline por frame:
//   ángulos ← velocidades → R⁴ (composición de los 6 planos)
//   teseracto: 16 vértices 4D → R⁴ → proyección perspectiva 4D→3D
//   habitaciones: ancla 4D [0,0,0,w] → R⁴ → 4D→3D (posición Y escala reales)
//   polvo → integración de fuerzas → buffer dinámico
//   cámara (resortes + inercia + balanceo) → render → bloom → grano
//
// La proyección 3D→2D pura (math.project3Dto2D) se usa en producción para
// anclar el marcador del HUD a la habitación seleccionada.
// ============================================================================

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

import { generateHypercube, composeRotations, project3Dto2D, w4PerspectiveScale } from './math.js';
import {
  buildCorridorTree, simulateCorridor, createRoomAssets, createRoomNode,
  nodeKey, offsetOf, prettyTag, parseTag, hashStr,
} from './corridor.js';
import { DustField, createDustMaterial, morseBars } from './dust.js';
import { noise3 } from './noise.js';
import { createAudio } from './audio.js';

const ROOM_SIZE = 1.55;   // semi-extensión de la habitación en unidades de mundo
const TESS_SIZE = 2.3;    // radio del teseracto (la celda w=−1 anida la habitación)
const WORLD_SPREAD = 5.0; // separación espacial del eje temporal proyectado

// Profundidad y presupuesto del árbol: FIJOS, independientes de la calidad.
// (Fix regresión #1: el governor adaptativo bajaba maxDepth/budget en máquinas
// lentas y reconstruía un árbol podado — lo renderizado dejaba de corresponder
// a los instantes reales. La calidad ahora solo degrada polvo, resolución de
// bloom y pixel ratio; NUNCA la cantidad de nodos del árbol.)
const TREE_DEPTH = 14;
const NODE_BUDGET = 64;

const QUALITY = [
  { name: 'ALTA', dust: 4200, dpr: 1.75, bloomScale: 0.5 },
  { name: 'MEDIA', dust: 2600, dpr: 1.4, bloomScale: 0.35 },
  { name: 'BAJA', dust: 1500, dpr: 1.1, bloomScale: 0.25 },
];

export const DEFAULT_ANGLES = { xy: 0, xz: 0, xw: -1.04, yz: 0, yw: -0.22, zw: 0 };
export const DEFAULT_VELS = { xy: 0.016, xz: 0, xw: 0, yz: 0, yw: 0, zw: 0.05 };

function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,235,200,0.55)');
  grad.addColorStop(1, 'rgba(255,220,170,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

const FilmShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uGrain: { value: 0.055 },
    uVig: { value: 0.82 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uGrain, uVig;
    varying vec2 vUv;
    float hash(vec2 p) {
      p = fract(p * vec2(443.897, 441.423));
      p += dot(p, p.yx + 19.19);
      return fract((p.x + p.y) * p.x);
    }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float d = length((vUv - 0.5) * vec2(1.22, 1.0));
      c.rgb *= mix(1.0, smoothstep(1.05, 0.28, d), uVig);
      c.rgb *= vec3(1.015, 1.0, 0.982); // sesgo cálido de copia fílmica
      float g = hash(vUv * (1024.0 + fract(uTime) * 128.0)) - 0.5;
      c.rgb += g * uGrain * (0.4 + 0.6 * (1.0 - clamp(c.g, 0.0, 1.0)));
      gl_FragColor = c;
    }
  `,
};

const easeInOutQuint = (t) => (t < 0.5 ? 16 * t ** 5 : 1 - (-2 * t + 2) ** 5 / 2);

export function createEngine(canvas, cb) {
  // ── Estado ────────────────────────────────────────────────────────────
  const angles = { ...DEFAULT_ANGLES };
  const vels = { ...DEFAULT_VELS };
  let angleEase = null; // { from, to, start, dur }
  let paused = false;
  let d4 = 3.2;
  const deltaW = 0.58;
  const minScale = 0.16, maxScale = 2.7;
  let quality = 0;
  let anchorT = 0;      // instante absoluto del ancla
  let anchorTag = '';   // línea temporal del ancla (historia de bifurcaciones)
  let selection = null; // clave de nodo | null
  let hover = null;     // clave de nodo | null
  let glide = null;     // { to: [x,y,z,w], start, dur, room }
  const gOff = [0, 0, 0, 0]; // traslación 4D en curso (re-anclaje)
  let signalCount = 0;
  // intervenciones de Cooper: clave de nodo → k hijos (2-3). Persisten entre
  // re-anclajes: son los puntos de bifurcación del árbol temporal.
  const interventions = new Map();
  const anchorKey = () => nodeKey(anchorT, anchorTag);
  const forkArmsOf = (t, tag) => Math.max((interventions.get(nodeKey(t, tag)) || 1) - 1, 0);
  let disposedTotal = 0, createdTotal = 0;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  // ── Renderer / escena / cámara ────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, QUALITY[0].dpr));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x030406);
  scene.fog = new THREE.FogExp2(0x040507, 0.052);

  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 240);

  // ── Post-procesado: bloom controlado + grano/viñeta ───────────────────
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.62, 0.55, 0.6);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const film = new ShaderPass(FilmShader);
  composer.addPass(film);

  // ── Fondo: estrellas tenues + charcos de luz volumétrica aproximada ───
  {
    const n = 650, p = new Float32Array(n * 3), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = 55 + Math.random() * 30;
      const th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 2 - 1);
      p[i * 3] = r * Math.sin(ph) * Math.cos(th);
      p[i * 3 + 1] = r * Math.cos(ph);
      p[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
      const warm = Math.random();
      const b = 0.25 + Math.random() * 0.5;
      col[i * 3] = b * (0.75 + warm * 0.25);
      col[i * 3 + 1] = b * (0.72 + warm * 0.14);
      col[i * 3 + 2] = b * (0.85 - warm * 0.3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.PointsMaterial({
      size: 0.5, sizeAttenuation: true, vertexColors: true, transparent: true,
      opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    });
    scene.add(new THREE.Points(g, m));
  }
  const glowTex = makeGlowTexture();
  for (const [x, y, z, s, o, hex] of [
    [0, 2, -34, 46, 0.05, 0xc98d3f],
    [20, 7, -26, 30, 0.035, 0x6f7f92],
    [-19, -5, -28, 34, 0.045, 0xb97a2a],
  ]) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: hex, transparent: true, opacity: o,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    sp.position.set(x, y, z);
    sp.scale.setScalar(s);
    scene.add(sp);
  }

  // ── Teseracto central (proyección 4D real por frame) ──────────────────
  const tess = generateHypercube(4);
  const tessGroup = new THREE.Group();
  scene.add(tessGroup);
  const edgeMesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(1, 1, 1, 5, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }),
    tess.edges.length
  );
  edgeMesh.frustumCulled = false;
  {
    const col = new THREE.Color(0xe8b464);
    for (let i = 0; i < tess.edges.length; i++) edgeMesh.setColorAt(i, col);
  }
  tessGroup.add(edgeMesh);
  const vertGeo = new THREE.BufferGeometry();
  const vertPos = new Float32Array(16 * 3);
  vertGeo.setAttribute('position', new THREE.BufferAttribute(vertPos, 3).setUsage(THREE.DynamicDrawUsage));
  const vertPts = new THREE.Points(vertGeo, new THREE.PointsMaterial({
    map: glowTex, size: 0.33, sizeAttenuation: true, transparent: true, opacity: 0.75,
    color: 0xffd9a0, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  vertPts.frustumCulled = false;
  tessGroup.add(vertPts);
  const tessDummy = new THREE.Object3D();
  const tessColor = new THREE.Color();
  const tessProjected = tess.vertices.map(() => [0, 0, 0, 0]);

  // ── Árbol temporal recursivo ──────────────────────────────────────────
  const assets = createRoomAssets(glowTex);
  const corridorGroup = new THREE.Group();
  scene.add(corridorGroup);
  let rooms = [];        // registro vivo (nodos del árbol)
  let treeEdges = [];    // aristas padre→hijo (|aristas| = |nodos| − 1)
  let pickMeshes = [];
  let worldlines = null; // { mesh, pairs, positions }

  function disposeRoom(room) {
    room.group.removeFromParent();
    if (room.node.books) room.node.books.dispose();
    if (room.node.pendulum) {
      room.node.pendulum.children[0].geometry.dispose();
    }
    room.disposed = true;
    disposedTotal++;
  }

  function rebuildCorridor() {
    for (const r of rooms) disposeRoom(r);
    rooms = [];
    treeEdges = [];
    pickMeshes = [];
    if (worldlines) {
      worldlines.mesh.geometry.dispose();
      worldlines.mesh.removeFromParent();
      worldlines = null;
    }

    const aOff = offsetOf(anchorT, anchorTag); // el ancla renderiza en el origen
    const ctx = {
      anchorT, anchorTag,
      maxDepth: TREE_DEPTH,
      nodeBudget: NODE_BUDGET,
      minScale, maxScale, deltaW, d4,
      count: () => rooms.length,
      forkArms: forkArmsOf,
      emit: (spec) => {
        const arms = forkArmsOf(spec.t, spec.tag);
        const node = createRoomNode(spec, assets, arms > 0);
        corridorGroup.add(node.group);
        const off = offsetOf(spec.t, spec.tag);
        const room = {
          ...spec,
          ox: off[0] - aOff[0],
          oy: off[1] - aOff[1],
          oz: off[2] - aOff[2],
          isFork: arms > 0,
          forkArms: arms,
          node,
          group: node.group,
          disposed: false,
          _pos: new THREE.Vector3(),
          _scaleAbs: ROOM_SIZE,
          _visible: true,
        };
        node.pick.userData.room = room;
        if (spec.key !== anchorKey()) pickMeshes.push(node.pick);
        if (spec.parentRoom) treeEdges.push([spec.parentRoom, room]);
        if (spec.childRoom) treeEdges.push([room, spec.childRoom]);
        rooms.push(room);
        createdTotal++;
        return room;
      },
    };
    buildCorridorTree(ctx); // ← LA recursión (renderRoom, branching variable)

    // líneas de universo: los 8 vértices de cada habitación trazados a su
    // padre en el árbol — los rieles del pasillo, que ahora se ramifican
    const pairs = treeEdges;
    const segCount = pairs.length * 8;
    const wp = new Float32Array(segCount * 2 * 3);
    const wc = new Float32Array(segCount * 2 * 3);
    let ci = 0;
    for (const [a, b] of pairs) {
      const bri = 0.42 * Math.pow(0.86, Math.min(Math.abs(a.timeIndex), Math.abs(b.timeIndex)));
      for (let k = 0; k < 8; k++) {
        for (let e = 0; e < 2; e++) {
          wc[ci++] = bri; wc[ci++] = bri * 0.8; wc[ci++] = bri * 0.52;
        }
      }
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.BufferAttribute(wp, 3).setUsage(THREE.DynamicDrawUsage));
    wg.setAttribute('color', new THREE.BufferAttribute(wc, 3));
    const wl = new THREE.LineSegments(wg, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    wl.frustumCulled = false;
    corridorGroup.add(wl);
    worldlines = { mesh: wl, pairs, positions: wp };

    // una selección que apunta a un nodo ya no materializado no debe
    // dejar vivo un botón ENTRAR sin destino
    if (selection != null && !rooms.some((r) => r.key === selection)) selection = null;
    if (hover != null && !rooms.some((r) => r.key === hover)) hover = null;

    // Validación en vivo (regresión #1): lo renderizado tiene que
    // corresponder EXACTAMENTE a los nodos reales del árbol — se compara
    // el registro, la escena y una corrida en seco de la misma recursión.
    const cov = renderCoverage();
    console.assert(
      cov.inScene === cov.registry && cov.simulated === cov.registry,
      '[TESERACTO] cubos renderizados ≠ nodos del árbol',
      cov
    );
    console.info(
      `[TESERACTO] árbol materializado: ${cov.registry} nodos · ${cov.inScene} habitaciones en escena · ${cov.simulated} según corrida en seco ${cov.inScene === cov.registry && cov.simulated === cov.registry ? '✓' : '✗'}`
    );

    emitState();
  }

  /** Cobertura de render: registro vivo vs escena vs recursión en seco. */
  function renderCoverage() {
    let inScene = 0;
    scene.traverse((o) => { if (o.userData.isRoom) inScene++; });
    const dry = simulateCorridor({
      anchorT, anchorTag,
      maxDepth: TREE_DEPTH, nodeBudget: NODE_BUDGET,
      minScale, maxScale, deltaW, d4,
      interventions: Object.fromEntries(interventions),
    });
    return { inScene, registry: rooms.length, simulated: dry.rooms };
  }

  /** Sonda de higiene para la validación: 3 ciclos de re-anclaje. */
  function disposalProbe() {
    const sizes = [];
    for (let i = 0; i < 3; i++) {
      rebuildCorridor();
      sizes.push(rooms.length);
    }
    let inScene = 0;
    scene.traverse((o) => { if (o.userData.isRoom) inScene++; });
    return {
      created: createdTotal,
      disposed: disposedTotal,
      alive: rooms.length,
      orphans: inScene - rooms.length,
      stable: sizes.every((s) => s === sizes[0]),
    };
  }

  // ── Polvo ─────────────────────────────────────────────────────────────
  const dust = new DustField(QUALITY[0].dust);
  const dustMat = createDustMaterial();
  dustMat.uniforms.uPixelRatio.value = renderer.getPixelRatio();
  const dustPts = new THREE.Points(dust.geometry, dustMat);
  dustPts.frustumCulled = false;
  scene.add(dustPts);
  const bars = morseBars('STAY');

  // máquina de estados de la señal
  let signal = { phase: 'idle', t0: 0 };
  let energy = 0;
  let lastSignalEnd = -Infinity;

  function triggerSignal(now) {
    if (signal.phase !== 'idle' || now - lastSignalEnd < 14) return false;
    signal = { phase: 'forming', t0: now };
    dust.beginSignal(bars);
    signalCount++;
    audio.signalSwell();

    // la intervención de Cooper: este instante se vuelve punto de bifurcación
    const key = anchorKey();
    const prev = interventions.get(key);
    let forked = 0;
    if (!prev) {
      forked = interventions.size === 0 ? 3 : 2 + (hashStr(key) % 2);
      interventions.set(key, forked);
    } else if (prev < 3) {
      forked = 3; // insistir en el mismo instante abre una rama más
      interventions.set(key, 3);
    }
    signal.forked = forked;
    if (forked) rebuildCorridor(); // el árbol se abre mientras el polvo escribe

    cb.onSignal?.({ phase: 'forming', count: signalCount, forked });
    emitState();
    return true;
  }

  function stepSignal(now) {
    const t = now - signal.t0;
    switch (signal.phase) {
      case 'forming':
        if (t > 0.55) { signal = { ...signal, phase: 'hold', t0: now }; cb.onSignal?.({ phase: 'hold', count: signalCount, forked: signal.forked }); }
        return 34 * easeInOutQuint(Math.min(t / 0.55, 1));
      case 'hold':
        if (t > 3.0) {
          signal = { ...signal, phase: 'release', t0: now };
          dust.endSignal();
          cb.onSignal?.({ phase: 'release', count: signalCount, forked: signal.forked });
        }
        return 34;
      case 'release':
        if (t > 0.6) { signal = { phase: 'idle', t0: now }; lastSignalEnd = now; cb.onSignal?.({ phase: 'idle', count: signalCount }); }
        return 34 * (1 - Math.min(t / 0.6, 1));
      default:
        return 0;
    }
  }

  // ── Audio ─────────────────────────────────────────────────────────────
  const audio = createAudio();
  let audioOn = false;

  // ── Cámara: resortes, inercia, balanceo — fuera del espacio-tiempo ────
  const sph = { theta: 0.78, phi: 1.03, r: 12.2 };
  const sphT = { ...sph };
  let thetaVel = 0, phiVel = 0;
  let roll = 0;
  let lastInteract = 0;
  const lookCurrent = new THREE.Vector3();
  const camTmp = new THREE.Vector3();

  // ── Puntero / picking ─────────────────────────────────────────────────
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const pointer = {
    down: false, id: -1, x: 0, y: 0, downX: 0, downY: 0, downT: 0,
    moved: 0, stillSince: 0, lastX: 0, lastY: 0,
    pinch: null, // { d0, r0 }
  };
  const wells = [];
  const wellPoint = new THREE.Vector3();
  const prevWell = new THREE.Vector3();
  let clickPulse = 0;

  function updateNdc(e) {
    const r = canvas.getBoundingClientRect();
    ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  }

  function pickRoom() {
    if (glide) return null;
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(pickMeshes, false);
    return hits.length ? hits[0].object.userData.room : null;
  }

  function setHover(room) {
    const k = room ? room.key : null;
    if (k !== hover) {
      hover = k;
      canvas.style.cursor = room ? 'pointer' : 'crosshair';
      emitState();
    }
  }

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    lastInteract = performance.now() / 1000;
    if (pointer.down && pointer.id !== e.pointerId) {
      // segundo dedo: pinch
      pointer.pinch = { d0: Math.hypot(e.clientX - pointer.x, e.clientY - pointer.y), r0: sphT.r, id2: e.pointerId };
      return;
    }
    pointer.down = true;
    pointer.id = e.pointerId;
    pointer.x = pointer.lastX = pointer.downX = e.clientX;
    pointer.y = pointer.lastY = pointer.downY = e.clientY;
    pointer.downT = performance.now();
    pointer.moved = 0;
    pointer.stillSince = performance.now() / 1000;
    updateNdc(e);
  });

  canvas.addEventListener('pointermove', (e) => {
    lastInteract = performance.now() / 1000;
    updateNdc(e);
    if (pointer.pinch && e.pointerId === pointer.pinch.id2) {
      const d = Math.hypot(e.clientX - pointer.x, e.clientY - pointer.y);
      sphT.r = THREE.MathUtils.clamp(pointer.pinch.r0 * (pointer.pinch.d0 / Math.max(d, 20)), 4.5, 20);
      return;
    }
    if (pointer.down && e.pointerId === pointer.id) {
      const dx = e.clientX - pointer.lastX;
      const dy = e.clientY - pointer.lastY;
      pointer.moved += Math.abs(dx) + Math.abs(dy);
      if (Math.abs(dx) + Math.abs(dy) > 1.5) pointer.stillSince = performance.now() / 1000;
      sphT.theta -= dx * 0.0042;
      sphT.phi = THREE.MathUtils.clamp(sphT.phi - dy * 0.0034, 0.22, 2.9);
      thetaVel = -dx * 0.0042 * 60;
      phiVel = -dy * 0.0034 * 60;
      pointer.lastX = e.clientX;
      pointer.lastY = e.clientY;
      pointer.x = e.clientX;
      pointer.y = e.clientY;
    } else if (!pointer.down) {
      setHover(pickRoom());
    }
  });

  const endPointer = (e) => {
    if (pointer.pinch && e.pointerId === pointer.pinch.id2) { pointer.pinch = null; return; }
    if (e.pointerId !== pointer.id) return;
    pointer.down = false;
    pointer.pinch = null;
    const dt = performance.now() - pointer.downT;
    // umbral tolerante al jitter de mouse real: un click con micro-arrastre
    // sigue siendo un click (fix regresión #2, camino de click sobre la escena)
    if (pointer.moved < 11 && dt < 600) {
      updateNdc(e);
      const room = pickRoom();
      if (room) {
        if (selection === room.key) enterSelected();
        else { selection = room.key; emitState(); }
      } else {
        selection = null;
        clickPulse = 0.3; // soplo de polvo al tocar el vacío
        emitState();
      }
    }
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    lastInteract = performance.now() / 1000;
    sphT.r = THREE.MathUtils.clamp(sphT.r * Math.exp(e.deltaY * 0.0011), 4.5, 20);
  }, { passive: false });

  canvas.addEventListener('dblclick', () => {
    const room = pickRoom();
    if (room) { selection = room.key; enterSelected(); }
  });

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
    // recorrido plano del árbol en orden (t, línea): las flechas visitan
    // también las ramas alternativas
    const sorted = rooms
      .filter((r) => r.key !== anchorKey())
      .sort((a, b) => a.t - b.t || a.tag.localeCompare(b.tag))
      .map((r) => r.key);
    if (!sorted.length) return;
    const cur = selection != null ? sorted.indexOf(selection) : -1;
    switch (e.key) {
      case 'ArrowLeft': case '[':
        selection = sorted[cur <= 0 ? sorted.length - 1 : cur - 1];
        emitState();
        break;
      case 'ArrowRight': case ']':
        selection = sorted[cur === -1 || cur === sorted.length - 1 ? 0 : cur + 1];
        emitState();
        break;
      case 'Enter': enterSelected(); break;
      case 'Escape': selection = null; emitState(); break;
      case ' ': e.preventDefault(); paused = !paused; emitState(); break;
    }
  });

  // ── Re-anclaje: entrar en una habitación (elegir un nodo del árbol) ───

  /** Aplica el re-anclaje. Único camino de cambio de ancla: lo usan el glide
   *  de ENTRAR y la sonda de validación, así lo que se valida es lo mismo
   *  que dispara el click. Deja log verificable del nuevo nodo ancla. */
  function applyAnchor(room) {
    anchorT = room.t;
    anchorTag = room.tag;
    console.info(
      `[TESERACTO] re-anclado en ${anchorKey()} (t=${anchorT}, línea=${anchorTag ? prettyTag(anchorTag) : 'troncal'})`
    );
    rebuildCorridor(); // re-ancla el árbol recursivo en el nodo elegido
  }

  function enterSelected() {
    if (glide) return;
    if (selection == null) {
      console.warn('[TESERACTO] ENTRAR sin selección: elegí un instante primero');
      return;
    }
    const room = rooms.find((r) => r.key === selection);
    if (!room) {
      console.warn('[TESERACTO] ENTRAR: la selección ya no existe en el árbol', selection);
      selection = null;
      emitState();
      return;
    }
    console.info(`[TESERACTO] ENTRAR → ${room.key}`);
    glide = { to: [-room.ox, -room.oy, -room.oz, -room.w], start: elapsed, dur: 1.15, room };
    emitState();
  }

  function stepGlide(now) {
    if (!glide) return;
    const t = Math.min((now - glide.start) / glide.dur, 1);
    const k = easeInOutQuint(t);
    for (let i = 0; i < 4; i++) gOff[i] = glide.to[i] * k;
    if (t >= 1) {
      gOff[0] = gOff[1] = gOff[2] = gOff[3] = 0;
      selection = null;
      hover = null;
      const room = glide.room;
      glide = null;
      applyAnchor(room);
    }
  }

  // ── Emisión de estado al HUD ──────────────────────────────────────────
  function emitState() {
    const tree = rooms
      .map((r) => ({
        key: r.key,
        t: r.t,
        timeIndex: r.timeIndex,
        branchDepth: parseTag(r.tag).length,
        pretty: prettyTag(r.tag),
        isFork: r.isFork,
        arms: r.forkArms + 1,
        isAnchor: r.key === anchorKey(),
      }))
      .sort((a, b) => b.t - a.t || a.key.localeCompare(b.key));
    cb.onState?.({
      epoch: anchorT,
      anchorPretty: prettyTag(anchorTag),
      selection,
      hover,
      paused,
      audio: audioOn,
      quality,
      qualityName: QUALITY[quality].name,
      signalCount,
      gliding: !!glide,
      d4,
      tree,
      stats: {
        nodes: rooms.length,
        edges: treeEdges.length,
        forks: rooms.filter((r) => r.isFork).length,
        lines: new Set(rooms.map((r) => r.tag)).size,
      },
    });
  }

  // ── Loop principal ────────────────────────────────────────────────────
  const clock = new THREE.Clock();
  let elapsed = 0;
  let fps = 60;
  let frameAcc = 0, frameN = 0, lastGovern = 0, lastUpgrade = 0, goodSince = 0;
  let lastTelemetry = 0;
  let running = true;
  let firstFrame = false;
  const R4 = { m: null };
  const v4 = [0, 0, 0, 0];
  const rv4 = [0, 0, 0, 0];

  function applyQuality(q) {
    quality = q;
    const Q = QUALITY[q];
    dust.setCount(Q.dust);
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, Q.dpr));
    dustMat.uniforms.uPixelRatio.value = renderer.getPixelRatio();
    resize();
    emitState(); // el árbol NO se reconstruye: la calidad no poda nodos
  }

  function govern(now, dt) {
    frameAcc += dt; frameN++;
    if (now - lastGovern < 2.0) return;
    const avg = frameN / Math.max(frameAcc, 1e-4);
    fps = avg;
    frameAcc = 0; frameN = 0;
    lastGovern = now;
    if (avg < 34 && quality < QUALITY.length - 1) {
      applyQuality(quality + 1);
      goodSince = now;
    } else if (avg > 55) {
      if (goodSince === 0) goodSince = now;
      if (now - goodSince > 8 && quality > 0 && now - lastUpgrade > 12) {
        lastUpgrade = now;
        applyQuality(quality - 1);
        goodSince = now;
      }
    } else {
      goodSince = 0;
    }
  }

  function frame() {
    if (!running) return;
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    elapsed += dt;
    const now = elapsed;

    // 1 · ángulos 4D
    if (angleEase) {
      const t = Math.min((now - angleEase.start) / angleEase.dur, 1);
      const k = easeInOutQuint(t);
      for (const key of Object.keys(angles)) {
        angles[key] = angleEase.from[key] + (angleEase.to[key] - angleEase.from[key]) * k;
      }
      if (t >= 1) angleEase = null;
    } else if (!paused) {
      for (const key of Object.keys(angles)) angles[key] += vels[key] * dt;
    }
    const R = composeRotations(angles);

    // 2 · teseracto central: R⁴ → proyección 4D→3D
    for (let i = 0; i < 16; i++) {
      const src = tess.vertices[i];
      v4[0] = src[0]; v4[1] = src[1]; v4[2] = src[2]; v4[3] = src[3];
      const x = R[0] * v4[0] + R[1] * v4[1] + R[2] * v4[2] + R[3] * v4[3];
      const y = R[4] * v4[0] + R[5] * v4[1] + R[6] * v4[2] + R[7] * v4[3];
      const z = R[8] * v4[0] + R[9] * v4[1] + R[10] * v4[2] + R[11] * v4[3];
      const w = R[12] * v4[0] + R[13] * v4[1] + R[14] * v4[2] + R[15] * v4[3];
      const s = d4 / (d4 - w);
      const p = tessProjected[i];
      p[0] = x * s * TESS_SIZE; p[1] = y * s * TESS_SIZE; p[2] = z * s * TESS_SIZE; p[3] = w;
      vertPos[i * 3] = p[0]; vertPos[i * 3 + 1] = p[1]; vertPos[i * 3 + 2] = p[2];
    }
    vertGeo.attributes.position.needsUpdate = true;
    for (let i = 0; i < tess.edges.length; i++) {
      const [a, b] = tess.edges[i];
      const pa = tessProjected[a], pb = tessProjected[b];
      const mx = (pa[0] + pb[0]) / 2, my = (pa[1] + pb[1]) / 2, mz = (pa[2] + pb[2]) / 2;
      const dx = pb[0] - pa[0], dy = pb[1] - pa[1], dz = pb[2] - pa[2];
      const len = Math.hypot(dx, dy, dz) || 1e-4;
      tessDummy.position.set(mx, my, mz);
      tessDummy.quaternion.setFromUnitVectors(
        camTmp.set(0, 1, 0),
        new THREE.Vector3(dx / len, dy / len, dz / len)
      );
      // proximidad temporal: las aristas de la celda w→−1 (el "ahora") brillan más
      const wAvg = (pa[3] + pb[3]) / 2;
      const bri = 0.5 + 0.62 * (1 - (wAvg + 1) / 2);
      tessDummy.scale.set(0.0085 + 0.007 * bri, len, 0.0085 + 0.007 * bri);
      tessDummy.updateMatrix();
      edgeMesh.setMatrixAt(i, tessDummy.matrix);
      tessColor.setRGB(0.85 * bri, 0.63 * bri, 0.37 * bri);
      edgeMesh.setColorAt(i, tessColor);
    }
    edgeMesh.instanceMatrix.needsUpdate = true;
    if (edgeMesh.instanceColor) edgeMesh.instanceColor.needsUpdate = true;

    // 3 · re-anclaje en curso
    stepGlide(now);

    // 4 · habitaciones: mismo pipeline 4D real, ahora sobre el punto 4D
    // completo del nodo [ox, oy, oz, w] (offset lateral de rama + avance W)
    for (const room of rooms) {
      const ax = room.ox + gOff[0], ay = room.oy + gOff[1], az = room.oz + gOff[2], aw = room.w + gOff[3];
      const px = R[0] * ax + R[1] * ay + R[2] * az + R[3] * aw;
      const py = R[4] * ax + R[5] * ay + R[6] * az + R[7] * aw;
      const pz = R[8] * ax + R[9] * ay + R[10] * az + R[11] * aw;
      const pw = R[12] * ax + R[13] * ay + R[14] * az + R[15] * aw;
      const s = d4 / (d4 - pw);
      const visible = Number.isFinite(s) && s > 0.03 && s < 3.6;
      room._visible = visible;
      room.group.visible = visible;
      if (!visible) continue;
      room._pos.set(px * s * WORLD_SPREAD, py * s * WORLD_SPREAD, pz * s * WORLD_SPREAD);
      room._scaleAbs = s * ROOM_SIZE;
      room.group.position.copy(room._pos);
      room.group.scale.set(room.mirror ? -room._scaleAbs : room._scaleAbs, room._scaleAbs, room._scaleAbs);
      if (room.node.pendulum) {
        room.node.pendulum.rotation.z = Math.sin(now * 1.35 + (room.t * 1.7)) * 0.16;
      }
      if (room.node.forkSprite) {
        room.node.forkSprite.scale.setScalar(0.5 + 0.12 * Math.sin(now * 2.3 + room.t));
      }
    }

    // 5 · líneas de universo
    if (worldlines) {
      const wp = worldlines.positions;
      let o = 0;
      for (const [a, b] of worldlines.pairs) {
        const ok = a._visible && b._visible;
        for (let k = 0; k < 8; k++) {
          const cx = (k & 1) ? 1 : -1, cy = (k & 2) ? 1 : -1, cz = (k & 4) ? 1 : -1;
          if (ok) {
            wp[o++] = a._pos.x + cx * a._scaleAbs; wp[o++] = a._pos.y + cy * a._scaleAbs; wp[o++] = a._pos.z + cz * a._scaleAbs;
            wp[o++] = b._pos.x + cx * b._scaleAbs; wp[o++] = b._pos.y + cy * b._scaleAbs; wp[o++] = b._pos.z + cz * b._scaleAbs;
          } else {
            wp[o++] = 0; wp[o++] = 0; wp[o++] = 0;
            wp[o++] = 0; wp[o++] = 0; wp[o++] = 0;
          }
        }
      }
      worldlines.mesh.geometry.attributes.position.needsUpdate = true;
    }

    // 6 · polvo: pozos del puntero + señal Morse
    wells.length = 0;
    {
      raycaster.setFromCamera(ndc, camera);
      const ray = raycaster.ray;
      const tClosest = Math.max(-ray.origin.dot(ray.direction) / ray.direction.lengthSq(), 2);
      wellPoint.copy(ray.direction).multiplyScalar(Math.min(tClosest, 16)).add(ray.origin);
      wellPoint.clampScalar(-2.1, 2.1);
      const speed = wellPoint.distanceTo(prevWell) / Math.max(dt, 1e-3);

      if (pointer.down && !pointer.pinch) {
        const held = performance.now() / 1000 - pointer.stillSince;
        if (held > 0.35) {
          const f = Math.min(2.2 + held * 2.4, 7.5);
          wells.push({ x: wellPoint.x, y: wellPoint.y, z: wellPoint.z, f, r: 2.4 });
          energy += f * 0.55 * dt;
        } else {
          const f = Math.min(1.1 + speed * 0.5, 6);
          wells.push({ x: wellPoint.x, y: wellPoint.y, z: wellPoint.z, f, r: 2.7 });
          energy += f * (0.22 + Math.min(speed * 0.12, 0.5)) * dt;
        }
      } else if (hover === null) {
        wells.push({ x: wellPoint.x, y: wellPoint.y, z: wellPoint.z, f: 0.4, r: 1.5 });
      }
      if (clickPulse > 0) {
        wells.push({ x: wellPoint.x, y: wellPoint.y, z: wellPoint.z, f: -9 * clickPulse, r: 2.2 });
        clickPulse -= dt;
      }
      prevWell.copy(wellPoint);
    }
    energy *= Math.exp(-dt * 0.5);
    if (energy > 7.5 && signal.phase === 'idle') {
      if (triggerSignal(now)) energy = 0;
    }
    const morseK = stepSignal(now);
    dust.step(dt, now, wells, morseK);

    // 7 · cámara — resortes con inercia, balanceo, fov respirando
    {
      if (!pointer.down) {
        sphT.theta += thetaVel * dt;
        sphT.phi = THREE.MathUtils.clamp(sphT.phi + phiVel * dt, 0.22, 2.9);
        thetaVel *= Math.exp(-dt * 1.7);
        phiVel *= Math.exp(-dt * 1.7);
      }
      if (!reducedMotion && performance.now() / 1000 - lastInteract > 7) {
        sphT.theta += dt * 0.021; // deriva cinematográfica en reposo
      }
      const k = 1 - Math.exp(-dt * 5.2);
      sph.theta += (sphT.theta - sph.theta) * k;
      sph.phi += (sphT.phi - sph.phi) * k;
      sph.r += (sphT.r - sph.r) * (1 - Math.exp(-dt * 4));

      const sway = reducedMotion ? 0 : 0.055 * (sph.r / 10);
      const sx = noise3(now * 0.11, 7.3, 0) * sway;
      const sy = noise3(3.1, now * 0.09, 5.7) * sway;
      camera.position.set(
        sph.r * Math.sin(sph.phi) * Math.cos(sph.theta) + sx,
        sph.r * Math.cos(sph.phi) + sy + 0.35,
        sph.r * Math.sin(sph.phi) * Math.sin(sph.theta)
      );
      const selRoom = selection != null ? rooms.find((r) => r.key === selection) : null;
      camTmp.set(0, 0.1, 0);
      if (selRoom && selRoom._visible) camTmp.lerp(selRoom._pos, 0.22);
      lookCurrent.lerp(camTmp, 1 - Math.exp(-dt * 3.2));
      camera.up.set(0, 1, 0);
      camera.lookAt(lookCurrent);
      const rollT = reducedMotion ? 0 : THREE.MathUtils.clamp(-thetaVel * 0.32, -0.12, 0.12) + noise3(now * 0.05, 11.7, 0) * 0.012;
      roll += (rollT - roll) * (1 - Math.exp(-dt * 3));
      camera.rotateZ(roll);
      const speedMag = Math.abs(thetaVel) + Math.abs(phiVel);
      const fovT = 52 + Math.min(speedMag * 7, 4);
      if (Math.abs(camera.fov - fovT) > 0.02) {
        camera.fov += (fovT - camera.fov) * (1 - Math.exp(-dt * 4));
        camera.updateProjectionMatrix();
      }
    }

    // 8 · marcador del HUD vía proyección pura 3D→2D
    {
      const targetKey = selection ?? hover;
      const room = targetKey != null ? rooms.find((r) => r.key === targetKey) : null;
      if (room && room._visible && !glide) {
        camera.updateMatrixWorld();
        camTmp.copy(room._pos).applyMatrix4(camera.matrixWorldInverse);
        const h = canvas.clientHeight, w = canvas.clientWidth;
        const focalPx = (h / 2) / Math.tan((camera.fov * Math.PI) / 360);
        const pr = project3Dto2D([camTmp.x, camTmp.y, camTmp.z], focalPx);
        if (pr) {
          const dist = -camTmp.z;
          const sizePx = THREE.MathUtils.clamp((room._scaleAbs * 2 * focalPx) / dist, 36, 300);
          cb.onMarker?.({
            visible: true,
            x: w / 2 + pr[0],
            y: h / 2 - pr[1],
            size: sizePx,
            timeIndex: room.timeIndex,
            pretty: prettyTag(room.tag),
            isFork: room.isFork,
            mode: selection != null ? 'selected' : 'hover',
          });
        } else cb.onMarker?.({ visible: false });
      } else cb.onMarker?.({ visible: false });
    }

    // 9 · render + telemetría
    film.uniforms.uTime.value = now;
    composer.render();
    govern(now, dt);

    if (now - lastTelemetry > 0.12) {
      lastTelemetry = now;
      cb.onTelemetry?.({ angles: { ...angles }, fps });
    }

    if (!firstFrame) {
      firstFrame = true;
      canvas.classList.add('ready');
      window.__TESSERACT_READY__ = true;
      cb.onReady?.();
    }
  }

  function resize() {
    const w = canvas.clientWidth || innerWidth;
    const h = canvas.clientHeight || innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    const bs = QUALITY[quality].bloomScale;
    bloom.setSize(Math.max(w * bs, 128), Math.max(h * bs, 128));
  }
  window.addEventListener('resize', resize);
  resize();
  rebuildCorridor();
  requestAnimationFrame(frame);

  // ── API pública ───────────────────────────────────────────────────────
  const api = {
    setVelocity(key, v) { vels[key] = v; },
    getAngles: () => ({ ...angles }),
    easeAnglesTo(target, dur = 1.6) {
      angleEase = { from: { ...angles }, to: { ...DEFAULT_ANGLES, ...target }, start: elapsed, dur };
    },
    collapseTime() {
      for (const k of Object.keys(vels)) vels[k] = 0;
      api.easeAnglesTo({ xy: 0, xz: 0, xw: 0, yz: 0, yw: 0, zw: 0 });
      emitState();
    },
    unfoldTime() {
      Object.assign(vels, DEFAULT_VELS);
      api.easeAnglesTo({ ...DEFAULT_ANGLES });
      emitState();
    },
    setPaused(p) { paused = p; emitState(); },
    setD4(v) {
      d4 = v;
      clearTimeout(api._d4t);
      api._d4t = setTimeout(() => rebuildCorridor(), 260); // el caso base por escala cambia
      emitState();
    },
    select(key) { selection = key; emitState(); },
    enterSelected,
    /** El chip del marcador en modo hover selecciona el nodo bajo el cursor. */
    selectHovered() {
      if (hover != null) { selection = hover; emitState(); }
    },
    setAudio(on) { audioOn = on; audio.setEnabled(on); emitState(); },
    requestState: emitState,
    hooks: {
      simulateCorridor,
      disposalProbe,
      renderCoverage,
      /** Sonda de ENTRAR: ejercita el mismo applyAnchor del click (ida y
       *  vuelta al ancla original) y confirma el cambio de estado. */
      probeEnter() {
        const from = { t: anchorT, tag: anchorTag, key: anchorKey() };
        const target = rooms.find((r) => r.key !== from.key);
        if (!target) return { ok: false };
        const targetKey = target.key;
        applyAnchor(target);
        const moved = anchorKey() === targetKey;
        const back = rooms.find((r) => r.t === from.t && r.tag === from.tag);
        if (back) applyAnchor(back);
        return { ok: moved && anchorKey() === from.key, visited: targetKey };
      },
    },
    debug: {
      triggerSignal: () => triggerSignal(elapsed),
      pickAt(nx, ny) {
        ndc.set(nx, ny);
        const r = pickRoom();
        return r ? r.key : null;
      },
      getRooms: () => rooms.map((r) => ({
        key: r.key, t: r.t, tag: r.tag, timeIndex: r.timeIndex,
        depth: r.depth, scale: r.scale, isFork: r.isFork, visible: r._visible,
      })),
      getAnchor: () => ({ t: anchorT, tag: anchorTag }),
      treeStats: () => ({
        nodes: rooms.length,
        edges: treeEdges.length,
        forks: rooms.filter((r) => r.isFork).length,
        lines: new Set(rooms.map((r) => r.tag)).size,
      }),
      getSignalPhase: () => signal.phase,
      easeAnglesTo: (t, d) => api.easeAnglesTo(t, d),
      drawCalls: () => renderer.info.render.calls,
      geometries: () => renderer.info.memory.geometries,
    },
    dispose() {
      running = false;
      window.removeEventListener('resize', resize);
      audio.dispose();
      renderer.dispose();
    },
  };
  return api;
}
