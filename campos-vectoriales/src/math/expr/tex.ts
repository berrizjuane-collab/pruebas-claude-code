/**
 * Salida tipográfica de los árboles (MAT-04): TeX para KaTeX y texto Unicode lineal para
 * exportar. Ambas respetan la precedencia: solo se añaden los paréntesis necesarios.
 */
import type { Nodo } from './ast';

const GRIEGAS = new Set([
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi',
  'pi', 'rho', 'sigma', 'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega',
]);
const GRIEGAS_UNICODE: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', iota: 'ι', kappa: 'κ',
  lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ', chi: 'χ',
  psi: 'ψ', omega: 'ω',
};

/** Nombre TeX de un parámetro: letras griegas con su símbolo; nombres largos en cursiva. */
export function texNombreParametro(nombre: string): string {
  if (GRIEGAS.has(nombre)) return `\\${nombre}`;
  if (nombre.length === 1) return nombre;
  const m = /^([A-Za-z]+)_?(\d+)$/.exec(nombre);
  if (m) return `${texNombreParametro(m[1] as string)}_{${m[2]}}`;
  return `\\mathit{${nombre.replace(/_/g, '\\_')}}`;
}

export function unicodeNombreParametro(nombre: string): string {
  return GRIEGAS_UNICODE[nombre] ?? nombre;
}

/** Precedencia: 1 suma, 2 producto, 3 unario, 4 potencia, 5 átomo. */
function precedencia(n: Nodo): number {
  switch (n.tipo) {
    case 'bin':
      return n.op === '+' || n.op === '-' ? 1 : n.op === '^' ? 4 : 2;
    case 'neg':
      return 3;
    case 'num':
      return n.valor < 0 ? 3 : 5;
    default:
      return 5;
  }
}

function texNumero(v: number): string {
  if (!Number.isFinite(v)) return v > 0 ? '\\infty' : v < 0 ? '-\\infty' : '\\text{NaN}';
  const a = Math.abs(v);
  let s: string;
  if (a !== 0 && (a >= 1e6 || a < 1e-4)) {
    const [m, e] = a.toExponential().split('e');
    s = `${Number(m)}\\times 10^{${Number(e)}}`;
  } else s = String(Number(a.toPrecision(12)));
  return v < 0 ? `-${s}` : s;
}

const FUNCIONES_TEX: Record<string, string> = {
  sin: '\\sin', cos: '\\cos', tan: '\\tan', asin: '\\arcsin', acos: '\\arccos', atan: '\\arctan',
  sinh: '\\sinh', cosh: '\\cosh', tanh: '\\tanh', asinh: '\\operatorname{arsinh}', acosh: '\\operatorname{arcosh}',
  atanh: '\\operatorname{artanh}', ln: '\\ln', min: '\\min', max: '\\max', atan2: '\\operatorname{atan2}',
  hypot: '\\operatorname{hypot}', sgn: '\\operatorname{sgn}', pow: '\\operatorname{pow}',
};

/** ¿Empieza el TeX de este nodo por un dígito? (para decidir la yuxtaposición 2x). */
const empiezaPorNumero = (n: Nodo): boolean =>
  n.tipo === 'num' ? n.valor >= 0 : n.tipo === 'bin' && n.op !== '+' && n.op !== '-' ? empiezaPorNumero(n.izq) : false;

