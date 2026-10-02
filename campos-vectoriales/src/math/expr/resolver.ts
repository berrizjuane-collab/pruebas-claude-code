/**
 * Resolución de identificadores (MAT-02): variables, variables derivadas (r, rho),
 * constantes, parámetros declarados y la variable reservada t (AMP-01).
 */
import { ALIAS_FUNCIONES, FUNCIONES, type Nodo } from './ast';
import { crearError, FalloAnalisis, type ErrorExpresion, type Sugerencia } from './errores';

export const NOMBRES_RESERVADOS = new Set([
  'x', 'y', 'z', 'r', 'rho', 'pi', 'e', 't',
  ...Object.keys(FUNCIONES), ...Object.keys(ALIAS_FUNCIONES), 'sgn',
]);

/** ¿Puede usarse este nombre para un parámetro? */
export function nombreParametroValido(nombre: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]{0,15}$/.test(nombre) && !NOMBRES_RESERVADOS.has(nombre);
}

const v = (eje: 0 | 1 | 2): Nodo => ({ tipo: 'var', eje });
const cuadrado = (n: Nodo): Nodo => ({ tipo: 'bin', op: '^', izq: n, der: { tipo: 'num', valor: 2 } });
const sumaDe = (...t: Nodo[]): Nodo => t.reduce((a, b) => ({ tipo: 'bin', op: '+', izq: a, der: b }));
export const ARBOL_R: Nodo = { tipo: 'llamada', fn: 'sqrt', args: [sumaDe(cuadrado(v(0)), cuadrado(v(1)), cuadrado(v(2)))] };
export const ARBOL_RHO: Nodo = { tipo: 'llamada', fn: 'sqrt', args: [sumaDe(cuadrado(v(0)), cuadrado(v(1)))] };

export type ResultadoResolucion = { ok: true; arbol: Nodo; usados: Set<string> } | { ok: false; error: ErrorExpresion };

export function resolver(arbol: Nodo, parametros: readonly string[]): ResultadoResolucion {
  const usados = new Set<string>();
  const visitar = (n: Nodo): Nodo => {
    switch (n.tipo) {
      case 'id':
        return resolverId(n, parametros, usados);
      case 'neg':
        return { ...n, arg: visitar(n.arg) };
      case 'bin':
        return { ...n, izq: visitar(n.izq), der: visitar(n.der) };
      case 'llamada':
        return { ...n, args: n.args.map(visitar) };
      default:
        return n;
    }
  };
  try {
    return { ok: true, arbol: visitar(arbol), usados };
  } catch (e) {
    if (e instanceof FalloAnalisis) return { ok: false, error: e.error };
    throw e;
  }
}

function resolverId(n: Extract<Nodo, { tipo: 'id' }>, parametros: readonly string[], usados: Set<string>): Nodo {
  const r = { ini: n.ini, fin: n.fin };
  switch (n.nombre) {
    case 'x':
      return { tipo: 'var', eje: 0, ...r };
    case 'y':
      return { tipo: 'var', eje: 1, ...r };
    case 'z':
      return { tipo: 'var', eje: 2, ...r };
    case 'r':
      return { tipo: 'derivada', nombre: 'r', arbol: ARBOL_R, ...r };
    case 'rho':
      return { tipo: 'derivada', nombre: 'rho', arbol: ARBOL_RHO, ...r };
    case 'pi':
      return { tipo: 'const', nombre: 'pi', valor: Math.PI, ...r };
    case 'e':
      return { tipo: 'const', nombre: 'e', valor: Math.E, ...r };
    case 't':
      throw new FalloAnalisis(
        crearError('T_RESERVADA', 'Los campos dependientes del tiempo (t) aún no están disponibles', n.ini ?? 0, n.fin ?? 0),
      );
  }
  const indice = parametros.indexOf(n.nombre);
  if (indice >= 0) {
    usados.add(n.nombre);
    return { tipo: 'param', nombre: n.nombre, indice, ...r };
  }
  throw new FalloAnalisis(
    crearError('IDENT_DESCONOCIDO', `«${n.nombre}» no es una variable ni un parámetro`, n.ini ?? 0, n.fin ?? 0, sugerencias(n.nombre, parametros)),
  );
}

function sugerencias(nombre: string, parametros: readonly string[]): Sugerencia[] {
  const s: Sugerencia[] = [];
  const simples = new Set(['x', 'y', 'z', 'e', ...parametros.filter((p) => p.length === 1)]);
  if (nombre.length > 1 && [...nombre].every((c) => simples.has(c))) {
    s.push({ tipo: 'reescribir', texto: [...nombre].join('*') });
  }
  const m = /^([A-Za-z]+)(\d+)$/.exec(nombre);
  if (m && (simples.has(m[1] as string) || ['r', 'rho', 'pi'].includes(m[1] as string) || parametros.includes(m[1] as string))) {
    s.push({ tipo: 'reescribir', texto: `${m[1]}*${m[2]}` });
  }
  if (nombreParametroValido(nombre)) s.push({ tipo: 'parametro', nombre });
  return s;
}
