/**
 * Rendering plumbing: a fixed 960x540 logical scene buffer, a cheap full-screen
 * bloom pass, and the neon drawing primitives every entity is built from.
 */

import { TAU, clamp } from './util';
import { withAlpha } from '../art/palette';

export const VIEW_W = 960;
export const VIEW_H = 540;

export class Renderer {
  /** Visible canvas (what the user sees, scaled to fit). */
  readonly display: HTMLCanvasElement;
  readonly dctx: CanvasRenderingContext2D;
  /** Logical scene buffer, always 960x540. */
  readonly scene: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  private bloomBuf: HTMLCanvasElement;
  private bctx: CanvasRenderingContext2D;

  bloomEnabled = true;
  private bloomSupported = true;
  scale = 1;

  constructor(display: HTMLCanvasElement) {
    this.display = display;
    this.dctx = display.getContext('2d', { alpha: false })!;
    this.scene = document.createElement('canvas');
    this.scene.width = VIEW_W;
    this.scene.height = VIEW_H;
    this.ctx = this.scene.getContext('2d', { alpha: false })!;
    this.bloomBuf = document.createElement('canvas');
    this.bloomBuf.width = VIEW_W >> 1;
    this.bloomBuf.height = VIEW_H >> 1;
    this.bctx = this.bloomBuf.getContext('2d', { alpha: true })!;
    // `filter` is required for the bloom pass; fall back gracefully if missing.
    this.bloomSupported = typeof this.bctx.filter === 'string';
  }

  /** Resize the visible canvas to fill its container while keeping 16:9. */
  resize(): void {
    const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
    const parent = this.display.parentElement;
    const availW = parent ? parent.clientWidth : window.innerWidth;
    const availH = parent ? parent.clientHeight : window.innerHeight;
    const scale = Math.min(availW / VIEW_W, availH / VIEW_H);
    this.scale = scale;
    const cssW = Math.floor(VIEW_W * scale);
    const cssH = Math.floor(VIEW_H * scale);
    this.display.style.width = cssW + 'px';
    this.display.style.height = cssH + 'px';
    const pxW = Math.floor(cssW * dpr);
    const pxH = Math.floor(cssH * dpr);
    if (this.display.width !== pxW || this.display.height !== pxH) {
      this.display.width = pxW;
      this.display.height = pxH;
    }
  }

  /** Composite the scene buffer onto the visible canvas, with bloom. */
  present(): void {
    const d = this.dctx;
    const w = this.display.width;
    const h = this.display.height;
    d.setTransform(1, 0, 0, 1, 0, 0);
    d.globalCompositeOperation = 'source-over';
    d.globalAlpha = 1;
    d.imageSmoothingEnabled = true;
    d.drawImage(this.scene, 0, 0, w, h);

    if (this.bloomEnabled && this.bloomSupported) {
      const b = this.bctx;
      b.setTransform(1, 0, 0, 1, 0, 0);
      b.globalCompositeOperation = 'source-over';
      b.globalAlpha = 1;
      b.clearRect(0, 0, this.bloomBuf.width, this.bloomBuf.height);
      // High contrast *before* the blur acts as a brightness threshold: dark
      // architecture stays dark and only the neon actually blooms. Without it
      // the whole frame lifts and the scene turns into a flat colour wash.
      b.filter = 'contrast(3.2) brightness(1.1) blur(4px)';
      b.drawImage(this.scene, 0, 0, this.bloomBuf.width, this.bloomBuf.height);
      b.filter = 'none';
      d.globalCompositeOperation = 'lighter';
      d.globalAlpha = 0.5;
      d.drawImage(this.bloomBuf, 0, 0, w, h);
      d.globalCompositeOperation = 'source-over';
      d.globalAlpha = 1;
    }
  }
}

type Ctx = CanvasRenderingContext2D;

