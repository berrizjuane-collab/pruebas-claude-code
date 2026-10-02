/**
 * Contenido del cajón de ayuda (UI-06, SPEC §3 y §5.2): Conceptos · Sintaxis · Atajos ·
 * Supuestos. Los textos admiten matemáticas en línea entre `$…$` (se pintan con KaTeX).
 *
 * La tabla de funciones de «Sintaxis» se genera desde la lista blanca del analizador
 * (`FUNCIONES` y `ALIAS_FUNCIONES`), sin duplicarla; y la de atajos, desde `ATAJOS`.
 */
import { ALIAS_FUNCIONES, FUNCIONES } from '../../math/expr/ast';
import { LIMITES_EXPRESION } from '../../math/expr/errores';

export type Pestana = 'conceptos' | 'sintaxis' | 'atajos' | 'supuestos';

export const PESTANAS: { id: Pestana; titulo: string }[] = [
  { id: 'conceptos', titulo: 'Conceptos' },
  { id: 'sintaxis', titulo: 'Sintaxis' },
  { id: 'atajos', titulo: 'Atajos' },
  { id: 'supuestos', titulo: 'Supuestos' },
];

export interface Apartado {
  id: string;
  pestana: Pestana;
  titulo: string;
  parrafos: string[];
  tabla?: { cabecera: string[]; filas: string[][]; mono?: number[] };
}

/** Notas de dominio de cada función (la lista de funciones sale de `FUNCIONES`). */
const NOTAS_FUNCIONES: Partial<Record<keyof typeof FUNCIONES, string>> = {
  tan: 'se dispara cerca de $\\pi/2 + k\\pi$',
  asin: '$|u| \\le 1$; derivada infinita en ±1',
  acos: '$|u| \\le 1$; derivada infinita en ±1',
  atan2: 'atan2(y, x); no diferenciable en el origen',
  acosh: '$u \\ge 1$',
  atanh: '$|u| < 1$',
  sinh: 'puede desbordar: magnitud excesiva',
  cosh: 'puede desbordar: magnitud excesiva',
  exp: 'puede desbordar: magnitud excesiva',
  ln: 'logaritmo natural; $u > 0$',
  log10: '$u > 0$',
  sqrt: '$u \\ge 0$; derivada infinita en 0',
  cbrt: 'todo ℝ (también $u < 0$); derivada infinita en 0',
  abs: 'no diferenciable en 0',
  min: 'no diferenciable donde los argumentos coinciden',
  max: 'no diferenciable donde los argumentos coinciden',
  hypot: 'no diferenciable en el origen',
  pow: 'pow(a, b) = a^b',
};

/** Filas de la tabla de funciones, en el orden de la lista blanca. */
export function filasFunciones(): string[][] {
  const alias = (f: string) =>
    Object.entries(ALIAS_FUNCIONES)
      .filter(([, destino]) => destino === f)
      .map(([a]) => a);
  return (Object.keys(FUNCIONES) as (keyof typeof FUNCIONES)[]).map((f) => {
    const [min, max] = FUNCIONES[f];
    const otros = alias(f);
    return [f + (otros.length ? ` (también ${otros.join(', ')})` : ''), min === max ? String(min) : `${min}–${max}`, NOTAS_FUNCIONES[f] ?? '—'];
  });
}

