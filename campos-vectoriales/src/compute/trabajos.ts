/**
 * Trabajos de cálculo (CMP-01). El mismo código se ejecuta en el worker y, si el
 * navegador no permite crearlo, en el hilo principal (D-22).
 */
import { compilarCampo, type CampoCompilado } from '../math/field';
import { anillosRotacional, calcularFlechas } from '../geometria/flechas';
import { contornoCero } from '../geometria/escalar';
import { geometriaLineas } from '../geometria/lineas';
import { clasificarCeros, crearMalla, escalaAutomatica, muestrearMalla, type Escala } from '../numerics/grid';
import { generarSemillas } from '../numerics/seeds';
import { muestrearRotacional } from '../numerics/rotacional';
import { muestrearCorte } from '../numerics/slice';
import { lineaTroceada, MOTIVOS, opcionesPorDefecto, type MotivoParada } from '../numerics/streamlines';
import { EJES_PLANO } from '../math/tipos';
import type { DefinicionCampo, FlechasCorte, PeticionCorte, PeticionLineas, PeticionMalla, ResultadoCorte, ResultadoLineas, ResultadoMalla } from './protocol';

/** Límite de vértices totales de las líneas (SPEC §5.9). */
export const VERTICES_MAX = 1_000_000;

let cache: { clave: string; campo: CampoCompilado } | null = null;

/** Campo compilado (con caché de la última definición). Lanza un error legible si no compila. */
export function obtenerCampo(def: DefinicionCampo): CampoCompilado {
  const clave = `${def.P}\u0000${def.Q}\u0000${def.R}\u0000${def.parametros.join(',')}`;
  if (cache?.clave === clave) return cache.campo;
  const r = compilarCampo({ P: def.P, Q: def.Q, R: def.R }, def.parametros);
  if (!r.ok) {
    const [componente, error] = Object.entries(r.errores)[0] ?? ['?', { mensaje: 'error desconocido' }];
    throw new Error(`La componente ${componente} no es válida: ${error?.mensaje}`);
  }
  cache = { clave, campo: r.campo };
  return r.campo;
}

/** Escala de referencia fija o automática (P95) de unas magnitudes. */
const escalaDe = (e: PeticionMalla['escala'], mag: Float64Array, clase: Uint8Array): Escala =>
  e.tipo === 'fija' ? { ref: e.valor, origen: 'fija', nulo: false } : escalaAutomatica(mag, clase);

/** Escala de longitud del paso de las derivadas numéricas (SPEC §5.4): medio lado menor de Ω. */
const escalaLongitud = (d: PeticionMalla['dominio']) => Math.min(...[0, 1, 2].map((k) => (d.max[k] as number) - (d.min[k] as number))) / 2;

export function trabajoMalla(pet: PeticionMalla): ResultadoMalla {
  const t0 = performance.now();
  const campo = obtenerCampo(pet.campo);
  const p = Float64Array.from(pet.p);
  const malla = crearMalla(pet.dominio, pet.n, pet.posicion);
  const muestra = muestrearMalla(campo.F, p, malla);
  const escala = escalaDe(pet.escala, muestra.mag, muestra.clase);
  clasificarCeros(muestra, escala.ref);
  const lMax = 0.9 * malla.deltaRef;
  // «Glifos: rot F»: las flechas dibujan ∇×F con su propia C_ref (DESIGN §9.7).
  const rot = pet.glifos === 'rotacional' ? muestrearRotacional(campo, p, muestra.pos, muestra.clase, escalaLongitud(pet.dominio)) : null;
  const escalaGlifos = rot ? escalaDe(pet.escalaRot, rot.mag, rot.clase) : escala;
  if (rot) clasificarCeros(rot, escalaGlifos.ref);
  const opciones = { fRef: escalaGlifos.ref, modo: pet.flechas.modo, luminancia: pet.flechas.luminancia };
  const instancias = calcularFlechas(rot ? { total: muestra.total, pos: muestra.pos, F: rot.C, mag: rot.mag, clase: rot.clase } : muestra, { ...opciones, lMax });
  if (rot) instancias.anillos = anillosRotacional(instancias, lMax);
  const corte = pet.corte ? flechasCorte(campo, p, pet, opciones, !!rot) : null;
  return {
    total: muestra.total,
    n: pet.n,
    deltaRef: malla.deltaRef,
    pos: muestra.pos,
    F: muestra.F,
    mag: muestra.mag,
    clase: muestra.clase,
    recuento: muestra.recuento,
    escala,
    glifos: pet.glifos,
    escalaGlifos,
    rot,
    lMax,
    instancias,
    corte,
    ms: performance.now() - t0,
  };
}

