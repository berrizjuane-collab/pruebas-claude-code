import type { Eigen2 } from '../math/eigen';
import type { RankInfo } from '../math/kernel';
import type { Vec2 } from '../math/types';
import { COLORS } from '../theme';
import { fmt, texNum } from '../utils/format';
import { TeX } from './TeX';

export interface EigenPanelProps {
  eigen: Eigen2;
  rank: RankInfo;
}

const vecTex = (v: Vec2) => `\\begin{pmatrix} ${texNum(v.x)} \\\\ ${texNum(v.y)} \\end{pmatrix}`;

/**
 * Explains the eigenstructure in words, covering every case gracefully —
 * including the ones with nothing to draw (complex pair, scalar, rank 0).
 */
export function EigenPanel({ eigen, rank }: EigenPanelProps) {
  return (
    <details className="panel-section" open>
      <summary>
        <span
          className="term"
          title="An eigenvector of A is a direction that A maps onto itself: A·v = λ·v. The whole line through it only stretches by λ — it never turns."
        >
          Eigenvectors
        </span>
        &nbsp;&amp; rank
      </summary>
      <div className="panel-section-body">
        <EigenContent eigen={eigen} rank={rank} />
        <RankContent rank={rank} />
      </div>
    </details>
  );
}

function EigenContent({ eigen, rank }: EigenPanelProps) {
  switch (eigen.kind) {
    case 'realDistinct':
      return (
        <>
          {eigen.pairs.map((p, i) => (
            <div className="readout" key={i}>
              <span className="label" style={{ color: COLORS.eigen }}>
                λ{i + 1}
              </span>
              <TeX tex={`= ${texNum(p.value)}, \\; v_${i + 1} = ${vecTex(p.vector)}`} />
            </div>
          ))}
          {rank.rank === 2 && (
            <p className="hint">
              The <span style={{ color: COLORS.eigen }}>yellow dashed lines</span> are the eigendirections: they
              never change direction while the plane deforms — points on them only stretch by λ. Watch the yellow
              arrows during the animation.
            </p>
          )}
        </>
      );

    case 'repeatedScalar':
      return (
        <>
          <div className="readout">
            <span className="label" style={{ color: COLORS.eigen }}>
              λ
            </span>
            <TeX tex={`= ${texNum(eigen.value)} \\;\\text{(double)}`} />
          </div>
          <p className="hint">
            A = λ·I scales <em>every</em> direction equally, so every line through the origin is an
            eigendirection — there is no special line to single out.
          </p>
        </>
      );

    case 'repeatedDefective':
      return (
        <>
          <div className="readout">
            <span className="label" style={{ color: COLORS.eigen }}>
              λ
            </span>
            <TeX tex={`= ${texNum(eigen.value)} \\;\\text{(double)}, \\; v = ${vecTex(eigen.vector)}`} />
          </div>
          <p className="hint">
            A repeated eigenvalue with only <em>one</em> invariant direction (a “defective” matrix — shears are
            the classic case): every other direction gets dragged sideways along it.
          </p>
        </>
      );

    case 'complex': {
      const deg = (eigen.angle * 180) / Math.PI;
      return (
        <>
          <div className="readout">
            <span className="label" style={{ color: COLORS.eigen }}>
              λ
            </span>
            <TeX tex={`= ${texNum(eigen.re)} \\pm ${texNum(eigen.im)}\\,i`} />
          </div>
          <p className="hint">
            <strong>Complex eigenvalues — no real eigenvectors exist.</strong> No direction is mapped onto
            itself: the transformation <em>rotates</em> every line through the origin (by {fmt(deg, 1)}° with an
            overall scaling of ×{fmt(eigen.modulus)} per application, in a suitable basis). That is why no
            invariant lines are drawn.
          </p>
        </>
      );
    }
  }
}

function RankContent({ rank }: { rank: RankInfo }) {
  if (rank.rank === 2) {
    return (
      <p className="hint">
        <span className="term" title="The dimension of the image (column space): how many dimensions survive the transformation.">
          rank
        </span>{' '}
        = 2 — the plane stays two-dimensional (the matrix is invertible).
      </p>
    );
  }
  if (rank.rank === 1) {
    return (
      <p className="hint">
        <strong>rank = 1 — space is flattened onto a line.</strong> The whole plane lands on the{' '}
        <span style={{ color: COLORS.image }}>violet line (the image)</span>; the{' '}
        <span style={{ color: COLORS.kernel }}>pink dashed direction (the kernel / null space)</span> is crushed
        into the origin — watch its pink arrow shrink to a point during the animation.
      </p>
    );
  }
  return (
    <p className="hint">
      <strong>rank = 0</strong> — this is the zero matrix: every single point is sent to the origin. The kernel
      is the entire plane; the image is just the point 0.
    </p>
  );
}
