/**
 * Configuración JSON v1 (EXP-01, SPEC §7.2) y autoguardado (EXP-02).
 *
 * - `aConfiguracion` convierte el estado en el documento v1 (con `formato` y `version`).
 * - `importarConfiguracion` valida **antes** de tocar el estado: tipos, rangos y longitudes,
 *   con los errores listados por ruta («dominio.min[2] debe ser menor que dominio.max[2]»).
 *   Las expresiones pasan por el mismo analizador que el editor. Versión posterior → error;
 *   anterior → migraciones; claves desconocidas → se ignoran con aviso; claves ausentes →
 *   el valor por defecto del ejemplo base, con aviso (D-49).
 * - El autoguardado usa `localStorage` siempre dentro de `try/catch`: si el almacenamiento
 *   está bloqueado, la aplicación funciona igual y no muestra errores técnicos.
 */
import { CATALOGO, campoPorId, type IdCampo } from '../math/catalog';
import { compilarCampo } from '../math/field';
import { LIMITES_EXPRESION } from '../math/expr/errores';
import type { DeclParametro, Dominio, EspecSemillas, Plano, Vec3 } from '../math/tipos';
import { motivoIntervalo, motivoNombreParametro, motivoRango, motivoSemillas } from './actions';
import { LIMITES, experimentoDesdeCatalogo, type EstadoExperimento } from './schema';

export const FORMATO = 'campos-vectoriales';
export const VERSION = 1;
/** Tamaño máximo del archivo importado (SPEC §7.2). */
export const TAMANO_MAX = 256 * 1024;
export const LONGITUD_NOMBRE = 80;

export interface ConfiguracionV1 {
  formato: typeof FORMATO;
  version: typeof VERSION;
  nombre: string;
  campo: { P: string; Q: string; R: string; base: IdCampo | null; modificado: boolean };
  parametros: DeclParametro[];
  dominio: Dominio;
  muestreo: EstadoExperimento['muestreo'];
  capas: EstadoExperimento['capas'];
  flechas: EstadoExperimento['flechas'];
  lineas: EstadoExperimento['lineas'];
  particulas: EstadoExperimento['particulas'];
  corte: EstadoExperimento['corte'];
  camara: EstadoExperimento['camara'];
  punto: Vec3 | null;
  cifras: number;
}

/** Documento v1 del estado (el orden de las claves sigue SPEC §7.2). */
export function aConfiguracion(s: EstadoExperimento): ConfiguracionV1 {
  return {
    formato: FORMATO,
    version: VERSION,
    nombre: s.nombre,
    campo: { P: s.campo.P, Q: s.campo.Q, R: s.campo.R, base: s.base, modificado: s.modificado },
    parametros: s.parametros.map((p) => ({ ...p })),
    dominio: s.dominio,
    muestreo: s.muestreo,
    capas: s.capas,
    flechas: s.flechas,
    lineas: s.lineas,
    particulas: s.particulas,
    corte: s.corte,
    camara: s.camara,
    punto: s.punto,
    cifras: s.cifras,
  };
}

export const serializar = (s: EstadoExperimento): string => `${JSON.stringify(aConfiguracion(s), null, 2)}\n`;

// ---------------------------------------------------------------- importación

export interface ErrorImportacion {
  /** Ruta del dato («dominio.min[2]»), o «archivo» para errores del documento entero. */
  ruta: string;
  mensaje: string;
}

export type ResultadoImportacion = { ok: true; estado: EstadoExperimento; avisos: string[] } | { ok: false; errores: ErrorImportacion[] };

/** Migraciones de versiones anteriores: de la versión k a la k + 1. Aún no hay ninguna (v1 es la primera). */
export type Migraciones = Readonly<Record<number, (o: Record<string, unknown>) => Record<string, unknown>>>;
export const MIGRACIONES: Migraciones = {};

