/**
 * Acciones puras sobre el estado del experimento: cada una devuelve un estado nuevo (o el
 * mismo objeto si no cambia nada, para que el almacén no notifique en balde).
 */
import { campoPorId, type IdCampo } from '../math/catalog';
import { NOMBRES_RESERVADOS, nombreParametroValido } from '../math/expr/resolver';
import type { DeclParametro, Dominio, Vec3 } from '../math/tipos';
import { EXPERIMENTO_INICIAL, LIMITES, experimentoDesdeCatalogo, type EstadoExperimento } from './schema';

/** Elegir un campo del catálogo: cambia ecuaciones, parámetros, semillas y nombre; conserva dominio, capas y cámara (F1). */
export function seleccionarCampo(s: EstadoExperimento, id: IdCampo): EstadoExperimento {
  return experimentoDesdeCatalogo(id, s);
}

export function fijarParametro(s: EstadoExperimento, nombre: string, valor: number): EstadoExperimento {
  if (!s.parametros.some((p) => p.nombre === nombre && p.valor !== valor)) return s;
  return {
    ...s,
    parametros: s.parametros.map((p) => (p.nombre === nombre ? { ...p, valor } : p)),
  };
}

/** Nombre del experimento tras editar las ecuaciones (F2.3). */
export function nombrePersonalizado(base: IdCampo | null): string {
  return base ? `Personalizado (desde ${campoPorId(base).nombre})` : 'Personalizado';
}

/** Aplica ecuaciones nuevas (ya validadas): la tarjeta pasa a «modificado» y el nombre a «Personalizado…». */
export function aplicarEcuaciones(s: EstadoExperimento, campo: { P: string; Q: string; R: string }): EstadoExperimento {
  if (campo.P === s.campo.P && campo.Q === s.campo.Q && campo.R === s.campo.R) return s;
  return { ...s, campo: { P: campo.P, Q: campo.Q, R: campo.R }, modificado: true, nombre: nombrePersonalizado(s.base) };
}

/** Valores de un parámetro nuevo (D-32). */
export const PARAMETRO_NUEVO = { valor: 1, min: -5, max: 5, paso: 0.1 } as const;

/** ¿Se puede añadir un parámetro con este nombre? Devuelve el motivo si no. */
export function motivoNombreParametro(nombre: string, existentes: readonly DeclParametro[]): string | null {
  const n = nombre.trim();
  if (!n) return 'Escribe un nombre, por ejemplo k, a o omega';
  if (existentes.some((p) => p.nombre === n)) return `Ya existe un parámetro «${n}»`;
  if (NOMBRES_RESERVADOS.has(n)) {
    if (['x', 'y', 'z', 'r', 'rho'].includes(n)) return `«${n}» es una variable`;
    if (['pi', 'e'].includes(n)) return `«${n}» es una constante`;
    if (n === 't') return '«t» es la variable de tiempo';
    return `«${n}» es una función`;
  }
  if (!nombreParametroValido(n)) return 'Usa una letra seguida de letras, cifras o «_» (hasta 16)';
  if (existentes.length >= LIMITES.parametrosMax) return `Como máximo ${LIMITES.parametrosMax} parámetros`;
  return null;
}

export function anadirParametro(s: EstadoExperimento, nombre: string): EstadoExperimento {
  if (motivoNombreParametro(nombre, s.parametros)) return s;
  const p: DeclParametro = { nombre: nombre.trim(), ...PARAMETRO_NUEVO, porDefecto: PARAMETRO_NUEVO.valor };
  return { ...s, parametros: [...s.parametros, p] };
}

export function eliminarParametro(s: EstadoExperimento, nombre: string): EstadoExperimento {
  if (!s.parametros.some((p) => p.nombre === nombre)) return s;
  return { ...s, parametros: s.parametros.filter((p) => p.nombre !== nombre) };
}

/** Motivo por el que un rango o un paso no son válidos, o null. */
export function motivoRango(min: number, max: number, paso: number): string | null {
  if (!(min < max)) return 'El mínimo debe ser menor que el máximo';
  if (!(paso > 0)) return 'El paso debe ser positivo';
  if (paso > max - min) return 'El paso no puede superar la amplitud del rango';
  return null;
}

/** Cambia rango y paso; el valor y el valor por defecto se recortan al rango nuevo. */
export function fijarRangoParametro(s: EstadoExperimento, nombre: string, r: { min: number; max: number; paso: number }): EstadoExperimento {
  if (motivoRango(r.min, r.max, r.paso)) return s;
  const recortar = (v: number) => Math.min(r.max, Math.max(r.min, v));
  return {
    ...s,
    parametros: s.parametros.map((p) =>
      p.nombre === nombre ? { ...p, min: r.min, max: r.max, paso: r.paso, valor: recortar(p.valor), porDefecto: recortar(p.porDefecto) } : p,
    ),
  };
}

export function restablecerParametro(s: EstadoExperimento, nombre: string): EstadoExperimento {
  const p = s.parametros.find((q) => q.nombre === nombre);
  return p ? fijarParametro(s, nombre, p.porDefecto) : s;
}