/** Atajos de teclado (PLAN §3.1): la tabla de la ayuda y el guion de A11Y-01 salen de aquí. */
export const ATAJOS: { contexto: 'Global' | 'Escena enfocada' | 'Inspector' | 'Diálogos y cajón'; teclas: string; accion: string }[] = [
  { contexto: 'Global', teclas: '? · F1', accion: 'Ayuda' },
  { contexto: 'Global', teclas: 'Espacio', accion: 'Pausar / reanudar la animación' },
  { contexto: 'Global', teclas: 'R', accion: 'Encuadrar y restablecer la cámara' },
  { contexto: 'Global', teclas: '1 · 2 · 3 · 4', accion: 'Vistas XY · XZ · YZ · isométrica' },
  { contexto: 'Global', teclas: '5', accion: 'Perspectiva / ortográfica' },
  { contexto: 'Global', teclas: 'F · L · P · C · G', accion: 'Flechas · líneas · partículas · corte · glifos F / rot F' },
  { contexto: 'Global', teclas: 'I', accion: 'Inspeccionar un punto por coordenadas' },
  { contexto: 'Global', teclas: 'Esc', accion: 'Cierra lo último abierto (menú → diálogo → cajón → inspector)' },
  { contexto: 'Global', teclas: 'Ctrl + Z', accion: 'Deshacer el último restablecimiento o apertura (mientras dure la notificación)' },
  { contexto: 'Escena enfocada', teclas: '← → ↑ ↓', accion: 'Orbitar 5°' },
  { contexto: 'Escena enfocada', teclas: 'Mayús + flechas', accion: 'Desplazar' },
  { contexto: 'Escena enfocada', teclas: '+ · −', accion: 'Acercar · alejar' },
  { contexto: 'Escena enfocada', teclas: 'Intro', accion: 'Inspeccionar el nodo más cercano al centro de la vista' },
  { contexto: 'Escena enfocada', teclas: 'Alt + flechas · Alt + RePág / AvPág', accion: 'Mover P en pasos de Δ por x / y · por z' },
  { contexto: 'Inspector', teclas: 'Esc', accion: 'Cerrar el inspector' },
  { contexto: 'Diálogos y cajón', teclas: 'Esc', accion: 'Cerrar y devolver el foco a donde estaba' },
];

