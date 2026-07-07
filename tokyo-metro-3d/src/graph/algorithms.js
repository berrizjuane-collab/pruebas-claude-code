/**
 * The three algorithms, instrumented for step-by-step visualization.
 *
 * IMPORTANT DESIGN RULE: each function below is a *real* implementation
 * (binary heap, lazy deletion, union-find). The `steps` array is a trace of
 * the actual execution recorded while it runs — the visualization replays the
 * trace, so what you see on screen (visit order, relaxations, accepted /
 * rejected edges, priority-queue contents) is exactly what the algorithm did,
 * in the order it did it.
 *
 * Weight criterion: `weightKey` is 'time' (minutes) or 'dist' (km).
 */
import { MinHeap } from './minHeap.js';
import { UnionFind } from './unionFind.js';

const PQ_VIEW = 10; // entries shown in the HUD snapshot

/** Frontier snapshot for the HUD: current best entry per unsettled node. */
function snapshotHeap(heap, dist, settled) {
  const best = new Map();
  for (const it of heap.items()) {
    if (settled.has(it.node)) continue;
    if (it.d !== dist.get(it.node)) continue; // stale lazy-deletion entry
    if (!best.has(it.node) || it.d < best.get(it.node).d) best.set(it.node, it);
  }
  return {
    size: best.size,
    top: [...best.values()]
      .sort((x, y) => x.d - y.d)
      .slice(0, PQ_VIEW)
      .map((it) => ({ node: it.node, d: round2(it.d) })),
  };
}

function round2(v) {
  return Math.round(v * 100) / 100;
}

/* ─────────────────────────── DIJKSTRA ─────────────────────────── */

/**
 * Single-source shortest path from `src` to `dst`.
 * Steps: init → (visit | relax)* → done
 */
export function dijkstra(graph, src, dst, weightKey) {
  const steps = [];
  const dist = new Map([[src, 0]]);
  const prev = new Map();
  const prevEdge = new Map();
  const settled = new Set();
  const heap = new MinHeap((x, y) => x.d - y.d);

  heap.push({ node: src, d: 0 });
  steps.push({ t: 'init', node: src, role: 'origin', pq: snapshotHeap(heap, dist, settled) });

  while (heap.size > 0) {
    const top = heap.pop();
    if (settled.has(top.node) || top.d !== dist.get(top.node)) continue; // stale
    settled.add(top.node);
    steps.push({ t: 'visit', node: top.node, d: round2(top.d), pq: snapshotHeap(heap, dist, settled) });
    if (top.node === dst) break; // destination settled — shortest path is final

    for (const { edge, to } of graph.adjacency.get(top.node)) {
      const w = edge[weightKey];
      const alt = top.d + w;
      const cur = dist.has(to) ? dist.get(to) : Infinity;
      const improved = !settled.has(to) && alt < cur;
      if (improved) {
        dist.set(to, alt);
        prev.set(to, top.node);
        prevEdge.set(to, edge.id);
        heap.push({ node: to, d: alt });
      }
      steps.push({
        t: 'relax',
        edge: edge.id,
        from: top.node,
        to,
        alt: round2(alt),
        improved,
        settledNeighbor: settled.has(to),
        pq: snapshotHeap(heap, dist, settled),
      });
    }
  }

  // Path reconstruction
  let result = null;
  if (settled.has(dst)) {
    const path = [];
    const pathEdges = [];
    for (let cur = dst; cur !== undefined; cur = prev.get(cur)) {
      path.unshift(cur);
      if (prevEdge.has(cur)) pathEdges.unshift(prevEdge.get(cur));
    }
    const edgeById = new Map(graph.edges.map((e) => [e.id, e]));
    let totalTime = 0;
    let totalDist = 0;
    let transfers = 0;
    let prevLine = null;
    for (const eid of pathEdges) {
      const e = edgeById.get(eid);
      totalTime += e.time;
      totalDist += e.dist;
      if (prevLine !== null && e.line !== prevLine) transfers += 1;
      prevLine = e.line;
    }
    result = {
      path,
      pathEdges,
      total: round2(pathEdges.reduce((s, eid) => s + edgeById.get(eid)[weightKey], 0)),
      totalTime,
      totalDist: round2(totalDist),
      transfers,
      settledCount: settled.size,
    };
  }
  steps.push({ t: 'done', algo: 'dijkstra', ...result });
  return { steps, result };
}

