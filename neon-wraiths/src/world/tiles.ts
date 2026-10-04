/**
 * Rooms are authored as ASCII grids. Terrain lives in the grid; everything else
 * (doors, props, spawns) is data with tile coordinates. The static layer is
 * pre-rendered once per room entry, so per-frame cost is only the animated bits.
 *
 *   .  floor            #  wall            X  machinery (solid)
 *   =  low barrier      ~  hazard          v  void / abyss (solid)
 *   _  lit floor panel  ,  grime floor
 */

import { TAU, clamp, makeRng, type Rect } from '../core/util';
import { ZoneTheme, withAlpha, mix } from '../art/palette';
import { disc, glow, poly } from '../core/render';

export const TILE = 32;

export const enum T {
  Floor = 0,
  Wall = 1,
  Machine = 2,
  Barrier = 3,
  Hazard = 4,
  Void = 5,
  Panel = 6,
  Grime = 7,
}

const CHAR_TO_TILE: Record<string, T> = {
  '.': T.Floor,
  ' ': T.Floor,
  '#': T.Wall,
  X: T.Machine,
  '=': T.Barrier,
  '~': T.Hazard,
  v: T.Void,
  _: T.Panel,
  ',': T.Grime,
};

export const isSolidTile = (t: T): boolean =>
  t === T.Wall || t === T.Machine || t === T.Barrier || t === T.Void;

export const isFloorTile = (t: T): boolean => !isSolidTile(t);

export class TileMap {
  readonly cols: number;
  readonly rows: number;
  readonly width: number;
  readonly height: number;
  readonly tiles: Uint8Array;
  /** Extra solid rects injected at runtime (closed doors, boss arena shutters). */
  readonly blockers: Rect[] = [];
  /** Hazard tiles can be toggled off by valves/levers. */
  hazardEnabled = true;
  private staticLayer: HTMLCanvasElement | null = null;
  private theme!: ZoneTheme;

  constructor(map: string[]) {
    this.cols = Math.max(...map.map((r) => r.length));
    this.rows = map.length;
    this.width = this.cols * TILE;
    this.height = this.rows * TILE;
    this.tiles = new Uint8Array(this.cols * this.rows);
    for (let y = 0; y < this.rows; y++) {
      const row = map[y] ?? '';
      for (let x = 0; x < this.cols; x++) {
        const ch = row[x] ?? '#';
        this.tiles[y * this.cols + x] = CHAR_TO_TILE[ch] ?? T.Wall;
      }
    }
  }

  at(tx: number, ty: number): T {
    if (tx < 0 || ty < 0 || tx >= this.cols || ty >= this.rows) return T.Wall;
    return this.tiles[ty * this.cols + tx] as T;
  }

  set(tx: number, ty: number, t: T): void {
    if (tx < 0 || ty < 0 || tx >= this.cols || ty >= this.rows) return;
    this.tiles[ty * this.cols + tx] = t;
    this.staticLayer = null;
  }

  solidAtPixel(x: number, y: number): boolean {
    return isSolidTile(this.at(Math.floor(x / TILE), Math.floor(y / TILE)));
  }

  hazardAtPixel(x: number, y: number): boolean {
    if (!this.hazardEnabled) return false;
    return this.at(Math.floor(x / TILE), Math.floor(y / TILE)) === T.Hazard;
  }

  /** Does a circle overlap any solid tile or blocker? */
  circleBlocked(cx: number, cy: number, r: number): boolean {
    const minX = Math.floor((cx - r) / TILE);
    const maxX = Math.floor((cx + r) / TILE);
    const minY = Math.floor((cy - r) / TILE);
    const maxY = Math.floor((cy + r) / TILE);
    for (let ty = minY; ty <= maxY; ty++) {
      for (let tx = minX; tx <= maxX; tx++) {
        if (!isSolidTile(this.at(tx, ty))) continue;
        const rx = tx * TILE;
        const ry = ty * TILE;
        const nx = clamp(cx, rx, rx + TILE);
        const ny = clamp(cy, ry, ry + TILE);
        const dx = cx - nx;
        const dy = cy - ny;
        if (dx * dx + dy * dy < r * r) return true;
      }
    }
    for (const b of this.blockers) {
      const nx = clamp(cx, b.x, b.x + b.w);
      const ny = clamp(cy, b.y, b.y + b.h);
      const dx = cx - nx;
      const dy = cy - ny;
      if (dx * dx + dy * dy < r * r) return true;
    }
    return false;
  }

