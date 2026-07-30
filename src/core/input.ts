/**
 * Unified input: keyboard, gamepad and on-screen touch controls all feed the
 * same `Input` snapshot, so gameplay code never asks *how* a button was pressed.
 */

import { clamp, normalize } from './util';

export type Action =
  | 'attack'
  | 'dodge'
  | 'special'
  | 'interact'
  | 'swap'
  | 'heal'
  | 'pause'
  | 'confirm'
  | 'cancel'
  | 'up'
  | 'down'
  | 'left'
  | 'right';

const KEYMAP: Record<string, Action[]> = {
  KeyW: ['up'],
  ArrowUp: ['up'],
  KeyS: ['down'],
  ArrowDown: ['down'],
  KeyA: ['left'],
  ArrowLeft: ['left'],
  KeyD: ['right'],
  ArrowRight: ['right'],
  Space: ['attack', 'confirm'],
  KeyJ: ['attack'],
  ShiftLeft: ['dodge'],
  ShiftRight: ['dodge'],
  KeyK: ['dodge'],
  KeyL: ['special'],
  KeyF: ['special'],
  KeyE: ['interact', 'confirm'],
  Enter: ['interact', 'confirm'],
  KeyQ: ['swap'],
  Tab: ['swap'],
  KeyH: ['heal'],
  KeyR: ['heal'],
  Escape: ['pause', 'cancel'],
  KeyP: ['pause'],
};

/** Standard-mapping gamepad buttons -> actions. */
const PADMAP: Record<number, Action[]> = {
  0: ['attack', 'confirm'], // A / cross
  1: ['dodge', 'cancel'], // B / circle
  2: ['special'], // X / square
  3: ['interact', 'confirm'], // Y / triangle
  4: ['heal'], // LB
  5: ['swap'], // RB
  6: ['heal'], // LT
  7: ['dodge'], // RT
  9: ['pause'], // start
  12: ['up'],
  13: ['down'],
  14: ['left'],
  15: ['right'],
};

export class Input {
  /** Held state this frame. */
  private held = new Set<Action>();
  /** Held state last frame (for edge detection). */
  private prev = new Set<Action>();
  private keyHeld = new Set<Action>();
  private touchHeld = new Set<Action>();
  private padHeld = new Set<Action>();

  /** Analog stick, already deadzoned. Touch stick writes here too. */
  private padAxis = { x: 0, y: 0 };
  private touchAxis = { x: 0, y: 0 };
  /**
   * Menus need discrete up/down from an analog stick. These sets mirror the
   * stick as digital *edges only* — they never leak into `down()` or
   * `moveVector()`, so analog movement stays analog during gameplay.
   */
  private analogNow = new Set<Action>();
  private analogPrev = new Set<Action>();
  /**
   * Presses that arrived since the last frame. A very fast tap can go down and
   * up between two updates; without this buffer that input would be lost, which
   * feels like the game ignoring you.
   */
  private buffered = new Set<Action>();
  private pressedThisFrame = new Set<Action>();

  /** True once any input has been seen — used to unlock audio and hide hints. */
  anyPressed = false;
  lastDevice: 'keyboard' | 'gamepad' | 'touch' = 'keyboard';
  gamepadConnected = false;

  private listeners: Array<() => void> = [];

  attach(target: HTMLElement): void {
    const onKeyDown = (e: KeyboardEvent) => {
      const acts = KEYMAP[e.code];
      if (!acts) return;
      // Stop the browser stealing Tab/Space/arrows while playing.
      e.preventDefault();
      if (e.repeat) return;
      this.lastDevice = 'keyboard';
      this.anyPressed = true;
      for (const a of acts) {
        this.keyHeld.add(a);
        this.buffered.add(a);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const acts = KEYMAP[e.code];
      if (!acts) return;
      e.preventDefault();
      for (const a of acts) this.keyHeld.delete(a);
    };
    const onBlur = () => {
      this.keyHeld.clear();
      this.padHeld.clear();
      this.buffered.clear();
    };
    window.addEventListener('keydown', onKeyDown, { passive: false });
    window.addEventListener('keyup', onKeyUp, { passive: false });
    window.addEventListener('blur', onBlur);
    window.addEventListener('gamepadconnected', () => {
      this.gamepadConnected = true;
    });
    window.addEventListener('gamepaddisconnected', () => {
      this.gamepadConnected = false;
    });
    this.listeners.push(() => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    });
    void target;
  }

