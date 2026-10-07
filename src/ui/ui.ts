/**
 * Interfaz HTML (español). Construye las partes dinámicas desde los datos y
 * traduce eventos en acciones de la aplicación; no conoce three.js.
 */
import type { AtlasData, Poi } from '../data/types.ts';
import { VIEWS } from '../config/views.ts';
import { LIGHT_PRESETS } from '../scene/environment.ts';
import { CATEGORY_LABEL, CERTAINTY_LABEL, formatAltitudeRef, formatDegrees, formatMeters, groupThousands } from './format.ts';

export type QualityMode = 'auto' | 'alta' | 'media' | 'baja';

export interface UiActions {
  setRoutesMaster(on: boolean): void;
  setRoute(id: string, on: boolean): void;
  setHighlight(id: string | null): void;
  setLabels(on: boolean): void;
  setCamps(on: boolean): void;
  setDeathZone(on: boolean): void;
  setDemOverlay(on: boolean): void;
  setLight(id: 'manana' | 'tarde'): void;
  goToView(id: string): void;
  resetView(): void;
  selectPoi(id: string | null, focus?: boolean): void;
  focusPoi(id: string): void;
  setQuality(mode: QualityMode): void;
  zoom(factor: number): void;
  orientNorth(): void;
  setAutoRotate(on: boolean): void;
  orbit(dAz: number, dPolar: number): void;
  toggleDiagnostics(): void;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const SVGNS = 'http://www.w3.org/2000/svg';

function swatch(colors: string[], dash: 'continuo' | 'discontinuo' | 'alterno'): SVGSVGElement {
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('viewBox', '0 0 34 8');
  svg.setAttribute('width', '34');
  svg.setAttribute('height', '8');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('swatch');
  const line = (color: string, da: string | null, off = 0) => {
    const l = document.createElementNS(SVGNS, 'line');
    l.setAttribute('x1', '1');
    l.setAttribute('x2', '33');
    l.setAttribute('y1', '4');
    l.setAttribute('y2', '4');
    l.setAttribute('stroke', color);
    l.setAttribute('stroke-width', '3.5');
    l.setAttribute('stroke-linecap', 'butt');
    if (da) l.setAttribute('stroke-dasharray', da);
    if (off) l.setAttribute('stroke-dashoffset', String(off));
    svg.appendChild(l);
  };
  if (dash === 'continuo') line(colors[0], null);
  else if (dash === 'discontinuo') line(colors[0], '7 4');
  else {
    line(colors[0], '5 5');
    line(colors[1], '5 5', 5);
  }
  return svg;
}

export class Ui {
  private lastFocus: HTMLElement | null = null;
  private selected: string | null = null;

  constructor(private readonly data: AtlasData, private readonly actions: UiActions) {
    this.buildRoutes();
    this.buildLayers();
    this.buildViews();
    this.buildPoiList();
    this.buildQuality();
    this.buildSources();
    this.bindHud();
    this.bindPanel();
    this.bindCard();
    this.bindKeys();
  }

  private buildRoutes(): void {
    const { rutas } = this.data.routes;
    const list = $('route-list');
    for (const [id, r] of Object.entries(rutas)) {
      const li = document.createElement('li');
      const label = document.createElement('label');
      label.className = 'route';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = true;
      input.dataset.route = id;
      input.addEventListener('change', () => this.actions.setRoute(id, input.checked));
      const name = document.createElement('span');
      name.className = 'route__name';
      name.append(swatch([r.color], r.patron), document.createTextNode(r.nombre));
      const sub = document.createElement('span');
      sub.className = 'route__sub';
      sub.textContent = `${r.nombreIngles} · trazo ${r.patron === 'continuo' ? 'continuo' : 'discontinuo'}`;
      label.append(input, name, sub);
      li.appendChild(label);
      list.appendChild(li);
    }
    const ids = Object.keys(rutas);
    const shared = document.createElement('li');
    shared.className = 'route';
    const sname = document.createElement('span');
    sname.className = 'route__name';
    sname.style.gridColumn = '2';
    sname.append(swatch(ids.map((i) => rutas[i].color), 'alterno'), document.createTextNode('Tramo compartido'));
    const ssub = document.createElement('span');
    ssub.className = 'route__sub';
    ssub.textContent = 'Aproximación por el glaciar y del Hombro a la cumbre';
    shared.append(sname, ssub);
    list.appendChild(shared);
    const master = $<HTMLInputElement>('t-routes');
    master.addEventListener('change', () => {
      this.actions.setRoutesMaster(master.checked);
      list.querySelectorAll<HTMLInputElement>('input[data-route]').forEach((i) => (i.disabled = !master.checked));
    });
    const hl = $('route-highlight');
    const opts: [string, string][] = [['', 'Ninguna'], ...ids.map((i) => [i, rutas[i].nombreCorto] as [string, string])];
    for (const [val, text] of opts) {
      const l = document.createElement('label');
      const inp = document.createElement('input');
      inp.type = 'radio';
      inp.name = 'highlight';
      inp.value = val;
      inp.checked = val === '';
      inp.addEventListener('change', () => inp.checked && this.actions.setHighlight(val || null));
      const s = document.createElement('span');
      s.textContent = text;
      l.append(inp, s);
      hl.appendChild(l);
    }
    const ces = this.data.pois.poi.filter((p) => p.categoria === 'campamento' && p.rutas.length === 1 && p.rutas[0] === 'cesen');
    $('route-note').textContent =
      `Al destacar una vía solo se ven sus campamentos y los compartidos. Česen: ${ces.map((p) => p.nombreCorto).join(' y ')} según Madison Mountaineering 2019; ` +
      'no hay altitud verificable de un C1 propio (esa expedición subió del campo base al C2), así que no se muestra. El C4 del Hombro es común a ambas vías.';
  }

