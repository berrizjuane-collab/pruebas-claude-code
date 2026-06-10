import type { Dispatch } from 'react';
import { apply } from '../math/mat2';
import type { Mat2 } from '../math/types';
import type { Action, LabState } from '../state/store';
import { fmt } from '../utils/format';

export interface VectorPanelProps {
  state: LabState;
  /** Matrix on screen (M(t)) so the readout matches the bright arrows live. */
  displayed: Mat2;
  dispatch: Dispatch<Action>;
}

/** Place test vectors and read input → output pairs. */
export function VectorPanel({ state, displayed, dispatch }: VectorPanelProps) {
  const placing = state.tool === 'addVector';
  return (
    <details className="panel-section">
      <summary>Custom vectors</summary>
      <div className="panel-section-body">
        <div className="btn-row">
          <button
            className={`btn${placing ? ' active' : ''}`}
            onClick={() => dispatch({ type: 'setTool', tool: placing ? 'transform' : 'addVector' })}
            title="Then click anywhere on the canvas to drop a vector"
          >
            {placing ? '✓ Click the canvas to place v (click here to stop)' : '＋ Place vectors by clicking'}
          </button>
          {state.customVectors.length > 0 && (
            <button className="btn" onClick={() => dispatch({ type: 'clearVectors' })}>
              Clear
            </button>
          )}
        </div>
        {state.customVectors.length === 0 ? (
          <p className="hint">
            Drop a vector v on the plane: the dashed arrow is the input, the bright one is M·v — its image. It
            rides along during animations.
          </p>
        ) : (
          <ul className="vector-list">
            {state.customVectors.map((v, i) => {
              const out = apply(displayed, v);
              return (
                <li key={i}>
                  v<sub>{i + 1}</sub> = ({fmt(v.x)}, {fmt(v.y)}) <span className="arrow">→</span> ({fmt(out.x)},{' '}
                  {fmt(out.y)})
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </details>
  );
}
