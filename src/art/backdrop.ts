/**
 * Everything that sells "you are inside a living city": parallax skyline behind
 * the room, rain, drifting motes, fog, vignette and the controlled glitch pass.
 * All of it is drawn around the room, never on top of gameplay-critical shapes.
 */

import { TAU, clamp, rand } from '../core/util';
import { VIEW_H, VIEW_W, disc, line } from '../core/render';
import { withAlpha, type ZoneTheme } from './palette';
import type { Camera } from '../core/camera';

interface Drop {
  x: number;
  y: number;
  len: number;
  speed: number;
  a: number;
}

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  a: number;
  phase: number;
}

interface Tower {
  x: number;
  w: number;
  h: number;
  depth: number;
  hue: number;
  lights: number;
}

export class Backdrop {
  private drops: Drop[] = [];
  private motes: Mote[] = [];
  private towers: Tower[] = [];
  private traffic: { x: number; y: number; v: number; depth: number; c: string }[] = [];
  private time = 0;
  private lastZone = '';

  constructor() {
    for (let i = 0; i < 260; i++) {
      this.drops.push({
        x: rand(-100, VIEW_W + 100),
        y: rand(0, VIEW_H),
        len: rand(9, 26),
        speed: rand(700, 1250),
        a: rand(0.1, 0.4),
      });
    }
    for (let i = 0; i < 90; i++) {
      this.motes.push({
        x: rand(0, VIEW_W),
        y: rand(0, VIEW_H),
        vx: rand(-14, 14),
        vy: rand(-20, 6),
        r: rand(0.7, 2.4),
        a: rand(0.15, 0.55),
        phase: rand(0, TAU),
      });
    }
  }

  private buildSkyline(theme: ZoneTheme): void {
    this.towers.length = 0;
    this.traffic.length = 0;
    let x = -200;
    while (x < VIEW_W + 300) {
      const depth = rand(0.05, 0.3);
      const w = rand(40, 120);
      this.towers.push({
        x,
        w,
        h: rand(90, 340) * (1 - depth),
        depth,
        hue: rand(0, 1),
        lights: Math.floor(rand(4, 18)),
      });
      x += w + rand(10, 60);
    }
    this.towers.sort((a, b) => a.depth - b.depth);
    for (let i = 0; i < 8; i++) {
      this.traffic.push({
        x: rand(-200, VIEW_W + 200),
        y: rand(20, 200),
        v: rand(20, 70) * (rand(0, 1) > 0.5 ? 1 : -1),
        depth: rand(0.08, 0.2),
        c: rand(0, 1) > 0.5 ? theme.accent : theme.accent2,
      });
    }
  }

  update(dt: number, theme: ZoneTheme): void {
    this.time += dt;
    if (theme.id !== this.lastZone) {
      this.lastZone = theme.id;
      this.buildSkyline(theme);
    }
    const wind = Math.sin(this.time * 0.3) * 90;
    for (const d of this.drops) {
      d.y += d.speed * dt;
      d.x += wind * dt;
      if (d.y > VIEW_H + 30) {
        d.y = -30;
        d.x = rand(-100, VIEW_W + 100);
      }
      if (d.x > VIEW_W + 120) d.x -= VIEW_W + 240;
      if (d.x < -120) d.x += VIEW_W + 240;
    }
    for (const m of this.motes) {
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.phase += dt * 2;
      if (m.y < -10) m.y = VIEW_H + 10;
      if (m.y > VIEW_H + 10) m.y = -10;
      if (m.x < -10) m.x = VIEW_W + 10;
      if (m.x > VIEW_W + 10) m.x = -10;
    }
    for (const t of this.traffic) {
      t.x += t.v * dt;
      if (t.x > VIEW_W + 220) t.x = -220;
      if (t.x < -220) t.x = VIEW_W + 220;
    }
  }

