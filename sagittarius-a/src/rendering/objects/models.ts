/**
 * Modelos 3D de los diez objetos, a escala real (metros). Geometría procedimental y determinista
 * (semilla fija): sin recursos externos.
 */
import * as THREE from 'three';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';
import type { ObjectKind } from '../../simulation/types';
import { mulberry32 } from '../../physics/random';

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function std(color: string, metalness: number, roughness: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra });
}

/** Ruido 3D suave (suma de senos con fases aleatorias) para deformar asteroides y cometas. */
function lumpy(seed: number, octaves = 5): (x: number, y: number, z: number) => number {
  const rng = mulberry32(seed);
  const waves = Array.from({ length: octaves * 6 }, (_, i) => {
    const o = Math.floor(i / 6);
    const f = 1.2 * Math.pow(2.03, o);
    const d = [rng() - 0.5, rng() - 0.5, rng() - 0.5];
    const n = Math.hypot(...d);
    return { k: d.map((q) => (q / n) * f), ph: rng() * Math.PI * 2, a: Math.pow(0.5, o) };
  });
  return (x, y, z) => {
    let s = 0;
    for (const w of waves) s += w.a * Math.sin(w.k[0] * x + w.k[1] * y + w.k[2] * z + w.ph);
    return s / 2.2;
  };
}

function rock(radius: number, scale: [number, number, number], seed: number, detail: number, color: string, rough = 0.95): THREE.Mesh {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const n = lumpy(seed);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)).normalize();
    const h = 1 + 0.28 * n(v.x * 1.7, v.y * 1.7, v.z * 1.7) + 0.06 * n(v.x * 9, v.y * 9, v.z * 9);
    p.setXYZ(i, v.x * h * radius * scale[0], v.y * h * radius * scale[1], v.z * h * radius * scale[2]);
  }
  g.computeVertexNormals();
  return new THREE.Mesh(g, std(color, 0, rough, { flatShading: false }));
}

export interface ObjectModel {
  group: THREE.Group;
  /** Tamaño característico (m) para encuadrar la cámara. */
  size: number;
  /** Partes que se actualizan dinámicamente (pantalla del reloj, agua…). tidal: E_ij del marco del cuerpo [s⁻²] (xx, xy, xz, yy, yz, zz). */
  update?: (info: { tau: number; t: number; tidal?: number[] }) => void;
  dispose: () => void;
}

