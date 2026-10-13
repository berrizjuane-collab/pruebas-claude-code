/**
 * Paneles laterales: Física, Cámara, Visualización (con SPACE-TIME GEOMETRY) y Ajustes.
 */
import { useState, type ReactNode } from 'react';
import { ArrowDownToLine, Crosshair, Download, Focus, RotateCcw, Upload, X } from 'lucide-react';
import { store, toast, useApp, type AppState, type OverlayToggles, type PanelId } from '../app/store';
import { useObs } from './hud';
import { Badge, NumberField, Row, Section, Segmented, Slider, Tip, Toggle } from './components';
import { dist, duration, fmt, sci } from './format';
import { blackHoleScales, MODEL_HYPOTHESES, OBSERVATIONS, PARAMETER_SETS } from '../physics/sgra';
import { criticalImpactParameter, ergosphereRadius, horizonAngularVelocity, horizons, iscoRadius, marginallyBoundRadius, photonOrbitRadius, surfaceGravity } from '../physics/metrics/kerr';
import { PC_SI } from '../physics/constants';
import { InfoPanel } from './InfoPanel';
import { ResearchPanel } from './ResearchPanel';
import type { CameraObserver } from '../camera/RelativisticCamera';

export function PanelFrame({ id, title, children, wide }: { id: PanelId; title: string; children: ReactNode; wide?: boolean }) {
  return (
    <aside className={`panel glass${wide ? ' wide' : ''}`} aria-label={title} onKeyDown={(e) => e.stopPropagation()}>
      <div className="panel-head">
        <h2>{title}</h2>
        <button onClick={() => store.set({ panel: null, research: id === 'investigacion' ? false : store.get().research })} aria-label="Cerrar panel">
          <X size={15} />
        </button>
      </div>
      <div className="panel-body">{children}</div>
    </aside>
  );
}

export function Panels() {
  const panel = useApp((s) => s.panel);
  switch (panel) {
    case 'fisica':
      return (
        <PanelFrame id="fisica" title="Física">
          <PhysicsPanel />
        </PanelFrame>
      );
    case 'camara':
      return (
        <PanelFrame id="camara" title="Cámara">
          <CameraPanel />
        </PanelFrame>
      );
    case 'visualizacion':
      return (
        <PanelFrame id="visualizacion" title="Visualización">
          <VisualPanel />
        </PanelFrame>
      );
    case 'info':
      return (
        <PanelFrame id="info" title="Información" wide>
          <InfoPanel />
        </PanelFrame>
      );
    case 'ajustes':
      return (
        <PanelFrame id="ajustes" title="Ajustes">
          <SettingsPanel />
        </PanelFrame>
      );
    case 'investigacion':
      return (
        <PanelFrame id="investigacion" title="Research Mode" wide>
          <ResearchPanel />
        </PanelFrame>
      );
    default:
      return null;
  }
}

const set = (p: Partial<AppState>) => store.set(p);