type Obj = Record<string, unknown>;
const esObjeto = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const esFinito = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const esEntero = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const describir = (v: unknown) => (v === null ? 'null' : Array.isArray(v) ? 'una lista' : typeof v === 'string' ? 'un texto' : typeof v === 'number' ? 'un número' : typeof v === 'boolean' ? 'un booleano' : 'un objeto');
const lista = (opciones: readonly string[]) => opciones.map((o) => `«${o}»`).join(', ');

/** Validador con ruta: acumula errores y avisos y devuelve el valor validado (o el de reserva). */
class Validador {
  readonly errores: ErrorImportacion[] = [];
  readonly avisos: string[] = [];

  error(ruta: string, mensaje: string): void {
    this.errores.push({ ruta, mensaje });
  }

  /** Claves desconocidas: se ignoran con aviso. */
  claves(o: Obj, ruta: string, conocidas: readonly string[]): void {
    for (const k of Object.keys(o)) if (!conocidas.includes(k)) this.avisos.push(`Se ignora la clave desconocida «${ruta ? `${ruta}.` : ''}${k}»`);
  }

  /** Lee `o[k]`; si falta, avisa y devuelve `porDefecto` (undefined si es obligatoria: error). */
  leer(o: Obj, k: string, ruta: string, porDefecto?: unknown): unknown {
    if (k in o) return o[k];
    if (porDefecto === undefined) this.error(ruta, 'falta este dato');
    else this.avisos.push(`Falta «${ruta}»: se usa el valor por defecto`);
    return porDefecto;
  }

  objeto(v: unknown, ruta: string): Obj | null {
    if (esObjeto(v)) return v;
    this.error(ruta, `debe ser un objeto (es ${describir(v)})`);
    return null;
  }

  numero(v: unknown, ruta: string, rango?: { min?: number; max?: number; entero?: boolean; positivo?: boolean }): number | null {
    if (!esFinito(v)) {
      this.error(ruta, `debe ser un número finito (es ${describir(v)})`);
      return null;
    }
    if (rango?.entero && !Number.isInteger(v)) return this.error(ruta, 'debe ser un número entero'), null;
    if (rango?.positivo && !(v > 0)) return this.error(ruta, 'debe ser positivo'), null;
    if (rango?.min !== undefined && v < rango.min) return this.error(ruta, `debe ser ≥ ${rango.min} (es ${v})`), null;
    if (rango?.max !== undefined && v > rango.max) return this.error(ruta, `debe ser ≤ ${rango.max} (es ${v})`), null;
    return v;
  }

  texto(v: unknown, ruta: string, max: number): string | null {
    if (typeof v !== 'string') return this.error(ruta, `debe ser un texto (es ${describir(v)})`), null;
    if (v.length > max) return this.error(ruta, `tiene ${v.length} caracteres; el máximo es ${max}`), null;
    return v;
  }

  booleano(v: unknown, ruta: string): boolean | null {
    if (typeof v === 'boolean') return v;
    this.error(ruta, `debe ser true o false (es ${describir(v)})`);
    return null;
  }

  opcion<T extends string>(v: unknown, ruta: string, opciones: readonly T[]): T | null {
    if (typeof v === 'string' && (opciones as readonly string[]).includes(v)) return v as T;
    this.error(ruta, `debe ser ${lista(opciones)}`);
    return null;
  }

  vec3(v: unknown, ruta: string): Vec3 | null {
    if (!Array.isArray(v) || v.length !== 3) return this.error(ruta, 'debe ser una lista de 3 números'), null;
    const r = v.map((c, k) => this.numero(c, `${ruta}[${k}]`));
    return r.every((c) => c !== null) ? ([r[0], r[1], r[2]] as unknown as Vec3) : null;
  }

