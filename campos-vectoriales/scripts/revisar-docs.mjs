/**
 * Revisión cruzada de la documentación (DOC-01): enlaces relativos e identificadores.
 *
 *   node scripts/revisar-docs.mjs
 *
 * - Cada enlace relativo `[…](ruta#ancla)` de los documentos apunta a un archivo que existe y,
 *   si lleva ancla, a un encabezado de ese archivo (anclas al estilo de GitHub).
 * - Cada identificador citado está definido: decisiones, supuestos, riesgos y preguntas
 *   (D-, S-, R-, Q-) en STATUS; tareas (FND-01, VAL-02…) en la tabla de PLAN; criterios
 *   (V-MAT-01, VV-06, T-17…) en VALIDATION.
 * Sale con código 1 si hay algún problema.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';

const DOCUMENTOS = process.argv.length > 2 ? process.argv.slice(2) : ['README.md', 'SPEC.md', 'DESIGN.md', 'PLAN.md', 'VALIDATION.md', 'STATUS.md', 'entrega/LEEME.md'];
const leer = (f) => readFileSync(f, 'utf8');

/** Ancla de un encabezado como la genera GitHub. */
const ancla = (titulo) =>
  titulo
    .trim()
    .toLowerCase()
    .replace(/[`*_~]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s/g, '-');
const anclas = (texto) => {
  const vistas = new Map();
  const res = new Set();
  for (const m of texto.matchAll(/^#{1,6}\s+(.+)$/gm)) {
    const base = ancla(m[1]);
    const n = vistas.get(base) ?? 0;
    vistas.set(base, n + 1);
    res.add(n ? `${base}-${n}` : base);
  }
  return res;
};

const problemas = [];
let enlaces = 0;
for (const doc of DOCUMENTOS) {
  const texto = leer(doc);
  for (const m of texto.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const destino = m[1];
    if (/^(https?:|mailto:)/.test(destino)) continue;
    enlaces++;
    const [ruta, frag] = destino.split('#');
    const archivo = ruta ? normalize(join(dirname(doc), decodeURI(ruta))) : doc;
    if (!existsSync(archivo)) {
      problemas.push(`${doc}: enlace roto → ${destino}`);
      continue;
    }
    if (frag && archivo.endsWith('.md') && !anclas(leer(archivo)).has(decodeURIComponent(frag))) problemas.push(`${doc}: ancla inexistente → ${destino}`);
  }
}

// Identificadores definidos.
const status = leer('STATUS.md');
const plan = leer('PLAN.md');
const validacion = leer('VALIDATION.md');
const definidos = new Set();
for (const m of status.matchAll(/^\| ([DSRQ]-\d+) \|/gm)) definidos.add(m[1]);
for (const m of plan.matchAll(/^\| ([A-Z0-9]+-\d\d) \|/gm)) definidos.add(m[1]);
for (const m of validacion.matchAll(/^\| \*{0,2}((?:V-[A-Z0-9]+-\d+)|(?:VV-\d+)|(?:T-\d+)|(?:V\d)|(?:C\d+)|(?:R\d)|(?:PERF-[ABC]))\*{0,2} \|/gm)) definidos.add(m[1]);

const PATRONES = [/\b([DSQ]-\d{2})\b/g, /(?<![A-Z]-)\b((?:PLN|FND|VIS|MAT|NUM|CMP|REN|UI|INS|EXP|A11Y|VAL|REV|ENT|DOC)-\d\d)\b/g, /\b(V-(?:MAT|NUM|FUN|PERF|A11Y)-\d\d)\b/g, /\b(VV-\d\d)\b/g];
let citas = 0;
for (const doc of DOCUMENTOS) {
  const texto = leer(doc);
  for (const re of PATRONES)
    for (const m of texto.matchAll(re)) {
      citas++;
      if (!definidos.has(m[1])) problemas.push(`${doc}: ${m[1]} no está definido`);
    }
}

const unicos = [...new Set(problemas)];
console.log(`${DOCUMENTOS.length} documentos · ${enlaces} enlaces relativos · ${citas} citas de identificadores · ${definidos.size} identificadores definidos`);
console.log(unicos.length ? unicos.join('\n') : 'Sin problemas');
process.exit(unicos.length ? 1 : 0);
