/** Tiny DOM construction helpers — a hyperscript-lite for building the UI. */

type Props = Record<string, unknown> & {
  class?: string;
  text?: string;
  html?: string;
  title?: string;
};

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  children: Array<Node | string> = [],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'text') el.textContent = String(v);
    else if (k === 'html') el.innerHTML = String(v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (k === 'dataset' && typeof v === 'object') {
      Object.assign(el.dataset, v);
    } else if (typeof v === 'boolean') {
      if (v) el.setAttribute(k, '');
    } else {
      el.setAttribute(k, String(v));
    }
  }
  for (const c of children) el.append(c);
  return el;
}

export function button(label: string, onClick: () => void, className = 'btn'): HTMLButtonElement {
  return h('button', { class: className, text: label, onClick, type: 'button' });
}

export interface SliderOpts {
  min: number;
  max: number;
  step: number;
  value: number;
  label: string;
  unit?: string;
  format?: (v: number) => string;
  onInput: (v: number) => void;
  log?: boolean;
}

/** A labelled slider with a live value read-out. Supports logarithmic scaling. */
export function slider(opts: SliderOpts): { root: HTMLElement; set: (v: number) => void } {
  const toSlider = (v: number): number =>
    opts.log ? (Math.log10(v) - Math.log10(opts.min)) / (Math.log10(opts.max) - Math.log10(opts.min)) : v;
  const fromSlider = (s: number): number =>
    opts.log ? Math.pow(10, Math.log10(opts.min) + s * (Math.log10(opts.max) - Math.log10(opts.min))) : s;

  const input = h('input', {
    type: 'range',
    class: 'slider',
    min: opts.log ? 0 : opts.min,
    max: opts.log ? 1 : opts.max,
    step: opts.log ? 0.001 : opts.step,
    value: toSlider(opts.value),
  }) as HTMLInputElement;

  const valEl = h('span', { class: 'slider-value' });
  const fmt = (v: number): string =>
    `${opts.format ? opts.format(v) : v.toFixed(2)}${opts.unit ? ' ' + opts.unit : ''}`;
  valEl.textContent = fmt(opts.value);

  input.addEventListener('input', () => {
    const v = fromSlider(parseFloat(input.value));
    valEl.textContent = fmt(v);
    opts.onInput(v);
  });

  const root = h('label', { class: 'field' }, [
    h('span', { class: 'field-label' }, [document.createTextNode(opts.label), valEl]),
    input,
  ]);

  return {
    root,
    set: (v: number) => {
      input.value = String(toSlider(v));
      valEl.textContent = fmt(v);
    },
  };
}

/** A collapsible panel section. */
export function section(title: string, open = true): {
  root: HTMLElement;
  body: HTMLElement;
} {
  const body = h('div', { class: 'section-body' });
  const header = h('button', { class: 'section-header', type: 'button' }, [
    h('span', { text: title }),
    h('span', { class: 'chev', text: '▾' }),
  ]);
  const root = h('div', { class: `section ${open ? 'open' : ''}` }, [header, body]);
  header.addEventListener('click', () => root.classList.toggle('open'));
  return { root, body };
}

export function toggle(
  label: string,
  value: boolean,
  onChange: (v: boolean) => void,
): { root: HTMLElement; set: (v: boolean) => void } {
  const input = h('input', { type: 'checkbox', class: 'toggle-input' }) as HTMLInputElement;
  input.checked = value;
  input.addEventListener('change', () => onChange(input.checked));
  const root = h('label', { class: 'toggle' }, [
    input,
    h('span', { class: 'toggle-track' }, [h('span', { class: 'toggle-thumb' })]),
    h('span', { class: 'toggle-label', text: label }),
  ]);
  return { root, set: (v: boolean) => (input.checked = v) };
}

/** A row of mutually-exclusive buttons; returns a setter to reflect state. */
export function buttonGroup<T extends string>(
  options: Array<{ id: T; label: string; title?: string }>,
  value: T,
  onSelect: (id: T) => void,
): { root: HTMLElement; set: (id: T) => void } {
  const btns = new Map<T, HTMLButtonElement>();
  const root = h('div', { class: 'btn-group' });
  for (const o of options) {
    const b = h('button', {
      class: 'btn chip',
      text: o.label,
      type: 'button',
      title: o.title ?? o.label,
      onClick: () => onSelect(o.id),
    });
    btns.set(o.id, b);
    root.append(b);
  }
  const set = (id: T): void => {
    for (const [k, b] of btns) b.classList.toggle('active', k === id);
  };
  set(value);
  return { root, set };
}