  intervalo2(v: unknown, ruta: string): readonly [number, number] | null {
    if (!Array.isArray(v) || v.length !== 2) return this.error(ruta, 'debe ser una lista de 2 números'), null;
    const a = this.numero(v[0], `${ruta}[0]`);
    const b = this.numero(v[1], `${ruta}[1]`);
    if (a === null || b === null) return null;
    if (a > b) return this.error(ruta, `${ruta}[0] debe ser ≤ ${ruta}[1]`), null;
    return [a, b];
  }

  /** Escala: { tipo: 'auto' } o { tipo: 'fija', valor > 0[, delta > 0] }. */
  escala(v: unknown, ruta: string, conDelta: boolean): { tipo: 'auto' } | { tipo: 'fija'; valor: number; delta?: number } | null {
    const o = this.objeto(v, ruta);
    if (!o) return null;
    const tipo = this.opcion(o.tipo, `${ruta}.tipo`, ['auto', 'fija'] as const);
    if (tipo === 'auto') {
      this.claves(o, ruta, ['tipo']);
      return { tipo: 'auto' };
    }
    if (tipo !== 'fija') return null;
    this.claves(o, ruta, conDelta ? ['tipo', 'valor', 'delta'] : ['tipo', 'valor']);
    const valor = this.numero(o.valor, `${ruta}.valor`, { positivo: true });
    if (valor === null) return null;
    if (conDelta && 'delta' in o) {
      const delta = this.numero(o.delta, `${ruta}.delta`, { positivo: true });
      return delta === null ? null : { tipo: 'fija', valor, delta };
    }
    return { tipo: 'fija', valor };
  }
}

const IDS_CATALOGO = CATALOGO.map((c) => c.id);
const PLANOS: readonly Plano[] = ['XY', 'XZ', 'YZ'];
const CLAVES_RAIZ = ['formato', 'version', 'nombre', 'campo', 'parametros', 'dominio', 'muestreo', 'capas', 'flechas', 'lineas', 'particulas', 'corte', 'camara', 'punto', 'cifras'] as const;

/**
 * Valida un documento de configuración y devuelve el estado que describe, sin efectos.
 * `texto` es el contenido del archivo; `bytes`, su tamaño (si se conoce).
 */
export function importarConfiguracion(texto: string, bytes = new TextEncoder().encode(texto).length): ResultadoImportacion {
  if (bytes > TAMANO_MAX) {
    return { ok: false, errores: [{ ruta: 'archivo', mensaje: `ocupa ${Math.ceil(bytes / 1024)} KB; el máximo es ${TAMANO_MAX / 1024} KB` }] };
  }
  let crudo: unknown;
  try {
    crudo = JSON.parse(texto);
  } catch (e) {
    const posicion = e instanceof SyntaxError ? /position (\d+)/.exec(e.message)?.[1] : undefined;
    return { ok: false, errores: [{ ruta: 'archivo', mensaje: `no es JSON válido${posicion !== undefined ? ` (cerca del carácter ${Number(posicion) + 1})` : ''}` }] };
  }
  if (!esObjeto(crudo)) return { ok: false, errores: [{ ruta: 'archivo', mensaje: 'debe contener un objeto JSON' }] };
  if (crudo.formato !== FORMATO) {
    return { ok: false, errores: [{ ruta: 'formato', mensaje: `debe ser «${FORMATO}»; este archivo no es una configuración de esta aplicación` }] };
  }
  if (!esEntero(crudo.version) || crudo.version < 1) {
    return { ok: false, errores: [{ ruta: 'version', mensaje: 'debe ser un número entero ≥ 1' }] };
  }
  if (crudo.version > VERSION) {
    return {
      ok: false,
      errores: [{ ruta: 'version', mensaje: `el archivo es de la versión ${crudo.version}, posterior a la que entiende esta aplicación (${VERSION}). Ábrelo con una versión más reciente` }],
    };
  }
  const m = migrar(crudo, crudo.version, VERSION, MIGRACIONES);
  if (!m.ok) return { ok: false, errores: [{ ruta: 'version', mensaje: m.error }] };
  const val = new Validador();
  val.avisos.push(...m.avisos);
  const estado = validarDocumento(m.doc, val);
  if (val.errores.length || !estado) return { ok: false, errores: val.errores };
  return { ok: true, estado, avisos: val.avisos };
}

