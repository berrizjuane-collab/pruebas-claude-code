// ============================================================================
// HUD diegético. React maneja el estado discreto (selección, época, paneles);
// las lecturas de alta frecuencia (ángulos, fps, marcador) se escriben
// imperativamente vía refs para no re-renderizar a 60 Hz.
// ============================================================================

import { useEffect, useRef, useState, useCallback, memo } from 'react';
import { createEngine, DEFAULT_VELS } from './engine.js';
import { runValidations } from './validate.js';
import { ROTATION_PLANES } from './math.js';

const fmtT = (t) => (t === 0 ? 'T·0' : t > 0 ? `T+${t}` : `T−${-t}`);
const fmtYears = (t) =>
  t === 0 ? 'ahora' : `${Math.abs(t)} año${Math.abs(t) > 1 ? 's' : ''} al ${t > 0 ? 'futuro' : 'pasado'}`;

const HINTS = [
  'arrastrá para orbitar — la cámara vive fuera del espacio-tiempo',
  'girá el plano XW: el tiempo se despliega como un eje espacial',
  'clic en una habitación la selecciona · clic de nuevo o ⏎ para entrar',
  'mantené presionado: tu dedo es un pozo de gravedad sobre el polvo',
  'agitá el polvo con energía: cada señal bifurca la línea de tiempo',
  'en una bifurcación ⑂ elegí qué rama seguir — todas las variantes existen',
  'rueda para acercarte · ← → recorren el árbol · espacio pausa la deriva',
];

const MORSE_TEXT = ['· · ·', '—', '· —', '— · — —'];
const MORSE_LETTERS = ['S', 'T', 'A', 'Y'];

// ── Panel de rotación 4D ────────────────────────────────────────────────────

const PLANE_HINTS = {
  xy: 'esp', xz: 'esp', yz: 'esp',
  xw: 't↔x', yw: 't↔y', zw: 't↔z',
};

const RotationPanel = memo(function RotationPanel({ engine, paused, audio, angleRefs }) {
  const [vels, setVels] = useState({ ...DEFAULT_VELS });
  const [d4, setD4] = useState(3.2);

  useEffect(() => {
    const onPreset = (e) => setVels({ ...e.detail });
    window.addEventListener('tesseract:vels', onPreset);
    return () => window.removeEventListener('tesseract:vels', onPreset);
  }, []);

  const setVel = (key, v) => {
    setVels((s) => ({ ...s, [key]: v }));
    engine.setVelocity(key, v);
  };

  return (
    <section className="panel tr" aria-label="Rotación 4D">
      <h2 className="label">Rotación 4D · 6 planos</h2>
      {ROTATION_PLANES.map(({ key }) => (
        <div className="dial" key={key}>
          <span className="dial-name">{key.toUpperCase()}</span>
          <input
            type="range" min="-0.5" max="0.5" step="0.005"
            value={vels[key]}
            onChange={(e) => setVel(key, parseFloat(e.target.value))}
            onDoubleClick={() => setVel(key, 0)}
            aria-label={`velocidad plano ${key}`}
          />
          <b className="dial-read" ref={(el) => { angleRefs.current[key] = el; }}>0.000</b>
          <i className="dial-kind">{PLANE_HINTS[key]}</i>
        </div>
      ))}
      <div className="dial focal">
        <span className="dial-name">d₄</span>
        <input
          type="range" min="2.4" max="4.6" step="0.05" value={d4}
          onChange={(e) => { const v = parseFloat(e.target.value); setD4(v); engine.setD4(v); }}
          aria-label="distancia focal 4D"
        />
        <b className="dial-read">{d4.toFixed(2)}</b>
        <i className="dial-kind">foco 4D</i>
      </div>
      <div className="btn-row">
        <button onClick={() => { engine.collapseTime(); window.dispatchEvent(new CustomEvent('tesseract:vels', { detail: { xy: 0, xz: 0, xw: 0, yz: 0, yw: 0, zw: 0 } })); }}>
          colapsar
        </button>
        <button onClick={() => { engine.unfoldTime(); window.dispatchEvent(new CustomEvent('tesseract:vels', { detail: { ...DEFAULT_VELS } })); }}>
          desplegar
        </button>
        <button onClick={() => engine.setPaused(!paused)} aria-pressed={paused}>
          {paused ? '▶ deriva' : '‖ deriva'}
        </button>
        <button onClick={() => engine.setAudio(!audio)} aria-pressed={audio}>
          {audio ? '● sonido' : '○ sonido'}
        </button>
      </div>
    </section>
  );
});

// ── Árbol de navegación temporal ────────────────────────────────────────────
// Ya no es una lista: cada nodo muestra su línea (indentación por profundidad
// de rama) y las bifurcaciones ⑂ indican cuántas ramas abren.

