/**
 * Carga de fuentes con la API FontFace (D-19). Solo se incluyen los subconjuntos
 * necesarios (latín y griego de Inter, latín de JetBrains Mono): en el HTML
 * autocontenido cada fuente viaja en base64.
 *
 * Devuelve una promesa que se resuelve cuando las fuentes están listas (o han fallado):
 * la escena la espera antes de rasterizar etiquetas en el lienzo.
 */
import interLatin from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url';
import interGriego from '@fontsource-variable/inter/files/inter-greek-wght-normal.woff2?url';
import monoLatin from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2?url';

const LATIN =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const GRIEGO = 'U+0370-0377,U+037A-037F,U+0384-038A,U+038C,U+038E-03A1,U+03A3-03FF';

let cargando: Promise<void> | null = null;

export function cargarFuentes(): Promise<void> {
  if (cargando) return cargando;
  if (typeof FontFace === 'undefined' || typeof document === 'undefined') return Promise.resolve();
  const caras = [
    new FontFace('Inter Variable', `url(${interLatin}) format('woff2')`, {
      weight: '100 900',
      style: 'normal',
      unicodeRange: LATIN,
      display: 'swap',
    }),
    new FontFace('Inter Variable', `url(${interGriego}) format('woff2')`, {
      weight: '100 900',
      style: 'normal',
      unicodeRange: GRIEGO,
      display: 'swap',
    }),
    new FontFace('JetBrains Mono', `url(${monoLatin}) format('woff2')`, {
      weight: '400',
      style: 'normal',
      unicodeRange: LATIN,
      display: 'swap',
    }),
  ];
  for (const cara of caras) document.fonts.add(cara);
  cargando = Promise.allSettled(caras.map((c) => c.load())).then(() => undefined);
  return cargando;
}
