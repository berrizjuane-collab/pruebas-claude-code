/**
 * Analizador sintáctico por descenso recursivo (MAT-02), gramática de SPEC §5.2:
 *
 *   suma     = producto { ("+" | "-") producto }
 *   producto = unario { ("*" | "/" | implícita) unario }
 *   unario   = ("+" | "-") unario | potencia
 *   potencia = primario [ "^" unario ]          (asociativa a la derecha)
 *   primario = número | identificador | función "(" args ")" | "(" suma ")"
 *
 * Multiplicación implícita solo tras un número (2x, 3(x+1)) y entre paréntesis «)(».
 */
import { ALIAS_FUNCIONES, contarNodos, FUNCIONES, type Nodo } from './ast';
import { crearError, FalloAnalisis, LIMITES_EXPRESION, type AvisoExpresion, type ErrorExpresion } from './errores';
import { lexico, type Token } from './lexer';

export type ResultadoAnalisis = { ok: true; arbol: Nodo; avisos: AvisoExpresion[] } | { ok: false; error: ErrorExpresion };

const describir = (t: Token) => (t.tipo === 'fin' ? 'el final' : `«${t.texto}»`);

class Analizador {
  private i = 0;
  private profundidad = 0;
  readonly avisos: AvisoExpresion[] = [];

  constructor(private readonly tokens: Token[]) {}

  private get actual(): Token {
    return this.tokens[this.i] as Token;
  }

  private anterior(): Token | undefined {
    return this.tokens[this.i - 1];
  }

  private avanzar(): Token {
    const t = this.actual;
    this.i++;
    return t;
  }

  private entrar(t: Token) {
    if (++this.profundidad > LIMITES_EXPRESION.profundidad) {
      throw new FalloAnalisis(
        crearError('DEMASIADO_PROFUNDA', `La expresión está demasiado anidada (máximo ${LIMITES_EXPRESION.profundidad} niveles)`, t.ini, t.fin),
      );
    }
  }

  private salir() {
    this.profundidad--;
  }

  /** Error de «falta algo»: incompleta si el token problemático es el final. */
  private faltaOperando(t: Token, tras: string): never {
    if (t.tipo === 'fin') {
      throw new FalloAnalisis(crearError('INCOMPLETA', `Expresión incompleta: falta un operando ${tras}`, t.ini, t.fin));
    }
    throw new FalloAnalisis(crearError('SIMBOLO_INESPERADO', `Símbolo inesperado ${describir(t)} en la posición ${t.ini + 1}`, t.ini, t.fin));
  }

  analizarTodo(): Nodo {
    if (this.actual.tipo === 'fin') {
      throw new FalloAnalisis(crearError('VACIA', 'Escribe una expresión', 0, 0));
    }
    const arbol = this.suma();
    const t = this.actual;
    if (t.tipo !== 'fin') {
      if (t.tipo === ')') {
        throw new FalloAnalisis(crearError('SIMBOLO_INESPERADO', `Sobra un «)» en la posición ${t.ini + 1}`, t.ini, t.fin));
      }
      throw new FalloAnalisis(crearError('FALTA_OPERADOR', `Falta un operador antes de ${describir(t)} (posición ${t.ini + 1})`, t.ini, t.fin));
    }
    return arbol;
  }

  private suma(): Nodo {
    let izq = this.producto();
    while (this.actual.tipo === 'op' && (this.actual.texto === '+' || this.actual.texto === '-')) {
      const op = this.avanzar();
      const der = this.producto();
      izq = { tipo: 'bin', op: op.texto as '+' | '-', izq, der, ini: izq.ini, fin: der.fin };
    }
    return izq;
  }

