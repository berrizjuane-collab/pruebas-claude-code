/**
 * Perspectiva C: diagramas matemáticos (no son luz).
 *  1. Espacio-tiempo (t_KS, r): línea de universo calculada, horizonte como frontera causal,
 *     conos de luz radiales (direcciones nulas principales) que se inclinan hacia r decreciente y
 *     se cierran dentro de r₊; rayos radiales salientes desde la trayectoria hacia la cámara.
 *  2. Plano ecuatorial (x, y): trayectorias, horizonte, ergosfera, ISCO y órbitas fotónicas.
 *  3. Curvatura: log₁₀ |K| (Kretschmann) en un corte meridional (x, z), con signo.
 */
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../app/store';
import { useObs } from './hud';
import { Segmented } from './components';
import { delta, ergosphereRadius, horizons, iscoRadius, kretschmann, photonOrbitRadius } from '../physics/metrics/kerr';
import { spheroidalFromCartesian } from '../physics/metrics/coordinates';
import { SAMPLE_SIZE, S_R, S_T, S_X } from '../simulation/types';
import { fmt } from './format';

type Tab = 'tr' | 'xy' | 'k';

export function DiagramView() {
  const obs = useObs();
  const [tab, setTab] = useState<Tab>('tr');
  const [zoom, setZoom] = useState(16);
  const zoomRef = useRef(16);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  const a = useApp((s) => s.spin);
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    let kCache: { a: number; w: number; h: number; img: ImageData } | null = null;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const c = ref.current;
      if (!c) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = c.clientWidth;
      const H = c.clientHeight;
      if (c.width !== Math.floor(W * dpr) || c.height !== Math.floor(H * dpr)) {
        c.width = Math.floor(W * dpr);
        c.height = Math.floor(H * dpr);
        kCache = null;
      }
      const g = c.getContext('2d')!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      g.font = '10.5px "JetBrains Mono", monospace';
      const exps = [...obs.client.experiments.values()];
      const t = obs.engine.t;
      const { rPlus, rMinus } = horizons(a);
      const frame = obs.engine.relCam.frame(obs.engine.nav.pose(), t);
      if (tab === 'tr') {
        // Escala isótropa (1 M de t = 1 M de r): la luz radial lejana va a 45°, como en los
        // diagramas de Eddington–Finkelstein. La ventana temporal sigue al reloj (75 % pasado).
        const L = 56, R = 16, T = 16, B = 34;
        const rMax = zoomRef.current;
        const k = (W - L - R) / rMax;
        const span = (H - T - B) / k;
        const t0 = t - 0.75 * span;
        const t1 = t0 + span;
        const X = (r: number) => L + r * k;
        const Y = (tt: number) => H - B - (tt - t0) * k;
        g.save();
        g.beginPath();
        g.rect(L, T, W - L - R, H - T - B);
        g.clip();
        // región interior
        g.fillStyle = 'rgba(240,122,106,0.06)';
        g.fillRect(X(0), T, X(rPlus) - X(0), H - T - B);
        // Conos de luz radiales: direcciones nulas principales en t de Kerr–Schild
        //   entrante dt/dr = −1 ; saliente dt/dr = (r² + a² + 2r)/Δ  (Δ < 0 dentro de r₊: también entra)
        const nr = 9;
        const dr0 = rMax / nr;
        const tStep = dr0;
        const tFirst = Math.ceil(t0 / tStep) * tStep;
        const sz = 0.38 * dr0;
        for (let i = 0; i < nr; i++) {
          const r = (i + 0.5) * dr0;
          const D = delta(r, a);
          const slope = (r * r + a * a + 2 * r) / D; // dt/dr del rayo saliente
          // vector futuro (dr, dt) del rayo saliente, normalizado
          let outDr: number, outDt: number;
          if (Math.abs(D) < 1e-9) {
            outDr = 0;
            outDt = 1;
          } else {
            const dr = 1 / slope; // por unidad de dt (dt > 0)
            const n = Math.hypot(dr, 1);
            outDr = dr / n;
            outDt = 1 / n;
          }
          const inside = r < rPlus;
          for (let tc = tFirst; tc < t1; tc += tStep) {
            g.fillStyle = inside ? 'rgba(240,122,106,0.16)' : 'rgba(159,214,184,0.12)';
            g.strokeStyle = inside ? 'rgba(240,122,106,0.75)' : 'rgba(159,214,184,0.55)';
            g.beginPath();
            g.moveTo(X(r), Y(tc));
            g.lineTo(X(r - sz / Math.SQRT2), Y(tc + sz / Math.SQRT2));
            g.lineTo(X(r + sz * outDr), Y(tc + sz * outDt));
            g.closePath();
            g.fill();
            g.stroke();
            g.fillStyle = '#9aa1aa';
            g.fillRect(X(r) - 1, Y(tc) - 1, 2, 2);
          }
        }
        // radios característicos
        const vline = (r: number, color: string, label: string, dash: number[] = [], row = 0) => {
          if (r <= 0 || r > rMax) return;
          g.strokeStyle = color;
          g.setLineDash(dash);
          g.beginPath();
          g.moveTo(X(r), T);
          g.lineTo(X(r), H - B);
          g.stroke();
          g.setLineDash([]);
          g.fillStyle = color;
          g.fillText(label, X(r) + 3, T + 10 + 12 * row);
        };
        vline(rPlus, '#f07a6a', 'r₊');
        if (rMinus > 0.01) vline(rMinus, '#c48df0', 'r₋', [4, 3], 1);
        vline(ergosphereRadius(a, Math.PI / 2), '#9b7be0', 'r_E', [2, 3], 2);
        vline(photonOrbitRadius(a, true), '#ffd27a', 'r_ph', [2, 3], 1);
        vline(iscoRadius(a, true), '#6cc6d9', 'ISCO', [2, 3]);
        if (!frame.inside && frame.r <= rMax) vline(frame.r, 'rgba(232,234,237,0.5)', 'cámara', [6, 4]);
        // líneas de universo (continua: pasado; discontinua: futuro ya calculado)
        let any = false;
        for (const e of exps) {
          if (e.type !== 'body') continue;
          any = true;
          const d = e.body.data;
          g.strokeStyle = e.color;
          g.lineWidth = 2;
          g.beginPath();
          let pen = false;
          for (let j = 0; j < e.nSamples; j++) {
            const tt = d[j * SAMPLE_SIZE + S_T];
            const r = d[j * SAMPLE_SIZE + S_R];
            if (tt > t) break;
            if (pen) g.lineTo(X(r), Y(tt));
            else g.moveTo(X(r), Y(tt));
            pen = true;
          }
          g.stroke();
          g.lineWidth = 1;
          g.setLineDash([3, 3]);
          g.beginPath();
          pen = false;
          for (let j = 0; j < e.nSamples; j++) {
            const tt = d[j * SAMPLE_SIZE + S_T];
            if (tt < t) continue;
            if (tt > t1) break;
            const r = d[j * SAMPLE_SIZE + S_R];
            if (pen) g.lineTo(X(r), Y(tt));
            else g.moveTo(X(r), Y(tt));
            pen = true;
          }
          g.stroke();
          g.setLineDash([]);
          // rayos radiales salientes desde la línea de universo hacia la cámara
          if (!frame.inside) {
            g.strokeStyle = 'rgba(255,210,122,0.45)';
            const stride = Math.max(1, Math.round(1.2 * dr0 / 0.25));
            for (let j = 0; j < e.nSamples; j += stride) {
              let tt = d[j * SAMPLE_SIZE + S_T];
              let r = d[j * SAMPLE_SIZE + S_R];
              if (tt > t || tt < t0 - span || r <= rPlus * 1.0005) continue;
              g.beginPath();
              g.moveTo(X(r), Y(tt));
              for (let it = 0; it < 4000 && r < Math.min(frame.r, rMax * 1.05) && tt < t1; it++) {
                const D = delta(r, a);
                const dr = Math.max(0.004, 0.02 * (r - rPlus));
                tt += ((r * r + a * a + 2 * r) / D) * dr;
                r += dr;
                g.lineTo(X(r), Y(tt));
              }
              g.stroke();
            }
          }
          const hor = e.events.find((v) => v.kind === 'horizonte');
          if (hor && hor.t <= t) {
            g.fillStyle = '#f07a6a';
            g.beginPath();
            g.arc(X(hor.r), Y(hor.t), 4, 0, 2 * Math.PI);
            g.fill();
            g.fillText('cruce del horizonte (evento del modelo)', X(hor.r) + 7, Y(hor.t) - 6);
          }
          const st = obs.client.bodyAt(e, t);
          if (st) {
            g.fillStyle = e.color;
            g.beginPath();
            g.arc(X(st.r), Y(t), 3.5, 0, 2 * Math.PI);
            g.fill();
          }
        }
        g.restore();
        if (!any) {
          g.fillStyle = '#8b929b';
          g.fillText('Lanza un cuerpo (ARROJAR) para ver su línea de universo.', L + 10, H - B - 12);
        }
        // ejes
        g.strokeStyle = 'rgba(255,255,255,0.25)';
        g.beginPath();
        g.moveTo(L, T);
        g.lineTo(L, H - B);
        g.lineTo(W - R, H - B);
        g.stroke();
        g.fillStyle = '#8b929b';
        const rTick = rMax > 40 ? 10 : rMax > 16 ? 5 : rMax > 8 ? 2 : 1;
        for (let r = 0; r <= rMax + 1e-9; r += rTick) g.fillText(fmt(r, 0), X(r) - 4, H - B + 14);
        g.fillText('r [r_g]', W - R - 44, H - B + 26);
        for (let tt = Math.ceil(t0 / (rTick * 2)) * rTick * 2; tt <= t1; tt += rTick * 2) if (Y(tt) > T + 18) g.fillText(fmt(tt, 0), 4, Y(tt) + 3);
        g.fillText('t_KS [M]', 4, T + 2);
        g.strokeStyle = 'rgba(232,234,237,0.25)';
        g.setLineDash([2, 4]);
        g.beginPath();
        g.moveTo(L, Y(t));
        g.lineTo(W - R, Y(t));
        g.stroke();
        g.setLineDash([]);
        g.fillStyle = 'rgba(232,234,237,0.55)';
        g.fillText('ahora', W - R - 34, Y(t) - 4);
      } else if (tab === 'xy') {
        const R0 = Math.max(16, Math.min(80, ...exps.filter((e) => e.type === 'body').map((e) => Math.max(...Array.from({ length: Math.min(e.nSamples, 4000) }, (_, k) => e.body.data[k * SAMPLE_SIZE + S_R])) * 1.15)), frame.r < 80 ? frame.r * 1.1 : 16);
        const cx = W / 2;
        const cy = H / 2;
        const sc = Math.min(W, H) / (2.2 * R0);
        const P = (x: number, y: number) => [cx + x * sc, cy - y * sc];
        const circle = (rr: number, color: string, dash: number[] = [], fill?: string) => {
          g.strokeStyle = color;
          g.setLineDash(dash);
          g.beginPath();
          g.arc(cx, cy, rr * sc, 0, 2 * Math.PI);
          if (fill) {
            g.fillStyle = fill;
            g.fill();
          }
          g.stroke();
          g.setLineDash([]);
        };
        const rc = (r: number) => Math.sqrt(r * r + a * a);
        circle(rc(rPlus), '#c9ced6', [], 'rgba(0,0,0,0.9)');
        circle(rc(ergosphereRadius(a, Math.PI / 2)), '#9b7be0', [4, 3]);
        circle(rc(photonOrbitRadius(a, true)), '#ffd27a', [2, 3]);
        circle(rc(photonOrbitRadius(a, false)), '#ffd27a', [1, 5]);
        circle(rc(iscoRadius(a, true)), '#6cc6d9');
        circle(rc(iscoRadius(a, false)), '#6cc6d9', [4, 4]);
        for (const e of exps) {
          if (e.type === 'body') {
            const d = e.body.data;
            g.strokeStyle = e.color;
            g.lineWidth = 1.6;
            g.beginPath();
            for (let k = 0; k < e.nSamples; k++) {
              const tt = d[k * SAMPLE_SIZE + S_T];
              if (tt > t) break;
              const [px, py] = P(d[k * SAMPLE_SIZE + S_X], d[k * SAMPLE_SIZE + S_X + 1]);
              if (k === 0) g.moveTo(px, py);
              else g.lineTo(px, py);
            }
            g.stroke();
            g.lineWidth = 1;
            const st = obs.client.bodyAt(e, t);
            if (st) {
              const [px, py] = P(st.pos[0], st.pos[1]);
              g.fillStyle = e.color;
              g.beginPath();
              g.arc(px, py, 3.5, 0, 2 * Math.PI);
              g.fill();
            }
          } else if (e.type === 'cloud') {
            const p = obs.client.particlesAt(e, t);
            g.fillStyle = e.color;
            for (let j = 0; j < e.nParticles; j++) {
              const [px, py] = P(p[4 * j], p[4 * j + 1]);
              g.fillRect(px - 1.5, py - 1.5, 3, 3);
            }
          } else if (e.type === 'beam') {
            for (const path of obs.client.photonPaths(e, t)) {
              g.strokeStyle = 'rgba(255,210,122,0.8)';
              g.beginPath();
              for (let i = 0; i < path.length; i += 3) {
                const [px, py] = P(path[i], path[i + 1]);
                if (i === 0) g.moveTo(px, py);
                else g.lineTo(px, py);
              }
              g.stroke();
            }
          }
        }
        const [kx, ky] = P(frame.pos[0], frame.pos[1]);
        g.fillStyle = '#e8eaed';
        g.fillText('◆ cámara', kx + 4, ky - 4);
        g.fillStyle = '#8b929b';
        g.fillText(`r₊, ergosfera, órbitas fotónicas (pro/retro), ISCO (pro/retro) · radio mostrado ${fmt(R0, 0)} r_g · a* = ${fmt(a, 3)}`, 10, H - 10);
      } else {
        // Mapa de curvatura en el plano meridional (x, z)
        const R0 = 6;
        if (!kCache || kCache.a !== a || kCache.w !== c.width || kCache.h !== c.height) {
          const img = g.createImageData(c.width, c.height);
          const scale = Math.min(c.width, c.height) / (2.2 * R0);
          for (let j = 0; j < c.height; j++)
            for (let i = 0; i < c.width; i++) {
              const x = (i - c.width / 2) / scale;
              const z = -(j - c.height / 2) / scale;
              const sph = spheroidalFromCartesian(Math.abs(x) + 1e-9, 0, z, a);
              const K = kretschmann(sph.r, sph.theta, a);
              const L = Math.log10(Math.abs(K) + 1e-12);
              const u = Math.min(1, Math.max(0, (L + 4) / 7));
              const o = 4 * (j * c.width + i);
              if (K >= 0) {
                img.data[o] = Math.round(255 * Math.min(1, 1.6 * u));
                img.data[o + 1] = Math.round(255 * Math.max(0, 1.6 * u - 0.6) * 0.85);
                img.data[o + 2] = Math.round(255 * Math.max(0, 2 * u - 1.4) * 0.6 + 30 * (1 - u));
              } else {
                img.data[o] = Math.round(40 * u);
                img.data[o + 1] = Math.round(160 * u);
                img.data[o + 2] = Math.round(255 * u);
              }
              img.data[o + 3] = 255;
            }
          kCache = { a, w: c.width, h: c.height, img };
        }
        g.putImageData(kCache.img, 0, 0);
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        const sc = Math.min(W, H) / (2.2 * R0);
        const cx = W / 2;
        const cy = H / 2;
        const outline = (rf: (th: number) => number, color: string, dash: number[] = []) => {
          g.strokeStyle = color;
          g.setLineDash(dash);
          g.beginPath();
          for (let k = 0; k <= 200; k++) {
            const th = (k / 200) * 2 * Math.PI;
            const r = rf(Math.abs(Math.atan2(Math.sin(th), Math.cos(th))));
            const x = Math.sqrt(r * r + a * a) * Math.sin(th);
            const z = r * Math.cos(th);
            if (k === 0) g.moveTo(cx + x * sc, cy - z * sc);
            else g.lineTo(cx + x * sc, cy - z * sc);
          }
          g.stroke();
          g.setLineDash([]);
        };
        outline(() => rPlus, '#e8eaed');
        outline((th) => ergosphereRadius(a, th), '#9b7be0', [4, 3]);
        g.fillStyle = '#e8eaed';
        g.fillText('log₁₀|K| [M⁻⁴]: −4 … 3 (rojo K > 0, azul K < 0) · corte meridional (x, z), ±6 r_g', 10, H - 26);
        g.fillText('K = R_abcd R^abcd es un invariante: no depende de coordenadas ni del observador, pero no es «visible».', 10, H - 10);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [tab, a, obs]);
  return (
    <section className="diagram" aria-label="Diagrama matemático">
      <header>
        <span className="t">Diagrama · no es luz</span>
        <Segmented
          small
          value={tab}
          onChange={setTab}
          options={[
            { value: 'tr', label: 'Espacio-tiempo (t, r)' },
            { value: 'xy', label: 'Plano ecuatorial' },
            { value: 'k', label: 'Curvatura' },
          ]}
        />
      </header>
      {tab === 'tr' && (
        <div className="tools">
          <label className="zoom">
            Extensión radial
            <input type="range" min={Math.log(4)} max={Math.log(80)} step={0.01} value={Math.log(zoom)} onChange={(e) => setZoom(Math.exp(Number(e.target.value)))} aria-label="Extensión radial del diagrama" />
            <span className="mono">{fmt(zoom, 0)} r_g</span>
          </label>
        </div>
      )}
      <canvas ref={ref} />
      <footer>
        {tab === 'tr'
          ? 'Coordenadas de Kerr–Schild entrantes con la misma escala en t y en r (la luz radial lejana va a 45°). El horizonte es regular y la línea de universo lo cruza en t finito. Los conos (direcciones nulas radiales principales) se inclinan hacia r decreciente; dentro de r₊ ambos lados apuntan hacia dentro: ninguna trayectoria causal futura puede salir. Los rayos salientes (amarillo) emitidos cerca de r₊ tardan cada vez más en llegar a la cámara.'
          : tab === 'xy'
            ? 'Proyección del plano ecuatorial en coordenadas cartesianas de Kerr–Schild (las circunferencias de radio BL r tienen radio cartesiano √(r² + a²)).'
            : 'Escalar de Kretschmann exacto de Kerr. En Kerr la curvatura cambia de signo cerca del anillo singular; K diverge en r = 0, θ = π/2.'}
      </footer>
    </section>
  );
}
