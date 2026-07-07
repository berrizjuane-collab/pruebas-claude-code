/** Cursor-following tooltip for hovered stations. */
import React, { useEffect, useState } from 'react';
import { useStore } from '../state/store.js';
import { GRAPH } from '../graph/buildGraph.js';
import { LineChip, formatWeight } from './common.jsx';

export default function Tooltip() {
  const id = useStore((s) => s.hoveredStation);
  const weightKey = useStore((s) => s.weightKey);
  const dist = useStore((s) => (id ? s.visual.distMap.get(id) : undefined));
  const [pos, setPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const move = (e) => setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener('pointermove', move);
    return () => window.removeEventListener('pointermove', move);
  }, []);

  if (!id) return null;
  const n = GRAPH.nodes.get(id);

  return (
    <div className="tooltip" style={{ left: pos.x + 14, top: pos.y + 12 }}>
      <div className="tooltip-name">
        {n.name} <span className="jp">{n.ja}</span>
      </div>
      <div className="tooltip-lines">
        {n.lines.map((l) => (
          <LineChip key={l} id={l} size={12} />
        ))}
        {n.isHub && <span className="dim-text">transfer</span>}
      </div>
      {dist !== undefined && (
        <div className="tooltip-dist">d = {formatWeight(dist, weightKey)}</div>
      )}
    </div>
  );
}
