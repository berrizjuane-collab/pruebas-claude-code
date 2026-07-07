/** Small shared UI pieces + formatting helpers. */
import React from 'react';
import { LINE_BY_ID } from '../data/lines.js';
import { GRAPH, EDGE_BY_ID } from '../graph/buildGraph.js';

export function LineChip({ id, size = 16 }) {
  const line = LINE_BY_ID[id];
  return (
    <span
      className="line-chip"
      title={`${line.name} line`}
      style={{ background: line.color, width: size, height: size, fontSize: size * 0.62 }}
    >
      {id}
    </span>
  );
}

export function stationName(id) {
  const n = GRAPH.nodes.get(id);
  return n ? n.name : id;
}

export function formatWeight(v, weightKey) {
  if (v === undefined || v === null) return '—';
  return weightKey === 'time' ? `${Math.round(v * 10) / 10} min` : `${Number(v).toFixed(1)} km`;
}

export function edgeLabel(edgeId) {
  const e = EDGE_BY_ID.get(edgeId);
  if (!e) return edgeId;
  return { a: stationName(e.a), b: stationName(e.b), line: e.line, edge: e };
}

/** Groups a shortest path into per-line legs for the itinerary readout. */
export function groupLegs(path, pathEdges) {
  const legs = [];
  for (let i = 0; i < pathEdges.length; i++) {
    const e = EDGE_BY_ID.get(pathEdges[i]);
    const last = legs[legs.length - 1];
    if (last && last.line === e.line) {
      last.to = path[i + 1];
      last.stops += 1;
      last.time += e.time;
      last.dist += e.dist;
    } else {
      legs.push({ line: e.line, from: path[i], to: path[i + 1], stops: 1, time: e.time, dist: e.dist });
    }
  }
  return legs;
}
