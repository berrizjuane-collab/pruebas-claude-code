/** Bottom strip: algorithm color key while running, orbit hints otherwise. */
import React from 'react';
import { useStore } from '../state/store.js';

const KEYS = {
  dijkstra: [
    ['#2bff88', 'origin'],
    ['#ff4d6a', 'destination'],
    ['#ffd75e', 'frontier'],
    ['#37c8f0', 'settled'],
    ['#eafcff', 'relaxing'],
    ['#ffd75e', 'final path'],
  ],
  prim: [
    ['#2bff88', 'seed'],
    ['#ffd75e', 'frontier'],
    ['#2bff9e', 'MST edge'],
    ['#eafcff', 'evaluating'],
  ],
  kruskal: [
    ['#2bff9e', 'accepted'],
    ['#ff3355', 'rejected (cycle)'],
    ['#eafcff', 'testing'],
  ],
};

export default function Legend() {
  const mode = useStore((s) => s.mode);
  const keys = KEYS[mode];

  return (
    <footer className="legend">
      {keys ? (
        <div className="legend-keys">
          {keys.map(([c, label], i) => (
            <span key={i} className="legend-key">
              <span className="legend-dot" style={{ background: c, boxShadow: `0 0 6px ${c}` }} />
              {label}
            </span>
          ))}
        </div>
      ) : (
        <div className="legend-hint">drag = orbit · scroll = zoom · right-drag = pan · click station = dossier</div>
      )}
      <div className="legend-shortcuts">SPACE play/pause · → step · R reset</div>
    </footer>
  );
}
