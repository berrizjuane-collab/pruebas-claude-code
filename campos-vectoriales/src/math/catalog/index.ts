/**
 * Catálogo inicial (SPEC §4). Cada campo se define por expresiones del lenguaje propio y,
 * de forma independiente, por un oráculo nativo con su jacobiana analítica: las pruebas
 * contrastan uno con otro (SPEC §4.8).
 */
import type { DeclParametro, EspecSemillas, EvaluadorCampo, EvaluadorJacobiana, Vec3 } from '../tipos';

export type IdCampo = 'uniforme' | 'radial-saliente' | 'radial-entrante' | 'rotacional' | 'helicoidal' | 'silla';

export type MarcaEquilibrio =
  | { tipo: 'punto'; p: Vec3 }
  | { tipo: 'recta'; punto: Vec3; dir: Vec3 }
  | { tipo: 'espacio' };

/** Textos de la ficha. Admiten matemáticas en línea entre `$…$` (TeX). */
export interface TextosFicha {
  resumen: string;
  divergencia: string;
  rotacional: string;
  equilibrios: string;
  lineas: string;
  potencial: string;
  interpretacion: string;
  supuestos: string;
}

export interface CampoCatalogo {
  id: IdCampo;
  nombre: string;
  expresiones: { P: string; Q: string; R: string };
  parametros: readonly DeclParametro[];
  semillas: EspecSemillas;
  /** TeX de la definición, con los parámetros por su nombre. */
  tex: string;
  F: EvaluadorCampo;
  J: EvaluadorJacobiana;
  equilibrios: (p: Float64Array) => MarcaEquilibrio[];
  ficha: TextosFicha;
}

const param = (nombre: string, valor: number, min: number, max: number, paso: number): DeclParametro => ({
  nombre,
  valor,
  min,
  max,
  paso,
  porDefecto: valor,
});

/** J constante en orden de filas. */
const jConstante =
  (f: (p: Float64Array) => readonly number[]): EvaluadorJacobiana =>
  (_x, _y, _z, p, out, o) => {
    const j = f(p);
    for (let i = 0; i < 9; i++) out[o + i] = j[i] as number;
  };

const EJE_Z: MarcaEquilibrio = { tipo: 'recta', punto: [0, 0, 0], dir: [0, 0, 1] };

