/**
 * Network-level metrics for the command HUD, computed once at startup from the
 * real graph (nothing hardcoded).
 */
import { GRAPH } from './buildGraph.js';
import { dijkstra } from './algorithms.js';

export function computeNetworkStats() {
  const V = GRAPH.nodes.size;
  const E = GRAPH.edges.length;
  const hubs = [...GRAPH.nodes.values()].filter((n) => n.isHub).length;
  const trackKm = Math.round(GRAPH.edges.reduce((s, e) => s + e.dist, 0));
  const avgDegree = Math.round(((2 * E) / V) * 100) / 100;

  // Weighted diameter (minutes): the longest shortest-path over all pairs.
  // 142 Dijkstra runs at startup — a few milliseconds, worth the honesty.
  let diameter = 0;
  let diameterPair = null;
  for (const src of GRAPH.nodes.keys()) {
    const { steps } = dijkstra(GRAPH, src, '__none__', 'time');
    for (const s of steps) {
      if (s.t === 'visit' && s.d > diameter) {
        diameter = s.d;
        diameterPair = [src, s.node];
      }
    }
  }

  return { V, E, hubs, trackKm, avgDegree, diameter: Math.round(diameter), diameterPair };
}

export const NETWORK_STATS = computeNetworkStats();
