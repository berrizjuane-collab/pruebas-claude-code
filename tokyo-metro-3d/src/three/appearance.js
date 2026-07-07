/**
 * Visual grammar of the map: pure functions mapping (store state, element) →
 * a small token string, plus the token → material-parameter tables.
 *
 * Design notes (per the project's dataviz rules):
 *  - Line colors are the OFFICIAL Tokyo Metro line colors — color follows the
 *    entity. Identity is never color-alone: every line also carries its letter
 *    code, name and its own spatial corridor, and the side panel is a legend.
 *  - Algorithm states use a reserved status palette (green = accepted/origin,
 *    red = rejected/destination, amber = frontier/path, cyan = settled) that
 *    is never used for line identity.
 *  - `k` is an HDR multiplier: tokens with k > ~1.6 rise above the bloom
 *    luminance threshold and glow; dim states stay below it.
 */
import * as THREE from 'three';

/* ────────────────────────── edges ────────────────────────── */

export function edgeToken(s, edge) {
  if (s.steps.length > 0) {
    const st = s.visual.edgeState.get(edge.id);
    const active = s.visual.active;
    if (active && active.edge === edge.id && active.t !== 'done') {
      return st === 'rejected' ? 'rejected-hot' : 'active';
    }
    if (st === 'rejected') {
      const at = s.visual.rejectedAt.get(edge.id);
      return s.stepIndex - at < 8 ? 'rejected-hot' : 'rejected-cold';
    }
    if (st === 'path') return 'path';
    if (st === 'mst') return 'mst';
    if (st === 'improved') return 'improved';
    if (st === 'checked' || st === 'testing') return 'checked';
    return 'dim-algo';
  }
  const focus = s.selectedLine || s.hoveredLine;
  if (focus) return edge.line === focus ? 'spot' : 'dim-spot';
  return 'base';
}

export const EDGE_PARAMS = {
  base:           { o: 0.38, k: 1.0,  line: true },
  spot:           { o: 1.0,  k: 2.6,  line: true },
  'dim-spot':     { o: 0.05, k: 0.7,  line: true },
  'dim-algo':     { o: 0.07, k: 0.7,  line: true },
  checked:        { o: 0.55, k: 1.35, line: true },
  improved:       { o: 0.92, k: 2.0,  line: true },
  active:         { o: 1.0,  k: 3.2,  c: '#eafcff', pulse: true },
  mst:            { o: 1.0,  k: 2.4,  c: '#2bff9e' },
  'rejected-hot': { o: 0.95, k: 2.4,  c: '#ff3355', pulse: true },
  'rejected-cold':{ o: 0.05, k: 0.6,  line: true },
  path:           { o: 1.0,  k: 3.0,  c: '#ffd75e' },
};

/* ────────────────────────── nodes ────────────────────────── */

export function nodeToken(s, node) {
  if (node.id === s.origin) return 'origin';
  if (node.id === s.dest) return 'dest';
  if (node.id === s.seed) return 'seed';
  if (s.steps.length > 0) {
    const st = s.visual.nodeState.get(node.id);
    const active = s.visual.active;
    if (active && active.node === node.id && active.t !== 'done' && active.t !== 'init') {
      return 'active';
    }
    if (st === 'path') return 'path';
    if (st === 'settled') return 'settled';
    if (st === 'tree') return 'tree';
    if (st === 'frontier') return 'frontier';
    return 'dim-node';
  }
  const focus = s.selectedLine || s.hoveredLine;
  if (focus) return node.lines.includes(focus) ? 'spot-node' : 'dim-node';
  if (node.id === s.selectedStation) return 'selected';
  return node.isHub ? 'hub' : 'node';
}

export const NODE_PARAMS = {
  node:        { c: '#6f9cc4', o: 0.9,  k: 1.0,  r: 1.0 },
  hub:         { c: '#bcd8f5', o: 1.0,  k: 1.12, r: 1.0 },
  selected:    { c: '#8ef0ff', o: 1.0,  k: 2.2,  r: 1.5 },
  'spot-node': { c: '#eaf6ff', o: 1.0,  k: 2.0,  r: 1.25 },
  'dim-node':  { c: '#3c5a78', o: 0.35, k: 0.6,  r: 0.9 },
  origin:      { c: '#2bff88', o: 1.0,  k: 2.6,  r: 1.9 },
  seed:        { c: '#2bff88', o: 1.0,  k: 2.6,  r: 1.9 },
  dest:        { c: '#ff4d6a', o: 1.0,  k: 2.6,  r: 1.9 },
  settled:     { c: '#37c8f0', o: 1.0,  k: 1.9,  r: 1.2 },
  tree:        { c: '#2bff9e', o: 1.0,  k: 1.9,  r: 1.15 },
  frontier:    { c: '#ffd75e', o: 1.0,  k: 2.2,  r: 1.4, pulse: true },
  active:      { c: '#ffffff', o: 1.0,  k: 3.0,  r: 1.8, pulse: true },
  path:        { c: '#ffd75e', o: 1.0,  k: 2.6,  r: 1.5 },
};

/* ─────────────────── shared textures & helpers ─────────────────── */

let glowTexture = null;
/** Soft radial gradient used (tinted) as the glow sprite behind every station. */
export function getGlowTexture() {
  if (glowTexture) return glowTexture;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.28)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.06)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  glowTexture = new THREE.CanvasTexture(canvas);
  return glowTexture;
}

const labelCache = new Map();
/** Billboard text rendered to a canvas — no external font fetches. */
export function getLabelTexture(text) {
  if (labelCache.has(text)) return labelCache.get(text);
  const font = '600 44px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  const pad = 18;
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = font;
  const w = Math.ceil(measure.measureText(text).width) + pad * 2;
  const h = 72;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.font = font;
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(60, 200, 240, 0.9)';
  ctx.shadowBlur = 10;
  ctx.fillStyle = 'rgba(226, 240, 255, 0.95)';
  ctx.fillText(text, pad, h / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  const entry = { tex, aspect: w / h };
  labelCache.set(text, entry);
  return entry;
}

/** THREE.Color scaled into HDR range so bloom picks it up. */
export function hdrColor(hex, k) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return c;
}
