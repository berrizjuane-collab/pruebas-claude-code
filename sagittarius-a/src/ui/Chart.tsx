/**
 * Gráfico de líneas compacto en Canvas 2D (series del motor físico; sin datos inventados).
 * Ejes con marcas «bonitas», escala logarítmica opcional y marcas verticales de eventos.
 */
import { useEffect, useRef } from 'react';

export interface Series {
  name: string;
  color: string;
  x: ArrayLike<number>;
  y: ArrayLike<number>;
  dashed?: boolean;
}

export interface ChartProps {
  series: Series[];
  xLabel: string;
  yLabel: string;
  logY?: boolean;
  equalAspect?: boolean;
  marks?: Array<{ x: number; label: string; color?: string }>;
  hLines?: Array<{ y: number; label: string; color?: string }>;
  height?: number;
  circles?: Array<{ r: number; color: string; label?: string }>;
}

function niceTicks(a: number, b: number, n = 4): number[] {
  if (!(b > a)) return [a];
  const span = b - a;
  const step0 = span / n;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(a / step) * step; v <= b + 1e-9 * span; v += step) out.push(Math.abs(v) < 1e-12 * span ? 0 : v);
  return out;
}

function fmtTick(v: number): string {
  const a = Math.abs(v);
  if (a !== 0 && (a < 1e-3 || a >= 1e5)) return v.toExponential(0).replace('e', 'e');
  return String(Number(v.toPrecision(4))).replace('.', ',');
}

export function Chart({ series, xLabel, yLabel, logY, equalAspect, marks, hLines, height = 132, circles }: ChartProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = c.clientWidth;
    const H = c.clientHeight;
    c.width = Math.floor(W * dpr);
    c.height = Math.floor(H * dpr);
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const tx = (v: number) => v;
    const ty = (v: number) => (logY ? Math.log10(Math.max(v, 1e-300)) : v);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const s of series)
      for (let i = 0; i < s.x.length; i++) {
        const x = tx(s.x[i]);
        const y = ty(s.y[i]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        if (logY && s.y[i] <= 0) continue;
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
    for (const h of hLines ?? []) {
      y0 = Math.min(y0, ty(h.y));
      y1 = Math.max(y1, ty(h.y));
    }
    g.font = '10px "JetBrains Mono", monospace';
    g.fillStyle = '#5c636c';
    if (!Number.isFinite(x0)) {
      g.fillText('sin datos todavía', 10, H / 2);
      return;
    }
    if (x1 === x0) x1 = x0 + 1;
    if (y1 === y0) {
      y1 = y0 + 1;
      y0 -= 1;
    }
    const padY = 0.06 * (y1 - y0);
    y0 -= padY;
    y1 += padY;
    const L = 44, R = 8, T = 8, B = 22;
    const pw = W - L - R;
    const ph = H - T - B;
    const ox = L;
    const oy = T;
    if (equalAspect) {
      const sx = pw / (x1 - x0);
      const sy = ph / (y1 - y0);
      const s = Math.min(sx, sy);
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      x0 = cx - pw / s / 2;
      x1 = cx + pw / s / 2;
      y0 = cy - ph / s / 2;
      y1 = cy + ph / s / 2;
    }
    const X = (v: number) => ox + ((v - x0) / (x1 - x0)) * pw;
    const Y = (v: number) => oy + ph - ((v - y0) / (y1 - y0)) * ph;
    g.strokeStyle = 'rgba(255,255,255,0.06)';
    g.lineWidth = 1;
    for (const t of niceTicks(x0, x1)) {
      g.beginPath();
      g.moveTo(X(t), oy);
      g.lineTo(X(t), oy + ph);
      g.stroke();
      g.fillText(fmtTick(t), X(t) - 10, H - 8);
    }
    for (const t of niceTicks(y0, y1)) {
      g.beginPath();
      g.moveTo(ox, Y(t));
      g.lineTo(ox + pw, Y(t));
      g.stroke();
      g.fillText(logY ? `1e${Math.round(t)}` : fmtTick(t), 2, Y(t) + 3);
    }
    for (const ci of circles ?? []) {
      g.strokeStyle = ci.color;
      g.setLineDash([3, 3]);
      g.beginPath();
      g.arc(X(0), Y(0), Math.abs(X(ci.r) - X(0)), 0, 2 * Math.PI);
      g.stroke();
      g.setLineDash([]);
    }
    for (const h of hLines ?? []) {
      g.strokeStyle = h.color ?? 'rgba(255,255,255,0.3)';
      g.setLineDash([4, 3]);
      g.beginPath();
      g.moveTo(ox, Y(ty(h.y)));
      g.lineTo(ox + pw, Y(ty(h.y)));
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = h.color ?? '#8b929b';
      g.fillText(h.label, ox + pw - g.measureText(h.label).width - 2, Y(ty(h.y)) - 3);
    }
    for (const s of series) {
      g.strokeStyle = s.color;
      g.lineWidth = 1.5;
      g.setLineDash(s.dashed ? [4, 3] : []);
      g.beginPath();
      let pen = false;
      for (let i = 0; i < s.x.length; i++) {
        const xv = tx(s.x[i]);
        const yv = ty(s.y[i]);
        if (!Number.isFinite(xv) || !Number.isFinite(yv) || (logY && s.y[i] <= 0)) {
          pen = false;
          continue;
        }
        if (!pen) g.moveTo(X(xv), Y(yv));
        else g.lineTo(X(xv), Y(yv));
        pen = true;
      }
      g.stroke();
      g.setLineDash([]);
    }
    for (const m of marks ?? []) {
      g.strokeStyle = m.color ?? 'rgba(240,122,106,0.7)';
      g.setLineDash([2, 3]);
      g.beginPath();
      g.moveTo(X(m.x), oy);
      g.lineTo(X(m.x), oy + ph);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = m.color ?? '#f07a6a';
      g.fillText(m.label, Math.min(X(m.x) + 3, ox + pw - 60), oy + 10);
    }
    g.fillStyle = '#8b929b';
    g.fillText(xLabel, ox + pw - g.measureText(xLabel).width, oy + ph - 4);
    g.save();
    g.fillText(yLabel, ox + 4, oy + 10);
    g.restore();
    // Leyenda
    let lx = ox + 4;
    const ly = oy + ph - 6;
    if (series.length > 1)
      for (const s of series) {
        g.fillStyle = s.color;
        g.fillRect(lx, ly - 4, 10, 2);
        g.fillStyle = '#b4bac2';
        g.fillText(s.name, lx + 13, ly);
        lx += 18 + g.measureText(s.name).width;
      }
  }, [series, xLabel, yLabel, logY, equalAspect, marks, hLines, height, circles]);
  return <canvas ref={ref} className="chart" style={{ height }} />;
}