  /**
   * Move a circle with per-axis resolution, so sliding along walls feels smooth
   * and diagonal input never sticks on corners.
   */
  moveCircle(
    pos: { x: number; y: number },
    dx: number,
    dy: number,
    r: number,
  ): { hitX: boolean; hitY: boolean } {
    let hitX = false;
    let hitY = false;
    if (dx !== 0) {
      const nx = pos.x + dx;
      if (!this.circleBlocked(nx, pos.y, r)) {
        pos.x = nx;
      } else {
        // Binary search the largest safe step; avoids visible gaps at walls.
        let lo = 0;
        let hi = dx;
        for (let i = 0; i < 6; i++) {
          const mid = (lo + hi) / 2;
          if (!this.circleBlocked(pos.x + mid, pos.y, r)) lo = mid;
          else hi = mid;
        }
        pos.x += lo;
        hitX = true;
      }
    }
    if (dy !== 0) {
      const ny = pos.y + dy;
      if (!this.circleBlocked(pos.x, ny, r)) {
        pos.y = ny;
      } else {
        let lo = 0;
        let hi = dy;
        for (let i = 0; i < 6; i++) {
          const mid = (lo + hi) / 2;
          if (!this.circleBlocked(pos.x, pos.y + mid, r)) lo = mid;
          else hi = mid;
        }
        pos.y += lo;
        hitY = true;
      }
    }
    return { hitX, hitY };
  }

