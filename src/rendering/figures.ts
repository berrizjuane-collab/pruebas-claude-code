import type { Vec2 } from '../math/types';

/** A drawable path in world coordinates (pre-transformation). */
export interface Polyline {
  points: Vec2[];
  closed: boolean;
  fill?: boolean;
}

/**
 * Test figures for the deformation module. Linear maps send polygons to
 * polygons exactly (straight segments stay straight), so mapping the vertex
 * list *is* the exact image. The circle is a 96-gon: its image is then a
 * 96-gon inscribed in the true image ellipse — indistinguishable at pixel
 * scale, and it keeps the renderer uniform (everything is a polyline).
 */

export function squareFigure(): Polyline[] {
  return [
    {
      points: [
        { x: -1, y: -1 },
        { x: 1, y: -1 },
        { x: 1, y: 1 },
        { x: -1, y: 1 },
      ],
      closed: true,
      fill: true,
    },
  ];
}

export function circleFigure(): Polyline[] {
  const points: Vec2[] = [];
  const N = 96;
  for (let k = 0; k < N; k++) {
    const th = (k / N) * 2 * Math.PI;
    points.push({ x: Math.cos(th), y: Math.sin(th) });
  }
  return [{ points, closed: true, fill: true }];
}

/** Shortest signed angular distance a−b, wrapped to (−π, π]. */
function angDiff(a: number, b: number): number {
  const tau = 2 * Math.PI;
  return ((a - b + Math.PI) % tau + tau) % tau - Math.PI;
}

/** The obligatory 3b1b-style kitten: head with pointy ears, eyes, nose, whiskers. */
export function catFigure(): Polyline[] {
  const head: Vec2[] = [];
  const N = 144;
  // Ears as triangular radial bumps on a unit-circle head.
  const ear = (theta: number, center: number) => {
    const d = Math.abs(angDiff(theta, center));
    const halfWidth = 0.34;
    return d < halfWidth ? ((halfWidth - d) / halfWidth) * 0.58 : 0;
  };
  for (let k = 0; k < N; k++) {
    const th = (k / N) * 2 * Math.PI;
    const r = 1 + ear(th, Math.PI * 0.36) + ear(th, Math.PI * 0.64);
    head.push({ x: r * Math.cos(th), y: r * Math.sin(th) });
  }

  const eye = (cx: number): Polyline => {
    const pts: Vec2[] = [];
    for (let k = 0; k < 18; k++) {
      const th = (k / 18) * 2 * Math.PI;
      pts.push({ x: cx + 0.085 * Math.cos(th), y: 0.2 + 0.11 * Math.sin(th) });
    }
    return { points: pts, closed: true, fill: true };
  };

  const nose: Polyline = {
    points: [
      { x: -0.085, y: -0.05 },
      { x: 0.085, y: -0.05 },
      { x: 0, y: -0.19 },
    ],
    closed: true,
    fill: true,
  };

  const whisker = (x0: number, y0: number, x1: number, y1: number): Polyline => ({
    points: [
      { x: x0, y: y0 },
      { x: x1, y: y1 },
    ],
    closed: false,
  });

  return [
    { points: head, closed: true, fill: true },
    eye(-0.34),
    eye(0.34),
    nose,
    whisker(-0.16, -0.1, -0.62, 0.0),
    whisker(-0.16, -0.14, -0.64, -0.16),
    whisker(-0.16, -0.18, -0.6, -0.32),
    whisker(0.16, -0.1, 0.62, 0.0),
    whisker(0.16, -0.14, 0.64, -0.16),
    whisker(0.16, -0.18, 0.6, -0.32),
  ];
}
