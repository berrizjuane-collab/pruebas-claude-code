/**
 * Barra de interacción principal: catálogo rotativo de diez objetos con vista previa giratoria,
 * escenario de lanzamiento, ARROJAR, pausa y reinicio exacto; parámetros detallados en un
 * desplegable (todas las velocidades se definen en el marco local del observador elegido).
 */
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { store, useApp } from '../app/store';
import { CATALOG } from '../simulation/catalog';
import { OBJECT_ORDER, SCENARIO_LABELS, type LaunchConfig, type Scenario } from '../simulation/types';
import { Preview } from '../rendering/objects/Preview';
import { useObs } from './hud';
import { NumberField, Segmented, Slider, Toggle } from './components';
import { fmt } from './format';
import { criticalImpactParameter, horizons, iscoRadius, photonOrbitRadius } from '../physics/metrics/kerr';

export function cycleObject(d: number): void {
  const s = store.get();
  const i = OBJECT_ORDER.indexOf(s.launch.object);
  const next = OBJECT_ORDER[(i + d + OBJECT_ORDER.length) % OBJECT_ORDER.length];
  const spec = CATALOG[next];
  // El haz de fotones solo admite el escenario crítico o el personalizado
  const scenario = spec.class === 'fotones' && s.launch.scenario !== 'personalizado' ? 'critica' : s.launch.scenario;
  store.set({ launch: { ...s.launch, object: next, scenario } });
}

function setLaunch(patch: Partial<LaunchConfig>): void {
  store.set((s) => ({ launch: { ...s.launch, ...patch } }));
}

export function LaunchBar() {
  const obs = useObs();
  const launch = useApp((s) => s.launch);
  const running = useApp((s) => s.running);
  const sel = useApp((s) => s.selectedExperiment);
  const [params, setParams] = useState(false);
  const ref = useRef<HTMLCanvasElement>(null);
  const prev = useRef<Preview | null>(null);
  const spec = CATALOG[launch.object];
  const idx = OBJECT_ORDER.indexOf(launch.object);

  useEffect(() => {
    prev.current = new Preview(ref.current!);
    return () => prev.current?.dispose();
  }, []);
  useEffect(() => {
    prev.current?.setKind(launch.object);
  }, [launch.object]);

  const scenarios: Scenario[] = spec.class === 'fotones' ? ['critica', 'personalizado'] : ['radial', 'orbita', 'sobrevuelo', 'captura', 'critica', 'personalizado'];

  return (
    <div className="launchbar glass" role="group" aria-label="Arrojar objetos">
      <div className="cat">
        <button className="arrow" onClick={() => cycleObject(-1)} aria-label="Objeto anterior ([)">
          <ChevronLeft size={18} />
        </button>
        <canvas ref={ref} aria-label={`Vista previa: ${spec.name}. Arrastra para girarla.`} />
        <div className="meta">
          <span className="idx">
            {String(idx + 1).padStart(2, '0')} / 10
          </span>
          <span className="name">{spec.name}</span>
          <span className="desc">{spec.demonstrates}</span>
        </div>
        <button className="arrow" onClick={() => cycleObject(1)} aria-label="Objeto siguiente (])">
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="launch-controls">
        <select aria-label="Escenario de lanzamiento" value={launch.scenario} onChange={(e) => setLaunch({ scenario: e.target.value as Scenario })}>
          {scenarios.map((sc) => (
            <option key={sc} value={sc}>
              {SCENARIO_LABELS[sc]}
            </option>
          ))}
        </select>
        <button className={`iconbtn${params ? ' on' : ''}`} onClick={() => setParams((p) => !p)} aria-label="Parámetros del lanzamiento" title="Parámetros del lanzamiento">
          <SlidersHorizontal />
        </button>
        <button className="throw" onClick={() => obs.launch()} title="Arrojar (T)">
          ARROJAR
        </button>
        <button className="iconbtn" onClick={() => store.set({ running: !running })} aria-label={running ? 'Pausar (Espacio)' : 'Reanudar (Espacio)'} title={running ? 'Pausar (Espacio)' : 'Reanudar (Espacio)'}>
          {running ? <Pause /> : <Play />}
        </button>
        <button className="iconbtn" onClick={() => sel && obs.restartExperiment(sel)} disabled={!sel} aria-label="Reiniciar el lanzamiento con las mismas condiciones" title="Reiniciar el lanzamiento (mismas condiciones iniciales)">
          <RotateCcw />
        </button>
      </div>
      {params && <LaunchParams />}
    </div>
  );
}

