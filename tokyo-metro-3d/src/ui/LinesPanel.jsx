/**
 * Line roster (doubles as the map legend). Hover = temporary spotlight,
 * click = pinned spotlight; everything else on the map dims.
 */
import React, { useMemo } from 'react';
import { LINES } from '../data/lines.js';
import { GRAPH } from '../graph/buildGraph.js';
import { useStore } from '../state/store.js';

export default function LinesPanel() {
  const selectedLine = useStore((s) => s.selectedLine);
  const hoveredLine = useStore((s) => s.hoveredLine);

  const perLine = useMemo(() => {
    const km = new Map(LINES.map((l) => [l.id, 0]));
    for (const e of GRAPH.edges) km.set(e.line, km.get(e.line) + e.dist);
    return km;
  }, []);

  return (
    <aside className="panel lines-panel">
      <h3 className="panel-title">LINES <span className="jp">路線</span></h3>
      <ul className="line-list">
        {LINES.map((line) => {
          const active = selectedLine === line.id || hoveredLine === line.id;
          return (
            <li key={line.id}>
              <button
                className={`line-row${active ? ' active' : ''}${selectedLine === line.id ? ' pinned' : ''}`}
                onMouseEnter={() => useStore.getState().hoverLine(line.id)}
                onMouseLeave={() => useStore.getState().hoverLine(null)}
                onClick={() => useStore.getState().selectLine(line.id)}
                style={{ '--line-color': line.color }}
              >
                <span className="line-badge" style={{ background: line.color }}>{line.id}</span>
                <span className="line-names">
                  <span className="line-name">{line.name}</span>
                  <span className="line-ja">{line.ja}</span>
                </span>
                <span className="line-meta">
                  {line.stations.length} st · {Math.round(perLine.get(line.id))} km
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="panel-hint">hover = spotlight · click = pin</div>
    </aside>
  );
}