/** Aplica las migraciones de `desde` a `hasta`, una versión cada vez. */
export function migrar(doc: Obj, desde: number, hasta: number, migraciones: Migraciones): { ok: true; doc: Obj; avisos: string[] } | { ok: false; error: string } {
  const avisos: string[] = [];
  for (let v = desde; v < hasta; v++) {
    const paso = migraciones[v];
    if (!paso) return { ok: false, error: `no se sabe convertir la versión ${v} a la ${v + 1}` };
    doc = { ...paso(doc), version: v + 1 };
    avisos.push(`Convertido de la versión ${v} a la ${v + 1}`);
  }
  return { ok: true, doc, avisos };
}

function validarDocumento(d: Obj, val: Validador): EstadoExperimento | null {
  val.claves(d, '', CLAVES_RAIZ);

  // campo (obligatorio): las expresiones fijan el resto, empezando por el ejemplo base.
  const campo = val.objeto(val.leer(d, 'campo', 'campo'), 'campo');
  let base: IdCampo | null = null;
  const exprs = { P: '', Q: '', R: '' };
  let modificadoLeido: boolean | null = null;
  if (campo) {
    val.claves(campo, 'campo', ['P', 'Q', 'R', 'base', 'modificado']);
    for (const c of ['P', 'Q', 'R'] as const) exprs[c] = val.texto(val.leer(campo, c, `campo.${c}`), `campo.${c}`, LIMITES_EXPRESION.caracteres) ?? '';
    const b = 'base' in campo ? campo.base : null;
    if (b !== null) base = val.opcion(b, 'campo.base', IDS_CATALOGO);
    if ('modificado' in campo) modificadoLeido = val.booleano(campo.modificado, 'campo.modificado');
  }
  const def = experimentoDesdeCatalogo(base ?? 'helicoidal');

  const nombre = val.texto(val.leer(d, 'nombre', 'nombre', base ? def.nombre : 'Personalizado'), 'nombre', LONGITUD_NOMBRE);
  if (nombre !== null && !nombre.trim()) val.error('nombre', 'no puede estar vacío');

  const parametros = validarParametros(val.leer(d, 'parametros', 'parametros', base ? def.parametros : []), val);
  // Las expresiones se analizan con los parámetros declarados (mismo analizador que el editor).
  if (campo && parametros && ['P', 'Q', 'R'].every((c) => !val.errores.some((e) => e.ruta === `campo.${c}`))) {
    const r = compilarCampo(exprs, parametros.map((p) => p.nombre));
    if (!r.ok) for (const [c, e] of Object.entries(r.errores)) if (e) val.error(`campo.${c}`, `${e.mensaje} (posición ${e.ini + 1})`);
  }

  const dominio = validarDominio(val.leer(d, 'dominio', 'dominio', def.dominio), val);
  const muestreo = validarMuestreo(val.leer(d, 'muestreo', 'muestreo', def.muestreo), val);
  const capas = validarCapas(val.leer(d, 'capas', 'capas', def.capas), val);
  const flechas = validarFlechas(val.leer(d, 'flechas', 'flechas', def.flechas), val);
  const lineas = validarLineas(val.leer(d, 'lineas', 'lineas', def.lineas), val);
  const particulas = validarParticulas(val.leer(d, 'particulas', 'particulas', def.particulas), val);
  const corte = validarCorte(val.leer(d, 'corte', 'corte', def.corte), dominio, val);
  const camara = validarCamara(val.leer(d, 'camara', 'camara', null), val);
  const punto = validarPunto(val.leer(d, 'punto', 'punto', null), dominio, val);
  const cifras = val.numero(val.leer(d, 'cifras', 'cifras', def.cifras), 'cifras', { entero: true, min: 2, max: 8 });

  if (val.errores.length) return null;
  const catalogo = base ? campoPorId(base).expresiones : null;
  const modificado = modificadoLeido ?? (catalogo ? catalogo.P !== exprs.P || catalogo.Q !== exprs.Q || catalogo.R !== exprs.R : false);
  return {
    nombre: nombre!,
    base,
    modificado,
    campo: exprs,
    parametros: parametros!,
    dominio: dominio!,
    muestreo: muestreo!,
    capas: capas!,
    flechas: flechas!,
    lineas: lineas!,
    particulas: particulas!,
    corte: corte!,
    camara: camara === undefined ? null : camara,
    punto: punto === undefined ? null : punto,
    cifras: cifras!,
  };
}

