/**
 * Marcadores HTML anclados al espacio 3D. Proyección por fotograma solo para
 * candidatos visibles, oclusión contra el relieve con frecuencia limitada,
 * visibilidad por escala y prioridad, y colocación sin solapes con líneas guía.
 * Las escrituras al DOM solo se hacen cuando cambia algo.
 */
import * as THREE from 'three';
import type { Poi } from '../data/types.ts';
import type { Frame } from '../geo/frame.ts';
import { rayBlocked, type HeightQuery } from '../geo/heightfield.ts';
import { layoutLabels, type LabelCandidate } from './layout.ts';
import { formatShortAltitude } from '../ui/format.ts';

export interface MarkerFilters {
  showLabels: boolean;
  showCamps: boolean;
  deathZone: boolean;
  visibleRoutes: string[];
  highlight: string | null;
  selected: string | null;
  labelsMax: number;
}

interface Marker {
  poi: Poi;
  el: HTMLButtonElement;
  label: HTMLSpanElement;
  leader: SVGLineElement;
  world: THREE.Vector3;
  w: number;
  h: number;
  occluded: boolean;
  lastOcclusion: number;
  shown: boolean;
  key: string;
  /** hueco de la etiqueta en el fotograma anterior (histéresis de la colocación) */
  slot: number;
}

/** Pruebas de oclusión por fotograma en movimiento: repartidas, sin picos sincronizados. */
const OCCLUSION_CHECKS_PER_FRAME = 4;

/** Distancia máxima (m) a la que se muestra cada nivel de prioridad. */
const PRIORITY_RANGE = [Infinity, Infinity, 15000, 9000, 6500, 4800, 21000];

export class PoiMarkers {
  private readonly markers: Marker[] = [];
  private readonly svg: SVGSVGElement;
  private filters: MarkerFilters;
  private readonly tmp = new THREE.Vector3();
  private readonly lastPos = new THREE.Vector3(NaN, NaN, NaN);
  private readonly lastQuat = new THREE.Quaternion();
  private lastSize = '';
  private dirty = true;
  private occlusionCursor = 0;

