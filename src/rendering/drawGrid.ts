import { columnI, columnJ, length, scale } from '../math/mat2';
import type { Mat2, Vec2 } from '../math/types';
import { COLORS } from '../theme';
import type { Camera } from './camera';
import { niceGridStep, viewRadius, visibleWorldRect, worldToScreen } from './camera';
import { clipLineToRect } from './clip';

/** Format an axis tick label without floating point noise (0.30000004 → "0.3"). */
function tickLabel(value: number, step: number): string {
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 1);
  return Number(value.toFixed(decimals)).toString();
}

/**
 * The static reference grid: faint minor/major lines, brighter axes and small
 * coordinate labels. It never deforms — it is the "before" frame of reference
 * the transformed grid is compared against.
 */
export function drawBaseGrid(ctx: CanvasRenderingContext2D, cam: Camera, axisNumbers: boolean): void {
  const rect = visibleWorldRect(cam, 4);
  const step = niceGridStep(cam.pixelsPerUnit);

  // Minor grid (1/5 of the major step) only when it will not be too dense.
  const minorStep = step / 5;
  if (minorStep * cam.pixelsPerUnit >= 11) {
    drawLineFamily(ctx, cam, rect, minorStep, COLORS.gridBaseMinor, 1);
  }
  drawLineFamily(ctx, cam, rect, step, COLORS.gridBase, 1);

  // Axes.
  ctx.strokeStyle = COLORS.axis;
  ctx.lineWidth = 1.4;
  const o = worldToScreen(cam, { x: 0, y: 0 });
  ctx.beginPath();
  ctx.moveTo(0, o.y);
  ctx.lineTo(cam.width, o.y);
  ctx.moveTo(o.x, 0);
  ctx.lineTo(o.x, cam.height);
  ctx.stroke();

  if (axisNumbers) {
    drawAxisNumbers(ctx, cam, rect, step);
  }
}

function drawLineFamily(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  rect: { xmin: number; xmax: number; ymin: number; ymax: number },
  step: number,
  color: string,
  width: number,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  const kx0 = Math.ceil(rect.xmin / step);
  const kx1 = Math.floor(rect.xmax / step);
  for (let k = kx0; k <= kx1; k++) {
    const sx = worldToScreen(cam, { x: k * step, y: 0 }).x;
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, cam.height);
  }
  const ky0 = Math.ceil(rect.ymin / step);
  const ky1 = Math.floor(rect.ymax / step);
  for (let k = ky0; k <= ky1; k++) {
    const sy = worldToScreen(cam, { x: 0, y: k * step }).y;
    ctx.moveTo(0, sy);
    ctx.lineTo(cam.width, sy);
  }
  ctx.stroke();
}

/* ------------------------- transformed grid ------------------------- */

export interface TransformedGridOptions {
  /** Also draw 1/5-step minor lines (used by the deformation module). */
  minor: boolean;
}

/**
 * The image of the square grid under the matrix M. Linearity is what makes
 * this drawable exactly: the pre-image line x = k (all points (k, s)) maps to
 * { k·col1 + s·col2 }, i.e. a *straight* line through k·col1 with direction
 * col2 — so we draw genuine lines, never approximated polylines. Parallel,
 * evenly spaced lines stay parallel and evenly spaced; only the two
 * directions change. When M becomes singular both families collapse onto the
 * image line, which is exactly how "flattening the plane" should look.
 */
export function drawTransformedGrid(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  m: Mat2,
  opts: TransformedGridOptions,
): void {
  const step = niceGridStep(cam.pixelsPerUnit);
  const c1 = columnI(m);
  const c2 = columnJ(m);

  if (opts.minor && step * cam.pixelsPerUnit >= 55) {
    const minorStep = step / 5;
    drawTransformedFamily(ctx, cam, c1, c2, minorStep, COLORS.gridTransformedMinor, 1, false);
    drawTransformedFamily(ctx, cam, c2, c1, minorStep, COLORS.gridTransformedMinor, 1, false);
  }

  // Family of pre-image vertical lines x = k·step: points k·step·c1, direction c2.
  drawTransformedFamily(ctx, cam, c1, c2, step, COLORS.gridTransformed, 1.1, true);
  // Family of pre-image horizontal lines y = k·step: points k·step·c2, direction c1.
  drawTransformedFamily(ctx, cam, c2, c1, step, COLORS.gridTransformed, 1.1, true);
}