function validarParametros(v: unknown, val: Validador): DeclParametro[] | null {
  if (!Array.isArray(v)) return val.error('parametros', `debe ser una lista (es ${describir(v)})`), null;
  if (v.length > LIMITES.parametrosMax) return val.error('parametros', `como máximo ${LIMITES.parametrosMax} parámetros (hay ${v.length})`), null;
  const r: DeclParametro[] = [];
  let ok = true;
  v.forEach((p, i) => {
    const ruta = `parametros[${i}]`;
    const o = val.objeto(p, ruta);
    if (!o) return void (ok = false);
    val.claves(o, ruta, ['nombre', 'valor', 'min', 'max', 'paso', 'porDefecto']);
    const nombre = val.texto(val.leer(o, 'nombre', `${ruta}.nombre`), `${ruta}.nombre`, 16)?.trim() ?? null;
    const [valor, min, max, paso] = (['valor', 'min', 'max', 'paso'] as const).map((k) => val.numero(val.leer(o, k, `${ruta}.${k}`), `${ruta}.${k}`));
    const porDefecto = 'porDefecto' in o ? val.numero(o.porDefecto, `${ruta}.porDefecto`) : valor;
    if (nombre === null || valor == null || min == null || max == null || paso == null || porDefecto == null) return void (ok = false);
    const motivoNombre = motivoNombreParametro(nombre, r);
    if (motivoNombre) return void (val.error(`${ruta}.nombre`, motivoNombre), (ok = false));
    const motivo = motivoRango(min, max, paso);
    if (motivo) return void (val.error(ruta, motivo), (ok = false));
    if (valor < min || valor > max) return void (val.error(`${ruta}.valor`, `debe estar entre min (${min}) y max (${max})`), (ok = false));
    if (porDefecto < min || porDefecto > max) return void (val.error(`${ruta}.porDefecto`, `debe estar entre min (${min}) y max (${max})`), (ok = false));
    r.push({ nombre, valor, min, max, paso, porDefecto });
  });
  return ok ? r : null;
}

function validarDominio(v: unknown, val: Validador): Dominio | null {
  const o = val.objeto(v, 'dominio');
  if (!o) return null;
  val.claves(o, 'dominio', ['min', 'max']);
  const min = val.vec3(val.leer(o, 'min', 'dominio.min'), 'dominio.min');
  const max = val.vec3(val.leer(o, 'max', 'dominio.max'), 'dominio.max');
  if (!min || !max) return null;
  let ok = true;
  for (let k = 0; k < 3; k++) {
    const motivo = motivoIntervalo(min[k], max[k]);
    if (!motivo) continue;
    ok = false;
    val.error(`dominio.min[${k}]`, min[k] < max[k] ? `${motivo} (eje ${'xyz'[k]})` : `debe ser menor que dominio.max[${k}]`);
  }
  return ok ? { min, max } : null;
}

