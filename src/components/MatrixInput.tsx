import { useState } from 'react';
import type { Mat2 } from '../math/types';
import { fmt, parseNumeric } from '../utils/format';

export interface MatrixInputProps {
  value: Mat2;
  onChange: (m: Mat2) => void;
}

/**
 * Editable 2×2 matrix. Cells are colored by column to reinforce the central
 * idea: column 1 (green) is where î lands, column 2 (red) is where ĵ lands.
 * Edits apply live while typing (valid numbers commit immediately), and the
 * cells follow external changes — e.g. dragging the vector tips — when idle.
 */
export function MatrixInput({ value, onChange }: MatrixInputProps) {
  return (
    <div>
      <div className="matrix-input">
        <Cell value={value.a} colClass="col-i" label="a (row 1, col 1) — x-coordinate where î lands" onCommit={(v) => onChange({ ...value, a: v })} />
        <Cell value={value.b} colClass="col-j" label="b (row 1, col 2) — x-coordinate where ĵ lands" onCommit={(v) => onChange({ ...value, b: v })} />
        <Cell value={value.c} colClass="col-i" label="c (row 2, col 1) — y-coordinate where î lands" onCommit={(v) => onChange({ ...value, c: v })} />
        <Cell value={value.d} colClass="col-j" label="d (row 2, col 2) — y-coordinate where ĵ lands" onCommit={(v) => onChange({ ...value, d: v })} />
      </div>
      <div className="matrix-legend">
        <span className="i">■ column 1 = new î</span>
        <span className="j">■ column 2 = new ĵ</span>
      </div>
    </div>
  );
}

interface CellProps {
  value: number;
  colClass: string;
  label: string;
  onCommit: (v: number) => void;
}

function Cell({ value, colClass, label, onCommit }: CellProps) {
  // While the user is typing, the raw text lives here so intermediate states
  // like "-" or "1." are not clobbered by reformatting. null = not editing.
  const [draft, setDraft] = useState<string | null>(null);
  const parsed = draft === null ? value : parseNumeric(draft);
  const invalid = draft !== null && parsed === null;

  const handleChange = (text: string) => {
    setDraft(text);
    const v = parseNumeric(text);
    if (v !== null) onCommit(v); // live update — the grid moves as you type
  };

  const step = (delta: number) => {
    setDraft(null);
    // Round to the step grid to avoid 0.30000000000000004-style drift.
    onCommit(Math.round((value + delta) * 1e9) / 1e9);
  };

  return (
    <input
      className={`matrix-cell ${colClass}${invalid ? ' invalid' : ''}`}
      type="text"
      inputMode="decimal"
      aria-label={label}
      title={label}
      value={draft ?? fmt(value)}
      onChange={(e) => handleChange(e.target.value)}
      onFocus={(e) => {
        setDraft(e.target.value);
        e.target.select();
      }}
      onBlur={() => setDraft(null)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        else if (e.key === 'ArrowUp') {
          e.preventDefault();
          step(e.shiftKey ? 1 : 0.1);
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          step(e.shiftKey ? -1 : -0.1);
        }
      }}
    />
  );
}
