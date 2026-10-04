import { describe, expect, it } from 'vitest';
import { dependeDelTiempo, sexpr, type Nodo } from './ast';
import { compilar } from './compile';
import { derivar, VAR_T } from './diff';
import { tex, unicode } from './tex';
import { analizarExpresion, compilarCampo, vectorEvaluacion } from '../field';
import { mulberry32 } from '../aleatorio';

/** V-MAT-11 · la variable temporal t en el lenguaje (SPEC §3.10, §5.2; D-63). */
const PARAMS = ['a', 'w'];
const arbol = (texto: string): Nodo => {
  const r = analizarExpresion(texto, PARAMS);
  if (!r.ok) throw new Error(`${texto}: ${r.error.codigo} ${r.error.mensaje}`);
  return r.arbol;
};
/** p = (a, w, t): t ocupa la ranura que sigue a los parámetros. */
const p = (t: number) => vectorEvaluacion([0.7, 1.3], t);

describe('V-MAT-11 · t en el lenguaje', () => {
  it('t se resuelve como variable temporal en la ranura nParámetros', () => {
    const a = arbol('t');
    expect(a).toMatchObject({ tipo: 'tiempo', indice: 2 });
    expect(compilar(a)(0, 0, 0, p(4.25))).toBe(4.25);
    const sinParametros = analizarExpresion('t', []);
    expect(sinParametros.ok && sinParametros.arbol).toMatchObject({ tipo: 'tiempo', indice: 0 });
  });

  it('t no cuenta como parámetro usado (que no pueda declararse como tal lo prueba state.test.ts)', () => {
    const r = analizarExpresion('a*sin(w*t)', PARAMS);
    expect(r.ok && [...r.usados].sort()).toEqual(['a', 'w']);
  });

  it('sugerencias: «xt» → x*t y «t2» → t*2', () => {
    for (const [texto, sugerido] of [['xt', 'x*t'], ['t2', 't*2']] as const) {
      const r = analizarExpresion(texto, PARAMS);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.sugerencias).toContainEqual({ tipo: 'reescribir', texto: sugerido });
    }
  });

  it('dependeDelTiempo distingue los campos estacionarios', () => {
    expect(dependeDelTiempo(arbol('x*y + sin(a)'))).toBe(false);
    expect(dependeDelTiempo(arbol('x + 0*t'))).toBe(true);
    const est = compilarCampo({ P: '-y', Q: 'x', R: 'a' }, PARAMS);
    const tem = compilarCampo({ P: 'a*cos(w*t)', Q: 'a*sin(w*t)', R: '0' }, PARAMS);
    expect(est.ok && est.campo.dependeDelTiempo).toBe(false);
    expect(est.ok && est.campo.dFdt).toBeNull();
    expect(tem.ok && tem.campo.dependeDelTiempo).toBe(true);
  });

  it('∂/∂x, ∂/∂y, ∂/∂z tratan t como constante; ∂t/∂t = 1; ∂r/∂t = ∂ρ/∂t = 0', () => {
    for (const eje of [0, 1, 2] as const) expect(sexpr(derivar(arbol('t'), eje))).toBe('0');
    expect(sexpr(derivar(arbol('t'), VAR_T))).toBe('1');
    expect(sexpr(derivar(arbol('r + rho'), VAR_T))).toBe('0');
    expect(sexpr(derivar(arbol('x*t^2'), 0))).toBe('(^ t 2)');
    expect(sexpr(derivar(arbol('x*t^2'), VAR_T))).toBe('(* x (* 2 t))');
  });

  it('exponente temporal: ∂(x^t)/∂t = x^t·ln x y ∂(x^t)/∂x = t·x^(t−1)', () => {
    const a = arbol('x^t');
    const dt = compilar(derivar(a, VAR_T));
    const dx = compilar(derivar(a, 0));
    const [x, t] = [1.7, 0.6];
    expect(dt(x, 0, 0, p(t))).toBeCloseTo(Math.pow(x, t) * Math.log(x), 14);
    expect(dx(x, 0, 0, p(t))).toBeCloseTo(t * Math.pow(x, t - 1), 14);
  });

  it('TeX y Unicode escriben t; la ida y vuelta conserva el árbol', () => {
    const a = arbol('a*sin(w*t - x)');
    expect(tex(a)).toContain('t');
    expect(unicode(a)).toBe('a·sin(ω·t − x)'.replace('ω', 'w'));
    expect(sexpr(arbol(unicode(a)))).toBe(sexpr(a));
  });

  it('∂F/∂t compilada en el campo: viento giratorio', () => {
    const r = compilarCampo({ P: 'a*cos(w*t)', Q: 'a*sin(w*t)', R: '0' }, PARAMS);
    if (!r.ok || !r.campo.dFdt) throw new Error('sin ∂F/∂t');
    const out = new Float64Array(3);
    const t = 0.9;
    r.campo.dFdt(0.3, -1, 2, p(t), out, 0);
    expect(out[0]).toBeCloseTo(-0.7 * 1.3 * Math.sin(1.3 * t), 14);
    expect(out[1]).toBeCloseTo(0.7 * 1.3 * Math.cos(1.3 * t), 14);
    expect(out[2]).toBe(0);
  });
});

