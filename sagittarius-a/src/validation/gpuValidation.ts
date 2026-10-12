/**
 * Validación del trazador de la GPU (float32, RK4 con paso heurístico) contra el trazador de
 * referencia de la CPU (float64, Dormand–Prince con tolerancia 1e-10) píxel a píxel.
 * Se ejecuta en el navegador (scripts/validar-gpu.mjs la lanza con Playwright).
 */
import * as THREE from 'three';
import { KerrSchild } from '../physics/metrics/kerrSchild';
import { horizons } from '../physics/metrics/kerr';
import { cartesianFromSpheroidal } from '../physics/metrics/coordinates';
import { gramSchmidtTetrad, rainObserver, staticObserver, zamoObserver, type Vec4 } from '../physics/observers/observers';
import { CpuTracer, type CameraState } from '../physics/optics/cpuTracer';
import { RiafModel, DEFAULT_RIAF } from '../physics/emission/riaf';
import { RayTracer, type TracerSettings } from '../rendering/raytracer/RayTracer';
import { defaultTracerSettings, plasmaUniformsFor } from '../rendering/raytracer/settings';

interface Case {
  name: string;
  a: number;
  r: number;
  theta: number;
  observer: 'static' | 'zamo' | 'rain';
  lookOut?: boolean;
  fovDeg: number;
  plasma?: boolean;
  quality?: 'interactive' | 'high';
}

const CASES: Case[] = [
  { name: 'Schwarzschild, cámara estática r=30, ecuatorial', a: 0, r: 30, theta: Math.PI / 2, observer: 'static', fovDeg: 50 },
  { name: 'Kerr a=0,9, ZAMO r=12, θ=80°', a: 0.9, r: 12, theta: (80 * Math.PI) / 180, observer: 'zamo', fovDeg: 70 },
  { name: 'Kerr a=0,6, observador lejano r=1000, θ=60° (sombra)', a: 0.6, r: 1000, theta: Math.PI / 3, observer: 'static', fovDeg: 1.6 },
  { name: 'Kerr a=0,5, cámara en caída libre DENTRO del horizonte r=1,3', a: 0.5, r: 1.3, theta: 1.2, observer: 'rain', fovDeg: 100, lookOut: true },
  { name: 'Kerr a=0,9, ZAMO r=12, θ=80° (alta fidelidad)', a: 0.9, r: 12, theta: (80 * Math.PI) / 180, observer: 'zamo', fovDeg: 70, quality: 'high' },
  { name: 'Plasma RIAF a=0,5, r=40, θ=60°, 230 GHz', a: 0.5, r: 40, theta: Math.PI / 3, observer: 'static', fovDeg: 30, plasma: true },
];

function cameraFor(ks: KerrSchild, c: Case): CameraState {
  const pos = cartesianFromSpheroidal(c.r, c.theta, 0, ks.a);
  let u: Vec4 | null;
  if (c.observer === 'static') u = staticObserver(ks, pos[0], pos[1], pos[2]);
  else if (c.observer === 'zamo') u = zamoObserver(ks, pos[0], pos[1], pos[2]);
  else u = rainObserver(ks, pos[0], pos[1], pos[2]);
  if (!u) throw new Error('observador inexistente');
  const nrm = Math.hypot(pos[0], pos[1], pos[2]);
  const s = c.lookOut ? 1 : -1;
  const fwd = [0, (s * pos[0]) / nrm, (s * pos[1]) / nrm, (s * pos[2]) / nrm];
  const up0 = [0, 0, 0, 1];
  // arriba ortogonal (euclídeo) a adelante
  const dotu = fwd[3];
  const up = [0, -dotu * fwd[1], -dotu * fwd[2], 1 - dotu * fwd[3]];
  void up0;
  const right = [0, fwd[2] * up[3] - fwd[3] * up[2], fwd[3] * up[1] - fwd[1] * up[3], fwd[1] * up[2] - fwd[2] * up[1]];
  const tet = gramSchmidtTetrad(ks, pos[0], pos[1], pos[2], u, [fwd, up, right]);
  return { t: 0, pos, tetrad: { e: [tet.e[0], tet.e[3], tet.e[2], tet.e[1]] } };
}

const STATUS_GPU: Record<number, string> = { 1: 'escape', 2: 'capture', 3: 'past', 4: 'opaque', 5: 'maxsteps', 6: 'marker' };

