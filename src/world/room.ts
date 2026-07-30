/**
 * Runtime side of a room: builds the tile grid from the declarative RoomDef,
 * punches doorways, and keeps the per-room interactables.
 */

import { TAU, clamp, dist, rand } from '../core/util';
import { C, withAlpha, type ZoneTheme } from '../art/palette';
import { disc, glow, poly, ring, text } from '../core/render';
import { TILE, TileMap, drawProp, type Prop } from './tiles';
import type { DoorDef, ItemDef, RoomDef, Side, TileChar } from './levels';

export interface Door {
  def: DoorDef;
  /** Trigger rect in pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Where the player stands when arriving through this door. */
  spawnX: number;
  spawnY: number;
  side: Side;
  open: boolean;
}

export interface Item {
  def: ItemDef;
  x: number;
  y: number;
  taken: boolean;
  /** Nodes: activated by any player hit. */
  active: boolean;
  bob: number;
  /** Prompt visibility. */
  near: number;
}

export class Room {
  readonly def: RoomDef;
  readonly map: TileMap;
  readonly doors: Door[] = [];
  readonly items: Item[] = [];
  readonly props: Prop[] = [];
  spawned = false;
  cleared = false;
  bossDefeated = false;
  bossSpawned = false;
  bossIntroSeen = false;
  introShown = false;

  constructor(def: RoomDef) {
    this.def = def;
    const grid: TileChar[][] = [];
    for (let y = 0; y < def.rows; y++) {
      const row: TileChar[] = [];
      for (let x = 0; x < def.cols; x++) {
        const border = x === 0 || y === 0 || x === def.cols - 1 || y === def.rows - 1;
        row.push(border ? '#' : '.');
      }
      grid.push(row);
    }
    for (const [ch, ox, oy, ow, oh] of def.ops ?? []) {
      for (let y = oy; y < oy + oh; y++) {
        for (let x = ox; x < ox + ow; x++) {
          if (x <= 0 || y <= 0 || x >= def.cols - 1 || y >= def.rows - 1) continue;
          grid[y][x] = ch;
        }
      }
    }
    // Doorways are punched last so nothing can accidentally seal a room.
    for (const d of def.doors) {
      const size = d.size ?? 3;
      for (let i = 0; i < size; i++) {
        if (d.side === 'n') {
          grid[0][clamp(d.at + i, 1, def.cols - 2)] = '.';
          grid[1][clamp(d.at + i, 1, def.cols - 2)] = '.';
        } else if (d.side === 's') {
          grid[def.rows - 1][clamp(d.at + i, 1, def.cols - 2)] = '.';
          grid[def.rows - 2][clamp(d.at + i, 1, def.cols - 2)] = '.';
        } else if (d.side === 'w') {
          grid[clamp(d.at + i, 1, def.rows - 2)][0] = '.';
          grid[clamp(d.at + i, 1, def.rows - 2)][1] = '.';
        } else {
          grid[clamp(d.at + i, 1, def.rows - 2)][def.cols - 1] = '.';
          grid[clamp(d.at + i, 1, def.rows - 2)][def.cols - 2] = '.';
        }
      }
    }
    this.map = new TileMap(grid.map((r) => r.join('')));

    for (const d of def.doors) {
      const size = d.size ?? 3;
      let x = 0;
      let y = 0;
      let w = TILE;
      let h = TILE;
      let sx = 0;
      let sy = 0;
      if (d.side === 'n') {
        x = d.at * TILE;
        y = 0;
        w = size * TILE;
        h = TILE;
        sx = x + w / 2;
        sy = TILE * 2.2;
      } else if (d.side === 's') {
        x = d.at * TILE;
        y = (def.rows - 1) * TILE;
        w = size * TILE;
        h = TILE;
        sx = x + w / 2;
        sy = y - TILE * 1.2;
      } else if (d.side === 'w') {
        x = 0;
        y = d.at * TILE;
        w = TILE;
        h = size * TILE;
        sx = TILE * 2.2;
        sy = y + h / 2;
      } else {
        x = (def.cols - 1) * TILE;
        y = d.at * TILE;
        w = TILE;
        h = size * TILE;
        sx = x - TILE * 1.2;
        sy = y + h / 2;
      }
      this.doors.push({ def: d, x, y, w, h, spawnX: sx, spawnY: sy, side: d.side, open: true });
    }

    for (const it of def.items ?? []) {
      this.items.push({
        def: it,
        x: it.tx * TILE + TILE / 2,
        y: it.ty * TILE + TILE / 2,
        taken: false,
        active: false,
        bob: rand(0, TAU),
        near: 0,
      });
    }
    for (const p of def.props ?? []) {
      this.props.push({
        kind: p.kind,
        x: p.tx * TILE + TILE / 2,
        y: p.ty * TILE + TILE / 2,
        text: p.text,
        color: p.color,
        scale: p.scale,
        seed: p.tx * 13.7 + p.ty * 7.3,
      });
    }
  }