  private buildLayers(): void {
    const bind = (id: string, fn: (on: boolean) => void) => {
      const el = $<HTMLInputElement>(id);
      el.addEventListener('change', () => fn(el.checked));
    };
    bind('t-labels', (on) => this.actions.setLabels(on));
    bind('t-camps', (on) => this.actions.setCamps(on));
    bind('t-death', (on) => this.actions.setDeathZone(on));
    bind('t-dem', (on) => {
      this.actions.setDemOverlay(on);
      $('dem-legend').hidden = !on;
    });
    const legend = $('dem-legend');
    const items: [string, string][] = [
      ['#4dc7a3', 'TanDEM-X (medido)'],
      ['#a37ff5', 'Relleno AW3D30'],
      ['#f5d152', 'Relleno ASTER'],
      ['#f57a3d', 'Relleno SRTM90'],
      ['#faa975', 'Relleno SRTM30'],
      ['#8d9ec7', 'Editado'],
      ['#ff40c7', 'Corrección de cumbre'],
    ];
    for (const [c, t] of items) {
      const li = document.createElement('li');
      const i = document.createElement('i');
      i.style.background = c;
      li.append(i, document.createTextNode(t));
      legend.appendChild(li);
    }
    const lp = $('light-presets');
    for (const p of Object.values(LIGHT_PRESETS)) {
      const l = document.createElement('label');
      const inp = document.createElement('input');
      inp.type = 'radio';
      inp.name = 'light';
      inp.value = p.id;
      inp.checked = p.id === 'manana';
      inp.addEventListener('change', () => inp.checked && this.actions.setLight(p.id));
      const s = document.createElement('span');
      s.textContent = p.label;
      l.append(inp, s);
      lp.appendChild(l);
    }
  }

  private buildViews(): void {
    const wrap = $('view-list');
    for (const v of VIEWS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn';
      b.textContent = v.label;
      b.addEventListener('click', () => this.actions.goToView(v.id));
      wrap.appendChild(b);
    }
  }

  private buildPoiList(): void {
    const wrap = $('poi-list');
    const order: Poi['categoria'][] = ['cumbre', 'sector', 'campamento', 'hito', 'umbral', 'geografia'];
    for (const cat of order) {
      const items = this.data.pois.poi.filter((p) => p.categoria === cat).sort((a, b) => (b.altitudRef?.valor ?? 0) - (a.altitudRef?.valor ?? 0));
      if (!items.length) continue;
      const h = document.createElement('h3');
      h.textContent = CATEGORY_LABEL[cat];
      const ul = document.createElement('ul');
      for (const p of items) {
        const li = document.createElement('li');
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'poi-item';
        b.dataset.id = p.id;
        const name = document.createElement('span');
        name.textContent = p.nombre;
        const badge = document.createElement('span');
        badge.className = `badge badge--${p.certeza}`;
        badge.textContent = CERTAINTY_LABEL[p.certeza];
        name.appendChild(badge);
        const alt = document.createElement('span');
        alt.className = 'poi-item__alt';
        alt.textContent = p.altitudRef ? (p.altitudRef.exacta ? formatMeters(p.altitudRef.valor) : `≈ ${formatMeters(p.altitudRef.valor)}`) : '';
        b.append(name, alt);
        b.addEventListener('click', () => {
          this.lastFocus = b;
          this.actions.selectPoi(p.id, true);
        });
        li.appendChild(b);
        ul.appendChild(li);
      }
      wrap.append(h, ul);
    }
  }

