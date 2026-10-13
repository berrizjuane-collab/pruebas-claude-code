/**
 * Elementos del HUD: identificación, perspectivas, barra de herramientas, avisos y leyenda.
 */
import { createContext, useContext, useEffect, useState } from 'react';
import { Atom, Camera, FlaskConical, Info, Layers, Settings2 } from 'lucide-react';
import { store, useApp, type PanelId, type View } from '../app/store';
import type { Observatory } from '../app/Observatory';
import { Segmented, Tip } from './components';
import { dist, duration, fmt, sci } from './format';
import { blackHoleScales, OBSERVATIONS } from '../physics/sgra';
import { DIAGRAM_COLORS } from '../rendering/overlay/Overlay';

export const ObsContext = createContext<Observatory | null>(null);
export function useObs(): Observatory {
  const o = useContext(ObsContext);
  if (!o) throw new Error('Observatorio no inicializado');
  return o;
}

const OBS_NAMES: Record<string, string> = {
  static: 'estático',
  zamo: 'ZAMO',
  circular: 'en órbita',
  rain: 'en caída libre',
  dive: 'en caída libre (geodésica)',
  comoving: 'comóvil con el objeto',
};

export function Identity() {
  const s = useApp((x) => ({ m: x.massSolar, d: x.distanceKpc, a: x.spin, units: x.units, r: x.live.camR, obs: x.live.camObserver, profile: x.profile, view: x.view, inside: x.live.camInside, diving: x.live.diving, tau: x.live.camTau, diveInfo: x.live.diveInfo }));
  const sc = blackHoleScales(s.m, s.d);
  const mode = s.view === 'object' ? 'Marco del objeto' : s.view === 'diagram' ? 'Diagrama' : s.profile === 'eht' ? 'Sintético EHT · 230 GHz' : s.profile === 'spacetime' ? 'Espacio-tiempo' : 'Cinematográfico';
  return (
    <div className="ident">
      <h1>
        SAGITTARIUS A<sup>*</sup>
      </h1>
      <div className="sub">Galactic Center · Relativistic Observatory</div>
      <dl>
        <dt>Masa</dt>
        <dd>
          <Tip text="Masa del agujero negro. Determina todas las escalas: r_g = GM/c², t_g = GM/c³.">{sci(s.m, 2)} M☉</Tip>
        </dd>
        <dt>Espín</dt>
        <dd>
          <Tip text="Espín adimensional a* = J c/(G M²). No está medido para Sgr A*: es una hipótesis de modelado ajustable (Física).">a* = {fmt(s.a, 3)}</Tip>
          <span className="hyp">hipótesis</span>
        </dd>
        <dt>Cámara</dt>
        <dd>
          r = {dist(s.r, s.units, sc, s.r < 10 ? 2 : 1)}
          {s.inside ? ' · dentro de r₊' : ''}
        </dd>
        <dt>Observador</dt>
        <dd>{OBS_NAMES[s.obs] ?? s.obs}</dd>
        {s.diving && (
          <>
            <dt>τ cámara</dt>
            <dd>
              {duration(s.tau)} · {s.diveInfo}
            </dd>
          </>
        )}
        <dt>Modo</dt>
        <dd>{mode}</dd>
      </dl>
    </div>
  );
}

const VIEW_CAPTION: Record<View, string> = {
  exterior: 'Lo que ve la cámara: fotones integrados hacia el pasado por geodésicas nulas. Las líneas finas son diagrama (coordenadas), no luz.',
  object: 'Desde el propio objeto: tiempo propio, marco giroscópico y cielo trazado desde su posición y velocidad. El horizonte no es una superficie.',
  diagram: 'Diagrama matemático de la trayectoria calculada: aquí sí se ve el cruce del horizonte, que ninguna cámara exterior puede recibir.',
};

export function ViewSwitch() {
  const view = useApp((s) => s.view);
  const band = useApp((s) => s.objectBand);
  const hasObj = useApp((s) => !!s.followExperiment && s.experiments.some((e) => e.id === s.followExperiment && (e.object !== 'nube' && e.object !== 'fotones')));
  return (
    <div className="views">
      <Segmented<View>
        value={view}
        label="Perspectiva"
        onChange={(v) => store.set({ view: v })}
        options={[
          { value: 'exterior', label: 'A · Exterior', title: 'Perspectiva A · cámara exterior (tecla 1)' },
          { value: 'object', label: 'B · Objeto', title: 'Perspectiva B · marco propio del objeto (tecla 2): requiere un cuerpo lanzado', disabled: !hasObj },
          { value: 'diagram', label: 'C · Diagrama', title: 'Perspectiva C · diagrama del espacio-tiempo (tecla 3)' },
        ]}
      />
      <div className="caption">{VIEW_CAPTION[view]}</div>
      {view === 'object' && (
        <div className="band">
          <Segmented<'optico' | 'mm'>
            small
            value={band}
            label="Banda de la cámara del objeto"
            onChange={(objectBand) => store.set({ objectBand })}
            options={[
              { value: 'optico', label: 'Óptico', title: 'Luz visible: el plasma de Sgr A* es transparente y casi no emite; se ven la sombra y el cielo con lente.' },
              { value: 'mm', label: 'Milimétrico', title: '86–690 GHz: dentro del flujo de acreción la cámara está inmersa en plasma que brilla en todas direcciones.' },
            ]}
          />
          <span className="note">{band === 'optico' ? 'En óptico el flujo de acreción es transparente y casi no emite: se ven la sombra y las estrellas con lente.' : 'En milimétrico la cámara está dentro del plasma emisor: brillo en casi todas direcciones.'}</span>
        </div>
      )}
    </div>
  );
}

