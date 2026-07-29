/**
 * The entire interface: a title, a paragraph, and three controls.
 *
 * Everything else the earlier build showed — parameter sliders, equations,
 * light curves, layer toggles, presets, readouts — is gone. What is left is
 * arranged to stay out of the frame: the text sits in the lower left, the
 * controls in the lower centre, and the whole overlay fades away after a few
 * seconds of stillness and returns the moment the viewer moves the pointer.
 *
 * No framework. A handful of element helpers is cheaper and clearer than a
 * dependency for four rows of DOM.
 */

import type { Store } from '../state/Store.ts';
import { ANGLE_LABELS, type CameraMode, type ViewAngle } from '../camera/CameraRig.ts';

/** Seconds of no pointer/key activity before the overlay fades out. */
const IDLE_HIDE_AFTER = 6;

const SPEEDS: Array<{ value: number; label: string }> = [
  { value: 0.25, label: '0.25×' },
  { value: 1, label: '1×' },
  { value: 3, label: '3×' },
];

const ANGLE_ORDER: ViewAngle[] = ['threeQuarter', 'equatorial', 'polar', 'wide'];

const PARAGRAPH =
  'The collapsed core of a star that died. Roughly one and a half times the mass ' +
  'of the Sun, crushed into a sphere twelve kilometres across — a spoonful would ' +
  'weigh as much as a mountain range. It turns on its axis dragging a magnetic ' +
  'field a trillion times the Earth’s, and from its magnetic poles it fires two ' +
  'beams of radiation that sweep the sky like a lighthouse.';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** A control-bar group: a small caps label and a row of options. */
function group(label: string): { root: HTMLElement; options: HTMLElement } {
  const options = el('div', 'opt-row');
  const root = el('div', 'ctl-group');
  root.append(el('span', 'ctl-label', label), options);
  return { root, options };
}

export interface OverlayHandlers {
  onCameraMode: (mode: CameraMode) => void;
  onAngle: (angle: ViewAngle) => void;
  onSpeed: (speed: number) => void;
}

export class Overlay {
  readonly root: HTMLElement;
  private titleBlock: HTMLElement;
  private bar: HTMLElement;
  private hint: HTMLElement;
  private modeButtons = new Map<CameraMode, HTMLButtonElement>();
  private angleButtons = new Map<ViewAngle, HTMLButtonElement>();
  private speedButtons = new Map<number, HTMLButtonElement>();
  private idle = 0;
  private hidden = false;

  constructor(
    private store: Store,
    handlers: OverlayHandlers,
  ) {
    // ── title & paragraph ───────────────────────────────────────────────────
    this.titleBlock = el('div', 'title-block');
    this.titleBlock.append(
      el('div', 'eyebrow', 'Observatory'),
      el('h1', 'title', 'Neutron Star'),
      el('div', 'subtitle', 'A rotating pulsar'),
      el('p', 'blurb', PARAGRAPH),
    );

    // ── controls ────────────────────────────────────────────────────────────
    const camera = group('Camera');
    for (const mode of ['free', 'fixed'] as CameraMode[]) {
      const b = el('button', 'opt', mode === 'free' ? 'Free' : 'Fixed');
      b.type = 'button';
      b.addEventListener('click', () => handlers.onCameraMode(mode));
      this.modeButtons.set(mode, b);
      camera.options.append(b);
    }

    const angle = group('Angle');
    for (const a of ANGLE_ORDER) {
      const b = el('button', 'opt', ANGLE_LABELS[a]);
      b.type = 'button';
      b.addEventListener('click', () => handlers.onAngle(a));
      this.angleButtons.set(a, b);
      angle.options.append(b);
    }

    const speed = group('Rotation');
    for (const s of SPEEDS) {
      const b = el('button', 'opt', s.label);
      b.type = 'button';
      b.addEventListener('click', () => handlers.onSpeed(s.value));
      this.speedButtons.set(s.value, b);
      speed.options.append(b);
    }

    this.bar = el('div', 'control-bar');
    this.bar.append(camera.root, divider(), angle.root, divider(), speed.root);

    this.hint = el('div', 'hint', 'Drag to orbit · scroll to zoom');

    this.root = el('div', 'overlay');
    this.root.append(this.titleBlock, this.bar, this.hint);

    // Any interaction wakes the overlay; interacting with the bar itself keeps it
    // awake so the controls cannot fade out from under the pointer.
    for (const ev of ['pointermove', 'pointerdown', 'keydown', 'wheel'] as const) {
      window.addEventListener(ev, this.wake, { passive: true });
    }

    this.store.subscribe(() => this.sync());
    this.sync();
  }

  private wake = (): void => {
    this.idle = 0;
    if (this.hidden) {
      this.hidden = false;
      this.root.classList.remove('faded');
    }
  };

  /** Reflect the current state onto the buttons. */
  private sync(): void {
    const s = this.store.get();
    for (const [mode, b] of this.modeButtons) b.classList.toggle('active', s.cameraMode === mode);
    for (const [a, b] of this.angleButtons) b.classList.toggle('active', s.viewAngle === a);
    for (const [v, b] of this.speedButtons) b.classList.toggle('active', s.speed === v);
    this.hint.textContent =
      s.cameraMode === 'free' ? 'Drag to orbit · scroll to zoom' : 'Camera locked';
  }

  /** Fade the title block in once the intro has finished. */
  revealTitle(): void {
    this.titleBlock.classList.add('shown');
    this.bar.classList.add('shown');
    this.hint.classList.add('shown');
  }

  tick(dt: number): void {
    this.idle += dt;
    if (!this.hidden && this.idle > IDLE_HIDE_AFTER) {
      this.hidden = true;
      this.root.classList.add('faded');
    }
  }
}

function divider(): HTMLElement {
  return el('span', 'ctl-divider');
}
