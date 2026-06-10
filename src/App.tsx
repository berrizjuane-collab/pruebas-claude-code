import { CanvasStage } from './components/CanvasStage';
import type { Scene } from './rendering/scene';

const IDENTITY = { a: 1, b: 0, c: 0, d: 1 };

export default function App() {
  const scene: Scene = {
    matrix: IDENTITY,
    show: { baseGrid: true, axisNumbers: true },
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">
          <span className="accent">Linear</span> Transformation Lab
        </h1>
        <div className="header-hint">Milestone 0 — grid &amp; camera. Drag to pan, scroll to zoom.</div>
      </header>
      <main className="app-main">
        <aside className="side-panel">
          <p className="hint">Controls arrive in the next milestones.</p>
        </aside>
        <CanvasStage scene={scene} />
      </main>
    </div>
  );
}
