/**
 * RESEARCH MODE: laboratorio virtual. Todos los datos proceden del motor físico (muestras del
 * trabajador y del rastreador de señal); nada se inventa ni se interpola fuera de lo calculado.
 */
import { useMemo, useState } from 'react';
import { Crosshair, Download, RotateCcw, Trash2 } from 'lucide-react';
import { store, toast, useApp } from '../app/store';
import { useObs } from './hud';
import { Chart, type Series } from './Chart';
import { Row, Section, Segmented } from './components';
import { duration, fmt, sci, speedC } from './format';
import { SAMPLE_SIZE, S_DRIFT, S_R, S_STRESS, S_T, S_TAU, S_TID, S_X } from '../simulation/types';
import { CATALOG } from '../simulation/catalog';
import { horizons, iscoRadius, photonOrbitRadius } from '../physics/metrics/kerr';
import { symmetricEigen3 } from '../physics/tidal/riemann';
import type { Experiment } from '../simulation/client';
import type { TrackResult } from '../simulation/signalTracker';
import { configSnapshot, download } from './panels';

function downsample(n: number, max = 900): number[] {
  if (n <= max) return Array.from({ length: n }, (_, i) => i);
  const out: number[] = [];
  for (let i = 0; i < max; i++) out.push(Math.round((i * (n - 1)) / (max - 1)));
  return out;
}

function seriesFor(e: Experiment) {
  const d = e.body.data;
  const idx = downsample(e.nSamples);
  const t = idx.map((k) => d[k * SAMPLE_SIZE + S_T]);
  const tau = idx.map((k) => d[k * SAMPLE_SIZE + S_TAU]);
  const r = idx.map((k) => d[k * SAMPLE_SIZE + S_R]);
  const x = idx.map((k) => d[k * SAMPLE_SIZE + S_X]);
  const y = idx.map((k) => d[k * SAMPLE_SIZE + S_X + 1]);
  const lam = idx.map((k) => {
    const A = k * SAMPLE_SIZE + S_TID;
    const { values } = symmetricEigen3([d[A], d[A + 1], d[A + 2], d[A + 1], d[A + 3], d[A + 4], d[A + 2], d[A + 4], d[A + 5]]);
    return -values[0];
  });
  const stress = idx.map((k) => d[k * SAMPLE_SIZE + S_STRESS]);
  const drift = idx.map((k) => Math.max(d[k * SAMPLE_SIZE + S_DRIFT], d[k * SAMPLE_SIZE + S_DRIFT + 1], d[k * SAMPLE_SIZE + S_DRIFT + 3]));
  return { t, tau, r, x, y, lam, stress, drift };
}