export function buildModel(kind: ObjectKind): ObjectModel {
  const group = new THREE.Group();
  let size = 1;
  let update: ObjectModel['update'];
  switch (kind) {
    case 'esfera': {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.5, 96, 64), std('#c9d0d8', 1, 0.18));
      group.add(m);
      size = 1;
      break;
    }
    case 'reloj': {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.4), std('#8d969f', 0.85, 0.35));
      group.add(body);
      let screenCanvas: HTMLCanvasElement | null = null;
      const tex = canvasTexture(512, 160, (g) => {
        screenCanvas = g.canvas;
        g.fillStyle = '#050807';
        g.fillRect(0, 0, 512, 160);
      });
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.13), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
      screen.position.set(0, 0.02, 0.2005);
      group.add(screen);
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 8), new THREE.MeshBasicMaterial({ color: '#59ffb0' }));
      led.position.set(0.25, -0.1, 0.2);
      group.add(led);
      for (const sx of [-1, 1]) {
        const handle = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.008, 8, 24, Math.PI), std('#b8bfc6', 1, 0.3));
        handle.position.set(sx * 0.3, 0.05, 0);
        handle.rotation.set(0, Math.PI / 2, Math.PI / 2);
        group.add(handle);
      }
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.22), std('#d0d4d8', 1, 0.3));
      ant.position.set(-0.22, 0.26, -0.12);
      group.add(ant);
      let lastShown = '';
      update = ({ tau }) => {
        const txt = `τ ${tau.toFixed(1).padStart(9)} s`;
        if (txt === lastShown || !screenCanvas) return;
        lastShown = txt;
        const g = (screenCanvas as HTMLCanvasElement).getContext('2d')!;
        g.fillStyle = '#050807';
        g.fillRect(0, 0, 512, 160);
        g.fillStyle = '#59ffb0';
        g.font = '600 68px "JetBrains Mono", monospace';
        g.textBaseline = 'middle';
        g.fillText(txt, 18, 82);
        tex.needsUpdate = true;
        (led.material as THREE.MeshBasicMaterial).color.set(Math.floor(tau / 39.4) % 2 === 0 ? '#59ffb0' : '#0c3324');
      };
      update({ tau: 0, t: 0 });
      size = 0.8;
      break;
    }
    case 'sonda': {
      const foil = canvasTexture(256, 256, (g) => {
        const rng = mulberry32(5);
        g.fillStyle = '#b8862e';
        g.fillRect(0, 0, 256, 256);
        for (let i = 0; i < 400; i++) {
          g.strokeStyle = `rgba(${200 + rng() * 55},${150 + rng() * 60},${60 + rng() * 40},0.35)`;
          g.beginPath();
          g.moveTo(rng() * 256, rng() * 256);
          g.lineTo(rng() * 256, rng() * 256);
          g.stroke();
        }
      });
      const bus = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), std('#ffffff', 0.9, 0.35, { map: foil }));
      group.add(bus);
      const cells = canvasTexture(512, 256, (g) => {
        g.fillStyle = '#0d1b3a';
        g.fillRect(0, 0, 512, 256);
        g.strokeStyle = '#3c5a9a';
        g.lineWidth = 2;
        for (let x = 0; x <= 512; x += 32) {
          g.beginPath();
          g.moveTo(x, 0);
          g.lineTo(x, 256);
          g.stroke();
        }
        for (let y = 0; y <= 256; y += 32) {
          g.beginPath();
          g.moveTo(0, y);
          g.lineTo(512, y);
          g.stroke();
        }
      });
      for (const sx of [-1, 1]) {
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9), std('#cfd4da', 1, 0.3));
        arm.rotation.z = Math.PI / 2;
        arm.position.x = sx * 1.45;
        group.add(arm);
        const panel = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.04, 1.9), std('#ffffff', 0.4, 0.45, { map: cells }));
        panel.position.x = sx * 4.0;
        group.add(panel);
      }
      const dishGeo = new THREE.SphereGeometry(1.25, 48, 16, 0, Math.PI * 2, 0, 0.62);
      const dish = new THREE.Mesh(dishGeo, std('#eef0f2', 0.2, 0.55, { side: THREE.DoubleSide }));
      dish.rotation.x = Math.PI;
      dish.position.y = 2.15;
      group.add(dish);
      const feed = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9), std('#cfd4da', 1, 0.3));
      feed.position.y = 1.7;
      group.add(feed);
      const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 3.2), std('#9ea6ae', 1, 0.4));
      boom.rotation.x = Math.PI / 2;
      boom.position.set(0.6, -0.6, 2.4);
      group.add(boom);
      size = 12;
      break;
    }
    case 'capsula': {
      const pts: THREE.Vector2[] = [];
      pts.push(new THREE.Vector2(0, -2.2), new THREE.Vector2(1.95, -2.2), new THREE.Vector2(2.0, -2.05), new THREE.Vector2(0.75, 1.45), new THREE.Vector2(0.55, 1.55), new THREE.Vector2(0, 1.6));
      const cm = new THREE.Mesh(new THREE.LatheGeometry(pts, 64), std('#e7e3da', 0.25, 0.5));
      group.add(cm);
      const shield = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.0, 0.25, 64), std('#3a2b20', 0.1, 0.85));
      shield.position.y = -2.32;
      group.add(shield);
      const sm = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 5.2, 64), std('#c8ccd2', 0.7, 0.35));
      sm.position.y = -5.05;
      group.add(sm);
      const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 1.1, 1.4, 48, 1, true), std('#5d6066', 1, 0.3, { side: THREE.DoubleSide }));
      nozzle.position.y = -8.3;
      group.add(nozzle);
      for (let k = 0; k < 2; k++) {
        const win = new THREE.Mesh(new THREE.CircleGeometry(0.22, 24), new THREE.MeshStandardMaterial({ color: '#0b1220', metalness: 0.9, roughness: 0.05 }));
        const ang = -0.35 + k * 0.7;
        win.position.set(Math.sin(ang) * 1.35, 0.1, Math.cos(ang) * 1.35);
        win.lookAt(win.position.clone().multiplyScalar(2).setY(0.6));
        group.add(win);
      }
      // Figura humana de referencia (1,8 m) junto a la escotilla
      const human = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.35, 6, 12), std('#e3a54a', 0, 0.6));
      human.position.set(2.7, -1.2, 0);
      group.add(human);
      group.rotation.z = Math.PI / 2;
      const wrap = new THREE.Group();
      wrap.add(group);
      return finish(wrap, 11, undefined);
    }
    case 'asteroide': {
      group.add(rock(500, [1.2, 0.9, 0.8], 11, 6, '#7d6b5a'));
      size = 1300;
      break;
    }
    case 'cometa': {
      const a = rock(1500, [1.1, 0.95, 0.9], 21, 6, '#3b3836', 1);
      a.position.x = -900;
      const b = rock(1100, [1, 0.9, 1], 22, 6, '#3b3836', 1);
      b.position.x = 1200;
      group.add(a, b);
      // Chorros de sublimación (ilustrativos)
      const jetMat = new THREE.MeshBasicMaterial({ color: '#cfe8ff', transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
      for (const [x, y, z, rx] of [
        [-600, 1300, 300, 0.2],
        [1400, 900, -200, -0.3],
      ]) {
        const jet = new THREE.Mesh(new THREE.ConeGeometry(500, 3800, 24, 1, true), jetMat);
        jet.position.set(x, y + 1700, z);
        jet.rotation.x = rx;
        group.add(jet);
      }
      const coma = new THREE.Mesh(new THREE.SphereGeometry(6500, 32, 16), new THREE.MeshBasicMaterial({ color: '#9ec9ff', transparent: true, opacity: 0.05, depthWrite: false, blending: THREE.AdditiveBlending }));
      group.add(coma);
      size = 6000;
      break;
    }
    case 'agua': {
      const tank = new THREE.Mesh(
        new THREE.CylinderGeometry(0.6, 0.6, 2, 64, 1, true),
        new THREE.MeshPhysicalMaterial({ color: '#c7d3dc', metalness: 0.3, roughness: 0.15, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }),
      );
      group.add(tank);
      for (const y of [-1, 1]) {
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.05, 64), std('#9aa6b0', 1, 0.3));
        cap.position.y = y;
        group.add(cap);
      }
      for (let k = 0; k < 4; k++) {
        const rib = new THREE.Mesh(new THREE.TorusGeometry(0.605, 0.012, 8, 64), std('#9aa6b0', 1, 0.3));
        rib.rotation.x = Math.PI / 2;
        rib.position.y = -0.6 + k * 0.4;
        group.add(rib);
      }
      group.rotation.z = Math.PI / 2;
      const wrap = new THREE.Group();
      wrap.add(group);
      // Agua (80 % del volumen) con forma de equilibrio: ver tankWater()
      const water = tankWater();
      wrap.add(water.mesh);
      return finish(wrap, 2.4, ({ tidal }) => water.update(tidal));
    }
    case 'cubo': {
      const n = 5;
      const L = 20;
      const step = L / (n - 1);
      const bars: Array<[THREE.Vector3, THREE.Vector3]> = [];
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++)
          for (let k = 0; k < n; k++) {
            const p = new THREE.Vector3(i * step - L / 2, j * step - L / 2, k * step - L / 2);
            if (i < n - 1) bars.push([p, p.clone().add(new THREE.Vector3(step, 0, 0))]);
            if (j < n - 1) bars.push([p, p.clone().add(new THREE.Vector3(0, step, 0))]);
            if (k < n - 1) bars.push([p, p.clone().add(new THREE.Vector3(0, 0, step))]);
          }
      const geo = new THREE.CylinderGeometry(0.05, 0.05, 1, 8);
      const inst = new THREE.InstancedMesh(geo, std('#c3cad6', 0.85, 0.35), bars.length);
      inst.name = 'barras';
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      bars.forEach(([a, b], i) => {
        const mid = a.clone().add(b).multiplyScalar(0.5);
        const dir = b.clone().sub(a);
        q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
        m.compose(mid, q, new THREE.Vector3(1, dir.length(), 1));
        inst.setMatrixAt(i, m);
        inst.setColorAt(i, new THREE.Color('#c3cad6'));
      });
      inst.userData.bars = bars;
      group.add(inst);
      const nodes = new THREE.InstancedMesh(new THREE.SphereGeometry(0.14, 12, 8), std('#e3e7ec', 0.9, 0.3), n * n * n);
      let c = 0;
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++)
          for (let k = 0; k < n; k++) nodes.setMatrixAt(c++, new THREE.Matrix4().makeTranslation(i * step - L / 2, j * step - L / 2, k * step - L / 2));
      nodes.name = 'nudos';
      group.add(nodes);
      size = 30;
      break;
    }
    case 'nube': {
      const rng = mulberry32(9);
      const N = 600;
      const pos = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        let x: number, y: number, z: number;
        do {
          x = 2 * rng() - 1;
          y = 2 * rng() - 1;
          z = 2 * rng() - 1;
        } while (x * x + y * y + z * z > 1);
        pos.set([x, y, z], 3 * i);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      group.add(new THREE.Points(g, new THREE.PointsMaterial({ color: '#f0c9ff', size: 0.045, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending })));
      size = 2.4;
      break;
    }
    case 'fotones': {
      const mat = new THREE.MeshBasicMaterial({ color: '#ffe27a' });
      for (let k = -3; k <= 3; k++) {
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 2.4, 8), mat);
        beam.rotation.z = Math.PI / 2;
        beam.position.y = k * 0.16;
        group.add(beam);
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 12), mat);
        tip.rotation.z = -Math.PI / 2;
        tip.position.set(1.27, k * 0.16, 0);
        group.add(tip);
      }
      size = 2.8;
      break;
    }
  }
  return finish(group, size, update);
}

