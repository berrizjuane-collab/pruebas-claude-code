/**
 * Stylized Tokyo map backdrop — a dark "night navigation" ground plane the
 * network sits on, in the spirit of a dimmed satellite/vector basemap.
 *
 * DATA PROVENANCE (honest notes): the geography here (coastline of Tokyo Bay
 * with its landfill islands, the Sumida / Arakawa / Naka / Edogawa rivers, the
 * Kanda river, the Imperial Palace and the major parks, a handful of arterial
 * roads and the JR Yamanote loop) is hand-drawn from general knowledge of
 * Tokyo, using the SAME lon/lat→km projection as the stations so everything
 * stays registered. It is a recognizable approximation for orientation, not
 * GIS data — accuracy is on the order of a few hundred meters. The generic
 * "urban fabric" blocks are procedural texture, not real buildings.
 *
 * Everything is drawn once into a canvas texture at load.
 */
import * as THREE from 'three';
import { PROJECTION } from '../graph/buildGraph.js';

// Plane extents in scene km (must comfortably contain the whole network:
// x ∈ [-12.2, 19.4], z ∈ [-9.8, 7.3])
export const MAP = { x0: -18, x1: 26, z0: -14, z1: 12 };
const PX_PER_KM = 46;

const W = Math.round((MAP.x1 - MAP.x0) * PX_PER_KM);
const H = Math.round((MAP.z1 - MAP.z0) * PX_PER_KM);

const C = {
  ground: '#0c1424',
  fabric1: '#16233f',
  fabric2: '#0d1830',
  road: '#1e2f52',
  water: '#040c19',
  waterEdge: '#24405f',
  park: '#123626',
  parkEdge: '#1d4a33',
  yamanote: '#46587a',
};

function px(lon, lat) {
  const x = (lon - PROJECTION.LON0) * PROJECTION.KM_PER_LON;
  const z = -(lat - PROJECTION.LAT0) * PROJECTION.KM_PER_LAT;
  return [(x - MAP.x0) * PX_PER_KM, (z - MAP.z0) * PX_PER_KM];
}

const km = (v) => v * PX_PER_KM;

