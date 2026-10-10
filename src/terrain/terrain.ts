/**
 * Terreno en el hilo principal: crea mallas y texturas a partir del resultado del
 * worker y gestiona el LOD por bloque (histéresis + geomorphing + presupuesto de
 * triángulos). Las geometrías y texturas se crean una vez; cambiar de nivel solo
 * intercambia la geometría del bloque. Activar rutas o capas nunca regenera nada.
 *
 * Quadtree de dos niveles en el núcleo y el contexto: cuando los cuatro bloques de un
 * grupo 2×2 están en el mismo nivel ≥ 1, se sustituyen por su padre (un draw call en
 * vez de cuatro). El intercambio es exacto: el nivel p del padre tiene los mismos
 * vértices que el nivel p + 1 de los hijos. Si algún hijo necesita la resolución
 * completa, el padre se afina hasta su nivel 0 y se vuelve a dividir.
 */
import * as THREE from 'three';
import type { BuildResult } from './protocol.ts';
import type { ChunkData } from './build.ts';
import type { Manifest, RingName } from '../data/types.ts';
import { createTerrainMaterial, type ChunkUniforms, type RingUniforms, type SharedTerrainUniforms } from './material.ts';
import { distanceToBox, projectionFactor, selectLevel } from './lod.ts';
import { makeDetailTexture } from './noise.ts';

const MORPH_MS = 320;

interface ChunkRuntime {
  data: ChunkData;
  mesh: THREE.Mesh;
  geoms: THREE.BufferGeometry[];
  errors: number[];
  level: number;
  uniforms: ChunkUniforms;
  box: THREE.Box3;
  /** transición de forma en curso */
  morph: { dir: 1 | -1; t0: number } | null;
  inFrustum: boolean;
  /** resultado del último recorte por caja (visibilidad del pase principal) */
  culledVisible: boolean;
  dist: number;
  /** grupo 2×2 al que pertenece el bloque (null en el horizonte) */
  group: GroupRuntime | null;
  /** posición en la lista de bloques (o de grupos, para un padre) */
  idx: number;
  /** 0 en bloques; 1 en padres (su nivel p equivale al p + 1 de un bloque) */
  levelOffset: number;
}

interface GroupRuntime {
  parent: ChunkRuntime;
  children: ChunkRuntime[];
  /** true: se dibuja el padre y los cuatro hijos quedan ocultos */
  merged: boolean;
}

export interface TerrainStats {
  trianglesEstimate: number;
  /** mallas de terreno dentro del encuadre (bloques + padres): ≈ draw calls del terreno */
  visibleChunks: number;
  /** bloques en el encuadre por nivel equivalente (0 fino → 3 grueso) */
  levels: number[];
  /** grupos 2×2 dibujados como un solo padre */
  merged: number;
  tauUsed: number;
}

