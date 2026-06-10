import { det } from '../math/mat2';
import type { Mat2 } from '../math/types';
import { COLORS } from '../theme';
import { fmt, texNum } from '../utils/format';
import { matrixTex, TeX } from './TeX';

export interface InfoPanelProps {
  /** The transformation being studied (the matrix in the inputs). */
  target: Mat2;
  /** Matrix currently on screen, M(t) — readouts follow the animation live. */
  displayed: Mat2;
  /** True while the animation is between identity and target. */
  inProgress: boolean;
}

export function InfoPanel({ target, displayed, inProgress }: InfoPanelProps) {
  const d = det(displayed);
  const nearZero = Math.abs(d) < 1e-9;

  let interpretation: string;
  if (nearZero) {
    interpretation = 'det = 0 — space is squashed flat: areas vanish and the map has no inverse.';
  } else if (d > 0) {
    interpretation = `Areas scale by ×${fmt(Math.abs(d), 3)}; orientation is preserved.`;
  } else {
    interpretation = `Areas scale by ×${fmt(Math.abs(d), 3)} and orientation flips (the plane lands face-down — hence the hatched parallelogram).`;
  }

  return (
    <details className="panel-section" open>
      <summary>Determinant</summary>
      <div className="panel-section-body">
        <TeX block tex={`A = ${matrixTex(target, { colored: true })}`} />
        {inProgress && <TeX block tex={`M(t) = ${matrixTex(displayed)}`} />}
        <div className="readout">
          <span className="label">
            <span
              className="term"
              title="The signed factor by which the transformation scales areas. It equals the area of the parallelogram spanned by the columns; the sign records whether orientation (handedness) is preserved."
            >
              det M{inProgress ? '(t)' : ''}
            </span>
          </span>
          <span className="num">
            <TeX tex={texNum(d, 3)} />
          </span>
        </div>
        <p className="hint">
          <span className="swatch" style={{ background: COLORS.detPositive, border: `1px solid ${COLORS.detPositiveEdge}` }} />
          The shaded parallelogram is the image of the unit square (dashed): its area <em>is</em> |det M|.{' '}
          {interpretation}
        </p>
      </div>
    </details>
  );
}
