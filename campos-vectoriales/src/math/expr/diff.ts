/**
 * Derivación simbólica (MAT-04) con simplificación mínima al construir (SPEC §5.2): plegado
 * de constantes, 0·u → 0, 1·u → u, u + 0 → u, u^1 → u, −(−u) → u.
 *
 * Reglas de la tabla de SPEC §5.2. `abs`, `min` y `max` se derivan con la función interna
 * `sgn`; sus puntos angulosos los detecta `construirChequeoAngulos`.
 */
import { compilar, type FuncionCompilada } from './compile';
import { contarNodos, dependeDelTiempo, dependeDeVariables, esConstante, type Nodo } from './ast';
import { LIMITES_EXPRESION } from './errores';

const N = (valor: number): Nodo => ({ tipo: 'num', valor });
const esNum = (n: Nodo, v?: number) => n.tipo === 'num' && (v === undefined || n.valor === v);
const valor = (n: Nodo) => (n.tipo === 'num' ? n.valor : NaN);

export function neg(a: Nodo): Nodo {
  if (a.tipo === 'num') return N(-a.valor);
  if (a.tipo === 'neg') return a.arg;
  return { tipo: 'neg', arg: a };
}

export function suma(a: Nodo, b: Nodo): Nodo {
  if (esNum(a, 0)) return b;
  if (esNum(b, 0)) return a;
  if (a.tipo === 'num' && b.tipo === 'num') return N(a.valor + b.valor);
  if (b.tipo === 'neg') return resta(a, b.arg);
  return { tipo: 'bin', op: '+', izq: a, der: b };
}

export function resta(a: Nodo, b: Nodo): Nodo {
  if (esNum(b, 0)) return a;
  if (esNum(a, 0)) return neg(b);
  if (a.tipo === 'num' && b.tipo === 'num') return N(a.valor - b.valor);
  if (b.tipo === 'neg') return suma(a, b.arg);
  return { tipo: 'bin', op: '-', izq: a, der: b };
}

export function prod(a: Nodo, b: Nodo): Nodo {
  if (esNum(a, 0) || esNum(b, 0)) return N(0);
  if (esNum(a, 1)) return b;
  if (esNum(b, 1)) return a;
  if (esNum(a, -1)) return neg(b);
  if (esNum(b, -1)) return neg(a);
  if (a.tipo === 'num' && b.tipo === 'num') return N(a.valor * b.valor);
  // Constantes delante: u·2 → 2·u
  if (b.tipo === 'num' && a.tipo !== 'num') return prod(b, a);
  if (a.tipo === 'neg') return neg(prod(a.arg, b));
  if (b.tipo === 'neg') return neg(prod(a, b.arg));
  // 2·(3·u) → 6·u
  if (a.tipo === 'num' && b.tipo === 'bin' && b.op === '*' && b.izq.tipo === 'num') return prod(N(a.valor * b.izq.valor), b.der);
  return { tipo: 'bin', op: '*', izq: a, der: b };
}

export function div(a: Nodo, b: Nodo): Nodo {
  if (esNum(a, 0)) return N(0);
  if (esNum(b, 1)) return a;
  if (a.tipo === 'num' && b.tipo === 'num' && b.valor !== 0) {
    const q = a.valor / b.valor;
    if (Number.isInteger(q)) return N(q);
  }
  if (a.tipo === 'neg') return neg(div(a.arg, b));
  return { tipo: 'bin', op: '/', izq: a, der: b };
}

export function pot(a: Nodo, b: Nodo): Nodo {
  if (esNum(b, 0)) return N(1);
  if (esNum(b, 1)) return a;
  if (a.tipo === 'num' && b.tipo === 'num') {
    const r = Math.pow(a.valor, b.valor);
    if (Number.isFinite(r) && Number.isInteger(r)) return N(r);
  }
  return { tipo: 'bin', op: '^', izq: a, der: b };
}

const llamar = (fn: Extract<Nodo, { tipo: 'llamada' }>['fn'], ...args: Nodo[]): Nodo => ({ tipo: 'llamada', fn, args });

/** Variable de derivación: 0 = x, 1 = y, 2 = z, 3 = t (SPEC §3.10). */
export type VariableDerivacion = 0 | 1 | 2 | 3;
export const VAR_T: VariableDerivacion = 3;