  /** Line of sight between two points, sampled at half-tile resolution. */
  lineOfSight(ax: number, ay: number, bx: number, by: number): boolean {
    const dx = bx - ax;
    const dy = by - ay;
    const steps = Math.ceil(Math.hypot(dx, dy) / (TILE * 0.5));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = ax + dx * t;
      const y = ay + dy * t;
      const tile = this.at(Math.floor(x / TILE), Math.floor(y / TILE));
      if (tile === T.Wall || tile === T.Machine || tile === T.Void) return false;
    }
    return true;
  }

  /** Nearest walkable point — used to keep spawns and knockback inside the room. */
  clampToFloor(x: number, y: number, r: number): { x: number; y: number } {
    if (!this.circleBlocked(x, y, r)) return { x, y };
    for (let radius = TILE / 2; radius <= TILE * 6; radius += TILE / 2) {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        const nx = x + Math.cos(a) * radius;
        const ny = y + Math.sin(a) * radius;
        if (!this.circleBlocked(nx, ny, r)) return { x: nx, y: ny };
      }
    }
    return { x, y };
  }

  randomFloorPoint(rng: () => number, r = 14): { x: number; y: number } {
    for (let i = 0; i < 200; i++) {
      const tx = Math.floor(rng() * this.cols);
      const ty = Math.floor(rng() * this.rows);
      if (!isFloorTile(this.at(tx, ty))) continue;
      const x = tx * TILE + TILE / 2;
      const y = ty * TILE + TILE / 2;
      if (!this.circleBlocked(x, y, r)) return { x, y };
    }
    return { x: this.width / 2, y: this.height / 2 };
  }

  invalidate(): void {
    this.staticLayer = null;
  }

  // ---------------------------------------------------------------- rendering

  private buildStatic(theme: ZoneTheme): HTMLCanvasElement {
    const cv = document.createElement('canvas');
    cv.width = this.width;
    cv.height = this.height;
    const c = cv.getContext('2d')!;
    const rng = makeRng(this.cols * 7919 + this.rows * 104729);

    c.fillStyle = theme.floor;
    c.fillRect(0, 0, this.width, this.height);

    // --- floor tiles
    for (let ty = 0; ty < this.rows; ty++) {
      for (let tx = 0; tx < this.cols; tx++) {
        const t = this.at(tx, ty);
        const x = tx * TILE;
        const y = ty * TILE;
        if (t === T.Void) {
          c.fillStyle = '#03030a';
          c.fillRect(x, y, TILE, TILE);
          continue;
        }
        if (isSolidTile(t)) continue;
        const shade = rng();
        if (t === T.Panel) {
          c.fillStyle = mix(theme.floorAlt, theme.accent, 0.07);
        } else if (t === T.Grime) {
          c.fillStyle = mix(theme.floor, '#000000', 0.35);
        } else if (t === T.Hazard) {
          c.fillStyle = mix(theme.floor, '#000000', 0.5);
        } else {
          c.fillStyle = shade > 0.82 ? theme.floorAlt : theme.floor;
        }
        c.fillRect(x, y, TILE, TILE);
        // Panel seams give scale without noise.
        c.strokeStyle = withAlpha(theme.grid, 0.32);
        c.lineWidth = 1;
        c.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
        if (t === T.Panel) {
          c.strokeStyle = withAlpha(theme.accent, 0.14);
          c.strokeRect(x + 3.5, y + 3.5, TILE - 7, TILE - 7);
        }
        // Sparse floor detail: bolts, cracks, stains.
        const d = rng();
        if (d > 0.965) {
          c.fillStyle = withAlpha(theme.grid, 0.9);
          c.fillRect(x + 4, y + 4, 3, 3);
          c.fillRect(x + TILE - 7, y + TILE - 7, 3, 3);
        } else if (d < 0.03) {
          c.strokeStyle = withAlpha('#000000', 0.4);
          c.lineWidth = 1.5;
          c.beginPath();
          c.moveTo(x + rng() * TILE, y);
          c.lineTo(x + rng() * TILE, y + TILE);
          c.stroke();
        }
      }
    }

    // --- wall bodies
    for (let ty = 0; ty < this.rows; ty++) {
      for (let tx = 0; tx < this.cols; tx++) {
        const t = this.at(tx, ty);
        if (!isSolidTile(t) || t === T.Void) continue;
        const x = tx * TILE;
        const y = ty * TILE;
        const isBarrier = t === T.Barrier;
        const isMachine = t === T.Machine;
        const h = isBarrier ? TILE * 0.62 : TILE;
        const top = y + (TILE - h);

        c.fillStyle = isMachine ? mix(theme.wall, '#000000', 0.25) : theme.wall;
        c.fillRect(x, top, TILE, h);

        // Top face: a lighter cap only where the tile above is open.
        if (!isSolidTile(this.at(tx, ty - 1)) || isBarrier) {
          const grad = c.createLinearGradient(0, top, 0, top + 12);
          grad.addColorStop(0, theme.wallTop);
          grad.addColorStop(1, withAlpha(theme.wallTop, 0));
          c.fillStyle = grad;
          c.fillRect(x, top, TILE, 12);
        }
        if (isMachine) {
          c.strokeStyle = withAlpha(theme.accent, 0.28);
          c.lineWidth = 1;
          for (let i = 0; i < 3; i++) {
            const yy = top + 7 + i * 8;
            c.beginPath();
            c.moveTo(x + 5, yy);
            c.lineTo(x + TILE - 5, yy);
            c.stroke();
          }
          if (rng() > 0.6) {
            c.fillStyle = withAlpha(theme.accent2, 0.7);
            c.fillRect(x + TILE / 2 - 2, top + 5, 4, 4);
          }
        } else if (isBarrier) {
          c.strokeStyle = withAlpha(theme.accent, 0.4);
          c.lineWidth = 1.5;
          c.strokeRect(x + 2.5, top + 2.5, TILE - 5, h - 5);
        } else if (rng() > 0.86) {
          // Panel plating detail on plain walls.
          c.fillStyle = withAlpha('#000000', 0.25);
          c.fillRect(x + 6, top + 8, TILE - 12, TILE - 16);
        }
      }
    }

    // --- contact edges: bright rim + drop shadow where a wall meets open floor
    for (let ty = 0; ty < this.rows; ty++) {
      for (let tx = 0; tx < this.cols; tx++) {
        const t = this.at(tx, ty);
        const x = tx * TILE;
        const y = ty * TILE;
        if (t === T.Void) {
          // Void gets an inner glow rim so the abyss reads as dangerous, not as a bug.
          const openSouth = this.at(tx, ty + 1) !== T.Void;
          const openNorth = this.at(tx, ty - 1) !== T.Void;
          c.strokeStyle = withAlpha(theme.accent, 0.5);
          c.lineWidth = 2;
          if (openNorth) {
            c.beginPath();
            c.moveTo(x, y + 1);
            c.lineTo(x + TILE, y + 1);
            c.stroke();
          }
          if (openSouth) {
            c.beginPath();
            c.moveTo(x, y + TILE - 1);
            c.lineTo(x + TILE, y + TILE - 1);
            c.stroke();
          }
          continue;
        }
        if (!isSolidTile(t)) continue;
        const south = this.at(tx, ty + 1);
        if (isFloorTile(south)) {
          const yy = y + TILE;
          const g = c.createLinearGradient(0, yy, 0, yy + 16);
          g.addColorStop(0, 'rgba(0,0,0,0.55)');
          g.addColorStop(1, 'rgba(0,0,0,0)');
          c.fillStyle = g;
          c.fillRect(x, yy, TILE, 16);
          c.strokeStyle = withAlpha(theme.wallEdge, t === T.Barrier ? 0.5 : 0.75);
          c.lineWidth = 2;
          c.beginPath();
          c.moveTo(x, yy - 1);
          c.lineTo(x + TILE, yy - 1);
          c.stroke();
        }
        for (const [ox, oy] of [
          [-1, 0],
          [1, 0],
        ] as const) {
          if (isFloorTile(this.at(tx + ox, ty + oy))) {
            c.strokeStyle = withAlpha(theme.wallEdge, 0.22);
            c.lineWidth = 2;
            c.beginPath();
            const lx = ox < 0 ? x + 1 : x + TILE - 1;
            c.moveTo(lx, y);
            c.lineTo(lx, y + TILE);
            c.stroke();
          }
        }
      }
    }

    // --- wet reflections streaking down from lit wall edges
    if (theme.wet > 0) {
      for (let ty = 0; ty < this.rows; ty++) {
        for (let tx = 0; tx < this.cols; tx++) {
          if (!isSolidTile(this.at(tx, ty))) continue;
          if (!isFloorTile(this.at(tx, ty + 1))) continue;
          if (rng() > 0.35) continue;
          const x = tx * TILE + rng() * TILE;
          const y = (ty + 1) * TILE;
          const len = 20 + rng() * 60;
          const g = c.createLinearGradient(0, y, 0, y + len);
          g.addColorStop(0, withAlpha(theme.wallEdge, 0.22 * theme.wet));
          g.addColorStop(1, withAlpha(theme.wallEdge, 0));
          c.fillStyle = g;
          c.fillRect(x - 2, y, 4, len);
        }
      }
    }

    return cv;
  }

  drawStatic(ctx: CanvasRenderingContext2D, theme: ZoneTheme): void {
    if (!this.staticLayer || this.theme !== theme) {
      this.theme = theme;
      this.staticLayer = this.buildStatic(theme);
    }
    ctx.drawImage(this.staticLayer, 0, 0);
  }

  /** Animated terrain drawn every frame on top of the static layer. */
  drawDynamic(
    ctx: CanvasRenderingContext2D,
    theme: ZoneTheme,
    time: number,
    view: { left: number; top: number; right: number; bottom: number },
  ): void {
    const minX = Math.max(0, Math.floor(view.left / TILE));
    const maxX = Math.min(this.cols - 1, Math.ceil(view.right / TILE));
    const minY = Math.max(0, Math.floor(view.top / TILE));
    const maxY = Math.min(this.rows - 1, Math.ceil(view.bottom / TILE));

    for (let ty = minY; ty <= maxY; ty++) {
      for (let tx = minX; tx <= maxX; tx++) {
        const t = this.at(tx, ty);
        const x = tx * TILE;
        const y = ty * TILE;
        if (t === T.Hazard) {
          const on = this.hazardEnabled;
          const pulse = 0.5 + 0.5 * Math.sin(time * 2.2 + (tx + ty) * 0.7);
          const col = theme.id === 'cathedral' ? '#ff4f7f' : theme.accent;
          ctx.fillStyle = withAlpha(col, on ? 0.16 + pulse * 0.16 : 0.04);
          ctx.fillRect(x, y, TILE, TILE);
          if (on) {
            // Hazard hatching: unmistakably "do not stand here".
            ctx.save();
            ctx.beginPath();
            ctx.rect(x, y, TILE, TILE);
            ctx.clip();
            ctx.strokeStyle = withAlpha(col, 0.3 + pulse * 0.2);
            ctx.lineWidth = 3;
            const off = (time * 14) % 16;
            for (let i = -TILE; i < TILE * 2; i += 16) {
              ctx.beginPath();
              ctx.moveTo(x + i + off, y);
              ctx.lineTo(x + i + off - TILE, y + TILE);
              ctx.stroke();
            }
            ctx.restore();
            const bub = Math.sin(time * 3 + tx * 2.1 + ty * 1.3);
            if (bub > 0.85) {
              disc(
                ctx,
                x + TILE / 2 + Math.cos(tx + ty) * 8,
                y + TILE / 2 + Math.sin(tx * 2) * 8,
                2.5,
                withAlpha(col, 0.8),
              );
            }
          }
        } else if (t === T.Void) {
          const pulse = 0.5 + 0.5 * Math.sin(time * 0.9 + tx * 0.4 + ty * 0.6);
          ctx.fillStyle = withAlpha(theme.accent, 0.03 + pulse * 0.03);
          ctx.fillRect(x, y, TILE, TILE);
        }
      }
    }
  }

  /** Soft light pools cast onto the floor by room lights. */
  drawFloorLight(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    color: string,
    alpha: number,
  ): void {
    glow(ctx, x, y, r, color, alpha);
  }
}

