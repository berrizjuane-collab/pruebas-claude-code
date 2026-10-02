import { describe, expect, it } from 'vitest';
import katex from 'katex';
import { sexpr, type Nodo } from './ast';
import { compilar } from './compile';
import { construirChequeoAngulos, derivar } from './diff';
import { tex, unicode } from './tex';
import { analizarExpresion, compilarCampo } from '../field';
import { mulberry32 } from '../aleatorio';

const PARAMS = ['a', 'k', 'omega', 'w'];
const arbol = (texto: string): Nodo => {
  const r = analizarExpresion(texto, PARAMS);
  if (!r.ok) throw new Error(`${texto}: ${r.error.codigo} ${r.error.mensaje}`);
  return r.arbol;
};

/** V-MAT-02: casos válidos → forma S esperada (precedencia, implícita, Unicode, alias…). */
const VALIDOS: [string, string][] = [
  ['1', '1'], ['x', 'x'], ['x+y', '(+ x y)'], ['x-y-z', '(- (- x y) z)'], ['x*y/z', '(/ (* x y) z)'],
  ['-x^2', '(neg (^ x 2))'], ['2^3^2', '(^ 2 (^ 3 2))'], ['2x', '(* 2 x)'], ['3(x+1)', '(* 3 (+ x 1))'],
  ['(x+1)(x-1)', '(* (+ x 1) (- x 1))'], ['x^2y', '(* (^ x 2) y)'], ['1/2x', '(* (/ 1 2) x)'],
  ['2^-1', '(^ 2 (neg 1))'], ['-(x)', '(neg x)'], ['+x', 'x'], ['--x', '(neg (neg x))'], ['x**2', '(^ x 2)'],
  ['2·x', '(* 2 x)'], ['2×x', '(* 2 x)'], ['x−y', '(- x y)'], ['π', 'pi'], ['pi', 'pi'], ['e', 'e'],
  ['e^x', '(^ e x)'], ['exp(x)', '(exp x)'], ['sin(x)', '(sin x)'], ['sen(x)', '(sin x)'], ['log(x)', '(ln x)'],
  ['ln(x)', '(ln x)'], ['log10(x)', '(log10 x)'], ['atan2(y, x)', '(atan2 y x)'], ['hypot(x, y)', '(hypot x y)'],
  ['hypot(x,y,z)', '(hypot x y z)'], ['min(x, y)', '(min x y)'], ['max(x,y)', '(max x y)'], ['pow(x, 3)', '(pow x 3)'],
  ['sqrt(x^2+1)', '(sqrt (+ (^ x 2) 1))'], ['cbrt(x)', '(cbrt x)'], ['abs(x)', '(abs x)'], ['r', 'r'], ['rho', 'rho'],
  ['ρ', 'rho'], ['ω*x', '(* $omega x)'], ['omega*x', '(* $omega x)'], ['k*x', '(* $k x)'], ['.5', '0.5'],
  ['1e-3', '0.001'], ['2.5E2', '250'], ['2e', '(* 2 e)'], ['3pi', '(* 3 pi)'], ['2sin(x)', '(* 2 (sin x))'],
  ['sin(x)^2', '(^ (sin x) 2)'], ['x²', '(^ x 2)'], ['x⁻¹', '(^ x (neg 1))'], ['√(x)', '(sqrt x)'],
  ['x*-y', '(* x (neg y))'], ['x^-y^2', '(^ x (neg (^ y 2)))'], ['(((x)))', 'x'], ['  x  +  y ', '(+ x y)'],
  ['a', '$a'], ['sin(cos(tan(x)))', '(sin (cos (tan x)))'], ['2(x)(y)', '(* (* 2 x) y)'],
  ['asinh(x)+acosh(x)+atanh(x)', '(+ (+ (asinh x) (acosh x)) (atanh x))'], ['x/y/z', '(/ (/ x y) z)'],
  ['-2^2', '(neg (^ 2 2))'], ['x/(y*z)', '(/ x (* y z))'], ['x-(y-z)', '(- x (- y z))'], ['w', '$w'],
];

describe('V-MAT-02 · analizador: casos válidos', () => {
  it(`hay al menos 60 casos (${VALIDOS.length})`, () => expect(VALIDOS.length).toBeGreaterThanOrEqual(60));
  for (const [texto, esperado] of VALIDOS) {
    it(`«${texto}» → ${esperado}`, () => expect(sexpr(arbol(texto))).toBe(esperado));
  }
  it('1/2x avisa de la interpretación (a/b)·c', () => {
    const r = analizarExpresion('1/2x', PARAMS);
    expect(r.ok && r.avisos.map((a) => a.codigo)).toEqual(['DIVISION_IMPLICITA']);
  });
});