  get width(): number {
    return this.map.width;
  }
  get height(): number {
    return this.map.height;
  }

  /** Where the player appears when arriving from `fromRoomId`. */
  spawnPointFrom(fromRoomId: string | null): { x: number; y: number } {
    if (fromRoomId) {
      const back = this.doors.find((d) => d.def.to === fromRoomId);
      if (back) return { x: back.spawnX, y: back.spawnY };
    }
    if (this.def.entry) {
      return { x: this.def.entry[0] * TILE + TILE / 2, y: this.def.entry[1] * TILE + TILE / 2 };
    }
    // Fallback: first door's inside position, else room centre.
    if (this.doors.length) return { x: this.doors[0].spawnX, y: this.doors[0].spawnY };
    return { x: this.width / 2, y: this.height / 2 };
  }

  /** Side the player should face after arriving through the door that links back. */
  facingFrom(fromRoomId: string | null): number {
    const back = this.doors.find((d) => d.def.to === fromRoomId);
    if (!back) return 0;
    switch (back.side) {
      case 'n':
        return Math.PI / 2;
      case 's':
        return -Math.PI / 2;
      case 'w':
        return 0;
      default:
        return Math.PI;
    }
  }

  doorAt(x: number, y: number): Door | null {
    for (const d of this.doors) {
      if (x >= d.x && x <= d.x + d.w && y >= d.y && y <= d.y + d.h) return d;
    }
    return null;
  }

  nearestItem(x: number, y: number, maxDist = 46): Item | null {
    let best: Item | null = null;
    let bestD = maxDist;
    for (const it of this.items) {
      if (it.taken) continue;
      const d = dist(x, y, it.x, it.y);
      if (d < bestD) {
        bestD = d;
        best = it;
      }
    }
    return best;
  }

  /**
   * Sync door blockers with lock state so a locked door is physically solid.
   * While a boss is alive the whole arena seals — you cannot wander out of a
   * fight by accident, and the boss can never be left half-killed off-screen.
   */
  updateLocks(bossDefeated: boolean, enemiesLeft: number, nodesDone: boolean, sealed = false): void {
    this.map.blockers.length = 0;
    for (const d of this.doors) {
      let open = true;
      if (sealed) open = false;
      else if (d.def.lock === 'cleared') open = enemiesLeft === 0;
      else if (d.def.lock === 'boss') open = bossDefeated;
      else if (d.def.lock === 'nodes') open = nodesDone;
      d.open = open;
      if (!open) {
        // Push the blocker slightly inward so the barrier reads as a field.
        const inset = 4;
        this.map.blockers.push({
          x: d.x + (d.side === 'e' ? -inset : 0),
          y: d.y + (d.side === 's' ? -inset : 0),
          w: d.w + (d.side === 'e' || d.side === 'w' ? inset : 0),
          h: d.h + (d.side === 'n' || d.side === 's' ? inset : 0),
        });
      }
    }
  }

  drawProps(ctx: CanvasRenderingContext2D, theme: ZoneTheme, time: number): void {
    for (const p of this.props) drawProp(ctx, p, theme, time);
  }

