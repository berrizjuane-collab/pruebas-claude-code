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
 * Vertical axis: the network sits just BELOW the ground plane (y = 0, where
 * the stylized Tokyo map is drawn), like the real thing. Each line keeps a
 * small depth layer ordered by construction era (Ginza 1927 shallowest …
 * Fukutoshin 2008 deepest) — Tokyo Metro lines really are stacked underground.
 * The offsets are deliberately subtle so the network reads as a flat,
 * physically-laid-out metro map from above, and only reveals the stacking
 * when the camera orbits low. (True depths are ~5–40 m; at map scale that is
 * invisible, so the relative order is kept and the scale exaggerated.)
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

/** Shared by the map backdrop so geography and stations stay registered. */
export const PROJECTION = { LON0, LAT0, KM_PER_LON, KM_PER_LAT };

const BASE_DEPTH = 0.16; // ground clearance of the shallowest line (scene km)
const DEPTH_STEP = 0.09; // vertical spacing between consecutive line layers

/** y-coordinate of a line's depth layer (used for nodes and edge sag). */
export function depthY(depth) {
  return -(BASE_DEPTH + depth * DEPTH_STEP);
}

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

  // Node depth = mean of its lines' depth layers; exits; hub flag
  for (const n of nodes.values()) {
    const depths = n.lines.map((lid) => LINES.find((l) => l.id === lid).depth);
    n.y = depthY(depths.reduce((a, b) => a + b, 0) / depths.length);
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
