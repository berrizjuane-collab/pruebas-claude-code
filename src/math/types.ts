/** A 2D vector (also used as a point in the plane). */
export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

/**
 * A 2×2 matrix
 *
 *      | a  b |
 *      | c  d |
 *
 * stored by named entries. The convention used across the whole app:
 *
 *   - column 1 = (a, c) = where î = (1, 0) lands,
 *   - column 2 = (b, d) = where ĵ = (0, 1) lands.
 *
 * This "columns are the images of the basis vectors" reading is the central
 * pedagogical idea of the visualizer, so the matrix type is deliberately
 * explicit about it.
 */
export interface Mat2 {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
}