export function tex(n: Nodo): string {
  switch (n.tipo) {
    case 'num':
      return texNumero(n.valor);
    case 'id':
      return n.nombre;
    case 'var':
      return 'xyz'[n.eje] as string;
    case 'param':
      return texNombreParametro(n.nombre);
    case 'const':
      return n.nombre === 'pi' ? '\\pi' : 'e';
    case 'derivada':
      return n.nombre === 'r' ? 'r' : '\\rho';
    case 'neg': {
      const a = n.arg;
      const interior = precedencia(a) <= 1 ? `\\left(${tex(a)}\\right)` : tex(a);
      return `-${interior}`;
    }
    case 'bin': {
      const pi = precedencia(n.izq);
      const pd = precedencia(n.der);
      switch (n.op) {
        case '+':
          return `${tex(n.izq)} + ${tex(n.der)}`;
        case '-':
          return `${tex(n.izq)} - ${pd <= 1 || pd === 3 ? `\\left(${tex(n.der)}\\right)` : tex(n.der)}`;
        case '*': {
          const izq = pi <= 1 || (pi === 3 && n.izq.tipo !== 'neg') ? `\\left(${tex(n.izq)}\\right)` : tex(n.izq);
          const der = pd <= 1 || pd === 3 ? `\\left(${tex(n.der)}\\right)` : tex(n.der);
          // Yuxtaposición (2x, xy) salvo que el factor derecho empiece por número: 2·3.
          const sep = empiezaPorNumero(n.der) ? ' \\cdot ' : '\\,';
          return `${izq}${sep}${der}`;
        }
        case '/':
          return `\\frac{${tex(n.izq)}}{${tex(n.der)}}`;
        case '^': {
          const base = pi < 5 || n.izq.tipo === 'llamada' ? `\\left(${tex(n.izq)}\\right)` : tex(n.izq);
          return `${base}^{${tex(n.der)}}`;
        }
      }
      break;
    }
    case 'llamada': {
      const args = n.args.map(tex);
      switch (n.fn) {
        case 'sqrt':
          return `\\sqrt{${args[0]}}`;
        case 'cbrt':
          return `\\sqrt[3]{${args[0]}}`;
        case 'abs':
          return `\\left|${args[0]}\\right|`;
        case 'exp':
          return `e^{${args[0]}}`;
        case 'log10':
          return `\\log_{10}\\left(${args[0]}\\right)`;
        default:
          return `${FUNCIONES_TEX[n.fn] ?? `\\operatorname{${n.fn}}`}\\left(${args.join(', ')}\\right)`;
      }
    }
  }
  return '';
}

const SUPER: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };

/** Texto Unicode lineal que el propio analizador vuelve a leer igual (V-MAT-06). */
export function unicode(n: Nodo): string {
  switch (n.tipo) {
    case 'num':
      return n.valor < 0 ? `(−${String(-n.valor)})` : String(n.valor);
    case 'id':
      return n.nombre;
    case 'var':
      return 'xyz'[n.eje] as string;
    case 'param':
      return unicodeNombreParametro(n.nombre);
    case 'const':
      return n.nombre === 'pi' ? 'π' : 'e';
    case 'derivada':
      return n.nombre === 'r' ? 'r' : 'ρ';
    case 'neg':
      return `−${precedencia(n.arg) <= 3 ? `(${unicode(n.arg)})` : unicode(n.arg)}`;
    case 'bin': {
      const pi = precedencia(n.izq);
      const pd = precedencia(n.der);
      const envolver = (s: string) => `(${s})`;
      switch (n.op) {
        case '+':
          return `${unicode(n.izq)} + ${pd <= 1 ? envolver(unicode(n.der)) : unicode(n.der)}`;
        case '-':
          return `${unicode(n.izq)} − ${pd <= 1 ? envolver(unicode(n.der)) : unicode(n.der)}`;
        case '*':
          return `${pi <= 1 ? envolver(unicode(n.izq)) : unicode(n.izq)}·${pd <= 2 ? envolver(unicode(n.der)) : unicode(n.der)}`;
        case '/':
          return `${pi <= 1 ? envolver(unicode(n.izq)) : unicode(n.izq)}/${pd <= 2 ? envolver(unicode(n.der)) : unicode(n.der)}`;
        case '^': {
          const base = pi <= 4 ? envolver(unicode(n.izq)) : unicode(n.izq);
          if (n.der.tipo === 'num' && Number.isInteger(n.der.valor) && Math.abs(n.der.valor) < 100) {
            return base + String(n.der.valor).split('').map((c) => SUPER[c]).join('');
          }
          return `${base}^${pd < 5 ? envolver(unicode(n.der)) : unicode(n.der)}`;
        }
      }
      break;
    }
    case 'llamada':
      return `${n.fn === 'sqrt' ? '√' : n.fn}(${n.args.map(unicode).join(', ')})`;
  }
  return '';
}