  constructor(
    container: HTMLElement,
    pois: Poi[],
    private readonly frame: Frame,
    private readonly terrain: HeightQuery,
    private readonly onSelect: (id: string) => void,
  ) {
    this.filters = { showLabels: true, showCamps: true, deathZone: true, visibleRoutes: [], highlight: null, selected: null, labelsMax: 22 };
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.classList.add('poi-leaders');
    this.svg.setAttribute('aria-hidden', 'true');
    container.appendChild(this.svg);
    for (const poi of pois) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `poi poi--${poi.categoria}`;
      el.dataset.id = poi.id;
      el.setAttribute('aria-label', `${poi.nombre}${poi.altitudRef ? `, ${formatShortAltitude(poi.altitudRef)}` : ''}`);
      const dot = document.createElement('span');
      dot.className = 'poi__dot';
      const label = document.createElement('span');
      label.className = 'poi__label';
      const name = document.createElement('span');
      name.className = 'poi__name';
      name.textContent = poi.categoria === 'campamento' && poi.nombreCorto ? poi.nombreCorto : poi.nombre;
      label.appendChild(name);
      if (poi.altitudRef && poi.categoria !== 'geografia') {
        const alt = document.createElement('span');
        alt.className = 'poi__alt';
        alt.textContent = formatShortAltitude(poi.altitudRef);
        label.appendChild(alt);
      }
      el.append(dot, label);
      el.addEventListener('click', () => this.onSelect(poi.id));
      container.appendChild(el);
      const leader = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      this.svg.appendChild(leader);
      const anchorAlt = poi.categoria === 'geografia' ? poi.posicion.altModelo + 60 : poi.posicion.altModelo;
      this.markers.push({
        poi,
        el,
        label,
        leader,
        world: new THREE.Vector3(poi.posicion.x, anchorAlt - frame.h0, -poi.posicion.y),
        w: 0,
        h: 0,
        occluded: false,
        lastOcclusion: -Infinity,
        shown: false,
        key: '',
        slot: -1,
      });
    }
    this.measure();
  }

  measure(): void {
    for (const m of this.markers) m.el.classList.add('is-measuring');
    for (const m of this.markers) {
      m.w = Math.ceil(m.label.offsetWidth) || 80;
      m.h = Math.ceil(m.label.offsetHeight) || 24;
    }
    for (const m of this.markers) m.el.classList.remove('is-measuring');
    this.dirty = true;
  }

  /** Fuerza una pasada completa (p. ej. al detenerse la cámara, para la oclusión exacta). */
  invalidate(): void {
    this.dirty = true;
    for (const m of this.markers) m.lastOcclusion = -Infinity;
  }

  setFilters(f: Partial<MarkerFilters>): void {
    this.filters = { ...this.filters, ...f };
    this.dirty = true;
  }

  private eligible(p: Poi): boolean {
    const f = this.filters;
    if (p.id === f.selected) return true;
    const routes = new Set(f.visibleRoutes);
    switch (p.categoria) {
      case 'campamento':
      case 'hito': {
        if (p.categoria === 'campamento' && !f.showCamps) return false;
        if (!p.rutas.some((r) => routes.has(r))) return false;
        if (f.highlight && !p.rutas.includes(f.highlight)) return false;
        return true;
      }
      case 'umbral':
        return f.deathZone;
      case 'geografia':
        return f.showLabels;
      default:
        return true;
    }
  }

  /** ¿Hay que seguir actualizando? (oclusión pendiente tras el movimiento) */
  update(camera: THREE.PerspectiveCamera, width: number, height: number, now: number, moved: boolean, insets: { bottom: number; right: number; top: number; left: number }): void {
    // también cuenta como movimiento un salto programático de cámara o un cambio de tamaño
    const size = `${width}x${height}`;
    const camChanged = !this.lastPos.equals(camera.position) || !this.lastQuat.equals(camera.quaternion) || size !== this.lastSize;
    if (camChanged && !moved) {
      // salto: la oclusión se recalcula ya, sin esperar al intervalo de movimiento
      for (const m of this.markers) m.lastOcclusion = -Infinity;
    }
    this.lastPos.copy(camera.position);
    this.lastQuat.copy(camera.quaternion);
    this.lastSize = size;
    if (!moved && !camChanged && !this.dirty) return;
    this.dirty = false;
    const camLocal = { x: camera.position.x, y: -camera.position.z, alt: camera.position.y + this.frame.h0 };
    const cands: (LabelCandidate & { m: Marker })[] = [];
    const occlusionInterval = moved ? 140 : 0;
    // en movimiento, como mucho N rayos por fotograma y en turno rotatorio (los más antiguos antes)
    let checks = moved ? OCCLUSION_CHECKS_PER_FRAME : Infinity;
    const n = this.markers.length;
    const start = this.occlusionCursor % n;
    this.occlusionCursor++;
    for (let r = 0; r < n; r++) {
      const m = this.markers[(start + r) % n];
      const p = m.poi;
      let show = this.eligible(p);
      const dist = camera.position.distanceTo(m.world);
      if (show && p.id !== this.filters.selected && dist > (PRIORITY_RANGE[p.prioridad] ?? 8000)) show = false;
      let sx = 0;
      let sy = 0;
      if (show) {
        this.tmp.copy(m.world).applyMatrix4(camera.matrixWorldInverse);
        if (this.tmp.z > -1) show = false; // detrás de la cámara
        else {
          this.tmp.copy(m.world).project(camera);
          sx = (this.tmp.x * 0.5 + 0.5) * width;
          sy = (-this.tmp.y * 0.5 + 0.5) * height;
          if (sx < -40 || sx > width + 40 || sy < -40 || sy > height + 40) show = false;
          // bajo el panel lateral (escritorio) o la hoja inferior (móvil) no serían pulsables
          if (sx > width - insets.right + 8 || sy > height - insets.bottom + 4) show = p.id === this.filters.selected && show;
        }
      }
      if (show && now - m.lastOcclusion >= occlusionInterval && checks > 0) {
        checks--;
        m.occluded = rayBlocked(this.terrain, camLocal.x, camLocal.y, camLocal.alt, p.posicion.x, p.posicion.y, m.world.y + this.frame.h0 + 6, Math.min(90, 25 + dist * 0.004));
        m.lastOcclusion = now;
      }
      const ghost = show && m.occluded && p.id === this.filters.selected;
      if (show && m.occluded && !ghost) show = false;
      m.el.classList.toggle('is-ghost', ghost);
      m.el.classList.toggle('is-selected', p.id === this.filters.selected);
      if (!show) {
        m.slot = -1;
        if (m.shown) {
          m.el.classList.remove('is-visible');
          m.leader.style.display = 'none';
          m.shown = false;
          m.key = '';
        }
        continue;
      }
      cands.push({ id: p.id, x: sx, y: sy, w: m.w, h: m.h, priority: p.prioridad, forced: p.id === this.filters.selected, prevSlot: m.slot, m });
    }
    // límite de etiquetas por perfil de calidad (las de mayor prioridad primero; desempate estable)
    cands.sort((a, b) => Number(!!b.forced) - Number(!!a.forced) || a.priority - b.priority || (a.id < b.id ? -1 : 1));
    const labeled = this.filters.showLabels ? cands.slice(0, this.filters.labelsMax) : cands.filter((c) => c.forced);
    const placements = new Map(layoutLabels(labeled, { width, height, ...insets }).map((p) => [p.id, p]));
    for (const c of cands) {
      const m = c.m;
      const pl = placements.get(c.id);
      const withLabel = !!pl?.visible;
      m.slot = withLabel ? pl!.slot : -1;
      const isGeo = m.poi.categoria === 'geografia';
      if (isGeo && !withLabel) {
        if (m.shown) {
          m.el.classList.remove('is-visible');
          m.shown = false;
          m.key = '';
        }
        m.leader.style.display = 'none';
        continue;
      }
      const lx = withLabel ? pl!.lx - c.x : 0;
      const ly = withLabel ? pl!.ly - c.y : 0;
      const key = `${c.x.toFixed(1)},${c.y.toFixed(1)},${withLabel ? 1 : 0},${lx.toFixed(1)},${ly.toFixed(1)}`;
      if (key !== m.key) {
        m.el.style.transform = `translate3d(${c.x.toFixed(1)}px, ${c.y.toFixed(1)}px, 0)`;
        m.label.style.transform = `translate3d(${lx.toFixed(1)}px, ${ly.toFixed(1)}px, 0)`;
        m.el.classList.toggle('has-label', withLabel);
        if (withLabel && pl!.leader) {
          const tx = pl!.lx + (pl!.lx > c.x ? 0 : m.w);
          const ty = pl!.ly + m.h / 2;
          m.leader.setAttribute('x1', c.x.toFixed(1));
          m.leader.setAttribute('y1', c.y.toFixed(1));
          m.leader.setAttribute('x2', tx.toFixed(1));
          m.leader.setAttribute('y2', ty.toFixed(1));
          m.leader.style.display = '';
        } else m.leader.style.display = 'none';
        m.key = key;
      }
      if (!m.shown) {
        m.el.classList.add('is-visible');
        m.shown = true;
      }
    }
  }

  /** Recuento para diagnóstico. */
  visibleCount(): number {
    return this.markers.filter((m) => m.shown).length;
  }

  dispose(): void {
    for (const m of this.markers) m.el.remove();
    this.svg.remove();
  }
}