/** Todos los parámetros a su valor por defecto (F8). */
export function restablecerParametros(s: EstadoExperimento): EstadoExperimento {
  if (s.parametros.every((p) => p.valor === p.porDefecto)) return s;
  return { ...s, parametros: s.parametros.map((p) => ({ ...p, valor: p.porDefecto })) };
}

/** Todo a los valores del ejemplo base (F8); sin ejemplo base, al experimento inicial. */
export function restablecerExperimento(s: EstadoExperimento): EstadoExperimento {
  return s.base ? experimentoDesdeCatalogo(s.base) : EXPERIMENTO_INICIAL;
}

/** Validación de un intervalo del dominio (F4.2). */
export function motivoIntervalo(min: number, max: number): string | null {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return 'Los límites deben ser números finitos';
  if (!(min < max)) return 'El mínimo debe ser menor que el máximo';
  const lado = max - min;
  if (lado < LIMITES.ladoMin) return `El lado debe medir al menos ${LIMITES.ladoMin}`;
  if (lado > LIMITES.ladoMax) return `El lado no puede superar ${LIMITES.ladoMax}`;
  return null;
}

const EJE_NORMAL = { XY: 2, XZ: 1, YZ: 0 } as const;

type Corte = EstadoExperimento['corte'];

/** Coordenada del corte dentro de Ω (eje normal al plano); fuera, a 0 si está dentro y si no al centro (F6.1). */
function cDentro(d: Dominio, plano: Corte['plano'], c: number): number {
  const k = EJE_NORMAL[plano];
  const lo = d.min[k] as number;
  const hi = d.max[k] as number;
  return c >= lo && c <= hi ? c : lo <= 0 && 0 <= hi ? 0 : (lo + hi) / 2;
}

/** Cambia el dominio (ya validado); el corte se recoloca dentro y el punto se descarta si queda fuera. */
export function fijarDominio(s: EstadoExperimento, d: Dominio): EstadoExperimento {
  if ([0, 1, 2].some((k) => motivoIntervalo(d.min[k] as number, d.max[k] as number))) return s;
  if ([0, 1, 2].every((k) => d.min[k] === s.dominio.min[k] && d.max[k] === s.dominio.max[k])) return s;
  const c = cDentro(d, s.corte.plano, s.corte.c);
  const dentro = (p: Vec3) => [0, 1, 2].every((i) => p[i] >= (d.min[i] as number) && p[i] <= (d.max[i] as number));
  return {
    ...s,
    dominio: d,
    corte: c === s.corte.c ? s.corte : { ...s.corte, c },
    punto: s.punto && !dentro(s.punto) ? null : s.punto,
  };
}

export function fijarMuestreo(s: EstadoExperimento, cambios: Partial<EstadoExperimento['muestreo']>): EstadoExperimento {
  const m = { ...s.muestreo, ...cambios };
  const n = m.n.map((v) => Math.round(Math.min(LIMITES.nMax, Math.max(LIMITES.nMin, v)))) as [number, number, number];
  const corteResolucion = Math.round(Math.min(LIMITES.corteMax, Math.max(LIMITES.corteMin, m.corteResolucion)));
  const nuevo = { ...m, n, corteResolucion };
  if (n.every((v, i) => v === s.muestreo.n[i]) && nuevo.posicion === s.muestreo.posicion && corteResolucion === s.muestreo.corteResolucion) return s;
  return { ...s, muestreo: nuevo };
}

export type Capa = 'flechas' | 'lineas' | 'particulas';

/** Activa o desactiva una capa (F5). */
export function fijarCapa(s: EstadoExperimento, capa: Capa, activa: boolean): EstadoExperimento {
  if (s.capas[capa] === activa) return s;
  return { ...s, capas: { ...s.capas, [capa]: activa } };
}

/** «Glifos: F · rot F»: excluyentes, para que la banda clara tenga un único significado (DESIGN §9.1). */
export function fijarGlifos(s: EstadoExperimento, glifos: EstadoExperimento['capas']['glifos']): EstadoExperimento {
  if (s.capas.glifos === glifos) return s;
  return { ...s, capas: { ...s.capas, glifos } };
}

type OpcionesFlechas = EstadoExperimento['flechas'];

/** Opciones de magnitud de las flechas (REN-04, DESIGN §9.3 y §9.10). */
export function fijarOpcionesFlechas(s: EstadoExperimento, cambios: Partial<OpcionesFlechas>): EstadoExperimento {
  const f = { ...s.flechas, ...cambios };
  for (const e of [f.escala, f.escalaRot]) if (e.tipo === 'fija' && !(e.valor > 0 && Number.isFinite(e.valor))) return s;
  if (JSON.stringify(f) === JSON.stringify(s.flechas)) return s;
  return { ...s, flechas: f };
}

