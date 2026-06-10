import type { Dispatch } from 'react';
import { isSimilarity } from '../math/interpolate';
import { matApproxEquals, IDENTITY } from '../math/mat2';
import type { Action, InterpPref, LabState } from '../state/store';
import { activeInterpMode } from '../state/store';

export interface AnimationControlsProps {
  state: LabState;
  dispatch: Dispatch<Action>;
}

/**
 * Play / scrub / choose the interpolation path. The note under the selector
 * explains the one subtle modeling choice in the app: entrywise interpolation
 * of a big rotation passes through a singular matrix (the plane collapses
 * mid-animation), so rotation-like matrices default to a rotational path.
 */
export function AnimationControls({ state, dispatch }: AnimationControlsProps) {
  const mode = activeInterpMode(state);
  const isIdentityTarget = matApproxEquals(state.target, IDENTITY, 1e-12);
  const rotationLike = state.segments.some((s) => isSimilarity(s.apply));

  let note: { text: string; warn: boolean };
  if (mode === 'rotational') {
    note = {
      text:
        'Rotational path: this matrix is a rotation (+ uniform scale), so the animation interpolates ' +
        'angle and scale — exp(t·log A) — and a 90° turn really turns. The entrywise path would shrink ' +
        'through a singular matrix halfway.',
      warn: false,
    };
  } else if (state.interpPref === 'linear' && rotationLike) {
    note = {
      text:
        'Linear path on a rotation-like matrix: M(t) = (1−t)·I + t·A interpolates each entry, so the plane ' +
        'momentarily collapses (det → 0) mid-way. Mathematically honest for this path — switch to Auto or ' +
        'Rotational to see it turn instead.',
      warn: true,
    };
  } else {
    note = {
      text: 'Linear path: every entry interpolates, M(t) = (1−t)·I + t·A. Eigendirections of A stay invariant along the whole path.',
      warn: false,
    };
  }

  return (
    <details className="panel-section" open>
      <summary>Animation</summary>
      <div className="panel-section-body">
        <div className="btn-row">
          <button
            className="btn primary"
            disabled={isIdentityTarget && state.segments.length === 1}
            onClick={() => dispatch({ type: 'animate' })}
            title="Replay the deformation from the identity"
          >
            ▶ Animate I → A
          </button>
        </div>
        <div className="slider-row">
          <label htmlFor="anim-t">t</label>
          <input
            id="anim-t"
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={state.t}
            onChange={(e) => dispatch({ type: 'scrub', t: Number(e.target.value) })}
            title="Scrub the deformation by hand"
          />
          <span className="value">{state.t.toFixed(2)}</span>
        </div>
        <div className="slider-row">
          <label htmlFor="interp-mode">path</label>
          <select
            id="interp-mode"
            className="select"
            value={state.interpPref}
            onChange={(e) => dispatch({ type: 'setInterpPref', pref: e.target.value as InterpPref })}
            style={{ flex: 1 }}
          >
            <option value="auto">Auto (rotational for rotations)</option>
            <option value="linear">Linear (entrywise)</option>
            <option value="rotational">Rotational (angle + scale)</option>
          </select>
        </div>
        <div className={`note${note.warn ? ' warn' : ''}`}>{note.text}</div>
      </div>
    </details>
  );
}
