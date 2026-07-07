/**
 * Station dossier: identity, serving lines, transfer options, exits — plus
 * live algorithm data (tentative distance from origin, membership in the
 * final path / MST) when an execution is on screen.
 */
import React from 'react';
import { useStore } from '../state/store.js';
import { GRAPH } from '../graph/buildGraph.js';
import { LINE_BY_ID } from '../data/lines.js';
import { LineChip, formatWeight } from './common.jsx';

const STATE_LABEL = {
  origin: ['ORIGIN', 'ok-text'],
  seed: ['SEED', 'ok-text'],
  dest: ['DESTINATION', 'bad-text'],
  settled: ['SETTLED — shortest distance final', 'cyan-text'],
  frontier: ['IN FRONTIER — tentative', 'amber-text'],
  tree: ['IN MST', 'ok-text'],
  path: ['ON FINAL PATH', 'amber-text'],
};

export default function StationPanel() {
  const id = useStore((s) => s.selectedStation);
  const weightKey = useStore((s) => s.weightKey);
  const visual = useStore((s) => s.visual);
  const origin = useStore((s) => s.origin);
  const dest = useStore((s) => s.dest);
  const seed = useStore((s) => s.seed);
  const running = useStore((s) => s.steps.length > 0);

  if (!id) return null;
  const n = GRAPH.nodes.get(id);

  let algoState = visual.nodeState.get(id) ?? null;
  if (id === origin) algoState = 'origin';
  else if (id === dest) algoState = 'dest';
  else if (id === seed) algoState = 'seed';

  const dist = visual.distMap.get(id);
  const inMst =
    running &&
    GRAPH.adjacency.get(id).some(({ edge }) => visual.edgeState.get(edge.id) === 'mst');

  return (
    <aside className="panel station-panel">
      <button className="close-btn" onClick={() => useStore.setState({ selectedStation: null })}>×</button>
      <h3 className="station-name">
        {n.name} <span className="jp">{n.ja}</span>
      </h3>

      <div className="station-lines">
        {n.lines.map((lid) => (
          <span key={lid} className="station-line">
            <LineChip id={lid} size={15} />
            <span>{LINE_BY_ID[lid].name}</span>
          </span>
        ))}
      </div>

      <div className="station-block">
        <div className="block-label">TRANSFERS</div>
        <div className="block-value">
          {n.isHub
            ? `Interchange between ${n.lines.map((l) => LINE_BY_ID[l].name).join(' / ')}`
            : 'None — single line station'}
        </div>
      </div>

      <div className="station-block">
        <div className="block-label">EXITS <span className="dim-text">(simulated)</span></div>
        <div className="exits">
          {n.exits.map((x) => (
            <span key={x} className="exit-chip">{x}</span>
          ))}
        </div>
      </div>

      {running && (
        <div className="station-block algo-block">
          <div className="block-label">ALGORITHM STATE</div>
          {algoState && STATE_LABEL[algoState] && (
            <div className={`block-value ${STATE_LABEL[algoState][1]}`}>{STATE_LABEL[algoState][0]}</div>
          )}
          {!algoState && !inMst && <div className="block-value dim-text">not reached yet</div>}
          {dist !== undefined && (
            <div className="block-value">
              distance from {seed ? 'seed' : 'origin'}: <b>{formatWeight(dist, weightKey)}</b>
            </div>
          )}
          {inMst && <div className="block-value ok-text">connected by the MST</div>}
        </div>
      )}
    </aside>
  );
}