const MAX_LINES_PER_FAMILY = 220;

function drawTransformedFamily(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  anchorCol: Vec2, // line k passes through k·step·anchorCol
  dirCol: Vec2, // …and runs along this direction
  step: number,
  color: string,
  width: number,
  emphasizeAxis: boolean,
): void {
  const dirLen = length(dirCol);
  // Direction collapsed to zero: each "line" degenerates to a point. The other
  // family (or the kernel/image overlay) carries the visual information.
  if (dirLen < 1e-12) return;

  const rect = visibleWorldRect(cam, 8);
  const R = viewRadius(cam) + 8 / cam.pixelsPerUnit;

  // Signed distance of line k from the view center, measured along the unit
  // normal n̂ = perp(dir)/|dir|:  d(k) = k·u − v.
  const nx = -dirCol.y / dirLen;
  const ny = dirCol.x / dirLen;
  const u = step * (anchorCol.x * nx + anchorCol.y * ny); // spacing = |u| = step·|det|/|dir|
  const v = cam.center.x * nx + cam.center.y * ny;

  let k0: number;
  let k1: number;
  if (Math.abs(u) * MAX_LINES_PER_FAMILY < 2 * R) {
    // Near-singular: lines are (almost) on top of each other. Draw a capped
    // bundle around the line closest to the view center.
    const kc = Math.abs(u) < 1e-300 ? 0 : Math.round(v / u);
    k0 = kc - MAX_LINES_PER_FAMILY / 2;
    k1 = kc + MAX_LINES_PER_FAMILY / 2;
  } else {
    const lo = (v - R) / u;
    const hi = (v + R) / u;
    k0 = Math.ceil(Math.min(lo, hi));
    k1 = Math.floor(Math.max(lo, hi));
  }

  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  for (let k = k0; k <= k1; k++) {
    if (emphasizeAxis && k === 0) continue; // drawn separately below
    const seg = clipLineToRect(scale(anchorCol, k * step), dirCol, rect);
    if (!seg) continue;
    const p0 = worldToScreen(cam, seg[0]);
    const p1 = worldToScreen(cam, seg[1]);
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
  }
  ctx.stroke();

  if (emphasizeAxis && 0 >= k0 && 0 <= k1) {
    // The image of the axis itself: slightly stronger, so the transformed
    // frame stays readable inside the lattice.
    const seg = clipLineToRect({ x: 0, y: 0 }, dirCol, rect);
    if (seg) {
      ctx.lineWidth = width * 1.9;
      ctx.beginPath();
      const p0 = worldToScreen(cam, seg[0]);
      const p1 = worldToScreen(cam, seg[1]);
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }
  }

}

function drawAxisNumbers(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  rect: { xmin: number; xmax: number; ymin: number; ymax: number },
  step: number,
): void {
  ctx.fillStyle = COLORS.axisLabel;
  ctx.font = '11px ui-sans-serif, system-ui, sans-serif';

  const origin = worldToScreen(cam, { x: 0, y: 0 });
  // Keep labels visible even when the axis itself scrolls off-screen.
  const labelY = Math.min(Math.max(origin.y + 14, 14), cam.height - 6);
  const labelX = Math.min(Math.max(origin.x + 6, 6), cam.width - 30);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  for (let k = Math.ceil(rect.xmin / step); k <= Math.floor(rect.xmax / step); k++) {
    if (k === 0) continue;
    const sx = worldToScreen(cam, { x: k * step, y: 0 }).x;
    ctx.fillText(tickLabel(k * step, step), sx, labelY);
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (let k = Math.ceil(rect.ymin / step); k <= Math.floor(rect.ymax / step); k++) {
    if (k === 0) continue;
    const sy = worldToScreen(cam, { x: 0, y: k * step }).y;
    ctx.fillText(tickLabel(k * step, step), labelX, sy);
  }

  // Mark the origin: the one point every linear map keeps fixed.
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('0', origin.x + 5, origin.y + 14);
}
