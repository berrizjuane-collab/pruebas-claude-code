/**
 * Entrada: ratón, rueda, teclado y gestos táctiles → controlador de cámara y acciones.
 *
 * Escritorio: arrastrar = orientar/orbitar, botón derecho o Mayús+arrastrar = desplazar,
 * rueda = acercar/alejar (Alt + rueda = zoom óptico), WASD (+Q/E) = mover, Mayús = acelerar,
 * Espacio = pausa, R = restablecer cámara, F = seguir objeto, H = ocultar interfaz.
 * Táctil: un dedo = orbitar, dos dedos = pellizcar (zoom) y desplazar.
 */
import type { CameraController } from '../camera/CameraController';

export interface InputActions {
  togglePause: () => void;
  resetCamera: () => void;
  toggleFollow: () => void;
  toggleUi: () => void;
  throwObject: () => void;
  cycleObject: (d: number) => void;
  focus: () => void;
  togglePanel: (id: string) => void;
  setView: (v: 'exterior' | 'object' | 'diagram') => void;
  escape: () => void;
  interacted: () => void;
}

export function bindInput(el: HTMLElement, nav: CameraController, act: InputActions): () => void {
  let dragging = false;
  let panning = false;
  let lx = 0;
  let ly = 0;
  const touches = new Map<number, { x: number; y: number }>();
  let pinchDist = 0;
  let pinchMid = { x: 0, y: 0 };

  const onDown = (e: PointerEvent) => {
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) {
        const [a, b] = [...touches.values()];
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
        pinchMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      }
    }
    dragging = true;
    panning = e.button === 2 || e.shiftKey;
    lx = e.clientX;
    ly = e.clientY;
    el.setPointerCapture(e.pointerId);
    act.interacted();
  };
  const onMove = (e: PointerEvent) => {
    if (e.pointerType === 'touch' && touches.has(e.pointerId)) {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) {
        const [a, b] = [...touches.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        if (pinchDist > 0) nav.zoom((pinchDist - d) * 3);
        nav.pan(mid.x - pinchMid.x, mid.y - pinchMid.y);
        pinchDist = d;
        pinchMid = mid;
        return;
      }
    }
    if (!dragging) return;
    const dx = e.clientX - lx;
    const dy = e.clientY - ly;
    lx = e.clientX;
    ly = e.clientY;
    if (panning) nav.pan(dx, dy);
    else nav.rotate(dx, dy);
  };
  const onUp = (e: PointerEvent) => {
    touches.delete(e.pointerId);
    if (touches.size < 2) pinchDist = 0;
    dragging = false;
    panning = false;
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    act.interacted();
    const d = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
    if (e.altKey) nav.zoomFov(d);
    else nav.zoom(d);
  };
  const onContext = (e: Event) => e.preventDefault();

  const keys = new Set<string>();
  const updateMove = () => {
    nav.keyMove = [
      (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0),
      (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0),
      (keys.has('KeyE') ? 1 : 0) - (keys.has('KeyQ') ? 1 : 0),
    ];
    nav.boost = keys.has('ShiftLeft') || keys.has('ShiftRight');
  };
  const isTyping = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (isTyping(e) || e.metaKey || e.ctrlKey) return;
    act.interacted();
    switch (e.code) {
      case 'Space':
        e.preventDefault();
        act.togglePause();
        return;
      case 'KeyR':
        act.resetCamera();
        return;
      case 'KeyF':
        act.toggleFollow();
        return;
      case 'KeyH':
        act.toggleUi();
        return;
      case 'KeyT':
      case 'Enter':
        if (e.code === 'Enter' && (e.target as HTMLElement)?.tagName === 'BUTTON') return;
        act.throwObject();
        return;
      case 'BracketLeft':
        act.cycleObject(-1);
        return;
      case 'BracketRight':
        act.cycleObject(1);
        return;
      case 'KeyC':
        act.focus();
        return;
      case 'Digit1':
        act.setView('exterior');
        return;
      case 'Digit2':
        act.setView('object');
        return;
      case 'Digit3':
        act.setView('diagram');
        return;
      case 'KeyI':
        act.togglePanel('investigacion');
        return;
      case 'Escape':
        act.escape();
        return;
    }
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight'].includes(e.code)) {
      keys.add(e.code);
      updateMove();
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    keys.delete(e.code);
    updateMove();
  };
  const onBlur = () => {
    keys.clear();
    updateMove();
  };
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  el.addEventListener('wheel', onWheel, { passive: false });
  el.addEventListener('contextmenu', onContext);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  return () => {
    el.removeEventListener('pointerdown', onDown);
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointercancel', onUp);
    el.removeEventListener('wheel', onWheel);
    el.removeEventListener('contextmenu', onContext);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
  };
}
