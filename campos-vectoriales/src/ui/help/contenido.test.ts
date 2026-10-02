import { describe, expect, it } from 'vitest';
import { ALIAS_FUNCIONES, FUNCIONES } from '../../math/expr/ast';
import { APARTADOS, ATAJOS, PESTANAS, filasFunciones } from './contenido';

describe('UI-06 · contenido de la ayuda', () => {
  it('la tabla de funciones sale de la lista blanca: mismas funciones, en el mismo orden, con sus alias y aridades', () => {
    const filas = filasFunciones();
    expect(filas.map((f) => f[0]!.split(' ')[0])).toEqual(Object.keys(FUNCIONES));
    for (const [alias, destino] of Object.entries(ALIAS_FUNCIONES)) expect(filas.find((f) => f[0]!.startsWith(`${destino} `))?.[0]).toContain(alias);
    expect(filas.find((f) => f[0] === 'hypot')?.[1]).toBe('2–3');
  });

  it('cada pestaña tiene apartados, los identificadores son únicos y los atajos de PLAN §3.1 están todos', () => {
    for (const p of PESTANAS) expect(APARTADOS.some((a) => a.pestana === p.id)).toBe(true);
    expect(new Set(APARTADOS.map((a) => a.id)).size).toBe(APARTADOS.length);
    const teclas = ATAJOS.map((a) => a.teclas).join(' | ');
    for (const t of ['? · F1', 'Espacio', 'R', '1 · 2 · 3 · 4', '5', 'F · L · P · C · G', 'I', 'Esc', 'Ctrl + Z', '← → ↑ ↓', 'Mayús + flechas', '+ · −', 'Intro', 'Alt + flechas']) expect(teclas).toContain(t);
  });

  it('las fórmulas en línea están bien delimitadas (número par de $)', () => {
    for (const a of APARTADOS) for (const p of [...a.parrafos, ...(a.tabla?.filas.flat() ?? [])]) expect((p.match(/\$/g) ?? []).length % 2, `${a.id}: ${p}`).toBe(0);
  });
});
