/**
 * Arranque: comprobación de WebGL, carga con progreso real, construcción del
 * terreno en un worker, compilación de sombreadores y estados de error/reintento.
 */
import './styles.css';
import * as THREE from 'three';
import { loadAtlas, type RawAssets } from './data/loader.ts';
import { validateAtlas } from './data/validate.ts';
import type { BuildRequest, BuildResult, WorkerMessage } from './terrain/protocol.ts';
import type { AtlasData } from './data/types.ts';
import type { ProfileId } from './quality/auto.ts';
import { App } from './app.ts';
import { Ui, type UiActions } from './ui/ui.ts';

declare global {
  interface Window {
    __k2?: { app?: App; ready: boolean; error?: string; timings: Record<string, number> };
  }
}

const params = new URLSearchParams(location.search);
const $ = (id: string) => document.getElementById(id)!;
const timings: Record<string, number> = {};
window.__k2 = { ready: false, timings };

/** Pesos de cada etapa en la barra (suman 1): descarga, relieve, sombreadores. */
const STAGES = { datos: 0.72, relieve: 0.22, escena: 0.06 };

function setProgress(fraction: number, text: string): void {
  const pct = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
  ($('bar-fill') as HTMLElement).style.width = `${pct}%`;
  $('loading').querySelector('.bar')!.setAttribute('aria-valuenow', String(pct));
  $('loading-stage').textContent = text;
}

function showError(msg: string, retry: boolean): void {
  $('loading-error').hidden = false;
  $('loading-error-text').textContent = msg;
  ($('retry') as HTMLButtonElement).hidden = !retry;
  $('loading').querySelector('.bar')!.setAttribute('aria-valuenow', '0');
  window.__k2!.error = msg;
}

function createRenderer(canvas: HTMLCanvasElement, antialias: boolean): THREE.WebGLRenderer | null {
  try {
    const r = new THREE.WebGLRenderer({ canvas, antialias, powerPreference: 'high-performance', alpha: false, stencil: false });
    if (!r.capabilities.isWebGL2) {
      r.dispose();
      return null;
    }
    return r;
  } catch {
    return null;
  }
}

function gpuName(r: THREE.WebGLRenderer): string {
  const gl = r.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
}

/** Perfil inicial por capacidades; después manda el tiempo de fotograma medido. */
function initialProfile(r: THREE.WebGLRenderer): ProfileId {
  const forced = params.get('q');
  if (forced === 'baja' || forced === 'media' || forced === 'alta') return forced;
  const gpu = gpuName(r).toLowerCase();
  if (/swiftshader|llvmpipe|software|basic render|mesa offscreen/.test(gpu)) return 'baja';
  const coarse = matchMedia('(pointer: coarse)').matches;
  const small = Math.min(screen.width, screen.height) < 820;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  if (coarse && small) return mem >= 6 ? 'media' : 'baja';
  if (r.capabilities.maxTextureSize < 8192) return 'media';
  return 'alta';
}

function buildTerrain(assets: RawAssets): Promise<BuildResult> {
  const m = assets.data.manifest;
  const req: BuildRequest = {
    type: 'build',
    h0: m.sistema.h0,
    heightOffset: m.alturas.offset,
    heightScale: m.alturas.escala,
    dilationRadius: 75,
    rings: [
      { name: 'core', n: m.rejillas.core.muestras, spacing: m.rejillas.core.espaciado, half: m.rejillas.core.semilado, chunksPerSide: 6, steps: [1, 2, 4, 8], parents: true },
      { name: 'context', n: m.rejillas.context.muestras, spacing: m.rejillas.context.espaciado, half: m.rejillas.context.semilado, chunksPerSide: 6, steps: [1, 2, 4, 8], skipInnerHalf: m.rejillas.core.semilado, parents: true },
      { name: 'far', n: m.rejillas.far.muestras, spacing: m.rejillas.far.espaciado, half: m.rejillas.far.semilado, chunksPerSide: 5, steps: [1, 2], skipInnerHalf: m.rejillas.context.semilado },
    ],
    files: { heights: assets.heights, masks: assets.masks, aux: assets.aux },
  };
  const viaWorker = new Promise<BuildResult>((resolve, reject) => {
    let w: Worker;
    try {
      w = new Worker(new URL('./terrain/terrain.worker.ts', import.meta.url), { type: 'module' });
    } catch (e) {
      reject(e);
      return;
    }
    w.onmessage = (ev: MessageEvent<WorkerMessage>) => {
      const msg = ev.data;
      if (msg.type === 'progress') setProgress(STAGES.datos + STAGES.relieve * msg.fraction, 'Preparando el relieve (mallas y normales)…');
      else if (msg.type === 'error') {
        w.terminate();
        reject(new Error(msg.message));
      } else {
        w.terminate();
        resolve(msg);
      }
    };
    w.onerror = (e) => {
      e.preventDefault?.();
      w.terminate();
      reject(new Error(e.message || 'el worker del terreno no pudo iniciarse'));
    };
    // los buffers se copian (no se transfieren) para poder reintentar con los mismos datos
    w.postMessage(req);
  });
  return viaWorker.catch(async (err) => {
    // Alternativa: algunos entornos (políticas CSP, navegadores antiguos) no permiten
    // workers de módulo. Se construye en el hilo principal con el mismo código.
    console.warn('Worker no disponible; se prepara el relieve en el hilo principal:', err);
    timings.sinWorker = 1;
    setProgress(STAGES.datos, 'Preparando el relieve en el hilo principal…');
    await new Promise((r) => setTimeout(r, 30));
    const { buildTerrainData } = await import('./terrain/buildAll.ts');
    return buildTerrainData(req, (_s, f) => setProgress(STAGES.datos + STAGES.relieve * f, 'Preparando el relieve…'));
  });
}