const conceptos: Apartado[] = [
  {
    id: 'campo',
    pestana: 'conceptos',
    titulo: 'Campo vectorial y dominio',
    parrafos: [
      'Un campo vectorial asigna a cada punto $(x, y, z)$ un vector $\\mathbf F = (P, Q, R)$. Las coordenadas son cartesianas y dextrógiras ($\\hat x \\times \\hat y = \\hat z$), con $z$ hacia arriba en la escena.',
      'Hay dos dominios distintos. El de visualización, $\\Omega = [x_{\\min}, x_{\\max}] \\times [y_{\\min}, y_{\\max}] \\times [z_{\\min}, z_{\\max}]$, es la caja que se dibuja. El de definición, $D$, son los puntos donde las tres expresiones dan números reales finitos: no se conoce de antemano; la aplicación lo observa en los puntos que evalúa y marca con × los que no están en él.',
      'Coordenadas y campo son adimensionales: los ejes muestran números, no metros.',
    ],
  },
  {
    id: 'magnitud',
    pestana: 'conceptos',
    titulo: 'Magnitud, dirección y escala visual',
    parrafos: [
      'La norma es $\\lVert \\mathbf F \\rVert = \\sqrt{P^2 + Q^2 + R^2}$ y la dirección, $\\hat{\\mathbf F} = \\mathbf F / \\lVert \\mathbf F \\rVert$, que solo existe si $\\mathbf F \\neq \\mathbf 0$: en un cero no se inventa una flecha.',
      'Escalar las flechas es una transformación gráfica, no matemática: la longitud es $\\ell = \\ell_{\\max} \\min(\\lVert \\mathbf F \\rVert / F_{\\text{ref}}, 1)$ y la luminancia sigue la misma razón. $F_{\\text{ref}}$ es por defecto el percentil 95 de $\\lVert \\mathbf F \\rVert$ en los nodos, redondeado a un valor legible; las flechas con $\\lVert \\mathbf F \\rVert \\ge F_{\\text{ref}}$ se saturan y llevan doble punta. El inspector siempre muestra $\\mathbf F$ sin escalar.',
      'Con «Longitud: normalizada» todas las flechas miden lo mismo, pero la magnitud sigue en la luminancia. Para comparar experimentos, fija la escala desde la leyenda: así la misma $\\lVert \\mathbf F \\rVert$ da la misma flecha.',
    ],
  },
  {
    id: 'equilibrios',
    pestana: 'conceptos',
    titulo: 'Ceros del campo (equilibrios)',
    parrafos: [
      'Un equilibrio es un punto con $\\mathbf F(\\mathbf p) = \\mathbf 0$. Puede ser aislado (el origen del campo radial) o formar curvas (el eje $z$ del rotacional).',
      'El rombo hueco ◇ no afirma que el campo sea nulo: marca un cero visual, $\\lVert \\mathbf F \\rVert < 2\\,\\%$ de $F_{\\text{ref}}$, donde una flecha sería ilegible. Solo se marcan los ceros en los nodos evaluados.',
    ],
  },
  {
    id: 'divergencia',
    pestana: 'conceptos',
    titulo: 'Divergencia',
    parrafos: [
      '$\\nabla \\cdot \\mathbf F = \\partial P / \\partial x + \\partial Q / \\partial y + \\partial R / \\partial z = \\operatorname{tr} J$, con $J_{ij} = \\partial F_i / \\partial x_j$.',
      'Su significado intrínseco es el flujo saliente por unidad de volumen: $\\nabla \\cdot \\mathbf F(\\mathbf p) = \\lim_{V \\to 0} \\frac{1}{|V|} \\oint_{\\partial V} \\mathbf F \\cdot d\\mathbf S$. Positiva: fuente local, sale más de lo que entra. Negativa: sumidero local. Nula: lo que entra sale (solenoidal en ese punto).',
      'En el corte, «div F» se dibuja con la luminancia para $|\\nabla \\cdot \\mathbf F|$ y el signo con una textura: puntos y «+» para las fuentes, rayado y «−» para los sumideros, y una curva discontinua donde vale cero.',
    ],
  },
  {
    id: 'rotacional',
    pestana: 'conceptos',
    titulo: 'Rotacional',
    parrafos: [
      '$\\nabla \\times \\mathbf F = (\\partial R / \\partial y - \\partial Q / \\partial z,\\ \\partial P / \\partial z - \\partial R / \\partial x,\\ \\partial Q / \\partial x - \\partial P / \\partial y)$.',
      'Es circulación por unidad de área: para un disco pequeño de normal $\\mathbf n$, $(\\nabla \\times \\mathbf F) \\cdot \\mathbf n = \\lim_{A \\to 0} \\frac{1}{A} \\oint_{\\partial A} \\mathbf F \\cdot d\\mathbf r$, con el borde orientado por la regla de la mano derecha. Es un vector axial: su dirección es el eje de giro y su sentido, el de la mano derecha. Con «Glifos: rot F», cada flecha apunta como $\\nabla \\times \\mathbf F$ y su anillo muestra el sentido de giro.',
      'La jacobiana se descompone en $J = S + A$, con $S = \\tfrac12 (J + J^\\top)$ (deformación) y $A = \\tfrac12 (J - J^\\top)$ (giro), y $A\\mathbf v = \\tfrac12 (\\nabla \\times \\mathbf F) \\times \\mathbf v$. Por eso un campo puede curvar sus líneas sin rotacional (la silla) o tener líneas circulares sin girar lejos del eje: el vórtice $(-y, x, 0)/(x^2 + y^2)$ tiene rotacional nulo fuera del eje $z$.',
    ],
  },
  {
    id: 'rueda',
    pestana: 'conceptos',
    titulo: 'Rueda de paletas',
    parrafos: [
      'Es una interpretación con supuestos: si $\\mathbf F$ es el campo de velocidades de un fluido y la rueda es pequeña, rígida, sin masa y no perturba el flujo, su velocidad angular alrededor de un eje $\\mathbf n$ es $\\omega_{\\mathbf n} = \\tfrac12 (\\nabla \\times \\mathbf F) \\cdot \\mathbf n$.',
      'Es máxima, $\\tfrac12 \\lVert \\nabla \\times \\mathbf F \\rVert$, cuando el eje apunta como el rotacional; la aplicación la orienta así en el punto P y gira al mismo ritmo que las partículas.',
    ],
  },
  {
    id: 'lineas',
    pestana: 'conceptos',
    titulo: 'Líneas de corriente',
    parrafos: [
      'Una línea de corriente es una curva tangente al campo en cada punto: $d\\mathbf r / ds = \\mathbf F(\\mathbf r(s))$. Se integra con el campo normalizado, $d\\mathbf r / d\\sigma = \\hat{\\mathbf F}$, que recorre la misma curva en el mismo sentido con pasos de longitud uniforme: la resolución geométrica no depende de la magnitud.',
      'Desde cada semilla (○) se integra hacia delante y hacia atrás; los cheurones › marcan el sentido de $\\mathbf F$. La luminancia de las líneas es constante: no codifica la magnitud.',
      'Una línea se detiene antes de un cero (◇ «≈ 0») o de una región no definida (×); nunca atraviesa ni rebota en un equilibrio.',
    ],
  },
  {
    id: 'particulas',
    pestana: 'conceptos',
    titulo: 'Partículas y trayectorias',
    parrafos: [
      'Las partículas resuelven $d\\mathbf r / dt = \\mathbf F(\\mathbf r)$ con el campo sin normalizar: su velocidad es $\\mathbf F$ y su rapidez, $\\lVert \\mathbf F \\rVert$. En un campo estacionario recorren las mismas curvas que las líneas de corriente; añaden la rapidez.',
      '1 s real equivale a $\\tau$ unidades de $t$; por defecto $\\tau = \\Delta / F_{\\text{ref}}$, de modo que una partícula con $\\lVert \\mathbf F \\rVert = F_{\\text{ref}}$ recorre una celda por segundo.',
      'No es dinámica de Newton: si $\\mathbf F$ fuera una fuerza, el movimiento obedecería $m\\ddot{\\mathbf r} = \\mathbf F$ y sería otro. Aquí $\\mathbf F$ se interpreta como campo de velocidades.',
    ],
  },
  {
    id: 'cortes',
    pestana: 'conceptos',
    titulo: 'Cortes planos',
    parrafos: [
      'Un corte es un plano $z = c$, $y = c$ o $x = c$ con normal $\\mathbf n = \\hat z, \\hat y, \\hat x$. Admite dos lecturas: el vector completo, cuyas flechas pueden salir del plano, y la proyección tangencial $\\mathbf F_\\parallel = \\mathbf F - (\\mathbf F \\cdot \\mathbf n)\\mathbf n$.',
      'La componente normal $F_n = \\mathbf F \\cdot \\mathbf n$ se dibuja como escalar con signo: ⊙ sale hacia $+\\mathbf n$, ⊗ entra. $(\\nabla \\times \\mathbf F) \\cdot \\mathbf n$ es el giro visto desde $+\\mathbf n$: ↺ antihorario, ↻ horario.',
      'Cuidado: las curvas integrales de $\\mathbf F_\\parallel$ no son líneas de corriente 3D salvo que $F_n = 0$ en todo el plano; por eso no se dibujan.',
    ],
  },
  {
    id: 'singularidades',
    pestana: 'conceptos',
    titulo: 'Singularidades y puntos sin definir',
    parrafos: [
      'Un nodo es no definido (×) si alguna componente no es un número real finito: $\\sqrt x$ con $x < 0$, $1/x$ en $x = 0$, $x^{1/3}$ con $x < 0$ (usa cbrt). Es singular (también ×) si $\\lVert \\mathbf F \\rVert > 10^{12}$. Nunca se dibuja una flecha parcial, y estos nodos no cuentan para $F_{\\text{ref}}$.',
      'En un punto anguloso (abs, min, max, atan2, hypot) el campo está definido pero la derivada no: el inspector lo dice en lugar de dar el valor de una rama.',
    ],
  },
  {
    id: 'distinciones',
    pestana: 'conceptos',
    titulo: 'El campo y su representación',
    parrafos: [
      'El campo es una función en un continuo; la escena es una muestra finita (nodos, semillas, píxeles) con decisiones de escala, y cada decisión tiene su entrada en la leyenda.',
      'Asignar un significado físico (velocidad, fuerza, campo eléctrico) exige supuestos: unidades, naturaleza del campo y ecuación de movimiento. Por ejemplo, $(x, y, z)$ no es el campo de una carga puntual, que es $\\propto \\mathbf r / \\lVert \\mathbf r \\rVert^3$ y tiene divergencia nula fuera del origen.',
    ],
  },
];

