/**
 * Algorithm console: mode selection, inputs, transport controls, the live
 * priority-queue / edge-queue HUD, counters and the final result readout.
 * Everything shown here is read from the recorded execution trace — the panel
 * is a window into the real algorithm state at the current step.
 */
import React from 'react';
import { useStore } from '../state/store.js';
import { GRAPH, EDGE_BY_ID } from '../graph/buildGraph.js';
import { LineChip, stationName, formatWeight, groupLegs } from './common.jsx';

const MODE_INFO = {
  explore: {
    title: 'FREE EXPLORATION',
    desc: 'Orbit the network. Click a station for details; spotlight lines from the roster.',
  },
  dijkstra: {
    title: 'DIJKSTRA — POINT-TO-POINT SHORTEST PATH',
    desc: 'Pick an ORIGIN (green) and a DESTINATION (red) on the map. The engine settles stations in true priority order and relaxes every outgoing edge.',
  },
  prim: {
    title: 'PRIM — MINIMUM SPANNING TREE (SEEDED)',
    desc: 'Pick ONE seed station — no destination. Prim does not answer routes: it grows the cheapest network that reaches every station, always absorbing the cheapest edge that crosses the tree boundary.',
  },
  kruskal: {
    title: 'KRUSKAL — MINIMUM SPANNING TREE (GLOBAL)',
    desc: 'No input stations. All segments are sorted by weight and evaluated in order; union–find rejects any edge that would close a cycle (flashes red).',
  },
};

function SelectionChips() {
  const mode = useStore((s) => s.mode);
  const origin = useStore((s) => s.origin);
  const dest = useStore((s) => s.dest);
  const seed = useStore((s) => s.seed);

  if (mode === 'dijkstra') {
    return (
      <div className="sel-rows">
        <div className="sel-row">
          <span className="dot origin" />
          <span className="sel-label">ORIGIN</span>
          <span className="sel-value">{origin ? stationName(origin) : 'click a station…'}</span>
        </div>
        <div className="sel-row">
          <span className="dot dest" />
          <span className="sel-label">DEST</span>
          <span className="sel-value">{dest ? stationName(dest) : origin ? 'click a station…' : '—'}</span>
        </div>
      </div>
    );
  }
  if (mode === 'prim') {
    return (
      <div className="sel-rows">
        <div className="sel-row" title="Prim needs only a starting node: the MST it builds is the same network no matter where it starts — the seed just changes the growth order.">
          <span className="dot origin" />
          <span className="sel-label">SEED</span>
          <span className="sel-value">{seed ? stationName(seed) : 'click a station…'}</span>
          <span className="info-mark" title="Why no destination? Prim doesn't solve routes — it builds the minimal total network. The seed only sets where growth begins.">?</span>
        </div>
      </div>
    );
  }
  if (mode === 'kruskal') {
    return <div className="sel-rows"><div className="sel-row"><span className="sel-value dim-text">No inputs — Kruskal is global by nature.</span></div></div>;
  }
  return null;
}

function Transport() {
  const playing = useStore((s) => s.playing);
  const stepIndex = useStore((s) => s.stepIndex);
  const total = useStore((s) => s.steps.length);
  const speed = useStore((s) => s.speed);
  const st = useStore.getState();

  return (
    <div className="transport">
      <div className="transport-buttons">
        <button onClick={() => st.resetRun()} title="Reset to step 0 (R)">⏮</button>
        {playing ? (
          <button className="primary" onClick={() => st.pause()} title="Pause (space)">⏸</button>
        ) : (
          <button className="primary" onClick={() => st.play()} title="Play (space)">▶</button>
        )}
        <button onClick={() => st.stepOnce()} title="Advance one step (→)">⏭</button>
        <span className="step-counter">{stepIndex + 1} / {total}</span>
      </div>
      <label className="speed-row">
        <span>SPEED</span>
        <input
          type="range"
          min="1"
          max="60"
          value={speed}
          onChange={(e) => st.setSpeed(Number(e.target.value))}
        />
        <span className="speed-val">{speed} st/s</span>
      </label>
      <input
        className="scrub"
        type="range"
        min="0"
        max={Math.max(total - 1, 0)}
        value={Math.max(stepIndex, 0)}
        onChange={(e) => st.setIndex(Number(e.target.value))}
        title="Scrub through the execution"
      />
    </div>
  );
}

function Counters() {
  const mode = useStore((s) => s.mode);
  const counts = useStore((s) => s.visual.counts);
  const components = useStore((s) => s.visual.components);

  if (mode === 'dijkstra') {
    return (
      <div className="counters">
        <span>SETTLED <b>{counts.settled}</b></span>
        <span>RELAXATIONS <b>{counts.considered}</b></span>
      </div>
    );
  }
  if (mode === 'prim') {
    return (
      <div className="counters">
        <span>IN TREE <b>{counts.settled}</b></span>
        <span>EDGES EVALUATED <b>{counts.considered}</b></span>
        <span>MST EDGES <b>{counts.accepted}</b></span>
      </div>
    );
  }
  return (
    <div className="counters">
      <span>ACCEPTED <b className="ok-text">{counts.accepted}</b></span>
      <span>REJECTED <b className="bad-text">{counts.rejected}</b></span>
      <span>COMPONENTS <b>{components ?? GRAPH.nodes.size}</b></span>
    </div>
  );
}