/** ¿Depende el árbol de la variable de derivación? (Las espaciales tratan t como constante y viceversa.) */
const depende = (n: Nodo, eje: VariableDerivacion) => (eje === VAR_T ? dependeDelTiempo(n) : dependeDeVariables(n));

/** Derivada parcial respecto de x, y, z (eje 0, 1, 2) o t (eje 3). */
export function derivar(n: Nodo, eje: VariableDerivacion): Nodo {
  switch (n.tipo) {
    case 'num':
    case 'const':
    case 'param':
      return N(0);
    case 'tiempo':
      return N(eje === VAR_T ? 1 : 0);
    case 'id':
      throw new Error(`Identificador sin resolver: ${n.nombre}`);
    case 'var':
      return N(n.eje === eje ? 1 : 0);
    case 'derivada':
      // r y ρ solo dependen de x, y, z.
      return eje === VAR_T ? N(0) : derivar(n.arbol, eje);
    case 'neg':
      return neg(derivar(n.arg, eje));
    case 'bin': {
      const u = n.izq;
      const v = n.der;
      const du = derivar(u, eje);
      const dv = derivar(v, eje);
      switch (n.op) {
        case '+':
          return suma(du, dv);
        case '-':
          return resta(du, dv);
        case '*':
          return suma(prod(du, v), prod(u, dv));
        case '/':
          // (u'v − uv')/v² escrito como u'/v − u·v'/v² (mantiene árboles pequeños si v' = 0)
          return resta(div(du, v), div(prod(u, dv), pot(v, N(2))));
        case '^':
          return derivarPotencia(u, v, du, dv, eje);
      }
      break;
    }
    case 'llamada':
      return derivarLlamada(n, eje);
  }
  throw new Error('Nodo no derivable');
}

function derivarPotencia(u: Nodo, v: Nodo, du: Nodo, dv: Nodo, eje: VariableDerivacion): Nodo {
  if (!depende(v, eje)) {
    // Exponente constante (o con parámetros): v·u^(v−1)·u'
    if (esNum(du, 0)) return N(0);
    const exp = v.tipo === 'num' ? N(v.valor - 1) : resta(v, N(1));
    return prod(prod(v, pot(u, exp)), du);
  }
  if (!depende(u, eje)) {
    // Base constante: u^v·ln(u)·v'
    return prod(prod({ tipo: 'bin', op: '^', izq: u, der: v }, llamar('ln', u)), dv);
  }
  // General: u^v·(v'·ln u + v·u'/u)
  return prod({ tipo: 'bin', op: '^', izq: u, der: v }, suma(prod(dv, llamar('ln', u)), div(prod(v, du), u)));
}

function derivarLlamada(n: Extract<Nodo, { tipo: 'llamada' }>, eje: VariableDerivacion): Nodo {
  const [a, b, c] = n.args as [Nodo, Nodo | undefined, Nodo | undefined];
  const da = derivar(a, eje);
  const cadena = (f: Nodo) => prod(f, da);
  const uno = N(1);
  switch (n.fn) {
    case 'sin':
      return cadena(llamar('cos', a));
    case 'cos':
      return neg(cadena(llamar('sin', a)));
    case 'tan':
      return cadena(suma(uno, pot(llamar('tan', a), N(2))));
    case 'asin':
      return div(da, llamar('sqrt', resta(uno, pot(a, N(2)))));
    case 'acos':
      return neg(div(da, llamar('sqrt', resta(uno, pot(a, N(2))))));
    case 'atan':
      return div(da, suma(uno, pot(a, N(2))));
    case 'sinh':
      return cadena(llamar('cosh', a));
    case 'cosh':
      return cadena(llamar('sinh', a));
    case 'tanh':
      return cadena(resta(uno, pot(llamar('tanh', a), N(2))));
    case 'asinh':
      return div(da, llamar('sqrt', suma(pot(a, N(2)), uno)));
    case 'acosh':
      return div(da, llamar('sqrt', resta(pot(a, N(2)), uno)));
    case 'atanh':
      return div(da, resta(uno, pot(a, N(2))));
    case 'exp':
      return cadena(llamar('exp', a));
    case 'ln':
      return div(da, a);
    case 'log10':
      return div(da, prod(a, llamar('ln', N(10))));
    case 'sqrt':
      return div(da, prod(N(2), llamar('sqrt', a)));
    case 'cbrt':
      return div(da, prod(N(3), pot(llamar('cbrt', a), N(2))));
    case 'abs':
      return cadena(llamar('sgn', a));
    case 'sgn':
      return N(0);
    case 'atan2': {
      // atan2(a, b) = ángulo de (b, a): (b·a' − a·b')/(a² + b²)
      const bb = b as Nodo;
      const db = derivar(bb, eje);
      return div(resta(prod(bb, da), prod(a, db)), suma(pot(a, N(2)), pot(bb, N(2))));
    }
    case 'min':
    case 'max': {
      // min(a,b) = (a+b)/2 − |a−b|/2;  max(a,b) = (a+b)/2 + |a−b|/2
      const bb = b as Nodo;
      const db = derivar(bb, eje);
      const media = div(suma(da, db), N(2));
      const salto = div(prod(llamar('sgn', resta(a, bb)), resta(da, db)), N(2));
      return n.fn === 'min' ? resta(media, salto) : suma(media, salto);
    }
    case 'hypot': {
      const args = [a, b, c].filter((x): x is Nodo => !!x);
      const numerador = args.map((t) => prod(t, derivar(t, eje))).reduce((s, t) => suma(s, t));
      return div(numerador, n);
    }
    case 'pow':
      return derivar({ tipo: 'bin', op: '^', izq: a, der: b as Nodo }, eje);
  }
}