  drawLights(ctx: CanvasRenderingContext2D, time: number): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const l of this.def.lights ?? []) {
      const x = l.tx * TILE + TILE / 2;
      const y = l.ty * TILE + TILE / 2;
      let a = (l.alpha ?? 0.25) * 0.72;
      if (l.flicker) {
        const f = Math.sin(time * l.flicker + x * 0.01);
        a *= f > -0.75 ? 1 : 0.25;
      }
      glow(ctx, x, y, l.r, l.color, a);
    }
    ctx.restore();
  }

  drawDoors(ctx: CanvasRenderingContext2D, theme: ZoneTheme, time: number): void {
    for (const d of this.doors) {
      const cx = d.x + d.w / 2;
      const cy = d.y + d.h / 2;
      const horiz = d.side === 'n' || d.side === 's';
      ctx.save();
      if (!d.open) {
        // Locked: red containment field with scrolling bands.
        ctx.globalCompositeOperation = 'lighter';
        const pulse = 0.55 + 0.25 * Math.sin(time * 4);
        ctx.fillStyle = withAlpha(C.danger, 0.16 * pulse);
        ctx.fillRect(d.x, d.y, d.w, d.h);
        ctx.strokeStyle = withAlpha(C.danger, 0.85 * pulse);
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        if (horiz) {
          ctx.moveTo(d.x, cy);
          ctx.lineTo(d.x + d.w, cy);
        } else {
          ctx.moveTo(cx, d.y);
          ctx.lineTo(cx, d.y + d.h);
        }
        ctx.stroke();
        for (let i = 0; i < 4; i++) {
          const t = ((time * 0.5 + i / 4) % 1);
          ctx.globalAlpha = 1 - t;
          ctx.strokeStyle = withAlpha(C.danger, 0.5);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          if (horiz) {
            const yy = d.y + t * d.h;
            ctx.moveTo(d.x, yy);
            ctx.lineTo(d.x + d.w, yy);
          } else {
            const xx = d.x + t * d.w;
            ctx.moveTo(xx, d.y);
            ctx.lineTo(xx, d.y + d.h);
          }
          ctx.stroke();
        }
      } else {
        // Open: a calm arrow-ish glow that reads as "this way out".
        ctx.globalCompositeOperation = 'lighter';
        const pulse = 0.5 + 0.5 * Math.sin(time * 2.4);
        glow(ctx, cx, cy, 54, theme.accent, 0.12 + pulse * 0.1);
        ctx.strokeStyle = withAlpha(theme.accent, 0.5 + pulse * 0.3);
        ctx.lineWidth = 2;
        for (let i = 0; i < 2; i++) {
          const off = i * 9 - 4;
          ctx.beginPath();
          if (d.side === 'e') {
            ctx.moveTo(cx - 6 + off, cy - 9);
            ctx.lineTo(cx + 2 + off, cy);
            ctx.lineTo(cx - 6 + off, cy + 9);
          } else if (d.side === 'w') {
            ctx.moveTo(cx + 6 - off, cy - 9);
            ctx.lineTo(cx - 2 - off, cy);
            ctx.lineTo(cx + 6 - off, cy + 9);
          } else if (d.side === 'n') {
            ctx.moveTo(cx - 9, cy + 6 - off);
            ctx.lineTo(cx, cy - 2 - off);
            ctx.lineTo(cx + 9, cy + 6 - off);
          } else {
            ctx.moveTo(cx - 9, cy - 6 + off);
            ctx.lineTo(cx, cy + 2 + off);
            ctx.lineTo(cx + 9, cy - 6 + off);
          }
          ctx.stroke();
        }
      }
      ctx.restore();
      if (d.def.label && d.open) {
        text(ctx, d.def.label, cx, d.y - 12, {
          size: 11,
          color: theme.accent,
          align: 'center',
          weight: '700',
          glowColor: theme.accent,
          glowBlur: 8,
          alpha: 0.85,
        });
      }
    }
  }

  drawItems(ctx: CanvasRenderingContext2D, time: number): void {
    for (const it of this.items) {
      if (it.taken) continue;
      const bob = Math.sin(time * 2 + it.bob) * 3;
      const y = it.y + bob;
      const kind = it.def.kind;
      ctx.save();
      switch (kind) {
        case 'checkpoint': {
          const on = it.active;
          const col = on ? C.heal : C.cyan;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          glow(ctx, it.x, it.y, 90, col, on ? 0.3 : 0.2);
          ctx.restore();
          ctx.fillStyle = '#0d1024';
          ctx.fillRect(it.x - 9, it.y - 26, 18, 34);
          ctx.strokeStyle = withAlpha(col, 0.9);
          ctx.lineWidth = 2;
          ctx.strokeRect(it.x - 9, it.y - 26, 18, 34);
          for (let i = 0; i < 3; i++) {
            ctx.fillStyle = withAlpha(col, 0.5 + 0.5 * Math.sin(time * 3 + i));
            ctx.fillRect(it.x - 5, it.y - 21 + i * 8, 10, 4);
          }
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ring(ctx, it.x, it.y + 8, 16 + Math.sin(time * 2) * 3, 1.5, col, 0.5);
          ctx.restore();
          break;
        }
        case 'weapon': {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          glow(ctx, it.x, y, 70, C.pickup, 0.35);
          ring(ctx, it.x, it.y + 12, 20, 2, C.pickup, 0.4);
          ctx.restore();
          ctx.save();
          ctx.translate(it.x, y - 6);
          ctx.rotate(Math.sin(time) * 0.15);
          ctx.strokeStyle = C.pickup;
          ctx.lineWidth = 3;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(-11, 11);
          ctx.lineTo(11, -11);
          ctx.stroke();
          ctx.restore();
          break;
        }
        case 'upgrade': {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          glow(ctx, it.x, y, 60, C.elite, 0.35);
          ctx.restore();
          ctx.save();
          ctx.translate(it.x, y - 4);
          ctx.rotate(time * 0.8);
          ctx.fillStyle = withAlpha(C.elite, 0.9);
          poly(ctx, 0, 0, 10, 6, 0);
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.4;
          ctx.stroke();
          ctx.restore();
          break;
        }
        case 'credits':
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          glow(ctx, it.x, y, 40, C.pickup, 0.4);
          ctx.restore();
          disc(ctx, it.x, y - 4, 6, withAlpha(C.pickup, 0.95));
          text(ctx, '¤', it.x, y - 4, {
            size: 11,
            color: '#241a00',
            align: 'center',
            baseline: 'middle',
            weight: '800',
          });
          break;
        case 'health':
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          glow(ctx, it.x, y, 44, C.heal, 0.4);
          ctx.restore();
          ctx.fillStyle = withAlpha(C.heal, 0.95);
          ctx.fillRect(it.x - 8, y - 3, 16, 6);
          ctx.fillRect(it.x - 3, y - 8, 6, 16);
          break;
        case 'healCharge':
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          glow(ctx, it.x, y, 50, C.heal, 0.4);
          ctx.restore();
          ctx.strokeStyle = withAlpha(C.heal, 0.95);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.roundRect?.(it.x - 6, y - 10, 12, 20, 5);
          if (!ctx.roundRect) ctx.rect(it.x - 6, y - 10, 12, 20);
          ctx.stroke();
          ctx.fillStyle = withAlpha(C.heal, 0.6);
          ctx.fillRect(it.x - 4, y - 2, 8, 10);
          break;
        case 'energy':
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          glow(ctx, it.x, y, 44, C.energy, 0.4);
          ctx.restore();
          ctx.fillStyle = withAlpha(C.energy, 0.95);
          ctx.beginPath();
          ctx.moveTo(it.x + 2, y - 10);
          ctx.lineTo(it.x - 6, y + 1);
          ctx.lineTo(it.x - 1, y + 1);
          ctx.lineTo(it.x - 3, y + 10);
          ctx.lineTo(it.x + 6, y - 2);
          ctx.lineTo(it.x + 1, y - 2);
          ctx.closePath();
          ctx.fill();
          break;
        case 'npc':
        case 'vendor': {
          const col = kind === 'vendor' ? C.pickup : C.ally;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          glow(ctx, it.x, it.y, 60, col, 0.22);
          ctx.restore();
          ctx.fillStyle = '#181228';
          ctx.beginPath();
          ctx.ellipse(it.x, it.y, 10, 13, 0, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = withAlpha(col, 0.9);
          ctx.lineWidth = 1.8;
          ctx.stroke();
          disc(ctx, it.x, it.y - 12, 6, '#1e1734');
          disc(ctx, it.x + 2, it.y - 12, 2, withAlpha(col, 0.9));
          break;
        }
        case 'node': {
          const col = it.active ? C.heal : C.cyan;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          glow(ctx, it.x, it.y, it.active ? 80 : 55, col, it.active ? 0.4 : 0.25);
          ring(ctx, it.x, it.y, 15 + Math.sin(time * 3) * 2, 2, col, 0.8);
          ctx.restore();
          ctx.fillStyle = '#0b1024';
          poly(ctx, it.x, it.y, 11, 6, time * (it.active ? 1.6 : 0.5));
          ctx.fill();
          ctx.strokeStyle = withAlpha(col, 0.95);
          ctx.lineWidth = 2;
          ctx.stroke();
          disc(ctx, it.x, it.y, 4, withAlpha(col, 0.95));
          break;
        }
        case 'lever': {
          const col = it.active ? C.heal : C.telegraph;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          glow(ctx, it.x, it.y, 55, col, 0.28);
          ctx.restore();
          ctx.fillStyle = '#141024';
          ctx.fillRect(it.x - 10, it.y - 6, 20, 16);
          ctx.strokeStyle = withAlpha(col, 0.9);
          ctx.lineWidth = 2;
          ctx.strokeRect(it.x - 10, it.y - 6, 20, 16);
          ctx.beginPath();
          ctx.moveTo(it.x, it.y + 2);
          ctx.lineTo(it.x + (it.active ? 8 : -8), it.y - 14);
          ctx.stroke();
          break;
        }
        case 'terminal': {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          glow(ctx, it.x, it.y, 50, C.cyan, 0.22);
          ctx.restore();
          ctx.fillStyle = '#0c1226';
          ctx.fillRect(it.x - 11, it.y - 14, 22, 22);
          ctx.strokeStyle = withAlpha(C.cyan, 0.85);
          ctx.lineWidth = 1.8;
          ctx.strokeRect(it.x - 11, it.y - 14, 22, 22);
          for (let i = 0; i < 3; i++) {
            ctx.fillStyle = withAlpha(C.cyan, 0.3 + 0.3 * Math.sin(time * 4 + i));
            ctx.fillRect(it.x - 7, it.y - 10 + i * 6, 14 - i * 3, 3);
          }
          break;
        }
      }
      ctx.restore();

      // Interaction prompt
      if (it.near > 0) {
        const a = clamp(it.near, 0, 1);
        text(ctx, promptFor(it), it.x, it.y - 34, {
          size: 12,
          color: C.white,
          align: 'center',
          weight: '700',
          glowColor: C.cyan,
          glowBlur: 10,
          alpha: a,
        });
      }
    }
  }
}

export function promptFor(it: Item): string {
  switch (it.def.kind) {
    case 'checkpoint':
      return it.active ? 'Anclaje activo' : '[E] Anclar';
    case 'weapon':
      return '[E] Recoger arma';
    case 'upgrade':
      return '[E] Instalar mejora';
    case 'npc':
      return '[E] Hablar';
    case 'vendor':
      return '[E] Comerciar';
    case 'lever':
      return it.active ? 'Válvula cerrada' : '[E] Accionar';
    case 'terminal':
      return '[E] Leer';
    case 'node':
      return it.active ? 'Nodo activo' : 'Golpea el nodo';
    default:
      return '[E] Recoger';
  }
}
