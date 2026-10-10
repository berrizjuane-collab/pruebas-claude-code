/**
 * Colocación determinista de las nubes (pura, sin DOM: se prueba en Node).
 *
 * Dos familias, ambas ilustrativas (no son una observación meteorológica):
 *  - Mar de nubes convectivas de tarde entre 6 300 y 7 300 m, en racimos alrededor del
 *    macizo: es la franja donde suelen formarse los cúmulos que envuelven el K2.
 *  - Nube de bandera en la cumbre: los vientos dominantes del oeste arrastran un penacho
 *    hacia el este, a sotavento, entre 8 150 y 8 450 m.
 * Cada «copo» es un billboard. Puede apoyarse en las laderas (el shader lo desvanece donde
 * toca el relieve), pero su centro debe quedar holgadamente sobre el terreno para que al
 * menos media nube se vea.
 */

export interface CloudPuff {
  /** coordenadas locales (m): x este, y norte; alt = altitud del centro (m) */
  x: number;
  y: number;
  alt: number;
  /** ancho y alto del billboard (m) */
  w: number;
  h: number;
  /** variante de la textura (0–3) */
  tile: number;
  /** luminosidad relativa 0–1 (sombra propia aproximada) */
  shade: number;
  /** fase del vaivén del viento */
  phase: number;
  /** penacho de cumbre o mar de nubes */
  kind: 'mar' | 'bandera';
}

export interface CloudLayoutOptions {
  seed?: number;
  /** número de racimos del mar de nubes */
  clusters?: number;
  /** amplitud del vaivén horizontal (m): se reserva en la holgura */
  sway?: number;
  /** cumbre del modelo (coordenadas locales) */
  summit: { x: number; y: number };
  /** límite del área (m, semilado) */
  half: number;
}

export const CLOUD_DECK = { min: 6300, max: 7300 } as const;
export const BANNER = { min: 8150, max: 8450 } as const;

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Altura máxima del relieve en el círculo de radio r (centro + 12 puntos del borde + 6 intermedios). */
export function maxTerrainAround(heightAt: (x: number, y: number) => number, x: number, y: number, r: number): number {
  let m = heightAt(x, y);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    m = Math.max(m, heightAt(x + Math.cos(a) * r, y + Math.sin(a) * r));
    if (k % 2 === 0) m = Math.max(m, heightAt(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5));
  }
  return m;
}


export function layoutClouds(heightAt: (x: number, y: number) => number, opts: CloudLayoutOptions): CloudPuff[] {
  const rnd = mulberry32(opts.seed ?? 2008);
  const sway = opts.sway ?? 120;
  const out: CloudPuff[] = [];
  const fits = (x: number, y: number, alt: number, w: number, h: number) =>
    Math.abs(x) + w / 2 + sway < opts.half &&
    Math.abs(y) + w / 2 + sway < opts.half &&
    maxTerrainAround(heightAt, x, y, Math.min(w * 0.15, 200)) < alt - h * 0.15;

  const cluster = (cx: number, cy: number, spread: number, n: number, base: number, wMin: number, wMax: number) => {
    const puffs: CloudPuff[] = [];
    for (let i = 0; i < n; i++) {
      const w = wMin + rnd() * (wMax - wMin);
      const h = w * (0.42 + rnd() * 0.18);
      const x = cx + (rnd() - 0.5) * spread;
      const y = cy + (rnd() - 0.5) * spread;
      // los copos del centro del racimo, más altos (cúmulo con torre)
      const alt = Math.min(CLOUD_DECK.max - h / 2, base + h / 2 + rnd() * 250 + (i === 0 ? 220 : 0));
      if (!fits(x, y, alt, w, h)) continue;
      puffs.push({ x, y, alt, w, h, tile: Math.floor(rnd() * 4), shade: 0.78 + rnd() * 0.22, phase: rnd() * Math.PI * 2, kind: 'mar' });
    }
    return puffs;
  };

  // collar de nubes pegado a las laderas del K2 (1,2–4 km de la cumbre)
  for (let k = 0; k < 10; k++) {
    const ang = (k / 10) * Math.PI * 2 + rnd() * 0.5;
    const rad = 1200 + rnd() * 2800;
    const base = CLOUD_DECK.min + rnd() * 500;
    out.push(...cluster(opts.summit.x + Math.cos(ang) * rad, opts.summit.y + Math.sin(ang) * rad, 900, 3 + Math.floor(rnd() * 3), base, 600, 1300));
  }
  // mar de nubes: racimos en un anillo de 4–12 km alrededor de la cumbre
  const clusters = opts.clusters ?? 12;
  let attempts = 0;
  let made = 0;
  while (made < clusters && attempts < clusters * 40) {
    attempts++;
    const ang = rnd() * Math.PI * 2;
    const rad = 4000 + rnd() * 8000;
    const base = CLOUD_DECK.min + rnd() * (CLOUD_DECK.max - CLOUD_DECK.min - 500);
    const puffs = cluster(opts.summit.x + Math.cos(ang) * rad, opts.summit.y + Math.sin(ang) * rad, 2000, 4 + Math.floor(rnd() * 4), base, 800, 1800);
    if (puffs.length >= 2) {
      out.push(...puffs);
      made++;
    }
  }

  // nube de bandera: penacho hacia el este desde la cumbre, que desciende y se deshilacha
  for (let i = 0; i < 8; i++) {
    const t = i / 7;
    const w = 300 + t * 800 + rnd() * 100;
    const h = w * (0.3 + rnd() * 0.08);
    const x = opts.summit.x + 260 + t * 1900 + (rnd() - 0.5) * 100;
    const y = opts.summit.y + (rnd() - 0.5) * 200 - t * 180;
    const alt = BANNER.max - h / 2 - t * 260;
    if (!fits(x, y, alt, w, h)) continue;
    out.push({ x, y, alt, w, h, tile: Math.floor(rnd() * 4), shade: 0.92 - t * 0.2, phase: rnd() * Math.PI * 2, kind: 'bandera' });
  }
  return out;
}