/**
 * Jacobiana simbólica 3×3 en orden de filas, o null si algún árbol supera el límite de
 * nodos (entonces se usan diferencias finitas, SPEC §5.4).
 */
export function jacobianaSimbolica(componentes: readonly [Nodo, Nodo, Nodo]): Nodo[] | null {
  const j: Nodo[] = [];
  for (const c of componentes) {
    for (const eje of [0, 1, 2] as const) {
      const d = derivar(c, eje);
      if (contarNodos(d) > LIMITES_EXPRESION.nodosDerivada) return null;
      j.push(d);
    }
  }
  return j;
}

/**
 * Derivada local ∂F/∂t simbólica (SPEC §3.10), o null si algún árbol supera el límite de
 * nodos (entonces el inspector usa diferencias finitas en t).
 */
export function derivadaTemporalSimbolica(componentes: readonly [Nodo, Nodo, Nodo]): Nodo[] | null {
  const d: Nodo[] = [];
  for (const c of componentes) {
    const dc = derivar(c, VAR_T);
    if (contarNodos(dc) > LIMITES_EXPRESION.nodosDerivada) return null;
    d.push(dc);
  }
  return d;
}

/**
 * Chequeo de puntos angulosos (SPEC §5.4): devuelve true si el punto está a menos de
 * 10⁻⁹·(1 + |·|) del punto anguloso de algún abs, min, max, atan2 o hypot.
 */
export function construirChequeoAngulos(arboles: readonly Nodo[]): (x: number, y: number, z: number, p: Float64Array) => boolean {
  const chequeos: ((x: number, y: number, z: number, p: Float64Array) => boolean)[] = [];
  const visitar = (n: Nodo) => {
    switch (n.tipo) {
      case 'neg':
        visitar(n.arg);
        return;
      case 'bin':
        visitar(n.izq);
        visitar(n.der);
        return;
      case 'llamada': {
        n.args.forEach(visitar);
        if (n.args.every((a) => esConstante(a) || !dependeDeVariables(a))) return;
        const f = n.args.map(compilar) as FuncionCompilada[];
        const [fa, fb] = f as [FuncionCompilada, FuncionCompilada];
        if (n.fn === 'abs') {
          chequeos.push((x, y, z, p) => Math.abs(fa(x, y, z, p)) <= 1e-9);
        } else if (n.fn === 'min' || n.fn === 'max') {
          chequeos.push((x, y, z, p) => {
            const a = fa(x, y, z, p);
            const b = fb(x, y, z, p);
            return Math.abs(a - b) <= 1e-9 * (1 + Math.abs(a) + Math.abs(b));
          });
        } else if (n.fn === 'atan2' || n.fn === 'hypot') {
          chequeos.push((x, y, z, p) => f.reduce((s, g) => s + Math.abs(g(x, y, z, p)), 0) <= 1e-9);
        }
        return;
      }
      default:
        return;
    }
  };
  arboles.forEach(visitar);
  if (!chequeos.length) return () => false;
  return (x, y, z, p) => chequeos.some((c) => c(x, y, z, p));
}

export { valor as valorNumerico };
