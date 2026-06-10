import katex from 'katex';
import { memo, useEffect, useRef } from 'react';
import type { Mat2 } from '../math/types';
import { texNum } from '../utils/format';
import { COLORS } from '../theme';

/** Render a TeX string with KaTeX. Memoized: re-renders only when the string changes. */
export const TeX = memo(function TeX({ tex, block = false }: { tex: string; block?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (ref.current) {
      katex.render(tex, ref.current, { throwOnError: false, displayMode: block });
    }
  }, [tex, block]);
  return <span className={block ? 'tex-block' : 'tex-inline'} ref={ref} />;
});

export interface MatrixTexOptions {
  /** Color the columns like the î (green) / ĵ (red) vectors they correspond to. */
  colored?: boolean;
  digits?: number;
}

export function matrixTex(m: Mat2, opts: MatrixTexOptions = {}): string {
  const d = opts.digits ?? 2;
  const wrap = (v: number, color: string | null) =>
    color ? `\\textcolor{${color}}{${texNum(v, d)}}` : texNum(v, d);
  const ci = opts.colored ? COLORS.iHat : null;
  const cj = opts.colored ? COLORS.jHat : null;
  return `\\begin{pmatrix} ${wrap(m.a, ci)} & ${wrap(m.b, cj)} \\\\ ${wrap(m.c, ci)} & ${wrap(m.d, cj)} \\end{pmatrix}`;
}
