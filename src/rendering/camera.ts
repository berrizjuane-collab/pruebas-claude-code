import type { Vec2 } from '../math/types';

/**
 * The camera maps world coordinates (math convention: y grows upward) to
 * screen coordinates in CSS pixels (y grows downward). It is intentionally
 * independent of the matrix being visualized: zooming/panning never changes
 * the math, only the viewport.
 */
export interface Camera {
  /** World point shown at the center of the canvas. */
  center: Vec2;
  /** Zoom level: how many CSS pixels one world unit spans. */
  pixelsPerUnit: number;
  /** Canvas size in CSS pixels. */
  width: number;
  height: number;
}

export const MIN_PPU = 6;
export const MAX_PPU = 4000;

export function createCamera(width: number, height: number): Camera {
  return { center: { x: 0, y: 0 }, pixelsPerUnit: 85, width, height };
}

export function worldToScreen(cam: Camera, p: Vec2): Vec2 {
  return {
    x: cam.width / 2 + (p.x - cam.center.x) * cam.pixelsPerUnit,
    y: cam.height / 2 - (p.y - cam.center.y) * cam.pixelsPerUnit,
  };
}

export function screenToWorld(cam: Camera, s: Vec2): Vec2 {
  return {
    x: cam.center.x + (s.x - cam.width / 2) / cam.pixelsPerUnit,
    y: cam.center.y - (s.y - cam.height / 2) / cam.pixelsPerUnit,
  };
}

/** Zoom by `factor` keeping the world point under `screenPoint` fixed. */
export function zoomAt(cam: Camera, screenPoint: Vec2, factor: number): void {
  const anchor = screenToWorld(cam, screenPoint);
  const ppu = Math.min(MAX_PPU, Math.max(MIN_PPU, cam.pixelsPerUnit * factor));
  cam.pixelsPerUnit = ppu;
  cam.center = {
    x: anchor.x - (screenPoint.x - cam.width / 2) / ppu,
    y: anchor.y + (screenPoint.y - cam.height / 2) / ppu,
  };
}

/** Pan by a screen-space delta in CSS pixels. */
export function panBy(cam: Camera, dxPx: number, dyPx: number): void {
  cam.center = {
    x: cam.center.x - dxPx / cam.pixelsPerUnit,
    y: cam.center.y + dyPx / cam.pixelsPerUnit,
  };
}

export interface WorldRect {
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
}

/** World-space rectangle currently visible, expanded by `marginPx`. */
export function visibleWorldRect(cam: Camera, marginPx = 0): WorldRect {
  const hw = (cam.width / 2 + marginPx) / cam.pixelsPerUnit;
  const hh = (cam.height / 2 + marginPx) / cam.pixelsPerUnit;
  return {
    xmin: cam.center.x - hw,
    xmax: cam.center.x + hw,
    ymin: cam.center.y - hh,
    ymax: cam.center.y + hh,
  };
}

/** Radius (world units) of the circle that covers the whole viewport. */
export function viewRadius(cam: Camera): number {
  return Math.hypot(cam.width, cam.height) / 2 / cam.pixelsPerUnit;
}

/**
 * Pick a grid step of the form {1, 2, 5}·10^k so consecutive lines are
 * roughly `targetPx` pixels apart — the usual "nice numbers" rule.
 */
export function niceGridStep(pixelsPerUnit: number, targetPx = 72): number {
  const raw = targetPx / pixelsPerUnit;
  const exp = Math.floor(Math.log10(raw));
  const base = raw / Math.pow(10, exp);
  const snapped = base < 1.5 ? 1 : base < 3.5 ? 2 : base < 7.5 ? 5 : 10;
  return snapped * Math.pow(10, exp);
}
