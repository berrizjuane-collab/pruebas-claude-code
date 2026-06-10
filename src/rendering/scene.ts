import type { Mat2 } from '../math/types';
import type { Camera } from './camera';
import { drawDeterminant } from './drawDeterminant';
import type { EigenDisplay } from './drawEigen';
import { drawEigenStructure } from './drawEigen';
import { drawBaseGrid, drawTransformedGrid } from './drawGrid';
import { drawBasisVectors } from './drawShapes';

/** Which layers are visible. Lives here because it is part of the scene spec. */
export interface ShowFlags {
  baseGrid: boolean;
  axisNumbers: boolean;
  transformedGrid: boolean;
  basisVectors: boolean;
  determinant: boolean;
  eigenvectors: boolean;
  labels: boolean;
}

/** Transient pointer state owned by the canvas (hover/drag), not by React. */
export interface UiState {
  hover: 'i' | 'j' | null;
  dragging: 'i' | 'j' | null;
}

/**
 * Everything the renderer needs to paint one frame. The scene is plain data:
 * the React layer assembles it from app state, and the canvas layer consumes
 * it without knowing anything about React.
 */
export interface Scene {
  /** The matrix currently displayed, i.e. M(t) mid-animation. */
  matrix: Mat2;
  show: ShowFlags;
  /** Whether basis-vector tips are draggable (drawn with handle rings). */
  interactive: boolean;
  /** Eigenstructure + rank of the target matrix (null hides the layer). */
  eigen: EigenDisplay | null;
}

export function drawScene(ctx: CanvasRenderingContext2D, cam: Camera, scene: Scene, ui: UiState): void {
  ctx.clearRect(0, 0, cam.width, cam.height);

  if (scene.show.baseGrid) {
    drawBaseGrid(ctx, cam, scene.show.axisNumbers);
  }
  if (scene.show.transformedGrid) {
    drawTransformedGrid(ctx, cam, scene.matrix, { minor: false });
  }
  if (scene.show.determinant) {
    drawDeterminant(ctx, cam, scene.matrix, scene.show.labels);
  }
  if (scene.show.eigenvectors && scene.eigen) {
    drawEigenStructure(ctx, cam, scene.matrix, scene.eigen, scene.show.labels);
  }
  if (scene.show.basisVectors) {
    drawBasisVectors(ctx, cam, scene.matrix, {
      labels: scene.show.labels,
      handles: scene.interactive,
      hover: ui.hover,
      dragging: ui.dragging,
    });
  }
}
