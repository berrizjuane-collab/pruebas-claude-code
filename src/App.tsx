import { useMemo, useReducer } from 'react';
import { AnimationControls } from './components/AnimationControls';
import { CanvasStage } from './components/CanvasStage';
import { CompositionPanel } from './components/CompositionPanel';
import { EigenPanel } from './components/EigenPanel';
import { InfoPanel } from './components/InfoPanel';
import { MatrixInput } from './components/MatrixInput';
import { PresetBar } from './components/PresetBar';
import { VectorPanel } from './components/VectorPanel';
import { eigen2 } from './math/eigen';
import { rankInfo } from './math/kernel';
import type { Scene, ShowFlags } from './rendering/scene';
import { displayedMatrix, initialState, reducer } from './state/store';
import { useAnimationTicker } from './state/useAnimationTicker';

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  useAnimationTicker(state.playing, dispatch);
  const displayed = displayedMatrix(state);

  // Eigenstructure and rank belong to the *target* matrix: its eigendirections
  // stay invariant along the whole linear animation path.
  const eigen = useMemo(() => eigen2(state.target), [state.target]);
  const rank = useMemo(() => rankInfo(state.target), [state.target]);

  const scene: Scene = {
    matrix: displayed,
    show: state.show,
    interactive: true,
    eigen: state.show.eigenvectors ? { eigen, rank } : null,
    customVectors: state.customVectors,
  };

  const toggle = (key: keyof ShowFlags) => dispatch({ type: 'toggleShow', key });

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">
          <span className="accent">Linear</span> Transformation Lab
        </h1>
        <div className="header-hint">
          drag the î / ĵ tips · type in the matrix · scroll = zoom · drag background = pan · Shift = snap to 0.5
        </div>
      </header>
      <main className="app-main">
        <aside className="side-panel">
          <details className="panel-section" open>
            <summary>Matrix A</summary>
            <div className="panel-section-body">
              <MatrixInput value={state.target} onChange={(m) => dispatch({ type: 'setTarget', matrix: m })} />
              <p className="hint">
                The <strong>columns</strong> of A are the landing spots of î and ĵ — drag the arrow tips and watch
                the columns change; type values and watch the arrows move.
              </p>
              <div className="btn-row">
                <button className="btn" onClick={() => dispatch({ type: 'reset' })}>
                  Reset to identity
                </button>
              </div>
            </div>
          </details>

          <PresetBar dispatch={dispatch} />

          <AnimationControls state={state} dispatch={dispatch} />

          <InfoPanel target={state.target} displayed={displayed} inProgress={state.t < 1} />

          <EigenPanel eigen={eigen} rank={rank} />

          <CompositionPanel state={state} dispatch={dispatch} />

          <VectorPanel state={state} displayed={displayed} dispatch={dispatch} />

          <details className="panel-section" open>
            <summary>View</summary>
            <div className="panel-section-body">
              <Check label="Reference grid" checked={state.show.baseGrid} onChange={() => toggle('baseGrid')} />
              <Check label="Axis numbers" checked={state.show.axisNumbers} onChange={() => toggle('axisNumbers')} />
              <Check
                label="Transformed grid"
                checked={state.show.transformedGrid}
                onChange={() => toggle('transformedGrid')}
              />
              <Check
                label="Basis vectors î, ĵ"
                checked={state.show.basisVectors}
                onChange={() => toggle('basisVectors')}
              />
              <Check
                label="Determinant parallelogram"
                checked={state.show.determinant}
                onChange={() => toggle('determinant')}
              />
              <Check
                label="Eigenvectors, kernel & image"
                checked={state.show.eigenvectors}
                onChange={() => toggle('eigenvectors')}
              />
              <Check label="Labels" checked={state.show.labels} onChange={() => toggle('labels')} />
            </div>
          </details>
        </aside>
        <CanvasStage
          scene={scene}
          tool={state.tool}
          onDragBasis={(which, to) => dispatch({ type: 'dragBasis', which, to })}
          onAddVector={(v) => dispatch({ type: 'addVector', v })}
        />
      </main>
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={onChange} />
      {label}
    </label>
  );
}
