/**
 * Telemetría compacta del objeto seleccionado (abajo a la izquierda) y controles de tiempo
 * (abajo a la derecha).
 */
import { store, useApp } from '../app/store';
import { Row, Segmented, Slider } from './components';
import { dist, duration, fmt, sci, speedC } from './format';
import { blackHoleScales } from '../physics/sgra';

export function Telemetry() {
  const tel = useApp((s) => s.telemetry);
  const exps = useApp((s) => s.experiments);
  const sel = useApp((s) => s.selectedExperiment);
  const units = useApp((s) => s.units);
  const m = useApp((s) => s.massSolar);
  const d = useApp((s) => s.distanceKpc);
  const sc = blackHoleScales(m, d);
  return (
    <div className="telemetry glass" aria-label="Telemetría">
      <header>
        <span className="title">
          {tel && <span className="dot" style={{ background: tel.color }} />}
          Telemetría
        </span>
        {exps.length > 0 && (
          <select aria-label="Objeto seleccionado" value={sel ?? ''} onChange={(e) => store.set({ selectedExperiment: e.target.value || null, followExperiment: e.target.value || null })}>
            {exps.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
        )}
      </header>
      {!tel ? (
        <div className="empty">Elige un objeto y pulsa ARROJAR. Sus magnitudes aparecerán aquí.</div>
      ) : (
        <>
          <Row label="Distancia radial" tip="Coordenada r de Boyer–Lindquist (igual en Kerr–Schild): r = 0 no es un punto del espacio sino el anillo singular.">
            {dist(tel.r, units, sc, 3)}
          </Row>
          {tel.type === 'body' && (
            <>
              <Row label="Velocidad local" tip={`Rapidez medida por un ${tel.vObserver} en la posición del objeto (no es una velocidad coordenada).`}>
                {speedC(tel.vLocal)} {tel.dirIn ? '↘' : '↗'}
              </Row>
              <Row label="Tiempo propio τ" tip="Tiempo que marcaría un reloj que viaja con el objeto.">
                {duration(tel.tau)}
              </Row>
              <Row label="Marea (estiramiento)" tip="Mayor autovalor de −E_ij: aceleración relativa por metro de separación en el marco del objeto.">
                {sci(tel.lambda, 2)} s⁻²
              </Row>
            </>
          )}
          {tel.type === 'cloud' && <Row label="Extensión de la nube">{dist(tel.cloudSpread ?? NaN, units, sc, 2)}</Row>}
          {tel.photons && (
            <Row label="Fotones">
              {tel.photons.captured} capturados · {tel.photons.escaped} escapan · {tel.photons.total - tel.photons.captured - tel.photons.escaped} en vuelo
            </Row>
          )}
          {tel.type === 'body' && tel.orbitState && <div className="orbit">{tel.orbitState}</div>}
          <div className={`state${tel.inside ? ' in' : ''}`}>{tel.captureState || tel.status}</div>
        </>
      )}
    </div>
  );
}

const PRESETS = [0.1, 1, 10, 100];

export function TimeControls() {
  const ts = useApp((s) => s.timeScale);
  const running = useApp((s) => s.running);
  const t = useApp((s) => s.live.t);
  const view = useApp((s) => s.view);
  const m = useApp((s) => s.massSolar);
  const sc = blackHoleScales(m, 8.2);
  const preset = PRESETS.includes(ts) ? String(ts) : 'x';
  return (
    <div className="timebar glass" aria-label="Control del tiempo">
      <div className="top">
        <Segmented
          small
          value={preset}
          onChange={(v) => v !== 'x' && store.set({ timeScale: Number(v), running: true })}
          options={[...PRESETS.map((p) => ({ value: String(p), label: `${String(p).replace('.', ',')}×` })), ...(preset === 'x' ? [{ value: 'x', label: `${fmt(ts, 0)}×` }] : [])]}
        />
      </div>
      <Slider
        label={view === 'object' ? 'τ simulado / s real' : 't simulado / s real'}
        value={ts}
        min={0.1}
        max={20000}
        log
        onChange={(v) => store.set({ timeScale: Number(v.toPrecision(3)) })}
        format={(v) => `${fmt(v, v < 10 ? 1 : 0)}×`}
        tip={view === 'object' ? 'En la vista del objeto el multiplicador avanza su tiempo propio.' : 'Avanza el tiempo coordenado t (el de un observador estático lejano). No altera las leyes físicas: solo cuánto tiempo simulado transcurre por segundo real.'}
      />
      <div className="clock">
        t = {duration(t * sc.tg)} <small>({fmt(t, 1)} M)</small> {running ? '' : '· pausa'}
      </div>
    </div>
  );
}