function validarMuestreo(v: unknown, val: Validador): EstadoExperimento['muestreo'] | null {
  const o = val.objeto(v, 'muestreo');
  if (!o) return null;
  val.claves(o, 'muestreo', ['n', 'posicion', 'corteResolucion']);
  const nv = val.leer(o, 'n', 'muestreo.n');
  let n: [number, number, number] | null = null;
  if (!Array.isArray(nv) || nv.length !== 3) val.error('muestreo.n', 'debe ser una lista de 3 enteros');
  else {
    const r = nv.map((c, k) => val.numero(c, `muestreo.n[${k}]`, { entero: true, min: LIMITES.nMin, max: LIMITES.nMax }));
    if (r.every((c) => c !== null)) n = r as [number, number, number];
  }
  const posicion = val.opcion(val.leer(o, 'posicion', 'muestreo.posicion', 'nodos'), 'muestreo.posicion', ['nodos', 'centros'] as const);
  const corteResolucion = val.numero(val.leer(o, 'corteResolucion', 'muestreo.corteResolucion', 21), 'muestreo.corteResolucion', {
    entero: true,
    min: LIMITES.corteMin,
    max: LIMITES.corteMax,
  });
  return n && posicion && corteResolucion !== null ? { n, posicion, corteResolucion } : null;
}

function validarCapas(v: unknown, val: Validador): EstadoExperimento['capas'] | null {
  const o = val.objeto(v, 'capas');
  if (!o) return null;
  val.claves(o, 'capas', ['flechas', 'lineas', 'particulas', 'glifos']);
  const [flechas, lineas, particulas] = (['flechas', 'lineas', 'particulas'] as const).map((k) => val.booleano(val.leer(o, k, `capas.${k}`), `capas.${k}`));
  const glifos = val.opcion(val.leer(o, 'glifos', 'capas.glifos', 'campo'), 'capas.glifos', ['campo', 'rotacional'] as const);
  return flechas !== null && lineas !== null && particulas !== null && glifos ? { flechas, lineas, particulas, glifos } : null;
}

function validarFlechas(v: unknown, val: Validador): EstadoExperimento['flechas'] | null {
  const o = val.objeto(v, 'flechas');
  if (!o) return null;
  val.claves(o, 'flechas', ['modo', 'escala', 'escalaRot', 'luminancia']);
  const modo = val.opcion(val.leer(o, 'modo', 'flechas.modo'), 'flechas.modo', ['proporcional', 'normalizado'] as const);
  const escala = val.escala(val.leer(o, 'escala', 'flechas.escala', { tipo: 'auto' }), 'flechas.escala', true);
  const escalaRot = val.escala(val.leer(o, 'escalaRot', 'flechas.escalaRot', { tipo: 'auto' }), 'flechas.escalaRot', true);
  const luminancia = val.opcion(val.leer(o, 'luminancia', 'flechas.luminancia', 'lineal'), 'flechas.luminancia', ['lineal', 'log'] as const);
  return modo && escala && escalaRot && luminancia ? { modo, escala, escalaRot, luminancia } : null;
}

function validarSemillas(v: unknown, val: Validador): EspecSemillas | null {
  const ruta = 'lineas.semillas';
  const o = val.objeto(v, ruta);
  if (!o) return null;
  const tipo = val.opcion(o.tipo, `${ruta}.tipo`, ['rejilla', 'aleatoria', 'punto'] as const);
  let e: EspecSemillas | null = null;
  if (tipo === 'punto') {
    val.claves(o, ruta, ['tipo']);
    e = { tipo: 'punto' };
  } else if (tipo === 'aleatoria') {
    val.claves(o, ruta, ['tipo', 'n', 'semilla']);
    const n = val.numero(val.leer(o, 'n', `${ruta}.n`), `${ruta}.n`, { entero: true, min: 1, max: LIMITES.semillasMax });
    const semilla = val.numero(val.leer(o, 'semilla', `${ruta}.semilla`), `${ruta}.semilla`, { entero: true, min: 0 });
    if (n !== null && semilla !== null) e = { tipo: 'aleatoria', n, semilla };
  } else if (tipo === 'rejilla') {
    val.claves(o, ruta, ['tipo', 'plano', 'c', 'u', 'v', 'nu', 'nv']);
    const plano = val.opcion(val.leer(o, 'plano', `${ruta}.plano`), `${ruta}.plano`, PLANOS);
    const c = val.numero(val.leer(o, 'c', `${ruta}.c`), `${ruta}.c`);
    const u = 'u' in o ? val.intervalo2(o.u, `${ruta}.u`) : undefined;
    const vv = 'v' in o ? val.intervalo2(o.v, `${ruta}.v`) : undefined;
    const nu = val.numero(val.leer(o, 'nu', `${ruta}.nu`), `${ruta}.nu`, { entero: true, min: 1 });
    const nv = val.numero(val.leer(o, 'nv', `${ruta}.nv`), `${ruta}.nv`, { entero: true, min: 1 });
    if (plano && c !== null && u !== null && vv !== null && nu !== null && nv !== null) {
      e = { tipo: 'rejilla', plano, c, nu, nv, ...(u ? { u } : {}), ...(vv ? { v: vv } : {}) };
    }
  }
  if (!e) return null;
  const motivo = motivoSemillas(e);
  if (motivo) return val.error(ruta, motivo), null;
  return e;
}