  private buildQuality(): void {
    const q = $('quality');
    const modes: [QualityMode, string][] = [['auto', 'Auto'], ['alta', 'Alta'], ['media', 'Media'], ['baja', 'Baja']];
    for (const [m, t] of modes) {
      const l = document.createElement('label');
      const inp = document.createElement('input');
      inp.type = 'radio';
      inp.name = 'quality';
      inp.value = m;
      inp.checked = m === 'auto';
      inp.addEventListener('change', () => inp.checked && this.actions.setQuality(m));
      const s = document.createElement('span');
      s.textContent = t;
      l.append(inp, s);
      q.appendChild(l);
    }
  }

  setQualityNote(text: string): void {
    $('quality-note').textContent = text;
  }

  private buildSources(): void {
    const { manifest: m, pois, routes } = this.data;
    const body = $('sources-body');
    const pct = (o: Record<string, number>) =>
      Object.entries(o)
        .filter(([, v]) => v >= 0.1)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `<tr><td>${k}</td><td class="num">${v.toFixed(1).replace('.', ',')} %</td></tr>`)
        .join('');
    const refs = new Map(pois.referencias.map((r) => [r.id, r]));
    const poiRows = pois.poi
      .filter((p) => p.altitudRef)
      .map(
        (p) =>
          `<tr><td>${p.nombre}</td><td class="num">${formatAltitudeRef(p.altitudRef)}</td><td class="num">${formatMeters(p.posicion.altModelo)}</td><td>${CERTAINTY_LABEL[p.certeza]}</td><td>${p.metodoColocacion}</td></tr>`,
      )
      .join('');
    const segRows = Object.values(routes.tramos)
      .map((s) => `<tr><td>${s.nombre}</td><td>${s.metodo}</td><td>${CERTAINTY_LABEL[s.certeza]}</td><td class="num">${groupThousands(s.validacion.longitud_m)} m</td></tr>`)
      .join('');
    const c = m.cumbre;
    body.innerHTML = `
      <p>Atlas de <strong>representación geográfica</strong> del K2: no simula meteorología, avalanchas ni fisiología. Cada elemento indica si está <em>documentado</em>, es <em>aproximado</em> o está <em>reconstruido</em>.</p>
      <h3>Relieve</h3>
      <p><strong>Copernicus DEM GLO-30</strong> (teselas ${m.fuentesTerreno.filter((f) => f.archivo.endsWith('_DEM.tif')).map((f) => f.archivo.split('/').pop()?.replace('Copernicus_DSM_COG_10_', '').replace('_DEM.tif', '')).join(', ')}), AWS Open Data. Resolución nativa 1″ (≈30,9 m N–S × 25,0 m E–O a 35,9° N). Alturas ortométricas referidas a <strong>EGM2008</strong>. Licencia gratuita de Copernicus (COP-DEM-GLO-30-F) que permite reproducir, distribuir y modificar con estos avisos: <em>“produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved”</em>. <em>“The organisations in charge of the Copernicus programme by law or by delegation do not incur any liability for any use of the Copernicus WorldDEM-30”</em> (las organizaciones del programa no asumen responsabilidad por ningún uso de estos datos). Este atlas no está respaldado por ellas.</p>
      <p>Rejillas locales: núcleo ${formatMeters(2 * m.rejillas.core.semilado)} a ${m.rejillas.core.espaciado} m (remuestreo cúbico), contexto ${formatMeters(2 * m.rejillas.context.semilado)} a ${m.rejillas.context.espaciado} m y horizonte ${formatMeters(2 * m.rejillas.far.semilado)} a ${m.rejillas.far.espaciado} m (promedio). El remuestreo no añade resolución: el detalle fino es sombreado y material, no medida.</p>
      <p><strong>Procedencia por píxel</strong> (máscara FLM del propio DEM). En la cara alta del K2 no hay medición TanDEM-X original: Copernicus rellenó los huecos del radar con otros modelos.</p>
      <table><thead><tr><th>Núcleo completo</th><th></th></tr></thead><tbody>${pct(m.procedencia.nucleo)}</tbody></table>
      <table><thead><tr><th>Por encima de 7 000 m</th><th></th></tr></thead><tbody>${pct(m.procedencia.nucleoSobre7000m)}</tbody></table>
      <p><strong>Cumbre.</strong> El píxel más alto del DEM mide ${formatMeters(c.pixelMaximoDEM.altura)} y está a ${formatMeters(c.distanciaACoordenadaPublicada)} de la coordenada publicada (${formatDegrees(c.coordenadaPublicada.lat, 'N', 'S')}, ${formatDegrees(c.coordenadaPublicada.lon, 'E', 'O')}). Se aplicó una <strong>corrección local reconstruida</strong> de +${c.correccion.incrementoMaximo.toString().replace('.', ',')} m en el ápice, con perfil ${c.correccion.perfil} y radio ${c.correccion.radio} m, para que el modelo alcance la altitud convencional de 8 611 m sin reescalar el resto (la medición GNSS de 2014 dio 8 609,02 m). Actívala en «Procedencia del relieve».</p>
      <h3>Imagen</h3>
      <p><strong>Sentinel-2 L2A</strong>, escena ${m.imagen.escena} (${m.imagen.fecha.slice(0, 10)}, sol a ${m.imagen.solElevacion.toFixed(1).replace('.', ',')}° de elevación). ${m.imagen.metodo} ${m.imagen.atribucion} La textura muestra el estado de agosto de 2024: el hielo y la nieve cambian cada temporada.</p>
      <h3>Sistema de coordenadas</h3>
      <p>${m.sistema.descripcion} CRS: <code>${m.sistema.crs}</code>. ${m.sistema.nota} Escala horizontal y vertical 1:1 (sin exageración).</p>
      <h3>Rutas</h3>
      <p>No existen GPX públicos fiables. Los tramos son <strong>reconstrucciones</strong>: caminos de mínimo coste sobre el DEM que favorecen la cresta de cada espolón entre puntos de control leídos en curvas de nivel e imagen, y una polilínea guiada por las descripciones en el sector cimero. El tramo común se almacena una sola vez.</p>
      <table><thead><tr><th>Tramo</th><th>Método</th><th>Certeza</th><th>Longitud</th></tr></thead><tbody>${segRows}</tbody></table>
      <h3>Puntos de interés</h3>
      <p>Los campamentos se colocan sobre su ruta en el punto donde el modelo alcanza la altitud documentada; las altitudes cambian entre expediciones y años. Bottleneck, travesía y serac son reconstrucciones a partir de descripciones; el DEM de 25–30 m no resuelve su forma y la malla del serac es esquemática.</p>
      <table><thead><tr><th>Punto</th><th>Altitud de referencia</th><th>Modelo</th><th>Certeza</th><th>Colocación</th></tr></thead><tbody>${poiRows}</tbody></table>
      <h3>Referencias</h3>
      <ul>${[...refs.values()].map((r) => `<li><a href="${r.url}" target="_blank" rel="noopener">${r.titulo}</a> — ${r.editor}. <span class="muted">${r.uso}</span></li>`).join('')}</ul>
      <h3>Uso</h3>
      <p>Atlas divulgativo: no sirve para navegar ni planificar una ascensión.</p>
      <h3>Límites conocidos</h3>
      <ul>
        <li>La forma del Bottleneck, el serac y la travesía no está medida; su posición relativa sí sigue las fuentes.</li>
        <li>El relieve cimero procede de rellenos AW3D30/ASTER/SRTM (errores verticales de decenas de metros posibles).</li>
        <li>Se omite la arista norte (vía china) por falta de datos verificables de su trazado y campos.</li>
        <li>Sin curvatura terrestre ni refracción; niebla y cielo son ambientales, no meteorológicos.</li>
      </ul>`;
    $('open-sources').addEventListener('click', () => this.openDialog('dlg-sources'));
    $('open-help').addEventListener('click', () => this.openDialog('dlg-help'));
  }