export class Terrain {
  readonly group = new THREE.Group();
  readonly shared: SharedTerrainUniforms;
  private readonly chunks: ChunkRuntime[] = [];
  private readonly groups: GroupRuntime[] = [];
  private readonly textures: THREE.Texture[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly frustum = new THREE.Frustum();
  private readonly projView = new THREE.Matrix4();
  private lastStats: TerrainStats = { trianglesEstimate: 0, visibleChunks: 0, levels: [0, 0, 0, 0], merged: 0, tauUsed: 0 };
  /**
   * Proyectores de sombra estáticos: una copia fija del relieve (núcleo y horizonte a
   * resolución completa, contexto a paso 2) que solo se dibuja en el pase de sombras. Así
   * el mapa de sombras no depende del LOD visible y no hay que rehacerlo al moverse: solo
   * cuando cambia la luz. (Antes se rehacía cada ~260 ms en movimiento: tirones periódicos.)
   */
  private readonly casters: THREE.Mesh[] = [];
  private readonly casterMaterial = new THREE.MeshBasicMaterial({ colorWrite: false });
  /** búferes reutilizados por update(): sin asignaciones por fotograma (sin pausas del GC) */
  private desiredBuf = new Int8Array(0);
  private parentBuf = new Int8Array(0);

  constructor(result: BuildResult, manifest: Manifest, albedo: Record<RingName, ImageBitmap>, anisotropy: number) {
    this.group.name = 'terreno';
    const detail = new THREE.DataTexture(makeDetailTexture(256, 2008), 256, 256, THREE.RGBAFormat);
    detail.wrapS = detail.wrapT = THREE.RepeatWrapping;
    detail.generateMipmaps = true;
    detail.minFilter = THREE.LinearMipmapLinearFilter;
    detail.magFilter = THREE.LinearFilter;
    detail.anisotropy = anisotropy;
    detail.needsUpdate = true;
    this.textures.push(detail);
    this.shared = {
      uDetail: { value: detail },
      uDetailLevel: { value: 2 },
      uH0: { value: manifest.sistema.h0 },
      uDeathY: { value: 8000 - manifest.sistema.h0 },
      uDeathOn: { value: 0 },
      uDeathTint: { value: 0.36 },
      uDemOn: { value: 0 },
      uShowLod: { value: 0 },
    };
    const dummy = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
    dummy.needsUpdate = true;
    this.textures.push(dummy);

    const dataTex = (data: Uint8Array, w: number, h: number, mip: boolean) => {
      const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      t.magFilter = THREE.LinearFilter;
      t.minFilter = mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
      t.generateMipmaps = mip;
      t.anisotropy = mip ? anisotropy : 1;
      t.needsUpdate = true;
      this.textures.push(t);
      return t;
    };

    for (const ring of result.rings) {
      const name = ring.ring;
      const spec = manifest.rejillas[name];
      const alb = new THREE.Texture(albedo[name]);
      alb.colorSpace = THREE.SRGBColorSpace;
      alb.flipY = false;
      alb.wrapS = alb.wrapT = THREE.ClampToEdgeWrapping;
      alb.minFilter = THREE.LinearMipmapLinearFilter;
      alb.generateMipmaps = true;
      alb.anisotropy = anisotropy;
      alb.needsUpdate = true;
      this.textures.push(alb);
      const m = result.masks[name];
      const nrm = result.normals[name];
      const ringU: RingUniforms = {
        uAlbedo: { value: alb },
        uMasks: { value: dataTex(m.data, m.width, m.height, true) },
        uNormalTex: { value: dataTex(nrm.data, nrm.size, nrm.size, true) },
        uAux: { value: name === 'core' ? dataTex(result.aux.data, result.aux.size, result.aux.size, false) : dummy },
        uHasAux: { value: name === 'core' ? 1 : 0 },
        uHalf: { value: spec.semilado },
        uGridN: { value: spec.muestras },
      };
      const makeChunk = (c: ChunkData, indexAttrs: THREE.BufferAttribute[], levelOffset: number, label: string): ChunkRuntime => {
        const box = new THREE.Box3(new THREE.Vector3(...c.min), new THREE.Vector3(...c.max));
        const sphere = box.getBoundingSphere(new THREE.Sphere());
        const geoms = c.levels.map((lv, l) => {
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.BufferAttribute(lv.positions, 3));
          g.setAttribute('aMorph', new THREE.BufferAttribute(lv.morph, 1));
          g.setIndex(indexAttrs[l]);
          g.boundingBox = box.clone();
          g.boundingSphere = sphere.clone();
          return g;
        });
        const level = geoms.length - 1;
        const uniforms: ChunkUniforms = { uMorph: { value: 0 }, uLodLevel: { value: 0 } };
        const mat = createTerrainMaterial(this.shared, ringU, uniforms);
        this.materials.push(mat);
        const mesh = new THREE.Mesh(geoms[level], mat);
        mesh.name = `${name}-${label}${c.ci}-${c.cj}`;
        mesh.castShadow = false; // las sombras las proyecta la copia estática (casters)
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        this.group.add(mesh);
        const rt: ChunkRuntime = {
          data: c, mesh, geoms, errors: c.levels.map((l) => l.error), level, uniforms, box,
          morph: null, inFrustum: true, culledVisible: true, dist: 0, group: null, levelOffset, idx: 0,
        };
        this.setLevel(rt, level);
        return rt;
      };
      // los índices de un nivel se comparten entre todos los bloques del anillo
      const indexAttrs = ring.indices.map((ix) => new THREE.BufferAttribute(ix, 1));
      const ringChunks = ring.chunks.map((c) => makeChunk(c, indexAttrs, 0, ''));
      for (const rc of ringChunks) rc.idx = this.chunks.push(rc) - 1;
      const casterLevel = name === 'context' ? 1 : 0;
      for (const rc of ringChunks) {
        const cm = new THREE.Mesh(rc.geoms[Math.min(casterLevel, rc.geoms.length - 1)], this.casterMaterial);
        cm.name = `${rc.mesh.name}-sombra`;
        cm.castShadow = true;
        cm.receiveShadow = false;
        cm.visible = false;
        cm.matrixAutoUpdate = false;
        cm.updateMatrix();
        this.casters.push(cm);
        this.group.add(cm);
      }
      if (ring.parents) {
        const pIdx = ring.parents.indices.map((ix) => new THREE.BufferAttribute(ix, 1));
        for (const pc of ring.parents.chunks) {
          const parent = makeChunk(pc, pIdx, 1, 'p');
          const children = ringChunks.filter((c) => Math.floor(c.data.ci / 2) === pc.ci && Math.floor(c.data.cj / 2) === pc.cj);
          if (children.length !== 4) throw new Error(`${name}: el padre ${pc.ci},${pc.cj} tiene ${children.length} hijos`);
          const g: GroupRuntime = { parent, children, merged: false };
          for (const c of children) c.group = g;
          parent.mesh.visible = false;
          parent.idx = this.groups.push(g) - 1;
        }
      }
    }
  }

