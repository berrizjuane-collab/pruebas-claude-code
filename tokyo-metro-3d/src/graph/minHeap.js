/**
 * Binary min-heap priority queue.
 *
 * Used by Dijkstra and Prim with the classic "lazy deletion" strategy: instead
 * of a decrease-key operation, an improved entry is pushed again and stale
 * entries are discarded when popped (checked against the current best value).
 * This is a standard, honest implementation — the animation snapshots filter
 * stale entries the same way the algorithm does.
 */
export class MinHeap {
  constructor(compare) {
    this.a = [];
    this.compare = compare;
  }

  get size() {
    return this.a.length;
  }

  push(item) {
    const a = this.a;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.compare(a[i], a[p]) >= 0) break;
      [a[i], a[p]] = [a[p], a[i]];
      i = p;
    }
  }

  pop() {
    const a = this.a;
    if (a.length === 0) return undefined;
    const top = a[0];
    const last = a.pop();
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && this.compare(a[l], a[m]) < 0) m = l;
        if (r < a.length && this.compare(a[r], a[m]) < 0) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }

  /** Non-destructive view of the raw heap contents (for HUD snapshots). */
  items() {
    return this.a.slice();
  }
}