  private producto(): Nodo {
    let izq = this.unario();
    let huboDivision = false;
    for (;;) {
      const t = this.actual;
      if (t.tipo === 'op' && (t.texto === '*' || t.texto === '/')) {
        this.avanzar();
        if (t.texto === '/') huboDivision = true;
        const der = this.unario();
        izq = { tipo: 'bin', op: t.texto as '*' | '/', izq, der, ini: izq.ini, fin: der.fin };
        continue;
      }
      if (t.tipo === 'num' || t.tipo === 'id' || t.tipo === '(') {
        const previo = this.anterior();
        const implicita = previo?.tipo === 'num' ? t.tipo !== 'num' : previo?.tipo === ')' && t.tipo === '(';
        if (!implicita) {
          const sugerencia =
            previo && (previo.tipo === 'id' || previo.tipo === 'num')
              ? [{ tipo: 'reescribir' as const, texto: `${previo.texto}*${t.texto}` }]
              : [];
          throw new FalloAnalisis(
            crearError('FALTA_OPERADOR', `Falta un operador entre ${previo ? describir(previo) : 'la expresión'} y ${describir(t)}`, t.ini, t.fin, sugerencia),
          );
        }
        const der = this.unario();
        if (huboDivision) {
          this.avisos.push({
            codigo: 'DIVISION_IMPLICITA',
            mensaje: 'Se interpreta como (a/b)·c: la multiplicación implícita no agrupa el denominador',
            ini: izq.ini ?? 0,
            fin: der.fin ?? 0,
          });
        }
        izq = { tipo: 'bin', op: '*', izq, der, ini: izq.ini, fin: der.fin };
        continue;
      }
      return izq;
    }
  }

  private unario(): Nodo {
    const t = this.actual;
    if (t.tipo === 'op' && (t.texto === '-' || t.texto === '+')) {
      this.avanzar();
      this.entrar(t);
      if (this.actual.tipo === 'fin') this.faltaOperando(this.actual, `tras «${t.texto}»`);
      const arg = this.unario();
      this.salir();
      return t.texto === '-' ? { tipo: 'neg', arg, ini: t.ini, fin: arg.fin } : arg;
    }
    return this.potencia();
  }

  private potencia(): Nodo {
    const base = this.primario();
    const t = this.actual;
    if (t.tipo === 'op' && t.texto === '^') {
      this.avanzar();
      this.entrar(t);
      if (this.actual.tipo === 'fin') this.faltaOperando(this.actual, 'tras «^»');
      const exp = this.unario();
      this.salir();
      return { tipo: 'bin', op: '^', izq: base, der: exp, ini: base.ini, fin: exp.fin };
    }
    return base;
  }

  private primario(): Nodo {
    const t = this.actual;
    if (t.tipo === 'num') {
      this.avanzar();
      return { tipo: 'num', valor: t.valor as number, ini: t.ini, fin: t.fin };
    }
    if (t.tipo === '(') {
      this.avanzar();
      this.entrar(t);
      if (this.actual.tipo === 'fin') {
        throw new FalloAnalisis(crearError('INCOMPLETA', 'Expresión incompleta: falta «)»', this.actual.ini, this.actual.fin));
      }
      if (this.actual.tipo === ')') {
        throw new FalloAnalisis(crearError('SIMBOLO_INESPERADO', 'Paréntesis vacíos: falta una expresión', t.ini, this.actual.fin));
      }
      const dentro = this.suma();
      this.salir();
      const cierre = this.actual;
      if (cierre.tipo !== ')') {
        if (cierre.tipo === 'fin') throw new FalloAnalisis(crearError('INCOMPLETA', 'Expresión incompleta: falta «)»', cierre.ini, cierre.fin));
        throw new FalloAnalisis(crearError('FALTA_OPERADOR', `Falta un operador o «)» antes de ${describir(cierre)}`, cierre.ini, cierre.fin));
      }
      this.avanzar();
      return { ...dentro, ini: t.ini, fin: cierre.fin };
    }
    if (t.tipo === 'id') {
      this.avanzar();
      // Búsquedas con Object.hasOwn: «constructor» o «__proto__» nunca resuelven al prototipo.
      const nombre = Object.hasOwn(ALIAS_FUNCIONES, t.texto) ? (ALIAS_FUNCIONES[t.texto] as string) : t.texto;
      const esFuncion = Object.hasOwn(FUNCIONES, nombre);
      if (this.actual.tipo === '(') {
        if (!esFuncion) {
          const conocida = /^(x|y|z|r|rho|pi|e|t)$/.test(t.texto);
          throw new FalloAnalisis(
            crearError(
              conocida ? 'NO_ES_FUNCION' : 'FUNCION_NO_PERMITIDA',
              conocida
                ? `«${t.texto}» no es una función; para multiplicar escribe ${t.texto}*(…)`
                : `«${t.texto}» no está disponible. Funciones: ${Object.keys(FUNCIONES).join(', ')}`,
              t.ini,
              t.fin,
              conocida ? [{ tipo: 'reescribir', texto: `${t.texto}*(` }] : [],
            ),
          );
        }
        return this.llamada(t, nombre as keyof typeof FUNCIONES);
      }
      if (esFuncion) {
        throw new FalloAnalisis(
          crearError('FUNCION_SIN_PARENTESIS', `${t.texto} necesita paréntesis: ${t.texto}(…)`, t.ini, t.fin, [
            { tipo: 'reescribir', texto: `${t.texto}(` },
          ]),
        );
      }
      return { tipo: 'id', nombre: t.texto, ini: t.ini, fin: t.fin };
    }
    if (t.tipo === 'fin') {
      const previo = this.anterior();
      throw new FalloAnalisis(
        crearError('INCOMPLETA', `Expresión incompleta: falta un operando${previo ? ` tras «${previo.texto}»` : ''}`, t.ini, t.fin),
      );
    }
    throw new FalloAnalisis(crearError('SIMBOLO_INESPERADO', `Símbolo inesperado ${describir(t)} en la posición ${t.ini + 1}`, t.ini, t.fin));
  }