/** V-MAT-03: casos inválidos → código, posición y, si procede, sugerencia. */
const INVALIDOS: [string, string, number?][] = [
  ['', 'VACIA'], ['   ', 'VACIA'], ['x+', 'INCOMPLETA', 2], ['x*(', 'INCOMPLETA', 3], ['(x', 'INCOMPLETA', 2],
  ['sin(', 'INCOMPLETA'], ['sin(x', 'INCOMPLETA'], ['2^', 'INCOMPLETA'], ['-', 'INCOMPLETA'], ['atan2(y,', 'INCOMPLETA'],
  ['x^', 'INCOMPLETA'], ['x)', 'SIMBOLO_INESPERADO', 1], ['()', 'SIMBOLO_INESPERADO'], ['x y', 'FALTA_OPERADOR', 2],
  ['2 3', 'FALTA_OPERADOR', 2], [')x', 'SIMBOLO_INESPERADO', 0], ['x$', 'CARACTER_NO_PERMITIDO', 1],
  ['x.y', 'CARACTER_NO_PERMITIDO', 1], ['1.2.3', 'NUMERO_MAL_FORMADO'], ['xy', 'IDENT_DESCONOCIDO', 0],
  ['q*x', 'IDENT_DESCONOCIDO', 0], ['x2', 'IDENT_DESCONOCIDO'], ['t', 'T_RESERVADA'], ['sin', 'FUNCION_SIN_PARENTESIS'],
  ['sin x', 'FUNCION_SIN_PARENTESIS'], ['sin^2(x)', 'FUNCION_SIN_PARENTESIS'], ['gamma(x)', 'FUNCION_NO_PERMITIDA'],
  ['x(y)', 'NO_ES_FUNCION'], ['atan2(y)', 'ARIDAD'], ['min(x)', 'ARIDAD'], ['hypot(x)', 'ARIDAD'], ['sin(x, y)', 'ARIDAD'],
  ['sin()', 'ARIDAD'], ['x'.repeat(501), 'DEMASIADO_LARGA'], ['('.repeat(70) + 'x' + ')'.repeat(70), 'DEMASIADO_PROFUNDA'],
  ['-'.repeat(70) + 'x', 'DEMASIADO_PROFUNDA'], ['x+*y', 'SIMBOLO_INESPERADO', 2], ['x,y', 'FALTA_OPERADOR', 1],
  ['constructor', 'IDENT_DESCONOCIDO'], ['__proto__', 'IDENT_DESCONOCIDO'], ["'a'", 'CARACTER_NO_PERMITIDO'],
  ['[1]', 'CARACTER_NO_PERMITIDO'], ['x;y', 'CARACTER_NO_PERMITIDO'], ['a=1', 'CARACTER_NO_PERMITIDO'],
  ['x=>x', 'CARACTER_NO_PERMITIDO'], ['eval(x)', 'FUNCION_NO_PERMITIDA'], ['Function(x)', 'FUNCION_NO_PERMITIDA'],
  ['toString', 'IDENT_DESCONOCIDO'], ['hasOwnProperty(x)', 'FUNCION_NO_PERMITIDA'], ['constructor(x)', 'FUNCION_NO_PERMITIDA'],
  ['sin(x))', 'SIMBOLO_INESPERADO'],
];

describe('V-MAT-03 · analizador: casos inválidos', () => {
  it(`hay al menos 40 casos (${INVALIDOS.length})`, () => expect(INVALIDOS.length).toBeGreaterThanOrEqual(40));
  for (const [texto, codigo, ini] of INVALIDOS) {
    it(`«${texto.slice(0, 24)}» → ${codigo}`, () => {
      const r = analizarExpresion(texto, PARAMS);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.codigo).toBe(codigo);
      expect(r.error.incompleta).toBe(codigo === 'INCOMPLETA');
      if (ini !== undefined) expect(r.error.ini).toBe(ini);
      expect(r.error.mensaje.length).toBeGreaterThan(5);
    });
  }
  it('sugerencias: x*y, x*2 y añadir parámetro', () => {
    const xy = analizarExpresion('xy', PARAMS);
    expect(!xy.ok && xy.error.sugerencias).toContainEqual({ tipo: 'reescribir', texto: 'x*y' });
    const x2 = analizarExpresion('x2', PARAMS);
    expect(!x2.ok && x2.error.sugerencias).toContainEqual({ tipo: 'reescribir', texto: 'x*2' });
    const q = analizarExpresion('q*x', PARAMS);
    expect(!q.ok && q.error.sugerencias).toContainEqual({ tipo: 'parametro', nombre: 'q' });
    const xEsp = analizarExpresion('x y', PARAMS);
    expect(!xEsp.ok && xEsp.error.sugerencias).toContainEqual({ tipo: 'reescribir', texto: 'x*y' });
  });
});

