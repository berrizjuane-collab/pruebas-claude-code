import { det } from '../math/mat2';
import type { Mat2 } from '../math/types';
import { fmt } from '../utils/format';
import { matrixTex, TeX } from './TeX';

export interface InfoPanelProps {
  /** Matrix currently on screen, M(t) — readouts follow the animation live. */
  displayed: Mat2;
}

export function InfoPanel({ displayed }: InfoPanelProps) {
  const d = det(displayed);
  return (
    <details className="panel-section" open>
      <summary>Readouts</summary>
      <div className="panel-section-body">
        <TeX block tex={`M = ${matrixTex(displayed, { colored: true })}`} />
        <div className="readout">
          <span className="label">
            <span
              className="term"
              title="The factor by which the transformation scales areas. Negative means orientation flips."
            >
              det M
            </span>
          </span>
          <span className="num">{fmt(d, 3)}</span>
        </div>
      </div>
    </details>
  );
}