  /** Sky + distant city, drawn before the room in screen space. */
  drawSky(ctx: CanvasRenderingContext2D, theme: ZoneTheme, cam: Camera): void {
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, theme.sky[0]);
    g.addColorStop(1, theme.sky[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    ctx.save();
    for (const t of this.towers) {
      const px = t.x - cam.x * t.depth * 0.5;
      const wrapped = ((px % (VIEW_W + 400)) + VIEW_W + 400) % (VIEW_W + 400) - 200;
      const baseY = VIEW_H * 0.62 + t.depth * 260 - cam.y * t.depth * 0.12;
      ctx.fillStyle = withAlpha('#000000', 0.35 + t.depth);
      ctx.fillRect(wrapped, baseY - t.h, t.w, t.h + VIEW_H);
      ctx.fillStyle = withAlpha(t.hue > 0.5 ? theme.accent : theme.accent2, 0.05 + t.depth * 0.05);
      ctx.fillRect(wrapped, baseY - t.h, t.w, 3);
      // Window lights
      for (let i = 0; i < t.lights; i++) {
        const lx = wrapped + 6 + ((i * 37) % Math.max(1, t.w - 12));
        const ly = baseY - t.h + 10 + ((i * 53) % Math.max(1, t.h - 20));
        const flick = Math.sin(this.time * 0.7 + i * 2.3 + t.x) > -0.4 ? 1 : 0.15;
        ctx.fillStyle = withAlpha(i % 3 === 0 ? theme.accent : theme.accent2, 0.22 * flick);
        ctx.fillRect(lx, ly, 3, 4);
      }
    }
    // Distant air traffic
    for (const t of this.traffic) {
      const px = t.x - cam.x * t.depth * 0.5;
      const py = t.y - cam.y * t.depth * 0.1;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      line(ctx, px, py, px - Math.sign(t.v) * 22, py, 1.4, t.c, 0.32);
      disc(ctx, px, py, 1.6, withAlpha(t.c, 0.6));
      ctx.restore();
    }
    ctx.restore();
  }

  /** Foreground weather, drawn after the room in screen space. */
  drawWeather(ctx: CanvasRenderingContext2D, theme: ZoneTheme): void {
    if (theme.rain > 0.02) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = withAlpha(theme.id === 'acid' ? theme.accent : '#9fd8ff', 0.5);
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      const n = Math.floor(this.drops.length * theme.rain);
      for (let i = 0; i < n; i++) {
        const d = this.drops[i];
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - 3, d.y + d.len);
      }
      ctx.stroke();
      ctx.restore();
    }
    if (theme.motes > 0.02) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const n = Math.floor(this.motes.length * theme.motes);
      for (let i = 0; i < n; i++) {
        const m = this.motes[i];
        disc(ctx, m.x, m.y, m.r, withAlpha(theme.moteColor, m.a * (0.5 + 0.5 * Math.sin(m.phase))));
      }
      ctx.restore();
    }
    // Zone fog wash
    ctx.fillStyle = theme.fog;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  /**
   * Vignette + subtle scanlines, always last before the HUD. Both are static,
   * so they are baked once into a single sprite instead of rebuilding a
   * gradient and 180 fillRects on every frame.
   */
  private gradeLayer: HTMLCanvasElement | null = null;

  private buildGrade(): HTMLCanvasElement {
    const cv = document.createElement('canvas');
    cv.width = VIEW_W;
    cv.height = VIEW_H;
    const c = cv.getContext('2d')!;
    const g = c.createRadialGradient(
      VIEW_W / 2,
      VIEW_H / 2,
      VIEW_H * 0.35,
      VIEW_W / 2,
      VIEW_H / 2,
      VIEW_H * 0.95,
    );
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.55)');
    c.fillStyle = g;
    c.fillRect(0, 0, VIEW_W, VIEW_H);
    c.globalAlpha = 0.05;
    c.fillStyle = '#000000';
    for (let y = 0; y < VIEW_H; y += 3) c.fillRect(0, y, VIEW_W, 1);
    return cv;
  }

  drawGrade(ctx: CanvasRenderingContext2D, intensity = 1): void {
    if (!this.gradeLayer) this.gradeLayer = this.buildGrade();
    const prev = ctx.globalAlpha;
    ctx.globalAlpha = prev * intensity;
    ctx.drawImage(this.gradeLayer, 0, 0);
    ctx.globalAlpha = prev;
  }
}

/**
 * Controlled glitch: RGB-split slices of the already-rendered frame. Never
 * displaces more than a few pixels so the player can always read the action.
 */
export function drawGlitch(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  amount: number,
): void {
  const a = clamp(amount, 0, 1);
  if (a <= 0.001) return;
  const slices = Math.floor(2 + a * 7);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.35 * a;
  ctx.drawImage(source, rand(-4, 4) * a, 0);
  ctx.globalAlpha = 0.22 * a;
  ctx.drawImage(source, -rand(2, 6) * a, rand(-2, 2) * a);
  ctx.restore();
  ctx.save();
  for (let i = 0; i < slices; i++) {
    const sy = rand(0, VIEW_H);
    const sh = rand(4, 22);
    const dx = rand(-14, 14) * a;
    ctx.drawImage(source, 0, sy, VIEW_W, sh, dx, sy, VIEW_W, sh);
  }
  ctx.globalAlpha = 0.08 * a;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, rand(0, VIEW_H), VIEW_W, 2);
  ctx.restore();
}
