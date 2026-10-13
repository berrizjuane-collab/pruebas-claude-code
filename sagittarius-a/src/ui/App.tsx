/**
 * Raíz de la aplicación: crea el observatorio (motor de render + trabajador de física + capas),
 * conecta ratón, teclado y gestos táctiles, y dispone el HUD del observatorio:
 *
 *   arriba a la izquierda  identificación (masa, espín, radio de la cámara, modo)
 *   arriba al centro       perspectivas A/B/C
 *   arriba a la derecha    Física · Cámara · Visualización · Información · Ajustes · Research
 *   abajo al centro        catálogo de objetos, escenario, ARROJAR, pausa, reinicio
 *   abajo a la izquierda   telemetría del objeto seleccionado
 *   abajo a la derecha     control del tiempo
 */
import { useEffect, useRef, useState } from 'react';
import { Observatory } from '../app/Observatory';
import { bindInput, type InputActions, type NavTarget } from '../app/input';
import { store, toast, useApp, type PanelId, type View } from '../app/store';
import { Busy, DiagramLegend, EhtInfo, Identity, ObsContext, Toasts, Toolbar, ViewSwitch } from './hud';
import { Panels } from './panels';
import { LaunchBar, cycleObject } from './LaunchBar';
import { Telemetry, TimeControls } from './Telemetry';
import { DiagramView } from './DiagramView';

declare global {
  interface Window {
    /** Acceso para los guiones de validación, capturas y rendimiento (Playwright). */
    __obs?: Observatory;
    __store?: typeof store;
  }
}

/**
 * Parámetros de URL para pruebas, capturas y enlaces: ?escala=0.4&perfil=eht&calidad=high&ui=0&intro=0&deriva=0
 * (escala de render fija, perfil, calidad, interfaz oculta, sin fundido inicial, sin deriva de la cámara).
 */
function applyUrlParams(): { drift: boolean } {
  const q = new URLSearchParams(window.location.search);
  const patch: Partial<ReturnType<typeof store.get>> = {};
  const esc = Number(q.get('escala'));
  if (esc > 0 && esc <= 1) patch.fixedScale = esc;
  const perfil = q.get('perfil');
  if (perfil === 'cinematic' || perfil === 'eht' || perfil === 'spacetime') patch.profile = perfil;
  const calidad = q.get('calidad');
  if (calidad === 'interactive' || calidad === 'high') patch.quality = calidad;
  if (q.get('ui') === '0') patch.uiHidden = true;
  if (q.get('intro') === '0') patch.introDone = true;
  store.set(patch);
  return { drift: q.get('deriva') !== '0' };
}

function canUseObjectView(): boolean {
  const s = store.get();
  const f = s.experiments.find((e) => e.id === s.followExperiment);
  return !!f && f.object !== 'nube' && f.object !== 'fotones';
}

function makeActions(o: Observatory): InputActions {
  const nav = o.engine.nav;
  return {
    togglePause: () => store.set((s) => ({ running: !s.running })),
    resetCamera: () => {
      if (store.get().view === 'object') {
        o.resetLocalView();
        return;
      }
      if (o.engine.relCam.dive) o.engine.endDive();
      store.set({ navMode: 'orbit' });
      nav.reset();
    },
    toggleFollow: () => {
      const s = store.get();
      if (s.navMode === 'follow') {
        store.set({ navMode: 'orbit' });
        return;
      }
      const id = s.followExperiment ?? s.selectedExperiment;
      if (!id) {
        toast('Lanza un objeto con ARROJAR para poder seguirlo con la cámara.', 'info');
        return;
      }
      store.set({ followExperiment: id, navMode: 'follow' });
    },
    toggleUi: () => store.set((s) => ({ uiHidden: !s.uiHidden })),
    throwObject: () => {
      o.launch();
    },
    cycleObject,
    focus: () => {
      store.set({ navMode: 'orbit' });
      nav.focusBlackHole();
    },
    togglePanel: (id) => {
      const s = store.get();
      if (id === 'investigacion') {
        const on = !(s.research && s.panel === 'investigacion');
        store.set({ research: on, panel: on ? 'investigacion' : null });
      } else store.set({ panel: s.panel === id ? null : (id as PanelId) });
    },
    setView: (v: View) => {
      if (v === 'object' && !canUseObjectView()) {
        toast('La perspectiva B necesita un cuerpo lanzado (no una nube ni un haz de fotones).', 'info');
        return;
      }
      store.set({ view: v });
    },
    escape: () => {
      const s = store.get();
      if (s.panel) store.set({ panel: null, research: s.panel === 'investigacion' ? false : s.research });
      else if (s.uiHidden) store.set({ uiHidden: false });
      else if (s.view !== 'exterior') store.set({ view: 'exterior' });
    },
    interacted: () => {
      nav.autoOrbit = 0;
    },
  };
}