/** Expresiones suaves con t para comparar ∂/∂t simbólica con diferencias finitas en t (T-03). */
function expresionConT(azar: () => number, profundidad: number): string {
  const hojas = ['x', 'y', 'z', 't', 't', 'a', '2', '0.5'];
  if (profundidad <= 0 || azar() < 0.25) return hojas[Math.floor(azar() * hojas.length)] as string;
  const e = () => expresionConT(azar, profundidad - 1);
  const opciones = [
    () => `(${e()}+${e()})`,
    () => `(${e()}-${e()})`,
    () => `(${e()}*${e()})`,
    () => `(${e()})/(2+(${e()})^2)`,
    () => `sin(${e()})`,
    () => `cos(w*${e()})`,
    () => `exp(0.3*${e()})`,
    () => `atan(${e()})`,
    () => `tanh(${e()})`,
    () => `sqrt(1+${e()}^2)`,
    () => `(${e()})^3`,
    () => `(1.5+sin(${e()}))^(${e()})`, // base positiva: exponente variable (también temporal)
  ];
  return (opciones[Math.floor(azar() * opciones.length)] as () => string)();
}

/**
 * Derivada numérica por extrapolación de Richardson de dos diferencias centradas, R(h) =
 * (4·D(h/2) − D(h))/3 (orden 4). Devuelve NaN si dos extrapolaciones (h y h/2) no coinciden:
 * entonces la propia referencia numérica no es fiable (oscilación rápida como sin(t⁶)).
 */
function richardson(g: (u: number) => number, u: number): number {
  const D = (h: number) => (g(u + h) - g(u - h)) / (u + h - (u - h));
  const R = (h: number) => (4 * D(h / 2) - D(h)) / 3;
  const h = 2 ** -10 * Math.max(1, Math.abs(u));
  const [a, b] = [R(h), R(h / 2)];
  return Math.abs(a - b) <= 1e-8 * (1 + Math.abs(b)) ? b : NaN;
}

describe('V-MAT-11 · ∂/∂t simbólica frente a diferencias finitas en t', () => {
  it('300 expresiones aleatorias con t × 10 puntos (T-03); las espaciales siguen tratando t como constante', () => {
    const azar = mulberry32(11);
    let comparaciones = 0;
    let descartadas = 0;
    for (let i = 0; i < 300; i++) {
      const texto = expresionConT(azar, 4);
      const a = arbol(texto);
      const f = compilar(a);
      const dts = compilar(derivar(a, VAR_T));
      const dxs = compilar(derivar(a, 0));
      for (let k = 0; k < 10; k++) {
        const q = [azar() * 3 - 1.5, azar() * 3 - 1.5, azar() * 3 - 1.5] as [number, number, number];
        const t = azar() * 4 - 2;
        const nt = richardson((u) => f(q[0], q[1], q[2], p(u)), t);
        const nx = richardson((u) => f(u, q[1], q[2], p(t)), q[0]);
        const st = dts(q[0], q[1], q[2], p(t));
        const sx = dxs(q[0], q[1], q[2], p(t));
        for (const [s, n, que] of [[st, nt, '∂t'], [sx, nx, '∂x']] as const) {
          if (!Number.isFinite(s)) continue;
          if (!Number.isFinite(n)) {
            descartadas++;
            continue;
          }
          expect(Math.abs(s - n), `${texto} ${que} en ${q}, t = ${t}`).toBeLessThanOrEqual(1e-6 * (1 + Math.abs(s)));
          comparaciones++;
        }
      }
    }
    expect(comparaciones).toBeGreaterThan(5000);
    // La referencia numérica solo se descarta en una fracción pequeña de los puntos.
    expect(descartadas).toBeLessThan(0.05 * comparaciones);
  });
});
