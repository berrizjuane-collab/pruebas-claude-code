/**
 * The whole game shares one palette so five very different zones still read as
 * the same city. Zones re-tint the *environment*, never the readability colours:
 * player cyan, enemy magenta/red telegraphs and gold pickups mean the same thing
 * everywhere.
 */

export const C: Record<string, string> = {
  // Structure
  void: '#05030c',
  deepA: '#0a0718',
  deepB: '#120a24',
  wall: '#1b1330',
  wallLit: '#2b1d48',
  floor: '#0f0a1e',
  floorAlt: '#150d28',

  // Readability language
  player: '#5df2ff',
  playerDeep: '#0b7f96',
  ally: '#7cf6c8',
  enemy: '#ff3d7f',
  enemyDeep: '#8a1440',
  danger: '#ff2740',
  telegraph: '#ffb03a',
  elite: '#c77dff',
  pickup: '#ffd166',
  heal: '#5cff9d',
  energy: '#5db8ff',
  data: '#b28dff',

  // Neon accents
  magenta: '#ff4fd8',
  cyan: '#3fe9ff',
  violet: '#8b5cf6',
  amber: '#ffb03a',
  lime: '#a3ff5c',
  white: '#f2f6ff',
  ink: '#0a0714',
  ui: '#cbd5f5',
  uiDim: '#7d86ad',
};

export interface ZoneTheme {
  id: string;
  name: string;
  /** Backdrop gradient (top -> bottom). */
  sky: [string, string];
  floor: string;
  floorAlt: string;
  /** Grout / panel lines on the floor. */
  grid: string;
  wall: string;
  wallTop: string;
  wallEdge: string;
  accent: string;
  accent2: string;
  fog: string;
  /** 0..1 how much rain falls in this zone. */
  rain: number;
  /** 0..1 how much floating dust/spore/ash drifts. */
  motes: number;
  moteColor: string;
  /** Wet floor reflections. */
  wet: number;
  music: {
    root: number;
    scale: number[];
    tempo: number;
    mood: 'melancholy' | 'tense' | 'wonder' | 'sacred' | 'apex';
  };
}

export const THEMES: Record<string, ZoneTheme> = {
  slums: {
    id: 'slums',
    name: 'Barrios Bajos',
    sky: ['#0b0718', '#160c26'],
    floor: '#141024',
    floorAlt: '#191333',
    grid: '#231a44',
    wall: '#241a3d',
    wallTop: '#3a2a63',
    wallEdge: '#ff4fd8',
    accent: '#ff4fd8',
    accent2: '#3fe9ff',
    fog: 'rgba(80,40,140,0.05)',
    rain: 0.85,
    motes: 0.15,
    moteColor: '#ff8fe0',
    wet: 0.55,
    music: { root: 110, scale: [0, 3, 5, 7, 10], tempo: 84, mood: 'melancholy' },
  },
  acid: {
    id: 'acid',
    name: 'Distrito de la Lluvia Ácida',
    sky: ['#0a1210', '#12271f'],
    floor: '#101c1a',
    floorAlt: '#15251f',
    grid: '#1f3a30',
    wall: '#1c2f28',
    wallTop: '#2c4a3c',
    wallEdge: '#a3ff5c',
    accent: '#a3ff5c',
    accent2: '#ffb03a',
    fog: 'rgba(120,255,140,0.045)',
    rain: 1,
    motes: 0.5,
    moteColor: '#c8ff7a',
    wet: 0.75,
    music: { root: 98, scale: [0, 1, 5, 7, 8], tempo: 96, mood: 'tense' },
  },
  market: {
    id: 'market',
    name: 'Mercado de los Recuerdos',
    sky: ['#14061a', '#2a0a2e'],
    floor: '#1a0d24',
    floorAlt: '#22102e',
    grid: '#361a48',
    wall: '#2c1440',
    wallTop: '#47206a',
    wallEdge: '#ff4fd8',
    accent: '#ff8bd8',
    accent2: '#ffd166',
    fog: 'rgba(255,120,220,0.05)',
    rain: 0.2,
    motes: 0.8,
    moteColor: '#ffc2f2',
    wet: 0.3,
    music: { root: 123, scale: [0, 2, 3, 7, 9], tempo: 104, mood: 'wonder' },
  },
  gardens: {
    id: 'gardens',
    name: 'Jardines de Cromo',
    sky: ['#04120f', '#0a2318'],
    floor: '#0c1a16',
    floorAlt: '#10241c',
    grid: '#16332a',
    wall: '#20443a',
    wallTop: '#7fc9a8',
    wallEdge: '#7cf6c8',
    accent: '#7cf6c8',
    accent2: '#ff9ee8',
    fog: 'rgba(120,255,210,0.045)',
    rain: 0.15,
    motes: 1,
    moteColor: '#9dffd8',
    wet: 0.35,
    music: { root: 131, scale: [0, 2, 4, 7, 9], tempo: 76, mood: 'wonder' },
  },
  cathedral: {
    id: 'cathedral',
    name: 'Catedral de la Red',
    sky: ['#060818', '#0d1030'],
    floor: '#0b0e22',
    floorAlt: '#10142e',
    grid: '#1d2350',
    wall: '#171c3e',
    wallTop: '#252c60',
    wallEdge: '#8b9cff',
    accent: '#8b9cff',
    accent2: '#ffd166',
    fog: 'rgba(120,140,255,0.05)',
    rain: 0,
    motes: 0.55,
    moteColor: '#c3ccff',
    wet: 0.2,
    music: { root: 87, scale: [0, 2, 3, 5, 7, 10], tempo: 66, mood: 'sacred' },
  },
  core: {
    id: 'core',
    name: 'Núcleo de AURELION',
    sky: ['#0b0a06', '#1c1608'],
    floor: '#0e0c14',
    floorAlt: '#141026',
    grid: '#2a2340',
    wall: '#171432',
    wallTop: '#2b2452',
    wallEdge: '#ffd98a',
    accent: '#ffe3a3',
    accent2: '#fff7e0',
    fog: 'rgba(255,220,150,0.045)',
    rain: 0,
    motes: 0.7,
    moteColor: '#ffe9b8',
    wet: 0.15,
    music: { root: 73, scale: [0, 1, 4, 5, 7, 8, 11], tempo: 92, mood: 'apex' },
  },
};

/** rgba() from a hex string plus alpha, cached because it runs thousands of times a frame. */
const rgbaCache = new Map<string, string>();
export function withAlpha(hex: string, alpha: number): string {
  // Already an rgba()/named colour — hand it back untouched instead of
  // producing rgba(NaN,…) when a value gets alpha-ed twice.
  if (hex.charCodeAt(0) !== 35) return hex;
  const key = hex + '|' + alpha.toFixed(3);
  const hit = rgbaCache.get(key);
  if (hit) return hit;
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const out = `rgba(${r},${g},${b},${alpha})`;
  rgbaCache.set(key, out);
  return out;
}

/** Mix two hex colours; returns a hex string. */
export function mix(a: string, b: string, t: number): string {
  const pa = a.replace('#', '');
  const pb = b.replace('#', '');
  const out = [0, 2, 4].map((i) => {
    const va = parseInt(pa.slice(i, i + 2), 16);
    const vb = parseInt(pb.slice(i, i + 2), 16);
    return Math.round(va + (vb - va) * t)
      .toString(16)
      .padStart(2, '0');
  });
  return '#' + out.join('');
}
