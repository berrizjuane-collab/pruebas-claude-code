/**
 * Medición de rendimiento (VAL-03, VALIDATION §6). Con `?perf=PERF-A|PERF-B|PERF-C` la
 * aplicación arranca con la escena reproducible de `tests/fixtures/perf-*.json` y ofrece
 * «Iniciar medición»; el informe JSON se descarga (R1) o lo recoge `npm run perf` (C0).
 *
 * - PERF-A y PERF-B: 2 s de calentamiento y N fotogramas (600 por defecto) con una órbita
 *   guionizada de 360° en 10 s y las partículas en marcha: p50, p95, p99 y % > 33 ms.
 * - Tiempos de cálculo medidos dentro del *worker* (malla, corte y líneas): mediana de 10.
 * - PERF-C: arrastre guionizado de ω con 60 valores en 3 s; tareas largas del hilo principal
 *   y latencia desde cada valor hasta el fotograma que dibuja sus flechas.
 */
import type { ClienteCalculo } from '../compute/client';
import { peticionCorte, peticionLineas, peticionMalla } from '../compute/peticiones';
import type { ControladorEscena } from '../render/ControladorEscena';
import { fijarParametro } from '../state/actions';
import { importarConfiguracion } from '../state/persist';
import type { EstadoExperimento } from '../state/schema';
import { T } from '../i18n/es';
import type { Almacen } from '../state/store';
import type { Animacion } from './animacion';
import type { EstadoCalculo, Orquestador } from './orquestador';
import { parametrosUrl } from './pruebas';
import perfA from '../../tests/fixtures/perf-A.json?raw';
import perfB from '../../tests/fixtures/perf-B.json?raw';
import perfC from '../../tests/fixtures/perf-C.json?raw';

export type IdEscenaPerf = 'PERF-A' | 'PERF-B' | 'PERF-C';
export type TrabajoPerf = 'malla' | 'corte' | 'lineas';
const TEXTOS: Record<IdEscenaPerf, string> = { 'PERF-A': perfA, 'PERF-B': perfB, 'PERF-C': perfC };

export interface EscenaPerf {
  id: IdEscenaPerf;
  estado: EstadoExperimento;
}

/** Escena pedida con `?perf=` (o null). */
export function escenaPerf(): EscenaPerf | null {
  const id = parametrosUrl().get('perf')?.toUpperCase() as IdEscenaPerf | undefined;
  if (!id || !(id in TEXTOS)) return null;
  const texto = TEXTOS[id];
  const r = importarConfiguracion(texto, texto.length);
  if (!r.ok) throw new Error(`Escena ${id} no válida: ${r.errores.map((e) => e.mensaje).join('; ')}`);
  return { id, estado: r.estado };
}

export interface ContextoMedicion {
  escena: EscenaPerf;
  controlador: ControladorEscena;
  cliente: ClienteCalculo;
  orquestador: Orquestador;
  almacen: Almacen<EstadoExperimento>;
  calculo: Almacen<EstadoCalculo>;
  animacion: Animacion;
  /** ms desde el inicio de la navegación hasta la interfaz interactiva (V-PERF-06). */
  arranqueMs: number | null;
}

export interface OpcionesMedicion {
  fotogramas: number;
  repeticiones: number;
  equipo: string;
  progreso: (texto: string) => void;
}

export interface Estadistica {
  n: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
}

export interface InformeRendimiento {
  formato: 'campos-vectoriales/rendimiento';
  version: 1;
  escena: IdEscenaPerf;
  equipo: string;
  fecha: string;
  entorno: {
    userAgent: string;
    nucleos: number;
    memoriaGiB: number | null;
    gpu: string | null;
    dpr: number;
    ventana: [number, number];
    lienzo: [number, number];
    pantalla: [number, number];
    modoCalculo: string;
  };
  arranqueMs: number | null;
  fotogramas: (Estadistica & { porEncimaDe33ms: number; segundos: number }) | null;
  /** Tiempos dentro del worker por trabajo (`malla`, `corte`, `lineas`), con su descripción. */
  calculo: Partial<Record<TrabajoPerf, Estadistica & { descripcion: string; medianaMs: number; repeticiones: number[] }>>;
  interaccion: { valores: number; tareasLargas: number[]; latencias: Estadistica | null; perdidos: number } | null;
}

const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const fotograma = () => new Promise<number>((r) => requestAnimationFrame(r));
const redondear = (v: number) => Math.round(v * 100) / 100;