/**
 * Flechas del corte en una rejilla N×N del plano, comparables con las del volumen (misma
 * F_ref o C_ref). Con «Glifos: rot F» dibujan ∇×F; «tangencial» anula la componente normal.
 */
function flechasCorte(
  campo: CampoCompilado,
  p: Float64Array,
  pet: PeticionMalla,
  opciones: { fRef: number; modo: PeticionMalla['flechas']['modo']; luminancia: PeticionMalla['flechas']['luminancia'] },
  conRot: boolean,
): FlechasCorte {
  const esp = pet.corte!;
  const { u, v, n } = EJES_PLANO[esp.plano];
  const N = Math.max(pet.n[u], pet.n[v]);
  const d = pet.dominio;
  const lado = (k: number) => (d.max[k] as number) - (d.min[k] as number);
  const L = escalaLongitud(d);
  const m = muestrearCorte(campo, p, { plano: esp.plano, c: esp.c, M: N, dominio: d, escalar: null }, L);
  let vector: Float64Array = m.F;
  let mag: Float64Array = m.mag;
  let clase: Uint8Array = m.clase;
  if (conRot) {
    const r = muestrearRotacional(campo, p, m.pos, m.clase, L);
    clasificarCeros(r, opciones.fRef);
    vector = r.C;
    mag = r.mag;
    clase = r.clase;
  }
  if (esp.vector === 'tangencial') {
    // Proyección tangencial exacta: n es un eje coordenado.
    vector = Float64Array.from(vector);
    mag = new Float64Array(m.total);
    for (let i = 0; i < m.total; i++) {
      vector[3 * i + n] = Number.isNaN(vector[3 * i + n] as number) ? NaN : 0;
      mag[i] = Math.hypot(vector[3 * i] as number, vector[3 * i + 1] as number, vector[3 * i + 2] as number);
    }
  }
  const deltaRef = Math.min(lado(u), lado(v)) / (N - 1);
  const lMax = 0.9 * deltaRef;
  const instancias = calcularFlechas({ total: m.total, pos: m.pos, F: vector, mag, clase }, { ...opciones, lMax });
  if (conRot) instancias.anillos = anillosRotacional(instancias, lMax);
  return { instancias, lMax, deltaRef, total: m.total };
}

export function trabajoCorte(pet: PeticionCorte): ResultadoCorte {
  const campo = obtenerCampo(pet.campo);
  const m = muestrearCorte(campo, Float64Array.from(pet.p), { plano: pet.plano, c: pet.c, M: pet.M, dominio: pet.dominio, escalar: pet.escalar }, pet.L);
  // |F| no tiene signo: sin curva de nivel cero (DESIGN §9.6).
  const e = m.escalar;
  const contorno =
    e && e.tipo !== 'magnitud'
      ? contornoCero({ plano: m.plano, c: m.c, dominio: pet.dominio, lado: e.lado, valores: e.valores, estado: e.estado }).segmentos
      : null;
  return { ...m, contorno, dominio: pet.dominio };
}

/** Lote de trabajo entre cesiones del turno (PLAN §1.6). */
export const LOTE_MS = 8;

/**
 * Líneas de corriente, troceadas: cada ≈ 8 ms, también dentro de una línea larga, cede el
 * turno (`ceder` devuelve true si el trabajo se ha cancelado) e informa del progreso.
 */