function validarLineas(v: unknown, val: Validador): EstadoExperimento['lineas'] | null {
  const o = val.objeto(v, 'lineas');
  if (!o) return null;
  val.claves(o, 'lineas', ['semillas', 'paso', 'longitudMax']);
  const semillas = validarSemillas(val.leer(o, 'semillas', 'lineas.semillas'), val);
  const opcional = (k: 'paso' | 'longitudMax') => {
    const x = val.leer(o, k, `lineas.${k}`, null);
    return x === null ? null : val.numero(x, `lineas.${k}`, { positivo: true });
  };
  const paso = opcional('paso');
  const longitudMax = opcional('longitudMax');
  const fallo = (k: string) => val.errores.some((e) => e.ruta === `lineas.${k}`);
  return semillas && !fallo('paso') && !fallo('longitudMax') ? { semillas, paso, longitudMax } : null;
}

function validarParticulas(v: unknown, val: Validador): EstadoExperimento['particulas'] | null {
  const o = val.objeto(v, 'particulas');
  if (!o) return null;
  val.claves(o, 'particulas', ['n', 'tau', 'semilla']);
  const n = val.numero(val.leer(o, 'n', 'particulas.n'), 'particulas.n', { entero: true, min: 1, max: LIMITES.particulasMax });
  const t = val.leer(o, 'tau', 'particulas.tau', null);
  const tau = t === null ? null : val.numero(t, 'particulas.tau', { positivo: true });
  const semilla = val.numero(val.leer(o, 'semilla', 'particulas.semilla', 1), 'particulas.semilla', { entero: true, min: 0 });
  return n !== null && (t === null || tau !== null) && semilla !== null ? { n, tau, semilla } : null;
}

function validarCorte(v: unknown, dominio: Dominio | null, val: Validador): EstadoExperimento['corte'] | null {
  const o = val.objeto(v, 'corte');
  if (!o) return null;
  val.claves(o, 'corte', ['activo', 'plano', 'c', 'flechas', 'vector', 'escalar', 'escala']);
  const activo = val.booleano(val.leer(o, 'activo', 'corte.activo'), 'corte.activo');
  const plano = val.opcion(val.leer(o, 'plano', 'corte.plano'), 'corte.plano', PLANOS);
  let c = val.numero(val.leer(o, 'c', 'corte.c'), 'corte.c');
  if (c !== null && plano && dominio) {
    const k = { XY: 2, XZ: 1, YZ: 0 }[plano];
    const [lo, hi] = [dominio.min[k], dominio.max[k]];
    if (c < lo || c > hi) {
      val.error('corte.c', `debe estar dentro del dominio en ${'xyz'[k]}: [${lo}, ${hi}] (es ${c})`);
      c = null;
    }
  }
  const flechas = val.opcion(val.leer(o, 'flechas', 'corte.flechas', 'todas'), 'corte.flechas', ['todas', 'corte'] as const);
  const vector = val.opcion(val.leer(o, 'vector', 'corte.vector', 'completo'), 'corte.vector', ['completo', 'tangencial'] as const);
  const escalar = val.opcion(val.leer(o, 'escalar', 'corte.escalar', 'ninguno'), 'corte.escalar', ['ninguno', 'magnitud', 'divergencia', 'rotacional', 'normal'] as const);
  const e = val.escala(val.leer(o, 'escala', 'corte.escala', { tipo: 'auto' }), 'corte.escala', false);
  const escala = e && (e.tipo === 'auto' ? e : { tipo: 'fija' as const, valor: e.valor });
  return activo !== null && plano && c !== null && flechas && vector && escalar && escala ? { activo, plano, c, flechas, vector, escalar, escala } : null;
}

