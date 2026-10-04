/**
 * Simplificación para mostrar (UI-08): agrupa términos semejantes de las sumas, de modo que
 * la divergencia y el rotacional se lean como un experto los escribiría («2ω», no «ω + ω»;
 * «0», no «y − y»). Solo afecta a lo que se muestra: los árboles que se evalúan no cambian.
 */
import type { Nodo } from './ast';
import { neg, prod, resta, suma } from './diff';

const N = (valor: number): Nodo => ({ tipo: 'num', valor });

/** Clave estructural de un árbol (sin rangos de texto). */
function clave(n: Nodo): string {
  switch (n.tipo) {
    case 'num':
      return `n:${n.valor}`;
    case 'id':
      return `i:${n.nombre}`;
    case 'var':
      return `v:${n.eje}`;
    case 'param':
      return `p:${n.nombre}`;
    case 'tiempo':
      return 't';
    case 'const':
      return `c:${n.nombre}`;
    case 'derivada':
      return `d:${n.nombre}`;
    case 'neg':
      return `-(${clave(n.arg)})`;
    case 'bin':
      // Los productos son conmutativos: x·y y y·x tienen la misma clave.
      if (n.op === '*') return `[${factores(n).map(clave).sort().join('*')}]`;
      return `(${clave(n.izq)}${n.op}${clave(n.der)})`;
    case 'llamada':
      return `${n.fn}(${n.args.map(clave).join(',')})`;
  }
}

/** c·t con el producto asociado por la izquierda: «2·x·y», no «2·(x·y)». */
function conCoeficiente(c: number, t: Nodo): Nodo {
  return factores(t).reduce<Nodo>((acc, f) => prod(acc, f), N(c));
}

/** Factores de una cadena de productos. */
function factores(n: Nodo): Nodo[] {
  return n.tipo === 'bin' && n.op === '*' ? [...factores(n.izq), ...factores(n.der)] : [n];
}

/** Simplifica los hijos y, si el nodo es una suma, agrupa sus términos semejantes. */
export function agruparTerminos(n: Nodo): Nodo {
  const hijos = simplificarHijos(n);
  if (!(hijos.tipo === 'bin' && (hijos.op === '+' || hijos.op === '-')) && hijos.tipo !== 'neg') return hijos;
  // Términos (coeficiente, término sin factor numérico); la constante usa el término «1».
  const terminos = new Map<string, { c: number; t: Nodo | null }>();
  const anadir = (m: Nodo, signo: number) => {
    if (m.tipo === 'bin' && m.op === '+') {
      anadir(m.izq, signo);
      anadir(m.der, signo);
    } else if (m.tipo === 'bin' && m.op === '-') {
      anadir(m.izq, signo);
      anadir(m.der, -signo);
    } else if (m.tipo === 'neg') {
      anadir(m.arg, -signo);
    } else if (m.tipo === 'num') {
      const e = terminos.get('1') ?? { c: 0, t: null };
      e.c += signo * m.valor;
      terminos.set('1', e);
    } else {
      const conCoef = m.tipo === 'bin' && m.op === '*' && m.izq.tipo === 'num';
      const c = conCoef ? (m.izq as { valor: number }).valor : 1;
      const t = conCoef ? (m as { der: Nodo }).der : m;
      const k = clave(t);
      const e = terminos.get(k) ?? { c: 0, t };
      e.c += signo * c;
      terminos.set(k, e);
    }
  };
  anadir(hijos, 1);
  let acc: Nodo | null = null;
  for (const { c, t } of terminos.values()) {
    const coef = Number(c.toPrecision(12));
    if (coef === 0) continue;
    const absoluto = t === null ? N(Math.abs(coef)) : Math.abs(coef) === 1 ? t : conCoeficiente(Math.abs(coef), t);
    // Primer término negativo: −(2·z), que en TeX se escribe «−2z» (sin paréntesis).
    if (acc === null) acc = coef > 0 ? absoluto : t === null ? N(coef) : neg(absoluto);
    else acc = coef < 0 ? resta(acc, absoluto) : suma(acc, absoluto);
  }
  return acc ?? N(0);
}

function simplificarHijos(n: Nodo): Nodo {
  switch (n.tipo) {
    case 'neg':
      return neg(agruparTerminos(n.arg));
    case 'bin': {
      const a = agruparTerminos(n.izq);
      const b = agruparTerminos(n.der);
      if (n.op === '+') return suma(a, b);
      if (n.op === '-') return resta(a, b);
      if (n.op === '*') return prod(a, b);
      return { ...n, izq: a, der: b };
    }
    case 'llamada':
      return { ...n, args: n.args.map(agruparTerminos) };
    default:
      return n;
  }
}