export async function trabajoLineas(
  pet: PeticionLineas,
  ceder: () => Promise<boolean>,
  progreso: (fraccion: number) => void,
): Promise<ResultadoLineas | null> {
  const t0 = performance.now();
  const campo = obtenerCampo(pet.campo);
  const p = Float64Array.from(pet.p);
  const o = opcionesPorDefecto(pet.dominio, pet.deltaRef, pet.fRef, pet.paso, pet.longitudMax);
  const sem = generarSemillas(pet.semillas, pet.dominio, campo.F, p, pet.fRef, { delta: pet.deltaRef, punto: pet.punto });
  const trozos: Float64Array[] = [];
  const inicio: number[] = [0];
  const semilla: number[] = [];
  const motivos: number[] = [];
  const longitudes: number[] = [];
  const recuentoMotivos: Partial<Record<MotivoParada, number>> = {};
  const contar = (m: MotivoParada | null) => {
    if (m) recuentoMotivos[m] = (recuentoMotivos[m] ?? 0) + 1;
  };
  let vertices = 0;
  let limiteVertices = false;
  let ultimoCeder = performance.now();
  /** Cede si el lote actual supera LOTE_MS; devuelve true si hay que abandonar. */
  const quizaCeder = async (fraccion: number) => {
    if (performance.now() - ultimoCeder <= LOTE_MS) return false;
    progreso(fraccion);
    if (await ceder()) return true;
    ultimoCeder = performance.now();
    return false;
  };
  for (let i = 0; i < sem.n; i++) {
    const s = [sem.puntos[3 * i] as number, sem.puntos[3 * i + 1] as number, sem.puntos[3 * i + 2] as number] as const;
    const g = lineaTroceada(campo.F, p, s, o);
    let paso = g.next();
    while (!paso.done) {
      if (await quizaCeder(i / sem.n)) return null;
      paso = g.next();
    }
    const l = paso.value;
    if (!('descartada' in l)) {
      if (vertices + l.n > VERTICES_MAX) {
        limiteVertices = true;
        break;
      }
      trozos.push(l.puntos);
      vertices += l.n;
      inicio.push(vertices);
      semilla.push(l.indiceSemilla);
      motivos.push(l.motivoAtras ? MOTIVOS.indexOf(l.motivoAtras) : 255, MOTIVOS.indexOf(l.motivoAdelante));
      longitudes.push(l.longitud);
      contar(l.motivoAtras);
      contar(l.motivoAdelante);
    }
    if (await quizaCeder((i + 1) / sem.n)) return null;
  }
  const posiciones = new Float32Array(3 * vertices);
  let o3 = 0;
  for (const t of trozos) {
    posiciones.set(t, o3);
    o3 += t.length;
  }
  const tInicio = Uint32Array.from(inicio);
  const tSemilla = Uint32Array.from(semilla);
  const tMotivos = Uint8Array.from(motivos);
  return {
    posiciones,
    inicio: tInicio,
    semilla: tSemilla,
    motivos: tMotivos,
    longitudes: Float32Array.from(longitudes),
    nLineas: semilla.length,
    // Cheurones de sentido cada 1.5 Δ de longitud de arco (DESIGN §9.4).
    geometria: geometriaLineas(posiciones, tInicio, tSemilla, tMotivos, semilla.length, 1.5 * pet.deltaRef),
    semillas: { n: sem.n, descartadas: sem.descartadas, recortadas: sem.recortadas },
    recuentoMotivos,
    limiteVertices,
    paso: o.paso,
    ms: performance.now() - t0,
  };
}

/** Cede el turno al bucle de eventos (para leer mensajes de cancelación). */
export function crearCeder(): () => Promise<void> {
  if (typeof MessageChannel === 'undefined') return () => new Promise((r) => setTimeout(r, 0));
  const canal = new MessageChannel();
  const pendientes: (() => void)[] = [];
  canal.port1.onmessage = () => pendientes.shift()?.();
  return () =>
    new Promise<void>((r) => {
      pendientes.push(r);
      canal.port2.postMessage(0);
    });
}