  get stats(): TerrainStats {
    return this.lastStats;
  }

  setDetailLevel(level: number): void {
    this.shared.uDetailLevel.value = level;
  }

  setAnisotropy(a: number): void {
    for (const t of this.textures) {
      if (t.anisotropy > 1 && t.anisotropy !== a) {
        t.anisotropy = a;
        t.needsUpdate = true;
      }
    }
  }

  /**
   * Actualiza niveles de detalle. Devuelve true si hay transiciones en curso (hay
   * que seguir renderizando).
   */
  update(camera: THREE.PerspectiveCamera, viewportHeightCss: number, now: number, tau: number, triangleBudget: number, animate: boolean): boolean {
    const k = projectionFactor(viewportHeightCss, camera.fov);
    camera.updateMatrixWorld();
    this.projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projView);
    const p = camera.position;
    const measure = (c: ChunkRuntime) => {
      const b = c.box;
      c.dist = distanceToBox(p.x, p.y, p.z, b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z);
      c.inFrustum = this.frustum.intersectsBox(b);
    };
    for (const c of this.chunks) measure(c);
    for (const g of this.groups) measure(g.parent);

    // Selección con presupuesto: si se excede, se relaja τ (se engrosa) antes de tocar la silueta.
    if (this.desiredBuf.length !== this.chunks.length) this.desiredBuf = new Int8Array(this.chunks.length);
    if (this.parentBuf.length !== this.groups.length) this.parentBuf = new Int8Array(this.groups.length);
    const desired = this.desiredBuf;
    const parentDesired = this.parentBuf;
    let t = tau;
    let tris = 0;
    for (let iter = 0; iter < 8; iter++) {
      for (let i = 0; i < this.chunks.length; i++) {
        const c = this.chunks[i];
        desired[i] = c.inFrustum ? selectLevel(c.errors, c.dist, k, t, c.level) : c.geoms.length - 1;
      }
      for (let gi = 0; gi < this.groups.length; gi++) {
        // misma regla que parentTarget(), sin crear arrays
        const g = this.groups[gi];
        let min = 99;
        for (const c of g.children) if (c.inFrustum && desired[c.idx] < min) min = desired[c.idx];
        const last = g.parent.geoms.length - 1;
        parentDesired[gi] = min === 99 ? last : min >= 1 ? Math.min(last, min - 1) : -1;
      }
      tris = 0;
      for (let i = 0; i < this.chunks.length; i++) {
        const c = this.chunks[i];
        if (c.inFrustum && !(c.group && parentDesired[c.group.parent.idx] >= 0)) tris += c.data.levels[desired[i]].triangles;
      }
      for (let gi = 0; gi < this.groups.length; gi++) {
        if (parentDesired[gi] >= 0 && this.groups[gi].parent.inFrustum) tris += this.groups[gi].parent.data.levels[parentDesired[gi]].triangles;
      }
      if (tris <= triangleBudget) break;
      t *= 1.35;
    }