function validarCamara(v: unknown, val: Validador): EstadoExperimento['camara'] | undefined {
  if (v === null) return null;
  const o = val.objeto(v, 'camara');
  if (!o) return undefined;
  val.claves(o, 'camara', ['tipo', 'posicion', 'objetivo']);
  const tipo = val.opcion(val.leer(o, 'tipo', 'camara.tipo', 'perspectiva'), 'camara.tipo', ['perspectiva', 'ortografica'] as const);
  const posicion = val.vec3(val.leer(o, 'posicion', 'camara.posicion'), 'camara.posicion');
  const objetivo = val.vec3(val.leer(o, 'objetivo', 'camara.objetivo'), 'camara.objetivo');
  if (!tipo || !posicion || !objetivo) return undefined;
  if (Math.hypot(posicion[0] - objetivo[0], posicion[1] - objetivo[1], posicion[2] - objetivo[2]) < 1e-9) {
    val.error('camara.posicion', 'no puede coincidir con camara.objetivo');
    return undefined;
  }
  return { tipo, posicion, objetivo };
}

function validarPunto(v: unknown, dominio: Dominio | null, val: Validador): Vec3 | null | undefined {
  if (v === null) return null;
  const p = val.vec3(v, 'punto');
  if (!p) return undefined;
  if (dominio && [0, 1, 2].some((k) => p[k] < dominio.min[k] || p[k] > dominio.max[k])) {
    val.error('punto', 'debe estar dentro del dominio');
    return undefined;
  }
  return p;
}

// ---------------------------------------------------------------- autoguardado (EXP-02)

export const CLAVE_AUTOGUARDADO = 'campos-vectoriales:autoguardado';

/** Guarda el estado; devuelve false si el almacenamiento no está disponible o está lleno. */
export function autoguardar(s: EstadoExperimento, almacen: Pick<Storage, 'setItem'> | null = almacenLocal()): boolean {
  try {
    if (!almacen) return false;
    almacen.setItem(CLAVE_AUTOGUARDADO, JSON.stringify(aConfiguracion(s)));
    return true;
  } catch {
    return false;
  }
}

/** Estado guardado, si lo hay y es válido; si no, null (un guardado dañado se ignora). */
export function recuperarAutoguardado(almacen: Pick<Storage, 'getItem'> | null = almacenLocal()): EstadoExperimento | null {
  try {
    const texto = almacen?.getItem(CLAVE_AUTOGUARDADO);
    if (!texto) return null;
    const r = importarConfiguracion(texto);
    return r.ok ? r.estado : null;
  } catch {
    return null;
  }
}

export function borrarAutoguardado(almacen: Pick<Storage, 'removeItem'> | null = almacenLocal()): void {
  try {
    almacen?.removeItem(CLAVE_AUTOGUARDADO);
  } catch {
    // Almacenamiento bloqueado: no hay nada que borrar.
  }
}

/** `localStorage`, o null si el navegador lo bloquea (el mero acceso puede lanzar). */
function almacenLocal(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