  private openDialog(id: string): void {
    const d = $<HTMLDialogElement>(id);
    this.lastFocus = document.activeElement as HTMLElement;
    d.showModal();
    d.addEventListener('close', () => this.lastFocus?.focus(), { once: true });
  }

  private bindHud(): void {
    $('zoom-in').addEventListener('click', () => this.actions.zoom(0.62));
    $('zoom-out').addEventListener('click', () => this.actions.zoom(1.6));
    $('reset').addEventListener('click', () => this.actions.resetView());
    $('compass').addEventListener('click', () => this.actions.orientNorth());
    const ar = $('autorotate');
    ar.addEventListener('click', () => {
      const on = ar.getAttribute('aria-pressed') !== 'true';
      this.setAutoRotate(on);
      this.actions.setAutoRotate(on);
    });
  }

  disableAutoRotate(reason: string): void {
    const ar = $<HTMLButtonElement>('autorotate');
    ar.disabled = true;
    ar.title = reason;
    ar.setAttribute('aria-label', `Rotación automática. ${reason}`);
  }

  setAutoRotate(on: boolean): void {
    const ar = $('autorotate');
    ar.setAttribute('aria-pressed', String(on));
    ar.setAttribute('aria-label', on ? 'Pausar la rotación automática' : 'Rotación automática (desactivada)');
  }