describe('V-MAT-04 · seguridad y límites', () => {
  it('10 000 entradas aleatorias: nunca una excepción no controlada y < 5 ms cada una', () => {
    const azar = mulberry32(4);
    const alfabeto = 'xyzrhotpie0123456789.+-*/^(),  sincoqrtabmlg_$#·−²√ωπ[]{};=\'"`';
    let peor = 0;
    for (let i = 0; i < 10000; i++) {
      const largo = Math.floor(azar() * 60);
      let s = '';
      for (let k = 0; k < largo; k++) s += alfabeto[Math.floor(azar() * alfabeto.length)];
      const t0 = performance.now();
      const r = analizarExpresion(s, PARAMS);
      let ms = performance.now() - t0;
      // Un valor atípico puede deberse al JIT o al recolector: se repite y se toma el mínimo.
      for (let rep = 0; rep < 3 && ms >= 5; rep++) {
        const t1 = performance.now();
        analizarExpresion(s, PARAMS);
        ms = Math.min(ms, performance.now() - t1);
      }
      peor = Math.max(peor, ms);
      expect(typeof r.ok).toBe('boolean');
      if (r.ok) expect(() => compilar(r.arbol)(0.3, -0.7, 1.1, Float64Array.of(1, 2, 3, 4))).not.toThrow();
    }
    expect(peor).toBeLessThan(5);
  });

  it('ningún identificador alcanza propiedades de objetos JS', () => {
    for (const nombre of ['constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty', 'prototype']) {
      const r = analizarExpresion(nombre, PARAMS);
      expect(r.ok).toBe(false);
    }
  });
});

describe('V-MAT-05 (parcial) · evaluación', () => {
  it('precedencia y valores numéricos', () => {
    const p = Float64Array.of(2, 3, 1, 0.5);
    const casos: [string, number][] = [
      ['-2^2', -4], ['2^3^2', 512], ['1/2x', 0.5 * 0.3], ['2x^2', 2 * 0.09], ['a*x+k', 2 * 0.3 + 3], ['r', Math.hypot(0.3, -0.4, 1.2)],
      ['rho', Math.hypot(0.3, -0.4)], ['x^(1/3)', Math.pow(0.3, 1 / 3)], ['cbrt(-8)', -2], ['atan2(y,x)', Math.atan2(-0.4, 0.3)],
    ];
    for (const [texto, esperado] of casos) expect(compilar(arbol(texto))(0.3, -0.4, 1.2, p)).toBeCloseTo(esperado, 14);
    expect(Number.isNaN(compilar(arbol('(-8)^(1/3)'))(0, 0, 0, p))).toBe(true);
    expect(Number.isNaN(compilar(arbol('sqrt(x)'))(-1, 0, 0, p))).toBe(true);
  });
});

describe('V-MAT-06 · ida y vuelta y TeX', () => {
  for (const [texto] of VALIDOS) {
    it(`«${texto}»: analizar(unicode(árbol)) ≡ árbol y KaTeX lo renderiza`, () => {
      const a = arbol(texto);
      const u = unicode(a);
      expect(sexpr(arbol(u)), u).toBe(sexpr(a));
      expect(() => katex.renderToString(tex(a), { throwOnError: true, strict: 'ignore' })).not.toThrow();
    });
  }
});

/** Derivada numérica centrada con pasos efectivos (SPEC §5.4). */
function dfNumerica(f: (v: number[]) => number, q: number[], j: number): number {
  const h = Math.cbrt(2 ** -52) * Math.max(Math.abs(q[j] as number), 1);
  const a = [...q];
  const b = [...q];
  a[j] = (q[j] as number) + h;
  b[j] = (q[j] as number) - h;
  return (f(a) - f(b)) / ((a[j] as number) - (b[j] as number));
}