/* ───────────────────────────── PRIM ───────────────────────────── */

/**
 * Minimum spanning tree grown greedily from a single seed node.
 * Steps: init → (add | consider)* → done
 */
export function prim(graph, seed, weightKey) {
  const steps = [];
  const inTree = new Set();
  const key = new Map([[seed, 0]]); // cheapest known connection cost per node
  const viaEdge = new Map();
  const heap = new MinHeap((x, y) => x.d - y.d);

  heap.push({ node: seed, d: 0, edge: null });
  steps.push({ t: 'init', node: seed, role: 'seed', pq: snapshotHeap(heap, key, inTree) });

  const mstEdges = [];
  let total = 0;

  while (heap.size > 0) {
    const top = heap.pop();
    if (inTree.has(top.node) || top.d !== key.get(top.node)) continue; // stale
    inTree.add(top.node);
    if (top.edge) {
      mstEdges.push(top.edge);
      total += top.d;
    }
    steps.push({
      t: 'add',
      node: top.node,
      edge: top.edge,
      w: round2(top.d),
      runningTotal: round2(total),
      treeSize: inTree.size,
      pq: snapshotHeap(heap, key, inTree),
    });

    for (const { edge, to } of graph.adjacency.get(top.node)) {
      if (inTree.has(to)) continue; // would close a cycle — not a candidate
      const w = edge[weightKey];
      const cur = key.has(to) ? key.get(to) : Infinity;
      const improved = w < cur;
      if (improved) {
        key.set(to, w);
        viaEdge.set(to, edge.id);
        heap.push({ node: to, d: w, edge: edge.id });
      }
      steps.push({
        t: 'consider',
        edge: edge.id,
        from: top.node,
        to,
        w: round2(w),
        improved,
        pq: snapshotHeap(heap, key, inTree),
      });
    }
  }

  const result = {
    mstEdges,
    total: round2(total),
    nodeCount: inTree.size,
    edgeCount: mstEdges.length,
  };
  steps.push({ t: 'done', algo: 'prim', ...result });
  return { steps, result };
}

/* ──────────────────────────── KRUSKAL ─────────────────────────── */

/**
 * Global MST: sort every edge ascending, accept unless it closes a cycle
 * (union-find). Stops early once V-1 edges are accepted — the remaining
 * edges could only be rejected, and the step counter reports them as skipped.
 * Steps: order → (test → (accept | reject))* → done
 */
export function kruskal(graph, weightKey) {
  const steps = [];
  const sorted = graph.edges
    .slice()
    .sort((a, b) => a[weightKey] - b[weightKey] || (a.id < b.id ? -1 : 1));
  const uf = new UnionFind([...graph.nodes.keys()]);

  steps.push({
    t: 'order',
    count: sorted.length,
    queue: sorted.slice(0, PQ_VIEW).map((e) => ({ edge: e.id, w: e[weightKey] })),
    i: -1,
  });

  const mstEdges = [];
  let total = 0;
  let evaluated = 0;

  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i];
    evaluated += 1;
    steps.push({
      t: 'test',
      edge: e.id,
      w: e[weightKey],
      i,
      queue: sorted.slice(i + 1, i + 1 + PQ_VIEW).map((x) => ({ edge: x.id, w: x[weightKey] })),
    });
    if (uf.union(e.a, e.b)) {
      mstEdges.push(e.id);
      total += e[weightKey];
      steps.push({
        t: 'accept',
        edge: e.id,
        runningTotal: round2(total),
        components: uf.components,
      });
      if (mstEdges.length === graph.nodes.size - 1) break; // spanning — done
    } else {
      steps.push({ t: 'reject', edge: e.id, reason: 'cycle' });
    }
  }

  const result = {
    mstEdges,
    total: round2(total),
    nodeCount: graph.nodes.size,
    edgeCount: mstEdges.length,
    evaluated,
    skipped: sorted.length - evaluated,
  };
  steps.push({ t: 'done', algo: 'kruskal', ...result });
  return { steps, result };
}
