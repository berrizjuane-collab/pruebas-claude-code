/**
 * Colocación de etiquetas sin solapes (voraz por prioridad). Cada etiqueta prueba
 * posiciones junto a su ancla y, si no caben, posiciones alejadas con línea guía.
 * Los puntos de ancla de otros marcadores también son obstáculos.
 */
export interface LabelCandidate {
  id: string;
  /** ancla en píxeles CSS */
  x: number;
  y: number;
  w: number;
  h: number;
  /** menor = más importante */
  priority: number;
  forced?: boolean;
}

export interface LabelPlacement {
  id: string;
  visible: boolean;
  /** esquina superior izquierda de la etiqueta */
  lx: number;
  ly: number;
  leader: boolean;
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

export function layoutLabels(
  cands: LabelCandidate[],
  viewport: { width: number; height: number; top?: number; bottom?: number; left?: number; right?: number },
  gap = 9,
  dot = 14,
): LabelPlacement[] {
  const order = [...cands].sort((a, b) => Number(!!b.forced) - Number(!!a.forced) || a.priority - b.priority || a.id.localeCompare(b.id));
  const placed: Box[] = [];
  const out = new Map<string, LabelPlacement>();
  const dots: Box[] = cands.map((c) => ({ x0: c.x - dot / 2, y0: c.y - dot / 2, x1: c.x + dot / 2, y1: c.y + dot / 2 }));
  const minX = viewport.left ?? 4;
  const minY = viewport.top ?? 4;
  const maxX = viewport.width - (viewport.right ?? 4);
  const maxY = viewport.height - (viewport.bottom ?? 4);
  for (const c of order) {
    const near: [number, number, boolean][] = [
      [c.x + gap, c.y - c.h / 2, false],
      [c.x - gap - c.w, c.y - c.h / 2, false],
      [c.x - c.w / 2, c.y - gap - c.h, false],
      [c.x - c.w / 2, c.y + gap, false],
      [c.x + gap + 26, c.y - c.h - 18, true],
      [c.x - gap - 26 - c.w, c.y - c.h - 18, true],
      [c.x + gap + 26, c.y + 18, true],
      [c.x - gap - 26 - c.w, c.y + 18, true],
      [c.x - c.w / 2, c.y - gap - c.h - 34, true],
      [c.x - c.w / 2, c.y + gap + 34, true],
    ];
    let done = false;
    for (const [lx, ly, leader] of near) {
      const box = { x0: lx - 2, y0: ly - 2, x1: lx + c.w + 2, y1: ly + c.h + 2 };
      if (box.x0 < minX || box.y0 < minY || box.x1 > maxX || box.y1 > maxY) continue;
      if (placed.some((p) => overlaps(p, box))) continue;
      if (dots.some((d, k) => cands[k].id !== c.id && overlaps(d, box))) continue;
      placed.push(box);
      out.set(c.id, { id: c.id, visible: true, lx, ly, leader });
      done = true;
      break;
    }
    if (!done && c.forced) {
      // la selección siempre se ve: se encaja dentro del viewport aunque solape
      const lx = Math.min(Math.max(c.x + gap, minX), maxX - c.w);
      const ly = Math.min(Math.max(c.y - c.h / 2, minY), maxY - c.h);
      placed.push({ x0: lx, y0: ly, x1: lx + c.w, y1: ly + c.h });
      out.set(c.id, { id: c.id, visible: true, lx, ly, leader: Math.hypot(lx - c.x, ly - c.y) > 60 });
    } else if (!done) out.set(c.id, { id: c.id, visible: false, lx: c.x + gap, ly: c.y - c.h / 2, leader: false });
  }
  return cands.map((c) => out.get(c.id)!);
}
