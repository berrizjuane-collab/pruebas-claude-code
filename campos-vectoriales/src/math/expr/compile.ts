/**
 * Compilación de árboles resueltos a cierres (MAT-03): sin eval ni new Function (RNF-06).
 * Los subárboles constantes se pliegan una vez; los parámetros se leen por índice.
 */
import { esConstante, type Nodo } from './ast';

export type FuncionCompilada = (x: number, y: number, z: number, p: Float64Array) => number;

const MATH1: Record<string, (a: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  asinh: Math.asinh,
  acosh: Math.acosh,
  atanh: Math.atanh,
  exp: Math.exp,
  ln: Math.log,
  log10: Math.log10,
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  abs: Math.abs,
  sgn: Math.sign,
};

/** Evalúa un árbol en un punto (sin compilar); útil para constantes y pruebas. */
export function evaluar(n: Nodo, x: number, y: number, z: number, p: Float64Array): number {
  return compilar(n)(x, y, z, p);
}

export function compilar(n: Nodo): FuncionCompilada {
  if (esConstante(n) && n.tipo !== 'num') {
    const valor = construir(n)(0, 0, 0, new Float64Array(0));
    return () => valor;
  }
  return construir(n);
}

function construir(n: Nodo): FuncionCompilada {
  switch (n.tipo) {
    case 'num': {
      const v = n.valor;
      return () => v;
    }
    case 'const': {
      const v = n.valor;
      return () => v;
    }
    case 'var':
      return n.eje === 0 ? (x) => x : n.eje === 1 ? (_x, y) => y : (_x, _y, z) => z;
    case 'param':
    case 'tiempo': {
      const i = n.indice;
      return (_x, _y, _z, p) => p[i] as number;
    }
    case 'derivada':
      return compilar(n.arbol);
    case 'id':
      throw new Error(`Identificador sin resolver: ${n.nombre}`);
    case 'neg': {
      const a = compilar(n.arg);
      return (x, y, z, p) => -a(x, y, z, p);
    }
    case 'bin': {
      const a = compilar(n.izq);
      const b = compilar(n.der);
      switch (n.op) {
        case '+':
          return (x, y, z, p) => a(x, y, z, p) + b(x, y, z, p);
        case '-':
          return (x, y, z, p) => a(x, y, z, p) - b(x, y, z, p);
        case '*':
          return (x, y, z, p) => a(x, y, z, p) * b(x, y, z, p);
        case '/':
          return (x, y, z, p) => a(x, y, z, p) / b(x, y, z, p);
        case '^': {
          if (n.der.tipo === 'num') {
            const k = n.der.valor;
            if (k === 2) return (x, y, z, p) => {
              const v = a(x, y, z, p);
              return v * v;
            };
            if (k === 3) return (x, y, z, p) => {
              const v = a(x, y, z, p);
              return v * v * v;
            };
            if (k === 1) return a;
            return (x, y, z, p) => Math.pow(a(x, y, z, p), k);
          }
          return (x, y, z, p) => Math.pow(a(x, y, z, p), b(x, y, z, p));
        }
      }
      break;
    }
    case 'llamada': {
      const args = n.args.map(compilar);
      const f1 = MATH1[n.fn];
      if (f1) {
        const a = args[0] as FuncionCompilada;
        return (x, y, z, p) => f1(a(x, y, z, p));
      }
      const [a, b, c] = args as [FuncionCompilada, FuncionCompilada, FuncionCompilada | undefined];
      switch (n.fn) {
        case 'atan2':
          return (x, y, z, p) => Math.atan2(a(x, y, z, p), b(x, y, z, p));
        case 'min':
          return (x, y, z, p) => Math.min(a(x, y, z, p), b(x, y, z, p));
        case 'max':
          return (x, y, z, p) => Math.max(a(x, y, z, p), b(x, y, z, p));
        case 'pow':
          return (x, y, z, p) => Math.pow(a(x, y, z, p), b(x, y, z, p));
        case 'hypot':
          return c ? (x, y, z, p) => Math.hypot(a(x, y, z, p), b(x, y, z, p), c(x, y, z, p)) : (x, y, z, p) => Math.hypot(a(x, y, z, p), b(x, y, z, p));
      }
    }
  }
  throw new Error(`Nodo no compilable: ${JSON.stringify(n)}`);
}
