/**
 * Fuente única de los tokens de diseño (DESIGN.md §2–4 y §8.2).
 *
 * La interfaz los recibe como variables CSS (`aplicarTokens`) y la escena 3D los importa
 * directamente, de modo que DOM y WebGL no pueden divergir. Todos los colores son grises
 * neutros (R = G = B); lo comprueba `tokens.test.ts`.
 */

export const color = {
  fondo0: '#101010',
  fondo1: '#181818',
  fondo2: '#242424',
  fondo3: '#2E2E2E',
  pulsado: '#333333',
  borde: '#404040',
  deshabilitado: '#6B6B6B',
  control: '#757575',
  texto3: '#8C8C8C',
  texto2: '#B0B0B0',
  texto1: '#F5F5F5',
} as const;

export const escena = {
  fondo: '#101010',
  caja: '#404040',
  eje: '#8C8C8C',
  etiqueta: '#B0B0B0',
  halo: '#101010',
  linea: '#A0A0A0',
  semilla: '#B0B0B0',
  particula: '#F5F5F5',
  estela: '#8C8C8C',
  corte: '#8C8C8C',
  cero: '#B0B0B0',
  seleccion: '#F5F5F5',
  cruz: '#B0B0B0',
} as const;

/** Rampas en L* (DESIGN §2.2): disjuntas para que glifos y mapa del corte no se confundan. */
export const rampa = {
  magnitud: { lMin: 45.2, lMax: 96.5 }, // #6B6B6B → #F5F5F5
  escalar: { lMin: 6, lMax: 32 }, // #131313 → #4B4B4B; con patrón, hasta L* 42
  patronDeltaL: 10,
} as const;

export const tipo = {
  familiaUi: "'Inter Variable', Inter, system-ui, sans-serif",
  familiaMono: "'JetBrains Mono', ui-monospace, monospace",
  /** [tamaño, interlínea] en px */
  micro: [11, 16],
  pie: [12, 16],
  control: [13, 20],
  cuerpo: [14, 22],
  titulo: [14, 20],
  vacio: [16, 24],
  pesos: [400, 500, 600],
} as const;

export const espacio = { e1: 4, e2: 8, e3: 12, e4: 16, e5: 24, e6: 32, e7: 48 } as const;
export const radio = { r1: 4, r2: 6, r3: 8 } as const;
export const sombra = {
  n1: '0 4px 16px rgba(0, 0, 0, 0.5)',
  n2: '0 12px 32px rgba(0, 0, 0, 0.6)',
} as const;
export const movimiento = {
  rapido: 100,
  medio: 160,
  cajon: 200,
  camara: 400,
  curva: 'cubic-bezier(0.2, 0, 0, 1)',
  curvaSalida: 'cubic-bezier(0.4, 0, 1, 1)',
} as const;
export const medidas = {
  barra: 48,
  panel: 320,
  inspector: 288,
  leyenda: 240,
  ayuda: 400,
  control: 32,
} as const;

const aKebab = (s: string) => s.replace(/([a-z])([A-Z0-9])/g, '$1-$2').toLowerCase();

/** Variables CSS derivadas de los tokens: `--fondo-0`, `--texto-1`, `--e-4`, `--r-2`… */
export function variablesCss(): Record<string, string> {
  const v: Record<string, string> = {};
  for (const [k, val] of Object.entries(color)) v[`--${aKebab(k)}`] = val;
  for (const [k, val] of Object.entries(espacio)) v[`--${aKebab(k)}`] = `${val}px`;
  for (const [k, val] of Object.entries(radio)) v[`--${aKebab(k)}`] = `${val}px`;
  for (const [k, val] of Object.entries(sombra)) v[`--sombra-${k}`] = val;
  for (const [k, val] of Object.entries(medidas)) v[`--m-${k}`] = `${val}px`;
  v['--familia-ui'] = tipo.familiaUi;
  v['--familia-mono'] = tipo.familiaMono;
  for (const nombre of ['micro', 'pie', 'control', 'cuerpo', 'titulo', 'vacio'] as const) {
    const [t, l] = tipo[nombre];
    v[`--t-${nombre}`] = `${t}px`;
    v[`--l-${nombre}`] = `${l}px`;
  }
  v['--mov-rapido'] = `${movimiento.rapido}ms`;
  v['--mov-medio'] = `${movimiento.medio}ms`;
  v['--mov-cajon'] = `${movimiento.cajon}ms`;
  v['--curva'] = movimiento.curva;
  v['--curva-salida'] = movimiento.curvaSalida;
  return v;
}

/** Inyecta las variables en un elemento (normalmente `document.documentElement`). */
export function aplicarTokens(raiz: { style: { setProperty(k: string, v: string): void } }): void {
  for (const [k, val] of Object.entries(variablesCss())) raiz.style.setProperty(k, val);
}
