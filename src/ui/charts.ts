/**
 * Small, dependency-free canvas charts. Each chart owns a canvas, resizes to its
 * container with devicePixelRatio, and exposes a draw method the UI calls at a
 * throttled rate (charts do NOT need to update every render frame).
 */

export class Chart {
  readonly canvas: HTMLCanvasElement;
  protected ctx: CanvasRenderingContext2D;
  protected w = 300;
  protected hgt = 120;

  constructor(className = 'chart') {
    this.canvas = document.createElement('canvas');
    this.canvas.className = className;
    this.ctx = this.canvas.getContext('2d')!;
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.w = Math.max(80, rect.width);
    this.hgt = Math.max(60, rect.height);
    this.canvas.width = this.w * dpr;
    this.canvas.height = this.hgt * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /**
   * Re-measure if the CSS size changed since the last draw. Charts built inside a
   * hidden tab start at zero size; this picks up the real size once shown.
   */
  protected syncSize(): void {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width > 0 && Math.abs(rect.width - this.w) > 1) this.resize();
    else if (this.canvas.width === 0) this.resize();
  }

  protected clear(): void {
    this.ctx.clearRect(0, 0, this.w, this.hgt);
  }
}

/** Light curve: intensity vs. rotation phase, with a moving phase marker. */
export class LightCurveChart extends Chart {
  draw(samples: number[], phase: number): void {
    this.syncSize();
    const { ctx, w, hgt } = this;
    this.clear();
    const pad = 6;
    const plotW = w - pad * 2;
    const plotH = hgt - pad * 2;

    // Baseline grid.
    ctx.strokeStyle = 'rgba(120,170,230,0.12)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad + (plotH * i) / 4;
      ctx.beginPath();
      ctx.moveTo(pad, y);
      ctx.lineTo(w - pad, y);
      ctx.stroke();
    }

    // Curve.
    ctx.beginPath();
    for (let i = 0; i < samples.length; i++) {
      const x = pad + (i / (samples.length - 1)) * plotW;
      const y = pad + plotH * (1 - samples[i]);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    const grad = ctx.createLinearGradient(0, pad, 0, hgt);
    grad.addColorStop(0, '#8fe6ff');
    grad.addColorStop(1, '#3f7fd6');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Fill under curve.
    ctx.lineTo(w - pad, hgt - pad);
    ctx.lineTo(pad, hgt - pad);
    ctx.closePath();
    ctx.fillStyle = 'rgba(90,160,240,0.10)';
    ctx.fill();

    // Phase marker.
    const px = pad + ((phase / (Math.PI * 2)) % 1) * plotW;
    ctx.strokeStyle = 'rgba(255,190,120,0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px, pad);
    ctx.lineTo(px, hgt - pad);
    ctx.stroke();
  }
}

/** Scrolling live intensity (what a fixed observer measures over time). */
export class HistoryChart extends Chart {
  draw(history: Float32Array, head: number): void {
    this.syncSize();
    const { ctx, w, hgt } = this;
    this.clear();
    const n = history.length;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const idx = (head + i) % n;
      const x = (i / (n - 1)) * w;
      const y = hgt * (1 - history[idx]) * 0.94 + 3;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#7ce0b0';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

/** Audio waveform / analyser scope. */
export class ScopeChart extends Chart {
  draw(data: Uint8Array | null): void {
    this.syncSize();
    const { ctx, w, hgt } = this;
    this.clear();
    if (!data) {
      ctx.fillStyle = 'rgba(150,180,220,0.35)';
      ctx.font = '11px system-ui';
      ctx.fillText('audio off', 8, hgt / 2);
      return;
    }
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = (i / (data.length - 1)) * w;
      const y = (data[i] / 255) * hgt;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#c9a8ff';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
}

export interface RadialSeries {
  label: string;
  color: string;
  values: number[]; // already normalised 0..1
}

/** Radial interior profiles (density / pressure / enclosed mass vs radius). */
export class RadialChart extends Chart {
  draw(series: RadialSeries[]): void {
    this.syncSize();
    const { ctx, w, hgt } = this;
    this.clear();
    const pad = 6;
    const plotW = w - pad * 2;
    const plotH = hgt - pad * 2;

    ctx.strokeStyle = 'rgba(120,170,230,0.12)';
    for (let i = 0; i <= 4; i++) {
      const x = pad + (plotW * i) / 4;
      ctx.beginPath();
      ctx.moveTo(x, pad);
      ctx.lineTo(x, hgt - pad);
      ctx.stroke();
    }

    for (const s of series) {
      ctx.beginPath();
      for (let i = 0; i < s.values.length; i++) {
        const x = pad + (i / (s.values.length - 1)) * plotW;
        const y = pad + plotH * (1 - s.values[i]);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1.8;
      ctx.stroke();
    }
  }
}
