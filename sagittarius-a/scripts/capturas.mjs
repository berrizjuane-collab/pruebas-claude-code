/**
 * Capturas reales de la aplicación para la documentación (docs/capturas/*.png).
 *
 * Usa el recorrido automático (scripts/recorrido.mjs) sobre la compilación de producción. Cada
 * captura acumula varias muestras con la escala de render indicada; en un equipo sin GPU
 * (SwiftShader) cada una tarda del orden de un minuto.
 *
 *   npm run capturas            (ESCALA_FOTO=0.5 MUESTRAS=4 por defecto)
 */
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(raiz, 'docs/capturas');
const env = { ...process.env, ESCALA: process.env.ESCALA ?? '0.2', ESCALA_FOTO: process.env.ESCALA_FOTO ?? '0.5', MUESTRAS: process.env.MUESTRAS ?? '4' };

// Ir al instante en que el último experimento cruza un radio dado y pausar
const ir = (r) => `eval:(() => { const o = __obs; const e = [...o.client.experiments.values()].pop(); const d = e.body.data; let k = 0; for (; k < e.nSamples; k++) if (d[k * 40 + 36] < ${r}) break; if (k >= e.nSamples) return 'sin muestras'; o.engine.t = d[k * 40]; __store.set({ running: false }); return d[k * 40 + 36]; })()`;
const set = (obj) => `eval:__store.set(${JSON.stringify(obj)})`;
const overlay = (obj) => `eval:__store.set((s) => ({ overlay: { ...s.overlay, ...${JSON.stringify(obj)} } }))`;

const escritorio = [
  'inicio',
  'foto:01-cinematografico',
  set({ profile: 'eht' }),
  'esperar:2000',
  'foto:02-eht-sintetico',
  `eval:JSON.stringify({ flujoJy: __store.get().live.ehtFluxJy, anilloMuas: __store.get().live.ehtRingMuas })`,
  set({ profile: 'spacetime', gridOn: true }),
  overlay({ horizon: true, ergosphere: true, isco: true, photonOrbits: true, geoPhotons: true }),
  'esperar:4000',
  'foto:03-espacio-tiempo',
  set({ profile: 'cinematic', gridOn: false }),
  overlay({ horizon: false, ergosphere: false, isco: false, photonOrbits: false, geoPhotons: false }),
  'click:ARROJAR',
  set({ timeScale: 3000 }),
  'esperar:9000',
  ir(7),
  'esperar:2000',
  'foto:04-lanzamiento',
  'tecla:Digit2',
  'esperar:3000',
  'foto:05-marco-del-objeto',
  ir(1.6),
  'esperar:3000',
  'foto:06-dentro-del-horizonte',
  'tecla:Digit3',
  'esperar:2000',
  'foto:07-diagrama',
  'tecla:Digit1',
  'click:Research',
  'radio:Gráficos',
  'esperar:1500',
  'foto:08-research',
  'estado',
];

const run = (w, h, pasos) => {
  const r = spawnSync('node', [join(raiz, 'scripts/recorrido.mjs'), out, String(w), String(h), pasos.join('|')], { stdio: 'inherit', env });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
run(1280, 720, escritorio);
run(390, 844, ['inicio', 'foto:09-movil']);
console.log('Capturas en docs/capturas/');
