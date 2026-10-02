/**
 * Marca tareas como «Completada y verificada» (PLAN §5) y actualiza STATUS:
 *   node scripts/marcar-tarea.mjs <commit> <ID> [<ID> …]
 *
 * - PLAN.md: estado en la tabla resumen y en el encabezado del detalle.
 * - STATUS.md §1.2: línea «ID · fecha · commit · evidencia».
 * - STATUS.md §1.1: recuento por hito a partir de la tabla de PLAN.
 * Solo marca tareas cuya carpeta de evidencia existe.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const [commit, ...ids] = process.argv.slice(2);
if (!commit || !ids.length) {
  console.error('Uso: node scripts/marcar-tarea.mjs <commit> <ID> [<ID> …]');
  process.exit(1);
}
const fecha = new Date().toISOString().slice(0, 10);
let plan = readFileSync('PLAN.md', 'utf8');
let status = readFileSync('STATUS.md', 'utf8');

for (const id of ids) {
  if (!existsSync(`evidencia/${id}`)) {
    console.error(`${id}: no existe evidencia/${id}/ — no se marca.`);
    process.exit(1);
  }
  const fila = new RegExp(`^(\\| ${id} \\|.*\\| )Pendiente(?: · \\*[^|]*\\*)? \\|$`, 'm');
  if (!fila.test(plan)) {
    console.error(`${id}: fila no encontrada o ya marcada en PLAN.md`);
    process.exit(1);
  }
  plan = plan.replace(fila, `$1Completada y verificada |`);
  plan = plan.replace(new RegExp(`^(#### ${id} · .*) — Pendiente$`, 'm'), `$1 — Completada y verificada`);
  const linea = `- ${id} · ${fecha} · \`${commit}\` · [evidencia/${id}/](evidencia/${id}/)`;
  status = status.replace(/(### 1\.2 Tareas completadas y verificadas\n\n)(\*\(Ninguna todavía\.\)\* [^\n]*\n)?/, `$1`);
  status = status.replace(/(### 1\.2 Tareas completadas y verificadas\n\n(?:- [^\n]*\n)*)/, `$1${linea}\n`);
}

// Recuento por hito desde la tabla resumen de PLAN.
const filas = [...plan.matchAll(/^\| ([A-Z0-9]+-\d\d) \| [^|]+\| ([^|]*) \| [^|]+\| ([^|]+) \|$/gm)];
const porHito = {};
for (const [, , hito, estado] of filas) {
  const h = !hito.trim() || hito.trim() === '—' ? 'Planificación' : hito.trim();
  porHito[h] ??= { total: 0, hechas: 0 };
  porHito[h].total++;
  if (estado.trim().startsWith('Completada')) porHito[h].hechas++;
}
status = status.replace(/^\| (Planificación|H\d[^|]*?) \| (\d+|PLN-01) \| (\d+)\/(\d+) \|/gm, (m, nombre, total) => {
  const clave = nombre.startsWith('H') ? nombre.split(' ')[0] : 'Planificación';
  const c = porHito[clave];
  if (!c) return m;
  return `| ${nombre} | ${total} | ${c.hechas}/${c.total} |`;
});

writeFileSync('PLAN.md', plan);
writeFileSync('STATUS.md', status);
console.log(`Marcadas: ${ids.join(', ')} (${commit})`);
for (const [h, c] of Object.entries(porHito)) console.log(`  ${h}: ${c.hechas}/${c.total}`);