/** Cambia el corte (F6): al activarlo o cambiar de plano, la posición queda dentro de Ω. */
export function fijarCorte(s: EstadoExperimento, cambios: Partial<Corte>): EstadoExperimento {
  const nuevo = { ...s.corte, ...cambios };
  nuevo.c = cDentro(s.dominio, nuevo.plano, nuevo.c);
  if (nuevo.escala.tipo === 'fija' && !(nuevo.escala.valor > 0 && Number.isFinite(nuevo.escala.valor))) return s;
  // Otro escalar, otras unidades: una V_ref fijada deja de tener sentido.
  if (cambios.escalar !== undefined && cambios.escalar !== s.corte.escalar && !cambios.escala) nuevo.escala = { tipo: 'auto' };
  if (JSON.stringify(nuevo) === JSON.stringify(s.corte)) return s;
  return { ...s, corte: nuevo };
}

type OpcionesLineas = EstadoExperimento['lineas'];

/** Motivo por el que unas semillas no son válidas (SPEC §5.6: como mucho 256), o null. */
export function motivoSemillas(e: OpcionesLineas['semillas']): string | null {
  if (e.tipo === 'rejilla') {
    if (![e.nu, e.nv].every((n) => Number.isInteger(n) && n >= 1)) return 'La rejilla necesita al menos 1 × 1 puntos';
    if (e.nu * e.nv > LIMITES.semillasMax) return `Como máximo ${LIMITES.semillasMax} semillas (${e.nu} × ${e.nv} = ${e.nu * e.nv})`;
    if (!Number.isFinite(e.c)) return 'La posición del plano debe ser un número';
  } else if (e.tipo === 'aleatoria') {
    if (!Number.isInteger(e.n) || e.n < 1 || e.n > LIMITES.semillasMax) return `Entre 1 y ${LIMITES.semillasMax} semillas`;
    if (!Number.isInteger(e.semilla) || e.semilla < 0) return 'La semilla es un entero ≥ 0';
  }
  return null;
}

/** Semillas, paso y longitud máxima de las líneas (UI-08, F5). Un valor inválido no se aplica. */
export function fijarLineas(s: EstadoExperimento, cambios: Partial<OpcionesLineas>): EstadoExperimento {
  const l = { ...s.lineas, ...cambios };
  if (motivoSemillas(l.semillas)) return s;
  if (l.paso !== null && !(l.paso > 0 && Number.isFinite(l.paso))) return s;
  if (l.longitudMax !== null && !(l.longitudMax > 0 && Number.isFinite(l.longitudMax))) return s;
  if (JSON.stringify(l) === JSON.stringify(s.lineas)) return s;
  return { ...s, lineas: l };
}

/** Partículas: número (1–2000), escala temporal τ (null = Δ/F_ref) y semilla (REN-08). */
export function fijarParticulas(s: EstadoExperimento, cambios: Partial<EstadoExperimento['particulas']>): EstadoExperimento {
  const p = { ...s.particulas, ...cambios };
  if (!Number.isInteger(p.n) || p.n < 1 || p.n > LIMITES.particulasMax) return s;
  if (p.tau !== null && !(p.tau > 0 && Number.isFinite(p.tau))) return s;
  if (!Number.isInteger(p.semilla) || p.semilla < 0) return s;
  if (JSON.stringify(p) === JSON.stringify(s.particulas)) return s;
  return { ...s, particulas: p };
}

/** Cifras significativas de los valores mostrados (2–8). */
export function fijarCifras(s: EstadoExperimento, cifras: number): EstadoExperimento {
  const c = Math.round(cifras);
  if (!(c >= 2 && c <= 8) || c === s.cifras) return s;
  return { ...s, cifras: c };
}

/** Punto inspeccionado P (INS-01): dentro de Ω, o null para cerrar el inspector. */
export function fijarPunto(s: EstadoExperimento, p: Vec3 | null): EstadoExperimento {
  if (p === null) return s.punto === null ? s : { ...s, punto: null };
  const dentro = [0, 1, 2].every((k) => Number.isFinite(p[k]) && (p[k] as number) >= (s.dominio.min[k] as number) - 1e-12 && (p[k] as number) <= (s.dominio.max[k] as number) + 1e-12);
  if (!dentro) return s;
  if (s.punto && s.punto.every((v, k) => v === p[k])) return s;
  return { ...s, punto: [p[0], p[1], p[2]] };
}

/** P desplazado `pasos` celdas Δ en el eje `k`, sin salir de Ω (Alt + flechas, F7.3). */
export function moverPunto(s: EstadoExperimento, k: 0 | 1 | 2, delta: number): EstadoExperimento {
  const base: Vec3 = s.punto ?? (centroDominio(s.dominio) as Vec3);
  const q: [number, number, number] = [base[0], base[1], base[2]];
  q[k] = Math.min(s.dominio.max[k] as number, Math.max(s.dominio.min[k] as number, Number((q[k] + delta).toPrecision(12))));
  return fijarPunto(s, q);
}

/** Centro de Ω, o el origen si está dentro (punto de partida del inspector por teclado). */
export function centroDominio(d: Dominio): Vec3 {
  const dentro = [0, 1, 2].every((k) => (d.min[k] as number) <= 0 && 0 <= (d.max[k] as number));
  return dentro ? [0, 0, 0] : ([0, 1, 2].map((k) => ((d.min[k] as number) + (d.max[k] as number)) / 2) as unknown as Vec3);
}