    let animating = false;
    // grupos 2×2: hijos por separado, convergencia y fusión, o padre
    this.groups.forEach((g, gi) => {
      const pd = parentDesired[gi];
      const par = g.parent;
      if (g.merged) {
        if (pd >= 0) animating = this.stepChunk(par, pd, now, animate) || animating;
        else {
          // un hijo necesita la resolución completa: el padre se afina hasta su nivel 0 y se divide
          if (par.level > 0 || par.morph) animating = this.stepChunk(par, 0, now, animate) || animating;
          if (par.level === 0 && !par.morph) {
            this.split(g);
            animating = true;
          }
        }
        // los hijos ocultos siguen el nivel equivalente (para la histéresis al dividirse)
        if (g.merged) for (const c of g.children) c.level = Math.min(c.geoms.length - 1, par.level + 1);
      } else if (pd >= 0) {
        // los cuatro hijos convergen al nivel más fino que necesita el grupo; entonces se fusionan
        const target = Math.min(pd + 1, g.children[0].geoms.length - 1);
        if (g.children.every((c) => !c.morph && c.level === target)) {
          this.merge(g, target - 1);
          animating = true;
        } else for (const c of g.children) animating = this.stepChunk(c, target, now, animate) || animating;
      } else {
        for (const c of g.children) animating = this.stepChunk(c, desired[c.idx], now, animate) || animating;
      }
    });
    this.chunks.forEach((c, i) => {
      if (!c.group) animating = this.stepChunk(c, desired[i], now, animate) || animating;
    });

