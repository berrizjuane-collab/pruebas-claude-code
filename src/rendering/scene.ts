import type { Mat2 } from '../math/types';
import type { Camera } from './camera';
import { drawBaseGrid } from './drawGrid';

/**
 * Everything the renderer needs to paint one frame. The scene is plain data:
 * the React layer assembles it from app state, and the canvas layer consumes
 * it without knowing anything about React.
 */
export interface Scene {
  /** The matrix currently displayed, i.e. M(t) mid-animation. */
  matrix: Mat2;
  show: {
    baseGrid: boolean;
    axisNumbers: boolean;
  };
}

export function drawScene(ctx: CanvasRenderingContext2D, cam: Camera, scene: Scene): void {
  ctx.clearRect(0, 0, cam.width, cam.height);
  if (scene.show.baseGrid) {
    drawBaseGrid(ctx, cam, scene.show.axisNumbers);
  }
}
