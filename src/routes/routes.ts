/**
 * Rutas con líneas gruesas en espacio de pantalla (Line2/LineMaterial: no se
 * depende de lineWidth nativo de WebGL). Un objeto por tramo; los tramos comunes
 * comparten geometría y, si las dos vías están visibles, se dibujan con trazos
 * alternos de ambos colores (sin líneas superpuestas). La trayectoria lógica está
 * en los datos; aquí solo se aplica un pequeño desplazamiento visual según la
 * normal del terreno para evitar z-fighting. Con prueba de profundidad: la cara
 * oculta de la montaña tapa la ruta.
 */
import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import type { RoutesFile } from '../data/types.ts';
import type { Frame } from '../geo/frame.ts';
import type { HeightGrid } from '../geo/heightfield.ts';

export interface RouteVisibility {
  master: boolean;
  routes: Record<string, boolean>;
  highlight: string | null;
}

interface SegmentRuntime {
  id: string;
  routes: string[];
  geometry: LineGeometry;
  /** línea principal (color de una ruta) y línea alterna (segunda ruta, trazos complementarios) */
  primary: Line2;
  secondary: Line2;
  /** contorno oscuro bajo la línea: legibilidad sobre nieve y roca */
  casing: Line2;
}

const LIFT = 7; // m, a lo largo de la normal del terreno

export class Routes {
  readonly group = new THREE.Group();
  private readonly segs: SegmentRuntime[] = [];
  private readonly materials: LineMaterial[] = [];
  private readonly resolution = new THREE.Vector2(1, 1);
  private widthPx = 3;
  private dpr = 1;
  private casingOn = true;
  private state: RouteVisibility;

  constructor(private readonly data: RoutesFile, frame: Frame, core: HeightGrid) {
    this.group.name = 'rutas';
    this.state = { master: true, routes: Object.fromEntries(Object.keys(data.rutas).map((r) => [r, true])), highlight: null };
    const usage = new Map<string, string[]>();
    for (const [rid, r] of Object.entries(data.rutas)) for (const s of r.tramos) usage.set(s, [...(usage.get(s) ?? []), rid]);
    for (const [sid, seg] of Object.entries(data.tramos)) {
      const pos: number[] = [];
      for (const [x, y, alt] of seg.puntos) {
        const [gx, gy] = core.gradient(x, y);
        // normal del terreno en coordenadas de escena (X este, Y arriba, Z sur)
        let nx = -gx;
        let ny = 1;
        let nz = gy;
        const l = Math.hypot(nx, ny, nz);
        nx /= l;
        ny /= l;
        nz /= l;
        pos.push(x + nx * LIFT, alt - frame.h0 + ny * LIFT, -y + nz * LIFT);
      }
      const geometry = new LineGeometry();
      geometry.setPositions(pos);
      const mk = () => {
        const m = new LineMaterial({ color: 0xffffff, linewidth: this.widthPx, worldUnits: false, dashed: false, transparent: true });
        // se comprueba la profundidad contra el terreno (la cara oculta tapa la ruta) pero no se
        // escribe: así contorno y color no compiten entre sí (sin z-fighting)
        m.depthWrite = false;
        m.polygonOffset = true;
        m.polygonOffsetFactor = -2;
        m.polygonOffsetUnits = -6;
        m.resolution = this.resolution;
        this.materials.push(m);
        return m;
      };
      const casingMat = mk();
      casingMat.color.set('#0b1520');
      casingMat.polygonOffsetUnits = -4;
      const casing = new Line2(geometry, casingMat);
      const primary = new Line2(geometry, mk());
      const secondary = new Line2(geometry, mk());
      primary.computeLineDistances();
      secondary.computeLineDistances();
      casing.renderOrder = 1;
      primary.renderOrder = secondary.renderOrder = 2;
      casing.name = `ruta-${sid}-contorno`;
      primary.name = `ruta-${sid}`;
      secondary.name = `ruta-${sid}-alterna`;
      this.group.add(casing, primary, secondary);
      this.segs.push({ id: sid, routes: usage.get(sid) ?? [], geometry, primary, secondary, casing });
    }
    this.apply();
  }

