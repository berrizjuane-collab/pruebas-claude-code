/**
 * Rigor tests (node --test). These are the project's honesty layer:
 *  - the graph is validated structurally (connected, well-formed),
 *  - Dijkstra is cross-checked against an independent Bellman–Ford,
 *  - Prim and Kruskal must agree on the MST total from any seed,
 *  - recorded traces must respect the algorithms' invariants
 *    (e.g. Dijkstra settles nodes in non-decreasing distance order).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph } from '../src/graph/buildGraph.js';
import { dijkstra, prim, kruskal } from '../src/graph/algorithms.js';
import { UnionFind } from '../src/graph/unionFind.js';

const GRAPH = buildGraph();

test('graph is well-formed and connected', () => {
  assert.equal(GRAPH.nodes.size, 141, 'expected 141 unique stations');
  assert.ok(GRAPH.edges.length > 150, 'expected the full segment set');
  const uf = new UnionFind([...GRAPH.nodes.keys()]);
  for (const e of GRAPH.edges) uf.union(e.a, e.b);
  assert.equal(uf.components, 1, 'network must be a single connected component');
});

test('every edge has positive weights for both criteria', () => {
  for (const e of GRAPH.edges) {
    assert.ok(e.time > 0, `${e.id} time must be > 0`);
    assert.ok(e.dist > 0, `${e.id} dist must be > 0`);
  }
});

/** Independent shortest-path oracle: Bellman–Ford (no heap, no shared code). */
function bellmanFord(graph, src, weightKey) {
  const dist = new Map([[src, 0]]);
  const V = graph.nodes.size;
  for (let i = 0; i < V - 1; i++) {
    let changed = false;
    for (const e of graph.edges) {
      const w = e[weightKey];
      const da = dist.has(e.a) ? dist.get(e.a) : Infinity;
      const db = dist.has(e.b) ? dist.get(e.b) : Infinity;
      if (da + w < db) { dist.set(e.b, da + w); changed = true; }
      if (db + w < da) { dist.set(e.a, db + w); changed = true; }
    }
    if (!changed) break;
  }
  return dist;
}

const PAIRS = [
  ['shibuya', 'asakusa'],
  ['ogikubo', 'nishi-funabashi'],
  ['wakoshi', 'shin-kiba'],
  ['meguro', 'kita-ayase'],
  ['naka-meguro', 'akabane-iwabuchi'],
  ['kita-senju', 'shibuya'],
];

for (const weightKey of ['time', 'dist']) {
  test(`dijkstra matches Bellman–Ford (weight = ${weightKey})`, () => {
    for (const [src, dst] of PAIRS) {
      const oracle = bellmanFord(GRAPH, src, weightKey);
      const { result } = dijkstra(GRAPH, src, dst, weightKey);
      assert.ok(result, `route ${src} → ${dst} must exist`);
      assert.ok(
        Math.abs(result.total - oracle.get(dst)) < 1e-6,
        `${src} → ${dst}: dijkstra ${result.total} vs oracle ${oracle.get(dst)}`,
      );
    }
  });
}

test('dijkstra path is a real connected walk whose weights sum to the total', () => {
  const { result } = dijkstra(GRAPH, 'shibuya', 'kita-senju', 'time');
  const edgeById = new Map(GRAPH.edges.map((e) => [e.id, e]));
  let sum = 0;
  for (let i = 0; i < result.pathEdges.length; i++) {
    const e = edgeById.get(result.pathEdges[i]);
    const [a, b] = [result.path[i], result.path[i + 1]];
    assert.ok(
      (e.a === a && e.b === b) || (e.a === b && e.b === a),
      `edge ${e.id} must connect ${a} — ${b}`,
    );
    sum += e.time;
  }
  assert.equal(sum, result.total);
});

test('dijkstra trace settles nodes in non-decreasing distance order', () => {
  const { steps } = dijkstra(GRAPH, 'tokyo', 'wakoshi', 'time');
  let last = -Infinity;
  for (const s of steps) {
    if (s.t === 'visit') {
      assert.ok(s.d >= last - 1e-9, `visit order violated: ${s.d} after ${last}`);
      last = s.d;
    }
  }
});

for (const weightKey of ['time', 'dist']) {
  test(`prim and kruskal agree on MST total from any seed (weight = ${weightKey})`, () => {
    const k = kruskal(GRAPH, weightKey).result;
    assert.equal(k.edgeCount, GRAPH.nodes.size - 1, 'MST must have V-1 edges');
    for (const seed of ['tokyo', 'wakoshi', 'nishi-funabashi', 'meguro']) {
      const p = prim(GRAPH, seed, weightKey).result;
      assert.equal(p.edgeCount, GRAPH.nodes.size - 1);
      assert.ok(
        Math.abs(p.total - k.total) < 1e-6,
        `prim(${seed}) ${p.total} vs kruskal ${k.total}`,
      );
    }
  });
}

test('kruskal accepts edges in non-decreasing weight order and rejections are real cycles', () => {
  const { steps } = kruskal(GRAPH, 'time');
  const edgeById = new Map(GRAPH.edges.map((e) => [e.id, e]));
  let lastW = -Infinity;
  const uf = new UnionFind([...GRAPH.nodes.keys()]);
  for (const s of steps) {
    if (s.t === 'accept') {
      const e = edgeById.get(s.edge);
      assert.ok(e.time >= lastW, 'accepted edge weight decreased');
      lastW = e.time;
      assert.ok(!uf.connected(e.a, e.b), 'accepted edge closed a cycle!');
      uf.union(e.a, e.b);
    }
    if (s.t === 'reject') {
      const e = edgeById.get(s.edge);
      assert.ok(uf.connected(e.a, e.b), 'rejected edge did NOT close a cycle!');
    }
  }
});

test('prim MST is acyclic and spanning', () => {
  const { result } = prim(GRAPH, 'ginza', 'time');
  const edgeById = new Map(GRAPH.edges.map((e) => [e.id, e]));
  const uf = new UnionFind([...GRAPH.nodes.keys()]);
  for (const eid of result.mstEdges) {
    const e = edgeById.get(eid);
    assert.ok(uf.union(e.a, e.b), `MST edge ${eid} would close a cycle`);
  }
  assert.equal(uf.components, 1, 'prim MST must span all stations');
});