function finish(group: THREE.Group, size: number, update: ObjectModel['update']): ObjectModel {
  return {
    group,
    size,
    update,
    dispose: () =>
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      }),
  };
}

/**
 * Agua del contenedor en equilibrio cuasiestático (forma ILUSTRATIVA de un cálculo físico simple).
 *
 * En caída libre la única fuerza sobre el agua es la marea: aceleración a = −E ξ, potencial
 * Φ(ξ) = ½ ξᵀ E ξ. Con la tensión superficial despreciable, la superficie libre es una
 * equipotencial Φ = Φ₀ y el agua ocupa la región Φ < Φ₀ (dos lóbulos hacia los extremos en la
 * dirección de estiramiento), con Φ₀ fijado por el volumen (80 % del depósito).
 * La tensión superficial domina cuando el número de Bond Bo = ρ λ L³/σ < 1 (λ < 7·10⁻⁵ s⁻²,
 * r ≳ 4 r_g en Sgr A*): entonces el agua moja las paredes y el gas queda en una burbuja central.
 * Entre ambos regímenes se interpola suavemente con Bo. La superficie se extrae con
 * «marching cubes» sobre el campo de nivel.
 */
function tankWater(): { mesh: THREE.Mesh; update: (tidal?: number[]) => void } {
  const N = 36;
  const S = 1.14; // semilado del cubo de muestreo [m]
  const R = 0.585; // radio interior
  const H = 0.975; // semilongitud interior (eje x del cuerpo)
  const FILL = 0.8;
  const RHO = 1000;
  const SIGMA = 0.072;
  const mat = new THREE.MeshPhysicalMaterial({ color: '#2a7fc4', roughness: 0.06, metalness: 0, transmission: 0.25, transparent: true, opacity: 0.82, side: THREE.DoubleSide });
  const mc = new MarchingCubes(N, mat, false, false, 60000);
  mc.isolation = 0;
  mc.scale.setScalar(S);
  const n3 = N * N * N;
  const wall = new Float32Array(n3);
  const px = new Float32Array(n3);
  const py = new Float32Array(n3);
  const pz = new Float32Array(n3);
  const inside: number[] = [];
  for (let z = 0; z < N; z++)
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const q = x + y * N + z * N * N;
        const fx = ((x - N / 2) / (N / 2)) * S;
        const fy = ((y - N / 2) / (N / 2)) * S;
        const fz = ((z - N / 2) / (N / 2)) * S;
        px[q] = fx;
        py[q] = fy;
        pz[q] = fz;
        wall[q] = Math.min(R - Math.hypot(fy, fz), H - Math.abs(fx));
        if (wall[q] > 0) inside.push(q);
      }
  const phi = new Float32Array(n3);
  const vals = new Float32Array(inside.length);
  let lastKey = '';
  const update = (tidal?: number[]) => {
    const E = tidal ?? [0, 0, 0, 0, 0, 0];
    // Escala de la marea y número de Bond (L = 1 m)
    const lam = Math.max(Math.abs(E[0]), Math.abs(E[3]), Math.abs(E[5]), 1e-30);
    const bond = (RHO * lam) / SIGMA;
    const w = Math.min(1, Math.max(0, (Math.log10(bond) + 0.3) / 0.6)); // 0 si Bo < 0,5; 1 si Bo > 2
    // Dirección del tensor (normalizada): la forma solo depende de ella, no de su magnitud
    const e = E.map((v) => v / lam);
    const key = `${e.map((v) => v.toFixed(2)).join(',')}|${w.toFixed(2)}`;
    if (key === lastKey) return;
    lastKey = key;
    for (const q of inside) {
      const X = px[q];
      const Y = py[q];
      const Z = pz[q];
      phi[q] = 0.5 * (e[0] * X * X + e[3] * Y * Y + e[5] * Z * Z) + e[1] * X * Y + e[2] * X * Z + e[4] * Y * Z;
    }
    // Nivel Φ₀ que deja el 80 % del volumen interior con Φ < Φ₀
    for (let i = 0; i < inside.length; i++) vals[i] = phi[inside[i]];
    vals.sort();
    const phi0 = vals[Math.min(vals.length - 1, Math.floor(FILL * vals.length))];
    const span = Math.max(1e-6, vals[vals.length - 1] - vals[0]);
    // Burbuja central de gas (régimen capilar): radio para el 20 % del volumen
    const rb = Math.cbrt((3 * (1 - FILL) * Math.PI * R * R * 2 * H) / (4 * Math.PI));
    const f = mc.field;
    for (let q = 0; q < n3; q++) {
      const dw = wall[q];
      if (dw <= 0) {
        f[q] = dw * 4;
        continue;
      }
      const tidalLevel = (phi0 - phi[q]) / span; // > 0 donde hay agua
      const capLevel = (Math.hypot(px[q], py[q], pz[q]) - rb) / (2 * H); // > 0 fuera de la burbuja
      f[q] = Math.min(4 * dw, w * tidalLevel + (1 - w) * capLevel);
    }
    mc.update();
  };
  update();
  return { mesh: mc, update };
}
