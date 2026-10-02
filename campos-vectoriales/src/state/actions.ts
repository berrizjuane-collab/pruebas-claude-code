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
    if (n === 't') return '«t» está reservada para los campos dependientes del tiempo';
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

/** Cambia el dominio (ya validado); el corte se recoloca dentro y el punto se descarta si queda fuera. */
export function fijarDominio(s: EstadoExperimento, d: Dominio): EstadoExperimento {
  if ([0, 1, 2].some((k) => motivoIntervalo(d.min[k] as number, d.max[k] as number))) return s;
  if ([0, 1, 2].every((k) => d.min[k] === s.dominio.min[k] && d.max[k] === s.dominio.max[k])) return s;
  const k = EJE_NORMAL[s.corte.plano];
  const lo = d.min[k] as number;
  const hi = d.max[k] as number;
  const c = s.corte.c < lo || s.corte.c > hi ? (lo + hi) / 2 : s.corte.c;
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
