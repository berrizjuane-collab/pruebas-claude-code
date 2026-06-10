import type { Eigen2 } from '../math/eigen';
import type { RankInfo } from '../math/kernel';
import { apply, cross } from '../math/mat2';
import type { Mat2, Vec2 } from '../math/types';
import { COLORS } from '../theme';
import { fmt } from '../utils/format';
import type { Camera } from './camera';
import { visibleWorldRect, worldToScreen } from './camera';
import { clipLineToRect } from './clip';
import { drawArrow, drawLabel } from './drawShapes';

export interface EigenDisplay {
  /** Eigenstructure of the *target* matrix A (its lines are invariant under
   *  the whole linear animation path, not just at the endpoints). */
  eigen: Eigen2;
  rank: RankInfo;
}

/**
 * Invariant directions of the transformation:
 *
 *  - rank 2: the eigendirections as full lines through the origin (spans) —
 *    these lines do not change direction under the map — with a marker arrow
 *    riding at M(t)·v̂ so you can watch the stretch factor live;
 *  - rank 1: the kernel (pink, dashed — gets crushed to the origin) and the
 *    image (violet, solid — the line the whole plane lands on). Any nonzero
 *    eigendirection of a rank-1 matrix necessarily lies inside the image, so
 *    separate yellow lines would only overdraw it;
 *  - rank 0: nothing to draw — the panel explains that everything maps to 0;
 *  - complex eigenvalues: no real invariant lines exist (the panel explains).
 */
export function drawEigenStructure(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  displayed: Mat2,
  info: EigenDisplay,
  labels: boolean,
): void {
  if (info.rank.rank === 0) return;

  if (info.rank.rank === 1) {
    const { kernel, image } = info.rank;
    const sameLine = Math.abs(cross(kernel, image)) < 1e-9;

    drawSpanLine(ctx, cam, image, COLORS.image, null, labels ? (sameLine ? undefined : 'image (the plane lands here)') : undefined);
    drawSpanLine(ctx, cam, kernel, COLORS.kernel, [7, 5], labels ? (sameLine ? 'kernel = image' : 'kernel (sent to 0)') : undefined);

    // Watch the kernel direction collapse: its image shrinks to the origin.
    drawArrow(ctx, cam, { x: 0, y: 0 }, apply(displayed, kernel), {
      color: COLORS.kernel,
      width: 2.5,
      alpha: 0.95,
    });
    return;
  }

  const markers: Array<{ vector: Vec2; value: number; label: string }> = [];
  if (info.eigen.kind === 'realDistinct') {
    info.eigen.pairs.forEach((p, i) => {
      markers.push({ vector: p.vector, value: p.value, label: `λ${i === 0 ? '₁' : '₂'} = ${fmt(p.value)}` });
    });
  } else if (info.eigen.kind === 'repeatedDefective') {
    markers.push({
      vector: info.eigen.vector,
      value: info.eigen.value,
      label: `λ = ${fmt(info.eigen.value)} (double)`,
    });
  }
  // repeatedScalar / complex: no invariant lines to draw.

  for (const mk of markers) {
    drawSpanLine(ctx, cam, mk.vector, COLORS.eigen, [7, 5], labels ? mk.label : undefined);
    // The marker rides at M(t)·v̂ — on the linear path this stays on the line:
    // ((1−t)I + tA)·v = ((1−t) + t·λ)·v.
    drawArrow(ctx, cam, { x: 0, y: 0 }, apply(displayed, mk.vector), {
      color: COLORS.eigen,
      width: 2.5,
      alpha: 0.95,
      headPx: 10,
    });
  }
}

/** A full line through the origin along `dir`, clipped to the viewport. */
function drawSpanLine(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  dir: Vec2,
  color: string,
  dash: number[] | null,
  label?: string,
): void {
  const seg = clipLineToRect({ x: 0, y: 0 }, dir, visibleWorldRect(cam, 8));
  if (!seg) return;

  const p0 = worldToScreen(cam, seg[0]);
  const p1 = worldToScreen(cam, seg[1]);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.globalAlpha = 0.85;
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  ctx.lineTo(p1.x, p1.y);
  ctx.stroke();
  ctx.restore();

  if (label) {
    // Tuck the label just inside the viewport at the +dir end of the line.
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const pos = { x: p1.x - ux * 52 - uy * 12, y: p1.y - uy * 52 + ux * 12 };
    drawLabel(ctx, pos, label, color, { font: '12px ui-sans-serif, system-ui, sans-serif' });
  }
}
