/**
 * Componentes compartidos de la interfaz: controles compactos, accesibles (foco visible,
 * etiquetas, teclado) y con ayudas emergentes breves.
 */
import { useId, useState, type ReactNode } from 'react';

export function Tip({ text, children }: { text: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span
      className="tip"
      tabIndex={0}
      aria-describedby={id}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onClick={() => setOpen((o) => !o)}
    >
      {children}
      <span id={id} role="tooltip" className={`tip-body${open ? ' open' : ''}`}>
        {text}
      </span>
    </span>
  );
}

export function Section({ title, children, defaultOpen = true, note }: { title: string; children: ReactNode; defaultOpen?: boolean; note?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`sec${open ? ' open' : ''}`}>
      <button className="sec-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span>{title}</span>
        <span className="chev" aria-hidden>
          {open ? '−' : '+'}
        </span>
      </button>
      {open && (
        <div className="sec-body">
          {note && <p className="note">{note}</p>}
          {children}
        </div>
      )}
    </section>
  );
}

export function Row({ label, tip, children }: { label: string; tip?: string; children: ReactNode }) {
  return (
    <div className="row">
      <span className="row-label">{tip ? <Tip text={tip}>{label}</Tip> : label}</span>
      <span className="row-value">{children}</span>
    </div>
  );
}

export function Toggle({ label, checked, onChange, tip, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; tip?: string; disabled?: boolean }) {
  return (
    <label className={`toggle${disabled ? ' disabled' : ''}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="knob" aria-hidden />
      <span className="toggle-label">{tip ? <Tip text={tip}>{label}</Tip> : label}</span>
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label, small }: { value: T; options: Array<{ value: T; label: string; title?: string; disabled?: boolean }>; onChange: (v: T) => void; label?: string; small?: boolean }) {
  return (
    <div className={`seg${small ? ' small' : ''}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={value === o.value} className={value === o.value ? 'on' : ''} title={o.title} disabled={o.disabled} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
  tip,
  log,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  tip?: string;
  log?: boolean;
}) {
  const id = useId();
  const toPos = (v: number) => (log ? Math.log(v / min) / Math.log(max / min) : (v - min) / (max - min));
  const fromPos = (p: number) => (log ? min * Math.pow(max / min, p) : min + p * (max - min));
  return (
    <div className="slider">
      <div className="slider-head">
        <label htmlFor={id}>{tip ? <Tip text={tip}>{label}</Tip> : label}</label>
        <span className="mono">{format ? format(value) : value}</span>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={1000}
        step={1}
        value={Math.round(toPos(value) * 1000)}
        onChange={(e) => {
          let v = fromPos(Number(e.target.value) / 1000);
          if (step) v = Math.round(v / step) * step;
          onChange(Math.min(max, Math.max(min, v)));
        }}
      />
    </div>
  );
}

export function NumberField({ label, value, onChange, step = 0.1, min, max, unit, tip }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; unit?: string; tip?: string }) {
  const id = useId();
  return (
    <div className="numfield">
      <label htmlFor={id}>{tip ? <Tip text={tip}>{label}</Tip> : label}</label>
      <span>
        <input
          id={id}
          type="number"
          value={Number.isFinite(value) ? value : ''}
          step={step}
          min={min}
          max={max}
          onChange={(e) => {
            const v = Number(e.target.value.replace(',', '.'));
            if (Number.isFinite(v)) onChange(v);
          }}
        />
        {unit && <em>{unit}</em>}
      </span>
    </div>
  );
}

export function Badge({ kind, children }: { kind: 'exacto' | 'aprox' | 'modelo' | 'ilustrativo' | 'estetico'; children?: ReactNode }) {
  const labels = { exacto: 'Solución exacta (numérica)', aprox: 'Aproximación controlada', modelo: 'Modelo parametrizado', ilustrativo: 'Recurso ilustrativo', estetico: 'Estético' };
  return <span className={`badge b-${kind}`}>{children ?? labels[kind]}</span>;
}