export function estadistica(valores: readonly number[]): Estadistica {
  const v = [...valores].sort((a, b) => a - b);
  const q = (p: number) => v[Math.min(v.length - 1, Math.max(0, Math.ceil(p * v.length) - 1))] ?? 0;
  return { n: v.length, p50: redondear(q(0.5)), p95: redondear(q(0.95)), p99: redondear(q(0.99)), max: redondear(v.at(-1) ?? 0) };
}

/** Espera a que no quede ningún cálculo pendiente y estén los resultados que pide el estado. */
async function enReposo(ctx: ContextoMedicion, maxMs = 60_000): Promise<void> {
  const t0 = performance.now();
  for (;;) {
    const p = ctx.orquestador.pendiente;
    const r = ctx.calculo.obtener();
    const e = ctx.almacen.obtener();
    const listo = !p.malla && !p.lineas && !p.corte && r.malla && (!e.capas.lineas || r.lineas) && (!e.corte.activo || r.corte);
    if (listo) return;
    if (performance.now() - t0 > maxMs) throw new Error('El cálculo no terminó a tiempo');
    await esperar(20);
  }
}

function entorno(ctx: ContextoMedicion): InformeRendimiento['entorno'] {
  const gl = ctx.controlador.renderer.getContext();
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const lienzo = ctx.controlador.renderer.domElement;
  return {
    userAgent: navigator.userAgent,
    nucleos: navigator.hardwareConcurrency ?? 0,
    memoriaGiB: (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null,
    gpu: info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : null,
    dpr: window.devicePixelRatio,
    ventana: [window.innerWidth, window.innerHeight],
    lienzo: [lienzo.width, lienzo.height],
    pantalla: [screen.width, screen.height],
    modoCalculo: ctx.cliente.modo,
  };
}

/** Órbita de 360° en 10 s mientras se miden `n` intervalos entre fotogramas (tras 2 s de calentamiento). */
async function medirFotogramas(ctx: ContextoMedicion, n: number, progreso: (t: string) => void) {
  const GRADOS_POR_MS = 360 / 10_000;
  let previo = await fotograma();
  const t0 = previo;
  progreso(T.rendimiento.calentando);
  while (previo - t0 < 2000) {
    const t = await fotograma();
    ctx.controlador.orbitar((t - previo) * GRADOS_POR_MS, 0);
    previo = t;
  }
  const intervalos: number[] = [];
  const tInicio = previo;
  while (intervalos.length < n) {
    const t = await fotograma();
    ctx.controlador.orbitar((t - previo) * GRADOS_POR_MS, 0);
    intervalos.push(t - previo);
    previo = t;
    if (intervalos.length % 30 === 0) progreso(T.rendimiento.fotogramas(intervalos.length, n));
  }
  return { ...estadistica(intervalos), porEncimaDe33ms: redondear((100 * intervalos.filter((d) => d > 33).length) / n), segundos: redondear((previo - tInicio) / 1000) };
}

/** Mediana de `k` repeticiones de cada trabajo, medidas dentro del worker. */
async function medirCalculo(ctx: ContextoMedicion, k: number, progreso: (t: string) => void) {
  await enReposo(ctx);
  const e = ctx.almacen.obtener();
  const malla = ctx.calculo.obtener().malla!;
  const n = e.muestreo.n;
  const M = e.muestreo.corteResolucion;
  const res: InformeRendimiento['calculo'] = {};
  const s = e.lineas.semillas;
  const nSemillas = s.tipo === 'rejilla' ? s.nu * s.nv : s.tipo === 'aleatoria' ? s.n : 1;
  const trabajos: [TrabajoPerf, string, () => Promise<{ ms: number } | null>][] = [['malla', `malla ${n[0]}×${n[1]}×${n[2]}`, () => ctx.cliente.malla(peticionMalla(e))]];
  if (e.corte.activo) trabajos.push(['corte', `corte ${M}×${M} (${e.corte.escalar})`, () => ctx.cliente.corte(peticionCorte(e))]);
  if (e.capas.lineas) trabajos.push(['lineas', `líneas (${nSemillas} semillas)`, () => ctx.cliente.lineas(peticionLineas(e, malla))]);
  for (const [clave, descripcion, trabajo] of trabajos) {
    const ms: number[] = [];
    for (let i = 0; i < k; i++) {
      progreso(T.rendimiento.calculo(descripcion, i + 1, k));
      const r = await trabajo();
      if (!r) throw new Error(`Trabajo «${descripcion}» sustituido durante la medición`);
      ms.push(r.ms);
    }
    const est = estadistica(ms);
    res[clave] = { ...est, descripcion, medianaMs: est.p50, repeticiones: ms.map(redondear) };
  }
  return res;
}

/**
 * PERF-C: ω recorre 0.05, 0.10, …, 3.00 (60 valores) cada 50 ms. La latencia de cada valor va
 * desde que se fija hasta el inicio del fotograma que dibuja la malla calculada con él; ω se
 * lee de la propia malla (F = ω (−y, x, 0) en el nodo (2, 0, 0)).
 */
async function medirInteraccion(ctx: ContextoMedicion, progreso: (t: string) => void) {
  await enReposo(ctx);
  const nombre = ctx.almacen.obtener().parametros[0]?.nombre;
  if (!nombre) return null;
  const malla0 = ctx.calculo.obtener().malla!;
  let nodo = -1;
  for (let i = 0; i < malla0.total; i++) {
    const [x, y, z] = [malla0.pos[3 * i], malla0.pos[3 * i + 1], malla0.pos[3 * i + 2]];
    if (Math.abs(x! - 2) < 1e-9 && Math.abs(y!) < 1e-9 && Math.abs(z!) < 1e-9) nodo = i;
  }
  if (nodo < 0) return null;
  const clave = (w: number) => Math.round(w * 1000);
  const fijados = new Map<number, number>();
  const latencias: number[] = [];
  const tareasLargas: number[] = [];
  const observador = new PerformanceObserver((l) => l.getEntries().forEach((e) => tareasLargas.push(redondear(e.duration))));
  observador.observe({ type: 'longtask' });
  const quitar = ctx.calculo.suscribir(() => {
    const m = ctx.calculo.obtener().malla;
    if (!m) return;
    const t = fijados.get(clave(m.F[3 * nodo + 1]! / 2));
    if (t === undefined) return;
    fijados.delete(clave(m.F[3 * nodo + 1]! / 2));
    void fotograma().then((tf) => latencias.push(tf - t));
  });
  progreso(T.rendimiento.interaccion);
  const valores = Array.from({ length: 60 }, (_, i) => redondear(0.05 * (i + 1)));
  const t0 = performance.now();
  for (let i = 0; i < valores.length; i++) {
    const objetivo = t0 + 50 * i;
    const espera = objetivo - performance.now();
    if (espera > 0) await esperar(espera);
    const w = valores[i]!;
    fijados.set(clave(w), performance.now());
    ctx.almacen.fijar((s) => fijarParametro(s, nombre, w));
  }
  await esperar(1000);
  await enReposo(ctx);
  await fotograma();
  quitar();
  observador.disconnect();
  // Los valores sustituidos antes de calcularse (agrupamiento por fotograma) no tienen latencia propia.
  return { valores: valores.length, tareasLargas, latencias: latencias.length ? estadistica(latencias) : null, perdidos: fijados.size };
}

/** Restaura la escena de partida (estado y cámara) y espera a que esté calculada. */
async function restaurar(ctx: ContextoMedicion): Promise<void> {
  ctx.almacen.fijar(ctx.escena.estado);
  const c = ctx.escena.estado.camara;
  if (c) {
    ctx.controlador.fijarCamara(c);
    if (c.tipo) ctx.controlador.fijarProyeccion(c.tipo);
  }
  await enReposo(ctx);
}

export async function medirRendimiento(ctx: ContextoMedicion, o: OpcionesMedicion): Promise<InformeRendimiento> {
  await restaurar(ctx);
  const interaccion = ctx.escena.id === 'PERF-C';
  let fotogramas: InformeRendimiento['fotogramas'] = null;
  if (!interaccion) {
    ctx.animacion.fijarEnMarcha(true);
    fotogramas = await medirFotogramas(ctx, o.fotogramas, o.progreso);
  }
  const calculo = await medirCalculo(ctx, o.repeticiones, o.progreso);
  const resultadoInteraccion = interaccion ? await medirInteraccion(ctx, o.progreso) : null;
  await restaurar(ctx);
  o.progreso(T.rendimiento.terminada);
  return {
    formato: 'campos-vectoriales/rendimiento',
    version: 1,
    escena: ctx.escena.id,
    equipo: o.equipo,
    fecha: new Date().toISOString(),
    entorno: entorno(ctx),
    arranqueMs: ctx.arranqueMs === null ? null : redondear(ctx.arranqueMs),
    fotogramas,
    calculo,
    interaccion: resultadoInteraccion,
  };
}