function QueueHud() {
  const mode = useStore((s) => s.mode);
  const weightKey = useStore((s) => s.weightKey);
  const pq = useStore((s) => s.visual.pq);
  const queue = useStore((s) => s.visual.queue);

  if (mode === 'kruskal') {
    if (!queue) return null;
    return (
      <div className="queue-hud">
        <h4>SORTED EDGE QUEUE <span className="dim-text">next up</span></h4>
        <ol className="queue-list">
          {queue.upcoming.length === 0 && <li className="queue-empty">queue exhausted</li>}
          {queue.upcoming.map(({ edge, w }, i) => {
            const e = EDGE_BY_ID.get(edge);
            return (
              <li key={edge} className={i === 0 ? 'next' : ''}>
                <LineChip id={e.line} size={13} />
                <span className="q-name">{stationName(e.a)} ⇄ {stationName(e.b)}</span>
                <span className="q-w">{formatWeight(w, weightKey)}</span>
              </li>
            );
          })}
        </ol>
      </div>
    );
  }

  return (
    <div className="queue-hud">
      <h4>PRIORITY QUEUE <span className="dim-text">{pq.size} in frontier</span></h4>
      <ol className="queue-list">
        {pq.top.length === 0 && <li className="queue-empty">empty</li>}
        {pq.top.map(({ node, d }, i) => (
          <li key={node} className={i === 0 ? 'next' : ''}>
            <span className="q-rank">{i + 1}</span>
            <span className="q-name">{stationName(node)}</span>
            <span className="q-w">{formatWeight(d, weightKey)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ResultBox() {
  const done = useStore((s) => s.visual.done);
  const weightKey = useStore((s) => s.weightKey);
  const mstCheck = useStore((s) => s.mstCheck);
  if (!done) return null;

  if (done.algo === 'dijkstra') {
    if (!done.path) return <div className="result-box bad">No route found (disconnected?)</div>;
    const legs = groupLegs(done.path, done.pathEdges);
    return (
      <div className="result-box">
        <h4>ROUTE LOCKED</h4>
        <div className="result-stats">
          <span>TOTAL <b>{done.totalTime} min</b></span>
          <span>DIST <b>{done.totalDist.toFixed(1)} km</b></span>
          <span>TRANSFERS <b>{done.transfers}</b></span>
          <span>SETTLED <b>{done.settledCount}</b></span>
        </div>
        <ol className="legs">
          {legs.map((leg, i) => (
            <li key={i}>
              <LineChip id={leg.line} size={14} />
              <span className="leg-route">{stationName(leg.from)} → {stationName(leg.to)}</span>
              <span className="leg-meta">{leg.stops} stop{leg.stops > 1 ? 's' : ''} · {leg.time} min</span>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  return (
    <div className="result-box">
      <h4>MST COMPLETE — {done.algo.toUpperCase()}</h4>
      <div className="result-stats">
        <span>TOTAL WEIGHT <b>{formatWeight(done.total, weightKey)}</b></span>
        <span>EDGES <b>{done.edgeCount}</b> (= {done.nodeCount} − 1 nodes)</span>
        {done.algo === 'kruskal' && (
          <span>EVALUATED <b>{done.evaluated}</b> · skipped {done.skipped}</span>
        )}
      </div>
      {mstCheck && (
        <div className={`crosscheck ${mstCheck.match ? 'ok' : 'bad'}`}>
          CROSS-CHECK — PRIM {formatWeight(mstCheck.prim, weightKey)} | KRUSKAL {formatWeight(mstCheck.kruskal, weightKey)} {mstCheck.match ? '✓ totals agree' : '✗ MISMATCH'}
        </div>
      )}
    </div>
  );
}

export default function AlgoPanel() {
  const mode = useStore((s) => s.mode);
  const weightKey = useStore((s) => s.weightKey);
  const hasSteps = useStore((s) => s.steps.length > 0);
  const canRun = useStore(
    (s) =>
      (s.mode === 'dijkstra' && s.origin && s.dest) ||
      (s.mode === 'prim' && s.seed) ||
      s.mode === 'kruskal',
  );
  const st = useStore.getState();
  const info = MODE_INFO[mode];

  return (
    <aside className="panel algo-panel">
      <h3 className="panel-title">ALGORITHM ENGINE <span className="jp">解析</span></h3>

      <div className="mode-row">
        {['explore', 'dijkstra', 'prim', 'kruskal'].map((m) => (
          <button
            key={m}
            className={`mode-btn${mode === m ? ' active' : ''}`}
            onClick={() => st.setMode(m)}
          >
            {m.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="mode-info">
        <div className="mode-info-title">{info.title}</div>
        <p className="mode-info-desc">{info.desc}</p>
      </div>

      {mode !== 'explore' && (
        <>
          <div className="weight-row">
            <span className="sel-label">OPTIMIZE BY</span>
            <div className="segmented">
              <button
                className={weightKey === 'time' ? 'active' : ''}
                onClick={() => st.setWeightKey('time')}
              >
                TIME (min)
              </button>
              <button
                className={weightKey === 'dist' ? 'active' : ''}
                onClick={() => st.setWeightKey('dist')}
              >
                DISTANCE (km)
              </button>
            </div>
          </div>

          <SelectionChips />

          <div className="run-row">
            <button className="run-btn" disabled={!canRun} onClick={() => st.run()}>
              {hasSteps ? '↻ RE-RUN' : '▶ RUN'}
            </button>
            <button className="ghost-btn" onClick={() => st.clearSelection()}>CLEAR</button>
          </div>

          {hasSteps && (
            <>
              <Transport />
              <Counters />
              <QueueHud />
              <ResultBox />
            </>
          )}
        </>
      )}
    </aside>
  );
}
