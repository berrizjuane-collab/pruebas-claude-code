/**
 * Replays the recorded algorithm trace up to `idx` and derives the visual
 * state of every node and edge, plus the HUD data (priority queue / edge
 * queue, counters, tentative distances). Pure function of (steps, idx) —
 * this is what makes scrubbing and manual stepping trivially correct: the
 * view at step N is the fold of the first N real execution events.
 */

export const EMPTY_VISUAL = {
  nodeState: new Map(),
  edgeState: new Map(),
  rejectedAt: new Map(),
  distMap: new Map(),
  pq: { size: 0, top: [] },
  queue: null,
  counts: { settled: 0, considered: 0, accepted: 0, rejected: 0 },
  components: null,
  done: null,
  active: null,
};

export function deriveVisual(steps, idx) {
  if (!steps || steps.length === 0 || idx < 0) return EMPTY_VISUAL;

  const nodeState = new Map();
  const edgeState = new Map();
  const rejectedAt = new Map();
  const distMap = new Map();
  let pq = { size: 0, top: [] };
  let queue = null;
  const counts = { settled: 0, considered: 0, accepted: 0, rejected: 0 };
  let components = null;
  let done = null;

  const last = Math.min(idx, steps.length - 1);

  for (let i = 0; i <= last; i++) {
    const s = steps[i];
    switch (s.t) {
      case 'init':
        nodeState.set(s.node, s.role); // 'origin' | 'seed'
        distMap.set(s.node, 0);
        break;

      case 'visit': // Dijkstra settles a node
        if (nodeState.get(s.node) !== 'origin') nodeState.set(s.node, 'settled');
        distMap.set(s.node, s.d);
        counts.settled += 1;
        break;

      case 'relax': { // Dijkstra scans an edge
        const cur = edgeState.get(s.edge);
        if (cur === undefined || cur === 'checked') {
          edgeState.set(s.edge, s.improved ? 'improved' : 'checked');
        }
        if (s.improved) {
          distMap.set(s.to, s.alt);
          if (!nodeState.has(s.to)) nodeState.set(s.to, 'frontier');
        }
        counts.considered += 1;
        break;
      }

      case 'add': // Prim absorbs a node into the tree
        if (nodeState.get(s.node) !== 'seed') nodeState.set(s.node, 'tree');
        if (s.edge) {
          edgeState.set(s.edge, 'mst');
          counts.accepted += 1;
        }
        distMap.set(s.node, s.w);
        counts.settled += 1;
        break;

      case 'consider': { // Prim evaluates a crossing edge
        const cur = edgeState.get(s.edge);
        if (cur === undefined) edgeState.set(s.edge, s.improved ? 'improved' : 'checked');
        else if (cur === 'checked' && s.improved) edgeState.set(s.edge, 'improved');
        if (s.improved && !nodeState.has(s.to)) nodeState.set(s.to, 'frontier');
        counts.considered += 1;
        break;
      }

      case 'order': // Kruskal sorted the edge list
        queue = { upcoming: s.queue, i: s.i, count: s.count };
        break;

      case 'test': // Kruskal examines the next cheapest edge
        if (!edgeState.has(s.edge)) edgeState.set(s.edge, 'testing');
        queue = { upcoming: s.queue, i: s.i, count: queue ? queue.count : 0 };
        counts.considered += 1;
        break;

      case 'accept':
        edgeState.set(s.edge, 'mst');
        counts.accepted += 1;
        components = s.components;
        break;

      case 'reject':
        edgeState.set(s.edge, 'rejected');
        rejectedAt.set(s.edge, i);
        counts.rejected += 1;
        break;

      case 'done':
        done = s;
        break;

      default:
        break;
    }
    if (s.pq) pq = s.pq;
  }

  // Final-result overlay: the shortest path outshines everything else
  if (done && done.algo === 'dijkstra' && done.path) {
    for (const eid of done.pathEdges) edgeState.set(eid, 'path');
    for (const n of done.path) {
      const cur = nodeState.get(n);
      if (cur !== 'origin') nodeState.set(n, 'path');
    }
  }

  return {
    nodeState,
    edgeState,
    rejectedAt,
    distMap,
    pq,
    queue,
    counts,
    components,
    done,
    active: steps[last],
  };
}