/** Filled circle. */
export function disc(ctx: Ctx, x: number, y: number, r: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

/**
 * Radial falloff — the workhorse for every light, glow and blast.
 *
 * This runs 50-150 times a frame, and building a fresh CanvasGradient each time
 * was the single most expensive thing the renderer did. Instead we bake one
 * 128px sprite per colour and blit it scaled; the palette only has ~25 colours,
 * so the cache is tiny and the cost drops to a plain drawImage.
 */
const GLOW_SIZE = 128;
const glowCache = new Map<string, HTMLCanvasElement>();

function glowSprite(color: string): HTMLCanvasElement {
  const hit = glowCache.get(color);
  if (hit) return hit;
  const cv = document.createElement('canvas');
  cv.width = GLOW_SIZE;
  cv.height = GLOW_SIZE;
  const c = cv.getContext('2d')!;
  const h = GLOW_SIZE / 2;
  const g = c.createRadialGradient(h, h, 0, h, h, h);
  g.addColorStop(0, withAlpha(color, 1));
  g.addColorStop(0.45, withAlpha(color, 0.35));
  g.addColorStop(1, withAlpha(color, 0));
  c.fillStyle = g;
  c.fillRect(0, 0, GLOW_SIZE, GLOW_SIZE);
  glowCache.set(color, cv);
  return cv;
}

export function glow(
  ctx: Ctx,
  x: number,
  y: number,
  r: number,
  color: string,
  alpha = 0.6,
): void {
  if (r <= 0 || alpha <= 0.002) return;
  const sprite = glowSprite(color);
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * Math.min(1, alpha);
  ctx.drawImage(sprite, x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = prev;
}

export function ring(
  ctx: Ctx,
  x: number,
  y: number,
  r: number,
  width: number,
  color: string,
  alpha = 1,
): void {
  ctx.strokeStyle = withAlpha(color, alpha);
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.arc(x, y, Math.max(r, 0.5), 0, TAU);
  ctx.stroke();
}

export function line(
  ctx: Ctx,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number,
  color: string,
  alpha = 1,
): void {
  ctx.strokeStyle = withAlpha(color, alpha);
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

export function roundRect(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function fillRoundRect(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  color: string,
): void {
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = color;
  ctx.fill();
}

export function strokeRoundRect(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  color: string,
  width = 2,
): void {
  roundRect(ctx, x, y, w, h, r);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

/** Regular polygon, optionally rotated. Used for drones, shards and hazard markers. */
export function poly(
  ctx: Ctx,
  x: number,
  y: number,
  r: number,
  sides: number,
  rot: number,
): void {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * TAU;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/** Arc wedge used for melee swings and cone telegraphs. */
export function wedge(
  ctx: Ctx,
  x: number,
  y: number,
  r: number,
  facing: number,
  half: number,
  inner = 0,
): void {
  ctx.beginPath();
  ctx.arc(x, y, r, facing - half, facing + half);
  if (inner > 0) ctx.arc(x, y, inner, facing + half, facing - half, true);
  else ctx.lineTo(x, y);
  ctx.closePath();
}

let fontsReady = false;
export function ensureFonts(): void {
  if (fontsReady) return;
  fontsReady = true;
}

export const FONT_DISPLAY =
  '"Bahnschrift", "DIN Alternate", "Eurostile", "Segoe UI", system-ui, sans-serif';
export const FONT_UI = '"Segoe UI", "Helvetica Neue", system-ui, sans-serif';
export const FONT_MONO = '"JetBrains Mono", "Consolas", "SF Mono", ui-monospace, monospace';

export function text(
  ctx: Ctx,
  str: string,
  x: number,
  y: number,
  opts: {
    size?: number;
    color?: string;
    align?: CanvasTextAlign;
    baseline?: CanvasTextBaseline;
    font?: string;
    weight?: string;
    letterSpacing?: number;
    glowColor?: string;
    glowBlur?: number;
    alpha?: number;
  } = {},
): void {
  const {
    size = 16,
    color = '#f2f6ff',
    align = 'left',
    baseline = 'alphabetic',
    font = FONT_UI,
    weight = '600',
    glowColor,
    glowBlur = 12,
    alpha = 1,
  } = opts;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  if (glowColor) {
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = glowBlur;
  }
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
  ctx.restore();
}

export function measure(ctx: Ctx, str: string, size: number, font = FONT_UI, weight = '600'): number {
  ctx.save();
  ctx.font = `${weight} ${size}px ${font}`;
  const w = ctx.measureText(str).width;
  ctx.restore();
  return w;
}

/** Word-wrap helper returning laid-out lines. */
export function wrapText(
  ctx: Ctx,
  str: string,
  maxWidth: number,
  size: number,
  font = FONT_UI,
  weight = '500',
): string[] {
  ctx.save();
  ctx.font = `${weight} ${size}px ${font}`;
  const words = str.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  ctx.restore();
  return lines;
}