/** Deterministic PRNG so the fabric is stable between loads. */
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function poly(ctx, pts) {
  ctx.beginPath();
  pts.forEach(([lon, lat], i) => {
    const [x, y] = px(lon, lat);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
}

function stroke(ctx, pts, color, widthKm, alpha = 1) {
  poly(ctx, pts);
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = km(widthKm);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function blob(ctx, lon, lat, rxKm, rzKm, fill, edge) {
  const [x, y] = px(lon, lat);
  ctx.beginPath();
  ctx.ellipse(x, y, km(rxKm), km(rzKm), 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (edge) {
    ctx.strokeStyle = edge;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.7;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function pad(ctx, lon, lat, wKm, hKm, rot, fill) {
  const [x, y] = px(lon, lat);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  const w = km(wKm);
  const h = km(hKm);
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, km(0.15));
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
}

/* ── geography (lon, lat polylines) ─────────────────────────────────── */

// Mainland waterline of Tokyo Bay, west → east
const COAST = [
  [139.665, 35.585], [139.700, 35.598], [139.722, 35.610], [139.737, 35.622],
  [139.748, 35.634], [139.757, 35.646], [139.764, 35.656], [139.771, 35.663],
  [139.778, 35.668], [139.786, 35.670], [139.795, 35.666], [139.803, 35.660],
  [139.810, 35.653], [139.820, 35.648], [139.838, 35.646], [139.858, 35.640],
  [139.878, 35.637], [139.900, 35.633], [139.930, 35.626], [139.970, 35.615],
  [140.020, 35.600],
];

const SUMIDA = [
  [139.805, 35.760], [139.802, 35.744], [139.797, 35.728], [139.801, 35.712],
  [139.796, 35.700], [139.789, 35.689], [139.786, 35.678], [139.781, 35.669],
  [139.777, 35.660], [139.775, 35.648],
];

const ARAKAWA = [
  [139.770, 35.800], [139.788, 35.775], [139.808, 35.752], [139.828, 35.730],
  [139.843, 35.705], [139.853, 35.682], [139.858, 35.662], [139.856, 35.640],
];

const NAKAGAWA = [
  [139.845, 35.790], [139.850, 35.760], [139.858, 35.730], [139.862, 35.705],
  [139.865, 35.685], [139.866, 35.663],
];

const EDOGAWA = [
  [139.902, 35.790], [139.908, 35.760], [139.902, 35.730], [139.908, 35.700],
  [139.914, 35.672], [139.910, 35.645], [139.905, 35.628],
];

const KANDA_RIVER = [
  [139.660, 35.706], [139.690, 35.703], [139.712, 35.706], [139.730, 35.702],
  [139.748, 35.701], [139.762, 35.698], [139.770, 35.702], [139.776, 35.697],
  [139.781, 35.669],
];

const MEGURO_RIVER = [
  [139.688, 35.660], [139.700, 35.648], [139.712, 35.633], [139.725, 35.618],
];

// JR Yamanote loop (orientation aid, drawn faintly — not clickable data)
const YAMANOTE = [
  [139.702, 35.658], [139.700, 35.670], [139.701, 35.683], [139.700, 35.690],
  [139.703, 35.702], [139.707, 35.713], [139.711, 35.721], [139.711, 35.729],
  [139.722, 35.736], [139.739, 35.738], [139.753, 35.735], [139.761, 35.733],
  [139.766, 35.727], [139.771, 35.721], [139.777, 35.714], [139.778, 35.707],
  [139.775, 35.698], [139.771, 35.691], [139.767, 35.681], [139.765, 35.671],
  [139.758, 35.662], [139.749, 35.647], [139.740, 35.630], [139.728, 35.622],
  [139.716, 35.620], [139.702, 35.626], [139.696, 35.634], [139.698, 35.646],
  [139.702, 35.658],
];

const ROADS = [
  // Yasukuni-dōri (E–W through Shinjuku)
  [[139.640, 35.699], [139.690, 35.694], [139.720, 35.696], [139.750, 35.699], [139.775, 35.698]],
  // Aoyama-dōri (Palace → Shibuya)
  [[139.752, 35.678], [139.730, 35.671], [139.712, 35.665], [139.702, 35.658]],
  // Chūō-dōri (Ueno → Ginza → Shinagawa direction)
  [[139.775, 35.712], [139.771, 35.698], [139.768, 35.684], [139.764, 35.670], [139.757, 35.655]],
  // Meiji-dōri arc (Shibuya → Shinjuku → Ikebukuro)
  [[139.702, 35.652], [139.706, 35.670], [139.703, 35.690], [139.707, 35.712], [139.714, 35.732]],
  // Hibiya-dōri (bay side, N–S past the palace)
  [[139.759, 35.640], [139.757, 35.660], [139.757, 35.676], [139.762, 35.690]],
  // Shinjuku-dōri (Palace → Shinjuku)
  [[139.752, 35.687], [139.730, 35.689], [139.710, 35.690], [139.700, 35.691]],
  // Kasaibashi-dōri (east lowlands E–W)
  [[139.790, 35.668], [139.820, 35.668], [139.850, 35.665], [139.880, 35.664]],
  // Ōme-kaidō (west corridor along the Marunouchi line)
  [[139.620, 35.703], [139.650, 35.700], [139.680, 35.698], [139.700, 35.694]],
];

const PARKS = [
  { c: [139.7545, 35.6845], rx: 0.85, rz: 0.70 }, // Imperial Palace
  { c: [139.6995, 35.6715], rx: 0.70, rz: 0.60 }, // Yoyogi Park / Meiji Shrine
  { c: [139.7740, 35.7155], rx: 0.55, rz: 0.70 }, // Ueno Park
  { c: [139.7100, 35.6855], rx: 0.50, rz: 0.35 }, // Shinjuku Gyoen
  { c: [139.7560, 35.6740], rx: 0.24, rz: 0.20 }, // Hibiya Park
  { c: [139.8080, 35.6720], rx: 0.30, rz: 0.24 }, // Kiba Park
  { c: [139.7515, 35.7150], rx: 0.30, rz: 0.24 }, // Koishikawa Kōrakuen
];

// Landfill-island pads re-asserted as land after the bay is filled (the
// Yūrakuchō line's waterfront stations sit on these)
const ISLANDS = [
  { c: [139.7840, 35.6600], w: 1.1, h: 2.3, rot: -0.9 },  // Tsukishima / Harumi
  { c: [139.7970, 35.6500], w: 1.7, h: 1.9, rot: -0.4 },  // Toyosu
  { c: [139.8120, 35.6450], w: 1.7, h: 1.4, rot: -0.2 },  // Shinonome / Tatsumi
  { c: [139.8320, 35.6440], w: 2.4, h: 1.3, rot: 0 },     // Shin-Kiba
  { c: [139.7770, 35.6270], w: 2.2, h: 1.2, rot: -0.3 },  // Odaiba (decorative)
];

/* ── texture build ──────────────────────────────────────────────────── */

let cached = null;

export function getTokyoMapTexture() {
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Ground
  ctx.fillStyle = C.ground;
  ctx.fillRect(0, 0, W, H);

  // Procedural urban fabric: small blocks, denser toward the center
  const rand = mulberry32(20260707);
  for (let i = 0; i < 5200; i++) {
    // average-of-2 sampling pulls the density toward the middle
    const lon = 139.60 + ((rand() + rand()) / 2) * 0.42;
    const lat = 35.585 + ((rand() + rand()) / 2) * 0.225;
    const [x, y] = px(lon, lat);
    const s = 3 + rand() * 11;
    ctx.fillStyle = rand() > 0.5 ? C.fabric1 : C.fabric2;
    ctx.globalAlpha = 0.08 + rand() * 0.13;
    ctx.fillRect(x - s / 2, y - s / 2, s, s * (0.5 + rand() * 0.9));
  }
  ctx.globalAlpha = 1;

  // Arterial roads
  for (const r of ROADS) stroke(ctx, r, C.road, 0.09, 0.65);

  // Parks
  for (const p of PARKS) blob(ctx, p.c[0], p.c[1], p.rx, p.rz, C.park, C.parkEdge);

  // Tokyo Bay: everything south of the coast polyline
  poly(ctx, COAST);
  ctx.lineTo(W + 40, H + 40);
  ctx.lineTo(-40, H + 40);
  ctx.closePath();
  ctx.fillStyle = C.water;
  ctx.fill();

  // Landfill islands back on top of the bay
  for (const isl of ISLANDS) pad(ctx, isl.c[0], isl.c[1], isl.w, isl.h, isl.rot, '#0c1426');

  // Rivers
  stroke(ctx, ARAKAWA, C.water, 0.42);
  stroke(ctx, NAKAGAWA, C.water, 0.18);
  stroke(ctx, EDOGAWA, C.water, 0.30);
  stroke(ctx, SUMIDA, C.water, 0.20);
  stroke(ctx, KANDA_RIVER, C.water, 0.07);
  stroke(ctx, MEGURO_RIVER, C.water, 0.06);

  // Water edges (subtle luminous rim so water reads on the dark ground)
  stroke(ctx, COAST, C.waterEdge, 0.05, 0.95);
  stroke(ctx, ARAKAWA, C.waterEdge, 0.04, 0.6);
  stroke(ctx, EDOGAWA, C.waterEdge, 0.035, 0.55);
  stroke(ctx, SUMIDA, C.waterEdge, 0.03, 0.65);
  stroke(ctx, NAKAGAWA, C.waterEdge, 0.03, 0.4);

  // JR Yamanote loop — faint orientation ring
  stroke(ctx, YAMANOTE, C.yamanote, 0.06, 0.65);

  // Vignette: fade the plane's borders into the void
  ctx.globalCompositeOperation = 'destination-out';
  const fade = km(3.5);
  for (const [x0, y0, x1, y1] of [
    [0, 0, 0, fade],          // top
    [0, H, 0, H - fade],      // bottom
    [0, 0, fade, 0],          // left
    [W, 0, W - fade, 0],      // right
  ]) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.globalCompositeOperation = 'source-over';

  cached = new THREE.CanvasTexture(canvas);
  cached.anisotropy = 4;
  cached.minFilter = THREE.LinearMipmapLinearFilter;
  return cached;
}
