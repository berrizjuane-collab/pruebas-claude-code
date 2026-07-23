/**
 * The interactive maths panel. Each formula's LaTeX is rendered once with KaTeX;
 * only the live numeric value is updated as parameters change (cheap). Formulas
 * flagged as approximations get a visible badge.
 */

import katex from 'katex';
import { FORMULAS, FORMULA_GROUPS, type Formula, type FormulaContext } from '../physics/formulas.ts';
import { h } from './dom.ts';

interface Row {
  formula: Formula;
  valueEl: HTMLElement;
  noteEl: HTMLElement;
}

export class FormulaPanel {
  readonly root: HTMLElement;
  private rows: Row[] = [];

  constructor() {
    this.root = h('div', { class: 'formula-panel' });
    this.build();
  }

  private build(): void {
    const groups = Object.keys(FORMULA_GROUPS) as Array<Formula['group']>;
    for (const g of groups) {
      const list = FORMULAS.filter((f) => f.group === g);
      if (!list.length) continue;
      this.root.append(h('h3', { class: 'formula-group', text: FORMULA_GROUPS[g] }));
      for (const f of list) this.root.append(this.buildRow(f));
    }
  }

  private buildRow(f: Formula): HTMLElement {
    const math = h('div', { class: 'formula-tex' });
    try {
      katex.render(f.latex, math, { throwOnError: false, displayMode: true });
    } catch {
      math.textContent = f.latex;
    }

    const valueEl = h('span', { class: 'formula-value', text: '…' });
    const noteEl = h('span', { class: 'formula-note' });

    const badges = h('span', { class: 'formula-badges' });
    if (f.approximation) {
      badges.append(h('span', { class: 'badge badge-approx', text: 'approximation', title: 'Deliberately simplified — see description.' }));
    }

    const glossary = h(
      'div',
      { class: 'formula-vars' },
      f.variables.map((v) =>
        h('span', { class: 'formula-var' }, [
          renderInline(v.sym),
          document.createTextNode(` — ${v.desc}`),
        ]),
      ),
    );

    this.rows.push({ formula: f, valueEl, noteEl });

    const details = h('details', { class: 'formula-details' }, [
      h('summary', { text: 'details' }),
      h('p', { class: 'formula-meaning', text: f.meaning }),
      glossary,
    ]);

    return h('div', { class: 'formula-row' }, [
      h('div', { class: 'formula-head' }, [
        h('span', { class: 'formula-name', text: f.name }),
        badges,
      ]),
      math,
      h('div', { class: 'formula-result' }, [
        h('span', { class: 'formula-eq', text: '=' }),
        valueEl,
        noteEl,
      ]),
      details,
    ]);
  }

  /** Recompute and update every live value. */
  update(ctx: FormulaContext): void {
    for (const row of this.rows) {
      const r = row.formula.evaluate(ctx);
      row.valueEl.textContent = `${r.value}${r.unit ? ' ' + r.unit : ''}`;
      row.noteEl.textContent = r.note ? `(${r.note})` : '';
    }
  }
}

function renderInline(latex: string): HTMLElement {
  const span = h('span', { class: 'inline-tex' });
  try {
    katex.render(latex, span, { throwOnError: false, displayMode: false });
  } catch {
    span.textContent = latex;
  }
  return span;
}