  private bindPanel(): void {
    const panel = $('panel');
    const t = $('panel-toggle');
    t.addEventListener('click', () => {
      const open = !panel.classList.contains('is-open');
      panel.classList.toggle('is-open', open);
      t.setAttribute('aria-expanded', String(open));
    });
  }

  collapsePanelOnMobile(): void {
    if (matchMedia('(max-width: 760px)').matches) {
      $('panel').classList.remove('is-open');
      $('panel-toggle').setAttribute('aria-expanded', 'false');
    }
  }

  private bindCard(): void {
    $('card-close').addEventListener('click', () => this.actions.selectPoi(null));
    $('card-focus').addEventListener('click', () => this.selected && this.actions.focusPoi(this.selected));
  }

  private bindKeys(): void {
    const canvas = $('scene');
    canvas.addEventListener('keydown', (e) => {
      const k = e.key;
      const step = e.shiftKey ? 30 : 12;
      if (k === 'ArrowLeft') this.actions.orbit(-step, 0);
      else if (k === 'ArrowRight') this.actions.orbit(step, 0);
      else if (k === 'ArrowUp') this.actions.orbit(0, -6);
      else if (k === 'ArrowDown') this.actions.orbit(0, 6);
      else if (k === '+' || k === '=') this.actions.zoom(0.7);
      else if (k === '-' || k === '_') this.actions.zoom(1.45);
      else if (k === 'r' || k === 'R') this.actions.resetView();
      else return;
      e.preventDefault();
    });
    window.addEventListener('keydown', (e) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'Escape' && this.selected && !document.querySelector('dialog[open]')) this.actions.selectPoi(null);
      if ((e.key === 'd' || e.key === 'D') && !e.metaKey && !e.ctrlKey) this.actions.toggleDiagnostics();
    });
  }

  showPoi(p: Poi | null, ghost = false): void {
    this.selected = p?.id ?? null;
    const card = $('poi-card');
    document.querySelectorAll<HTMLButtonElement>('.poi-item').forEach((b) => b.setAttribute('aria-current', String(b.dataset.id === this.selected)));
    if (!p) {
      card.hidden = true;
      this.lastFocus?.focus?.();
      return;
    }
    $('card-kicker').innerHTML = `${CATEGORY_LABEL[p.categoria]} <span class="badge badge--${p.certeza}">${CERTAINTY_LABEL[p.certeza]}</span>`;
    $('card-title').textContent = p.nombre + (p.nombreIngles && p.nombreIngles !== p.nombre ? ` · ${p.nombreIngles}` : '');
    $('card-alt').textContent = p.altitudRef ? formatAltitudeRef(p.altitudRef) : '';
    $('card-desc').textContent = p.descripcion + (ghost ? ' (Ahora mismo queda detrás del relieve.)' : '');
    const refs = p.refs.map((r) => this.data.pois.referencias.find((x) => x.id === r)?.editor).filter(Boolean);
    $('card-meta').textContent =
      `${formatDegrees(p.geo.lat, 'N', 'S')} · ${formatDegrees(p.geo.lon, 'E', 'O')} · modelo ${formatMeters(p.posicion.altModelo)}` +
      (refs.length ? ` · Fuentes: ${[...new Set(refs)].join('; ')}` : '');
    card.hidden = false;
  }

  /** Rota la brújula para que su N apunte al norte geográfico del modelo. */
  setCompass(bearingDeg: number): void {
    const rose = document.getElementById('compass-rose');
    if (rose) rose.style.transform = `rotate(${-bearingDeg}deg)`;
  }
}
