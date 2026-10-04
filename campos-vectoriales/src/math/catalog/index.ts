/**
 * Catálogo inicial (SPEC §4). Cada campo se define por expresiones del lenguaje propio y,
 * de forma independiente, por un oráculo nativo con su jacobiana analítica: las pruebas
 * contrastan uno con otro (SPEC §4.8).
 */
import type { DeclParametro, EspecSemillas, EvaluadorCampo, EvaluadorJacobiana, Vec3 } from '../tipos';

export type IdCampo =
  | 'uniforme'
  | 'radial-saliente'
  | 'radial-entrante'
  | 'rotacional'
  | 'helicoidal'
  | 'silla'
  // Campos dependientes del tiempo (1.1, SPEC §4.9).
  | 'viento-giratorio'
  | 'lluvia'
  | 'silla-giratoria';

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
  /** Campos temporales: trayectorias y líneas de traza (SPEC §3.10). */
  trayectorias?: string;
}

export interface CampoCatalogo {
  id: IdCampo;
  nombre: string;
  /** Nombre de una línea para las tarjetas de 56 px (DESIGN §6.1); el nombre completo va en su etiqueta. */
  nombreCorto: string;
  expresiones: { P: string; Q: string; R: string };
  parametros: readonly DeclParametro[];
  semillas: EspecSemillas;
  /** TeX de la definición, con los parámetros por su nombre. */
  tex: string;
  F: EvaluadorCampo;
  J: EvaluadorJacobiana;
  equilibrios: (p: Float64Array) => MarcaEquilibrio[];
  ficha: TextosFicha;
  /**
   * Campos dependientes del tiempo (SPEC §4.9): ventana del reloj, ∂F/∂t analítica y
   * trayectoria exacta (oráculos de V-NUM-17). En F, J y dFdt, t está en p[nParámetros] (D-63).
   */
  tiempo?: {
    inicio: number;
    fin: number;
    dFdt: EvaluadorCampo;
    /** Posición en t de la partícula que estaba en r0 en t0. */
    trayectoria: (r0: Vec3, t0: number, t: number, p: Float64Array) => Vec3;
  };
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

/** Campos estacionarios de la 1.0 (SPEC §4.1–4.6). */
const CATALOGO_ESTACIONARIO: readonly CampoCatalogo[] = [
  {
    id: 'uniforme',
    nombre: 'Uniforme',
    nombreCorto: 'Uniforme',
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
    nombreCorto: 'Radial +',
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
    nombreCorto: 'Radial −',
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
    nombreCorto: 'Rotacional',
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
    nombreCorto: 'Helicoidal',
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
    nombreCorto: 'Silla',
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

// ---------------------------------------------------------------------------------------------
// Campos dependientes del tiempo (1.1, SPEC §4.9). t está en p[nParámetros] (D-63).

const VENTANA = { inicio: 0, fin: 4 * Math.PI };

/** Rotación de ángulo θ en el plano xy aplicada a (x, y). */
const girar = (theta: number, x: number, y: number): [number, number] => [Math.cos(theta) * x - Math.sin(theta) * y, Math.sin(theta) * x + Math.cos(theta) * y];

const CATALOGO_TEMPORAL: readonly CampoCatalogo[] = [
  {
    id: 'viento-giratorio',
    nombre: 'Viento giratorio',
    nombreCorto: 'Viento',
    expresiones: { P: 'V*cos(omega*t)', Q: 'V*sin(omega*t)', R: '0' },
    parametros: [param('V', 1, 0.1, 3, 0.05), param('omega', 1, 0.1, 3, 0.05)],
    semillas: { tipo: 'rejilla', plano: 'XY', c: 0, nu: 5, nv: 5 },
    tex: '\\mathbf F = V\\,(\\cos\\omega t,\\; \\sin\\omega t,\\; 0)',
    F: (_x, _y, _z, p, out, o) => {
      const [V, w, t] = [p[0] as number, p[1] as number, p[2] as number];
      out[o] = V * Math.cos(w * t);
      out[o + 1] = V * Math.sin(w * t);
      out[o + 2] = 0;
    },
    J: jConstante(() => [0, 0, 0, 0, 0, 0, 0, 0, 0]),
    equilibrios: (p) => (p[0] === 0 ? [{ tipo: 'espacio' }] : []),
    tiempo: {
      ...VENTANA,
      dFdt: (_x, _y, _z, p, out, o) => {
        const [V, w, t] = [p[0] as number, p[1] as number, p[2] as number];
        out[o] = -V * w * Math.sin(w * t);
        out[o + 1] = V * w * Math.cos(w * t);
        out[o + 2] = 0;
      },
      trayectoria: (r0, t0, t, p) => {
        const [V, w] = [p[0] as number, p[1] as number];
        const R = V / w;
        return [r0[0] + R * (Math.sin(w * t) - Math.sin(w * t0)), r0[1] - R * (Math.cos(w * t) - Math.cos(w * t0)), r0[2]];
      },
    },
    ficha: {
      resumen: 'En cada instante, el mismo vector en todo el espacio; su dirección gira con velocidad angular $\\omega$.',
      divergencia: '$\\nabla\\cdot\\mathbf F = 0$ en todo instante',
      rotacional: '$\\nabla\\times\\mathbf F = \\mathbf 0$ en todo instante',
      equilibrios: 'Ninguno si $V\\neq 0$: $\\lVert\\mathbf F\\rVert = V$ siempre.',
      lineas: 'Instantáneas: rectas paralelas a $(\\cos\\omega t,\\,\\sin\\omega t,\\,0)$.',
      trayectorias:
        'Circunferencias de radio $V/\\omega$, antihorarias vistas desde $+z$; periodo $2\\pi/\\omega$. Las líneas de traza son arcos de circunferencias del mismo radio.',
      potencial: 'En cada instante, $\\varphi = V\\,(x\\cos\\omega t + y\\sin\\omega t)$',
      interpretacion:
        'El contraejemplo mínimo: ninguna línea de corriente se curva nunca y, sin embargo, cada gota describe una circunferencia. $D\\mathbf F/Dt=\\partial_t\\mathbf F$ tiene módulo $V\\omega$: la aceleración centrípeta.',
      supuestos: 'Viento horizontal uniforme que rola a ritmo constante; las gotas siguen el viento sin inercia ($\\dot{\\mathbf r}=\\mathbf F$).',
    },
  },
  {
    id: 'lluvia',
    nombre: 'Lluvia con ráfagas',
    nombreCorto: 'Lluvia',
    expresiones: { P: 'A*sin(omega*t - k*z)', Q: '0', R: '-v' },
    parametros: [param('A', 0.8, 0, 2, 0.05), param('omega', 1, 0.1, 3, 0.05), param('k', 1.5, 0, 3, 0.05), param('v', 1, 0.1, 3, 0.05)],
    semillas: { tipo: 'rejilla', plano: 'XY', c: 1.9, nu: 5, nv: 5 },
    tex: '\\mathbf F = \\big(A\\sin(\\omega t - kz),\\; 0,\\; -v\\big)',
    F: (_x, _y, z, p, out, o) => {
      const [A, w, k, v, t] = [p[0] as number, p[1] as number, p[2] as number, p[3] as number, p[4] as number];
      out[o] = A * Math.sin(w * t - k * z);
      out[o + 1] = 0;
      out[o + 2] = -v;
    },
    J: (_x, _y, z, p, out, o) => {
      const [A, w, k, t] = [p[0] as number, p[1] as number, p[2] as number, p[4] as number];
      for (let i = 0; i < 9; i++) out[o + i] = 0;
      out[o + 2] = -A * k * Math.cos(w * t - k * z);
    },
    equilibrios: (p) => (p[3] === 0 && p[0] === 0 ? [{ tipo: 'espacio' }] : []),
    tiempo: {
      ...VENTANA,
      dFdt: (_x, _y, z, p, out, o) => {
        const [A, w, k, t] = [p[0] as number, p[1] as number, p[2] as number, p[4] as number];
        out[o] = A * w * Math.cos(w * t - k * z);
        out[o + 1] = 0;
        out[o + 2] = 0;
      },
      trayectoria: (r0, t0, t, p) => {
        const [A, w, k, v] = [p[0] as number, p[1] as number, p[2] as number, p[3] as number];
        // La gota siente las ráfagas con frecuencia Ω = ω + kv (efecto Doppler).
        const W = w + k * v;
        const fase = k * r0[2] + k * v * t0;
        const x = W === 0 ? r0[0] + A * Math.sin(-fase) * (t - t0) : r0[0] - (A / W) * (Math.cos(W * t - fase) - Math.cos(W * t0 - fase));
        return [x, r0[1], r0[2] - v * (t - t0)];
      },
    },
    ficha: {
      resumen: 'Gotas que caen con rapidez $v$ y un viento horizontal en ondas que suben con velocidad de fase $\\omega/k$.',
      divergencia: '$\\nabla\\cdot\\mathbf F = 0$ en todo instante',
      rotacional: '$\\nabla\\times\\mathbf F = \\big(0,\\,-Ak\\cos(\\omega t-kz),\\,0\\big)$',
      equilibrios: 'Ninguno si $v\\neq 0$.',
      lineas: 'Instantáneas: $dx/dz = -(A/v)\\sin(\\omega t - kz)$, curvas onduladas en planos $y=$ cte.',
      trayectorias:
        '$z = z_0 - v(t-t_0)$ y $x$ oscila con frecuencia $\\Omega=\\omega+kv$ y amplitud $A/\\Omega$. Con «Nacen en: las semillas» se ve la cortina de gotas (líneas de traza) que deja la «nube».',
      potencial: 'No existe ($\\nabla\\times\\mathbf F\\neq\\mathbf 0$ si $Ak\\neq 0$).',
      interpretacion:
        'La gota cruza las ráfagas y las siente con frecuencia $\\omega+kv$, no $\\omega$ (efecto Doppler): por eso su zigzag no tiene la forma de las líneas de corriente.',
      supuestos: 'Gotas sin inercia que caen a velocidad terminal $v$ y siguen el viento horizontal.',
    },
  },
  {
    id: 'silla-giratoria',
    nombre: 'Silla giratoria',
    nombreCorto: 'Silla gira',
    expresiones: { P: 'k*(x*cos(2*omega*t) + y*sin(2*omega*t))', Q: 'k*(x*sin(2*omega*t) - y*cos(2*omega*t))', R: '0' },
    parametros: [param('k', 1, 0.1, 3, 0.05), param('omega', 1.5, 0, 3, 0.05)],
    semillas: { tipo: 'rejilla', plano: 'XY', c: 0, nu: 7, nv: 7 },
    tex: '\\mathbf F = k\\,\\big(x\\cos 2\\omega t + y\\sin 2\\omega t,\\; x\\sin 2\\omega t - y\\cos 2\\omega t,\\; 0\\big)',
    F: (x, y, _z, p, out, o) => {
      const [k, w, t] = [p[0] as number, p[1] as number, p[2] as number];
      const [c, s] = [Math.cos(2 * w * t), Math.sin(2 * w * t)];
      out[o] = k * (x * c + y * s);
      out[o + 1] = k * (x * s - y * c);
      out[o + 2] = 0;
    },
    J: (_x, _y, _z, p, out, o) => {
      const [k, w, t] = [p[0] as number, p[1] as number, p[2] as number];
      const [c, s] = [Math.cos(2 * w * t), Math.sin(2 * w * t)];
      const j = [k * c, k * s, 0, k * s, -k * c, 0, 0, 0, 0];
      for (let i = 0; i < 9; i++) out[o + i] = j[i] as number;
    },
    equilibrios: () => [EJE_Z],
    tiempo: {
      ...VENTANA,
      dFdt: (x, y, _z, p, out, o) => {
        const [k, w, t] = [p[0] as number, p[1] as number, p[2] as number];
        const [c, s] = [Math.cos(2 * w * t), Math.sin(2 * w * t)];
        out[o] = 2 * k * w * (-x * s + y * c);
        out[o + 1] = 2 * k * w * (x * c + y * s);
        out[o + 2] = 0;
      },
      trayectoria: (r0, t0, t, p) => {
        // En el sistema que gira, q = R(−ωt)(x, y) cumple q' = M q, M = [[k, ω], [−ω, −k]], M² = (k² − ω²) I.
        const [k, w] = [p[0] as number, p[1] as number];
        const [q1, q2] = girar(-w * t0, r0[0], r0[1]);
        const tau = t - t0;
        const d = w * w - k * k;
        let a: number;
        let b: number;
        if (d > 0) {
          const nu = Math.sqrt(d);
          [a, b] = [Math.cos(nu * tau), Math.sin(nu * tau) / nu];
        } else if (d < 0) {
          const mu = Math.sqrt(-d);
          [a, b] = [Math.cosh(mu * tau), Math.sinh(mu * tau) / mu];
        } else [a, b] = [1, tau];
        const Q1 = a * q1 + b * (k * q1 + w * q2);
        const Q2 = a * q2 + b * (-w * q1 - k * q2);
        const [x, y] = girar(w * t, Q1, Q2);
        return [x, y, r0[2]];
      },
    },
    ficha: {
      resumen: 'En cada instante, la silla $k\\,(x,-y,0)$ girada un ángulo $\\omega t$ alrededor de $z$.',
      divergencia: '$\\nabla\\cdot\\mathbf F = 0$ en todo instante',
      rotacional: '$\\nabla\\times\\mathbf F = \\mathbf 0$ en todo instante',
      equilibrios: 'El eje $z$, en todo instante; en cada plano horizontal, un punto de silla (autovalores $\\pm k$).',
      lineas: 'Instantáneas: las hipérbolas de la silla, giradas un ángulo $\\omega t$.',
      trayectorias:
        'En el sistema que gira, $\\dot{\\mathbf q} = M\\mathbf q$ con $M^2=(k^2-\\omega^2)I$. Si $\\omega>k$, elipses: las partículas quedan atrapadas. Si $\\omega<k$, escapan exponencialmente.',
      potencial: 'En cada instante, $\\varphi = \\tfrac k2\\big((x^2-y^2)\\cos2\\omega t + 2xy\\sin2\\omega t\\big)$, armónico',
      interpretacion:
        'Toda fotografía del campo es una silla, inestable, irrotacional y sin divergencia, y las líneas de corriente prometen que todo escapa. Si gira deprisa ($\\omega>k$), las partículas quedan atrapadas: ningún instante lo deja adivinar.',
      supuestos: 'Recuerda a la trampa de Paul (una silla de potencial que gira atrapa partículas), aunque aquí la ecuación es de primer orden, $\\dot{\\mathbf r}=\\mathbf F$, no la de Newton.',
    },
  },
];

/** Catálogo completo: los seis estacionarios y, en la tercera fila, los tres temporales (D-68). */
export const CATALOGO: readonly CampoCatalogo[] = [...CATALOGO_ESTACIONARIO, ...CATALOGO_TEMPORAL];

export function campoPorId(id: IdCampo): CampoCatalogo {
  const c = CATALOGO.find((k) => k.id === id);
  if (!c) throw new Error(`Campo desconocido: ${id}`);
  return c;
}

/** Valores de los parámetros en el orden de declaración. */
export function valoresParametros(decl: readonly DeclParametro[]): Float64Array {
  return Float64Array.from(decl.map((d) => d.valor));
}