export function ResearchPanel() {
  const obs = useObs();
  const exps = useApp((s) => s.experiments);
  const sel = useApp((s) => s.selectedExperiment);
  const tel = useApp((s) => s.telemetry);
  const a = useApp((s) => s.spin);
  const [track, setTrack] = useState<{ id: string; res: TrackResult } | null>(null);
  const [tab, setTab] = useState<'estado' | 'graficos' | 'comparar'>('estado');
  const e = sel ? obs.client.experiments.get(sel) ?? null : null;
  const version = e?.version ?? 0;
  const S = useMemo(() => (e && e.type === 'body' && e.nSamples > 1 ? seriesFor(e) : null), [e, version]); // eslint-disable-line react-hooks/exhaustive-deps

  const runTrack = async () => {
    if (!e || e.type !== 'body') return;
    const frame = obs.engine.relCam.frame(obs.engine.nav.pose(), obs.engine.t);
    const rows: number[] = [];
    const d = e.body.data;
    for (let k = 0; k < e.nSamples; k++) {
      const A = k * SAMPLE_SIZE;
      rows.push(d[A], d[A + 1], d[A + 2], d[A + 3], d[A + 4], d[A + 5], d[A + 6], d[A + 7], d[A + 8]);
    }
    const tEnd = e.tComputed;
    const delay = Math.hypot(...frame.pos);
    store.set({ busy: 'Resolviendo el problema emisor–observador (rayos de la cámara al objeto)…' });
    const res = await obs.client.track({
      a: e.a,
      emitter: Float64Array.from(rows),
      stride: 9,
      camera: { pos: frame.pos, e: frame.e.map((v) => Array.from(v)) },
      tFrom: e.tLaunch + delay * 0.9,
      tTo: tEnd + delay + 120,
      n: 90,
    });
    store.set({ busy: null });
    setTrack({ id: e.id, res });
    if (!res.found.some((f) => f)) toast('No se encontró ninguna señal: el objeto puede quedar oculto tras el agujero desde esta cámara.', 'aviso');
  };

  const exportCsv = () => {
    if (!e || e.type !== 'body') return;
    const sc = obs.engine.scales;
    const head = ['t_M', 't_s', 'tau_s', 'x_M', 'y_M', 'z_M', 'r_M', 'ut', 'ux', 'uy', 'uz', 'p_t', 'p_x', 'p_y', 'p_z', 'Exx_s-2', 'Exy_s-2', 'Exz_s-2', 'Eyy_s-2', 'Eyz_s-2', 'Ezz_s-2', 'K_M-4', 'dmu2', 'dE_rel', 'dL_rel', 'dQ_rel', 'tension_Pa', 'banderas'];
    const lines = [head.join(',')];
    const d = e.body.data;
    for (let k = 0; k < e.nSamples; k++) {
      const A = k * SAMPLE_SIZE;
      const row = [d[A], d[A] * sc.tg, d[A + 8], d[A + 1], d[A + 2], d[A + 3], d[A + 36], d[A + 4], d[A + 5], d[A + 6], d[A + 7], d[A + 9], d[A + 10], d[A + 11], d[A + 12], d[A + 25], d[A + 26], d[A + 27], d[A + 28], d[A + 29], d[A + 30], d[A + 31], d[A + 32], d[A + 33], d[A + 34], d[A + 35], d[A + 37], d[A + 38]];
      lines.push(row.map((v) => (Number.isInteger(v) ? String(v) : v.toPrecision(12))).join(','));
    }
    download(`sgra-${e.label.replace(/\s+/g, '-')}-telemetria.csv`, lines.join('\n'), 'text/csv');
  };

  const exportJson = () => {
    if (!e) return;
    const out = {
      experimento: { id: e.id, etiqueta: e.label, objeto: e.cfg.object, escenario: e.cfg.scenario, espin: e.a, tLanzamientoM: e.tLaunch, configuracion: e.cfg, info: e.info, avisos: e.warnings, eventos: e.events, estado: e.status },
      unidades: { longitud: 'M (r_g)', tiempo: 'M (t_g) y s', marea: 's⁻²', K: 'M⁻⁴' },
      escalas: obs.engine.scales,
      muestras: e.type === 'body' ? Array.from(e.body.data.subarray(0, e.nSamples * SAMPLE_SIZE)) : undefined,
      disposicion: 'Cada muestra: [t, x, y, z, uᵗ, uˣ, uʸ, uᶻ, τ(s), p_t, p_x, p_y, p_z, e1(4), e2(4), e3(4), E_ij(6, s⁻²), K, |Δμ²|, ΔE, ΔL, ΔQ, r, tensión(Pa), banderas, —]',
      fotones: e.type === 'beam' ? e.photonSummary : undefined,
      senal: track && track.id === e.id ? track.res : undefined,
    };
    download(`sgra-${e.label.replace(/\s+/g, '-')}.json`, JSON.stringify(out));
  };

  const slotA = exps.find((x) => x.slot === 'A');
  const slotB = exps.find((x) => x.slot === 'B');
  const { rPlus } = horizons(a);

  return (
    <>
      <Section title="Experimentos">
        {exps.length === 0 && <p className="note">Lanza objetos con ARROJAR. Cada experimento guarda su configuración, su semilla y su métrica: puede reiniciarse exactamente.</p>}
        <div className="exp-list">
          {exps.map((x) => (
            <div key={x.id} className={`exp${x.id === sel ? ' sel' : ''}`} onClick={() => store.set({ selectedExperiment: x.id, followExperiment: x.id })}>
              <span className="dot" style={{ background: x.color }} />
              <span>
                <div className="nm">
                  {x.label} {x.slot && <b style={{ color: 'var(--accent)' }}>· {x.slot}</b>}
                </div>
                <div className="st">
                  {x.status} · a* = {fmt(x.spin, 3)} · {x.scenario}
                </div>
              </span>
              <span className="acts" onClick={(ev) => ev.stopPropagation()}>
                <button title="Asignar a A" onClick={() => obs.assignSlot(x.id, 'A')}>
                  A
                </button>
                <button title="Asignar a B" onClick={() => obs.assignSlot(x.id, 'B')}>
                  B
                </button>
                <button title="Seguir con la cámara" onClick={() => store.set({ followExperiment: x.id, navMode: 'follow' })}>
                  <Crosshair />
                </button>
                <button title="Reiniciar con las mismas condiciones" onClick={() => obs.restartExperiment(x.id)}>
                  <RotateCcw />
                </button>
                <button title="Eliminar" onClick={() => obs.removeExperiment(x.id)}>
                  <Trash2 />
                </button>
              </span>
            </div>
          ))}
        </div>
        {exps.length > 0 && (
          <div className="btn-row">
            <button className="btn" onClick={() => obs.clearExperiments()}>
              <Trash2 /> Borrar todos
            </button>
            <button className="btn" onClick={() => download(`sgra-configuracion-${Date.now()}.json`, JSON.stringify(configSnapshot(), null, 2))}>
              <Download /> Configuración
            </button>
          </div>
        )}
      </Section>
      {e && (
        <>
          <div style={{ padding: '10px 16px 0' }}>
            <Segmented
              value={tab}
              onChange={setTab}
              options={[
                { value: 'estado', label: 'Estado' },
                { value: 'graficos', label: 'Gráficos' },
                { value: 'comparar', label: 'Comparar A/B' },
              ]}
            />
          </div>
          {tab === 'estado' && <StateTab e={e} tel={tel} />}
          {tab === 'graficos' && (
            <Section title={`Gráficos · ${e.label}`}>
              {S ? (
                <>
                  <div className="chart-title">
                    <span>Coordenada radial frente al tiempo propio y al coordenado</span>
                  </div>
                  <Chart
                    series={[
                      { name: 'r(τ)', color: e.color, x: S.tau, y: S.r },
                      { name: 'r(t)·', color: '#8b929b', x: S.t.map((v) => (v - e.tLaunch) * obs.engine.scales.tg), y: S.r, dashed: true },
                    ]}
                    xLabel="s"
                    yLabel="r [r_g]"
                    hLines={[{ y: rPlus, label: 'r₊', color: '#f07a6a' }]}
                    marks={e.events.filter((v) => v.kind === 'horizonte' || v.kind === 'fractura').map((v) => ({ x: v.tau, label: v.kind === 'horizonte' ? 'horizonte (τ)' : 'rotura' }))}
                  />
                  <div className="chart-title">
                    <span>Marea: estiramiento máximo λ y tensión frente a τ</span>
                  </div>
                  <Chart series={[{ name: 'λ [s⁻²]', color: '#6cc6d9', x: S.tau, y: S.lam }]} xLabel="τ [s]" yLabel="λ [s⁻²] (log)" logY hLines={CATALOG[e.cfg.object].breakModel.type !== 'none' ? [{ y: tel?.strength ?? NaN, label: 'λ crítico', color: '#f07a6a' }] : []} />
                  <div className="chart-title">
                    <span>Trayectoria proyectada en el plano ecuatorial (x, y)</span>
                  </div>
                  <Chart
                    series={[{ name: 'trayectoria', color: e.color, x: S.x, y: S.y }]}
                    xLabel="x [r_g]"
                    yLabel="y [r_g]"
                    equalAspect
                    height={220}
                    circles={[
                      { r: Math.sqrt(rPlus * rPlus + a * a), color: '#c9ced6' },
                      { r: Math.sqrt(iscoRadius(a, true) ** 2 + a * a), color: '#6cc6d9' },
                      { r: Math.sqrt(photonOrbitRadius(a, true) ** 2 + a * a), color: '#ffd27a' },
                    ]}
                  />
                  <div className="chart-title">
                    <span>Error numérico: máx(|Δμ²|, ΔE/E, ΔQ/Q)</span>
                  </div>
                  <Chart series={[{ name: 'deriva', color: '#c48df0', x: S.tau, y: S.drift }]} xLabel="τ [s]" yLabel="deriva (log)" logY />
                  <div className="chart-title">
                    <span>Señal recibida por la cámara (problema emisor–observador)</span>
                  </div>
                  <button className="btn" onClick={runTrack}>
                    Calcular desplazamiento al rojo y reloj recibido
                  </button>
                  {track && track.id === e.id && <SignalCharts e={e} res={track.res} tg={obs.engine.scales.tg} />}
                </>
              ) : (
                <p className="note">Los gráficos de trayectoria están disponibles para cuerpos (no para nubes ni haces). Para la nube y el haz usa el diagrama y la telemetría.</p>
              )}
              <div className="btn-row">
                <button className="btn" onClick={exportCsv} disabled={e.type !== 'body'}>
                  <Download /> CSV
                </button>
                <button className="btn" onClick={exportJson}>
                  <Download /> JSON
                </button>
              </div>
            </Section>
          )}
          {tab === 'comparar' && <CompareTab A={slotA ? obs.client.experiments.get(slotA.id) ?? null : null} B={slotB ? obs.client.experiments.get(slotB.id) ?? null : null} tg={obs.engine.scales.tg} />}
        </>
      )}
    </>
  );
}

