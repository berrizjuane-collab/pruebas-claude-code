/**
 * Global app state. One store drives both the 3D layer and the HUD, so the
 * scene and the panels can never disagree about what the algorithm is doing.
 */
import { create } from 'zustand';
import { GRAPH } from '../graph/buildGraph.js';
import { dijkstra, prim, kruskal } from '../graph/algorithms.js';
import { deriveVisual, EMPTY_VISUAL } from './deriveVisual.js';

/**
 * Independent cross-check: run Prim (from an arbitrary seed) and Kruskal over
 * the same graph + weight and compare totals. Two different algorithms, two
 * different data structures — equal totals is strong evidence both are right.
 */
function computeMstCheck(weightKey) {
  const p = prim(GRAPH, 'tokyo', weightKey).result;
  const k = kruskal(GRAPH, weightKey).result;
  return {
    prim: p.total,
    kruskal: k.total,
    match: Math.abs(p.total - k.total) < 1e-6,
    edges: k.edgeCount,
  };
}

const runDefaults = {
  steps: [],
  stepIndex: -1,
  playing: false,
  visual: EMPTY_VISUAL,
  runResult: null,
};

export const useStore = create((set, get) => ({
  // ── UI mode ────────────────────────────────────────────────────────────
  mode: 'explore', // 'explore' | 'dijkstra' | 'prim' | 'kruskal'
  weightKey: 'time', // 'time' (minutes) | 'dist' (km)
  labelsOn: true,

  // ── map selections ────────────────────────────────────────────────────
  hoveredLine: null,
  selectedLine: null,
  hoveredStation: null,
  selectedStation: null,
  origin: null,
  dest: null,
  seed: null,

  // ── algorithm run ─────────────────────────────────────────────────────
  ...runDefaults,
  speed: 12, // steps per second while playing
  mstCheck: null,

  // ── actions ───────────────────────────────────────────────────────────
  setMode: (mode) =>
    set(() => ({
      mode,
      ...runDefaults,
      origin: null,
      dest: null,
      seed: null,
      mstCheck: mode === 'prim' || mode === 'kruskal' ? computeMstCheck(get().weightKey) : null,
    })),

  setWeightKey: (weightKey) =>
    set((s) => ({
      weightKey,
      ...runDefaults,
      mstCheck: s.mode === 'prim' || s.mode === 'kruskal' ? computeMstCheck(weightKey) : null,
    })),

  toggleLabels: () => set((s) => ({ labelsOn: !s.labelsOn })),
  hoverLine: (id) => set({ hoveredLine: id }),
  selectLine: (id) => set((s) => ({ selectedLine: s.selectedLine === id ? null : id })),
  hoverStation: (id) => set({ hoveredStation: id }),

  /** Map click routing — behavior depends on the active mode. */
  pickStation: (id) => {
    const s = get();
    const patch = { selectedStation: id };
    if (s.mode === 'dijkstra') {
      if (s.steps.length > 0) {
        // A finished/running query is on screen: clicking starts a fresh one
        Object.assign(patch, runDefaults, { origin: id, dest: null });
      } else if (!s.origin) {
        patch.origin = id;
      } else if (id !== s.origin) {
        patch.dest = id;
      }
    } else if (s.mode === 'prim') {
      if (s.steps.length > 0) Object.assign(patch, runDefaults);
      patch.seed = id;
    }
    set(patch);
  },

  clearSelection: () =>
    set({ ...runDefaults, origin: null, dest: null, seed: null, selectedStation: null }),

  /** Compute the full execution trace and start playback. */
  run: () => {
    const s = get();
    let trace = null;
    if (s.mode === 'dijkstra' && s.origin && s.dest) {
      trace = dijkstra(GRAPH, s.origin, s.dest, s.weightKey);
    } else if (s.mode === 'prim' && s.seed) {
      trace = prim(GRAPH, s.seed, s.weightKey);
    } else if (s.mode === 'kruskal') {
      trace = kruskal(GRAPH, s.weightKey);
    }
    if (!trace) return;
    set({
      steps: trace.steps,
      runResult: trace.result,
      stepIndex: 0,
      playing: true,
      visual: deriveVisual(trace.steps, 0),
    });
  },

  setIndex: (i) => {
    const s = get();
    if (s.steps.length === 0) return;
    const idx = Math.max(0, Math.min(i, s.steps.length - 1));
    set({
      stepIndex: idx,
      visual: deriveVisual(s.steps, idx),
      playing: s.playing && idx < s.steps.length - 1,
    });
  },

  play: () => {
    const s = get();
    if (s.steps.length === 0) {
      get().run();
      return;
    }
    if (s.stepIndex >= s.steps.length - 1) get().setIndex(0);
    set({ playing: true });
  },
  pause: () => set({ playing: false }),

  stepOnce: () => {
    const s = get();
    if (s.steps.length === 0) {
      get().run();
      get().pause();
      return;
    }
    set({ playing: false });
    get().setIndex(s.stepIndex + 1);
  },

  resetRun: () => {
    const s = get();
    if (s.steps.length === 0) return;
    set({ stepIndex: 0, playing: false, visual: deriveVisual(s.steps, 0) });
  },

  setSpeed: (speed) => set({ speed }),

  /** Called every frame by the Ticker with the elapsed seconds. */
  _acc: 0,
  tick: (dt) => {
    const s = get();
    if (!s.playing || s.steps.length === 0) return;
    const acc = s._acc + dt * s.speed;
    const n = Math.floor(acc);
    if (n > 0) {
      set({ _acc: acc - n });
      get().setIndex(s.stepIndex + n);
    } else {
      set({ _acc: acc });
    }
  },
}));

export { GRAPH };
