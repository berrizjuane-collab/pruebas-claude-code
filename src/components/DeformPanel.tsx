import type { Dispatch } from 'react';
import type { Action, FigureId, LabState } from '../state/store';

export interface DeformPanelProps {
  state: LabState;
  dispatch: Dispatch<Action>;
}

const FIGURE_LABELS: Array<[FigureId, string]> = [
  ['none', 'None'],
  ['square', 'Square'],
  ['circle', 'Circle'],
  ['cat', 'Kitten'],
];

/** Options for the "feel the deformation" module. */
export function DeformPanel({ state, dispatch }: DeformPanelProps) {
  const d = state.deform;
  const set = (patch: Partial<typeof d>) => dispatch({ type: 'setDeform', patch });

  return (
    <details className="panel-section" open>
      <summary>Deformation view</summary>
      <div className="panel-section-body">
        <p className="hint" style={{ marginTop: 2 }}>
          Test figure (deforms with the medium):
        </p>
        <div className="btn-row">
          {FIGURE_LABELS.map(([id, label]) => (
            <button
              key={id}
              className={`btn small${d.figure === id ? ' active' : ''}`}
              onClick={() => set({ figure: id })}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="check">
          <input type="checkbox" checked={d.denseGrid} onChange={() => set({ denseGrid: !d.denseGrid })} />
          Dense grid (finer mesh)
        </label>
        <label className="check">
          <input type="checkbox" checked={d.pointField} onChange={() => set({ pointField: !d.pointField })} />
          Point field (space as a cloud of particles)
        </label>
        <label className="check" title="One arrow per sample point p, pointing to its image M·p">
          <input type="checkbox" checked={d.vectorField} onChange={() => set({ vectorField: !d.vectorField })} />
          Displacement arrows p → M·p
        </label>
        <div className="note">
          Everything here updates <em>live</em>: drag the î/ĵ tips, move a preset slider, or scrub t back and
          forth — space stretches like a continuous medium. Notice the figure never tears or bends: straight
          lines stay straight. That is linearity.
        </div>
      </div>
    </details>
  );
}