/** Sin WebGL: la información principal sigue disponible como HTML. */
async function fallbackWithoutWebGL(): Promise<void> {
  showError('Este navegador o dispositivo no ofrece WebGL 2, necesario para la vista 3D. La lista de puntos y las fuentes siguen disponibles en el panel.', false);
  try {
    const base = `${import.meta.env.BASE_URL}data/`;
    const get = async <T,>(f: string) => (await (await fetch(base + f)).json()) as T;
    const manifest = await get<AtlasData['manifest']>('manifest.json');
    const data: AtlasData = { manifest, routes: await get('routes.json'), pois: await get('pois.json'), serac: await get('serac.json') };
    const noop = () => {};
    const holder: { ui?: Ui } = {};
    const actions: UiActions = {
      setRoutesMaster: noop, setRoute: noop, setHighlight: noop, setLabels: noop, setCamps: noop, setDeathZone: noop,
      setDemOverlay: noop, setLight: noop, goToView: noop, resetView: noop, focusPoi: noop, setQuality: noop, zoom: noop,
      orientNorth: noop, setAutoRotate: noop, orbit: noop, toggleDiagnostics: noop,
      selectPoi: (id) => holder.ui?.showPoi(id ? data.pois.poi.find((p) => p.id === id) ?? null : null),
    };
    holder.ui = new Ui(data, actions);
    $('loading').classList.add('is-done');
    const card = $('poi-card');
    card.insertAdjacentHTML('beforebegin', '<p class="brand__meta" style="position:absolute;left:16px;top:64px;max-width:52ch;color:#f0b3ae">Vista 3D no disponible: este navegador no ofrece WebGL 2.</p>');
    ($('card-focus') as HTMLButtonElement).hidden = true;
  } catch {
    /* sin datos ni WebGL: queda el mensaje */
  }
}

let app: App | null = null;

async function start(): Promise<void> {
  $('loading-error').hidden = true;
  $('loading').classList.remove('is-done');
  setProgress(0, 'Comprobando WebGL…');
  const canvas = $('scene') as HTMLCanvasElement;
  const coarse = matchMedia('(pointer: coarse)').matches;
  // MSAA: activado en escritorio; en pantallas táctiles de alta densidad el DPR ya suaviza bordes.
  // ?aa=0 / ?aa=1 lo fuerzan (útil para medir o para equipos muy modestos).
  const aa = params.get('aa');
  const renderer = createRenderer(canvas, aa === '0' ? false : aa === '1' ? true : !coarse || window.devicePixelRatio < 2);
  if (!renderer) {
    await fallbackWithoutWebGL();
    return;
  }
  const t0 = performance.now();
  try {
    const assets = await loadAtlas(`${import.meta.env.BASE_URL}data/`, (loaded, total, label) => {
      setProgress(STAGES.datos * (loaded / total), `Descargando datos (${(loaded / 1048576).toFixed(1)} de ${(total / 1048576).toFixed(1)} MB) · ${label}`);
    });
    timings.descarga = performance.now() - t0;
    const v = validateAtlas(assets.data);
    if (v.errors.length) throw new Error(`Datos no válidos: ${v.errors.slice(0, 3).join('; ')}`);
    const t1 = performance.now();
    const build = await buildTerrain(assets);
    timings.relieve = performance.now() - t1;
    setProgress(STAGES.datos + STAGES.relieve, 'Creando la escena y compilando sombreadores…');
    const t2 = performance.now();
    app = new App({
      canvas,
      renderer,
      data: assets.data,
      build,
      albedo: assets.albedo,
      initialProfile: initialProfile(renderer),
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      diagnostics: params.get('diag') === '1',
      bytesLoaded: assets.bytes,
    });
    if (params.get('lod') === '1') app.setLodDebug(true);
    // precompila los shaders; sin KHR_parallel_shader_compile, compileAsync solo añade un aviso
    if (renderer.extensions.has('KHR_parallel_shader_compile')) await renderer.compileAsync(app.scene, app.camera);
    else renderer.compile(app.scene, app.camera);
    timings.escena = performance.now() - t2;
    timings.total = performance.now() - t0;
    setProgress(1, 'Listo');
    app.request();
    requestAnimationFrame(() => $('loading').classList.add('is-done'));
    window.__k2 = { app, ready: true, timings };
  } catch (e) {
    console.error(e);
    app?.dispose();
    app = null;
    renderer.dispose();
    showError(e instanceof Error ? e.message : String(e), true);
  }
}

// Enlace al informe de entrega cuando la build se publica junto a él (VITE_INFORME_URL)
const informe = import.meta.env.VITE_INFORME_URL as string | undefined;
if (informe) {
  const a = $('report-link') as HTMLAnchorElement;
  a.href = informe;
  a.hidden = false;
}

($('retry') as HTMLButtonElement).addEventListener('click', () => void start());
window.addEventListener('pagehide', () => app?.dispose());
void start();
