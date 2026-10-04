/**
 * Árbol de las expresiones (SPEC §5.2). Los nodos que proceden del texto llevan su rango
 * [ini, fin) para señalar errores; los generados al derivar no lo llevan.
 */

export type Op = '+' | '-' | '*' | '/' | '^';

/** Funciones de la lista blanca, con su aridad. `sgn` es interna (solo aparece al derivar). */
export const FUNCIONES = {
  sin: [1, 1],
  cos: [1, 1],
  tan: [1, 1],
  asin: [1, 1],
  acos: [1, 1],
  atan: [1, 1],
  atan2: [2, 2],
  sinh: [1, 1],
  cosh: [1, 1],
  tanh: [1, 1],
  asinh: [1, 1],
  acosh: [1, 1],
  atanh: [1, 1],
  exp: [1, 1],
  ln: [1, 1],
  log10: [1, 1],
  sqrt: [1, 1],
  cbrt: [1, 1],
  abs: [1, 1],
  min: [2, 2],
  max: [2, 2],
  hypot: [2, 3],
  pow: [2, 2],
} as const;

export type NombreFuncion = keyof typeof FUNCIONES | 'sgn';

/** Alias admitidos al escribir: `log` es el logaritmo natural; `sen`, el seno en español. */
export const ALIAS_FUNCIONES: Record<string, keyof typeof FUNCIONES> = { log: 'ln', sen: 'sin' };

export interface Rango {
  ini?: number;
  fin?: number;
}

export type Nodo = Rango &
  (
    | { tipo: 'num'; valor: number }
    | { tipo: 'id'; nombre: string }
    | { tipo: 'var'; eje: 0 | 1 | 2 }
    | { tipo: 'param'; nombre: string; indice: number }
    /** Variable temporal t (SPEC §3.10): se lee en p[indice], la ranura que sigue a los parámetros (D-63). */
    | { tipo: 'tiempo'; indice: number }
    | { tipo: 'const'; nombre: 'pi' | 'e'; valor: number }
    /** Variable derivada (r, rho): se muestra por su nombre y se evalúa por su árbol. */
    | { tipo: 'derivada'; nombre: 'r' | 'rho'; arbol: Nodo }
    | { tipo: 'neg'; arg: Nodo }
    | { tipo: 'bin'; op: Op; izq: Nodo; der: Nodo }
    | { tipo: 'llamada'; fn: NombreFuncion; args: Nodo[] }
  );

export const num = (valor: number): Nodo => ({ tipo: 'num', valor });

/** Número de nodos de un árbol. */
export function contarNodos(n: Nodo): number {
  switch (n.tipo) {
    case 'neg':
      return 1 + contarNodos(n.arg);
    case 'bin':
      return 1 + contarNodos(n.izq) + contarNodos(n.der);
    case 'llamada':
      return 1 + n.args.reduce((s, a) => s + contarNodos(a), 0);
    case 'derivada':
      return 1;
    default:
      return 1;
  }
}

/** ¿Depende el árbol de x, y o z? */
export function dependeDeVariables(n: Nodo): boolean {
  switch (n.tipo) {
    case 'var':
    case 'derivada':
      return true;
    case 'neg':
      return dependeDeVariables(n.arg);
    case 'bin':
      return dependeDeVariables(n.izq) || dependeDeVariables(n.der);
    case 'llamada':
      return n.args.some(dependeDeVariables);
    default:
      return false;
  }
}

/** ¿Depende el árbol del tiempo t? */
export function dependeDelTiempo(n: Nodo): boolean {
  switch (n.tipo) {
    case 'tiempo':
      return true;
    case 'neg':
      return dependeDelTiempo(n.arg);
    case 'bin':
      return dependeDelTiempo(n.izq) || dependeDelTiempo(n.der);
    case 'llamada':
      return n.args.some(dependeDelTiempo);
    default:
      return false;
  }
}

/** ¿Es constante (sin variables ni parámetros)? */
export function esConstante(n: Nodo): boolean {
  switch (n.tipo) {
    case 'num':
    case 'const':
      return true;
    case 'neg':
      return esConstante(n.arg);
    case 'bin':
      return esConstante(n.izq) && esConstante(n.der);
    case 'llamada':
      return n.args.every(esConstante);
    default:
      return false;
  }
}

/** Forma S compacta para pruebas y comparaciones estructurales. */
export function sexpr(n: Nodo): string {
  switch (n.tipo) {
    case 'num':
      return String(n.valor);
    case 'id':
      return `?${n.nombre}`;
    case 'var':
      return 'xyz'[n.eje] as string;
    case 'param':
      return `$${n.nombre}`;
    case 'tiempo':
      return 't';
    case 'const':
      return n.nombre;
    case 'derivada':
      return n.nombre;
    case 'neg':
      return `(neg ${sexpr(n.arg)})`;
    case 'bin':
      return `(${n.op} ${sexpr(n.izq)} ${sexpr(n.der)})`;
    case 'llamada':
      return `(${n.fn} ${n.args.map(sexpr).join(' ')})`;
  }
}