export const CATALOGO: readonly CampoCatalogo[] = [
  {
    id: 'uniforme',
    nombre: 'Uniforme',
    expresiones: { P: 'a', Q: 'b', R: 'c' },
    parametros: [param('a', 1, -3, 3, 0.1), param('b', 0, -3, 3, 0.1), param('c', 0, -3, 3, 0.1)],
    semillas: { tipo: 'rejilla', plano: 'YZ', c: -1.9, nu: 5, nv: 5 },
    tex: '\\mathbf F = (a,\\; b,\\; c)',
    F: (_x, _y, _z, p, out, o) => {
      out[o] = p[0] as number;
      out[o + 1] = p[1] as number;
      out[o + 2] = p[2] as number;
    },
    J: jConstante(() => [0, 0, 0, 0, 0, 0, 0, 0, 0]),
    equilibrios: (p) => (p[0] === 0 && p[1] === 0 && p[2] === 0 ? [{ tipo: 'espacio' }] : []),
    ficha: {
      resumen: 'El mismo vector en todos los puntos: una traslación pura.',
      divergencia: '$\\nabla\\cdot\\mathbf F = 0$',
      rotacional: '$\\nabla\\times\\mathbf F = \\mathbf 0$',
      equilibrios: 'Ninguno si $(a,b,c)\\neq\\mathbf 0$; todo el espacio si $(a,b,c)=\\mathbf 0$.',
      lineas: 'Rectas paralelas $\\mathbf r(s)=\\mathbf r_0+s\\,(a,b,c)$.',
      potencial: '$\\varphi = ax+by+cz$',
      interpretacion:
        'Referencia cero: todas las flechas tienen igual dirección, longitud y luminancia. Sirve para calibrar la lectura de la magnitud.',
      supuestos:
        'Como velocidad: traslación uniforme de un fluido. Como fuerza: fuerza constante (p. ej. el peso cerca del suelo); las partículas de la aplicación siguen $\\dot{\\mathbf r}=\\mathbf F$, no $m\\ddot{\\mathbf r}=\\mathbf F$.',
    },
  },
  {
    id: 'radial-saliente',
    nombre: 'Radial saliente',
    expresiones: { P: 'k*x', Q: 'k*y', R: 'k*z' },
    parametros: [param('k', 1, 0.1, 3, 0.05)],
    semillas: { tipo: 'aleatoria', n: 32, semilla: 1 },
    tex: '\\mathbf F = k\\,(x,\\; y,\\; z)',
    F: (x, y, z, p, out, o) => {
      const k = p[0] as number;
      out[o] = k * x;
      out[o + 1] = k * y;
      out[o + 2] = k * z;
    },
    J: jConstante((p) => {
      const k = p[0] as number;
      return [k, 0, 0, 0, k, 0, 0, 0, k];
    }),
    equilibrios: () => [{ tipo: 'punto', p: [0, 0, 0] }],
    ficha: {
      resumen: 'Flechas que se alejan del origen; la magnitud crece linealmente con la distancia.',
      divergencia: '$\\nabla\\cdot\\mathbf F = 3k$ en todo punto',
      rotacional: '$\\nabla\\times\\mathbf F = \\mathbf 0$',
      equilibrios: 'El origen: nodo inestable (fuente), autovalores $k,k,k>0$.',
      lineas: 'Semirrectas desde el origen; $\\mathbf r(s)=\\mathbf r_0\\,e^{ks}$.',
      potencial: '$\\varphi = \\tfrac k2\\lVert\\mathbf r\\rVert^2$',
      interpretacion:
        'La divergencia es la misma en todas partes: es una fuente distribuida, no puntual. El flujo por la esfera de radio $R$ vale $4\\pi R^3k = 3k\\cdot\\tfrac43\\pi R^3$ (teorema de Gauss).',
      supuestos:
        'Velocidad de una expansión uniforme con tasa $k$ (descripción cinemática). No es el campo de una carga puntual, que es $\\propto\\mathbf r/\\lVert\\mathbf r\\rVert^3$ y tiene divergencia nula fuera del origen.',
    },
  },
  {
    id: 'radial-entrante',
    nombre: 'Radial entrante',
    expresiones: { P: '-k*x', Q: '-k*y', R: '-k*z' },
    parametros: [param('k', 1, 0.1, 3, 0.05)],
    semillas: { tipo: 'aleatoria', n: 32, semilla: 1 },
    tex: '\\mathbf F = -k\\,(x,\\; y,\\; z)',
    F: (x, y, z, p, out, o) => {
      const k = p[0] as number;
      out[o] = -k * x;
      out[o + 1] = -k * y;
      out[o + 2] = -k * z;
    },
    J: jConstante((p) => {
      const k = -(p[0] as number);
      return [k, 0, 0, 0, k, 0, 0, 0, k];
    }),
    equilibrios: () => [{ tipo: 'punto', p: [0, 0, 0] }],
    ficha: {
      resumen: 'Flechas hacia el origen, cada vez más cortas al acercarse.',
      divergencia: '$\\nabla\\cdot\\mathbf F = -3k$',
      rotacional: '$\\nabla\\times\\mathbf F = \\mathbf 0$',
      equilibrios: 'El origen: nodo estable (sumidero).',
      lineas:
        'Semirrectas hacia el origen. En el parámetro $s$ lo alcanzan asintóticamente; en longitud de arco, a distancia finita: la integración se detiene al llegar a $\\lVert\\mathbf F\\rVert\\approx 0$.',
      potencial: '$\\varphi = -\\tfrac k2\\lVert\\mathbf r\\rVert^2$',
      interpretacion: 'Simétrico del radial saliente: se invierten el signo de la divergencia y la geometría.',
      supuestos:
        'Compresión uniforme. Como fuerza sería una fuerza restauradora isótropa ($-k\\mathbf r$); el movimiento real ($m\\ddot{\\mathbf r}=-k\\mathbf r$) sería oscilatorio, no el que muestran las partículas.',
    },
  },
  {
    id: 'rotacional',
    nombre: 'Rotacional',
    expresiones: { P: '-omega*y', Q: 'omega*x', R: '0' },
    parametros: [param('omega', 1, -3, 3, 0.05)],
    semillas: { tipo: 'rejilla', plano: 'XZ', c: 0, u: [0.3, 1.9], v: [-1.5, 1.5], nu: 6, nv: 3 },
    tex: '\\mathbf F = \\omega\\,(-y,\\; x,\\; 0)',
    F: (x, y, _z, p, out, o) => {
      const w = p[0] as number;
      out[o] = -w * y;
      out[o + 1] = w * x;
      out[o + 2] = 0;
    },
    J: jConstante((p) => {
      const w = p[0] as number;
      return [0, -w, 0, w, 0, 0, 0, 0, 0];
    }),
    equilibrios: (p) => (p[0] === 0 ? [{ tipo: 'espacio' }] : [EJE_Z]),
    ficha: {
      resumen: 'Giro rígido alrededor del eje $z$: $\\mathbf F=\\omega\\,\\hat z\\times\\mathbf r$.',
      divergencia: '$\\nabla\\cdot\\mathbf F = 0$',
      rotacional: '$\\nabla\\times\\mathbf F = (0,\\,0,\\,2\\omega)$, constante',
      equilibrios: 'El eje $z$ completo: una recta de equilibrios no aislados.',
      lineas:
        'Circunferencias horizontales centradas en el eje; antihorarias vistas desde $+z$ si $\\omega>0$; periodo $2\\pi/\\lvert\\omega\\rvert$.',
      potencial: 'No existe ($\\nabla\\times\\mathbf F\\neq\\mathbf 0$).',
      interpretacion:
        'El rotacional es igual en todas partes, también lejos del eje. Contraste: el vórtice irrotacional $(-y,x,0)/(x^2+y^2)$ también tiene líneas circulares, pero rotacional nulo fuera del eje.',
      supuestos:
        'Velocidad de un sólido rígido que gira con velocidad angular $\\omega$. Una rueda de paletas gira a $\\tfrac12\\cdot 2\\omega=\\omega$, igual que el fluido.',
    },
  },
  {
    id: 'helicoidal',
    nombre: 'Helicoidal',
    expresiones: { P: '-y', Q: 'x', R: 'a' },
    parametros: [param('a', 0.25, -1, 1, 0.05)],
    semillas: { tipo: 'rejilla', plano: 'XZ', c: 0, u: [0.5, 2], v: [0, 0], nu: 4, nv: 1 },
    tex: '\\mathbf F = (-y,\\; x,\\; a)',
    F: (x, y, _z, p, out, o) => {
      out[o] = -y;
      out[o + 1] = x;
      out[o + 2] = p[0] as number;
    },
    J: jConstante(() => [0, -1, 0, 1, 0, 0, 0, 0, 0]),
    equilibrios: (p) => (p[0] === 0 ? [EJE_Z] : []),
    ficha: {
      resumen: 'Giro alrededor de $z$ más una traslación vertical uniforme: movimiento de tornillo.',
      divergencia: '$\\nabla\\cdot\\mathbf F = 0$',
      rotacional: '$\\nabla\\times\\mathbf F = (0,\\,0,\\,2)$',
      equilibrios: 'Ninguno si $a\\neq 0$ ($\\lVert\\mathbf F\\rVert\\ge\\lvert a\\rvert$). Con $a=0$ se reduce al rotacional.',
      lineas:
        'Hélices sobre cilindros $\\rho=\\rho_0$ con paso $2\\pi a$: dextrógiras si $a>0$, levógiras si $a<0$. Longitud por vuelta $2\\pi\\sqrt{\\rho_0^2+a^2}$.',
      potencial: 'No existe.',
      interpretacion:
        'Sumar un campo constante no cambia la divergencia ni el rotacional (son derivadas), pero convierte circunferencias en hélices: las derivadas son locales; la estructura global, no.',
      supuestos: 'Movimiento helicoidal de un sólido rígido: giro más avance a lo largo del eje.',
    },
  },
  {
    id: 'silla',
    nombre: 'Silla',
    expresiones: { P: 'k*x', Q: '-k*y', R: '0' },
    parametros: [param('k', 1, 0.1, 3, 0.05)],
    semillas: { tipo: 'rejilla', plano: 'XY', c: 0, nu: 7, nv: 7 },
    tex: '\\mathbf F = k\\,(x,\\; -y,\\; 0)',
    F: (x, y, _z, p, out, o) => {
      const k = p[0] as number;
      out[o] = k * x;
      out[o + 1] = -k * y;
      out[o + 2] = 0;
    },
    J: jConstante((p) => {
      const k = p[0] as number;
      return [k, 0, 0, 0, -k, 0, 0, 0, 0];
    }),
    equilibrios: (p) => (p[0] === 0 ? [{ tipo: 'espacio' }] : [EJE_Z]),
    ficha: {
      resumen: 'Expansión en $x$, compresión en $y$, nada en $z$: deformación pura.',
      divergencia: '$\\nabla\\cdot\\mathbf F = 0$',
      rotacional: '$\\nabla\\times\\mathbf F = \\mathbf 0$',
      equilibrios: 'El eje $z$; en cada plano horizontal, un punto de silla (autovalores $\\pm k$, y $0$ según $z$).',
      lineas:
        'Hipérbolas $xy=C$ en planos $z=z_0$ (invariante: $\\tfrac{d}{ds}(xy)=0$). Separatrices: $y=0$ (inestable) y $x=0$ (estable).',
      potencial: '$\\varphi = \\tfrac k2\\,(x^2-y^2)$, armónico',
      interpretacion:
        'Divergencia nula aunque las flechas «convergen» en $y$ y «divergen» en $x$: una compensa la otra. Irrotacional aunque las líneas se curvan.',
      supuestos: 'Flujo potencial ideal (incompresible, no viscoso, estacionario) cerca de un punto de estancamiento.',
    },
  },
];

export function campoPorId(id: IdCampo): CampoCatalogo {
  const c = CATALOGO.find((k) => k.id === id);
  if (!c) throw new Error(`Campo desconocido: ${id}`);
  return c;
}

/** Valores de los parámetros en el orden de declaración. */
export function valoresParametros(decl: readonly DeclParametro[]): Float64Array {
  return Float64Array.from(decl.map((d) => d.valor));
}