/** Generador de expresiones suaves y acotadas en [−1.5, 1.5]³ para V-MAT-08. */
function expresionAleatoria(azar: () => number, profundidad: number): string {
  const hojas = ['x', 'y', 'z', 'a', '2', '0.5', '3'];
  if (profundidad <= 0 || azar() < 0.25) return hojas[Math.floor(azar() * hojas.length)] as string;
  const e = () => expresionAleatoria(azar, profundidad - 1);
  const opciones = [
    () => `(${e()}+${e()})`,
    () => `(${e()}-${e()})`,
    () => `(${e()}*${e()})`,
    () => `(${e()})/(2+(${e()})^2)`, // denominador ≥ 2: la función es suave
    () => `sin(${e()})`,
    () => `cos(${e()})`,
    () => `exp(0.3*${e()})`,
    () => `atan(${e()})`,
    () => `tanh(${e()})`,
    () => `sqrt(1+${e()}^2)`,
    () => `(${e()})^2`,
    () => `(${e()})^3`,
    () => `hypot(${e()}, 1)`,
  ];
  return (opciones[Math.floor(azar() * opciones.length)] as () => string)();
}

describe('V-MAT-08 · derivadas simbólicas frente a diferencias finitas', () => {
  it('500 expresiones aleatorias × 20 puntos (T-03)', () => {
    const azar = mulberry32(8);
    const p = Float64Array.of(0.7, 1, 1, 1);
    let comparaciones = 0;
    for (let i = 0; i < 500; i++) {
      const texto = expresionAleatoria(azar, 4);
      const a = arbol(texto);
      const f = compilar(a);
      const derivadas = ([0, 1, 2] as const).map((eje) => compilar(derivar(a, eje)));
      for (let k = 0; k < 20; k++) {
        const q = [azar() * 3 - 1.5, azar() * 3 - 1.5, azar() * 3 - 1.5];
        for (const eje of [0, 1, 2] as const) {
          const s = (derivadas[eje] as ReturnType<typeof compilar>)(q[0] as number, q[1] as number, q[2] as number, p);
          const n = dfNumerica((v) => f(v[0] as number, v[1] as number, v[2] as number, p), q, eje);
          if (!Number.isFinite(s) || !Number.isFinite(n)) continue;
          expect(Math.abs(s - n), `${texto} ∂${'xyz'[eje]} en ${q}`).toBeLessThanOrEqual(1e-6 * (1 + Math.abs(s)));
          comparaciones++;
        }
      }
    }
    expect(comparaciones).toBeGreaterThan(25000);
  });
});

describe('V-MAT-09 · puntos no diferenciables', () => {
  const casos: [string, number[]][] = [
    ['abs(x)', [0, 0.3, 0.1]],
    ['min(x, y)', [0.4, 0.4, 0]],
    ['max(x, y)', [-0.2, -0.2, 1]],
    ['atan2(y, x)', [0, 0, 0.5]],
    ['hypot(x, y)', [0, 0, 2]],
  ];
  for (const [texto, q] of casos) {
    it(`${texto} en (${q.join(', ')}) → punto anguloso`, () => {
      const chequeo = construirChequeoAngulos([arbol(texto)]);
      expect(chequeo(q[0] as number, q[1] as number, q[2] as number, new Float64Array(4))).toBe(true);
      expect(chequeo((q[0] as number) + 0.1, (q[1] as number) + 0.37, q[2] as number, new Float64Array(4))).toBe(false);
    });
  }
});

describe('compilación del campo', () => {
  it('errores por componente y avisos', () => {
    const r = compilarCampo({ P: 'x', Q: 'y+', R: 'q' }, PARAMS);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(Object.keys(r.errores).sort()).toEqual(['Q', 'R']);
      expect(r.errores.Q?.codigo).toBe('INCOMPLETA');
      expect(r.errores.R?.codigo).toBe('IDENT_DESCONOCIDO');
    }
  });

  it('parámetros usados y TeX de cada componente', () => {
    const r = compilarCampo({ P: '-omega*y', Q: 'omega*x', R: '0' }, PARAMS);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect([...r.campo.usados]).toEqual(['omega']);
      expect(r.campo.tex.P).toBe('-\\omega\\,y');
      expect(r.campo.unicode.Q).toBe('ω·x');
    }
  });
});