/** La entrada mueve la cámara exterior o, en la perspectiva B, la cámara comóvil con el objeto. */
function makeNavTarget(o: Observatory): NavTarget {
  const nav = o.engine.nav;
  const local = () => store.get().view === 'object';
  return {
    rotate: (dx, dy) => (local() ? o.localView.rotate(dx, dy) : nav.rotate(dx, dy)),
    pan: (dx, dy) => {
      if (!local()) nav.pan(dx, dy);
    },
    zoom: (d) => (local() ? o.localView.zoom(d) : nav.zoom(d)),
    zoomFov: (d) => nav.zoomFov(d),
    setKeys: (move, boost) => {
      nav.keyMove = local() ? [0, 0, 0] : move;
      nav.boost = boost;
    },
  };
}

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [obs, setObs] = useState<Observatory | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const hidden = useApp((s) => s.uiHidden);
  const introDone = useApp((s) => s.introDone);
  const view = useApp((s) => s.view);

  useEffect(() => {
    const url = applyUrlParams();
    let o: Observatory;
    try {
      o = new Observatory(canvasRef.current!, rootRef.current!);
    } catch (e) {
      // Sin WebGL 2 no hay trazador: se informa en lugar de mostrar una página vacía
      queueMicrotask(() => setFailure((e as Error).message || String(e)));
      return;
    }
    window.__obs = o;
    window.__store = store;
    o.engine.nav.autoOrbit = url.drift ? 0.012 : 0;
    const unbind = bindInput(canvasRef.current!, makeNavTarget(o), makeActions(o));
    o.engine.start();
    setObs(o);
    const intro = window.setTimeout(() => store.set({ introDone: true }), 1400);
    return () => {
      window.clearTimeout(intro);
      unbind();
      o.engine.stop();
    };
  }, []);

  return (
    <div ref={rootRef} className={`app view-${view}${introDone ? '' : ' intro'}`}>
      <canvas ref={canvasRef} className="stage" aria-label="Vista relativista de Sagittarius A*" />
      {failure && (
        <div className="fatal glass" role="alert">
          <h2>No se pudo iniciar el trazador relativista</h2>
          <p>Este observatorio integra geodésicas en la GPU y necesita WebGL 2 con texturas de coma flotante. Prueba con una versión reciente de Chrome, Edge, Firefox o Safari con la aceleración por hardware activada.</p>
          <p className="mono">{failure}</p>
        </div>
      )}
      {obs && (
        <ObsContext.Provider value={obs}>
          <div className={`hud${hidden ? ' hidden' : ''}`}>
            <Identity />
            <ViewSwitch />
            <Toolbar />
            <EhtInfo />
            <DiagramLegend />
            {view === 'diagram' && <DiagramView />}
            <Panels />
            <Telemetry />
            <LaunchBar />
            <TimeControls />
            <Toasts />
            <Busy />
          </div>
          {hidden && <div className="hint-hidden">H · mostrar interfaz</div>}
        </ObsContext.Provider>
      )}
    </div>
  );
}