/** Decorative + interactive scenery. Solidity always comes from the tilemap. */
export type PropKind =
  | 'sign'
  | 'pipe'
  | 'crate'
  | 'lamp'
  | 'fan'
  | 'screen'
  | 'cable'
  | 'plant'
  | 'server'
  | 'vent'
  | 'puddle'
  | 'graffiti'
  | 'stall'
  | 'flower'
  | 'window'
  | 'banner'
  | 'debris'
  | 'body';

export interface Prop {
  kind: PropKind;
  x: number;
  y: number;
  /** Free-form: sign text, colour override, size. */
  text?: string;
  color?: string;
  scale?: number;
  seed?: number;
}

export function drawProp(
  ctx: CanvasRenderingContext2D,
  p: Prop,
  theme: ZoneTheme,
  time: number,
): void {
  const s = p.scale ?? 1;
  const col = p.color ?? theme.accent;
  const seed = p.seed ?? (p.x * 13 + p.y * 7);
  switch (p.kind) {
    case 'sign': {
      // Holographic hanging sign with flicker and a reflected halo.
      const flick = Math.sin(time * 9 + seed) > -0.86 ? 1 : 0.25;
      const w = (p.text ? p.text.length * 9 + 20 : 60) * s;
      const h = 26 * s;
      ctx.save();
      ctx.globalAlpha = 0.85 * flick;
      ctx.fillStyle = withAlpha('#000000', 0.5);
      ctx.fillRect(p.x - w / 2, p.y - h / 2, w, h);
      ctx.strokeStyle = withAlpha(col, 0.9);
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x - w / 2, p.y - h / 2, w, h);
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, p.x, p.y, w * 0.9, col, 0.18 * flick);
      ctx.restore();
      if (p.text) {
        ctx.save();
        ctx.globalAlpha = flick;
        ctx.font = `700 ${13 * s}px "Segoe UI", system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = col;
        ctx.shadowBlur = 12;
        ctx.fillStyle = col;
        ctx.fillText(p.text, p.x, p.y + 1);
        ctx.restore();
      }
      break;
    }
    case 'lamp': {
      const flick = 0.75 + 0.25 * Math.sin(time * 6.3 + seed) * (Math.sin(time * 0.7 + seed) > 0.7 ? 3 : 1);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, p.x, p.y, 120 * s, col, 0.3 * clamp(flick, 0, 1));
      ctx.restore();
      disc(ctx, p.x, p.y, 5 * s, withAlpha(col, 0.95));
      break;
    }
    case 'pipe': {
      ctx.save();
      ctx.strokeStyle = withAlpha(mix(theme.wall, '#000', 0.3), 0.95);
      ctx.lineWidth = 10 * s;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p.x - 26 * s, p.y);
      ctx.lineTo(p.x + 26 * s, p.y);
      ctx.stroke();
      ctx.strokeStyle = withAlpha(col, 0.35);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x - 24 * s, p.y - 3 * s);
      ctx.lineTo(p.x + 24 * s, p.y - 3 * s);
      ctx.stroke();
      ctx.restore();
      break;
    }
    case 'cable': {
      ctx.save();
      ctx.strokeStyle = withAlpha('#000000', 0.55);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(p.x - 40 * s, p.y - 10);
      ctx.quadraticCurveTo(p.x, p.y + 18 * s, p.x + 40 * s, p.y - 6);
      ctx.stroke();
      ctx.strokeStyle = withAlpha(col, 0.25 + 0.15 * Math.sin(time * 3 + seed));
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.restore();
      break;
    }
    case 'crate': {
      const w = 26 * s;
      ctx.fillStyle = mix(theme.wall, '#000', 0.15);
      ctx.fillRect(p.x - w / 2, p.y - w / 2, w, w);
      ctx.strokeStyle = withAlpha(col, 0.5);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(p.x - w / 2 + 2, p.y - w / 2 + 2, w - 4, w - 4);
      ctx.fillStyle = withAlpha(col, 0.6);
      ctx.fillRect(p.x - 3, p.y - w / 2 + 5, 6, 3);
      break;
    }
    case 'screen': {
      const w = 44 * s;
      const h = 30 * s;
      ctx.fillStyle = '#05040c';
      ctx.fillRect(p.x - w / 2, p.y - h / 2, w, h);
      ctx.save();
      ctx.beginPath();
      ctx.rect(p.x - w / 2, p.y - h / 2, w, h);
      ctx.clip();
      const rows = 5;
      for (let i = 0; i < rows; i++) {
        const a = 0.12 + 0.3 * Math.abs(Math.sin(time * 2 + i + seed));
        ctx.fillStyle = withAlpha(col, a);
        const lw = ((Math.sin(time * 1.3 + i * 2.2 + seed) + 1) / 2) * (w - 10);
        ctx.fillRect(p.x - w / 2 + 5, p.y - h / 2 + 5 + i * 5, lw, 3);
      }
      // Occasional dropout band sells "damaged screen".
      if (Math.sin(time * 3.1 + seed) > 0.9) {
        ctx.fillStyle = withAlpha('#ffffff', 0.2);
        ctx.fillRect(p.x - w / 2, p.y - h / 2 + ((time * 90) % h), w, 3);
      }
      ctx.restore();
      ctx.strokeStyle = withAlpha(col, 0.5);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(p.x - w / 2, p.y - h / 2, w, h);
      break;
    }
    case 'fan': {
      const r = 16 * s;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.strokeStyle = withAlpha('#000000', 0.5);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.stroke();
      ctx.rotate(time * 6 + seed);
      ctx.strokeStyle = withAlpha(theme.grid, 0.9);
      ctx.lineWidth = 4;
      for (let i = 0; i < 3; i++) {
        ctx.rotate(TAU / 3);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(r - 3, 0);
        ctx.stroke();
      }
      ctx.restore();
      break;
    }
    case 'vent': {
      ctx.fillStyle = withAlpha('#000000', 0.4);
      ctx.fillRect(p.x - 16 * s, p.y - 8 * s, 32 * s, 16 * s);
      ctx.strokeStyle = withAlpha(theme.grid, 0.9);
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(p.x - 14 * s, p.y - 6 * s + i * 4 * s);
        ctx.lineTo(p.x + 14 * s, p.y - 6 * s + i * 4 * s);
        ctx.stroke();
      }
      break;
    }
    case 'puddle': {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = withAlpha(col, 0.25);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 28 * s, 14 * s, seed % 3, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = withAlpha(col, 0.2 + 0.12 * Math.sin(time * 2 + seed));
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
      break;
    }
    case 'graffiti': {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.font = `800 ${18 * s}px "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = withAlpha(col, 0.55);
      ctx.translate(p.x, p.y);
      ctx.rotate((seed % 7) * 0.02 - 0.06);
      ctx.fillText(p.text ?? 'NO OLVIDES', 0, 0);
      ctx.restore();
      break;
    }
    case 'plant':
    case 'flower': {
      const petals = p.kind === 'flower' ? 6 : 5;
      const r = (p.kind === 'flower' ? 9 : 13) * s;
      const sway = Math.sin(time * 1.4 + seed) * 0.12;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(sway);
      ctx.strokeStyle = withAlpha(mix(col, '#0a2a1e', 0.5), 0.9);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(0, 12 * s);
      ctx.lineTo(0, -2 * s);
      ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, 0, -4 * s, r * 2.6, col, 0.22);
      ctx.fillStyle = withAlpha(col, 0.75);
      for (let i = 0; i < petals; i++) {
        ctx.save();
        ctx.rotate((i / petals) * TAU);
        ctx.beginPath();
        ctx.ellipse(0, -r * 0.65, r * 0.34, r * 0.7, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      disc(ctx, 0, -4 * s, r * 0.3, withAlpha('#ffffff', 0.85));
      ctx.restore();
      break;
    }
    case 'server': {
      const w = 30 * s;
      const h = 46 * s;
      ctx.fillStyle = mix(theme.wall, '#000', 0.4);
      ctx.fillRect(p.x - w / 2, p.y - h / 2, w, h);
      ctx.strokeStyle = withAlpha(col, 0.4);
      ctx.strokeRect(p.x - w / 2, p.y - h / 2, w, h);
      for (let i = 0; i < 7; i++) {
        const on = Math.sin(time * (3 + (i % 3)) + i * 1.7 + seed) > 0;
        ctx.fillStyle = withAlpha(on ? col : '#0b1024', on ? 0.9 : 1);
        ctx.fillRect(p.x - w / 2 + 5, p.y - h / 2 + 5 + i * 6, 4, 3);
        ctx.fillStyle = withAlpha(theme.accent2, on ? 0.5 : 0.1);
        ctx.fillRect(p.x - w / 2 + 12, p.y - h / 2 + 5 + i * 6, w - 18, 3);
      }
      break;
    }
    case 'window': {
      // Stained-glass style holo panel, cathedral flavour.
      const w = 54 * s;
      const h = 90 * s;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(p.x, p.y - h / 2, p.x, p.y + h / 2);
      g.addColorStop(0, withAlpha(col, 0.35));
      g.addColorStop(0.5, withAlpha(theme.accent2, 0.22));
      g.addColorStop(1, withAlpha(col, 0.05));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(p.x - w / 2, p.y + h / 2);
      ctx.lineTo(p.x - w / 2, p.y - h / 4);
      ctx.quadraticCurveTo(p.x, p.y - h / 2 - 10, p.x + w / 2, p.y - h / 4);
      ctx.lineTo(p.x + w / 2, p.y + h / 2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = withAlpha(col, 0.5);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - h / 3);
      ctx.lineTo(p.x, p.y + h / 2);
      ctx.moveTo(p.x - w / 2, p.y);
      ctx.lineTo(p.x + w / 2, p.y);
      ctx.stroke();
      ctx.restore();
      break;
    }
    case 'banner': {
      const h = 70 * s;
      const w = 22 * s;
      const wave = Math.sin(time * 1.6 + seed) * 3;
      ctx.save();
      ctx.fillStyle = withAlpha(col, 0.16);
      ctx.beginPath();
      ctx.moveTo(p.x - w / 2, p.y - h / 2);
      ctx.lineTo(p.x + w / 2, p.y - h / 2);
      ctx.lineTo(p.x + w / 2 + wave, p.y + h / 2);
      ctx.lineTo(p.x - w / 2 + wave, p.y + h / 2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = withAlpha(col, 0.5);
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.restore();
      break;
    }
    case 'stall': {
      const w = 62 * s;
      const h = 34 * s;
      ctx.fillStyle = mix(theme.wall, '#000', 0.3);
      ctx.fillRect(p.x - w / 2, p.y - h / 2, w, h);
      ctx.fillStyle = withAlpha(col, 0.22);
      ctx.fillRect(p.x - w / 2, p.y - h / 2 - 8, w, 10);
      ctx.strokeStyle = withAlpha(col, 0.6);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(p.x - w / 2, p.y - h / 2, w, h);
      for (let i = 0; i < 4; i++) {
        const bx = p.x - w / 2 + 10 + i * 14;
        disc(ctx, bx, p.y + 2, 4, withAlpha(i % 2 ? theme.accent2 : col, 0.7));
      }
      break;
    }
    case 'debris': {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(seed % 6);
      ctx.fillStyle = withAlpha(mix(theme.wall, '#000', 0.2), 0.9);
      poly(ctx, 0, 0, 13 * s, 5, 0.4);
      ctx.fill();
      ctx.strokeStyle = withAlpha(col, 0.28);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
      break;
    }
    case 'body': {
      // A citizen who did not make it. Quiet, not gory.
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = '#0a0a14';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 16 * s, 9 * s, seed % 3, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      const pulse = 0.1 + 0.1 * Math.sin(time * 1.1 + seed);
      glow(ctx, p.x, p.y, 22 * s, col, pulse);
      ctx.restore();
      break;
    }
  }
}

/** Small helper used by levels to place a light and its wet reflection. */
export function drawLightPool(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  alpha: number,
  wet: number,
): void {
  glow(ctx, x, y, r, color, alpha);
  if (wet > 0.1) {
    const g = ctx.createLinearGradient(x, y, x, y + r * 1.4);
    g.addColorStop(0, withAlpha(color, alpha * 0.5 * wet));
    g.addColorStop(1, withAlpha(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - r * 0.22, y, r * 0.44, r * 1.4);
  }
}