const sintaxis: Apartado[] = [
  {
    id: 'sintaxis-expresiones',
    pestana: 'sintaxis',
    titulo: 'Operadores y precedencia',
    parrafos: [
      'Operadores: + − * / y ^ (o **). Precedencia de mayor a menor: ^, signo, * y / (también la multiplicación implícita), + y −. Así, -x^2 = −(x²) y 2^3^2 = 2^9 (la potencia asocia a la derecha).',
      'Multiplicación implícita solo cuando no hay ambigüedad: 2x, 3(x+1) y )(. Nunca entre letras: xy da «¿Querías escribir x*y?». 1/2x se lee (1/2)·x, y la vista previa lo muestra.',
      'Se aceptan − (menos tipográfico), · y × como producto, π y letras griegas como nombres de parámetro.',
    ],
  },
  {
    id: 'sintaxis-variables',
    pestana: 'sintaxis',
    titulo: 'Variables y constantes',
    parrafos: [
      'Variables: x, y, z. Derivadas de ellas: r = $\\sqrt{x^2 + y^2 + z^2}$ y rho (o ρ) = $\\sqrt{x^2 + y^2}$, que se derivan correctamente.',
      'Constantes: pi (π) y e. La letra t está reservada para los campos dependientes del tiempo, que aún no están disponibles.',
    ],
  },
  {
    id: 'sintaxis-parametros',
    pestana: 'sintaxis',
    titulo: 'Parámetros',
    parrafos: [
      'Cualquier otro nombre debe declararse como parámetro (hasta 8). Si escribes uno sin declarar, el mensaje ofrece «Añadir como parámetro». Un parámetro no puede llamarse como una variable, una constante o una función; los nombres griegos (alpha … omega) se muestran con su letra.',
    ],
  },
  {
    id: 'sintaxis-funciones',
    pestana: 'sintaxis',
    titulo: 'Funciones',
    parrafos: ['La lista es cerrada: las expresiones nunca se ejecutan como código.'],
    tabla: { cabecera: ['Función', 'Argumentos', 'Dominio y notas'], filas: filasFunciones(), mono: [0] },
  },
  {
    id: 'sintaxis-errores',
    pestana: 'sintaxis',
    titulo: 'Errores y expresiones incompletas',
    parrafos: [
      'Mientras escribes, una expresión a medias («x*(») se marca como incompleta, sin error. Al salir del campo, un error se señala en su posición y la escena sigue mostrando el último campo válido. Esc vuelve al último valor válido.',
      `Límites: ${LIMITES_EXPRESION.caracteres} caracteres por componente, ${LIMITES_EXPRESION.nodos} nodos de árbol y profundidad ${LIMITES_EXPRESION.profundidad}. Si la derivada simbólica supera ${LIMITES_EXPRESION.nodosDerivada} nodos, se usan diferencias finitas.`,
    ],
  },
];

