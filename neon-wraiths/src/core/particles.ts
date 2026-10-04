/**
 * One flat pooled particle array for the whole game. Everything (sparks, smoke,
 * blood-of-machines, shockwaves, floating damage text) goes through here so the
 * cost stays bounded and draw order stays consistent.
 */

import { TAU, rand, randInt } from './util';
import { withAlpha } from '../art/palette';
import { disc, glow, line, poly, ring, text } from './render';

export type PKind = 'spark' | 'smoke' | 'shard' | 'ring' | 'flash' | 'text' | 'drip' | 'streak';

interface Particle {
  active: boolean;
  kind: PKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  size2: number;
  color: string;
  drag: number;
  gravity: number;
  rot: number;
  spin: number;
  str: string;
  additive: boolean;
}

const MAX = 900;

export class Particles {
  private pool: Particle[] = [];
  private cursor = 0;

  constructor() {
    for (let i = 0; i < MAX; i++) {
      this.pool.push({
        active: false,
        kind: 'spark',
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 1,
        size: 2,
        size2: 0,
        color: '#fff',
        drag: 3,
        gravity: 0,
        rot: 0,
        spin: 0,
        str: '',
        additive: true,
      });
    }
  }

  clear(): void {
    for (const p of this.pool) p.active = false;
  }

  private next(): Particle {
    // Ring buffer: oldest particle is recycled when we run out. Never allocates.
    for (let i = 0; i < MAX; i++) {
      const p = this.pool[(this.cursor + i) % MAX];
      if (!p.active) {
        this.cursor = (this.cursor + i + 1) % MAX;
        return p;
      }
    }
    const p = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % MAX;
    return p;
  }

  spawn(opts: Partial<Particle> & { x: number; y: number }): void {
    const p = this.next();
    p.active = true;
    p.kind = opts.kind ?? 'spark';
    p.x = opts.x;
    p.y = opts.y;
    p.vx = opts.vx ?? 0;
    p.vy = opts.vy ?? 0;
    p.maxLife = opts.maxLife ?? 0.5;
    p.life = p.maxLife;
    p.size = opts.size ?? 2;
    p.size2 = opts.size2 ?? 0;
    p.color = opts.color ?? '#ffffff';
    p.drag = opts.drag ?? 3;
    p.gravity = opts.gravity ?? 0;
    p.rot = opts.rot ?? 0;
    p.spin = opts.spin ?? 0;
    p.str = opts.str ?? '';
    p.additive = opts.additive ?? true;
  }

  burst(
    x: number,
    y: number,
    count: number,
    color: string,
    opts: { speed?: number; life?: number; size?: number; spread?: number; dir?: number; kind?: PKind } = {},
  ): void {
    const { speed = 200, life = 0.4, size = 2.4, spread = TAU, dir = 0, kind = 'spark' } = opts;
    for (let i = 0; i < count; i++) {
      const a = dir + rand(-spread / 2, spread / 2);
      const s = speed * rand(0.35, 1);
      this.spawn({
        kind,
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        maxLife: life * rand(0.6, 1.3),
        size: size * rand(0.6, 1.4),
        color,
        drag: 4.5,
      });
    }
  }

  hit(x: number, y: number, dir: number, color: string, power = 1): void {
    this.burst(x, y, Math.round(6 * power), color, {
      speed: 260 * power,
      life: 0.28,
      size: 2.6,
      spread: 1.5,
      dir,
    });
    this.spawn({ kind: 'flash', x, y, maxLife: 0.14, size: 22 * power, color });
  }

  shockwave(x: number, y: number, radius: number, color: string, life = 0.35, width = 3): void {
    this.spawn({ kind: 'ring', x, y, maxLife: life, size: 4, size2: radius, color, str: String(width) });
  }

