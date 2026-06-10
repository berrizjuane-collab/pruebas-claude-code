import { apply } from '../math/mat2';
import type { Mat2, Vec2 } from '../math/types';
import { COLORS } from '../theme';
import type { Camera } from './camera';
import { niceGridStep, visibleWorldRect, worldToScreen } from './camera';
import { drawArrow } from './drawShapes';
import type { Polyline } from './figures';

/*
 * Module B layers: everything here re-renders every frame while the user
 * scrubs t or drags a basis vector, so the budget per layer is kept small
 * (caps on point/arrow counts, fillRect instead of arcs for the dots).
 */

const MAX_POINTS = 3600;
const MAX_ARROWS = 420;

/**
 * A lattice of "material points of space", drawn at their transformed
 * positions M·p. Watching thousands of points slide at once is what makes
 * the deformation feel like a continuous medium rather than a grid diagram.
 */
export function drawPointField(ctx: CanvasRenderingContext2D, cam: Camera, m: Mat2): void {
  const rect = visibleWorldRect(cam, 40);
  let spacing = niceGridStep(cam.pixelsPerUnit) / 4;
  const countFor = (s: number) => ((rect.xmax - rect.xmin) / s + 1) * ((rect.ymax - rect.ymin) / s + 1);
  while (countFor(spacing) > MAX_POINTS) spacing *= 2;

  ctx.save();
  ctx.fillStyle = COLORS.pointField;
  const x0 = Math.ceil(rect.xmin / spacing);
  const x1 = Math.floor(rect.xmax / spacing);
  const y0 = Math.ceil(rect.ymin / spacing);
  const y1 = Math.floor(rect.ymax / spacing);
  for (let i = x0; i <= x1; i++) {
    for (let j = y0; j <= y1; j++) {
      const q = apply(m, { x: i * spacing, y: j * spacing });
      const s = worldToScreen(cam, q);
      if (s.x < -4 || s.x > cam.width + 4 || s.y < -4 || s.y > cam.height + 4) continue;
      // Fade the dots slightly with distance from the origin (purely cosmetic).
      ctx.globalAlpha = Math.max(0.25, 0.85 - 0.018 * Math.hypot(i * spacing, j * spacing));
      ctx.fillRect(s.x - 1.2, s.y - 1.2, 2.4, 2.4);
    }
  }
  ctx.restore();
}

/**
 * Displacement field: one arrow per sample point p, from p to its image M·p.
 * This is the "where does everything go?" picture.
 */
export function drawVectorField(ctx: CanvasRenderingContext2D, cam: Camera, m: Mat2): void {
  const rect = visibleWorldRect(cam, 20);
  let spacing = niceGridStep(cam.pixelsPerUnit);
  const countFor = (s: number) => ((rect.xmax - rect.xmin) / s + 1) * ((rect.ymax - rect.ymin) / s + 1);
  while (countFor(spacing) > MAX_ARROWS) spacing *= 2;

  const x0 = Math.ceil(rect.xmin / spacing);
  const x1 = Math.floor(rect.xmax / spacing);
  const y0 = Math.ceil(rect.ymin / spacing);
  const y1 = Math.floor(rect.ymax / spacing);
  for (let i = x0; i <= x1; i++) {
    for (let j = y0; j <= y1; j++) {
      const p = { x: i * spacing, y: j * spacing };
      const q = apply(m, p);
      const sp = worldToScreen(cam, p);
      const sq = worldToScreen(cam, q);
      if (Math.hypot(sq.x - sp.x, sq.y - sp.y) < 3) continue; // no visible displacement
      drawArrow(ctx, cam, p, q, { color: COLORS.vectorField, width: 1.2, headPx: 6, alpha: 0.65 });
    }
  }
}

/** Test figures: faint original outline + bright transformed image. */
export function drawFigures(ctx: CanvasRenderingContext2D, cam: Camera, m: Mat2, figures: Polyline[]): void {
  // Original, as a ghost for comparison.
  for (const poly of figures) {
    tracePolyline(ctx, cam, poly.points, poly.closed);
    ctx.strokeStyle = COLORS.figure;
    ctx.globalAlpha = 0.22;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  // Image under the current matrix.
  for (const poly of figures) {
    const mapped = poly.points.map((p) => apply(m, p));
    tracePolyline(ctx, cam, mapped, poly.closed);
    if (poly.fill) {
      ctx.fillStyle = COLORS.figure;
      ctx.globalAlpha = 0.13;
      ctx.fill();
    }
    ctx.strokeStyle = COLORS.figure;
    ctx.globalAlpha = 0.95;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function tracePolyline(ctx: CanvasRenderingContext2D, cam: Camera, points: Vec2[], closed: boolean): void {
  ctx.beginPath();
  const first = worldToScreen(cam, points[0]);
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < points.length; i++) {
    const s = worldToScreen(cam, points[i]);
    ctx.lineTo(s.x, s.y);
  }
  if (closed) ctx.closePath();
}