function LaunchParams() {
  const L = useApp((s) => s.launch);
  const a = useApp((s) => s.spin);
  const spec = CATALOG[L.object];
  const { rPlus } = horizons(a);
  const v = Math.hypot(L.vRadial, L.vTangential);
  const isBody = spec.class === 'cuerpo';
  return (
    <div className="popover glass" onKeyDown={(e) => e.stopPropagation()}>
      <h3>Punto de lanzamiento</h3>
      <Slider label="Distancia inicial r₀" value={L.r0} min={Math.max(1.3, rPlus * 1.06)} max={200} log onChange={(r0) => setLaunch({ r0 })} format={(x) => `${fmt(x, 2)} r_g`} tip="Coordenada radial de partida (Boyer–Lindquist = Kerr–Schild)." />
      <Slider label="Ángulo polar θ₀" value={L.theta0Deg} min={5} max={175} step={1} onChange={(theta0Deg) => setLaunch({ theta0Deg })} format={(x) => `${fmt(x, 0)}°`} tip="90° = plano ecuatorial. Los escenarios de órbita, sobrevuelo, captura y crítica usan el plano ecuatorial." />
      <Slider label="Acimut φ₀" value={L.phi0Deg} min={-180} max={180} step={1} onChange={(phi0Deg) => setLaunch({ phi0Deg })} format={(x) => `${fmt(x, 0)}°`} />
      <div className="numfield">
        <span>Observador del marco local</span>
        <Segmented
          small
          value={L.observer}
          onChange={(observer) => setLaunch({ observer })}
          options={[
            { value: 'static', label: 'Estático' },
            { value: 'zamo', label: 'ZAMO' },
          ]}
        />
      </div>
      {spec.class !== 'fotones' && (
        <>
          <h3>Velocidad local {L.scenario === 'personalizado' ? '' : '(magnitud; la dirección la fija el escenario)'}</h3>
          <Slider label="Componente radial v_r" value={L.vRadial} min={-0.95} max={0.95} step={0.005} onChange={(vRadial) => setLaunch({ vRadial })} format={(x) => `${fmt(x, 3)} c`} tip="Medida por el observador local elegido; negativa hacia el agujero negro." />
          <Slider label="Componente tangencial v_t" value={L.vTangential} min={0} max={0.95} step={0.005} onChange={(vTangential) => setLaunch({ vTangential })} format={(x) => `${fmt(x, 3)} c`} />
          <Slider label="Orientación tangencial ψ" value={L.tangentAngleDeg} min={-180} max={180} step={1} onChange={(tangentAngleDeg) => setLaunch({ tangentAngleDeg })} format={(x) => `${fmt(x, 0)}°`} tip="0° = sentido de rotación del agujero (prógrado); 90° = hacia el polo norte; 180° = retrógrado." />
          <p className={`note${v >= 1 ? ' warn' : ''} full`}>
            |v| = {fmt(v, 3)} c {v >= 1 ? '— un cuerpo masivo no puede alcanzar c: reduce las componentes.' : `· γ = ${fmt(1 / Math.sqrt(1 - v * v), 3)}`}
          </p>
          <div className="numfield full">
            <span>Sentido orbital (escenarios)</span>
            <Segmented
              small
              value={L.prograde ? 'pro' : 'retro'}
              onChange={(x) => setLaunch({ prograde: x === 'pro' })}
              options={[
                { value: 'pro', label: 'Prógrado' },
                { value: 'retro', label: 'Retrógrado' },
              ]}
            />
          </div>
        </>
      )}
      {L.scenario === 'orbita' && (
        <>
          <h3>Órbita</h3>
          <div className="numfield full">
            <span>Tipo</span>
            <Segmented
              small
              value={L.orbitType}
              onChange={(orbitType) => setLaunch({ orbitType })}
              options={[
                { value: 'circular', label: 'Circular en r₀' },
                { value: 'excentrica', label: 'Excéntrica (r_p, r_a)' },
              ]}
            />
          </div>
          {L.orbitType === 'excentrica' && (
            <>
              <NumberField label="Periastro r_p" value={L.rp} onChange={(rp) => setLaunch({ rp })} unit="r_g" step={0.5} />
              <NumberField label="Apoastro r_a" value={L.ra} onChange={(ra) => setLaunch({ ra })} unit="r_g" step={0.5} />
            </>
          )}
          <p className="note full">
            Órbitas circulares: existen solo para r &gt; r_ph = {fmt(photonOrbitRadius(a, L.prograde), 3)} r_g y son estables solo para r ≥ r_ISCO = {fmt(iscoRadius(a, L.prograde), 3)} r_g ({L.prograde ? 'prógradas' : 'retrógradas'}, a* = {fmt(a, 2)}).
          </p>
        </>
      )}
      {L.scenario === 'critica' && spec.class !== 'fotones' && (
        <div className="numfield full">
          <span>Lado del separador</span>
          <Segmented
            small
            value={L.criticalSide}
            onChange={(criticalSide) => setLaunch({ criticalSide })}
            options={[
              { value: 'escape', label: 'L = L_c (1 + 2·10⁻⁷)' },
              { value: 'captura', label: 'L = L_c (1 − 2·10⁻⁷)' },
            ]}
          />
        </div>
      )}
      {spec.class === 'nube' && (
        <>
          <h3>Nube de partículas</h3>
          <Slider label="Radio de la nube" value={L.cloudRadius} min={0.05} max={3} step={0.01} onChange={(cloudRadius) => setLaunch({ cloudRadius })} format={(x) => `${fmt(x, 2)} r_g`} />
          <Slider label="Número de partículas" value={L.cloudCount} min={4} max={48} step={1} onChange={(cloudCount) => setLaunch({ cloudCount })} format={(x) => fmt(x, 0)} />
          <NumberField label="Semilla" value={L.seed} onChange={(seed) => setLaunch({ seed: Math.round(seed) })} step={1} />
        </>
      )}
      {spec.class === 'fotones' && (
        <>
          <h3>Haz de fotones</h3>
          <Slider label="Parámetro de impacto central" value={Number.isFinite(L.beamCenterB) ? L.beamCenterB : criticalImpactParameter(a, L.prograde)} min={-14} max={14} step={0.01} onChange={(beamCenterB) => setLaunch({ beamCenterB })} format={(x) => `${fmt(x, 3)} r_g`} tip="b = L/E. Positivo: prógrado; negativo: retrógrado. Captura si |b| < b_c." />
          <Slider label="Semiancho del haz" value={L.beamSpread} min={0} max={8} step={0.01} onChange={(beamSpread) => setLaunch({ beamSpread })} format={(x) => `±${fmt(x, 2)} r_g`} />
          <Slider label="Número de fotones" value={L.beamCount} min={1} max={41} step={1} onChange={(beamCount) => setLaunch({ beamCount })} format={(x) => fmt(x, 0)} />
          <div className="btn-row full">
            <button className="btn" onClick={() => setLaunch({ beamCenterB: criticalImpactParameter(a, true), prograde: true })}>
              b = b_c prógrado ({fmt(criticalImpactParameter(a, true), 3)})
            </button>
            <button className="btn" onClick={() => setLaunch({ beamCenterB: -criticalImpactParameter(a, false), prograde: false })}>
              b = −b_c retrógrado ({fmt(criticalImpactParameter(a, false), 3)})
            </button>
          </div>
        </>
      )}
      {isBody && (
        <>
          <h3>Orientación del cuerpo</h3>
          <Slider label="Guiñada" value={L.attitudeDeg[0]} min={-180} max={180} step={1} onChange={(x) => setLaunch({ attitudeDeg: [x, L.attitudeDeg[1], L.attitudeDeg[2]] })} format={(x) => `${fmt(x, 0)}°`} />
          <Slider label="Cabeceo" value={L.attitudeDeg[1]} min={-90} max={90} step={1} onChange={(x) => setLaunch({ attitudeDeg: [L.attitudeDeg[0], x, L.attitudeDeg[2]] })} format={(x) => `${fmt(x, 0)}°`} />
          {L.object === 'asteroide' && <Toggle label="Agregado sin cohesión (rubble pile)" checked={L.rubblePile} onChange={(rubblePile) => setLaunch({ rubblePile })} tip="Solo la autogravedad lo mantiene unido: se rompe mucho más lejos." />}
        </>
      )}
    </div>
  );
}