  smoke(x: number, y: number, count: number, color: string, speed = 40, life = 1.1): void {
    for (let i = 0; i < count; i++) {
      const a = rand(0, TAU);
      this.spawn({
        kind: 'smoke',
        x: x + rand(-6, 6),
        y: y + rand(-6, 6),
        vx: Math.cos(a) * speed * rand(0.2, 1),
        vy: Math.sin(a) * speed * rand(0.2, 1) - 12,
        maxLife: life * rand(0.7, 1.3),
        size: rand(8, 18),
        color,
        drag: 1.2,
        additive: false,
      });
    }
  }

  debris(x: number, y: number, count: number, color: string, speed = 200): void {
    for (let i = 0; i < count; i++) {
      const a = rand(0, TAU);
      this.spawn({
        kind: 'shard',
        x,
        y,
        vx: Math.cos(a) * speed * rand(0.3, 1),
        vy: Math.sin(a) * speed * rand(0.3, 1),
        maxLife: rand(0.5, 1.1),
        size: rand(3, 7),
        color,
        drag: 2.2,
        rot: rand(0, TAU),
        spin: rand(-14, 14),
      });
    }
  }

  floatText(x: number, y: number, str: string, color: string, size = 15): void {
    this.spawn({
      kind: 'text',
      x,
      y,
      vx: rand(-14, 14),
      vy: -58,
      maxLife: 0.8,
      size,
      color,
      str,
      drag: 1.6,
      additive: false,
    });
  }

  streak(x: number, y: number, angle: number, len: number, color: string, life = 0.22): void {
    this.spawn({
      kind: 'streak',
      x,
      y,
      rot: angle,
      size: len,
      maxLife: life,
      color,
    });
  }

  rainSplash(x: number, y: number, color: string): void {
    for (let i = 0; i < randInt(2, 3); i++) {
      const a = rand(-Math.PI, 0);
      this.spawn({
        kind: 'spark',
        x,
        y,
        vx: Math.cos(a) * rand(20, 60),
        vy: Math.sin(a) * rand(20, 50),
        maxLife: 0.22,
        size: 1.3,
        color,
        drag: 3,
        gravity: 400,
      });
    }
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      const d = Math.exp(-p.drag * dt);
      p.vx *= d;
      p.vy *= d;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    for (const p of this.pool) {
      if (!p.active) continue;
      const t = p.life / p.maxLife;
      ctx.globalCompositeOperation = p.additive ? 'lighter' : 'source-over';
      switch (p.kind) {
        case 'spark':
          disc(ctx, p.x, p.y, p.size * t, withAlpha(p.color, Math.min(1, t * 1.4)));
          break;
        case 'drip':
          line(ctx, p.x, p.y, p.x - p.vx * 0.02, p.y - p.vy * 0.02, p.size, p.color, t);
          break;
        case 'streak': {
          const dx = Math.cos(p.rot) * p.size;
          const dy = Math.sin(p.rot) * p.size;
          line(ctx, p.x - dx / 2, p.y - dy / 2, p.x + dx / 2, p.y + dy / 2, 3 * t, p.color, t * 0.8);
          break;
        }
        case 'smoke':
          disc(ctx, p.x, p.y, p.size * (2 - t), withAlpha(p.color, t * 0.22));
          break;
        case 'shard':
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = withAlpha(p.color, t);
          poly(ctx, 0, 0, p.size * t, 3, 0);
          ctx.fill();
          ctx.restore();
          break;
        case 'ring': {
          const r = p.size + (p.size2 - p.size) * (1 - t);
          ring(ctx, p.x, p.y, r, Number(p.str || 3) * t, p.color, t * 0.9);
          break;
        }
        case 'flash':
          glow(ctx, p.x, p.y, p.size * (0.5 + (1 - t)), p.color, t * 0.85);
          break;
        case 'text':
          text(ctx, p.str, p.x, p.y, {
            size: p.size,
            color: withAlpha(p.color, Math.min(1, t * 2)),
            align: 'center',
            weight: '800',
            glowColor: p.color,
            glowBlur: 10,
          });
          break;
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }
}
