import { columnI, columnJ } from '../math/mat2';
import type { Mat2, Vec2 } from '../math/types';
import { COLORS } from '../theme';
import type { Camera } from './camera';
import { worldToScreen } from './camera';

export interface ArrowStyle {
  color: string;
  width?: number;
  headPx?: number;
  alpha?: number;
  dash?: number[];
}

/** An arrow from `from` to `to` (world coords) with a screen-sized head. */
export function drawArrow(ctx: CanvasRenderingContext2D, cam: Camera, from: Vec2, to: Vec2, style: ArrowStyle): void {
  const a = worldToScreen(cam, from);
  const b = worldToScreen(cam, to);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);

  ctx.save();
  ctx.globalAlpha = style.alpha ?? 1;
  ctx.strokeStyle = style.color;
  ctx.fillStyle = style.color;
  ctx.lineWidth = style.width ?? 2.5;
  if (style.dash) ctx.setLineDash(style.dash);

  if (len < 1) {
    // Degenerate arrow (e.g. a basis vector dragged onto the origin): a dot.
    ctx.beginPath();
    ctx.arc(b.x, b.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  const head = Math.min(style.headPx ?? 11, len * 0.5);
  const ux = dx / len;
  const uy = dy / len;

  // Stop the shaft just short of the tip so it never pokes through the head.
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x - ux * head * 0.75, b.y - uy * head * 0.75);
  ctx.stroke();

  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(b.x - ux * head - uy * head * 0.45, b.y - uy * head + ux * head * 0.45);
  ctx.lineTo(b.x - ux * head + uy * head * 0.45, b.y - uy * head - ux * head * 0.45);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Text with a dark halo so it stays readable on top of grid lines. */
export function drawLabel(
  ctx: CanvasRenderingContext2D,
  screenPos: Vec2,
  text: string,
  color: string,
  opts: { font?: string; align?: CanvasTextAlign; alpha?: number } = {},
): void {
  ctx.save();
  ctx.globalAlpha = opts.alpha ?? 1;
  ctx.font = opts.font ?? 'bold 14px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = opts.align ?? 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = COLORS.bg;
  ctx.lineWidth = 4;
  ctx.strokeText(text, screenPos.x, screenPos.y);
  ctx.fillStyle = color;
  ctx.fillText(text, screenPos.x, screenPos.y);
  ctx.restore();
}

export interface BasisOptions {
  labels: boolean;
  handles: boolean;
  hover: 'i' | 'j' | null;
  dragging: 'i' | 'j' | null;
}

export const HANDLE_RADIUS_PX = 13;

/**
 * The two basis vectors (well — their images under the current matrix). The
 * tips carry drag handles: dragging them *is* editing the matrix columns.
 */
export function drawBasisVectors(ctx: CanvasRenderingContext2D, cam: Camera, m: Mat2, opts: BasisOptions): void {
  const tips: Array<{ which: 'i' | 'j'; tip: Vec2; color: string; label: string }> = [
    { which: 'i', tip: columnI(m), color: COLORS.iHat, label: 'î' },
    { which: 'j', tip: columnJ(m), color: COLORS.jHat, label: 'ĵ' },
  ];

  for (const { which, tip, color, label } of tips) {
    drawArrow(ctx, cam, { x: 0, y: 0 }, tip, { color, width: 3, headPx: 12 });

    const s = worldToScreen(cam, tip);
    if (opts.handles) {
      const active = opts.dragging === which || (opts.dragging === null && opts.hover === which);
      ctx.save();
      ctx.strokeStyle = color;
      ctx.globalAlpha = active ? 0.95 : 0.4;
      ctx.lineWidth = active ? 2 : 1.25;
      ctx.beginPath();
      ctx.arc(s.x, s.y, HANDLE_RADIUS_PX - 3, 0, Math.PI * 2);
      ctx.stroke();
      if (active) {
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = color;
        ctx.fill();
      }
      ctx.restore();
    }

    if (opts.labels) {
      // Offset the label outward along the arrow direction (or upward for a
      // degenerate vector) so it does not sit on the shaft.
      const o = worldToScreen(cam, { x: 0, y: 0 });
      const dx = s.x - o.x;
      const dy = s.y - o.y;
      const dlen = Math.hypot(dx, dy) || 1;
      const pos = { x: s.x + (dx / dlen) * 16, y: s.y + (dy / dlen) * 16 - (dlen < 2 ? 16 : 0) };
      drawLabel(ctx, pos, label, color, { font: 'bold 15px ui-sans-serif, system-ui, sans-serif' });
    }
  }
}