function PhysicsPanel() {
  const s = useApp((x) => ({ m: x.massSolar, d: x.distanceKpc, id: x.paramSetId, a: x.spin, units: x.units, turb: x.turbulence, hs: x.hotspot, riaf: x.riaf, nexp: x.experiments.length }));
  const sc = blackHoleScales(s.m, s.d);
  const { rPlus, rMinus } = horizons(s.a);
  const kappa = surfaceGravity(s.a);
  // Temperatura de Hawking T_H = ħ κ /(2π k_B t_g) con κ en unidades de 1/M (≈ 1,5×10⁻¹⁴ K para a = 0)
  const TH = (1.054571817e-34 * kappa) / (2 * Math.PI * 1.380649e-23 * sc.tg);
  const obsDist = sc.distance / PC_SI / 1e3;
  return (
    <>
      <Section title="Sagittarius A*" note="Masa y distancia publicadas; las magnitudes derivadas se recalculan al cambiarlas.">
        <select
          aria-label="Conjunto de parámetros"
          value={s.id}
          onChange={(e) => {
            const p = PARAMETER_SETS.find((q) => q.id === e.target.value)!;
            set({ paramSetId: p.id, massSolar: p.massSolar, distanceKpc: p.distanceKpc });
          }}
        >
          {PARAMETER_SETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <p className="note">{PARAMETER_SETS.find((p) => p.id === s.id)?.source}</p>
        <Row label="Masa M">{sci(s.m, 3)} M☉</Row>
        <Row label="Distancia D">{fmt(obsDist, 3)} kpc</Row>
        <Row label="Radio gravitacional r_g" tip="r_g = GM/c²: la unidad de longitud de la simulación.">
          {fmt(sc.rg / 1e9, 3)} × 10⁶ km
        </Row>
        <Row label="Radio de Schwarzschild r_s" tip="r_s = 2GM/c²: radio del horizonte si a* = 0. No es el tamaño de la sombra.">
          {fmt(sc.rs / 1e9, 3)} × 10⁶ km
        </Row>
        <Row label="Tiempo gravitacional t_g" tip="t_g = GM/c³: la unidad de tiempo (1 M).">
          {fmt(sc.tg, 2)} s
        </Row>
        <Row label="Escala angular θ_g = r_g/D" tip="Ángulo que subtiende r_g visto desde la Tierra.">
          {fmt(sc.thetaGMuas, 3)} μas
        </Row>
      </Section>
      <Section title="Espín (hipótesis de modelado)" note={MODEL_HYPOTHESES.spinNote}>
        <Slider label="a* = J c / G M²" value={s.a} min={0} max={0.998} step={0.001} onChange={(a) => set({ spin: a })} format={(x) => fmt(x, 3)} tip="0 = Schwarzschild. 0,998 = límite de Thorne para agujeros que acretan." />
        <Segmented
          small
          value={[0, 0.5, 0.9, 0.998].includes(s.a) ? String(s.a) : 'x'}
          onChange={(v) => v !== 'x' && set({ spin: Number(v) })}
          options={[
            { value: '0', label: 'Schwarzschild' },
            { value: '0.5', label: '0,5' },
            { value: '0.9', label: '0,9' },
            { value: '0.998', label: '0,998' },
            ...(![0, 0.5, 0.9, 0.998].includes(s.a) ? [{ value: 'x', label: fmt(s.a, 3) }] : []),
          ]}
        />
        {s.nexp > 0 && <p className="note">Los experimentos ya lanzados conservan la métrica con la que se calcularon (se comparan en el diagrama y en Research; la vista óptica solo traza los de la métrica actual).</p>}
      </Section>
      <Section title="Radios característicos" note="Calculados analíticamente para el espín actual (Bardeen, Press & Teukolsky 1972). En el plano ecuatorial salvo indicación.">
        <Row label="Horizonte exterior r₊" tip="r₊ = M + √(M² − a²). Frontera causal: nada que lo cruce hacia dentro vuelve a salir.">
          {dist(rPlus, s.units, sc, 3)}
        </Row>
        <Row label="Horizonte interior r₋" tip="Horizonte de Cauchy: la simulación termina ahí (inestabilidad de inflación de masa).">
          {dist(rMinus, s.units, sc, 3)}
        </Row>
        <Row label="Ergosfera (ecuador / polo)" tip="Límite estático r_E(θ) = M + √(M² − a² cos²θ): dentro, nada puede permanecer en reposo.">
          {fmt(ergosphereRadius(s.a, Math.PI / 2), 3)} / {fmt(ergosphereRadius(s.a, 0), 3)} r_g
        </Row>
        <Row label="Órbita fotónica prógrada / retrógrada">
          {fmt(photonOrbitRadius(s.a, true), 3)} / {fmt(photonOrbitRadius(s.a, false), 3)} r_g
        </Row>
        <Row label="ISCO prógrada / retrógrada" tip="Órbita circular estable más interna.">
          {fmt(iscoRadius(s.a, true), 3)} / {fmt(iscoRadius(s.a, false), 3)} r_g
        </Row>
        <Row label="Marginalmente ligada (E = 1)">
          {fmt(marginallyBoundRadius(s.a, true), 3)} / {fmt(marginallyBoundRadius(s.a, false), 3)} r_g
        </Row>
        <Row label="b crítico de fotones (pro / retro)" tip="Parámetro de impacto bajo el cual un fotón ecuatorial es capturado.">
          {fmt(criticalImpactParameter(s.a, true), 3)} / {fmt(criticalImpactParameter(s.a, false), 3)} r_g
        </Row>
        <Row label="Ω del horizonte" tip="Velocidad angular de rotación del horizonte (arrastre de marcos).">
          {sci(horizonAngularVelocity(s.a) / sc.tg, 3)} rad/s
        </Row>
        <Row label="Temperatura de Hawking" tip="Efecto cuántico, no simulado: se muestra solo como escala.">
          {sci(TH, 2)} K
        </Row>
      </Section>
      <Section title="Flujo de acreción (modelo RIAF parametrizado)" defaultOpen={false} note="Modelo semianalítico, no una simulación GRMHD. Calibrado con T₀ = 3×10¹¹ K y n₀ = 1,56×10⁷ cm⁻³ para F₂₃₀ ≈ 2,35 Jy (Wielgus et al. 2022) con a* = 0,5 e i = 30°.">
        <Badge kind="modelo" />
        <Slider label="Turbulencia σ (log-normal)" value={s.turb} min={0} max={1.2} step={0.01} onChange={(turbulence) => set({ turbulence })} format={(x) => fmt(x, 2)} tip="Fluctuaciones de densidad arrastradas por la rotación diferencial (semilla fija). 0 = flujo suave." />
        <Toggle label="Punto caliente orbital (cf. GRAVITY 2018)" checked={s.hs} onChange={(hotspot) => set({ hotspot })} tip="Sobredensidad gaussiana en órbita kepleriana en r = 8 r_g, como los destellos observados a 6–10 r_g con periodo ~45 min." />
        <NumberField label="n₀ (densidad electrónica)" value={s.riaf.ne0} onChange={(ne0) => set({ riaf: { ...s.riaf, ne0 } })} step={1e6} unit="cm⁻³" />
        <NumberField label="T₀ (temperatura electrónica)" value={s.riaf.te0} onChange={(te0) => set({ riaf: { ...s.riaf, te0 } })} step={1e10} unit="K" />
        <NumberField label="β (presión gas/magnética)" value={s.riaf.beta} onChange={(beta) => set({ riaf: { ...s.riaf, beta } })} step={1} />
        <NumberField label="h (espesor relativo)" value={s.riaf.h} onChange={(h) => set({ riaf: { ...s.riaf, h } })} step={0.05} />
        <NumberField label="κ (fracción kepleriana)" value={s.riaf.kappa} onChange={(kappa) => set({ riaf: { ...s.riaf, kappa: Math.min(1, Math.max(0, kappa)) } })} step={0.05} />
        <p className="note">Al cambiar n₀ o T₀ el flujo total cambia: compruébalo en el perfil EHT (Visualización), que muestra F₂₃₀ calculado.</p>
      </Section>
    </>
  );
}

const OBSERVERS: Array<{ value: CameraObserver; label: string; tip: string }> = [
  { value: 'static', label: 'Estático', tip: 'En reposo respecto de las estrellas lejanas (u ∝ ∂_t). Imposible dentro de la ergosfera.' },
  { value: 'zamo', label: 'ZAMO', tip: 'Momento angular nulo: gira con el arrastre de marcos ω. Existe hasta el horizonte.' },
  { value: 'circular', label: 'En órbita', tip: 'Órbita circular kepleriana prógrada (geodésica solo en el plano ecuatorial).' },
  { value: 'rain', label: 'Caída libre', tip: 'Cae desde el reposo en el infinito (marco de Doran / «río»). La navegación lo coloca; no es una caída real.' },
];

function CameraPanel() {
  const obs = useObs();
  const s = useApp((x) => ({ observer: x.observer, nav: x.navMode, fov: x.fovDeg, sens: x.sensitivity, speed: x.moveSpeed, inertia: x.inertia, units: x.units, note: x.live.camNote, diving: x.live.diving, diveInfo: x.live.diveInfo, r: x.live.camR, theta: x.live.camTheta, tau: x.live.camTau, follow: x.followExperiment, inside: x.live.camInside }));
  const sc = blackHoleScales(store.get().massSolar, store.get().distanceKpc);
  return (
    <>
      <Section title="Observador (marco local de la cámara)" note="La cámara no es un punto abstracto: tiene 4-velocidad. Cambiar de observador en el mismo punto cambia la aberración y el desplazamiento Doppler del cielo.">
        <Segmented<CameraObserver> value={s.observer} onChange={(observer) => set({ observer })} options={OBSERVERS.map((o) => ({ value: o.value, label: o.label, title: o.tip }))} />
        {s.note && <p className="note warn">{s.note}</p>}
        <Row label="Posición">
          r = {dist(s.r, s.units, sc, 3)} · θ = {fmt(s.theta, 1)}°
        </Row>
      </Section>
      <Section title="Navegación">
        <Segmented
          value={s.nav}
          onChange={(navMode) => set({ navMode })}
          options={[
            { value: 'orbit', label: 'Órbita' },
            { value: 'free', label: 'Libre (WASD)' },
            { value: 'follow', label: 'Seguir objeto', disabled: !s.follow },
          ]}
        />
        <Slider label="Campo de visión" value={s.fov} min={2} max={120} step={0.5} onChange={(fovDeg) => set({ fovDeg })} format={(x) => `${fmt(x, 1)}°`} />
        <Slider label="Sensibilidad" value={s.sens} min={0.2} max={3} step={0.05} onChange={(sensitivity) => set({ sensitivity })} format={(x) => `${fmt(x, 2)}×`} />
        <Slider label="Velocidad de desplazamiento" value={s.speed} min={0.1} max={5} step={0.05} onChange={(moveSpeed) => set({ moveSpeed })} format={(x) => `${fmt(x, 2)}×`} />
        <Toggle label="Inercia" checked={s.inertia} onChange={(inertia) => set({ inertia })} />
        <div className="btn-row">
          <button className="btn" onClick={() => obs.engine.nav.focusBlackHole()}>
            <Focus /> Enfocar (C)
          </button>
          <button className="btn" onClick={() => obs.engine.nav.reset()}>
            <RotateCcw /> Restablecer (R)
          </button>
          <button className="btn" disabled={!s.follow} onClick={() => set({ navMode: 'follow' })}>
            <Crosshair /> Seguir (F)
          </button>
        </div>
        <p className="note">Mover la cámara es una operación de software (cambia el punto de observación); en cada punto la cámara adopta la 4-velocidad del observador elegido. No puede situarse dentro del horizonte ni, si es estática, dentro de la ergosfera.</p>
      </Section>
      <Section title="Caída libre de la cámara" note="Única forma física de entrar: la cámara sigue una geodésica temporal desde el reposo respecto del observador actual. Dentro del horizonte no hay vuelta atrás por movimiento físico.">
        {!s.diving ? (
          <button className="btn accent" onClick={() => obs.engine.startDive()}>
            <ArrowDownToLine /> Lanzarse hacia el agujero negro
          </button>
        ) : (
          <>
            <Row label="Estado">{s.diveInfo}</Row>
            <Row label="Tiempo propio de la cámara">{duration(s.tau)}</Row>
            <button className="btn" onClick={() => obs.engine.endDive()}>
              <RotateCcw /> Reinicio de software (volver al punto de partida)
            </button>
          </>
        )}
      </Section>
      <Section title="Unidades de distancia">
        <Segmented
          value={s.units}
          onChange={(units) => set({ units })}
          options={[
            { value: 'km', label: 'Kilómetros' },
            { value: 'rg', label: 'r_g' },
            { value: 'rs', label: 'r_s' },
          ]}
        />
      </Section>
    </>
  );
}

function OverlayToggle({ k, label, tip }: { k: keyof OverlayToggles; label: string; tip?: string }) {
  const v = useApp((s) => s.overlay[k]);
  return <Toggle label={label} tip={tip} checked={v} onChange={(x) => store.set((s) => ({ overlay: { ...s.overlay, [k]: x } }))} />;
}

function VisualPanel() {
  const s = useApp((x) => ({ profile: x.profile, quality: x.quality, plasma: x.plasmaOn, stars: x.starsOn, grid: x.gridOn, ae: x.autoExposure, ev: x.exposureEV, bloom: x.bloom, beam: x.ehtBeam, fwhm: x.beamFwhmMuas, fovM: x.ehtFovM, marker: x.markerScale, exag: x.deformExaggeration }));
  return (
    <>
      <Section title="Perfil de visualización">
        <Segmented
          value={s.profile}
          onChange={(profile) => set({ profile })}
          options={[
            { value: 'cinematic', label: 'Cinematográfico' },
            { value: 'eht', label: 'Científico · EHT' },
            { value: 'spacetime', label: 'Espacio-tiempo' },
          ]}
        />
        {s.profile === 'cinematic' && (
          <p className="note">
            Misma propagación física de la luz; color = índice espectral entre 86 y 690 GHz y brillo = intensidad a 230 GHz con compresión logarítmica. <b>El tratamiento cromático es artístico.</b> <Badge kind="estetico">color artístico</Badge>
          </p>
        )}
        {s.profile === 'eht' && (
          <p className="note">
            Imagen <b>sintética</b> a 230 GHz vista desde la Tierra (observador a 10⁴ r_g), intensidad lineal normalizada, mapa afmhot y haz gaussiano opcional. No es una observación. Comparación: anillo EHT {fmt(OBSERVATIONS.ehtRingDiameterMuas.value, 1)} ± {fmt(OBSERVATIONS.ehtRingDiameterMuas.sigma, 1)} μas.
          </p>
        )}
        {s.profile === 'spacetime' && <p className="note">Sin plasma: sombra, anillo fotónico, cielo distorsionado y retícula celeste (θ, φ cada 15°) para ver la lente.</p>}
      </Section>
      <Section title="Calidad del trazado">
        <Segmented
          value={s.quality}
          onChange={(quality) => set({ quality })}
          options={[
            { value: 'interactive', label: 'Interactiva' },
            { value: 'high', label: 'Alta fidelidad' },
          ]}
        />
        <p className="note">
          {s.quality === 'interactive'
            ? 'RK4 con paso η = 0,07 de la escala local: error angular mediano ~10⁻⁶ rad frente a la referencia (VALIDACION.md). Se resuelve en tiempo real con resolución dinámica.'
            : 'η = 0,025 y paso de 0,12 M en el plasma; acumulación progresiva de hasta 256 muestras. Más lenta: pensada para capturas y análisis.'}
        </p>
      </Section>
      <Section title="Capas físicas">
        <Toggle label="Plasma (emisión sincrotrón)" checked={s.plasma} onChange={(plasmaOn) => set({ plasmaOn })} disabled={s.profile === 'spacetime'} />
        <Toggle label="Campo estelar (procedimental)" checked={s.stars} onChange={(starsOn) => set({ starsOn })} disabled={s.profile === 'eht'} tip="Estrellas puntuales generadas con semilla fija (ilustrativas, no un catálogo real) cuya imagen se calcula con las geodésicas: posición, magnificación y desplazamiento al rojo." />
        <Toggle label="Retícula celeste" checked={s.grid} onChange={(gridOn) => set({ gridOn })} disabled={s.profile !== 'spacetime'} />
        <Slider label="Escala visual de las balizas" value={s.marker} min={0.3} max={3} step={0.05} onChange={(markerScale) => set({ markerScale })} format={(x) => `${fmt(x, 2)}×`} tip="Las balizas de los objetos están AMPLIADAS: un objeto de metros sería invisible a la escala de r_g ≈ 5,9 millones de km." />
      </Section>
      <Section title="SPACE-TIME GEOMETRY" note="Elementos de diagrama dibujados en coordenadas cartesianas de Kerr–Schild con proyección euclídea. Son visualizaciones matemáticas, no luz.">
        <OverlayToggle k="trajectories" label="Trayectorias calculadas" />
        <OverlayToggle k="coordMarkers" label="Posición en el modelo (coordenadas)" />
        <OverlayToggle k="labels" label="Etiquetas" />
        <OverlayToggle k="horizon" label="Horizonte de sucesos" />
        <OverlayToggle k="ergosphere" label="Ergosfera" />
        <OverlayToggle k="isco" label="ISCO (prógrada continua, retrógrada discontinua)" />
        <OverlayToggle k="photonOrbits" label="Órbitas fotónicas circulares" />
        <OverlayToggle k="geoPhotons" label="Geodésicas: abanico de fotones" tip="Fotones ecuatoriales con parámetro de impacto creciente: lente y captura." />
        <OverlayToggle k="geoCritical" label="Geodésicas: fotones casi críticos" tip="b = b_c ± 10⁻⁶: giran cerca de la órbita fotónica antes de escapar o caer." />
        <OverlayToggle k="geoMassive" label="Geodésicas: órbitas masivas" tip="ISCO, órbita excéntrica con precesión y zoom-whirl." />
        <OverlayToggle k="geoCapture" label="Geodésicas: capturas" />
        <OverlayToggle k="lightCones" label="Conos de luz locales" tip="Elipsoide de velocidades coordenadas de la luz en cada punto. Dentro del horizonte queda entero del lado de r decreciente." />
        <OverlayToggle k="embedding" label="Diagrama de incrustación" tip="Corte ecuatorial t_BL = cte como superficie de revolución: su curvatura intrínseca es real, la tercera dimensión no." />
        <OverlayToggle k="grid" label="Rejilla ecuatorial" />
      </Section>
      <Section title="Exposición y presentación">
        <Toggle label="Exposición automática" checked={s.ae} onChange={(autoExposure) => set({ autoExposure })} />
        <Slider label="Compensación (EV)" value={s.ev} min={-4} max={4} step={0.1} onChange={(exposureEV) => set({ exposureEV })} format={(x) => `${x >= 0 ? '+' : ''}${fmt(x, 1)} EV`} />
        <Slider label="Bloom (estético)" value={s.bloom} min={0} max={0.6} step={0.01} onChange={(bloom) => set({ bloom })} format={(x) => fmt(x, 2)} tip="Difusión óptica de presentación; no es física del agujero negro." />
        <Toggle label="Haz instrumental del EHT" checked={s.beam} onChange={(ehtBeam) => set({ ehtBeam })} tip="Convolución gaussiana para comparar con la resolución del interferómetro." />
        <Slider label="FWHM del haz" value={s.fwhm} min={5} max={40} step={0.5} onChange={(beamFwhmMuas) => set({ beamFwhmMuas })} format={(x) => `${fmt(x, 1)} μas`} />
        <Slider label="Campo del perfil EHT" value={s.fovM} min={8} max={40} step={0.5} onChange={(ehtFovM) => set({ ehtFovM })} format={(x) => `±${fmt(x, 1)} r_g`} />
        <Slider label="Ampliación de la deformación (vista B)" value={s.exag} min={1} max={1e12} log onChange={(deformExaggeration) => set({ deformExaggeration })} format={(x) => (x <= 1.01 ? 'real (1×)' : `${sci(x, 1)}×`)} tip="Las deformaciones elásticas reales son ínfimas (~10⁻¹² en el horizonte): se pueden ampliar indicándolo." />
      </Section>
    </>
  );
}

function SettingsPanel() {
  const obs = useObs();
  const s = useApp((x) => ({ fixed: x.fixedScale, audio: x.audioOn, live: x.live, hidden: x.uiHidden }));
  const [bench, setBench] = useState<string | null>(null);
  const capture = async (samples: number) => {
    store.set({ busy: `Acumulando ${samples} muestras para la captura…` });
    const c = await obs.engine.capture(samples);
    store.set({ busy: null });
    c.toBlob((b) => {
      if (!b) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = `sgra-captura-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, 'image/png');
  };
  const runBench = async () => {
    setBench('Midiendo durante 5 s (cada fotograma se traza completo a escala 100 %)…');
    const r = await obs.engine.benchmark(5, 1);
    setBench(`${fmt(r.fps, 1)} FPS · ${fmt(r.msPerFrame, 1)} ms/fotograma a ${r.width}×${r.height} · ${sci(r.raysPerSecond, 2)} rayos/s · perfil y calidad actuales · GPU: ${r.gpu}`);
  };
  return (
    <>
      <Section title="Rendimiento" note="Objetivo: 60 FPS en GPU dedicadas y ≥ 30 FPS en integradas con resolución dinámica. Mide tu equipo con el banco de pruebas.">
        <Row label="FPS (media móvil)">{fmt(s.live.fps, 1)}</Row>
        <Row label="Escala de render">{fmt(s.live.renderScale * 100, 0)} %</Row>
        <Row label="Muestras acumuladas">{s.live.samples}</Row>
        <Row label="GPU">
          <Tip text={s.live.gpu}>{s.live.gpu.slice(0, 26)}</Tip>
        </Row>
        <Segmented
          small
          value={s.fixed === null ? 'auto' : String(s.fixed)}
          onChange={(v) => store.set({ fixedScale: v === 'auto' ? null : Number(v) })}
          options={[
            { value: 'auto', label: 'Dinámica' },
            { value: '0.35', label: '35 %' },
            { value: '0.5', label: '50 %' },
            { value: '0.75', label: '75 %' },
            { value: '1', label: '100 %' },
          ]}
        />
        <button className="btn" onClick={runBench}>
          Banco de pruebas (5 s, escala 100 %)
        </button>
        {bench && <p className="note">{bench}</p>}
      </Section>
      <Section title="Capturas y configuración">
        <div className="btn-row">
          <button className="btn" onClick={() => capture(16)}>
            <Download /> PNG rápida
          </button>
          <button className="btn" onClick={() => capture(128)}>
            <Download /> PNG alta calidad
          </button>
        </div>
        <div className="btn-row">
          <button className="btn" onClick={() => exportConfig()}>
            <Download /> Exportar configuración
          </button>
          <label className="btn">
            <Upload /> Importar
            <input type="file" accept="application/json" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && importConfig(e.target.files[0])} />
          </label>
        </div>
      </Section>
      <Section title="Interfaz y sonido">
        <Toggle label="Ocultar interfaz (H)" checked={s.hidden} onChange={(uiHidden) => store.set({ uiHidden })} />
        <Toggle label="Sonido ambiental (opcional)" checked={s.audio} onChange={(audioOn) => store.set({ audioOn })} tip="Música ambiental muy sutil y clics discretos. Ningún sonido se atribuye a la propagación por el vacío." />
      </Section>
    </>
  );
}

export function configSnapshot(): unknown {
  const s = store.get();
  return {
    formato: 'sgra-observatory-config',
    version: 1,
    fecha: new Date().toISOString(),
    agujero: { conjunto: s.paramSetId, masaSolar: s.massSolar, distanciaKpc: s.distanceKpc, espin: s.spin },
    plasma: { ...s.riaf, turbulencia: s.turbulence, puntoCaliente: s.hotspot },
    visualizacion: { perfil: s.profile, calidad: s.quality, estrellas: s.starsOn, reticula: s.gridOn, exposicionEV: s.exposureEV, bloom: s.bloom, hazEHT: s.ehtBeam, fwhmMuas: s.beamFwhmMuas, superposiciones: s.overlay },
    camara: { observador: s.observer, navegacion: s.navMode, fovGrados: s.fovDeg },
    tiempo: { multiplicador: s.timeScale },
    lanzamiento: s.launch,
    experimentos: s.experiments.map((e) => ({ id: e.id, etiqueta: e.label, tLanzamiento: e.tLaunch, espin: e.spin, configuracion: e.config, info: e.info, eventos: e.events })),
  };
}

function download(name: string, text: string, type = 'application/json'): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function exportConfig(): void {
  download(`sgra-configuracion-${Date.now()}.json`, JSON.stringify(configSnapshot(), null, 2));
}

async function importConfig(f: File): Promise<void> {
  try {
    const j = JSON.parse(await f.text());
    if (j.formato !== 'sgra-observatory-config') throw new Error('formato desconocido');
    store.set({
      paramSetId: j.agujero.conjunto,
      massSolar: j.agujero.masaSolar,
      distanceKpc: j.agujero.distanciaKpc,
      spin: j.agujero.espin,
      profile: j.visualizacion.perfil,
      quality: j.visualizacion.calidad,
      launch: { ...store.get().launch, ...j.lanzamiento },
      timeScale: j.tiempo.multiplicador,
    });
    toast('Configuración importada. Pulsa ARROJAR para repetir el lanzamiento registrado.', 'info');
  } catch (e) {
    toast(`No se pudo importar: ${(e as Error).message}`, 'aviso');
  }
}

export { download };
