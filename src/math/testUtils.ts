import { expect } from 'vitest';
import type { Mat2, Vec2 } from './types';

export function expectMatClose(actual: Mat2, expected: Mat2, tol = 1e-9): void {
  for (const k of ['a', 'b', 'c', 'd'] as const) {
    expect(Math.abs(actual[k] - expected[k]), `entry ${k}: ${actual[k]} vs ${expected[k]}`).toBeLessThanOrEqual(tol);
  }
}

export function expectVecClose(actual: Vec2, expected: Vec2, tol = 1e-9): void {
  expect(Math.abs(actual.x - expected.x), `x: ${actual.x} vs ${expected.x}`).toBeLessThanOrEqual(tol);
  expect(Math.abs(actual.y - expected.y), `y: ${actual.y} vs ${expected.y}`).toBeLessThanOrEqual(tol);
}