  get visibility(): RouteVisibility {
    return this.state;
  }

  setVisibility(v: Partial<RouteVisibility>): void {
    this.state = { ...this.state, ...v, routes: { ...this.state.routes, ...(v.routes ?? {}) } };
    this.apply();
  }

  setResolution(w: number, h: number, mobile: boolean, dpr = 1): void {
    this.resolution.set(w * dpr, h * dpr);
    this.dpr = dpr;
    // LineSegments2 trabaja en píxeles físicos: se escala por el DPR para mantener ~3 px CSS
    this.widthPx = (mobile ? 3.2 : 3) * dpr;
    this.apply();
  }

  /** Contorno oscuro bajo las líneas; el perfil Baja lo omite para ahorrar draw calls. */
  setCasing(on: boolean): void {
    this.casingOn = on;
    this.apply();
  }

  /** Escala de los trazos para que midan ~14 px a la distancia de observación. */
  updateDashes(worldPerPixel: number): void {
    const dashWorld = 14 * worldPerPixel;
    for (const m of this.materials) m.dashScale = 1 / dashWorld;
  }

  /** Rutas visibles efectivas (interruptor maestro incluido). */
  visibleRoutes(): string[] {
    if (!this.state.master) return [];
    return Object.keys(this.data.rutas).filter((r) => this.state.routes[r]);
  }

  private style(m: LineMaterial, routeId: string, partner: string | null, alternate: boolean): void {
    const def = this.data.rutas[routeId];
    const hl = this.state.highlight;
    const dim = hl !== null && hl !== routeId && !(partner && hl === partner);
    m.color.set(def.color);
    m.opacity = dim ? 0.38 : 1;
    m.linewidth = this.widthPx + (hl === routeId || (partner && hl === partner) ? 1.6 * this.dpr : 0);
    if (partner) {
      // tramo común con las dos vías visibles: trazos alternos de igual longitud
      m.dashed = true;
      m.dashSize = 1;
      m.gapSize = 1;
      m.dashOffset = alternate ? 1 : 0;
    } else if (def.patron === 'discontinuo') {
      m.dashed = true;
      m.dashSize = 1.4;
      m.gapSize = 0.75;
      m.dashOffset = 0;
    } else {
      m.dashed = false;
    }
    m.needsUpdate = true;
  }

  private apply(): void {
    const vis = new Set(this.visibleRoutes());
    for (const s of this.segs) {
      const shown = s.routes.filter((r) => vis.has(r));
      s.primary.visible = shown.length > 0;
      s.secondary.visible = shown.length > 1;
      s.casing.visible = this.casingOn && shown.length > 0;
      const hl = this.state.highlight;
      const strong = hl !== null && shown.includes(hl);
      s.casing.material.linewidth = this.widthPx + ((strong ? 1.6 : 0) + 2.2) * this.dpr;
      s.casing.material.opacity = hl !== null && !strong ? 0.22 : 0.55;
      if (shown.length === 1) this.style(s.primary.material, shown[0], null, false);
      if (shown.length > 1) {
        this.style(s.primary.material, shown[0], shown[1], false);
        this.style(s.secondary.material, shown[1], shown[0], true);
      }
    }
  }

  /**
   * Triángulos que pueden llegar a dibujar las rutas con el perfil actual (Line2: 6 por
   * segmento instanciado), estén visibles o no: así mostrar u ocultar rutas no cambia el
   * presupuesto del terreno ni su nivel de detalle.
   */
  reservedTriangles(): number {
    let n = 0;
    for (const s of this.segs) {
      const per = s.geometry.instanceCount * 6;
      n += per * (1 + (s.routes.length > 1 ? 1 : 0) + (this.casingOn ? 1 : 0));
    }
    return n;
  }

  /** Número de objetos de línea visibles (para el diagnóstico). */
  visibleObjects(): number {
    return this.segs.reduce((n, s) => n + (s.primary.visible ? 1 : 0) + (s.secondary.visible ? 1 : 0) + (s.casing.visible ? 1 : 0), 0);
  }

  dispose(): void {
    for (const s of this.segs) s.geometry.dispose();
    for (const m of this.materials) m.dispose();
    this.group.clear();
  }
}
