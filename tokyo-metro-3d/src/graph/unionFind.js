/**
 * Disjoint-set (Union-Find) with path compression + union by rank.
 * Used by Kruskal to detect whether an edge would close a cycle.
 */
export class UnionFind {
  constructor(ids) {
    this.index = new Map(ids.map((id, i) => [id, i]));
    this.parent = ids.map((_, i) => i);
    this.rank = new Array(ids.length).fill(0);
    this.components = ids.length;
  }

  findRoot(i) {
    let root = i;
    while (this.parent[root] !== root) root = this.parent[root];
    // Path compression
    while (this.parent[i] !== root) {
      const next = this.parent[i];
      this.parent[i] = root;
      i = next;
    }
    return root;
  }

  find(id) {
    return this.findRoot(this.index.get(id));
  }

  /** Returns true if the two ids were in different components (i.e. merged). */
  union(a, b) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return false;
    if (this.rank[ra] < this.rank[rb]) {
      this.parent[ra] = rb;
    } else if (this.rank[ra] > this.rank[rb]) {
      this.parent[rb] = ra;
    } else {
      this.parent[rb] = ra;
      this.rank[ra] += 1;
    }
    this.components -= 1;
    return true;
  }

  connected(a, b) {
    return this.find(a) === this.find(b);
  }
}
