import { useEffect, type Dispatch } from 'react';
import type { Action } from './store';

/**
 * Drives the animation clock: while `playing`, dispatch a tick every frame
 * with the elapsed wall time. The reducer owns all animation math; this hook
 * is the only place that touches requestAnimationFrame for state purposes.
 */
export function useAnimationTicker(playing: boolean, dispatch: Dispatch<Action>): void {
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      // Clamp the delta so returning from a background tab does not jump the
      // animation to the end in one giant step.
      const dtSeconds = Math.min((now - last) / 1000, 0.1);
      last = now;
      dispatch({ type: 'tick', dtSeconds });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, dispatch]);
}
