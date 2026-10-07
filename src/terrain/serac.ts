/**
 * Serac superior como malla 3D local independiente (no se altera el mapa de
 * alturas). Secciones transversales a lo largo de una línea base: frente de hielo
 * con ligero desplome hacia pendiente abajo y techo que se apoya en el relieve.
 * Geometría determinista (semilla) y explícitamente esquemática.
 */
import * as THREE from 'three';
import type { SeracFile } from '../data/types.ts';
import type { Frame } from '../geo/frame.ts';
import type { HeightGrid } from '../geo/heightfield.ts';

function rand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SeracBuild {
  mesh: THREE.Mesh;
  /** alturas máximas (altitud) por encima del DEM en su huella, para la holgura de cámara */
  footprint: { x: number; y: number; top: number }[];
}

export function buildSerac(data: SeracFile, frame: Frame, core: HeightGrid): SeracBuild {
  const rnd = rand(data.semilla);
  const pts = data.linea;
  const n = pts.length;
  // perfil de altura del frente con extremos que se funden con la ladera
  const heights = pts.map((_, k) => {
    const t = k / (n - 1);
    const taper = Math.sin(Math.PI * t) ** 0.6;
    const v = data.alturaFrente.min + (data.alturaFrente.max - data.alturaFrente.min) * (0.55 + 0.45 * rnd());
    return v * taper;
  });
  // suavizado ligero del perfil
  const hs = heights.map((h, k) => (heights[Math.max(0, k - 1)] + 2 * h + heights[Math.min(n - 1, k + 1)]) / 4);
  // sección: [desplazamiento pendiente arriba (m), altura sobre el terreno en ese punto (m)] normalizada por h
  const section: [number, number][] = [
    [0.0, -0.25], // empotrado bajo la superficie
    [-0.06, 0.35],
    [-0.12, 0.8], // desplome
    [-0.1, 1.0], // labio
    [0.25, 0.95],
    [0.9, 0.75],
    [2.0, 0.42],
    [3.2, 0.0], // techo que se funde con la ladera
  ];
  const cols = section.length;
  const positions: number[] = [];
  const colors: number[] = [];
  const footprint: SeracBuild['footprint'] = [];
  const faceCol = new THREE.Color('#a9cfe0');
  const deepCol = new THREE.Color('#7fb2cc');
  const topCol = new THREE.Color('#e9eff3');
  for (let k = 0; k < n; k++) {
    const [bx, by] = pts[k];
    const [ux, uy] = data.pendienteArriba[k];
    const h = Math.max(hs[k], 2);
    const depthScale = data.fondo / 3.2;
    for (let c = 0; c < cols; c++) {
      const [off, frac] = section[c];
      const d = off * (off < 0 ? data.vuelo / 0.12 : depthScale);
      const x = bx + ux * d;
      const y = by + uy * d;
      const ground = core.sample(x, y);
      const alt = ground + frac * h;
      positions.push(x, alt - frame.h0, -y);
      const col = c <= 2 ? deepCol.clone().lerp(faceCol, c / 2) : c === 3 ? faceCol : topCol;
      // vetas verticales en el frente (hielo azul y nieve incrustada), deterministas
      const streak = c <= 3 ? 0.86 + 0.22 * rnd() : 0.97 + 0.05 * rnd();
      colors.push(col.r * streak, col.g * streak, Math.min(1, col.b * (streak + 0.04)));
      if (frac > 0) footprint.push({ x, y, top: alt });
    }
  }
  const index: number[] = [];
  for (let k = 0; k < n - 1; k++)
    for (let c = 0; c < cols - 1; c++) {
      const a = k * cols + c;
      const b = a + cols;
      index.push(a, a + 1, b, b, a + 1, b + 1);
    }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geom.setIndex(index);
  geom.computeVertexNormals();
  // orientación: que las normales del frente miren pendiente abajo
  const nrm = geom.getAttribute('normal');
  const [ux0, uy0] = data.pendienteArriba[Math.floor(n / 2)];
  const mid = Math.floor(n / 2) * cols + 2;
  const flip = nrm.getX(mid) * ux0 + -nrm.getZ(mid) * uy0 > 0;
  if (flip) {
    for (let i = 0; i < index.length; i += 3) [index[i + 1], index[i + 2]] = [index[i + 2], index[i + 1]];
    geom.setIndex(index);
    geom.computeVertexNormals();
  }
  geom.computeBoundingSphere();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.name = 'serac';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return { mesh, footprint };
}
