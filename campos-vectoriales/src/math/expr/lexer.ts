/**
 * Analizador léxico (MAT-02). Normaliza la escritura matemática habitual: «−» (U+2212) como
 * «-»; «·», «×» y «⋅» como «*»; «π» y las letras griegas como identificadores ASCII.
 */
import { crearError, FalloAnalisis } from './errores';

export type TipoToken = 'num' | 'id' | 'op' | '(' | ')' | ',' | 'fin';

export interface Token {
  tipo: TipoToken;
  texto: string;
  valor?: number;
  ini: number;
  fin: number;
}

export const GRIEGAS: Record<string, string> = {
  α: 'alpha', β: 'beta', γ: 'gamma', δ: 'delta', ε: 'epsilon', ζ: 'zeta', η: 'eta', θ: 'theta', ι: 'iota',
  κ: 'kappa', λ: 'lambda', μ: 'mu', ν: 'nu', ξ: 'xi', π: 'pi', ρ: 'rho', σ: 'sigma', τ: 'tau', υ: 'upsilon',
  φ: 'phi', ϕ: 'phi', χ: 'chi', ψ: 'psi', ω: 'omega',
};

const MULTIPLICACION = new Set(['*', '·', '×', '⋅']);
const SUPERINDICES: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };
const MENOS = new Set(['-', '−']);

const esDigito = (c: string | undefined) => c !== undefined && c >= '0' && c <= '9';
const esInicioId = (c: string | undefined) => c !== undefined && /[A-Za-z_]/.test(c);
const esId = (c: string | undefined) => c !== undefined && /[A-Za-z0-9_]/.test(c);

export function lexico(texto: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = texto.length;
  while (i < n) {
    const c = texto[i] as string;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (esDigito(c) || (c === '.' && esDigito(texto[i + 1]))) {
      const ini = i;
      while (esDigito(texto[i])) i++;
      if (texto[i] === '.') {
        i++;
        while (esDigito(texto[i])) i++;
      }
      // Exponente solo si sigue un dígito (o signo y dígito): «2e» es 2·e.
      if ((texto[i] === 'e' || texto[i] === 'E') && (esDigito(texto[i + 1]) || ((texto[i + 1] === '+' || texto[i + 1] === '-') && esDigito(texto[i + 2])))) {
        i += 2;
        while (esDigito(texto[i])) i++;
      }
      if (texto[i] === '.' && (esDigito(texto[i + 1]) || texto[i - 1] !== '.')) {
        throw new FalloAnalisis(crearError('NUMERO_MAL_FORMADO', `Número mal formado: «${texto.slice(ini, i + 1)}»`, ini, i + 1));
      }
      const fragmento = texto.slice(ini, i);
      tokens.push({ tipo: 'num', texto: fragmento, valor: Number(fragmento), ini, fin: i });
      continue;
    }
    if (esInicioId(c)) {
      const ini = i;
      while (esId(texto[i])) i++;
      tokens.push({ tipo: 'id', texto: texto.slice(ini, i), ini, fin: i });
      continue;
    }
    // Superíndices (x², x⁻¹): equivalen a «^» seguido del exponente entero.
    if (SUPERINDICES[c] || (c === '⁻' && SUPERINDICES[texto[i + 1] as string])) {
      const ini = i;
      tokens.push({ tipo: 'op', texto: '^', ini, fin: ini });
      if (c === '⁻') {
        tokens.push({ tipo: 'op', texto: '-', ini: i, fin: i + 1 });
        i++;
      }
      let digitos = '';
      const iniNum = i;
      while (SUPERINDICES[texto[i] as string]) digitos += SUPERINDICES[texto[i++] as string];
      tokens.push({ tipo: 'num', texto: digitos, valor: Number(digitos), ini: iniNum, fin: i });
      continue;
    }
    if (c === '√') {
      tokens.push({ tipo: 'id', texto: 'sqrt', ini: i, fin: i + 1 });
      i++;
      continue;
    }
    if (GRIEGAS[c]) {
      tokens.push({ tipo: 'id', texto: GRIEGAS[c] as string, ini: i, fin: i + 1 });
      i++;
      continue;
    }
    if (c === '*' && texto[i + 1] === '*') {
      tokens.push({ tipo: 'op', texto: '^', ini: i, fin: i + 2 });
      i += 2;
      continue;
    }
    if (MULTIPLICACION.has(c)) {
      tokens.push({ tipo: 'op', texto: '*', ini: i, fin: i + 1 });
      i++;
      continue;
    }
    if (MENOS.has(c)) {
      tokens.push({ tipo: 'op', texto: '-', ini: i, fin: i + 1 });
      i++;
      continue;
    }
    if (c === '+' || c === '/' || c === '^') {
      tokens.push({ tipo: 'op', texto: c, ini: i, fin: i + 1 });
      i++;
      continue;
    }
    if (c === '(' || c === ')' || c === ',') {
      tokens.push({ tipo: c, texto: c, ini: i, fin: i + 1 });
      i++;
      continue;
    }
    throw new FalloAnalisis(crearError('CARACTER_NO_PERMITIDO', `Carácter no permitido «${c}» en la posición ${i + 1}`, i, i + 1));
  }
  tokens.push({ tipo: 'fin', texto: '', ini: n, fin: n });
  return tokens;
}
