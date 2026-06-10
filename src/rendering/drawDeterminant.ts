import { add, apply, columnI, columnJ, det } from '../math/mat2';
import type { Mat2, Vec2 } from '../math/types';
import { COLORS } from '../theme';
import { fmt } from '../utils/format';
import type { Camera } from './camera';
import { worldToScreen } from './camera';
import { drawLabel } from './drawShapes';

/**
 * The determinant made visible: the unit square (dashed outline) and its
 * image, the parallelogram spanned by the matrix columns. Its area *is*
 * |det|, and a negative determinant — the square has been flipped over, so
 * its corners now run clockwise — is shown with a different color + hatching.
 */
export function drawDeterminant(ctx: CanvasRenderingContext2D, cam: Camera, m: Mat2, labels: boolean): void {
  const c1 = columnI(m);
  const c2 = columnJ(m);
  const corners: Vec2[] = [{ x: 0, y: 0 }, c1, add(c1, c2), c2];
  const screenPts = corners.map((p) => worldToScreen(cam, p));
  const d = det(m);
  const negative = d < 0;

  // Original unit square, for comparison.
  ctx.save();
  ctx.strokeStyle = COLORS.detPositiveEdge;
  ctx.globalAlpha = 0.45;
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1;
  strokePolygon(ctx, [
    worldToScreen(cam, { x: 0, y: 0 }),
    worldToScreen(cam, { x: 1, y: 0 }),
    worldToScreen(cam, { x: 1, y: 1 }),
    worldToScreen(cam, { x: 0, y: 1 }),
  ]);
  ctx.restore();

  // Image parallelogram.
  ctx.save();
  ctx.fillStyle = negative ? COLORS.detNegative : COLORS.detPositive;
  ctx.beginPath();
  polygonPath(ctx, screenPts);
  ctx.fill();

  if (negative) hatchPolygon(ctx, screenPts, COLORS.detNegativeEdge);

  ctx.strokeStyle = negative ? COLORS.detNegativeEdge : COLORS.detPositiveEdge;
  ctx.lineWidth = 1.6;
  ctx.globalAlpha = 0.9;
  strokePolygon(ctx, screenPts);
  ctx.restore();

  if (labels) {
    // Label at the centroid, but only when the parallelogram is big enough
    // on screen for the text to fit (the panel always shows the number).
    const screenArea = Math.abs(d) * cam.pixelsPerUnit * cam.pixelsPerUnit;
    if (screenArea > 2600) {
      const centroid = worldToScreen(cam, apply(m, { x: 0.5, y: 0.5 }));
      const edge = negative ? COLORS.detNegativeEdge : COLORS.detPositiveEdge;
      drawLabel(ctx, centroid, `area ×${fmt(Math.abs(d))}`, edge);
      if (negative) {
        drawLabel(ctx, { x: centroid.x, y: centroid.y + 16 }, 'orientation flipped', edge, {
          font: '11px ui-sans-serif, system-ui, sans-serif',
          alpha: 0.9,
        });
      }
    }
  }
}

function polygonPath(ctx: CanvasRenderingContext2D, pts: Vec2[]): void {
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
}

function strokePolygon(ctx: CanvasRenderingContext2D, pts: Vec2[]): void {
  ctx.beginPath();
  polygonPath(ctx, pts);
  ctx.stroke();
}

/** Diagonal hatching clipped to the polygon — the "this side is the back" cue. */
function hatchPolygon(ctx: CanvasRenderingContext2D, pts: Vec2[], color: string): void {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const xmin = Math.min(...xs);
  const xmax = Math.max(...xs);
  const ymin = Math.min(...ys);
  const ymax = Math.max(...ys);
  const h = ymax - ymin;
  if (h <= 0 || xmax - xmin <= 0) return;

  ctx.save();
  ctx.beginPath();
  polygonPath(ctx, pts);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.3;
  ctx.lineWidth = 1;
  ctx.beginPath();
  const spacing = 8;
  for (let x = xmin - h; x <= xmax; x += spacing) {
    ctx.moveTo(x, ymin);
    ctx.lineTo(x + h, ymax);
  }
  ctx.stroke();
  ctx.restore();
}
