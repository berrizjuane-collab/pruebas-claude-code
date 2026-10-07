/**
 * Medición de rendimiento: 3 escenarios × 30 s por perfil de calidad.
 *
 *   npm run dev            (en otra terminal; o URL=http://… npm run perf)
 *   npm run perf           → SwiftShader (WebGL por CPU, útil sin GPU)
 *   PERF_GPU=1 npm run perf → GPU del equipo
 *   PERF_SECONDS=30 PROFILES=baja,media,alta PERF_W=1440 PERF_H=900 PERF_QUERY=aa=0
 *   PERF_OUT=docs/rendimiento.json (opcionales)
 *
 * La cámara recorre una órbita determinista (0,6° por fotograma) y los intervalos se
 * toman con requestAnimationFrame (incluyen la espera a la GPU). Se informa mediana y p95 del intervalo entre fotogramas,
 * triángulos y draw calls del pase principal (último fotograma y máximo de la ventana) y el
 * entorno real de la medición.
 * La emulación móvil no mide un teléfono: solo verifica maquetación.
 */
import { chromium } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';

const URL = process.env.URL ?? 'http://localhost:5173/';
// ojo: SECONDS es una variable especial de bash; se usa PERF_SECONDS
const SECONDS = Number(process.env.PERF_SECONDS ?? 30);
const PROFILES = (process.env.PROFILES ?? 'baja,media,alta').split(',');
const gpu = process.env.PERF_GPU === '1';
const W = Number(process.env.PERF_W ?? 1440);
const H = Number(process.env.PERF_H ?? 900);
const EXTRA = process.env.PERF_QUERY ? `&${process.env.PERF_QUERY}` : '';
const OUT = process.env.PERF_OUT ?? 'docs/rendimiento.json';
const args = gpu ? ['--ignore-gpu-blocklist', '--enable-gpu'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

const scenarios = [
  { id: 'orbita-general', label: 'Órbita general', view: 'general', layers: {} },
  { id: 'bottleneck', label: 'Enfoque del Bottleneck', view: 'bottleneck', layers: {} },
  { id: 'todas-las-capas', label: 'Todas las capas activas', view: 'general', layers: { dem: true } },
];

const browser = await chromium.launch({ headless: true, args });
const results = [];
let env = null;
for (const q of PROFILES) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  if (process.env.PERF_DEBUG) page.on('console', (m) => console.log('[página]', m.text()));
  await page.goto(`${URL}?q=${q}${EXTRA}`);
  await page.waitForFunction(() => window.__k2?.ready || window.__k2?.error, null, { timeout: 180000 });
  env ??= await page.evaluate(() => {
    const gl = window.__k2.app.renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      gpu: String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)),
      userAgent: navigator.userAgent,
      dpr: devicePixelRatio,
      cores: navigator.hardwareConcurrency,
      timings: window.__k2.timings,
    };
  });
  for (const sc of scenarios) {
    const measure = page.evaluate(
      async ({ sc, seconds }) => {
        const a = window.__k2.app;
        a.cam.reducedMotion = true;
        a.goToView(sc.view);
        a.setRoutesMaster(true);
        a.setLabels(true);
        a.setCamps(true);
        a.setDeathZone(true);
        a.setDemOverlay(!!sc.layers.dem);
        // órbita determinista alrededor del objetivo de la vista: un paso por fotograma
        const start = a.cam.currentPose();
        const t = start.target;
        const off = { x: start.position.x - t.x, y: start.position.y - t.y, z: start.position.z - t.z };
        const r = Math.hypot(off.x, off.z);
        const az0 = Math.atan2(off.x, off.z);
        const frame = () => new Promise((res) => requestAnimationFrame(res));
        let i = 0;
        const step = () => {
          const az = az0 + (i++ * 0.6 * Math.PI) / 180;
          a.cam.setPose({ target: t, position: { x: t.x + r * Math.sin(az), y: t.y + off.y, z: t.z + r * Math.cos(az) } });
          a.request();
        };
        console.log('escenario', sc.id, 'calentando');
        const w0 = performance.now();
        while (performance.now() - w0 < 3000) {
          step();
          await frame();
        }
        console.log('midiendo');
        a.resetCpuStats();
        const stamps = [];
        let maxCalls = 0;
        let maxTriangles = 0;
        const t0 = performance.now();
        while (performance.now() - t0 < seconds * 1000) {
          step();
          stamps.push(await frame());
          // el tick de la app se registró antes que este callback: el recuento es de este fotograma
          const ps = a.passStats();
          maxCalls = Math.max(maxCalls, ps.calls);
          maxTriangles = Math.max(maxTriangles, ps.triangles);
        }
        console.log('fotogramas', stamps.length);
        const d = [];
        for (let k = 1; k < stamps.length; k++) d.push(stamps[k] - stamps[k - 1]);
        d.sort((x, y) => x - y);
        const q = (p) => d[Math.min(d.length - 1, Math.floor(p * (d.length - 1)))];
        const st = a.debugState();
        const cv = a.renderer.domElement;
        a.cam.reducedMotion = false;
        return {
          frames: d.length,
          medianMs: q(0.5),
          p95Ms: q(0.95),
          fpsMedian: 1000 / q(0.5),
          triangles: st.triangles,
          calls: st.calls,
          maxTriangles,
          maxCalls,
          lod: st.lod.levels,
          profile: st.profile,
          cpuMedianMs: st.cpu.median,
          cpuP95Ms: st.cpu.p95,
          drawingBuffer: `${cv.width}×${cv.height}`,
        };
      },
      { sc, seconds: SECONDS },
    );
    const limit = new Promise((res) => setTimeout(() => res(null), (SECONDS + 150) * 1000));
    const r = await Promise.race([measure, limit]);
    if (!r) {
      results.push({ profile: q, scenario: sc.id, label: sc.label, error: 'sin completar en el tiempo límite' });
      console.log(`${q.padEnd(6)} ${sc.id.padEnd(16)} sin completar en el tiempo límite`);
      break;
    }
    results.push({ profile: q, scenario: sc.id, label: sc.label, ...r });
    console.log(`${q.padEnd(6)} ${sc.id.padEnd(16)} mediana ${r.medianMs.toFixed(1)} ms · p95 ${r.p95Ms.toFixed(1)} ms · ${r.frames} fotogramas · ${(r.triangles / 1000).toFixed(0)} k tri (máx ${(r.maxTriangles / 1000).toFixed(0)} k) · ${r.calls} calls (máx ${r.maxCalls}) · CPU hilo principal med ${r.cpuMedianMs.toFixed(1)} / p95 ${r.cpuP95Ms.toFixed(1)} ms · lienzo ${r.drawingBuffer}`);
  }
  await page.close();
}
await browser.close();
mkdirSync('docs', { recursive: true });
const out = { fecha: new Date().toISOString(), segundosPorEscenario: SECONDS, modo: gpu ? 'GPU' : 'SwiftShader (CPU)', viewport: `${W}×${H}`, consulta: EXTRA, entorno: env, resultados: results };
writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
console.log('Entorno:', JSON.stringify(env));
console.log(`Guardado en ${OUT}`);