const atajos: Apartado[] = [
  {
    id: 'atajos',
    pestana: 'atajos',
    titulo: 'Atajos de teclado',
    parrafos: [
      'Los atajos de una letra no actúan dentro de los campos de texto, y pueden desactivarse en «Avanzado». Primer elemento enfocable: «Saltar a la escena».',
    ],
    tabla: { cabecera: ['Contexto', 'Teclas', 'Acción'], filas: ATAJOS.map((a) => [a.contexto, a.teclas, a.accion]), mono: [1] },
  },
];

const supuestos: Apartado[] = [
  {
    id: 'supuestos-muestreo',
    pestana: 'supuestos',
    titulo: 'Muestreo y escala',
    parrafos: [
      'Malla de $N^3$ nodos ($N$ entre 3 y 21; por defecto 9) con separación $\\Delta$; la flecha más larga mide $\\ell_{\\max} = 0.9\\,\\Delta$. Con $N$ impar y dominio simétrico el origen es un nodo. Lo que pasa entre nodos no se ve: un campo como $(\\sin 10y, 0, 0)$ parece otro con $N = 9$.',
      '$F_{\\text{ref}}$ automática: percentil 95 de $\\lVert \\mathbf F \\rVert$ en los nodos definidos, redondeado hacia arriba a 1, 1.5, 2, 2.5, 3, 4, 5, 6 u 8 por una potencia de 10. Cero visual: $\\lVert \\mathbf F \\rVert < 2\\,\\%$ de $F_{\\text{ref}}$.',
    ],
  },
  {
    id: 'supuestos-derivadas',
    pestana: 'supuestos',
    titulo: 'Derivadas',
    parrafos: [
      'Por defecto, analíticas (derivación simbólica, exactas hasta el redondeo). Numéricas, con diferencias centradas de paso $h_j = \\varepsilon^{1/3} \\max(|x_j|, L) \\approx 6 \\times 10^{-6} \\max(|x_j|, L)$, cuando el árbol es demasiado grande o la derivada simbólica es indeterminada. El inspector dice cuál se ha usado.',
      'Una derivada infinita se informa como no acotada; en un punto anguloso, como no definida. Nunca se sustituye por un número sin significado.',
    ],
  },
  {
    id: 'supuestos-integracion',
    pestana: 'supuestos',
    titulo: 'Líneas y partículas',
    parrafos: [
      'Líneas: Runge–Kutta de orden 4 en longitud de arco, paso $h = \\Delta/8$ (error global $O(h^4)$), en ambos sentidos. Cada rama termina por un motivo: sale de $\\Omega$, llega a un cero ($\\lVert \\mathbf F \\rVert < 10^{-3} F_{\\text{ref}}$), entra en una región no definida, cierra una órbita, o alcanza la longitud o los pasos máximos (4000). «Detalles del cálculo» los resume.',
      'Partículas: Runge–Kutta 4 en el tiempo con el campo sin normalizar; renacen en una posición aleatoria reproducible al salir de $\\Omega$, al llegar a un cero o a un punto no definido, o tras 8 s.',
    ],
  },
  {
    id: 'supuestos-representacion',
    pestana: 'supuestos',
    titulo: 'Representación en monocromo',
    parrafos: [
      'Nada depende del color. La banda clara de grises codifica $\\lVert \\mathbf F \\rVert$ (o $\\lVert \\nabla \\times \\mathbf F \\rVert$ con «Glifos: rot F») en las flechas; la banda oscura, el escalar del corte. Son disjuntas para que no se confundan. El signo se lee por textura y forma (puntos, rayado, +, −, ⊙, ⊗, ↺, ↻), nunca por el tono.',
      'La escena no usa luces ni niebla: la luminancia de un glifo es solo su magnitud.',
    ],
  },
];

export const APARTADOS: Apartado[] = [...conceptos, ...sintaxis, ...atajos, ...supuestos];
export type IdApartado = string;

export const apartadoPorId = (id: IdApartado): Apartado | undefined => APARTADOS.find((a) => a.id === id);
