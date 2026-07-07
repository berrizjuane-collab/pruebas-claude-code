/**
 * Builds the actual graph used by BOTH the renderer and the algorithms:
 * one shared adjacency-list structure — the animation is driven by real
 * algorithm execution over these exact nodes/edges, nothing is staged.
 *
 * Projection: equirectangular around central Tokyo (good enough at this
 * scale). 1° of longitude ≈ 90.5 km at lat 35.7°, 1° of latitude ≈ 111 km.
 * Scene units are kilometers; +x = east, -z = north (so north reads "up"
 * when the camera looks down at the map).
 *
 * Vertical axis: each line occupies a depth layer (construction era, see
 * lines.js). A station's node sits at the mean depth of its lines; each edge
 * bows toward its own line's layer, which visually separates parallel
 * corridors (e.g. Yūrakuchō vs Fukutoshin between Wakōshi and Ikebukuro).
 *
 * Edge distance = straight-line km between the projected endpoints (real
 * track length is slightly longer; documented approximation).
 */
import { STATIONS, exitsFor } from '../data/stations.js';
import { LINES } from '../data/lines.js';

const LON0 = 139.745;
const LAT0 = 35.70;
const KM_PER_LON = 90.5;
const KM_PER_LAT = 111.0;
const DEPTH_STEP = 0.48; // vertical km-units between consecutive line layers

export function buildGraph() {
  const nodes = new Map();

  // Register nodes and which lines serve them
  for (const line of LINES) {
    for (const id of line.stations) {
      const s = STATIONS[id];
      if (!s) throw new Error(`Line ${line.id} references unknown station "${id}"`);
      if (!nodes.has(id)) {
        nodes.set(id, {
          id,
          name: s.name,
          ja: s.ja,
          x: (s.lon - LON0) * KM_PER_LON,
          z: -(s.lat - LAT0) * KM_PER_LAT,
          y: 0,
          lines: [],
        });
      }
      nodes.get(id).lines.push(line.id);
    }
  }

  // Node elevation = mean of its lines' depth layers; exits; hub flag
  for (const n of nodes.values()) {
    const depths = n.lines.map((lid) => LINES.find((l) => l.id === lid).depth);
    n.y = -(depths.reduce((a, b) => a + b, 0) / depths.length) * DEPTH_STEP;
    n.exits = exitsFor(n.id, n.lines.length);
    n.isHub = n.lines.length >= 2;
  }

  // Edges: one per consecutive station pair per line (parallel edges allowed
  // where two lines share a physical corridor — true to the service pattern)
  const edges = [];
  for (const line of LINES) {
    if (line.times.length !== line.stations.length - 1) {
      throw new Error(`Line ${line.id}: times[] length must be stations-1`);
    }
    for (let i = 0; i < line.stations.length - 1; i++) {
      const a = line.stations[i];
      const b = line.stations[i + 1];
      const na = nodes.get(a);
      const nb = nodes.get(b);
      const dist = Math.max(
        0.3,
        Math.hypot(na.x - nb.x, na.z - nb.z),
      );
      edges.push({
        id: `${line.id}:${a}>${b}`,
        a,
        b,
        line: line.id,
        time: line.times[i],
        dist: Math.round(dist * 100) / 100,
      });
    }
  }

  // Adjacency list (undirected)
  const adjacency = new Map();
  for (const id of nodes.keys()) adjacency.set(id, []);
  for (const e of edges) {
    adjacency.get(e.a).push({ edge: e, to: e.b });
    adjacency.get(e.b).push({ edge: e, to: e.a });
  }

  return { nodes, edges, adjacency };
}

/** Singleton instance shared by the app. */
export const GRAPH = buildGraph();

export const EDGE_BY_ID = new Map(GRAPH.edges.map((e) => [e.id, e]));

export function otherEnd(edge, nodeId) {
  return edge.a === nodeId ? edge.b : edge.a;
}