  private llamada(nombreTok: Token, fn: keyof typeof FUNCIONES): Nodo {
    const apertura = this.avanzar(); // «(»
    this.entrar(apertura);
    const args: Nodo[] = [];
    if (this.actual.tipo === ')') {
      throw new FalloAnalisis(crearError('ARIDAD', this.mensajeAridad(fn), nombreTok.ini, this.actual.fin));
    }
    for (;;) {
      if (this.actual.tipo === 'fin') {
        throw new FalloAnalisis(crearError('INCOMPLETA', `Expresión incompleta: falta «)» de ${fn}`, this.actual.ini, this.actual.fin));
      }
      args.push(this.suma());
      const t = this.actual;
      if (t.tipo === ',') {
        this.avanzar();
        continue;
      }
      if (t.tipo === ')') break;
      if (t.tipo === 'fin') throw new FalloAnalisis(crearError('INCOMPLETA', `Expresión incompleta: falta «)» de ${fn}`, t.ini, t.fin));
      throw new FalloAnalisis(crearError('FALTA_OPERADOR', `Falta «,» u «)» antes de ${describir(t)}`, t.ini, t.fin));
    }
    const cierre = this.avanzar();
    this.salir();
    const [min, max] = FUNCIONES[fn];
    if (args.length < min || args.length > max) {
      throw new FalloAnalisis(crearError('ARIDAD', this.mensajeAridad(fn), nombreTok.ini, cierre.fin));
    }
    return { tipo: 'llamada', fn, args, ini: nombreTok.ini, fin: cierre.fin };
  }

  private mensajeAridad(fn: keyof typeof FUNCIONES): string {
    const [min, max] = FUNCIONES[fn];
    const firmas: Partial<Record<keyof typeof FUNCIONES, string>> = { atan2: ' (y, x)', pow: ' (base, exponente)', min: ' (a, b)', max: ' (a, b)' };
    const n = min === max ? `${min}` : `${min} o ${max}`;
    return `${fn} necesita ${n} argumento${max > 1 ? 's' : ''}${firmas[fn] ?? ''}`;
  }
}

/** Analiza el texto (sin resolver identificadores). */
export function analizarSintaxis(texto: string): ResultadoAnalisis {
  if (texto.length > LIMITES_EXPRESION.caracteres) {
    return {
      ok: false,
      error: crearError('DEMASIADO_LARGA', `La expresión es demasiado larga (máximo ${LIMITES_EXPRESION.caracteres} caracteres)`, LIMITES_EXPRESION.caracteres, texto.length),
    };
  }
  try {
    const a = new Analizador(lexico(texto));
    const arbol = a.analizarTodo();
    if (contarNodos(arbol) > LIMITES_EXPRESION.nodos) {
      return { ok: false, error: crearError('DEMASIADOS_NODOS', `La expresión es demasiado grande (máximo ${LIMITES_EXPRESION.nodos} nodos)`, 0, texto.length) };
    }
    return { ok: true, arbol, avisos: a.avisos };
  } catch (e) {
    if (e instanceof FalloAnalisis) return { ok: false, error: e.error };
    if (e instanceof RangeError) {
      return { ok: false, error: crearError('DEMASIADO_PROFUNDA', 'La expresión está demasiado anidada', 0, texto.length) };
    }
    throw e;
  }
}
