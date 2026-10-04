/**
 * On-screen controls for phones/tablets: a floating analog stick on the left
 * half and a cluster of action buttons on the right. Buttons are real DOM nodes
 * so they stay crisp and accessible, and they never overlap the play area's
 * centre where the action happens.
 */

import type { Action, Input } from '../core/input';

interface ButtonSpec {
  action: Action;
  label: string;
  hint: string;
  cls: string;
}

const BUTTONS: ButtonSpec[] = [
  { action: 'attack', label: '⚔', hint: 'Atacar', cls: 'big attack' },
  { action: 'dodge', label: '»', hint: 'Esquivar', cls: 'dodge' },
  { action: 'special', label: '✦', hint: 'Especial', cls: 'special' },
  { action: 'interact', label: 'E', hint: 'Usar', cls: 'interact' },
  { action: 'heal', label: '✚', hint: 'Curar', cls: 'heal' },
  { action: 'swap', label: '⇄', hint: 'Arma', cls: 'swap' },
];

export function attachTouchControls(root: HTMLElement, input: Input, onFirst: () => void): void {
  root.innerHTML = '';

  const stickZone = document.createElement('div');
  stickZone.className = 'stick-zone';
  const stickBase = document.createElement('div');
  stickBase.className = 'stick-base';
  const stickKnob = document.createElement('div');
  stickKnob.className = 'stick-knob';
  stickBase.appendChild(stickKnob);
  stickZone.appendChild(stickBase);
  root.appendChild(stickZone);

  const pad = document.createElement('div');
  pad.className = 'button-pad';
  root.appendChild(pad);

  for (const b of BUTTONS) {
    const el = document.createElement('button');
    el.className = 'tbtn ' + b.cls;
    el.type = 'button';
    el.setAttribute('aria-label', b.hint);
    el.innerHTML = `<span class="glyph">${b.label}</span><span class="hint">${b.hint}</span>`;
    const down = (ev: PointerEvent): void => {
      ev.preventDefault();
      el.setPointerCapture?.(ev.pointerId);
      el.classList.add('down');
      input.setTouchAction(b.action, true);
      onFirst();
    };
    const up = (ev: PointerEvent): void => {
      ev.preventDefault();
      el.classList.remove('down');
      input.setTouchAction(b.action, false);
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);
    pad.appendChild(el);
  }

  const pauseBtn = document.createElement('button');
  pauseBtn.className = 'tbtn pause';
  pauseBtn.type = 'button';
  pauseBtn.setAttribute('aria-label', 'Pausa');
  pauseBtn.innerHTML = '<span class="glyph">⏸</span>';
  pauseBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    input.setTouchAction('pause', true);
    onFirst();
    window.setTimeout(() => input.setTouchAction('pause', false), 80);
  });
  root.appendChild(pauseBtn);

  // --- floating stick
  let stickId: number | null = null;
  let originX = 0;
  let originY = 0;
  const RADIUS = 52;

  const place = (x: number, y: number): void => {
    const r = root.getBoundingClientRect();
    stickBase.style.left = `${x - r.left}px`;
    stickBase.style.top = `${y - r.top}px`;
  };

  stickZone.addEventListener(
    'pointerdown',
    (e) => {
      e.preventDefault();
      stickId = e.pointerId;
      originX = e.clientX;
      originY = e.clientY;
      place(originX, originY);
      stickBase.classList.add('active');
      stickKnob.style.transform = 'translate(-50%, -50%)';
      stickZone.setPointerCapture?.(e.pointerId);
      onFirst();
    },
    { passive: false },
  );

  stickZone.addEventListener(
    'pointermove',
    (e) => {
      if (stickId !== e.pointerId) return;
      e.preventDefault();
      let dx = e.clientX - originX;
      let dy = e.clientY - originY;
      const len = Math.hypot(dx, dy);
      if (len > RADIUS) {
        dx = (dx / len) * RADIUS;
        dy = (dy / len) * RADIUS;
      }
      stickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      // Small dead zone keeps a resting thumb from drifting the character.
      const nx = dx / RADIUS;
      const ny = dy / RADIUS;
      const mag = Math.hypot(nx, ny);
      if (mag < 0.16) input.setTouchAxis(0, 0);
      else input.setTouchAxis(nx, ny);
    },
    { passive: false },
  );

  const endStick = (e: PointerEvent): void => {
    if (stickId !== e.pointerId) return;
    stickId = null;
    stickBase.classList.remove('active');
    stickKnob.style.transform = 'translate(-50%, -50%)';
    input.setTouchAxis(0, 0);
  };
  stickZone.addEventListener('pointerup', endStick);
  stickZone.addEventListener('pointercancel', endStick);
  stickZone.addEventListener('pointerleave', endStick);

  window.addEventListener('blur', () => {
    input.clearTouch();
    stickBase.classList.remove('active');
  });
}
