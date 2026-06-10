import type { Dispatch } from 'react';
import { matApproxEquals, multiply } from '../math/mat2';
import type { Action, LabState } from '../state/store';
import { MatrixInput } from './MatrixInput';
import { matrixTex, TeX } from './TeX';

export interface CompositionPanelProps {
  state: LabState;
  dispatch: Dispatch<Action>;
}

/**
 * Chain two transformations and *see* that order matters. "Apply A, then B"
 * is the product B·A — the matrix nearest the vector acts first — and the
 * two-stage animation shows B deforming the already-A-transformed plane.
 */
export function CompositionPanel({ state, dispatch }: CompositionPanelProps) {
  const BA = multiply(state.compB, state.compA); // A first, then B
  const AB = multiply(state.compA, state.compB); // B first, then A
  const commute = matApproxEquals(BA, AB, 1e-9);

  return (
    <details className="panel-section">
      <summary>Composition A → B</summary>
      <div className="panel-section-body">
        <div className="comp-grid">
          <div className="comp-slot">
            <div className="comp-slot-head">
              <strong>A</strong> (first)
              <button
                className="btn small"
                onClick={() => dispatch({ type: 'setCompA', matrix: state.target })}
                title="Copy the matrix currently in the lab into slot A"
              >
                ← current
              </button>
            </div>
            <MatrixInput compact value={state.compA} onChange={(m) => dispatch({ type: 'setCompA', matrix: m })} />
          </div>
          <div className="comp-slot">
            <div className="comp-slot-head">
              <strong>B</strong> (second)
              <button
                className="btn small"
                onClick={() => dispatch({ type: 'setCompB', matrix: state.target })}
                title="Copy the matrix currently in the lab into slot B"
              >
                ← current
              </button>
            </div>
            <MatrixInput compact value={state.compB} onChange={(m) => dispatch({ type: 'setCompB', matrix: m })} />
          </div>
        </div>

        <div className="btn-row">
          <button
            className="btn primary"
            onClick={() => dispatch({ type: 'animateComposition', firstThen: ['A', 'B'] })}
            title="Two-stage animation: first A deforms the plane, then B deforms the result"
          >
            ▶ A then B
          </button>
          <button
            className="btn primary"
            onClick={() => dispatch({ type: 'animateComposition', firstThen: ['B', 'A'] })}
          >
            ▶ B then A
          </button>
          <button className="btn" onClick={() => dispatch({ type: 'swapComp' })} title="Exchange the contents of A and B">
            Swap A ↔ B
          </button>
        </div>

        <TeX block tex={`\\underbrace{B\\,A}_{\\text{A then B}} = ${matrixTex(BA)}`} />
        <TeX block tex={`\\underbrace{A\\,B}_{\\text{B then A}} = ${matrixTex(AB)}`} />

        {commute ? (
          <div className="note">
            These two happen to <strong>commute</strong>: B·A = A·B, so the order makes no difference here
            (e.g. two rotations, or two scalings).
          </div>
        ) : (
          <div className="note warn">
            <strong>B·A ≠ A·B — order matters!</strong> Run both animations and compare where the grid ends up.
          </div>
        )}

        <p className="hint">
          Why “A then B” = B·A: matrices act on what is written to their right, so in B·A the rightmost matrix A
          touches the vector first: (B·A)·v = B·(A·v). After the animation, the result becomes the lab matrix.
        </p>
      </div>
    </details>
  );
}