    const levels = [0, 0, 0, 0];
    let visible = 0;
    let merged = 0;
    for (const c of this.chunks) {
      if (!c.inFrustum) continue;
      levels[Math.min(3, c.level)]++;
      if (!c.group?.merged) visible++;
    }
    for (const g of this.groups)
      if (g.merged && g.parent.inFrustum) {
        visible++;
        merged++;
      }
    this.lastStats = { trianglesEstimate: tris, visibleChunks: visible, levels, merged, tauUsed: t };
    return animating;
  }

  /**
   * Avanza un bloque (o un padre) hacia el nivel deseado, un nivel cada vez y con
   * geomorphing si se anima. Devuelve true si debe seguir renderizándose.
   */
  private stepChunk(c: ChunkRuntime, desired: number, now: number, animate: boolean): boolean {
    let animating = false;
    if (c.morph) {
      const f = Math.min(1, (now - c.morph.t0) / MORPH_MS);
      c.uniforms.uMorph.value = c.morph.dir === -1 ? 1 - f : f; // −1: de grueso a fino; 1: de fino a grueso
        if (f >= 1) {
        if (c.morph.dir === 1) this.setLevel(c, c.level + 1);
        c.uniforms.uMorph.value = 0;
        c.morph = null;
        // quedan niveles por recorrer: el bucle de render no debe detenerse aquí
        if (desired !== c.level) animating = true;
      } else animating = true;
    } else if (!c.inFrustum && desired !== c.level) {
      // fuera de la vista: cambio directo, sin transición
      this.setLevel(c, desired);
    } else if (desired !== c.level) {
      if (desired < c.level) {
        this.setLevel(c, c.level - 1);
        if (animate && c.inFrustum) {
          c.uniforms.uMorph.value = 1;
          c.morph = { dir: -1, t0: now };
        }
      } else if (animate && c.inFrustum) {
        c.morph = { dir: 1, t0: now };
      } else {
        this.setLevel(c, c.level + 1);
      }
      animating = true;
    }
    return animating;
  }

  /** Sustituye los cuatro hijos (todos en el nivel level + 1, sin transición) por el padre. */
  private merge(g: GroupRuntime, level: number): void {
    g.merged = true;
    g.parent.morph = null;
    g.parent.uniforms.uMorph.value = 0;
    this.setLevel(g.parent, level);
    this.applyVisibility(false);
  }

  /** Vuelve a dibujar los hijos en el nivel equivalente al nivel 0 del padre. */
  private split(g: GroupRuntime): void {
    g.merged = false;
    for (const c of g.children) {
      c.morph = null;
      c.uniforms.uMorph.value = 0;
      this.setLevel(c, g.parent.level + 1);
    }
    this.applyVisibility(false);
  }

  /**
   * Recorte por caja contra el frustum, más ajustado que la esfera envolvente que usa
   * three.js (los bloques son anchos y de poco espesor relativo). Se aplica justo antes
   * de renderizar, con el plano cercano ya definitivo. El pase de sombras ve todos los
   * bloques (setShadowPass) para no perder sombras proyectadas desde fuera del encuadre.
   */
  cull(camera: THREE.PerspectiveCamera): void {
    camera.updateMatrixWorld();
    this.projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projView);
    for (const c of this.chunks) c.culledVisible = this.frustum.intersectsBox(c.box);
    for (const g of this.groups) g.parent.culledVisible = this.frustum.intersectsBox(g.parent.box);
    this.applyVisibility(false);
  }

  /** true: solo la copia estática de proyectores (pase de sombras); false: se restaura el recorte. */
  setShadowPass(on: boolean): void {
    if (on) {
      for (const c of this.chunks) c.mesh.visible = false;
      for (const g of this.groups) g.parent.mesh.visible = false;
    } else this.applyVisibility(false);
    for (const m of this.casters) m.visible = on;
  }

  /** Todas las geometrías (cada nivel de LOD, padres y proyectores) para precargarlas en la GPU. */
  allGeometries(): THREE.BufferGeometry[] {
    const set = new Set<THREE.BufferGeometry>();
    for (const c of this.chunks) for (const g of c.geoms) set.add(g);
    for (const gr of this.groups) for (const g of gr.parent.geoms) set.add(g);
    return [...set];
  }

  /** Texturas del terreno (para subirlas a la GPU durante la carga). */
  allTextures(): THREE.Texture[] {
    return [...this.textures];
  }

  private applyVisibility(all: boolean): void {
    for (const c of this.chunks) c.mesh.visible = !c.group?.merged && (all || c.culledVisible);
    for (const g of this.groups) g.parent.mesh.visible = g.merged && (all || g.parent.culledVisible);
  }

  /** Número total de geometrías de terreno creadas (todas las de LOD, subidas o no a la GPU). */
  get geometryCount(): number {
    let n = 0;
    for (const c of this.chunks) n += c.geoms.length;
    for (const g of this.groups) n += g.parent.geoms.length;
    return n;
  }

  private setLevel(c: ChunkRuntime, level: number): void {
    c.level = Math.max(0, Math.min(c.geoms.length - 1, level));
    c.mesh.geometry = c.geoms[c.level];
    // nivel equivalente de bloque para el tinte de depuración (+10: padre fusionado)
    c.uniforms.uLodLevel.value = Math.min(3, c.level + c.levelOffset) + (c.levelOffset ? 10 : 0);
  }

  /** Fuerza el nivel más fino alcanzable al instante (p. ej. antes de una captura). */
  settle(camera: THREE.PerspectiveCamera, viewportHeightCss: number, tau: number, budget: number): void {
    const all = [...this.chunks, ...this.groups.map((g) => g.parent)];
    for (let i = 0; i < 12; i++) {
      this.update(camera, viewportHeightCss, performance.now(), tau, budget, false);
      for (const c of all) {
        if (c.morph) {
          if (c.morph.dir === 1) this.setLevel(c, c.level + 1);
          c.morph = null;
          c.uniforms.uMorph.value = 0;
        }
      }
    }
  }

  /** Opacidad del tinte de área según la distancia de observación (m). */
  setDeathTintForDistance(d: number): void {
    const t = Math.min(1, Math.max(0, (d - 1500) / 6500));
    this.shared.uDeathTint.value = 0.14 + 0.22 * t;
  }

  setDeathZone(v: number): void {
    this.shared.uDeathOn.value = v;
  }

  setDemOverlay(v: number): void {
    this.shared.uDemOn.value = v;
  }

  setLodDebug(on: boolean): void {
    this.shared.uShowLod.value = on ? 1 : 0;
  }

  textureBytesEstimate(): number {
    let bytes = 0;
    for (const t of this.textures) {
      const img = t.image as { width?: number; height?: number } | undefined;
      const w = img?.width ?? 0;
      const h = img?.height ?? 0;
      bytes += w * h * 4 * (t.generateMipmaps ? 4 / 3 : 1);
    }
    return bytes;
  }

  dispose(): void {
    for (const c of this.chunks) for (const g of c.geoms) g.dispose();
    for (const gr of this.groups) for (const g of gr.parent.geoms) g.dispose();
    for (const m of this.materials) m.dispose();
    this.casterMaterial.dispose();
    for (const t of this.textures) t.dispose();
    this.group.clear();
  }
}