const TimeRail = memo(function TimeRail({ engine, tree, selection, gliding }) {
  const sel = tree.find((n) => n.key === selection);
  return (
    <nav className="rail" aria-label="Árbol de líneas temporales">
      <h2 className="label rail-label">Árbol de instantes</h2>
      <div className="rail-track">
        {tree.map((n) => (
          <button
            key={n.key}
            className={
              'rail-node' +
              (n.isAnchor ? ' anchor' : '') +
              (n.key === selection ? ' selected' : '') +
              (n.branchDepth > 0 ? ' alt' : '')
            }
            style={{ '--indent': Math.min(n.branchDepth, 3) }}
            disabled={n.isAnchor || gliding}
            onClick={() => !n.isAnchor && engine.select(n.key)}
            onDoubleClick={() => { if (!n.isAnchor) { engine.select(n.key); engine.enterSelected(); } }}
            title={n.isAnchor ? 'ancla actual' : `${fmtYears(n.timeIndex)}${n.pretty ? ' · línea ' + n.pretty : ''}`}
          >
            <i />
            <span>
              {fmtT(n.timeIndex)}
              {n.pretty && <small> {n.pretty}</small>}
            </span>
            {n.isFork && <em className="fork-badge">⑂{n.arms}</em>}
          </button>
        ))}
      </div>
      {sel && !gliding && (
        <button className="enter-btn" onClick={() => engine.enterSelected()}>
          entrar {fmtT(sel.timeIndex)}{sel.pretty ? ' ' + sel.pretty : ''} ⏎
        </button>
      )}
      {gliding && <div className="glide-note">atravesando el tiempo…</div>}
    </nav>
  );
});

// ── Panel matemático colapsable ─────────────────────────────────────────────

