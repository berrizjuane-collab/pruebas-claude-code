import { COLORS } from '../theme';
import type { Camera } from './camera';
import { niceGridStep, visibleWorldRect, worldToScreen } from './camera';

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
