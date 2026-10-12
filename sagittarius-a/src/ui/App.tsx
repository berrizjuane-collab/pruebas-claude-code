import { useEffect, useRef } from 'react';
import { Engine } from '../app/Engine';
import { bindInput } from '../app/input';
import { store } from '../app/store';

export function App() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const engine = new Engine(ref.current!);
    (window as unknown as { __engine: Engine }).__engine = engine;
    (window as unknown as { __store: typeof store }).__store = store;
    const unbind = bindInput(ref.current!, engine.nav, {
      togglePause: () => store.set((s) => ({ running: !s.running })),
      resetCamera: () => engine.nav.reset(),
      toggleFollow: () => {},
      toggleUi: () => store.set((s) => ({ uiHidden: !s.uiHidden })),
      throwObject: () => {},
      cycleObject: () => {},
      focus: () => engine.nav.focusBlackHole(),
      togglePanel: () => {},
      setView: () => {},
      escape: () => {},
      interacted: () => {
        engine.nav.autoOrbit = 0;
      },
    });
    engine.start();
    return () => {
      unbind();
      engine.stop();
    };
  }, []);
  return <canvas ref={ref} className="stage" />;
}
