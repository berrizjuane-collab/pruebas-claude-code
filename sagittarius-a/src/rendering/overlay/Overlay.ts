/**
 * Capa de DIAGRAMA (no es luz): elementos dibujados en coordenadas cartesianas de Kerr–Schild con
 * una proyección euclídea desde la posición coordenada de la cámara. Muestra «lo que ocurre en el
 * modelo» (trayectorias calculadas, posiciones en el instante t, superficies características,
 * conos de luz…), distinto de «lo que ve la cámara» (imagen trazada con geodésicas nulas).
 */
import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { KerrSchild } from '../../physics/metrics/kerrSchild';
import { ergosphereRadius, horizons, iscoRadius, photonOrbitRadius, delta } from '../../physics/metrics/kerr';
import { cartesianFromSpheroidal } from '../../physics/metrics/coordinates';
import type { OverlayToggles } from '../../app/store';
import type { Experiment, PhysicsClient } from '../../simulation/client';
import { SAMPLE_SIZE } from '../../simulation/types';
import { DT_SAMPLE } from '../../simulation/runner';
import type { Curve } from '../../simulation/geodesicFamilies';
import type { Pose } from '../../camera/CameraController';

export const DIAGRAM_COLORS = {
  photon: '#ffd27a',
  critical: '#d38cff',
  massive: '#6cc6d9',
  capture: '#f07a6a',
  horizon: '#c9ced6',
  ergo: '#9b7be0',
  isco: '#6cc6d9',
  photonOrbit: '#ffd27a',
  grid: '#7d8794',
  cone: '#9fd6b8',
  coneInside: '#f07a6a',
  embed: '#8aa0b8',
};

function lineMat(color: string, width: number, opacity = 1, dashed = false): LineMaterial {
  const m = new LineMaterial({ color: new THREE.Color(color).getHex(), linewidth: width, transparent: opacity < 1, opacity, dashed, dashSize: 0.6, gapSize: 0.45, worldUnits: false });
  m.depthWrite = false;
  return m;
}

function polyline(points: ArrayLike<number>, mat: LineMaterial): Line2 {
  const g = new LineGeometry();
  g.setPositions(Array.from(points));
  const l = new Line2(g, mat);
  l.computeLineDistances();
  l.frustumCulled = false;
  return l;
}

interface TrajObj {
  version: number;
  past: Line2 | null;
  future: Line2 | null;
  marker: THREE.Mesh;
  extra: THREE.Object3D;
  nPts: number;
  matPast: LineMaterial;
  matFuture: LineMaterial;
  beamLines: Line2[];
  beamLens: number[];
  beamHeads: THREE.Mesh[];
}