const TOOLS: Array<{ id: PanelId; label: string; icon: typeof Atom; key?: string }> = [
  { id: 'fisica', label: 'Física', icon: Atom },
  { id: 'camara', label: 'Cámara', icon: Camera },
  { id: 'visualizacion', label: 'Visualización', icon: Layers },
  { id: 'info', label: 'Información', icon: Info },
  { id: 'ajustes', label: 'Ajustes', icon: Settings2 },
];

export function Toolbar() {
  const panel = useApp((s) => s.panel);
  const research = useApp((s) => s.research);
  return (
    <nav className="toolbar glass" aria-label="Paneles">
      {TOOLS.map((t) => (
        <button key={t.id} className={panel === t.id ? 'on' : ''} onClick={() => store.set({ panel: panel === t.id ? null : t.id })} aria-pressed={panel === t.id} aria-label={t.label} title={t.label}>
          <t.icon aria-hidden />
          <span className="lbl">{t.label}</span>
        </button>
      ))}
      <span className="sep" />
      <button
        className={research ? 'on' : ''}
        onClick={() => store.set({ research: !research, panel: !research ? 'investigacion' : panel === 'investigacion' ? null : panel })}
        aria-pressed={research}
        title="Research Mode (I)"
        aria-label="Research Mode"
      >
        <FlaskConical aria-hidden />
        <span className="lbl">Research</span>
      </button>
    </nav>
  );
}

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast glass ${t.kind}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function Busy() {
  const busy = useApp((s) => s.busy);
  if (!busy) return null;
  return (
    <div className="busy">
      <span className="spinner" />
      {busy}
    </div>
  );
}

export function DiagramLegend() {
  const o = useApp((s) => s.overlay);
  const view = useApp((s) => s.view);
  const nExp = useApp((s) => s.experiments.length);
  if (view !== 'exterior') return null;
  const items: Array<[string, string, boolean]> = [
    ['Trayectoria calculada (coordenadas KS)', '#e3a54a', o.trajectories && nExp > 0],
    ['Horizonte de sucesos r₊', DIAGRAM_COLORS.horizon, o.horizon],
    ['Ergosfera (límite estático)', DIAGRAM_COLORS.ergo, o.ergosphere],
    ['ISCO prógrada / retrógrada', DIAGRAM_COLORS.isco, o.isco],
    ['Órbitas fotónicas ecuatoriales', DIAGRAM_COLORS.photonOrbit, o.photonOrbits],
    ['Geodésicas nulas', DIAGRAM_COLORS.photon, o.geoPhotons],
    ['Geodésicas casi críticas', DIAGRAM_COLORS.critical, o.geoCritical],
    ['Geodésicas masivas', DIAGRAM_COLORS.massive, o.geoMassive],
    ['Capturas', DIAGRAM_COLORS.capture, o.geoCapture],
    ['Conos de luz (fuera / dentro de r₊)', DIAGRAM_COLORS.cone, o.lightCones],
    ['Diagrama de incrustación', DIAGRAM_COLORS.embed, o.embedding],
  ];
  const shown = items.filter((i) => i[2]);
  if (!shown.length) return null;
  return (
    <div className="legend glass">
      <span className="tag">Diagrama · no es luz</span>
      {shown.map(([l, c]) => (
        <div className="item" key={l}>
          <span className="sw" style={{ background: c }} />
          {l}
        </div>
      ))}
    </div>
  );
}

/** Perfil EHT: rótulo de imagen sintética, barra de escala angular y magnitudes medidas. */
export function EhtInfo() {
  const s = useApp((x) => ({ profile: x.profile, view: x.view, fovM: x.ehtFovM, m: x.massSolar, d: x.distanceKpc, flux: x.live.ehtFluxJy, ring: x.live.ehtRingMuas, beam: x.ehtBeam, fwhm: x.beamFwhmMuas }));
  const [h, setH] = useState(() => window.innerHeight);
  useEffect(() => {
    const f = () => setH(window.innerHeight);
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, []);
  if (s.profile !== 'eht' || s.view !== 'exterior') return null;
  const sc = blackHoleScales(s.m, s.d);
  // La altura de la imagen abarca 2·campo r_g en el plano del cielo: θ = b·θ_g
  const muasPerPx = (2 * s.fovM * sc.thetaGMuas) / h;
  const bar = 50;
  const ring = OBSERVATIONS.ehtRingDiameterMuas;
  const flux = OBSERVATIONS.flux230GHzJy;
  return (
    <>
      <div className="synthetic">Imagen sintética · 230 GHz · no es una observación</div>
      <div className="scalebar">
        <div className="bar" style={{ width: `${bar / muasPerPx}px` }} />
        <span>{bar} μas</span>
        <span className="eht-metrics">
          F₂₃₀ = {s.flux !== null ? `${fmt(s.flux, 2)} Jy` : '…'} (obs. {fmt(flux.value, 1)} Jy) · anillo ≈ {s.ring !== null ? `${fmt(s.ring, 1)} μas` : '…'} (EHT {fmt(ring.value, 1)} ± {fmt(ring.sigma, 1)} μas)
          {s.beam ? ` · haz ${fmt(s.fwhm, 0)} μas` : ''}
        </span>
      </div>
    </>
  );
}
