/**
 * Single source of truth for the color palette.
 * Canvas code imports COLORS directly; the UI stylesheet receives the same
 * values as CSS custom properties (injected in main.tsx), so canvas and DOM
 * can never drift apart.
 *
 * Palette is inspired by 3Blue1Brown's manim defaults: near-black blue
 * background, blue grid, green î, red ĵ, yellow for "measured" quantities.
 */
export const COLORS = {
  bg: '#10131a',
  bgPanel: '#151a24',
  bgPanelRaised: '#1b2230',
  border: '#2a3344',
  text: '#e6e9f0',
  textDim: '#8b94a7',

  accent: '#58c4dd', // 3b1b blue — interactive accents, transformed grid

  gridBase: 'rgba(120, 140, 175, 0.16)',
  gridBaseMinor: 'rgba(120, 140, 175, 0.07)',
  axis: 'rgba(235, 240, 250, 0.75)',
  axisLabel: 'rgba(200, 208, 222, 0.65)',

  gridTransformed: 'rgba(88, 196, 221, 0.55)',
  gridTransformedMinor: 'rgba(88, 196, 221, 0.22)',

  iHat: '#83c167', // green  — first basis vector
  jHat: '#fc6255', // red    — second basis vector

  detPositive: 'rgba(244, 211, 69, 0.22)',
  detPositiveEdge: '#f4d345',
  detNegative: 'rgba(255, 135, 85, 0.25)',
  detNegativeEdge: '#ff8755',

  eigen: '#ffd35a',
  kernel: '#ff6fb5',
  image: '#b48cff',

  customVector: '#c792ea',
  vectorField: 'rgba(255, 166, 87, 0.75)',
  pointField: 'rgba(88, 196, 221, 0.85)',
  figure: '#f5f3ce',

  danger: '#ff6b6b',
} as const;

export type ColorToken = keyof typeof COLORS;

/** Mirror the palette into CSS custom properties (--c-bg, --c-i-hat, …). */
export function injectCssVariables(root: HTMLElement): void {
  for (const [key, value] of Object.entries(COLORS)) {
    const cssName = '--c-' + key.replace(/([A-Z])/g, '-$1').toLowerCase();
    root.style.setProperty(cssName, value);
  }
}