export class Overlay {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.01, 1e6);
  private a = -1;
  private toggles: OverlayToggles | null = null;
  private surfaces = new THREE.Group();
  private horizonG = new THREE.Group();
  private ergoG = new THREE.Group();
  private iscoG = new THREE.Group();
  private photonG = new THREE.Group();
  private gridG = new THREE.Group();
  private embedG = new THREE.Group();
  private conesG = new THREE.Group();
  private familiesG = new THREE.Group();
  private trajG = new THREE.Group();
  private occluder: THREE.Mesh;
  private trajs = new Map<string, TrajObj>();
  private mats: LineMaterial[] = [];
  readonly labels: HTMLDivElement;
  private labelEls = new Map<string, HTMLDivElement>();
  embedNote = '';

  constructor(labelHost: HTMLElement) {
    this.scene.add(this.surfaces, this.familiesG, this.trajG, this.conesG, this.embedG);
    this.surfaces.add(this.horizonG, this.ergoG, this.iscoG, this.photonG, this.gridG);
    const occ = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), new THREE.MeshBasicMaterial({ colorWrite: false }));
    occ.renderOrder = -1;
    this.occluder = occ;
    this.scene.add(occ);
    this.labels = document.createElement('div');
    this.labels.className = 'overlay-labels';
    labelHost.appendChild(this.labels);
  }

  private track<T extends LineMaterial>(m: T): T {
    this.mats.push(m);
    return m;
  }

  private clearGroup(g: THREE.Group): void {
    for (const c of [...g.children]) {
      g.remove(c);
      c.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
      });
    }
  }

  setSpin(a: number): void {
    if (Math.abs(a - this.a) < 1e-12) return;
    this.a = a;
    for (const g of [this.horizonG, this.ergoG, this.iscoG, this.photonG, this.gridG, this.embedG, this.conesG]) this.clearGroup(g);
    const { rPlus } = horizons(a);
    // Horizonte (esferoide oblato de radio KS r₊): meridianos y paralelos
    const sph = (rFun: (th: number) => number, color: string, width: number, opacity: number, dashed: boolean, group: THREE.Group) => {
      const mat = this.track(lineMat(color, width, opacity, dashed));
      for (let k = 0; k < 12; k++) {
        const ph = (k * Math.PI) / 6;
        const pts: number[] = [];
        for (let i = 0; i <= 64; i++) {
          const th = (i * Math.PI) / 64;
          pts.push(...cartesianFromSpheroidal(rFun(th), th, ph, a));
        }
        group.add(polyline(pts, mat));
      }
      for (let j = 1; j < 8; j++) {
        const th = (j * Math.PI) / 8;
        const pts: number[] = [];
        for (let i = 0; i <= 96; i++) pts.push(...cartesianFromSpheroidal(rFun(th), th, (i * 2 * Math.PI) / 96, a));
        group.add(polyline(pts, mat));
      }
    };
    sph(() => rPlus, DIAGRAM_COLORS.horizon, 1, 0.55, false, this.horizonG);
    sph((th) => ergosphereRadius(a, th), DIAGRAM_COLORS.ergo, 1, 0.5, true, this.ergoG);
    this.occluder.scale.set(Math.sqrt(rPlus * rPlus + a * a) * 0.98, Math.sqrt(rPlus * rPlus + a * a) * 0.98, rPlus * 0.98);
    const ring = (r: number, color: string, dashed: boolean, group: THREE.Group, width = 1.4) => {
      const pts: number[] = [];
      for (let i = 0; i <= 180; i++) pts.push(...cartesianFromSpheroidal(r, Math.PI / 2, (i * 2 * Math.PI) / 180, a));
      group.add(polyline(pts, this.track(lineMat(color, width, 0.9, dashed))));
    };
    ring(iscoRadius(a, true), DIAGRAM_COLORS.isco, false, this.iscoG);
    ring(iscoRadius(a, false), DIAGRAM_COLORS.isco, true, this.iscoG);
    ring(photonOrbitRadius(a, true), DIAGRAM_COLORS.photonOrbit, false, this.photonG);
    ring(photonOrbitRadius(a, false), DIAGRAM_COLORS.photonOrbit, true, this.photonG);
    // Rejilla polar ecuatorial
    const gm = this.track(lineMat(DIAGRAM_COLORS.grid, 1, 0.28));
    for (const r of [5, 10, 15, 20, 30, 40]) {
      const pts: number[] = [];
      for (let i = 0; i <= 160; i++) pts.push(...cartesianFromSpheroidal(r, Math.PI / 2, (i * 2 * Math.PI) / 160, a));
      this.gridG.add(polyline(pts, gm));
    }
    for (let k = 0; k < 12; k++) {
      const ph = (k * Math.PI) / 6;
      this.gridG.add(polyline([...cartesianFromSpheroidal(rPlus, Math.PI / 2, ph, a), ...cartesianFromSpheroidal(40, Math.PI / 2, ph, a)], gm));
    }
    this.buildEmbedding(a);
    this.buildCones(a);
  }

  /**
   * Diagrama de incrustación del corte ecuatorial t_BL = cte: superficie de revolución con radio
   * circunferencial R(r) = √A / r y dZ/dr = √(g_rr − R'(r)²), g_rr = r²/Δ. Para a = 0 es el
   * paraboloide de Flamm Z = √(8M(r − 2M)).
   */
  private buildEmbedding(a: number): void {
    const { rPlus } = horizons(a);
    const R = (r: number) => Math.sqrt((r * r + a * a) ** 2 - a * a * delta(r, a)) / r;
    const rs: number[] = [];
    const Zs: number[] = [];
    let Z = 0;
    let r = rPlus * 1.0005;
    let ok = true;
    let firstBad = NaN;
    const rMax = 26;
    const N = 400;
    for (let i = 0; i <= N; i++) {
      const rn = rPlus * 1.0005 + (rMax - rPlus) * Math.pow(i / N, 2);
      if (i > 0) {
        const rm = 0.5 * (r + rn);
        const h = 1e-5 * rm;
        const dR = (R(rm + h) - R(rm - h)) / (2 * h);
        const grr = (rm * rm) / delta(rm, a);
        const rad = grr - dR * dR;
        if (rad < 0) {
          ok = false;
          if (Number.isNaN(firstBad)) firstBad = rm;
        }
        Z += Math.sqrt(Math.max(rad, 0)) * (rn - r);
      }
      r = rn;
      rs.push(r);
      Zs.push(Z);
    }
    this.embedNote = ok
      ? 'Corte ecuatorial t_BL = cte incrustado en ℝ³ como superficie de revolución; la dirección vertical es ficticia.'
      : `El corte no es incrustable isométricamente cerca de r = ${firstBad.toFixed(2)} M (curvatura de Gauss demasiado positiva): se muestra la parte incrustable.`;
    const baseZ = -9;
    const mat = this.track(lineMat(DIAGRAM_COLORS.embed, 1, 0.55));
    for (let k = 0; k < 36; k++) {
      const ph = (k * 2 * Math.PI) / 36;
      const pts: number[] = [];
      for (let i = 0; i < rs.length; i += 4) {
        const RR = R(rs[i]);
        pts.push(RR * Math.cos(ph), RR * Math.sin(ph), baseZ - (Zs[Zs.length - 1] - Zs[i]) * 0.6);
      }
      this.embedG.add(polyline(pts, mat));
    }
    for (let i = 0; i < rs.length; i += 25) {
      const RR = R(rs[i]);
      const z = baseZ - (Zs[Zs.length - 1] - Zs[i]) * 0.6;
      const pts: number[] = [];
      for (let k = 0; k <= 96; k++) pts.push(RR * Math.cos((k * 2 * Math.PI) / 96), RR * Math.sin((k * 2 * Math.PI) / 96), z);
      this.embedG.add(polyline(pts, mat));
    }
  }

  /**
   * Conos de luz locales en coordenadas KS: el conjunto de velocidades coordenadas v de la luz en
   * un punto es el elipsoide g_ij vⁱvʲ + 2 g_ti vⁱ + g_tt = 0, de centro c = −G⁻¹b y semiejes de
   * (c·Gc − g_tt) y G. Fuera de la ergosfera contiene v = 0; dentro del horizonte queda entero
   * del lado de r decreciente: ningún movimiento causal futuro puede alejarse.
   */
  private buildCones(a: number): void {
    const ks = new KerrSchild(a);
    const { rPlus } = horizons(a);
    const radii = [rPlus * 0.45, rPlus * 0.75, rPlus, rPlus * 1.25, rPlus * 1.7, rPlus * 2.4, rPlus * 3.5, rPlus * 5];
    const dt = 0.55;
    for (const r of radii) {
      for (const [th, ph] of [
        [Math.PI / 2, -Math.PI / 2],
        [Math.PI / 4, -Math.PI / 2 + 0.6],
      ]) {
        if (r < 0.15) continue;
        const P = cartesianFromSpheroidal(r, th, ph, a);
        const g = ks.metric(P[0], P[1], P[2]);
        const G = new THREE.Matrix3().set(g[5], g[6], g[7], g[9], g[10], g[11], g[13], g[14], g[15]);
        const b = new THREE.Vector3(g[1], g[2], g[3]);
        const Gi = G.clone().invert();
        const c = b.clone().applyMatrix3(Gi).multiplyScalar(-1);
        const rhs = c.dot(c.clone().applyMatrix3(G)) - g[0];
        if (!(rhs > 0)) continue;
        // Parametrización del elipsoide: v = c + √rhs · L⁻ᵀ w, con G = L Lᵀ (Cholesky) y |w| = 1
        const e = G.elements; // column-major
        const m = [
          [e[0], e[3], e[6]],
          [e[1], e[4], e[7]],
          [e[2], e[5], e[8]],
        ];
        const L = [
          [0, 0, 0],
          [0, 0, 0],
          [0, 0, 0],
        ];
        for (let i = 0; i < 3; i++)
          for (let j = 0; j <= i; j++) {
            let s = m[i][j];
            for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
            L[i][j] = i === j ? Math.sqrt(s) : s / L[j][j];
          }
        // Resolver Lᵀ x = w (sustitución hacia atrás)
        const solveLT = (w: number[]) => {
          const x = [0, 0, 0];
          for (let i = 2; i >= 0; i--) {
            let s = w[i];
            for (let k = i + 1; k < 3; k++) s -= L[k][i] * x[k];
            x[i] = s / L[i][i];
          }
          return x;
        };
        const inside = g[0] < 0;
        const mat = this.track(lineMat(r < rPlus ? DIAGRAM_COLORS.coneInside : DIAGRAM_COLORS.cone, 1, 0.75));
        const sq = Math.sqrt(rhs);
        const scale = dt * Math.min(1, 0.5 * r);
        for (let k = 0; k < 6; k++) {
          const pts: number[] = [];
          for (let i = 0; i <= 48; i++) {
            const t = (i / 48) * 2 * Math.PI;
            const ang = (k / 6) * Math.PI;
            const w = [Math.cos(t) * Math.cos(ang), Math.cos(t) * Math.sin(ang), Math.sin(t)];
            const x = solveLT(w);
            pts.push(P[0] + scale * (c.x + sq * x[0]), P[1] + scale * (c.y + sq * x[1]), P[2] + scale * (c.z + sq * x[2]));
          }
          this.conesG.add(polyline(pts, mat));
        }
        // Punto de emisión
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshBasicMaterial({ color: inside ? DIAGRAM_COLORS.cone : DIAGRAM_COLORS.coneInside }));
        dot.position.set(P[0], P[1], P[2]);
        this.conesG.add(dot);
      }
    }
  }

  setToggles(t: OverlayToggles): void {
    this.toggles = t;
    this.horizonG.visible = t.horizon;
    this.ergoG.visible = t.ergosphere;
    this.iscoG.visible = t.isco;
    this.photonG.visible = t.photonOrbits;
    this.gridG.visible = t.grid;
    this.embedG.visible = t.embedding;
    this.conesG.visible = t.lightCones;
    this.trajG.visible = t.trajectories || t.coordMarkers;
    for (const c of this.familiesG.children) {
      const type = (c.userData.type as string) ?? '';
      c.visible = (type === 'photon' && t.geoPhotons) || (type === 'critical' && t.geoCritical) || (type === 'massive' && t.geoMassive) || (type === 'capture' && t.geoCapture);
    }
  }

  setFamilies(curves: Curve[]): void {
    this.clearGroup(this.familiesG);
    for (const c of curves) {
      const col = DIAGRAM_COLORS[c.type];
      const l = polyline(c.points, this.track(lineMat(col, c.type === 'critical' ? 1.8 : 1.3, 0.9)));
      l.userData.type = c.type;
      this.familiesG.add(l);
    }
    if (this.toggles) this.setToggles(this.toggles);
  }

  /** Actualiza trayectorias y marcadores de posición coordenada de los experimentos en t. */
  updateExperiments(list: Experiment[], client: PhysicsClient, t: number): void {
    const seen = new Set<string>();
    for (const e of list) {
      seen.add(e.id);
      let obj = this.trajs.get(e.id);
      if (!obj) {
        const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.12), new THREE.MeshBasicMaterial({ color: e.color, wireframe: true }));
        const extra = new THREE.Group();
        obj = {
          version: -1,
          past: null,
          future: null,
          marker,
          extra,
          nPts: 0,
          matPast: this.track(lineMat(e.color, 2, 0.95)),
          matFuture: this.track(lineMat(e.color, 1.2, 0.35, true)),
          beamLines: [],
          beamLens: [],
          beamHeads: [],
        };
        this.trajG.add(marker, extra);
        this.trajs.set(e.id, obj);
      }
      if (obj.version !== e.version) {
        obj.version = e.version;
        if (obj.past) this.trajG.remove(obj.past);
        if (obj.future) this.trajG.remove(obj.future);
        obj.past = obj.future = null;
        if (e.type === 'body' && e.nSamples >= 2) {
          const pts = new Float32Array(e.nSamples * 3);
          for (let k = 0; k < e.nSamples; k++) {
            const A = k * SAMPLE_SIZE;
            pts[3 * k] = e.body.data[A + 1];
            pts[3 * k + 1] = e.body.data[A + 2];
            pts[3 * k + 2] = e.body.data[A + 3];
          }
          obj.past = polyline(pts, obj.matPast);
          obj.future = polyline(pts, obj.matFuture);
          obj.nPts = e.nSamples;
          this.trajG.add(obj.past, obj.future);
        }
        if (e.type === 'cloud') this.rebuildCloud(e, obj);
        if (e.type === 'beam') this.rebuildBeam(e, obj, client);
      }
      // Rango visible: pasado hasta t
      const f = client.sampleIndex(e, t);
      const k = f === null ? -1 : Math.floor(f);
      if (obj.past && obj.future) {
        const segs = Math.max(0, Math.min(obj.nPts - 1, k));
        (obj.past.geometry as LineGeometry).instanceCount = segs;
        obj.future.visible = this.toggles?.trajectories ?? true;
        obj.past.visible = this.toggles?.trajectories ?? true;
      }
      const st = client.bodyAt(e, t);
      obj.marker.visible = !!st && (this.toggles?.coordMarkers ?? true);
      if (st) obj.marker.position.set(st.pos[0], st.pos[1], st.pos[2]);
      if (e.type === 'cloud') this.updateCloud(e, obj, client, t);
      if (e.type === 'beam') this.updateBeam(e, obj, client, t);
    }
    for (const [id, obj] of this.trajs) {
      if (seen.has(id)) continue;
      this.trajG.remove(obj.marker, obj.extra);
      if (obj.past) this.trajG.remove(obj.past);
      if (obj.future) this.trajG.remove(obj.future);
      this.trajs.delete(id);
      this.labelEls.get(id)?.remove();
      this.labelEls.delete(id);
    }
  }

  private rebuildCloud(e: Experiment, obj: TrajObj): void {
    obj.extra.clear();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(e.nParticles * 3), 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: e.color, size: 4, sizeAttenuation: false, transparent: true, opacity: 0.95, depthWrite: false }));
    pts.frustumCulled = false;
    obj.extra.add(pts);
  }

  private updateCloud(e: Experiment, obj: TrajObj, client: PhysicsClient, t: number): void {
    const pts = obj.extra.children[0] as THREE.Points | undefined;
    if (!pts) return;
    const p = client.particlesAt(e, t);
    const attr = pts.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let j = 0; j < e.nParticles; j++) attr.setXYZ(j, p[4 * j], p[4 * j + 1], p[4 * j + 2]);
    attr.needsUpdate = true;
    pts.visible = this.toggles?.coordMarkers ?? true;
  }

  private beamMats: { photon: LineMaterial; capture: LineMaterial } | null = null;

  private rebuildBeam(e: Experiment, obj: TrajObj, client: PhysicsClient): void {
    obj.extra.clear();
    if (!this.beamMats) this.beamMats = { photon: this.track(lineMat(DIAGRAM_COLORS.photon, 1.4, 0.95)), capture: this.track(lineMat(DIAGRAM_COLORS.capture, 1.4, 0.95)) };
    const paths = client.photonPaths(e, Infinity);
    obj.beamLines = [];
    obj.beamLens = [];
    obj.beamHeads = [];
    paths.forEach((pp, j) => {
      if (pp.length < 6) return;
      const cap = e.photonSummary[j]?.status === 'capturado';
      const line = polyline(pp, cap ? this.beamMats!.capture : this.beamMats!.photon);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: cap ? DIAGRAM_COLORS.capture : DIAGRAM_COLORS.photon }));
      obj.extra.add(line, head);
      obj.beamLines.push(line);
      obj.beamLens.push(pp.length / 3);
      obj.beamHeads.push(head);
    });
  }

  private updateBeam(e: Experiment, obj: TrajObj, client: PhysicsClient, t: number): void {
    const f = client.sampleIndex(e, t);
    const k = f === null ? 0 : Math.floor(f);
    obj.beamLines.forEach((line, j) => {
      const n = obj.beamLens[j];
      const kk = Math.min(k, n - 1);
      (line.geometry as LineGeometry).instanceCount = Math.max(0, kk);
      const pos = (line.geometry as LineGeometry).attributes.instanceEnd as THREE.InterleavedBufferAttribute;
      const idx = Math.max(0, kk - 1);
      if (pos) obj.beamHeads[j].position.set(pos.getX(idx), pos.getY(idx), pos.getZ(idx));
      obj.beamHeads[j].visible = kk >= 1;
    });
    obj.extra.visible = (this.toggles?.trajectories ?? true) || (this.toggles?.coordMarkers ?? true);
  }

  /** Etiquetas HTML junto a los marcadores coordenados. */
  private updateLabels(list: Experiment[], width: number, height: number): void {
    const show = this.toggles?.labels ?? true;
    for (const e of list) {
      const obj = this.trajs.get(e.id);
      let el = this.labelEls.get(e.id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'ov-label';
        this.labels.appendChild(el);
        this.labelEls.set(e.id, el);
      }
      if (!obj || !obj.marker.visible || !show) {
        el.style.display = 'none';
        continue;
      }
      const v = obj.marker.position.clone().project(this.camera);
      if (v.z > 1 || v.z < -1) {
        el.style.display = 'none';
        continue;
      }
      el.style.display = '';
      el.style.transform = `translate(${((v.x + 1) / 2) * width + 10}px, ${((1 - v.y) / 2) * height - 8}px)`;
      el.textContent = `${e.label} · modelo`;
      el.style.color = e.color;
    }
  }

  render(renderer: THREE.WebGLRenderer, pose: Pose, fovY: number, list: Experiment[]): void {
    const w = renderer.domElement.width;
    const h = renderer.domElement.height;
    this.camera.fov = (fovY * 180) / Math.PI;
    this.camera.aspect = w / h;
    const r = Math.hypot(...pose.pos);
    this.camera.near = Math.max(0.005, 0.01 * r);
    this.camera.far = Math.max(1e4, 10 * r);
    this.camera.position.set(...pose.pos);
    this.camera.up.set(...pose.up);
    this.camera.lookAt(pose.pos[0] + pose.fwd[0], pose.pos[1] + pose.fwd[1], pose.pos[2] + pose.fwd[2]);
    this.camera.updateProjectionMatrix();
    for (const m of this.mats) m.resolution.set(w, h);
    renderer.setRenderTarget(null);
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    const css = renderer.domElement.getBoundingClientRect();
    this.updateLabels(list, css.width, css.height);
  }

  hideLabels(): void {
    for (const el of this.labelEls.values()) el.style.display = 'none';
  }
}

export { DT_SAMPLE };