async function run() {
  const log = document.getElementById('log')!;
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const info = {
    renderer: (gl.getParameter(gl.RENDERER) as string) ?? '?',
    floatRT: !!gl.getExtension('EXT_color_buffer_float'),
  };
  const N = Number(new URLSearchParams(location.search).get('n') ?? 40);
  const tracer = new RayTracer();
  const results: unknown[] = [];
  for (const c of CASES) {
    const ks = new KerrSchild(c.a);
    const cam = cameraFor(ks, c);
    const settings: TracerSettings = defaultTracerSettings(c.a, c.quality ?? 'interactive');
    settings.outputMode = c.plasma ? 2 : 1;
    settings.plasmaOn = !!c.plasma;
    settings.nus = [230e9];
    settings.rEscape = Math.max(1000, 2 * c.r);
    const riafParams = { ...DEFAULT_RIAF, turbulence: 0 };
    settings.plasma = plasmaUniformsFor(c.a, riafParams);
    tracer.setSettings(settings);
    const fov = (c.fovDeg * Math.PI) / 180;
    tracer.setCamera({ t: 0, pos: cam.pos, e: cam.tetrad.e, fovY: fov }, N, N, [0, 0]);
    const rt = new THREE.WebGLRenderTarget(N, N, { type: THREE.FloatType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
    const t0 = performance.now();
    tracer.render(renderer, rt);
    const px = new Float32Array(N * N * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, N, N, px);
    const gpuMs = performance.now() - t0;
    const cpu = new CpuTracer(ks, c.plasma ? new RiafModel(ks, riafParams) : null, {
      rEscape: settings.rEscape,
      nus: c.plasma ? [230e9] : [],
      rtol: c.plasma ? 1e-8 : 1e-10,
      atol: c.plasma ? 1e-10 : 1e-12,
      rgCm: settings.rgCm,
    });
    const th = Math.tan(fov / 2);
    let agree = 0;
    let total = 0;
    const angErr: number[] = [];
    const stepsGpu: number[] = [];
    const relI: number[] = [];
    let sumIg = 0;
    let sumIc = 0;
    const confusion: Record<string, number> = {};
    const tc0 = performance.now();
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const k = 4 * (j * N + i);
        const ndcx = ((i + 0.5) / N) * 2 - 1;
        const ndcy = ((j + 0.5) / N) * 2 - 1;
        const res = cpu.trace(cam, [ndcx * th, ndcy * th, 1]);
        total++;
        if (c.plasma) {
          const Ig = px[k];
          const Ic = res.I[0];
          sumIg += Ig;
          sumIc += Ic;
          if (Ic > 1e-6) relI.push(Math.abs(Ig - Ic) / Ic);
          const sg = STATUS_GPU[Math.round(px[k + 2])] ?? '?';
          if (sg === res.status || (sg !== 'escape' && res.status !== 'escape')) agree++;
          continue;
        }
        const code = Math.floor(px[k + 3] + 1e-3);
        stepsGpu.push(Math.round((px[k + 3] - code) * 100000));
        const sg = STATUS_GPU[code] ?? '?';
        const key = `${res.status}→${sg}`;
        confusion[key] = (confusion[key] ?? 0) + 1;
        const same = sg === res.status || (sg !== 'escape' && res.status !== 'escape');
        if (same) agree++;
        if (sg === 'escape' && res.status === 'escape' && res.dir) {
          const d = [px[k], px[k + 1], px[k + 2]];
          const dot = (d[0] * res.dir[0] + d[1] * res.dir[1] + d[2] * res.dir[2]) / Math.hypot(d[0], d[1], d[2]);
          angErr.push(Math.acos(Math.min(1, Math.max(-1, dot))));
        }
      }
    }
    const cpuMs = performance.now() - tc0;
    angErr.sort((p, q) => p - q);
    relI.sort((p, q) => p - q);
    const q = (arr: number[], f: number) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor(f * arr.length))] : 0);
    const r = {
      caso: c.name,
      N,
      calidad: c.quality ?? 'interactive',
      acuerdoClasificacion: agree / total,
      errAngMedianoRad: q(angErr, 0.5),
      errAngP95Rad: q(angErr, 0.95),
      errAngMaxRad: q(angErr, 1),
      ...(c.plasma ? { errRelIMediano: q(relI, 0.5), errRelIP95: q(relI, 0.95), flujoRelGpuCpu: sumIg / sumIc } : {}),
      pasosGpuMedio: stepsGpu.length ? Math.round(stepsGpu.reduce((p, q) => p + q, 0) / stepsGpu.length) : null,
      pasosGpuMax: stepsGpu.length ? Math.max(...stepsGpu) : null,
      confusion,
      gpuMs: Math.round(gpuMs),
      cpuMs: Math.round(cpuMs),
      rPlus: horizons(c.a).rPlus,
    };
    results.push(r);
    log.textContent = JSON.stringify({ info, results }, null, 1);
    rt.dispose();
  }
  (window as unknown as { __validation: unknown }).__validation = { info, results };
}

run().catch((e) => {
  (window as unknown as { __validation: unknown }).__validation = { error: String(e?.stack ?? e) };
  document.getElementById('log')!.textContent = String(e?.stack ?? e);
});