  detach(): void {
    for (const off of this.listeners) off();
    this.listeners.length = 0;
  }

  /** Called by the touch UI layer. */
  setTouchAction(action: Action, down: boolean): void {
    this.lastDevice = 'touch';
    this.anyPressed = true;
    if (down) {
      this.touchHeld.add(action);
      this.buffered.add(action);
    } else {
      this.touchHeld.delete(action);
    }
  }

  setTouchAxis(x: number, y: number): void {
    this.touchAxis.x = clamp(x, -1, 1);
    this.touchAxis.y = clamp(y, -1, 1);
    if (Math.abs(x) + Math.abs(y) > 0.1) {
      this.lastDevice = 'touch';
      this.anyPressed = true;
    }
  }

  clearTouch(): void {
    this.touchHeld.clear();
    this.touchAxis.x = 0;
    this.touchAxis.y = 0;
  }

  private pollGamepad(): void {
    if (!navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    this.padHeld.clear();
    this.padAxis.x = 0;
    this.padAxis.y = 0;
    let seen = false;
    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      seen = true;
      for (let i = 0; i < pad.buttons.length; i++) {
        if (!pad.buttons[i]?.pressed) continue;
        const acts = PADMAP[i];
        if (!acts) continue;
        for (const a of acts) {
          this.padHeld.add(a);
          if (!this.held.has(a)) this.buffered.add(a);
        }
        this.lastDevice = 'gamepad';
        this.anyPressed = true;
      }
      const ax = pad.axes[0] ?? 0;
      const ay = pad.axes[1] ?? 0;
      const mag = Math.hypot(ax, ay);
      if (mag > 0.22) {
        // Rescale past the deadzone so slow walking is still possible.
        const s = (mag - 0.22) / 0.78 / mag;
        this.padAxis.x = ax * s;
        this.padAxis.y = ay * s;
        this.lastDevice = 'gamepad';
        this.anyPressed = true;
      }
      break;
    }
    this.gamepadConnected = seen;
  }

  /** Call once per frame *before* systems read input. */
  update(): void {
    this.pollGamepad();
    this.prev = this.held;
    const next = new Set<Action>();
    for (const a of this.keyHeld) next.add(a);
    for (const a of this.touchHeld) next.add(a);
    for (const a of this.padHeld) next.add(a);
    this.held = next;

    this.pressedThisFrame = this.buffered;
    this.buffered = new Set();

    this.analogPrev = this.analogNow;
    const an = new Set<Action>();
    const ax = this.padAxis.x + this.touchAxis.x;
    const ay = this.padAxis.y + this.touchAxis.y;
    if (ay < -0.55) an.add('up');
    if (ay > 0.55) an.add('down');
    if (ax < -0.55) an.add('left');
    if (ax > 0.55) an.add('right');
    this.analogNow = an;
  }

  down(a: Action): boolean {
    return this.held.has(a);
  }

  /** True only on the frame the action went from up to down. */
  pressed(a: Action): boolean {
    if (this.pressedThisFrame.has(a)) return true;
    if (this.held.has(a) && !this.prev.has(a)) return true;
    return this.analogNow.has(a) && !this.analogPrev.has(a);
  }

  released(a: Action): boolean {
    return !this.held.has(a) && this.prev.has(a);
  }

  anyPressedNow(): boolean {
    for (const a of this.held) if (!this.prev.has(a)) return true;
    return false;
  }

  /** Movement vector, magnitude <= 1. Digital input is normalized (no diagonal speed boost). */
  moveVector(): { x: number; y: number; len: number } {
    let x = 0;
    let y = 0;
    if (this.down('left')) x -= 1;
    if (this.down('right')) x += 1;
    if (this.down('up')) y -= 1;
    if (this.down('down')) y += 1;
    if (x !== 0 || y !== 0) return normalize(x, y);

    const ax = this.padAxis.x + this.touchAxis.x;
    const ay = this.padAxis.y + this.touchAxis.y;
    const len = Math.hypot(ax, ay);
    if (len < 0.06) return { x: 0, y: 0, len: 0 };
    if (len > 1) return { x: ax / len, y: ay / len, len: 1 };
    return { x: ax / len, y: ay / len, len };
  }
}
