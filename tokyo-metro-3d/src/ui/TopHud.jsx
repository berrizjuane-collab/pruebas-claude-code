/** Top command bar: identity, network stat tiles, live run status. */
import React from 'react';
import { useStore } from '../state/store.js';
import { NETWORK_STATS } from '../graph/stats.js';
import { formatWeight } from './common.jsx';

const MODE_LABEL = {
  explore: 'EXPLORE',
  dijkstra: 'DIJKSTRA · SHORTEST PATH',
  prim: 'PRIM · MST',
  kruskal: 'KRUSKAL · MST',
};

function Tile({ label, value, accent }) {
  return (
    <div className={`tile${accent ? ' tile-accent' : ''}`}>
      <div className="tile-label">{label}</div>
      <div className="tile-value">{value}</div>
    </div>
  );
}

export default function TopHud() {
  const mode = useStore((s) => s.mode);
  const weightKey = useStore((s) => s.weightKey);
  const stepIndex = useStore((s) => s.stepIndex);
  const total = useStore((s) => s.steps.length);
  const playing = useStore((s) => s.playing);
  const labelsOn = useStore((s) => s.labelsOn);
  const mstCheck = useStore((s) => s.mstCheck);

  return (
    <header className="top-hud">
      <div className="brand">
        <div className="brand-title">TOKYO METRO <span className="brand-dim">// GRAPH CONTROL</span></div>
        <div className="brand-sub">東京メトロ路線網 — live algorithm engine</div>
      </div>

      <div className="tiles">
        <Tile label="STATIONS" value={NETWORK_STATS.V} />
        <Tile label="SEGMENTS" value={NETWORK_STATS.E} />
        <Tile label="LINES" value={9} />
        <Tile label="HUBS" value={NETWORK_STATS.hubs} />
        <Tile label="TRACK" value={`${NETWORK_STATS.trackKm} km`} />
        <Tile label="AVG DEG" value={NETWORK_STATS.avgDegree} />
        <Tile label="DIAMETER" value={`${NETWORK_STATS.diameter} min`} />
      </div>

      <div className="status-cluster">
        {mstCheck && (
          <div className={`mst-chip ${mstCheck.match ? 'ok' : 'bad'}`} title="Independent cross-validation: Prim and Kruskal must agree on the MST total weight">
            MST — PRIM {formatWeight(mstCheck.prim, weightKey)} | KRUSKAL {formatWeight(mstCheck.kruskal, weightKey)} {mstCheck.match ? '✓' : '✗'}
          </div>
        )}
        <div className="status-chip">{MODE_LABEL[mode]}</div>
        <div className="status-chip dim">{weightKey === 'time' ? 'WEIGHT: TIME' : 'WEIGHT: DISTANCE'}</div>
        {total > 0 && (
          <div className={`status-chip ${playing ? 'live' : ''}`}>
            STEP {stepIndex + 1}/{total}
          </div>
        )}
        <button
          className={`chip-btn${labelsOn ? ' on' : ''}`}
          onClick={() => useStore.getState().toggleLabels()}
          title="Toggle station labels"
        >
          LABELS
        </button>
      </div>
    </header>
  );
}