function StateTab({ e, tel }: { e: Experiment; tel: ReturnType<typeof store.get>['telemetry'] }) {
  const sc = useObs().engine.scales;
  if (!tel) return null;
  const v = (x: number, d = 6) => (Number.isFinite(x) ? x.toPrecision(d) : '—');
  return (
    <>
      <Section title="Estado en el instante t">
        <Row label="t (Kerr–Schild)" tip="Tiempo coordenado de Kerr–Schild entrante (lejos del agujero coincide con el de un observador estático en el infinito, salvo una constante).">
          {fmt(tel.t, 3)} M · {duration(tel.t * sc.tg)}
        </Row>
        <Row label="τ (tiempo propio)">{duration(tel.tau)}</Row>
        <Row label="(x, y, z) KS">{tel.pos.length ? tel.pos.map((q) => fmt(q, 4)).join(', ') : '—'}</Row>
        <Row label="(r, θ, φ̃)">
          {fmt(tel.r, 5)} · {fmt(tel.thetaDeg, 2)}° · {fmt(tel.phiDeg, 2)}°
        </Row>
        <Row label="u^μ (cuadrivelocidad)">{tel.u.length ? tel.u.map((q) => v(q, 5)).join(', ') : '—'}</Row>
        <Row label="p_μ (por unidad de masa)">{tel.p.length ? tel.p.map((q) => v(q, 5)).join(', ') : '—'}</Row>
        <Row label="Velocidad relativa" tip={`Respecto de un ${tel.vObserver}.`}>
          {speedC(tel.vLocal)}
        </Row>
      </Section>
      <Section title="Constantes del movimiento y error numérico" note="E, L_z y Q son exactas a lo largo de una geodésica de Kerr; su deriva mide el error de la integración (tolerancia 10⁻¹⁰).">
        <Row label="E = −p_t">{v(tel.E, 10)}</Row>
        <Row label="L_z = p_φ">{v(tel.Lz, 10)}</Row>
        <Row label="Q (Carter)">{v(tel.Q, 10)}</Row>
        <Row label="|Δμ²| (ligadura de masa)">{sci(tel.drift[0], 2)}</Row>
        <Row label="ΔE/E · ΔL/L · ΔQ/Q">
          {sci(tel.drift[1], 1)} · {sci(tel.drift[2], 1)} · {sci(tel.drift[3], 1)}
        </Row>
      </Section>
      <Section title="Curvatura y marea" note="Tensor de marea E_ij del Riemann numérico en el marco giroscópico del objeto; validado frente al escalar de Kretschmann analítico (error < 10⁻⁶).">
        <Row label="Kretschmann K" tip="Invariante R_abcd R^abcd; sin significado visual directo: mide la intensidad de la curvatura.">
          {sci(tel.K, 3)} M⁻⁴ = {sci(tel.K / (sc.rg ** 4), 2)} m⁻⁴
        </Row>
        <Row label="Estiramiento máx. λ">{sci(tel.lambda, 3)} s⁻²</Row>
        <Row label="Compresión máx.">{sci(tel.compression, 3)} s⁻²</Row>
        <Row label="λ crítico de rotura">{sci(tel.strength, 3)} s⁻²</Row>
        <Row label="Tensión de marea estimada">{sci(tel.stress, 3)} Pa</Row>
        <Row label="Persona de 1,8 m (cabeza–pies)" tip="Diferencia de aceleración de marea entre cabeza y pies. 9,8 m/s² = 1 g.">
          {sci(tel.humanAcc, 2)} m/s² ({sci(tel.humanAcc / 9.81, 2)} g)
        </Row>
        <Row label="Fragmentos">{tel.pieces}</Row>
      </Section>
      <Section title="Eventos registrados">
        <ul className="events">
          {e.events.map((ev, i) => (
            <li key={i}>
              <span className="when">{ev.tau > 0 ? `τ ${fmt(ev.tau, 1)} s` : `t ${fmt(ev.t, 1)} M`}</span>
              <span>{ev.text}</span>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Condiciones iniciales registradas" defaultOpen={false}>
        {Object.entries(e.info).map(([k, val]) => (
          <Row key={k} label={k}>
            {typeof val === 'number' ? v(val, 8) : val}
          </Row>
        ))}
        <Row label="Semilla">{e.cfg.seed}</Row>
      </Section>
    </>
  );
}

function SignalCharts({ e, res, tg }: { e: Experiment; res: TrackResult; tg: number }) {
  const ok = res.found.map((f, i) => (f ? i : -1)).filter((i) => i >= 0);
  const tr = ok.map((i) => (res.tRec[i] - e.tLaunch) * tg);
  const z = ok.map((i) => 1 / res.g[i] - 1);
  const tauE = ok.map((i) => res.tauEmit[i]);
  const hor = e.events.find((v) => v.kind === 'horizonte');
  const own: Series = { name: 'τ del objeto en t', color: '#8b929b', dashed: true, x: [] as number[], y: [] as number[] };
  const d = e.body.data;
  const idx = downsample(e.nSamples, 300);
  own.x = idx.map((k) => (d[k * SAMPLE_SIZE + S_T] - e.tLaunch) * tg);
  own.y = idx.map((k) => d[k * SAMPLE_SIZE + S_TAU]);
  return (
    <>
      <Chart series={[{ name: '1 + z = 1/g', color: '#f07a6a', x: tr, y: z.map((q) => 1 + q) }]} xLabel="t de recepción [s]" yLabel="1+z (log)" logY />
      <Chart series={[{ name: 'τ emitido que recibe la cámara', color: '#e3a54a', x: tr, y: tauE }, own]} xLabel="t [s]" yLabel="τ del reloj [s]" hLines={hor ? [{ y: hor.tau, label: 'τ al cruzar r₊', color: '#f07a6a' }] : []} />
      <p className="note">
        La cámara recibe imágenes cada vez más enrojecidas de instantes del reloj cada vez más próximos al cruce: la imagen se «congela» y se apaga, mientras que en el modelo el reloj sigue avanzando y cruza el horizonte en τ = {hor ? fmt(hor.tau, 1) : '—'} s. Ninguna señal emitida dentro del horizonte llega a la cámara.
      </p>
    </>
  );
}

function CompareTab({ A, B, tg }: { A: Experiment | null; B: Experiment | null; tg: number }) {
  if (!A || !B) return <Section title="Comparación">{<p className="note">Asigna dos experimentos a los huecos A y B (botones A/B de la lista). Pueden diferir en objeto, escenario, condiciones iniciales o espín: las leyes físicas son las mismas en ambos.</p>}</Section>;
  const sA = A.type === 'body' ? seriesFor(A) : null;
  const sB = B.type === 'body' ? seriesFor(B) : null;
  const ser: Series[] = [];
  if (sA) ser.push({ name: `A · ${A.label}`, color: A.color, x: sA.tau, y: sA.r });
  if (sB) ser.push({ name: `B · ${B.label}`, color: B.color, x: sB.tau, y: sB.r, dashed: true });
  const serT: Series[] = [];
  if (sA) serT.push({ name: 'A', color: A.color, x: sA.t.map((v) => (v - A.tLaunch) * tg), y: sA.tau });
  if (sB) serT.push({ name: 'B', color: B.color, x: sB.t.map((v) => (v - B.tLaunch) * tg), y: sB.tau, dashed: true });
  const ev = (e: Experiment, k: string) => e.events.find((v) => v.kind === k);
  return (
    <Section title="Comparación A / B">
      <Chart series={ser} xLabel="τ [s]" yLabel="r [r_g]" />
      <Chart series={serT} xLabel="t [s]" yLabel="τ [s]" />
      {[A, B].map((e, i) => (
        <div key={e.id}>
          <Row label={`${i === 0 ? 'A' : 'B'} · ${e.label}`}>a* = {fmt(e.a, 3)}</Row>
          <Row label="E · L_z">
            {typeof e.info.E === 'number' ? (e.info.E as number).toPrecision(6) : '—'} · {typeof e.info.Lz === 'number' ? (e.info.Lz as number).toPrecision(6) : '—'}
          </Row>
          <Row label="Horizonte (τ)">{ev(e, 'horizonte') ? duration(ev(e, 'horizonte')!.tau) : 'no lo cruza'}</Row>
          <Row label="Rotura">{ev(e, 'fractura') ? `r = ${fmt(ev(e, 'fractura')!.r, 3)} r_g` : '—'}</Row>
        </div>
      ))}
    </Section>
  );
}
