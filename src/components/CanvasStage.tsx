import { useEffect, useRef } from 'react';
import { columnI, columnJ } from '../math/mat2';
import type { Vec2 } from '../math/types';
import type { Camera } from '../rendering/camera';
import { createCamera, panBy, screenToWorld, worldToScreen, zoomAt } from '../rendering/camera';
import { HANDLE_RADIUS_PX } from '../rendering/drawShapes';
import type { Scene, UiState } from '../rendering/scene';
import { drawScene } from '../rendering/scene';

export interface CanvasStageProps {
  scene: Scene;
  /** Active pointer tool: drag basis tips / place custom vectors. */
  tool: 'transform' | 'addVector';
  onDragBasis: (which: 'i' | 'j', to: Vec2) => void;
  onAddVector?: (v: Vec2) => void;
}

type PointerMode =
  | { kind: 'pan'; lastX: number; lastY: number }
  | { kind: 'basis'; which: 'i' | 'j' }
  | { kind: 'maybeClick'; startX: number; startY: number; lastX: number; lastY: number };

/**
 * The drawing surface. React only mounts the canvas and forwards the latest
 * scene into a ref; actual painting happens in a requestAnimationFrame loop,
 * so rendering stays smooth regardless of React's render timing.
 *
 * Pointer interactions: drag a basis-vector tip to edit the matrix, drag the
 * background to pan, scroll to zoom (anchored at the cursor), click to place
 * a custom vector when that tool is active. Hold Shift while dragging a tip
 * to snap to the 0.5 grid.
 */
export function CanvasStage({ scene, tool, onDragBasis, onAddVector }: CanvasStageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraRef = useRef<Camera>(createCamera(800, 600));
  const sceneRef = useRef<Scene>(scene);
  sceneRef.current = scene;
  const propsRef = useRef({ tool, onDragBasis, onAddVector });
  propsRef.current = { tool, onDragBasis, onAddVector };

  const uiRef = useRef<UiState>({ hover: null, dragging: null });
  const modeRef = useRef<PointerMode | null>(null);

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
      drawScene(ctx, cameraRef.current, sceneRef.current, uiRef.current);
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

  const localPoint = (e: React.PointerEvent): Vec2 => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  /** Which basis tip (if any) is under the given screen point. */
  const hitTest = (p: Vec2): 'i' | 'j' | null => {
    const s = sceneRef.current;
    if (!s.interactive || !s.show.basisVectors) return null;
    const cam = cameraRef.current;
    const tipI = worldToScreen(cam, columnI(s.matrix));
    const tipJ = worldToScreen(cam, columnJ(s.matrix));
    const dI = Math.hypot(p.x - tipI.x, p.y - tipI.y);
    const dJ = Math.hypot(p.x - tipJ.x, p.y - tipJ.y);
    if (dI <= HANDLE_RADIUS_PX && dI <= dJ) return 'i';
    if (dJ <= HANDLE_RADIUS_PX) return 'j';
    return null;
  };

  const dragTo = (which: 'i' | 'j', p: Vec2, snap: boolean) => {
    let w = screenToWorld(cameraRef.current, p);
    if (snap) w = { x: Math.round(w.x * 2) / 2, y: Math.round(w.y * 2) / 2 };
    propsRef.current.onDragBasis(which, w);
  };

  const updateCursor = () => {
    const canvas = canvasRef.current!;
    const ui = uiRef.current;
    if (ui.dragging) canvas.style.cursor = 'grabbing';
    else if (ui.hover) canvas.style.cursor = 'grab';
    else if (propsRef.current.tool === 'addVector') canvas.style.cursor = 'crosshair';
    else canvas.style.cursor = 'default';
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    canvas.setPointerCapture(e.pointerId);
    const p = localPoint(e);
    const hit = hitTest(p);
    if (hit) {
      modeRef.current = { kind: 'basis', which: hit };
      uiRef.current.dragging = hit;
      dragTo(hit, p, e.shiftKey);
    } else if (propsRef.current.tool === 'addVector' && propsRef.current.onAddVector) {
      modeRef.current = { kind: 'maybeClick', startX: p.x, startY: p.y, lastX: p.x, lastY: p.y };
    } else {
      modeRef.current = { kind: 'pan', lastX: p.x, lastY: p.y };
    }
    updateCursor();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = localPoint(e);
    const mode = modeRef.current;
    if (!mode) {
      uiRef.current.hover = hitTest(p);
      updateCursor();
      return;
    }
    if (mode.kind === 'basis') {
      dragTo(mode.which, p, e.shiftKey);
    } else if (mode.kind === 'pan') {
      panBy(cameraRef.current, p.x - mode.lastX, p.y - mode.lastY);
      mode.lastX = p.x;
      mode.lastY = p.y;
    } else {
      // A click candidate turns into a pan once it travels a few pixels.
      if (Math.hypot(p.x - mode.startX, p.y - mode.startY) > 4) {
        panBy(cameraRef.current, p.x - mode.lastX, p.y - mode.lastY);
        modeRef.current = { kind: 'pan', lastX: p.x, lastY: p.y };
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const mode = modeRef.current;
    if (mode?.kind === 'maybeClick' && propsRef.current.onAddVector) {
      propsRef.current.onAddVector(screenToWorld(cameraRef.current, localPoint(e)));
    }
    modeRef.current = null;
    uiRef.current.dragging = null;
    uiRef.current.hover = hitTest(localPoint(e));
    updateCursor();
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
