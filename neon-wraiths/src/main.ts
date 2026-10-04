/**
 * Boots the game: canvas sizing, the fixed-step loop, and the on-screen touch
 * controls used on phones and tablets.
 */

import './style.css';
import { Game } from './game/game';
import { audio } from './core/audio';
import { attachTouchControls } from './ui/touch';

const canvas = document.getElementById('screen') as HTMLCanvasElement;
const stage = document.getElementById('stage') as HTMLDivElement;
const touchLayer = document.getElementById('touch-ui') as HTMLDivElement;

const game = new Game(canvas);

function fit(): void {
  game.renderer.resize();
}
window.addEventListener('resize', fit);
window.addEventListener('orientationchange', () => window.setTimeout(fit, 120));
fit();

// Touch controls only materialise on devices that actually have touch.
const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
if (isTouch) {
  touchLayer.hidden = false;
  stage.classList.add('touch');
  attachTouchControls(touchLayer, game.input, () => audio.unlock());
  const hint = document.getElementById('rotate-hint');
  if (hint) hint.hidden = false;
}

// One gesture is enough to unlock WebAudio on every browser.
const unlock = (): void => {
  audio.unlock();
  window.removeEventListener('pointerdown', unlock);
  window.removeEventListener('keydown', unlock);
};
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);

let last = performance.now();
let acc = 0;
const STEP = 1 / 60;

function frame(now: number): void {
  const raw = (now - last) / 1000;
  game.reportFrameTime(now - last);
  last = now;
  // Clamp so a background tab never fast-forwards the simulation.
  acc += Math.min(raw, 0.25);
  let steps = 0;
  while (acc >= STEP && steps < 5) {
    game.dt = STEP;
    game.update(STEP);
    acc -= STEP;
    steps++;
  }
  game.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Keep the page from scrolling/zooming under the game on mobile.
document.addEventListener(
  'touchmove',
  (e) => {
    if (e.touches.length > 0) e.preventDefault();
  },
  { passive: false },
);
document.addEventListener('contextmenu', (e) => e.preventDefault());

// Small debug hook used by the automated smoke test; harmless in normal play.
(window as unknown as { __nw?: unknown }).__nw = game;
