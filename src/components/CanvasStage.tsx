import { useEffect, useRef } from 'react';
import type { Scene } from '../rendering/scene';
import { drawScene } from '../rendering/scene';
import type { Camera } from '../rendering/camera';
import { createCamera, panBy, zoomAt } from '../rendering/camera';

export interface CanvasStageProps {
  scene: Scene;
}

/**
 * The drawing surface. React only mounts the canvas and forwards the latest
 * scene into a ref; actual painting happens in a requestAnimationFrame loop,
 * so rendering stays smooth regardless of React's render timing.
 *
 * Interactions handled here: pan (drag), zoom (wheel, anchored at cursor).
 */
export function CanvasStage({ scene }: CanvasStageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraRef = useRef<Camera>(createCamera(800, 600));
  const sceneRef = useRef<Scene>(scene);
  sceneRef.current = scene;

  // Pointer state for panning.
  const panRef = useRef<{ pointerId: number; lastX: number; lastY: number } | null>(null);

  useEffect(() => {
    const container = containerRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = container.clientWidth;
      const h = container.clientHeight;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      cameraRef.current.width = w;
      cameraRef.current.height = h;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    let raf = 0;
    const frame = () => {
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawScene(ctx, cameraRef.current, sceneRef.current);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    // React's synthetic wheel listeners are passive, so preventDefault (needed
    // to stop the page from scrolling while zooming) requires a manual listener.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const at = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      zoomAt(cameraRef.current, at, Math.pow(2, -e.deltaY / 480));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('wheel', onWheel);
    };
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    canvas.setPointerCapture(e.pointerId);
    panRef.current = { pointerId: e.pointerId, lastX: e.clientX, lastY: e.clientY };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pan = panRef.current;
    if (pan && pan.pointerId === e.pointerId) {
      panBy(cameraRef.current, e.clientX - pan.lastX, e.clientY - pan.lastY);
      pan.lastX = e.clientX;
      pan.lastY = e.clientY;
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (panRef.current?.pointerId === e.pointerId) panRef.current = null;
  };

  const resetView = () => {
    const cam = cameraRef.current;
    cam.center = { x: 0, y: 0 };
    cam.pixelsPerUnit = 85;
  };

  return (
    <div className="stage" ref={containerRef}>
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      <div className="stage-overlay">
        <button className="btn small" onClick={resetView} title="Recenter the view at the origin">
          Reset view
        </button>
      </div>
    </div>
  );
}