const MathPanel = memo(function MathPanel({ validation }) {
  const [open, setOpen] = useState(false);
  const [showList, setShowList] = useState(false);
  return (
    <section className={'panel bl' + (open ? ' open' : '')}>
      <button className="math-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="label">La matemática {open ? '▾' : '▸'}</span>
        <span className={'badge' + (validation.ok ? '' : ' bad')}>
          {validation.passed}/{validation.total} ✓
        </span>
      </button>
      {open && (
        <div className="math-body">
          <p>
            El teseracto es un 4-cubo real: <code>generateHypercube(n)</code> construye cada
            n-cubo por recursión — dos (n−1)-cubos unidos vértice a vértice — con 2ⁿ vértices y
            n·2ⁿ⁻¹ aristas (16 y 32 para n=4, contados en vivo al arrancar).
          </p>
          <p>
            Lo que ves es una proyección en perspectiva 4D→3D: escala = d₄/(d₄−w). Cada
            habitación es la misma habitación con otra coordenada w (otro instante). Al girar
            XW/YW/ZW el eje del tiempo rota hacia el espacio y el pasillo se despliega; su
            encogimiento no es un truco — es la perspectiva 4D real.
          </p>
          <p>
            El pasillo es una recursión genuina con <em>branching factor variable</em> —
            <code>renderRoom(depth, transform)</code> se llama a sí misma con casos base de
            profundidad y de escala proyectada; cada intervención tuya sobre el polvo convierte
            ese instante en una bifurcación de 2-3 líneas hijas que divergen también en Y/Z.
            La propiedad de árbol (aristas = nodos − 1) se verifica en vivo, y entrar en una
            habitación re-ancla la recursión en ese nodo.
          </p>
          <button className="list-toggle" onClick={() => setShowList(!showList)}>
            {showList ? 'ocultar' : 'ver'} las {validation.total} verificaciones
          </button>
          {showList && (
            <ul className="checks">
              {validation.results.map((r, i) => (
                <li key={i} className={r.ok ? 'ok' : 'fail'}>
                  {r.ok ? '✓' : '✗'} {r.name}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
});

// ── Barra de estado / señal ─────────────────────────────────────────────────

function SignalReadout({ phase, forked }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (phase !== 'hold') { setStep(0); return; }
    setStep(1);
    const id = setInterval(() => setStep((s) => Math.min(s + 1, 4)), 550);
    return () => clearInterval(id);
  }, [phase]);
  if (phase === 'idle') return null;
  return (
    <div className={'signal ' + phase}>
      {phase === 'forming' && <span className="signal-in">■ anomalía gravitacional — el polvo responde</span>}
      {phase === 'hold' && (
        <span className="signal-decode">
          {MORSE_LETTERS.slice(0, step).map((l, i) => (
            <b key={i}>{l}<i>{MORSE_TEXT[i]}</i></b>
          ))}
        </span>
      )}
      {phase === 'release' && (
        <span className="signal-out">
          {forked
            ? `…la señal se disuelve — este instante se bifurcó en ${forked} líneas ⑂`
            : '…la señal se disuelve'}
        </span>
      )}
    </div>
  );
}

// ── Aplicación ──────────────────────────────────────────────────────────────

export function App() {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const markerRef = useRef(null);
  const markerLabelRef = useRef(null);
  const angleRefs = useRef({});
  const fpsRef = useRef(null);
  const lastMarker = useRef({ t: null, mode: null });

  const [engine, setEngine] = useState(null);
  const [validation, setValidation] = useState(null);
  const [st, setSt] = useState({
    epoch: 0, anchorPretty: '', selection: null, hover: null, paused: false, audio: false,
    quality: 0, qualityName: 'ALTA', signalCount: 0, gliding: false,
    tree: [], stats: { nodes: 0, edges: 0, forks: 0, lines: 1 },
  });
  const [signal, setSignal] = useState({ phase: 'idle', forked: 0 });
  const [hintIdx, setHintIdx] = useState(0);

  useEffect(() => {
    try {
    const canvas = canvasRef.current;
    const eng = createEngine(canvas, {
      onState: (s) => setSt(s),
      onSignal: (s) => setSignal({ phase: s.phase, forked: s.forked || 0 }),
      onTelemetry: (t) => {
        for (const { key } of ROTATION_PLANES) {
          const el = angleRefs.current[key];
          if (el) {
            const a = t.angles[key] % (Math.PI * 2);
            el.textContent = (a < 0 ? a + Math.PI * 2 : a).toFixed(3);
          }
        }
        if (fpsRef.current) fpsRef.current.textContent = `${Math.round(t.fps)} fps`;
      },
      onMarker: (m) => {
        const el = markerRef.current;
        if (!el) return;
        if (!m.visible) { el.style.opacity = '0'; return; }
        el.style.opacity = '1';
        el.style.transform = `translate(${m.x - m.size / 2}px, ${m.y - m.size / 2}px)`;
        el.style.width = `${m.size}px`;
        el.style.height = `${m.size}px`;
        const sig = m.timeIndex + '|' + (m.pretty || '') + '|' + m.mode;
        if (lastMarker.current.t !== sig) {
          lastMarker.current = { t: sig };
          el.dataset.mode = m.mode;
          if (markerLabelRef.current) {
            const name = fmtT(m.timeIndex) + (m.pretty ? ' ' + m.pretty : '') + (m.isFork ? ' ⑂' : '');
            markerLabelRef.current.textContent =
              m.mode === 'selected'
                ? `${name} · ⏎ entrar`
                : `${name} · ${fmtYears(m.timeIndex)}`;
          }
        }
      },
    });
    engineRef.current = eng;
    window.__ENGINE__ = eng;

    const summary = runValidations(eng.hooks);
    window.__VALIDATION__ = { passed: summary.passed, total: summary.total, ok: summary.ok };
    setValidation(summary);
    eng.requestState();
    setEngine(eng);

    return () => eng.dispose();
    } catch (err) {
      window.__BOOT_ERROR__ = String(err && err.stack || err);
      console.error('[TESERACTO] error de arranque:', err);
    }
  }, []);

  useEffect(() => {
    const id = setInterval(() => setHintIdx((i) => (i + 1) % HINTS.length), 9000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="stage">
      <canvas ref={canvasRef} id="scene" />

      {/* marcador de habitación: posicionado con project3Dto2D pura */}
      <div className="marker" ref={markerRef} data-mode="hover">
        <i className="c tl" /><i className="c tr" /><i className="c bl" /><i className="c br" />
        <span className="marker-label" ref={markerLabelRef} />
      </div>

      {engine && validation && (
        <>
          <header className="panel tl">
            <p className="eyebrow">Gargantua · interior del horizonte</p>
            <h1>Biblioteca tesseráctica</h1>
            <p className="status">
              época ancla <b>{fmtT(st.epoch)}{st.anchorPretty ? ' ' + st.anchorPretty : ''}</b>
              {st.epoch !== 0 && <span> · {fmtYears(st.epoch).replace('al', 'hacia el')}</span>}
              <span> · árbol: {st.stats.nodes} nodos</span>
              {st.stats.forks > 0 && (
                <span> · {st.stats.forks} bifurcaci{st.stats.forks > 1 ? 'ones' : 'ón'} · {st.stats.lines} líneas</span>
              )}
              {st.signalCount > 0 && <span> · señales: {st.signalCount}</span>}
            </p>
          </header>

          <RotationPanel engine={engine} paused={st.paused} audio={st.audio} angleRefs={angleRefs} />
          <TimeRail engine={engine} tree={st.tree} selection={st.selection} gliding={st.gliding} />
          <MathPanel validation={validation} />

          <footer className="hintbar">
            <SignalReadout phase={signal.phase} forked={signal.forked} />
            {signal.phase === 'idle' && <p className="hint" key={hintIdx}>{HINTS[hintIdx]}</p>}
          </footer>

          <div className="fps">
            <span ref={fpsRef}>60 fps</span> · calidad {st.qualityName.toLowerCase()}
          </div>
        </>
      )}
    </div>
  );
}
